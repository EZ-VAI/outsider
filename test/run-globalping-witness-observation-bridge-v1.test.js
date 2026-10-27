import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  chmodSync, existsSync, mkdtempSync, readFileSync, realpathSync, rmSync,
  statSync, writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { canonicalizeStrict } from "../src/canonical.js";
import {
  runGlobalpingWitnessObservationBridgeV1,
} from "../tools/run-globalping-witness-observation-bridge-v1.mjs";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const CONFIG = path.join(ROOT, "artifacts",
  "globalping-witness-observation-bridge-20260904-v1", "config.json");
const BRIDGE_HASH =
  "sha256:a60614fd6392c8a7a0929c598c487aaef88506e05113bfea3bcb29206fb2972e";

function sha256(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function mode(file) {
  return Number(statSync(file).mode & 0o777).toString(8).padStart(4, "0");
}

test("runner replays the pinned source into one atomic private HOLD record",
  () => {
    const temporary = realpathSync(mkdtempSync(path.join(tmpdir(),
      "outsider-globalping-bridge-runner-")));
    chmodSync(temporary, 0o700);
    const outputDirectory = path.join(temporary, "published");
    try {
      const result = runGlobalpingWitnessObservationBridgeV1({
        configFile: CONFIG,
        outputDirectory,
      });
      assert.equal(result.bridgeHash, BRIDGE_HASH);
      assert.equal(result.recordClass,
        "EXTERNAL_OBSERVATION_SOURCE_CANDIDATE_HOLD");
      assert.equal(result.disposition, "CONTINUE_AUTOMATED_FORMATION_HOLD");
      assert.equal(result.decisionState, "HOLD");
      assert.equal(result.authority, "NONE");
      assert.equal(result.networkIoPerformed, false);
      assert.equal(result.paymentPerformed, false);
      assert.equal(mode(outputDirectory), "0700");

      const bridgeFile = path.join(outputDirectory, "bridge.json");
      const bytes = readFileSync(bridgeFile);
      const bridge = JSON.parse(bytes.toString("utf8"));
      assert.equal(mode(bridgeFile), "0600");
      assert.equal(bytes.equals(Buffer.from(
        `${canonicalizeStrict(bridge)}\n`, "utf8")), true);
      assert.equal(result.bridgeFile.bytes, bytes.length);
      assert.equal(result.bridgeFile.sha256, sha256(bytes));
      assert.equal(bridge.bridgeHash, BRIDGE_HASH);
      assert.equal(bridge.targetOrMeasurementIdProjected, false);
      assert.equal(Object.hasOwn(bridge, "measurementId"), false);
      assert.equal(Object.hasOwn(bridge.sourceBinding, "measurementId"), false);
      assert.equal(bridge.independentWitnessLifecycleReceiptPresent, false);
      assert.equal(bridge.capacityReserved, false);
      assert.equal(bridge.independentOutcomeTruthEstablished, false);
      assert.equal(bridge.atomicCommit, false);
      assert.equal(bridge.userOutcomePromiseIssued, false);
      assert.equal(bridge.enabledCapabilityCount, 0);

      assert.throws(() => runGlobalpingWitnessObservationBridgeV1({
        configFile: CONFIG,
        outputDirectory,
      }), /OUTPUT_DIRECTORY_ALREADY_EXISTS/u);
      assert.equal(sha256(readFileSync(bridgeFile)), result.bridgeFile.sha256);
    } finally {
      rmSync(temporary, { recursive: true, force: true });
    }
  });

test("runner rejects a world-readable config before creating output", () => {
  const temporary = realpathSync(mkdtempSync(path.join(tmpdir(),
    "outsider-globalping-bridge-runner-mode-")));
  chmodSync(temporary, 0o700);
  const config = path.join(temporary, "config.json");
  const outputDirectory = path.join(temporary, "published");
  try {
    writeFileSync(config, readFileSync(CONFIG), { mode: 0o644 });
    chmodSync(config, 0o644);
    assert.throws(() => runGlobalpingWitnessObservationBridgeV1({
      configFile: config,
      outputDirectory,
    }), /CONFIG_UNSAFE/u);
    assert.equal(existsSync(outputDirectory), false);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});
