#!/usr/bin/env node

/*
 * Offline operator CLI for an already initialized Stage 3 gate directory.
 *
 * Initialization stays in the JS API because it must reopen the complete
 * Stage34/Stage2 source graph, including byte sources.  `verify` here is
 * intentionally labelled local-only; it cannot upgrade institutional trust.
 */

import { open, readFile } from "node:fs/promises";
import path from "node:path";

import {
  describeStage3GuaranteeGate,
  Stage3GuaranteeGateStore,
  verifyStage3GuaranteeGateDirectory,
} from "../src/outsider-stage3-guarantee-gate.js";

function fail(code) { throw new Error(code); }

function usage(stream = process.stderr) {
  stream.write(
    "usage:\n"
    + "  node scripts/stage3-guarantee-gate.mjs describe\n"
    + "  node scripts/stage3-guarantee-gate.mjs status --dir <gate-dir> [--required-checkpoint <json>]\n"
    + "  node scripts/stage3-guarantee-gate.mjs verify --dir <gate-dir> [--required-checkpoint <json>]\n"
    + "  node scripts/stage3-guarantee-gate.mjs checkpoint --dir <gate-dir> --command <json> --key <pem> [--required-checkpoint <json>] [--out <new-json-file>]\n"
    + "  node scripts/stage3-guarantee-gate.mjs request --dir <gate-dir> --command <json> --key <pem>\n"
    + "  node scripts/stage3-guarantee-gate.mjs present --dir <gate-dir> --command <json> --key <pem>\n"
    + "  node scripts/stage3-guarantee-gate.mjs revoke-capability --dir <gate-dir> --command <json> --key <pem>\n"
    + "  node scripts/stage3-guarantee-gate.mjs revoke-gate --dir <gate-dir> --command <json> --key <pem>\n"
    + "  node scripts/stage3-guarantee-gate.mjs sweep --dir <gate-dir> --command <json> --key <pem>\n"
    + "  node scripts/stage3-guarantee-gate.mjs register-receipt --dir <gate-dir> --command <json> --key <pem>\n"
    + "  node scripts/stage3-guarantee-gate.mjs adversity --dir <gate-dir> --command <json> --key <pem>\n"
    + "  node scripts/stage3-guarantee-gate.mjs rotate --dir <gate-dir> --command <json> --key <pem> --new-key <pem>\n"
    + "mutation options: [--required-checkpoint <json>] [--out <new-json-file>]\n",
  );
}

function options(values) {
  const allowed = new Set(["--dir", "--command", "--key", "--new-key", "--out",
    "--required-checkpoint"]);
  const result = {};
  for (let index = 0; index < values.length; index += 1) {
    const name = values[index];
    if (!allowed.has(name)) fail(`STAGE3_GATE_CLI_UNKNOWN_ARGUMENT:${name}`);
    if (Object.hasOwn(result, name)) fail(`STAGE3_GATE_CLI_DUPLICATE_ARGUMENT:${name}`);
    const value = values[index + 1];
    if (!value || value.startsWith("--")) fail(`STAGE3_GATE_CLI_VALUE_REQUIRED:${name}`);
    result[name] = value;
    index += 1;
  }
  return result;
}

async function json(file) {
  try { return JSON.parse(await readFile(path.resolve(file), "utf8")); }
  catch { fail("STAGE3_GATE_CLI_JSON_INVALID"); }
}

async function pem(file) {
  try { return await readFile(path.resolve(file), "utf8"); }
  catch { fail("STAGE3_GATE_CLI_KEY_INVALID"); }
}

async function emit(value, output) {
  const bytes = `${JSON.stringify(value, null, 2)}\n`;
  if (!output) { process.stdout.write(bytes); return; }
  const handle = await open(path.resolve(output), "wx", 0o600);
  try { await handle.writeFile(bytes, "utf8"); } finally { await handle.close(); }
}

