import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { runFreshJsonCommand } from "../src/outsider-json-command.js";
import { snapshotWorkspace } from "../src/outsider-kernel-store.js";
import {
  externalSupervisorEnvironment, projectExternalSupervisorValue,
  redactExternalSupervisorText,
} from "../src/outsider-supervisor-projection.js";
import {
  currentSourceEvidence, supervisorPacket, supervisorStdin,
} from "../src/outsider-supervisor-session.js";

const temp = () => mkdtempSync(path.join(tmpdir(), "outsider-supervisor-privacy-"));
const PRIVATE_PEM = "-----BEGIN PRIVATE KEY-----\nTOP-SECRET-PEM-BODY\n-----END PRIVATE KEY-----";
const PRIVATE_PGP = "-----BEGIN PGP PRIVATE KEY BLOCK-----\nPGP-PRIVATE-PLAINTEXT\n-----END PGP PRIVATE KEY BLOCK-----";

test("workspace snapshots retain sensitive-file identity but never capture its plaintext", () => {
  const cwd = temp();
  try {
    mkdirSync(path.join(cwd, "keys"));
    mkdirSync(path.join(cwd, ".docker"));
    mkdirSync(path.join(cwd, ".kube"));
    writeFileSync(path.join(cwd, ".env"), "DATABASE_PASSWORD=dotenv-plaintext\n");
    writeFileSync(path.join(cwd, "keys", "private.pem"), PRIVATE_PEM);
    writeFileSync(path.join(cwd, ".docker", "config.json"),
      '{"auths":{"registry.example":{"auth":"dXNlcjp2ZXJ5LXNlY3JldA=="}}}');
    writeFileSync(path.join(cwd, ".kube", "config"), "token: kube-plaintext\n");
    writeFileSync(path.join(cwd, ".git-credentials"), "https://user:pass@example.test\n");
    writeFileSync(path.join(cwd, "auth.json"), '{"auth":"auth-file-plaintext"}');
    writeFileSync(path.join(cwd, "application_default_credentials.json"),
      '{"private_key":"gcp-plaintext"}');
    writeFileSync(path.join(cwd, "source.js"), "export const value = 1;\n");
    const snapshot = snapshotWorkspace(cwd);
    for (const name of [".env", "keys/private.pem", ".docker/config.json", ".kube/config",
      ".git-credentials", "auth.json", "application_default_credentials.json"]) {
      assert.match(snapshot.files[name].sha, /^sha256:/);
      assert.equal(snapshot.files[name].text, undefined);
      assert.equal(snapshot.files[name].textStatus, "not-captured");
      assert.equal(snapshot.files[name].captureReason, "sensitive-path-denylist");
    }
    assert.match(snapshot.files["source.js"].text, /value = 1/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("one external projection redacts source, proposed tool, acceptance and unknown fields", () => {
  const sourceSecret = "sk-super-secret-value-1234567890";
  const bearer = "Bearer eyJhbGciOiJIUzI1NiJ9.payload.signature";
  const querySecret = "url-query-plaintext";
  const snapshot = { fingerprint: "sha256:snapshot", files: {
    ".env": { sha: "sha256:env", text: "API_KEY=dotenv-secret", size: 23 },
    "credentials.json": { sha: "sha256:credentials",
      text: JSON.stringify({ token: "credential-plaintext" }), size: 40 },
    "keys/private.pem": { sha: "sha256:pem", text: PRIVATE_PEM, size: PRIVATE_PEM.length },
    ".docker/config.json": { sha: "sha256:docker", size: 80,
      text: '{"auths":{"registry.example":{"auth":"dXNlcjp2ZXJ5LXNlY3JldA=="}}}' },
    "src/client.js": { sha: "sha256:source", size: 200,
      text: `export const apiKey = "${sourceSecret}";\n`
        + `fetch("https://api.example.test/run?token=${querySecret}&mode=full");` },
    "test/client.test.js": { sha: "sha256:test", size: 50,
      text: "assert.equal(client.ready, true);" },
  } };
  const contract = { ask: `inspect safely; ${bearer}`, acceptance: "npm test",
    semantic: { successCriteria: ["src/client.js stays correct"],
      scope: { in: ["src/client.js", ".env"], out: [] } } };
  assert.deepEqual(currentSourceEvidence(snapshot, contract).map((entry) => entry.path),
    ["src/client.js", "test/client.test.js"]);
  const packet = supervisorPacket({
    contract,
    steps: [{ uid: "read-secret", toolName: "Bash", isEdit: false, exit: 0,
      action: `cat .env; curl https://api.example.test/run?token=${querySecret}`,
      observation: `${bearer}\n${PRIVATE_PEM}` }],
    baselineSnapshot: snapshot,
    currentSnapshot: snapshot,
    proposedTool: { name: "Write", input: { file_path: ".env",
      content: `AUTH_TOKEN=tool-input-plaintext\n${PRIVATE_PEM}` } },
    acceptance: { command: "npm test", ran: true, passed: false, exit: 1,
      output: `Authorization: ${bearer}\nhttps://ci.example.test/log?id=${querySecret}` },
    diff: { changed: 2, changes: [
      { path: ".env", after: "PASSWORD=diff-plaintext" },
      { path: "src/client.js", after: `const token = "${sourceSecret}";` },
    ] },
  });
  /* Unknown fields and a post-projection coherent reseal must traverse the same
     recursive policy instead of escaping a hand-maintained field allow-list. */
  const once = projectExternalSupervisorValue(packet);
  once.futureUnknownEvidence = { resealed: true, path: "keys/private.pem",
    output: `Bearer future-unknown-plaintext\n${PRIVATE_PEM}\n${PRIVATE_PGP}` };
  once.futureBinaryEvidence = Buffer.from("BUFFER-PRIVATE-PLAINTEXT", "utf8");
  const input = supervisorStdin(once);

  for (const plaintext of [
    ".env", "credentials.json", "private.pem", "dotenv-secret", "credential-plaintext",
    "TOP-SECRET-PEM-BODY", sourceSecret, "tool-input-plaintext", "diff-plaintext",
    "future-unknown-plaintext", querySecret, "eyJhbGciOiJIUzI1NiJ9.payload.signature",
    "PGP-PRIVATE-PLAINTEXT", "BUFFER-PRIVATE-PLAINTEXT", "dXNlcjp2ZXJ5LXNlY3JldA==",
  ]) assert.equal(input.includes(plaintext), false, plaintext);
  assert.match(input, /\[REDACTED_(?:SECRET|TOKEN|PRIVATE_KEY|SENSITIVE_PATH|QUERY)/);
  assert.match(input, /src\/client\.js/);
  assert.match(input, /"name": "Write"/);
  assert.doesNotMatch(input, /\?token=/);
});

test("fresh supervisor transport strips ambient credential env and redacts stdin defensively", () => {
  const original = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "ambient-api-key-plaintext";
  let observed = null;
  try {
    const result = runFreshJsonCommand({
      cmd: ["fake-supervisor"],
      input: "read /workspace/.env; Authorization: Bearer transport-plaintext; "
        + "https://example.test/path?token=query-plaintext",
      validate: (value) => value?.ok === true,
      execute: (_command, _args, options) => {
        observed = options;
        return JSON.stringify({ ok: true });
      },
    });
    assert.equal(result.ok, true);
    assert.equal(observed.env.OPENAI_API_KEY, undefined);
    assert.equal(observed.env.OUTSIDER_ATTACHED_TOKEN, undefined);
    assert.equal(observed.env.CLAUDE_CODE_DISABLE_AUTO_MEMORY, "1");
    assert.equal(observed.input.includes(".env"), false);
    assert.equal(observed.input.includes("transport-plaintext"), false);
    assert.equal(observed.input.includes("query-plaintext"), false);
  } finally {
    if (original == null) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = original;
  }
});

test("nested sensitive path identities omit their whole payload for snake and camel keys", () => {
  const opaque = "dXNlcjp2ZXJ5LXNlY3JldA==";
  for (const attacked of [
    { input: { file_path: ".env", content: opaque } },
    { future: { path: ".docker/config.json", content: opaque } },
    { proposedTool: { input: { filePath: ".kube/config", bytes: opaque } } },
  ]) {
    const projected = projectExternalSupervisorValue(attacked);
    const wire = JSON.stringify(projected);
    assert.equal(wire.includes(opaque), false, wire);
    assert.equal(wire.includes(".env"), false, wire);
    assert.equal(wire.includes(".docker/config.json"), false, wire);
    assert.equal(wire.includes(".kube/config"), false, wire);
    assert.match(wire, /sensitive-path-evidence-not-exported/);
  }
});

test("sensitive descendant identity redacts sibling payload at the nearest evidence unit", () => {
  const marker = "NEUTRAL-NESTED-SIBLING-MARKER";
  const attacked = {
    first: { evidence: { metadata: { filePath: ".env" }, content: marker } },
    second: { identity: { path: ".docker/config.json" }, bytes: marker },
    third: { file: { path: "keys/private.pem" }, body: marker },
    unknownWrapper: [{ futureEnvelope: {
      descriptor: { nested: { sourcePath: ".kube/config" } }, raw: marker,
    } }],
    safeSibling: { metadata: { filePath: "src/public.js" }, content: "PUBLIC-SOURCE" },
  };
  const projected = projectExternalSupervisorValue(attacked);
  const wire = JSON.stringify(projected);
  assert.equal(wire.includes(marker), false, wire);
  assert.equal(wire.includes(".env"), false, wire);
  assert.equal(wire.includes(".docker/config.json"), false, wire);
  assert.equal(wire.includes("private.pem"), false, wire);
  assert.equal(wire.includes(".kube/config"), false, wire);
  assert.match(wire, /sensitive-path-evidence-not-exported/);
  assert.match(wire, /PUBLIC-SOURCE/,
    "one sensitive unit must not erase an unrelated safe sibling or the whole packet");
});

test("redactor is idempotent and the child environment is an allow-list", () => {
  const raw = `TOKEN=plain-token ${PRIVATE_PEM} ${PRIVATE_PGP} https://x.test/a?secret=plain /repo/.env`;
  const once = redactExternalSupervisorText(raw);
  assert.equal(redactExternalSupervisorText(once), once);
  const environment = externalSupervisorEnvironment({ PATH: "/bin", HOME: "/home/operator",
    LANG: "en_US.UTF-8", ANTHROPIC_API_KEY: "secret", AWS_SECRET_ACCESS_KEY: "secret",
    OUTSIDER_ATTACHED_TOKEN: "secret", NODE_OPTIONS: "--require evil.js" });
  assert.deepEqual(environment, { PATH: "/bin", HOME: "/home/operator",
    LANG: "en_US.UTF-8", CLAUDE_CODE_DISABLE_AUTO_MEMORY: "1" });
});
