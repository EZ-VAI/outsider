import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import test from "node:test";

import { sha256 } from "../src/canonical.js";
import {
  createFederationTrustStore,
  federationKeyId,
  verifyFederatedWayAttestation,
} from "../src/outsider-federation.js";
import {
  createCodexFederatedWay,
  createProviderWayDescriptor,
  createTraeFederatedWay,
} from "../src/outsider-federation-producers.js";

const h = (value) => sha256(String(value));

function fixture(surface) {
  const pair = generateKeyPairSync("ed25519", {
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  const operatorKeyId = federationKeyId(pair.publicKey);
  const operator = { tenantHash: h(`${surface}:tenant`),
    governanceRootHash: h(`${surface}:governance`) };
  const instrument = { instrumentHash: h(`${surface}:instrument`),
    instrumentVersionHash: h(`${surface}:instrument-version`),
    adapterHash: h(`${surface}:adapter`), operatorKeyId, surface,
    controlMode: "OBSERVER_ONLY" };
  const way = createProviderWayDescriptor({ surface,
    adapterHash: instrument.adapterHash, runtimeClosureHash: h(`${surface}:runtime`),
    providerRootHash: h(`${surface}:provider`), topologyHash: h(`${surface}:topology`),
    modelRootHashes: [h(`${surface}:model`)],
    dataRootHashes: [h(`${surface}:data`)],
    toolchainRootHashes: [h(`${surface}:tools`)] });
  const caseRef = { claimHash: h("claim"), claimFamilyHash: h("claim-family"),
    worldHash: h("world"), worldFamilyHash: h("world-family"), policyHash: h("policy") };
  const trustStore = createFederationTrustStore({ policyHash: caseRef.policyHash,
    operators: [{ publicKeyPem: pair.publicKey, ...operator, operatorKind: "TEST_OPERATOR" }],
    instruments: [instrument] });
  return { pair, operator, instrument, way, caseRef, trustStore };
}

test("provider producers bind verified observer evidence without raising authority", () => {
  for (const [surface, create] of [["codex", createCodexFederatedWay],
    ["trae", createTraeFederatedWay]]) {
    const f = fixture(surface);
    const record = create({ caseRef: f.caseRef, operator: f.operator,
      instrument: f.instrument, way: f.way,
      evidenceRecordHash: h(`${surface}:evidence`), runRefHash: h(`${surface}:run`),
      sourceSchema: `test/${surface}/v1`, observedAt: "2026-08-22T00:00:00Z",
      inputHandoffHashes: [], outputArtifactHash: h(`${surface}:output`),
      privateKeyPem: f.pair.privateKey });
    assert.equal(verifyFederatedWayAttestation(record, f.trustStore).ok, true);
    assert.equal(record.signedRun.payload.observation.controlMode, "OBSERVER_ONLY");
    assert.equal(record.signedRun.payload.observation.establishesObservedDelivery, false);
    assert.equal(record.signedRun.payload.observation.establishesOutcome, false);
    assert.equal(record.signedRun.payload.observation.establishesLossOrLiability, false);
  }
});

test("provider descriptors are deterministic and reject incomplete trust roots", () => {
  const first = fixture("codex").way;
  const second = fixture("codex").way;
  assert.equal(first.wayHash, second.wayHash);
  assert.throws(() => createProviderWayDescriptor({ surface: "codex",
    adapterHash: h("adapter"), runtimeClosureHash: h("runtime"),
    providerRootHash: h("provider") }), /FEDERATION_ADAPTER_TOPOLOGYHASH_INVALID/);
});