function summary(snapshot, result = null) {
  const state = snapshot.envelope.state;
  return {
    schema: "outsider/stage3-guarantee-gate-cli-result/v1",
    gateIdHash: state.gateIdHash,
    revision: state.revision,
    stateHash: snapshot.envelope.stateHash,
    verification: snapshot.verification,
    lifecycle: state.lifecycle,
    requestAccounting: state.requestAccounting,
    candidateStatuses: state.candidates.map((candidate) => ({
      candidateIdHash: candidate.core.candidateIdHash,
      candidateHash: candidate.candidateHash,
      status: candidate.lifecycle.status,
      presentationCount: candidate.lifecycle.presentationCount,
      requestedUnits: candidate.core.reserveRequest.requestedUnits,
      actualReserve: false,
      actualResourceWrite: false,
    })),
    externalReceipts: state.externalReceipts,
    auditStatus: state.audit.lastCycleStatus,
    responsibilityRecovery: state.responsibilityRecovery,
    transition: result === null ? null : {
      idempotentReplay: result.idempotentReplay,
      commandHash: result.commandHash,
      outcome: result.outcome,
    },
    decision: state.decision,
    authority: state.authority,
  };
}

const command = process.argv[2];

if (["--help", "-h"].includes(command)) {
  usage(process.stdout);
  process.exit(0);
}

try {
  if (!command) { usage(); fail("STAGE3_GATE_CLI_COMMAND_REQUIRED"); }
  const args = options(process.argv.slice(3));
  if (command === "describe") {
    if (Object.keys(args).length) fail("STAGE3_GATE_CLI_DESCRIBE_ARGUMENT_INVALID");
    await emit(describeStage3GuaranteeGate());
  } else if (command === "verify") {
    if (!args["--dir"] || args["--command"] || args["--key"] || args["--new-key"])
      fail("STAGE3_GATE_CLI_VERIFY_ARGUMENT_INVALID");
    const requiredCheckpoint = args["--required-checkpoint"]
      ? await json(args["--required-checkpoint"]) : null;
    await emit(await verifyStage3GuaranteeGateDirectory(args["--dir"],
      { requiredCheckpoint }), args["--out"]);
  } else if (command === "status") {
    if (!args["--dir"] || args["--command"] || args["--key"] || args["--new-key"])
      fail("STAGE3_GATE_CLI_STATUS_ARGUMENT_INVALID");
    const requiredCheckpoint = args["--required-checkpoint"]
      ? await json(args["--required-checkpoint"]) : null;
    const store = await Stage3GuaranteeGateStore.open(args["--dir"],
      { requiredCheckpoint });
    await emit(summary(await store.snapshot()), args["--out"]);
  } else {
    if (!args["--dir"] || !args["--command"] || !args["--key"])
      fail("STAGE3_GATE_CLI_MUTATION_ARGUMENT_REQUIRED");
    const requiredCheckpoint = args["--required-checkpoint"]
      ? await json(args["--required-checkpoint"]) : null;
    const store = await Stage3GuaranteeGateStore.open(args["--dir"],
      { requiredCheckpoint });
    const payload = await json(args["--command"]);
    const key = await pem(args["--key"]);
    let result;
    if (command === "checkpoint") {
      const checkpoint = await store.createCheckpoint(payload, key);
      await emit(checkpoint, args["--out"]);
      result = null;
    } else if (command === "request") result = await store.requestCapability(payload, key);
    else if (command === "present") result = await store.presentCapability(payload, key);
    else if (command === "revoke-capability") {
      result = await store.revokeCapability(payload, key);
    } else if (command === "revoke-gate") result = await store.revokeGate(payload, key);
    else if (command === "sweep") result = await store.sweepExpiry(payload, key);
    else if (command === "register-receipt") {
      result = await store.registerExternalReceipt(payload, key);
    } else if (command === "adversity") result = await store.recordAdversity(payload, key);
    else if (command === "rotate") {
      if (!args["--new-key"]) fail("STAGE3_GATE_CLI_NEW_KEY_REQUIRED");
      result = await store.rotateSigner(payload, key, await pem(args["--new-key"]));
    } else {
      usage(); fail(`STAGE3_GATE_CLI_COMMAND_INVALID:${command}`);
    }
    if (command !== "checkpoint") {
      const snapshot = await store.snapshot();
      await emit(summary(snapshot, result), args["--out"]);
    }
  }
} catch (error) {
  process.stderr.write(`${error?.message ?? String(error)}\n`);
  process.exitCode = 1;
}
