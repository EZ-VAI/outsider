import test from "node:test";
import assert from "node:assert/strict";
import { createPrivateKey, createPublicKey, generateKeyPairSync,
  sign as cryptoSign } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { canonicalizeStrict, sha256 } from "../src/canonical.js";
import { acceptFederatedHandoffOffer, createFederatedEvidencePacket,
  createFederatedHandoff, createFederatedHandoffOffer,
  createFederatedSupervisionRecord, createFederatedWayAttestation,
  createFederationTrustStore, federationKeyId, GlobalOutsiderRegistry,
  verifyFederatedEvidencePacket, verifyFederatedHandoff,
  verifyFederatedHandoffOffer,
  verifyFederatedWayAttestation, verifyFederationTrustStore } from
  "../src/outsider-federation.js";
import { observerFederationObservation,
  wayDescriptor } from "../src/outsider-federation-adapters.js";

const h = (value) => sha256(String(value));
const keypair = () => generateKeyPairSync("ed25519", {
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});

function setup() {
  const names = ["codex", "deepseek", "claude", "trae"];
  const keys = Object.fromEntries(names.map((name) => [name, keypair()]));
  const ids = Object.fromEntries(names.map((name) => [name,
    federationKeyId(keys[name].publicKey)]));
  const profiles = {
    codex: ["codex", "OBSERVER_ONLY"],
    deepseek: ["deepseek-harness", "DELIVERY_SUPERVISED"],
    claude: ["claude-code", "CONTROLLED"],
    trae: ["trae", "OBSERVER_ONLY"],
  };
  const instruments = Object.fromEntries(names.map((name) => [name, {
    instrumentHash: h(`instrument:${name}`), instrumentVersionHash: h(`version:${name}`),
    adapterHash: h(`adapter:${name}`), operatorKeyId: ids[name],
    surface: profiles[name][0], controlMode: profiles[name][1],
  }]));
  const trustStore = createFederationTrustStore({ policyHash: h("policy"),
    operators: names.map((name) => ({ publicKeyPem: keys[name].publicKey,
      tenantHash: h(`tenant:${name}`), governanceRootHash: h(`governance:${name}`),
      operatorKind: "TEST_OPERATOR" })), instruments: Object.values(instruments) });
  const caseRef = { claimHash: h("claim"), claimFamilyHash: h("claim-family"),
    worldHash: h("world"), worldFamilyHash: h("world-family"), policyHash: h("policy") };
  const ways = Object.fromEntries(names.map((name) => [name, wayDescriptor({
    surface: profiles[name][0], adapterHash: instruments[name].adapterHash,
    runtimeClosureHash: h(`runtime:${name}`), providerRootHash: h(`provider:${name}`),
    topologyHash: h(`topology:${name}`), modelRootHashes: [h(`model:${name}`)],
    dataRootHashes: [h(`data:${name}`)], toolchainRootHashes: [h(`tools:${name}`)],
  })]));
  const observation = (name, at, claims = {}) => ({
    ...observerFederationObservation({ evidenceRecordHash: h(`evidence:${name}`),
      runRefHash: h(`run:${name}`), sourceSchema: `test/${name}/v1`, observedAt: at,
      surface: profiles[name][0] }), controlMode: profiles[name][1], ...claims,
  });
  const operator = (name) => ({ tenantHash: h(`tenant:${name}`),
    governanceRootHash: h(`governance:${name}`) });
  return { names, keys, ids, instruments, trustStore, caseRef, ways, observation,
    operator };
}

