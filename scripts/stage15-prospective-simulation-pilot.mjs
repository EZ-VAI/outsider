#!/usr/bin/env node

import { generateKeyPairSync, randomBytes } from "node:crypto";
import {
  lstatSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync,
} from "node:fs";
import path from "node:path";
import {
  adjudicateSimulationTrial,
  buildProspectiveSimulationPilot,
  buildSimulationLearningReceipt,
  createSignedSimulationSchedule,
  createSimulationPreregistration,
  evaluateSimulationCeuMint,
  executeSimulationTrial,
  verifyProspectiveSimulationPilot,
} from "../src/outsider-prospective-physical-simulation.js";

const FILES = Object.freeze({
  "preregistration.json": "preregistration",
  "scheduler-manifest.json": "manifest",
  "execution-ledger.json": "ledger",
  "adjudication.json": "adjudication",
  "ceu-decision.json": "ceuDecision",
  "learning-receipt.json": "learningReceipt",
  "report.json": "report",
});

function usage() {
  return "usage: stage15-prospective-simulation-pilot <run|verify> --output-dir <directory> [--units <even 4..100>] [--experiment-id <token>]\n";
}

function parseArgs(argv) {
  const command = argv[0];
  if (!new Set(["run", "verify"]).has(command)) throw new Error("COMMAND_REQUIRED");
  const output = { command, outputDir: null, units: 12,
    experimentId: "outsider-synthetic-physical-pilot-v1",
    assignmentSeed: null, simulatorSeed: null };
  for (let index = 1; index < argv.length; index += 1) {
    const name = argv[index];
    if (!["--output-dir", "--units", "--experiment-id", "--assignment-seed",
      "--simulator-seed"].includes(name) || !argv[index + 1]) throw new Error(`ARGUMENT_INVALID:${name}`);
    const value = argv[++index];
    if (name === "--output-dir") output.outputDir = value;
    else if (name === "--units") output.units = Number(value);
    else if (name === "--experiment-id") output.experimentId = value;
    else if (name === "--assignment-seed") output.assignmentSeed = value;
    else output.simulatorSeed = value;
  }
  if (!output.outputDir) throw new Error("OUTPUT_DIR_REQUIRED");
  if (command === "verify" && (output.assignmentSeed || output.simulatorSeed)) {
    throw new Error("VERIFY_SEED_ARGUMENT_FORBIDDEN");
  }
  return output;
}

function exists(target) {
  try { lstatSync(target); return true; }
  catch (error) { if (error.code === "ENOENT") return false; throw error; }
}

function serialize(value) { return `${JSON.stringify(value, null, 2)}\n`; }

function atomicWriteDirectory(outputDir, artifacts) {
  const target = path.resolve(outputDir);
  if (exists(target)) throw new Error("OUTPUT_DIR_EXISTS");
  const parent = path.dirname(target);
  mkdirSync(parent, { recursive: true, mode: 0o700 });
  const temporary = path.join(parent, `.${path.basename(target)}.tmp-${process.pid}`);
  if (exists(temporary)) throw new Error("OUTPUT_TEMP_EXISTS");
  mkdirSync(temporary, { mode: 0o700 });
  try {
    for (const [name, key] of Object.entries(FILES)) {
      writeFileSync(path.join(temporary, name), serialize(artifacts[key]),
        { mode: 0o600, flag: "wx" });
    }
    renameSync(temporary, target);
  } catch (error) {
    rmSync(temporary, { recursive: true, force: true });
    throw error;
  }
  return target;
}

function readDirectory(outputDir) {
  const root = path.resolve(outputDir);
  const stat = lstatSync(root);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("OUTPUT_DIR_INVALID");
  const expected = Object.keys(FILES).sort();
  if (JSON.stringify(readdirSync(root).sort()) !== JSON.stringify(expected)) {
    throw new Error("OUTPUT_FILE_SET_INVALID");
  }
  const artifacts = {};
  for (const [name, key] of Object.entries(FILES)) {
    const file = path.join(root, name);
    const fileStat = lstatSync(file);
    if (!fileStat.isFile() || fileStat.isSymbolicLink() || fileStat.size <= 0
      || fileStat.size > 8 * 1024 * 1024) throw new Error(`OUTPUT_FILE_INVALID:${name}`);
    const raw = readFileSync(file, "utf8");
    const parsed = JSON.parse(raw);
    if (raw !== serialize(parsed)) throw new Error(`OUTPUT_FILE_NONCANONICAL:${name}`);
    artifacts[key] = parsed;
  }
  return artifacts;
}

function verifyDirectory(outputDir) {
  const artifacts = readDirectory(outputDir);
  const checked = verifyProspectiveSimulationPilot(artifacts.report, artifacts);
  if (!checked.ok) throw new Error(`PILOT_VERIFY_FAILED:${checked.error}`);
  return { ...checked, outputDir: path.resolve(outputDir) };
}

function keypair() {
  return generateKeyPairSync("ed25519", {
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
    publicKeyEncoding: { type: "spki", format: "pem" },
  });
}

function build(args) {
  const keys = { researcher: keypair(), scheduler: keypair(), executor: keypair(),
    adjudicator: keypair() };
  const assignmentSeed = args.assignmentSeed ?? randomBytes(24).toString("base64url");
  const simulatorSeed = args.simulatorSeed ?? randomBytes(24).toString("base64url");
  const base = Date.now();
  const preregistration = createSimulationPreregistration({
    experimentId: args.experimentId,
    preregisteredAt: new Date(base).toISOString(),
    plannedUnitCount: args.units,
    horizonSteps: 8,
    stepMs: 100,
    assignmentSeed,
    simulatorSeed,
    researcherOrganizationHash: `sha256:${"0".repeat(64)}`,
    researcherPrivateKeyPem: keys.researcher.privateKey,
  });
  const manifest = createSignedSimulationSchedule(preregistration, {
    assignmentSeed,
    issuedAt: new Date(base + 1_000).toISOString(),
    schedulerPrivateKeyPem: keys.scheduler.privateKey,
  });
  const ledger = executeSimulationTrial(preregistration, manifest, {
    simulatorSeed,
    startedAt: new Date(base + 2_000).toISOString(),
    executorPrivateKeyPem: keys.executor.privateKey,
  });
  const latestFinish = Math.max(...ledger.executions.map((item) => Date.parse(item.finishedAt)));
  const adjudication = adjudicateSimulationTrial(preregistration, manifest, ledger, {
    adjudicatedAt: new Date(latestFinish + 1_000).toISOString(),
    adjudicatorPrivateKeyPem: keys.adjudicator.privateKey,
  });
  const ceuDecision = evaluateSimulationCeuMint(preregistration, manifest, ledger,
    adjudication);
  const learningReceipt = buildSimulationLearningReceipt(preregistration, manifest,
    ledger, adjudication, ceuDecision);
  const report = buildProspectiveSimulationPilot({ preregistration, manifest, ledger,
    adjudication, ceuDecision, learningReceipt });
  return { preregistration, manifest, ledger, adjudication, ceuDecision,
    learningReceipt, report };
}

try {
  const args = parseArgs(process.argv.slice(2));
  const result = args.command === "run"
    ? (() => { atomicWriteDirectory(args.outputDir, build(args)); return verifyDirectory(args.outputDir); })()
    : verifyDirectory(args.outputDir);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`${error.message}\n${usage()}`);
  process.exitCode = 1;
}
