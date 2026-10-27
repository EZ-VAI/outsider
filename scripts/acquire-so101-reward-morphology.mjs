#!/usr/bin/env node

import { randomBytes } from "node:crypto";
import {
  chmodSync, existsSync, lstatSync, mkdirSync, readdirSync, renameSync, rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalizeStrict } from "../src/canonical.js";
import {
  SO101_REWARD_AUDIT_SCHEMA, SO101_REWARD_ID, SO101_REWARD_REVISION,
  acquirePinnedSo101RewardSource, buildSo101RewardAuditFromSource,
  so101RewardSha256, verifySo101RewardAudit, verifySo101RewardAuditWithSource,
} from "../src/outsider-so101-reward-morphology.js";

const DEFAULT_OUTPUT =
  "artifacts/outsider-so101-reward-morphology-20260829-v1";

function fail(code, detail = null) {
  throw new Error(detail === null ? `SO101_REWARD_CLI_${code}`
    : `SO101_REWARD_CLI_${code}:${detail}`);
}

function parseArgs(argv) {
  const value = { output: DEFAULT_OUTPUT, python: ".venv/bin/python", help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--output") {
      if (!argv[index + 1]) fail("OUTPUT_ARGUMENT_MISSING");
      value.output = argv[++index];
    } else if (argument === "--python") {
      if (!argv[index + 1]) fail("PYTHON_ARGUMENT_MISSING");
      value.python = argv[++index];
    } else if (argument === "--help" || argument === "-h") value.help = true;
    else fail("ARGUMENT_UNKNOWN", argument);
  }
  return value;
}

function insideWorkspace(value) {
  const workspace = path.resolve(process.cwd());
  const target = path.resolve(value);
  const relative = path.relative(workspace, target);
  if (target === path.parse(target).root || relative === "" || relative === ".."
    || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    fail("OUTPUT_OUTSIDE_WORKSPACE", target);
  }
  return target;
}

function writeCanonicalOnce(file, value) {
  const bytes = Buffer.from(`${canonicalizeStrict(value)}\n`, "utf8");
  writeFileSync(file, bytes, { flag: "wx", mode: 0o600 });
  chmodSync(file, 0o600);
  return { path: path.basename(file), bytes: bytes.length,
    sha256: so101RewardSha256(bytes) };
}

function privateTree(root) {
  const stat = lstatSync(root);
  if (stat.isSymbolicLink() || !stat.isDirectory()) fail("DIRECTORY_UNSAFE", root);
  chmodSync(root, 0o700);
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const child = path.join(root, entry.name);
    if (entry.isSymbolicLink()) fail("SYMLINK_REFUSED", child);
    if (entry.isDirectory()) privateTree(child);
    else if (entry.isFile()) chmodSync(child, 0o600);
    else fail("SPECIAL_FILE_REFUSED", child);
  }
}

export async function runSo101RewardAcquisition(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help) {
    process.stdout.write([
      "Usage:",
      "  node scripts/acquire-so101-reward-morphology.mjs [--output <new-dir>] [--python <pyarrow-python>]",
      "",
      "Acquires the six-object no-video closure and replays reward, done and",
      "discrete-penalty morphology without promoting HIL naming into an",
      "intervention fact.",
    ].join("\n") + "\n");
    return null;
  }
  const target = insideWorkspace(args.output);
  if (existsSync(target)) fail("OUTPUT_EXISTS", target);
  const parent = path.dirname(target);
  if (!existsSync(parent)) mkdirSync(parent, { recursive: true, mode: 0o700 });
  if (lstatSync(parent).isSymbolicLink() || !lstatSync(parent).isDirectory()) {
    fail("OUTPUT_PARENT_UNSAFE", parent);
  }
  const temporary = path.join(parent,
    `.${path.basename(target)}.tmp-${process.pid}-${randomBytes(8).toString("hex")}`);
  mkdirSync(temporary, { mode: 0o700 });
  try {
    const acquired = await acquirePinnedSo101RewardSource(path.join(temporary, "source"));
    const artifact = buildSo101RewardAuditFromSource(acquired.sourceDirectory,
      { pythonExecutable: args.python });
    const standalone = verifySo101RewardAudit(artifact);
    if (!standalone.ok) fail("STANDALONE_VERIFICATION_FAILED", standalone.error);
    const sourceBound = verifySo101RewardAuditWithSource(artifact,
      acquired.sourceDirectory, { pythonExecutable: args.python });
    if (!sourceBound.ok || sourceBound.verificationLevel
      !== "FULL_SO101_REWARD_PARQUET_AND_META_REPLAY") {
      fail("FULL_REPLAY_FAILED", sourceBound.error);
    }
    const report = writeCanonicalOnce(path.join(temporary,
      "so101-reward-morphology.json"), artifact);
    const manifestBody = {
      schema: "outsider/so101-reward-morphology-artifact-manifest/v1",
      reportSchema: SO101_REWARD_AUDIT_SCHEMA,
      report, reportHash: artifact.artifactHash,
      repository: { id: SO101_REWARD_ID, revision: SO101_REWARD_REVISION },
      sourceManifestHash: acquired.manifest.manifestHash,
      sourceRoot: acquired.manifest.sourceRoot,
      sourceClosure: acquired.manifest.closure,
      verification: sourceBound,
      admission: artifact.admission,
      rights: artifact.rights,
      privacy: artifact.privacy,
      boundary: artifact.boundary,
    };
    const artifactManifest = { ...manifestBody,
      manifestHash: so101RewardSha256(Buffer.from(
        `outsider/so101-reward-morphology-artifact-manifest/v1\0${
          canonicalizeStrict(manifestBody)}`, "utf8")) };
    writeCanonicalOnce(path.join(temporary, "artifact-manifest.json"), artifactManifest);
    privateTree(temporary);
    renameSync(temporary, target);
    chmodSync(target, 0o700);
    const summary = { status: artifact.status, admission: artifact.admission,
      output: path.relative(process.cwd(), target), selectedObjects: 6,
      selectedBytes: 511_502, episodes: artifact.replay.episodes,
      frames: artifact.replay.frames,
      terminalDoneEpisodes: artifact.replay.terminalDoneEpisodes,
      positiveRewardEpisodes: artifact.replay.positiveRewardEpisodes,
      isInterventionFieldPresent: artifact.replay.isInterventionFieldPresent,
      artifactHash: artifact.artifactHash,
      sourceManifestHash: acquired.manifest.manifestHash,
      sourceRoot: acquired.manifest.sourceRoot,
      independentOutcome: 0, visualReplay: false,
      training: 0, network: 0, authority: 0, action: 0 };
    process.stdout.write(`${canonicalizeStrict(summary)}\n`);
    return summary;
  } catch (error) {
    rmSync(temporary, { recursive: true, force: true });
    throw error;
  }
}

const invoked = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (invoked !== null && invoked === fileURLToPath(import.meta.url)) {
  runSo101RewardAcquisition().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
    process.exitCode = 1;
  });
}