function chain() {
  const f = setup();
  const attestation = ({ name, at, inputHandoffHashes = [], outputArtifactHash,
    claims = {} }) => createFederatedWayAttestation({ caseRef: f.caseRef,
    operator: f.operator(name), instrument: f.instruments[name], way: f.ways[name],
    observation: f.observation(name, at, claims), inputHandoffHashes,
    outputArtifactHash, privateKeyPem: f.keys[name].privateKey });
  const handoff = ({ source, from, to, artifactHash, at, nonce }) =>
    createFederatedHandoff({ sourceAttestation: source,
      destination: { operatorKeyId: f.ids[to], wayHash: f.ways[to].wayHash,
        instrumentHash: f.instruments[to].instrumentHash }, artifactHash,
      scopeHash: h(`scope:${from}:${to}`), expectedOutcomeHash: h(`expected:${from}:${to}`),
      nonceHash: h(nonce), offeredAt: `2026-08-15T04:${at}:00Z`,
      receivedAt: `2026-08-15T04:${String(Number(at) + 1).padStart(2, "0")}:00Z`,
      senderPrivateKeyPem: f.keys[from].privateKey,
      receiverPrivateKeyPem: f.keys[to].privateKey, trustStore: f.trustStore });
  const codex = attestation({ name: "codex", at: "2026-08-15T04:00:00Z",
    outputArtifactHash: h("artifact:codex") });
  const cd = handoff({ source: codex, from: "codex", to: "deepseek",
    artifactHash: h("artifact:codex"), at: "01", nonce: "nonce:cd" });
  const deepseek = attestation({ name: "deepseek", at: "2026-08-15T04:03:00Z",
    inputHandoffHashes: [cd.recordHash], outputArtifactHash: h("artifact:deepseek"),
    claims: { establishesObservedDelivery: true, establishesEffect: true } });
  const dc = handoff({ source: deepseek, from: "deepseek", to: "claude",
    artifactHash: h("artifact:deepseek"), at: "04", nonce: "nonce:dc" });
  const claude = attestation({ name: "claude", at: "2026-08-15T04:06:00Z",
    inputHandoffHashes: [dc.recordHash], outputArtifactHash: h("artifact:claude"),
    claims: { establishesObservedDelivery: true, establishesEffect: true,
      establishesOutcome: true } });
  const ct = handoff({ source: claude, from: "claude", to: "trae",
    artifactHash: h("artifact:claude"), at: "07", nonce: "nonce:ct" });
  const trae = attestation({ name: "trae", at: "2026-08-15T04:09:00Z",
    inputHandoffHashes: [ct.recordHash], outputArtifactHash: h("artifact:trae") });
  const packet = createFederatedEvidencePacket({ caseRef: f.caseRef,
    wayAttestations: [codex, deepseek, claude, trae, codex],
    handoffs: [cd, dc, ct, cd], trustStore: f.trustStore,
    createdAt: "2026-08-15T04:10:00Z" });
  return { ...f, codex, cd, deepseek, dc, claude, ct, trae, packet, attestation,
    handoff };
}

test("Codex -> DeepSeek -> Claude -> Trae forms one verified global evidence graph", () => {
  const f = chain();
  assert.equal(verifyFederationTrustStore(f.trustStore).ok, true);
  assert.equal(verifyFederatedWayAttestation(f.claude, f.trustStore).ok, true);
  assert.equal(verifyFederatedHandoff(f.dc, f.trustStore, f.deepseek).ok, true);
  const verified = verifyFederatedEvidencePacket(f.packet, f.trustStore);
  assert.equal(verified.ok, true);
  assert.deepEqual(verified.summary, { wayRuns: 4, handoffs: 3, operators: 4,
    correlationComponents: 1, structuralIndependentUpperBound: 1,
    institutionalIndependence: "NOT_ESTABLISHED_BY_KEYS_OR_CONFIGURATION" });
  assert.equal(f.packet.instrumentPolicy.cohorts.length, 4);
  assert.equal(f.packet.dedupDisclosure.wayDuplicatesCollapsed, 1);
  assert.equal(f.packet.dedupDisclosure.handoffDuplicatesCollapsed, 1);
  assert.equal(f.packet.authority.federationAuthority, "none");
});

