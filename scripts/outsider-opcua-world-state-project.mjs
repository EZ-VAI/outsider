#!/usr/bin/env node
// Offline source-to-planner extraction. Preserves the live acquisition's evaluation time.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { projectOpcUaWorldState } from "../src/outsider-opcua-resource-node.js";

const [manifestFile, outputFile, supersededProjectionFile] = process.argv.slice(2);
if (!manifestFile || !outputFile) {
  console.error("Usage: node scripts/outsider-opcua-world-state-project.mjs PRIVATE_LIVE_MANIFEST NEW_PROJECTION_FILE [SUPERSEDED_PROJECTION_FILE]");
  process.exit(2);
}
const digest = (bytes) => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
const bytes = readFileSync(manifestFile);
const manifest = JSON.parse(bytes);
if (manifest.state !== "NATIVE_READ_COMPLETED" || !manifest.worldState) {
  throw new Error("Live acquisition has no completed scalar world-state projection");
}
for (const fact of manifest.worldState.facts) {
  const source = manifest.sources.find((item) => item.hash === fact.sourceHash);
  if (!source || digest(readFileSync(source.privatePath)) !== source.hash) {
    throw new Error("Referenced acquisition source bytes do not match");
  }
}
const projection = projectOpcUaWorldState({ sourceClass: manifest.sourceClass, samples: manifest.samples }, {
  bindings: manifest.worldState.facts.map(({ nodeId, predicateId, valueType }) => ({ nodeId, predicateId, valueType })),
  evaluatedAt: manifest.worldState.evaluatedAt, maxAgeMs: 30_000,
});
const result = { ...projection, replayMode: "OFFLINE_AT_ORIGINAL_OBSERVATION_TIME",
  sourceManifestHash: digest(bytes), sourceManifestPath: path.resolve(manifestFile),
  currentLiveStateClaimed: false };
if (supersededProjectionFile) {
  const previousBytes = readFileSync(supersededProjectionFile);
  if (JSON.parse(previousBytes).sourceManifestHash !== result.sourceManifestHash) {
    throw new Error("Superseded projection refers to a different source manifest");
  }
  result.supersedes = { projectionHash: digest(previousBytes),
    projectionPath: path.resolve(supersededProjectionFile) };
}
const projectionBytes = Buffer.from(`${JSON.stringify(result, null, 2)}\n`);
writeFileSync(outputFile, projectionBytes, { flag: "wx", mode: 0o600 });
console.log(JSON.stringify({ path: path.resolve(outputFile), hash: digest(projectionBytes),
  bytes: projectionBytes.length, initialState: result.initialState,
  plannerInitialState: result.plannerInitialState, sourceClass: result.sourceClass,
  evaluatedAt: result.evaluatedAt, currentLiveStateClaimed: false }, null, 2));
