/* High-level provider producers. These bind already-verified local evidence to
 * a signed federation Way; they do not weaken provider-specific verifiers. */

import { createFederatedWayAttestation } from "./outsider-federation.js";
import { codexFederationObservation, deepSeekFederationObservation,
  stage05FederationObservation, traeFederationObservation,
  wayDescriptor } from "./outsider-federation-adapters.js";

function produce({ caseRef, operator, instrument, way, observation,
  inputHandoffHashes = [], outputArtifactHash, privateKeyPem }) {
  return createFederatedWayAttestation({ caseRef, operator, instrument, way,
    observation, inputHandoffHashes, outputArtifactHash, privateKeyPem });
}

export function createClaudeFederatedWay({ attestation, observedAt,
  surface = "claude-code", ...binding } = {}) {
  return produce({ ...binding, observation: stage05FederationObservation({
    attestation, observedAt, surface }) });
}

export function createDeepSeekFederatedWay({ observation, observedAt,
  effect = null, effectContext = null, ...binding } = {}) {
  return produce({ ...binding, observation: deepSeekFederationObservation({
    observation, observedAt, effect, effectContext }) });
}

export function createCodexFederatedWay({ evidenceRecordHash, runRefHash,
  sourceSchema, observedAt, ...binding } = {}) {
  return produce({ ...binding, observation: codexFederationObservation({
    evidenceRecordHash, runRefHash, sourceSchema, observedAt }) });
}

export function createTraeFederatedWay({ evidenceRecordHash, runRefHash,
  sourceSchema, observedAt, ...binding } = {}) {
  return produce({ ...binding, observation: traeFederationObservation({
    evidenceRecordHash, runRefHash, sourceSchema, observedAt }) });
}

export function createProviderWayDescriptor(input) {
  return wayDescriptor(input);
}