test("bilateral handoff never requires one process to hold both companies' keys", () => {
  const f = setup();
  const codex = createFederatedWayAttestation({ caseRef: f.caseRef,
    operator: f.operator("codex"), instrument: f.instruments.codex,
    way: f.ways.codex, observation: f.observation("codex", "2026-08-15T04:00:00Z"),
    outputArtifactHash: h("bilateral-artifact"),
    privateKeyPem: f.keys.codex.privateKey });
  const offer = createFederatedHandoffOffer({ sourceAttestation: codex,
    destination: { operatorKeyId: f.ids.deepseek, wayHash: f.ways.deepseek.wayHash,
      instrumentHash: f.instruments.deepseek.instrumentHash },
    artifactHash: h("bilateral-artifact"), scopeHash: h("bilateral-scope"),
    expectedOutcomeHash: h("bilateral-outcome"), nonceHash: h("bilateral-nonce"),
    offeredAt: "2026-08-15T04:01:00Z",
    senderPrivateKeyPem: f.keys.codex.privateKey, trustStore: f.trustStore });
  assert.equal(verifyFederatedHandoffOffer(offer, f.trustStore, codex).ok, true);
  const accepted = acceptFederatedHandoffOffer({ offer, sourceAttestation: codex,
    receivedAt: "2026-08-15T04:02:00Z",
    receiverPrivateKeyPem: f.keys.deepseek.privateKey, trustStore: f.trustStore });
  assert.equal(verifyFederatedHandoff(accepted, f.trustStore, codex).ok, true);
  assert.throws(() => acceptFederatedHandoffOffer({ offer, sourceAttestation: codex,
    receivedAt: "2026-08-15T04:02:00Z",
    receiverPrivateKeyPem: f.keys.trae.privateKey, trustStore: f.trustStore }),
  /FEDERATION_HANDOFF_RECEIVER_INVALID/);
});

test("surface ceilings refuse Codex/Trae or DeepSeek control overclaim", () => {
  const f = setup();
  for (const [name, controlMode] of [["codex", "CONTROLLED"], ["trae", "CONTROLLED"],
    ["deepseek", "CONTROLLED"]]) {
    assert.throws(() => createFederationTrustStore({ policyHash: h("policy"),
      operators: f.trustStore.operators, instruments: [{ ...f.instruments[name],
        controlMode }] }), /FEDERATION_INSTRUMENT_INVALID/);
  }
  assert.throws(() => createFederatedWayAttestation({
    caseRef: f.caseRef, operator: f.operator("deepseek"),
    instrument: f.instruments.deepseek, way: f.ways.deepseek,
    observation: f.observation("deepseek", "2026-08-15T04:00:00Z",
      { establishesOutcome: true }), outputArtifactHash: h("overclaim"),
    privateKeyPem: f.keys.deepseek.privateKey,
  }), /WAY_SURFACE_CAPABILITY_OVERCLAIM/);
});

test("even a valid operator signature cannot omit shared correlation roots", () => {
  const f = chain(), dishonest = structuredClone(f.claude);
  dishonest.signedRun.payload.correlationRootHashes = [h("private-fake-root")];
  const privateKey = createPrivateKey(f.keys.claude.privateKey);
  const publicKeyPem = createPublicKey(privateKey)
    .export({ type: "spki", format: "pem" }).toString();
  const context = { schema: "outsider/federation-signature/v1", algorithm: "Ed25519",
    role: "operator", keyId: federationKeyId(publicKeyPem),
    payloadHash: sha256(dishonest.signedRun.payload) };
  dishonest.signedRun.signature = { ...context,
    value: cryptoSign(null, Buffer.from(canonicalizeStrict({
      payload: dishonest.signedRun.payload, context })), privateKey).toString("base64url") };
  const body = { schema: dishonest.schema, operatorKeyId: dishonest.operatorKeyId,
    signedRun: dishonest.signedRun };
  dishonest.recordHash = sha256(body);
  const checked = verifyFederatedWayAttestation(dishonest, f.trustStore);
  assert.equal(checked.ok, false);
  assert.ok(checked.failures.includes("WAY_CORRELATION_ROOTS_INCOMPLETE"));
});

test("registry deduplicates packets, gates tenants and rejects nonce replay", () => {
  const f = chain(), registry = new GlobalOutsiderRegistry({ trustStore: f.trustStore });
  assert.equal(registry.append(f.packet).appended, true);
  assert.equal(registry.append(f.packet).appended, false);
  assert.equal(registry.packetForTenant(f.packet.recordHash,
    h("tenant:claude")).recordHash, f.packet.recordHash);
  assert.equal(registry.packetForTenant(f.packet.recordHash, h("tenant:mallory")), null);
  assert.equal(registry.verify().ok, true);

  const replay = f.handoff({ source: f.codex, from: "codex", to: "deepseek",
    artifactHash: h("artifact:codex"), at: "11", nonce: "nonce:cd" });
  const target = f.attestation({ name: "deepseek", at: "2026-08-15T04:13:00Z",
    inputHandoffHashes: [replay.recordHash], outputArtifactHash: h("artifact:replay") });
  const packet = createFederatedEvidencePacket({ caseRef: f.caseRef,
    wayAttestations: [f.codex, target], handoffs: [replay], trustStore: f.trustStore,
    createdAt: "2026-08-15T04:14:00Z" });
  assert.throws(() => registry.append(packet), /FEDERATION_HANDOFF_REPLAY/);
});

