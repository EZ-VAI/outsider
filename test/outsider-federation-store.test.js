import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { sha256 } from "../src/canonical.js";
import { createFederatedEvidencePacket, createFederatedWayAttestation,
  createFederationTrustStore, federationKeyId } from "../src/outsider-federation.js";
import { observerFederationObservation,
  wayDescriptor } from "../src/outsider-federation-adapters.js";
import { DurableGlobalOutsiderRegistry } from "../src/outsider-federation-store.js";

const h = (value) => sha256(String(value));

function fixture() {
  const keys = generateKeyPairSync("ed25519", {
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  const operatorKeyId = federationKeyId(keys.publicKey);
  const instrument = { instrumentHash: h("instrument"),
    instrumentVersionHash: h("instrument-version"), adapterHash: h("adapter"),
    operatorKeyId, surface: "codex", controlMode: "OBSERVER_ONLY" };
  const trustStore = createFederationTrustStore({ policyHash: h("policy"),
    operators: [{ publicKeyPem: keys.publicKey, tenantHash: h("tenant"),
      governanceRootHash: h("governance"), operatorKind: "TEST_OPERATOR" }],
    instruments: [instrument] });
  const caseRef = { claimHash: h("claim"), claimFamilyHash: h("claim-family"),
    worldHash: h("world"), worldFamilyHash: h("world-family"), policyHash: h("policy") };
  const way = wayDescriptor({ surface: "codex", adapterHash: instrument.adapterHash,
    runtimeClosureHash: h("runtime"), providerRootHash: h("provider"),
    topologyHash: h("topology") });
  const attestation = createFederatedWayAttestation({ caseRef,
    operator: { tenantHash: h("tenant"), governanceRootHash: h("governance") },
    instrument, way, observation: observerFederationObservation({
      evidenceRecordHash: h("evidence"), runRefHash: h("run"),
      sourceSchema: "codex/observer/v1", observedAt: "2026-08-15T00:00:00Z",
      surface: "codex" }), outputArtifactHash: h("artifact"),
    privateKeyPem: keys.privateKey });
  const packet = createFederatedEvidencePacket({ caseRef,
    wayAttestations: [attestation], handoffs: [], trustStore,
    createdAt: "2026-08-15T00:01:00Z" });
  return { trustStore, packet, tenantHash: h("tenant") };
}

test("durable registry reopens, verifies, deduplicates and gates tenant reads", () => {
  const f = fixture(), directory = mkdtempSync(path.join(tmpdir(), "outsider-registry-"));
  const registry = new DurableGlobalOutsiderRegistry({ directory,
    trustStore: f.trustStore });
  const appended = registry.append(f.packet);
  assert.equal(appended.appended, true);
  assert.match(appended.supervisionHash, /^sha256:/);
  assert.equal(registry.append(f.packet).appended, false);
  assert.equal(registry.packetForTenant(f.packet.recordHash, f.tenantHash).recordHash,
    f.packet.recordHash);
  assert.equal(registry.packetForTenant(f.packet.recordHash, h("other")), null);
  assert.equal(registry.supervision(f.packet.recordHash).learning.eligibleForPricing, false);
  assert.equal(registry.verify().ok, true);
  const reopened = new DurableGlobalOutsiderRegistry({ directory,
    trustStore: f.trustStore });
  assert.equal(reopened.summary().entries, 1);
  assert.equal(reopened.summary().authority, "none");
});

test("durable registry detects packet tampering on reopen", () => {
  const f = fixture(), directory = mkdtempSync(path.join(tmpdir(), "outsider-registry-"));
  const registry = new DurableGlobalOutsiderRegistry({ directory,
    trustStore: f.trustStore });
  registry.append(f.packet);
  const packetFile = path.join(directory, "packets",
    `${f.packet.recordHash.slice("sha256:".length)}.json`);
  const packet = JSON.parse(readFileSync(packetFile, "utf8"));
  packet.createdAt = "2026-08-15T09:00:00Z";
  writeFileSync(packetFile, JSON.stringify(packet));
  assert.throws(() => new DurableGlobalOutsiderRegistry({ directory,
    trustStore: f.trustStore }), /FEDERATION_STORE_PACKET_INVALID/);
  assert.equal(registry.verify().ok, false);
});
