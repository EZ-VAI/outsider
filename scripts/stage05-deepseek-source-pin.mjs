#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { canonicalizeStrict } from "../src/canonical.js";

const args = process.argv.slice(2);
const after = (flag) => {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : null;
};
const repository = path.resolve(after("--repo") ?? "");
const out = path.resolve(after("--out") ?? "references/deepseek-harness-source-pin.json");
const expectedCommit = "47f943859bef60e4160492346772ded9b24f765a";
const reviewedPaths = [
  "README.md",
  "docs/architecture.md",
  "docs/persistence-catalog.md",
  "docs/subsystems/core.md",
  "docs/cookbook/extension-cookbook.md",
  "packages/core/session/README.md",
  "packages/core/session/package.json",
  "packages/core/session/src/known-event-types.ts",
  "packages/core/session/src/types.ts",
  "packages/core/agent/package.json",
  "packages/core/agent/src/index.ts",
  "packages/core/agent/src/types.ts",
  "packages/llm/llm/package.json",
  "packages/llm/llm/src/index.ts",
  "packages/llm/llm/src/message.ts",
  "packages/llm/llm/src/types.ts",
];
const git = (...argv) => execFileSync("git", argv, {
  cwd: repository, encoding: argv[0] === "cat-file" ? null : "utf8",
  maxBuffer: 32 * 1024 * 1024,
});
const head = String(git("rev-parse", "HEAD")).trim();
if (head !== expectedCommit) throw new Error(`DEEPSEEK_SOURCE_COMMIT_MISMATCH:${head}`);
const commit = {
  oid: head,
  tree: String(git("show", "-s", "--format=%T", "HEAD")).trim(),
  parents: String(git("show", "-s", "--format=%P", "HEAD")).trim().split(/\s+/u).filter(Boolean),
  authoredAt: String(git("show", "-s", "--format=%aI", "HEAD")).trim(),
  subject: String(git("show", "-s", "--format=%s", "HEAD")).trim(),
};
const files = reviewedPaths.map((name) => {
  const oid = String(git("rev-parse", `HEAD:${name}`)).trim();
  const body = git("cat-file", "blob", oid);
  return { path: name, gitBlobOid: oid,
    sha256: `sha256:${createHash("sha256").update(body).digest("hex")}`,
    byteLength: body.length };
});
const record = {
  schema: "outsider/external-source-pin/v2",
  repository: "https://github.com/deepseek-ai/deepseek-harness",
  commit,
  sourcePackageVersion: "0.1.0-rc.5",
  reviewedAt: new Date().toISOString(),
  files,
  sessionFormatVersion: 0,
  integrationMode: "OBSERVATION_AND_AUDITED_DELIVERY_ONLY",
  sourceBinaryEquivalence: "UNPROVEN",
  claimBoundary: "This record proves the reviewed official source bytes at one commit. The separately pinned rc.6 npm runtime has no gitHead and is not claimed to be this commit's build.",
};
record.recordHash = `sha256:${createHash("sha256")
  .update(canonicalizeStrict(record)).digest("hex")}`;
writeFileSync(out, `${JSON.stringify(record, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({ ok: true, out, recordHash: record.recordHash })}\n`);