test("tampering, private data and fabricated D1 disclosure fail closed", () => {
  const f = chain();
  for (const mutate of [
    (packet) => { packet.wayAttestations[0].signedRun.payload.outputArtifactHash = h("bad"); },
    (packet) => { packet.wayAttestations[0].signedRun.payload.prompt = "private"; },
    (packet) => { packet.dedupDisclosure.wayDuplicateHashes[0].collapsed = 99; },
  ]) {
    const packet = structuredClone(f.packet); mutate(packet);
    assert.equal(verifyFederatedEvidencePacket(packet, f.trustStore).ok, false);
  }
  for (const malformed of [null, [], { schema: "bad" }, { value: Symbol("bad") }]) {
    assert.doesNotThrow(() => verifyFederatedEvidencePacket(malformed, f.trustStore));
    assert.equal(verifyFederatedEvidencePacket(malformed, f.trustStore).ok, false);
  }
});

test("federated supervision accumulates routing evidence but never causal or pricing authority", () => {
  const f = chain();
  const record = createFederatedSupervisionRecord(f.packet, f.trustStore);
  assert.equal(record.observed.wayRuns, 4);
  assert.equal(record.observed.handoffs, 3);
  assert.equal(record.observed.structuralIndependentUpperBound, 1);
  assert.equal(record.learning.eligibleForRoutingResearch, true);
  assert.equal(record.learning.eligibleForGlobalCausalEffectLearning, false);
  assert.equal(record.learning.eligibleForReliabilityGuarantee, false);
  assert.equal(record.learning.eligibleForPricing, false);
  assert.equal(record.authority.movesFunds, false);
});

test("a deterministic non-Agent Way uses the same protocol", () => {
  const pair = keypair(), operatorKeyId = federationKeyId(pair.publicKey);
  const instrument = { instrumentHash: h("det:instrument"),
    instrumentVersionHash: h("det:version"), adapterHash: h("det:adapter"),
    operatorKeyId, surface: "deterministic-program", controlMode: "CONTROLLED" };
  const trust = createFederationTrustStore({ policyHash: h("det:policy"),
    operators: [{ publicKeyPem: pair.publicKey, tenantHash: h("det:tenant"),
      governanceRootHash: h("det:governance"), operatorKind: "PROGRAM_OWNER" }],
    instruments: [instrument] });
  const record = createFederatedWayAttestation({ privateKeyPem: pair.privateKey,
    caseRef: { claimHash: h("det:c"), claimFamilyHash: h("det:cf"),
      worldHash: h("det:w"), worldFamilyHash: h("det:wf"), policyHash: h("det:policy") },
    operator: { tenantHash: h("det:tenant"), governanceRootHash: h("det:governance") },
    instrument, way: wayDescriptor({ surface: "deterministic-program",
      wayKind: "deterministic-program", adapterHash: instrument.adapterHash,
      runtimeClosureHash: h("det:r"), providerRootHash: h("det:p"),
      topologyHash: h("det:t"), toolchainRootHashes: [h("det:tools")] }),
    observation: { evidenceRecordHash: h("det:e"), runRefHash: h("det:run"),
      sourceSchema: "deterministic/v1", observedAt: "2026-08-15T00:00:00Z",
      establishesObservedDelivery: true, establishesEffect: true,
      establishesOutcome: true, establishesLossOrLiability: false,
      controlMode: "CONTROLLED" }, outputArtifactHash: h("det:artifact") });
  assert.equal(verifyFederatedWayAttestation(record, trust).ok, true);
});

