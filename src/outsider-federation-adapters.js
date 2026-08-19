/* Privacy-safe producer adapters for the Global Outsider evidence plane. */

import { sha256 } from "./canonical.js";
import { verifyAttestationV2 } from "./outsider-stage05-evidence.js";
import { verifyDeepSeekHarnessObservation } from "./outsider-deepseek-harness-adapter.js";
import { verifyDeepSeekHarnessEffectEvidence } from "./outsider-deepseek-harness-protocol.js";
import { federationModeAllowed } from "./outsider-federation.js";

const HASH = /^sha256:[a-f0-9]{64}$/;
const validTime = (value) => typeof value === "string" && Number.isFinite(Date.parse(value));
function required(value, label) {
  if (!HASH.test(String(value ?? ""))) throw new Error(`FEDERATION_ADAPTER_${label}_INVALID`);
  return value;
}

function boundedMode(surface, requested) {
  if (federationModeAllowed(surface, requested)) return requested;
  if (federationModeAllowed(surface, "DELIVERY_SUPERVISED")) return "DELIVERY_SUPERVISED";
  return "OBSERVER_ONLY";
}

export function stage05FederationObservation({ attestation, observedAt,
  surface = "claude-code" } = {}) {
  const verified = verifyAttestationV2(attestation);
  if (!verified.ok || !validTime(observedAt) || !Array.isArray(attestation?.included)
    || attestation.included.length === 0) throw new Error("FEDERATION_STAGE05_INPUT_INVALID");
  const requestedMode = attestation.evidenceClass === "CONTROLLED_STAGE05"
    ? "CONTROLLED" : "DELIVERY_SUPERVISED";
  const controlMode = boundedMode(surface, requestedMode);
  const deliveryComplete = attestation.included.every((item) =>
    ["SAFE_DELIVERY", "VERIFIED_DELIVERY_UNATTRIBUTED"].includes(item.terminalClass)
    && item.deliveryComplete === true);
  const causalEffect = deliveryComplete && attestation.included.some((item) =>
    item.interventionRequired === true && item.interventionComplete === true);
  const claimsAllowed = controlMode !== "OBSERVER_ONLY";
  return Object.freeze({ evidenceRecordHash: attestation.attestationHash,
    runRefHash: sha256(attestation.included.map((item) => ({ runId: item.runId,
      manifestHash: item.manifestHash, evidenceRoot: item.evidenceRoot }))),
    sourceSchema: attestation.artifactType, observedAt,
    establishesObservedDelivery: claimsAllowed && deliveryComplete,
    establishesEffect: claimsAllowed && causalEffect,
    establishesOutcome: claimsAllowed && deliveryComplete,
    establishesLossOrLiability: false, controlMode,
    capabilityBasis: claimsAllowed ? "VERIFIED_STAGE05_ATTESTATION" : "OBSERVER_CEILING" });
}

export function deepSeekFederationObservation({ observation, observedAt,
  effect = null, effectContext = null } = {}) {
  if (!verifyDeepSeekHarnessObservation(observation).ok || !validTime(observedAt)) {
    throw new Error("FEDERATION_DEEPSEEK_OBSERVATION_INVALID");
  }
  const effectVerified = effect != null
    && verifyDeepSeekHarnessEffectEvidence(effect, effectContext ?? {}).ok;
  return Object.freeze({ evidenceRecordHash: effectVerified
    ? effect.recordHash : observation.recordHash,
  runRefHash: observation.source.eventLogHash, sourceSchema: observation.schema,
  observedAt, establishesObservedDelivery: effectVerified,
  establishesEffect: effectVerified, establishesOutcome: false,
  establishesLossOrLiability: false, controlMode: "DELIVERY_SUPERVISED",
  capabilityBasis: effectVerified
    ? "VERIFIED_DEEPSEEK_DELIVERY_AND_BOUNDED_EFFECT"
    : "DEEPSEEK_HOST_OBSERVATION_ONLY" });
}

export function observerFederationObservation({ evidenceRecordHash, runRefHash,
  sourceSchema, observedAt, surface } = {}) {
  required(evidenceRecordHash, "EVIDENCE_HASH");
  required(runRefHash, "RUN_REF_HASH");
  if (!validTime(observedAt) || typeof sourceSchema !== "string" || !sourceSchema.trim()
    || typeof surface !== "string" || !surface.trim()) {
    throw new Error("FEDERATION_OBSERVER_INPUT_INVALID");
  }
  return Object.freeze({ evidenceRecordHash, runRefHash, sourceSchema, observedAt,
    establishesObservedDelivery: false, establishesEffect: false,
    establishesOutcome: false, establishesLossOrLiability: false,
    controlMode: "OBSERVER_ONLY", capabilityBasis: `OBSERVER_ONLY:${surface}` });
}

export function codexFederationObservation(input = {}) {
  return observerFederationObservation({ ...input, surface: "codex" });
}

export function traeFederationObservation(input = {}) {
  return observerFederationObservation({ ...input, surface: "trae" });
}

export function wayDescriptor({ surface, wayKind = "agent-runtime", adapterHash,
  runtimeClosureHash, providerRootHash, topologyHash,
  modelRootHashes = [], dataRootHashes = [], toolchainRootHashes = [] } = {}) {
  for (const [label, value] of Object.entries({ adapterHash, runtimeClosureHash,
    providerRootHash, topologyHash })) required(value, label.toUpperCase());
  for (const values of [modelRootHashes, dataRootHashes, toolchainRootHashes]) {
    if (!Array.isArray(values) || values.some((value) => !HASH.test(String(value)))) {
      throw new Error("FEDERATION_WAY_ROOTS_INVALID");
    }
  }
  if (typeof surface !== "string" || !surface.trim() || typeof wayKind !== "string"
    || !wayKind.trim()) throw new Error("FEDERATION_WAY_IDENTITY_INVALID");
  const body = { surface, wayKind, adapterHash, runtimeClosureHash,
    providerRootHash, topologyHash, modelRootHashes: [...modelRootHashes].sort(),
    dataRootHashes: [...dataRootHashes].sort(),
    toolchainRootHashes: [...toolchainRootHashes].sort() };
  return Object.freeze({ wayHash: sha256(body), ...body });
}