test("the public CLI verifies a packet and exports bounded supervision", () => {
  const f = chain(), directory = mkdtempSync(path.join(tmpdir(), "outsider-federation-"));
  const packetFile = path.join(directory, "federation-packet.json");
  const trustFile = path.join(directory, "federation-trust-store.json");
  const outputFile = path.join(directory, "federated-supervision.json");
  writeFileSync(packetFile, JSON.stringify(f.packet));
  writeFileSync(trustFile, JSON.stringify(f.trustStore));
  const verified = spawnSync(process.execPath, ["bin/outsider.mjs", "federation-verify",
    packetFile, "--trust-store", trustFile], { encoding: "utf8" });
  assert.equal(verified.status, 0, verified.stderr);
  const verifyReport = JSON.parse(verified.stdout);
  assert.equal(verifyReport.ok, true);
  assert.equal(verifyReport.institutionalIndependenceEstablished, false);
  const supervised = spawnSync(process.execPath, ["bin/outsider.mjs",
    "federation-supervise", packetFile, "--trust-store", trustFile,
    "--out", outputFile], { encoding: "utf8" });
  assert.equal(supervised.status, 0, supervised.stderr);
  const record = JSON.parse(readFileSync(outputFile, "utf8"));
  assert.equal(record.learning.eligibleForRoutingResearch, true);
  assert.equal(record.learning.eligibleForGlobalCausalEffectLearning, false);
  assert.equal(record.learning.eligibleForPricing, false);
});

test("the public CLI keeps bilateral keys separate and durably ingests packets", () => {
  const f = chain(), directory = mkdtempSync(path.join(tmpdir(), "outsider-federation-cli-"));
  const sourceFile = path.join(directory, "codex-attestation.json");
  const specFile = path.join(directory, "offer-spec.json");
  const trustFile = path.join(directory, "trust.json");
  const senderKeyFile = path.join(directory, "sender.pem");
  const receiverKeyFile = path.join(directory, "receiver.pem");
  const offerFile = path.join(directory, "offer.json");
  const handoffFile = path.join(directory, "handoff.json");
  const packetFile = path.join(directory, "packet.json");
  const stateRoot = path.join(directory, "registry");
  writeFileSync(sourceFile, JSON.stringify(f.codex));
  writeFileSync(trustFile, JSON.stringify(f.trustStore));
  writeFileSync(senderKeyFile, f.keys.codex.privateKey);
  writeFileSync(receiverKeyFile, f.keys.deepseek.privateKey);
  writeFileSync(specFile, JSON.stringify({ destination: {
    operatorKeyId: f.ids.deepseek, wayHash: f.ways.deepseek.wayHash,
    instrumentHash: f.instruments.deepseek.instrumentHash },
  artifactHash: h("artifact:codex"), scopeHash: h("scope:codex:deepseek"),
  expectedOutcomeHash: h("expected:codex:deepseek"), nonceHash: h("nonce:cd"),
  offeredAt: "2026-08-15T04:01:00Z" }));
  const offered = spawnSync(process.execPath, ["bin/outsider.mjs", "federation-offer",
    sourceFile, specFile, "--trust-store", trustFile, "--signing-key", senderKeyFile,
    "--out", offerFile], { encoding: "utf8" });
  assert.equal(offered.status, 0, offered.stderr);
  const accepted = spawnSync(process.execPath, ["bin/outsider.mjs", "federation-accept",
    offerFile, sourceFile, "--trust-store", trustFile, "--signing-key", receiverKeyFile,
    "--received-at", "2026-08-15T04:02:00Z", "--out", handoffFile],
  { encoding: "utf8" });
  assert.equal(accepted.status, 0, accepted.stderr);
  assert.equal(JSON.parse(readFileSync(handoffFile, "utf8")).recordHash, f.cd.recordHash);
  writeFileSync(packetFile, JSON.stringify(f.packet));
  const ingested = spawnSync(process.execPath, ["bin/outsider.mjs", "federation-ingest",
    packetFile, "--trust-store", trustFile, "--state-root", stateRoot],
  { encoding: "utf8" });
  assert.equal(ingested.status, 0, ingested.stderr);
  assert.equal(JSON.parse(ingested.stdout).registry.entries, 1);
  const status = spawnSync(process.execPath, ["bin/outsider.mjs", "federation-status",
    "--trust-store", trustFile, "--state-root", stateRoot], { encoding: "utf8" });
  assert.equal(status.status, 0, status.stderr);
  assert.equal(JSON.parse(status.stdout).institutionalIndependence,
    "NOT_ESTABLISHED_BY_KEYS_OR_CONFIGURATION");
});
