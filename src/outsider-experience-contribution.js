/*
 * Explicit, privacy-minimizing contribution gateway for sealed Stage 0.5 runs.
 *
 * This module deliberately separates three things that are easy to conflate:
 *   1. a locally verified delivery;
 *   2. a user-authorized research contribution; and
 *   3. admissible pricing / liability evidence.
 *
 * A contribution can establish (1) and (2). It is always quarantined on
 * ingress and never establishes (3) without later CURATE/adjudication.
 */

import {
  createHash, createPrivateKey, createPublicKey, generateKeyPairSync, randomBytes,
  randomUUID, sign as cryptoSign, verify as cryptoVerify,
} from "node:crypto";
import {
  existsSync, lstatSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync,
} from "node:fs";
import path from "node:path";
import { canonicalizeStrict } from "./canonical.js";
import {
  createAttestationV2, verifyAttestationV2, verifyStage05RunDirectory,
} from "./outsider-stage05-evidence.js";
import { verifySupervisedExperienceV2 } from "./outsider-supervised-experience.js";

export const CONTRIBUTION_SCHEMAS = Object.freeze({
  consent: "outsider/experience-contribution-consent/v1",
  record: "outsider/experience-contribution-record/v1",
  challenge: "outsider/experience-contribution-challenge/v1",
  envelope: "outsider/experience-contribution-envelope/v1",
  receipt: "outsider/experience-contribution-receipt/v1",
  revocation: "outsider/experience-contribution-revocation/v1",
  revocationReceipt: "outsider/experience-contribution-revocation-receipt/v1",
  registry: "outsider/experience-contribution-registry/v1",
});

export const CONTRIBUTION_POLICY_VERSION = "1.0.0";
export const CONTRIBUTION_PURPOSES = Object.freeze([
  "stage05-reliability",
  "supervisor-research",
  "routing-research",
]);

const HASH = /^sha256:[a-f0-9]{64}$/;
const TERMINALS = new Set(["SAFE_DELIVERY", "VERIFIED_DELIVERY_UNATTRIBUTED",
  "CONTROL_BOUNDARY_CONTAINMENT", "CONSERVATIVE_STOP", "UNFINALIZED"]);

function digest(value) {
  const input = Buffer.isBuffer(value) ? value
    : typeof value === "string" ? value : canonicalizeStrict(value);
  return `sha256:${createHash("sha256").update(input).digest("hex")}`;
}

function addressed(body, hashField) {
  canonicalizeStrict(body);
  return Object.freeze({ ...body, [hashField]: digest(body) });
}

function date(value, name) {
  const parsed = Date.parse(String(value ?? ""));
  if (!Number.isFinite(parsed)) throw new Error(`CONTRIBUTION_${name}_INVALID`);
  return new Date(parsed).toISOString();
}

function nowIso(now = new Date()) {
  return date(now instanceof Date ? now.toISOString() : now, "TIME");
}

function keyId(publicKeyPem) {
  const key = createPublicKey(publicKeyPem);
  return digest(key.export({ type: "spki", format: "der" }));
}

function signatureFor(hash, privateKeyPem) {
  const privateKey = createPrivateKey(privateKeyPem);
  const publicKey = createPublicKey(privateKey);
  const publicKeyPem = publicKey.export({ type: "spki", format: "pem" }).toString();
  return Object.freeze({
    algorithm: "Ed25519",
    keyId: keyId(publicKeyPem),
    publicKeyPem,
    value: cryptoSign(null, Buffer.from(hash), privateKey).toString("base64"),
  });
}

function verifySignature(hash, signature, expectedPublicKeyPem = null) {
  try {
    if (signature?.algorithm !== "Ed25519" || !signature.publicKeyPem
      || signature.keyId !== keyId(signature.publicKeyPem)) return false;
    if (expectedPublicKeyPem && keyId(expectedPublicKeyPem) !== signature.keyId) return false;
    return cryptoVerify(null, Buffer.from(hash), createPublicKey(signature.publicKeyPem),
      Buffer.from(signature.value, "base64"));
  } catch { return false; }
}

function signed(body, hashField, privateKeyPem) {
  const unsigned = { ...body, signature: null };
  const record = addressed(unsigned, hashField);
  return Object.freeze({ ...record, signature: signatureFor(record[hashField], privateKeyPem) });
}

function verifySigned(record, hashField, expectedPublicKeyPem = null) {
  if (!record || typeof record !== "object" || !HASH.test(String(record[hashField] ?? ""))) {
    return false;
  }
  const { [hashField]: actual, signature, ...body } = record;
  return actual === digest({ ...body, signature: null })
    && verifySignature(actual, signature, expectedPublicKeyPem);
}

function exactKeys(value, keys) {
  return value && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).sort().join("\0") === [...keys].sort().join("\0");
}

function clone(value) {
  return value == null ? null : structuredClone(value);
}

function countBy(values) {
  const unique = [...new Set(values)].sort();
  return Object.fromEntries(unique.map((value) => [value,
    values.filter((candidate) => candidate === value).length]));
}

const BOUNDED_TOKEN = /^[A-Za-z0-9][A-Za-z0-9._:+/-]{0,95}$/;
const UPPER_TOKEN = /^[A-Z][A-Z0-9_]{0,95}$/;
const LOWER_TOKEN = /^[a-z][a-z0-9_.:-]{0,63}$/;
const RETURN_CODE = /^(?:-?[0-9]{1,5}|unknown|null)$/;

function safeToken(value, pattern = BOUNDED_TOKEN, fallback = "unknown") {
  const text = String(value ?? "");
  return pattern.test(text) ? text : fallback;
}

function safeTokenList(values, pattern, { max = 512, fallback = null } = {}) {
  const output = [];
  for (const value of values ?? []) {
    const text = String(value ?? "");
    if (pattern.test(text)) output.push(text);
    else if (fallback != null) output.push(fallback);
    if (output.length >= max) break;
  }
  return output;
}

function safeCountMap(value, pattern) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter(([key, amount]) =>
    pattern.test(key) && Number.isInteger(amount) && amount >= 0)
    .sort(([left], [right]) => left.localeCompare(right)));
}

function boundedTree(value) {
  if (value == null || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value) && value >= 0;
  if (typeof value === "string") return BOUNDED_TOKEN.test(value);
  if (Array.isArray(value)) return value.length <= 512 && value.every(boundedTree);
  if (typeof value === "object") return Object.keys(value).length <= 512
    && Object.entries(value).every(([key, item]) => BOUNDED_TOKEN.test(key)
      && boundedTree(item));
  return false;
}

function contributionCapacity(host = {}) {
  const boundaries = host.toolBoundaries ?? {};
  const actors = host.actors ?? {};
  const controller = host.controller ?? {};
  const patrol = host.semanticPatrol ?? {};
  const judgment = host.semanticJudgment ?? {};
  const witness = host.externalEnduranceWitness;
  return {
    observedOnly: true,
    hostProtocol: safeToken(host.hostProtocol),
    eventDurationMs: Number.isFinite(host.eventDurationMs) ? host.eventDurationMs : null,
    toolBoundaries: {
      pre: Number(boundaries.pre ?? 0),
      post: Number(boundaries.post ?? 0),
      successfulPostWithExit: Number(boundaries.successfulPostWithExit ?? 0),
    },
    actors: {
      registered: Number(actors.registered ?? 0),
      teammateBindings: Number(actors.teammateBindings ?? 0),
      directDelegationsBound: Number(actors.directDelegationsBound ?? 0),
      delegationBindingChallenges: Number(actors.delegationBindingChallenges ?? 0),
      delegationBindingConflicts: Number(actors.delegationBindingConflicts ?? 0),
    },
    agentTeamCapabilities: safeCountMap(host.agentTeamCapabilities, BOUNDED_TOKEN),
    controller: {
      generations: Number(controller.generations ?? 0),
      recoveries: Number(controller.recoveries ?? 0),
    },
    semanticPatrol: {
      due: Number(patrol.due ?? 0), passed: Number(patrol.passed ?? 0),
      finished: Number(patrol.finished ?? 0),
      deferredPendingCorrectionEffect: Number(patrol.deferredPendingCorrectionEffect ?? 0),
    },
    semanticJudgment: {
      insufficient: Number(judgment.insufficient ?? 0),
      insufficiencyReclassifiedAsAdvisory:
        Number(judgment.insufficiencyReclassifiedAsAdvisory ?? 0),
      correctionAuditInsufficiencyReclassifiedAsAdvisory:
        Number(judgment.correctionAuditInsufficiencyReclassifiedAsAdvisory ?? 0),
    },
    enduranceWitness: witness ? {
      passed: witness.passed === true,
      checkpoints: Number(witness.checkpoints ?? 0),
      witnessedDurationMs: Number.isFinite(witness.witnessedDurationMs)
        ? witness.witnessedDurationMs : null,
      evaluationMode: witness.evaluationMode == null
        ? null : safeToken(witness.evaluationMode),
    } : null,
    capacityExhaustions: Number(host.capacityExhaustions ?? 0),
    unattendedInteractionAttempts: Number(host.unattendedInteractionAttempts ?? 0),
  };
}

/** Strictly project a local supervised record. Unknown/additional fields from
 * the local record are never copied, so raw content cannot hitchhike inside a
 * valid-looking contribution. */
export function createContributionRecord(experience) {
  const checked = verifySupervisedExperienceV2(experience);
  if (!checked.ok) throw new Error(`CONTRIBUTION_EXPERIENCE_INVALID:${checked.error}`);
  const terminal = experience.terminal ?? {};
  if (!TERMINALS.has(terminal.terminalClass)) {
    throw new Error("CONTRIBUTION_TERMINAL_CLASS_INVALID");
  }
  const riskClasses = (experience.riskEvents ?? []).map((risk) => String(risk.riskClass ?? ""))
    .filter((value) => /^[A-Z][A-Z0-9_]{0,95}$/.test(value));
  const chains = experience.causalChains ?? [];
  const input = experience.modelInput ?? {};
  const verified = input.verified ?? {};
  const body = {
    schema: CONTRIBUTION_SCHEMAS.record,
    schemaVersion: "1.0.0",
    source: {
      supervisedExperienceHash: experience.recordHash,
      observedAt: experience.source.observedAt ?? null,
      manifestHash: experience.source.manifestHash,
      projectionHash: experience.source.projectionHash,
      publicEvidenceHash: experience.source.publicEvidenceHash,
      eventChainHash: experience.source.eventChainHash,
      eventCount: Number(experience.source.eventCount),
    },
    instrument: clone(experience.attestationCompatibility.groupKey),
    evaluation: {
      gatesObserved: [...new Set(safeTokenList(
        experience.evaluationContext?.gatesObserved, /^R[1-5]$/, { max: 5 }))].sort(),
      gatePassClaimed: false,
      invalidated: experience.evaluationValidity?.invalidated === true,
      invalidationClasses: countBy((experience.evaluationValidity?.invalidations ?? [])
        .map((entry) => safeToken(entry.riskClass ?? entry.code, UPPER_TOKEN,
          "INVALIDATION"))),
    },
    terminal: {
      terminalClass: terminal.terminalClass,
      proofComplete: terminal.proofComplete === true,
      deliveryComplete: terminal.deliveryComplete === true,
      interventionRequired: terminal.interventionRequired === true,
      interventionComplete: terminal.interventionComplete === true,
      containmentComplete: terminal.containmentComplete === true,
    },
    learningLabels: {
      deliveryResolved: experience.learningLabels.deliveryResolved === true,
      outsiderCausalContribution:
        experience.learningLabels.outsiderCausalContribution === true,
      eligibleForCorrectionEffectLearning:
        experience.learningLabels.eligibleForCorrectionEffectLearning === true,
      causalAttributionClass: experience.learningLabels.causalAttributionClass,
    },
    risk: {
      observedOnly: true,
      establishesLossOrLiability: false,
      eventCount: riskClasses.length,
      classes: countBy(riskClasses),
    },
    causal: {
      interventionsObserved: chains.length,
      sealedComplete: chains.filter((chain) => chain.sealedComplete === true).length,
      ordered: chains.filter((chain) => chain.ordered === true).length,
      authorityHashCount: new Set(chains.flatMap((chain) => chain.authorityHashes ?? [])).size,
    },
    capacity: contributionCapacity(experience.hostCapacity),
    modelFeatures: {
      features: {
        nSteps: Number(input.features?.nSteps ?? 0),
        costUsd: Number.isFinite(input.features?.costUsd) ? input.features.costUsd : null,
      },
      labels: {
        fakedSuccess: input.labels?.fakedSuccess === true,
        neededCorrection: input.labels?.neededCorrection === true,
        escalated: input.labels?.escalated === true,
        gatedIrreversible: input.labels?.gatedIrreversible === true,
        correctionSucceeded: input.labels?.correctionSucceeded === true,
      },
      signalsSeen: [...new Set(safeTokenList(input.signalsSeen, UPPER_TOKEN,
        { max: 512 }))].sort(),
      trajectory: {
        verbSequence: safeTokenList(input.trajectory?.verbSequence, LOWER_TOKEN,
          { max: 4096, fallback: "other" }),
        returnCodes: safeCountMap(input.trajectory?.returnCodes, RETURN_CODE),
        steps: Number(input.trajectory?.steps ?? 0),
      },
      verified: {
        deliveryResolved: verified.deliveryResolved === true,
        interventionRequired: verified.interventionRequired === true,
        interventionComplete: verified.interventionComplete === true,
        outsiderCausalContribution: verified.outsiderCausalContribution === true,
        eligibleForCorrectionEffectLearning:
          verified.eligibleForCorrectionEffectLearning === true,
        causalAttributionClass: verified.causalAttributionClass,
        terminalClass: verified.terminalClass,
      },
    },
    disclosure: {
      rawContentIncluded: false,
      excluded: ["source-code", "prompt", "transcript", "path", "command-output",
        "credentials", "raw-event-stream"],
      authority: "none",
      permitsPricing: false,
      permitsGuarantee: false,
      permitsSettlement: false,
      establishesLossOrLiability: false,
    },
  };
  const record = addressed(body, "recordHash");
  const verifiedRecord = verifyContributionRecord(record);
  if (!verifiedRecord.ok) {
    throw new Error(`CONTRIBUTION_PROJECTION_INVALID:${verifiedRecord.error}`);
  }
  return record;
}

export function verifyContributionRecord(record) {
  try {
    const { recordHash, ...body } = record ?? {};
    if (record?.schema !== CONTRIBUTION_SCHEMAS.record || record.schemaVersion !== "1.0.0"
      || recordHash !== digest(body)) throw new Error("CONTRIBUTION_RECORD_HASH_INVALID");
    if (!exactKeys(record, ["schema", "schemaVersion", "source", "instrument", "evaluation",
      "terminal", "learningLabels", "risk", "causal", "capacity", "modelFeatures",
      "disclosure", "recordHash"])) throw new Error("CONTRIBUTION_RECORD_FIELDS_INVALID");
    const exactShapes = [
      [record.source, ["supervisedExperienceHash", "observedAt", "manifestHash",
        "projectionHash", "publicEvidenceHash", "eventChainHash", "eventCount"]],
      [record.instrument, ["extractorId", "productVersion", "controllerImplementationHash",
        "hostProtocol", "wayHash", "claimRefHash", "worldRefHash", "authorityRefHash"]],
      [record.evaluation, ["gatesObserved", "gatePassClaimed", "invalidated",
        "invalidationClasses"]],
      [record.terminal, ["terminalClass", "proofComplete", "deliveryComplete",
        "interventionRequired", "interventionComplete", "containmentComplete"]],
      [record.learningLabels, ["deliveryResolved", "outsiderCausalContribution",
        "eligibleForCorrectionEffectLearning", "causalAttributionClass"]],
      [record.risk, ["observedOnly", "establishesLossOrLiability", "eventCount", "classes"]],
      [record.causal, ["interventionsObserved", "sealedComplete", "ordered",
        "authorityHashCount"]],
      [record.capacity, ["observedOnly", "hostProtocol", "eventDurationMs",
        "toolBoundaries", "actors", "agentTeamCapabilities", "controller",
        "semanticPatrol", "semanticJudgment", "enduranceWitness", "capacityExhaustions",
        "unattendedInteractionAttempts"]],
      [record.capacity?.toolBoundaries, ["pre", "post", "successfulPostWithExit"]],
      [record.capacity?.actors, ["registered", "teammateBindings", "directDelegationsBound",
        "delegationBindingChallenges", "delegationBindingConflicts"]],
      [record.capacity?.controller, ["generations", "recoveries"]],
      [record.capacity?.semanticPatrol, ["due", "passed", "finished",
        "deferredPendingCorrectionEffect"]],
      [record.capacity?.semanticJudgment, ["insufficient",
        "insufficiencyReclassifiedAsAdvisory",
        "correctionAuditInsufficiencyReclassifiedAsAdvisory"]],
      [record.modelFeatures, ["features", "labels", "signalsSeen", "trajectory", "verified"]],
      [record.modelFeatures?.features, ["nSteps", "costUsd"]],
      [record.modelFeatures?.labels, ["fakedSuccess", "neededCorrection", "escalated",
        "gatedIrreversible", "correctionSucceeded"]],
      [record.modelFeatures?.trajectory, ["verbSequence", "returnCodes", "steps"]],
      [record.modelFeatures?.verified, ["deliveryResolved", "interventionRequired",
        "interventionComplete", "outsiderCausalContribution",
        "eligibleForCorrectionEffectLearning", "causalAttributionClass", "terminalClass"]],
      [record.disclosure, ["rawContentIncluded", "excluded", "authority", "permitsPricing",
        "permitsGuarantee", "permitsSettlement", "establishesLossOrLiability"]],
    ];
    if (exactShapes.some(([value, keys]) => !exactKeys(value, keys))) {
      throw new Error("CONTRIBUTION_RECORD_NESTED_FIELDS_INVALID");
    }
    if (record.capacity.enduranceWitness != null
      && !exactKeys(record.capacity.enduranceWitness,
        ["passed", "checkpoints", "witnessedDurationMs", "evaluationMode"])) {
      throw new Error("CONTRIBUTION_RECORD_WITNESS_FIELDS_INVALID");
    }
    if (!HASH.test(record.source?.supervisedExperienceHash)
      || !HASH.test(record.source?.manifestHash) || !HASH.test(record.source?.projectionHash)
      || !HASH.test(record.source?.publicEvidenceHash)
      || !HASH.test(record.source?.eventChainHash)) throw new Error("CONTRIBUTION_SOURCE_INVALID");
    if (!TERMINALS.has(record.terminal?.terminalClass)
      || record.disclosure?.rawContentIncluded !== false
      || record.disclosure?.authority !== "none"
      || record.disclosure?.permitsPricing !== false
      || record.disclosure?.permitsGuarantee !== false
      || record.disclosure?.permitsSettlement !== false
      || record.disclosure?.establishesLossOrLiability !== false
      || record.risk?.observedOnly !== true
      || record.risk?.establishesLossOrLiability !== false) {
      throw new Error("CONTRIBUTION_AUTHORITY_BOUNDARY_INVALID");
    }
    const instrumentHashes = ["controllerImplementationHash", "wayHash", "claimRefHash",
      "worldRefHash", "authorityRefHash"];
    if (!BOUNDED_TOKEN.test(String(record.instrument.extractorId ?? ""))
      || !BOUNDED_TOKEN.test(String(record.instrument.productVersion ?? ""))
      || !BOUNDED_TOKEN.test(String(record.instrument.hostProtocol ?? ""))
      || instrumentHashes.some((field) => !HASH.test(String(record.instrument[field] ?? "")))
      || !Array.isArray(record.evaluation.gatesObserved)
      || record.evaluation.gatesObserved.some((value) => !/^R[1-5]$/.test(value))
      || !boundedTree(record.evaluation.invalidationClasses)
      || !boundedTree(record.risk.classes)
      || !boundedTree(record.capacity)
      || !Array.isArray(record.modelFeatures.signalsSeen)
      || record.modelFeatures.signalsSeen.some((value) => !UPPER_TOKEN.test(value))
      || !Array.isArray(record.modelFeatures.trajectory.verbSequence)
      || record.modelFeatures.trajectory.verbSequence.length > 4096
      || record.modelFeatures.trajectory.verbSequence.some((value) => !LOWER_TOKEN.test(value))
      || Object.keys(record.modelFeatures.trajectory.returnCodes ?? {})
        .some((value) => !RETURN_CODE.test(value))
      || !boundedTree(record.modelFeatures.trajectory.returnCodes)
      || canonicalizeStrict(record.disclosure.excluded)
        !== canonicalizeStrict(["source-code", "prompt", "transcript", "path",
          "command-output", "credentials", "raw-event-stream"])) {
      throw new Error("CONTRIBUTION_BOUNDED_VALUES_INVALID");
    }
    if (record.learningLabels?.eligibleForCorrectionEffectLearning
      !== record.learningLabels?.outsiderCausalContribution) {
      throw new Error("CONTRIBUTION_CAUSAL_LABEL_INVALID");
    }
    return Object.freeze({ ok: true, recordHash });
  } catch (error) {
    return Object.freeze({ ok: false, error: error?.message ?? String(error) });
  }
}

function normalizePurposes(purposes) {
  const values = [...new Set((purposes ?? []).map(String))].sort();
  if (!values.length || values.some((value) => !CONTRIBUTION_PURPOSES.includes(value))) {
    throw new Error("CONTRIBUTION_PURPOSES_INVALID");
  }
  return values;
}

function validateEndpoint(endpoint) {
  let parsed;
  try { parsed = new URL(endpoint); } catch { throw new Error("CONTRIBUTION_ENDPOINT_INVALID"); }
  const local = ["localhost", "127.0.0.1", "::1"].includes(parsed.hostname);
  if (parsed.protocol !== "https:" && !(local && parsed.protocol === "http:")) {
    throw new Error("CONTRIBUTION_ENDPOINT_HTTPS_REQUIRED");
  }
  return parsed.toString().replace(/\/$/, "");
}

export function createContributionConsent({ endpoint, deviceKeyId, purposes,
  retentionDays = 365, grantedAt = new Date(), consentId = randomUUID() } = {}) {
  if (!HASH.test(String(deviceKeyId ?? ""))) throw new Error("CONTRIBUTION_DEVICE_KEY_INVALID");
  if (!Number.isInteger(Number(retentionDays)) || Number(retentionDays) < 1
    || Number(retentionDays) > 730) throw new Error("CONTRIBUTION_RETENTION_INVALID");
  const body = {
    schema: CONTRIBUTION_SCHEMAS.consent,
    policyVersion: CONTRIBUTION_POLICY_VERSION,
    consentId: String(consentId),
    status: "ENABLED",
    endpoint: validateEndpoint(endpoint),
    deviceKeyId,
    purposes: normalizePurposes(purposes),
    dataClasses: ["CONTRIBUTION_RECORD_V1", "ATTESTATION_V2"],
    rawContentAllowed: false,
    automaticUpload: false,
    explicitSendOnly: true,
    retentionDays: Number(retentionDays),
    grantedAt: nowIso(grantedAt),
  };
  return addressed(body, "consentHash");
}

export function verifyContributionConsent(consent) {
  try {
    const { consentHash, ...body } = consent ?? {};
    if (consent?.schema !== CONTRIBUTION_SCHEMAS.consent
      || consent.policyVersion !== CONTRIBUTION_POLICY_VERSION
      || consent.status !== "ENABLED" || consentHash !== digest(body)
      || consent.rawContentAllowed !== false || consent.automaticUpload !== false
      || consent.explicitSendOnly !== true || !HASH.test(consent.deviceKeyId)) {
      throw new Error("CONTRIBUTION_CONSENT_INVALID");
    }
    validateEndpoint(consent.endpoint);
    normalizePurposes(consent.purposes);
    date(consent.grantedAt, "CONSENT_TIME");
    return Object.freeze({ ok: true, consentHash });
  } catch (error) {
    return Object.freeze({ ok: false, error: error?.message ?? String(error) });
  }
}

export function createContributionChallenge({ deviceKeyId, experienceRecordHash,
  audience, privateKeyPem, issuedAt = new Date(), ttlMs = 5 * 60_000,
  nonce = randomBytes(24).toString("base64url") } = {}) {
  if (!HASH.test(deviceKeyId) || !HASH.test(experienceRecordHash)
    || !privateKeyPem || !(ttlMs >= 10_000 && ttlMs <= 60 * 60_000)) {
    throw new Error("CONTRIBUTION_CHALLENGE_INPUT_INVALID");
  }
  const start = new Date(nowIso(issuedAt));
  const body = {
    schema: CONTRIBUTION_SCHEMAS.challenge,
    challengeId: randomUUID(), nonce, audience: validateEndpoint(audience),
    deviceKeyId, experienceRecordHash,
    issuedAt: start.toISOString(), expiresAt: new Date(start.getTime() + ttlMs).toISOString(),
  };
  return signed(body, "challengeHash", privateKeyPem);
}

export function verifyContributionChallenge(challenge, { serverPublicKeyPem = null,
  now = new Date(), expectedAudience = null } = {}) {
  try {
    if (challenge?.schema !== CONTRIBUTION_SCHEMAS.challenge
      || !verifySigned(challenge, "challengeHash", serverPublicKeyPem)
      || !HASH.test(challenge.deviceKeyId) || !HASH.test(challenge.experienceRecordHash)) {
      throw new Error("CONTRIBUTION_CHALLENGE_INVALID");
    }
    if (expectedAudience && validateEndpoint(challenge.audience)
      !== validateEndpoint(expectedAudience)) throw new Error("CONTRIBUTION_AUDIENCE_MISMATCH");
    const nowMs = Date.parse(nowIso(now));
    const issued = Date.parse(date(challenge.issuedAt, "CHALLENGE_ISSUED"));
    const expires = Date.parse(date(challenge.expiresAt, "CHALLENGE_EXPIRES"));
    if (nowMs < issued - 60_000 || nowMs > expires || expires <= issued) {
      throw new Error("CONTRIBUTION_CHALLENGE_EXPIRED");
    }
    return Object.freeze({ ok: true, challengeHash: challenge.challengeHash });
  } catch (error) {
    return Object.freeze({ ok: false, error: error?.message ?? String(error) });
  }
}

function verifyContributionAttestation(attestation, contributionRecord, deviceKeyId) {
  const checked = verifyAttestationV2(attestation);
  if (!checked.ok || !checked.signed || attestation.signature?.keyId !== deviceKeyId
    || !exactKeys(attestation, ["artifactType", "authority", "evidenceClass", "groupKey",
      "included", "duplicates", "nUnique", "outcomes", "correlation", "validityDomain",
      "commitment", "signature", "attestationHash"])
    || attestation.artifactType !== "outsider_attestation_v2"
    || attestation.authority !== "none" || attestation.nUnique !== 1
    || !Array.isArray(attestation.included) || attestation.included.length !== 1
    || !Array.isArray(attestation.duplicates) || attestation.duplicates.length !== 0
    || !exactKeys(attestation.groupKey, ["extractorId", "productVersion",
      "controllerImplementationHash", "hostProtocol", "wayHash", "claimRefHash",
      "worldRefHash", "authorityRefHash"])
    || !exactKeys(attestation.included[0], ["runId", "manifestHash", "projectionHash",
      "supervisedExperienceHash", "evidenceRoot", "terminalClass", "proofComplete",
      "deliveryComplete", "interventionRequired", "interventionComplete"])
    || !exactKeys(attestation.outcomes, ["SAFE_DELIVERY", "VERIFIED_DELIVERY_UNATTRIBUTED",
      "CONTROL_BOUNDARY_CONTAINMENT", "CONSERVATIVE_STOP", "UNFINALIZED"])
    || !exactKeys(attestation.correlation, ["independenceClaimed", "correlationRoots"])
    || !exactKeys(attestation.validityDomain,
      ["claimMode", "worldMode", "generalizesBeyondIncludedEvidence"])
    || !exactKeys(attestation.signature,
      ["algorithm", "keyId", "publicKeyPem", "value"])) return false;
  const included = attestation.included[0];
  return included.supervisedExperienceHash
      === contributionRecord.source.supervisedExperienceHash
    && included.manifestHash === contributionRecord.source.manifestHash
    && included.projectionHash === contributionRecord.source.projectionHash
    && canonicalizeStrict(attestation.groupKey)
      === canonicalizeStrict(contributionRecord.instrument)
    && attestation.correlation.independenceClaimed === false
    && attestation.validityDomain.generalizesBeyondIncludedEvidence === false;
}

export function createContributionEnvelope({ contributionRecord, attestation, consent,
  challenge, devicePrivateKeyPem, createdAt = new Date() } = {}) {
  const recordCheck = verifyContributionRecord(contributionRecord);
  const attestCheck = verifyAttestationV2(attestation);
  const consentCheck = verifyContributionConsent(consent);
  const challengeCheck = verifyContributionChallenge(challenge, {
    expectedAudience: consent?.endpoint, now: createdAt,
  });
  if (!recordCheck.ok || !attestCheck.ok || !attestCheck.signed || !consentCheck.ok
    || !challengeCheck.ok) throw new Error("CONTRIBUTION_ENVELOPE_INPUT_INVALID");
  const devicePublicKeyPem = createPublicKey(createPrivateKey(devicePrivateKeyPem))
    .export({ type: "spki", format: "pem" }).toString();
  if (keyId(devicePublicKeyPem) !== consent.deviceKeyId
    || attestation.signature?.keyId !== consent.deviceKeyId
    || challenge.deviceKeyId !== consent.deviceKeyId
    || challenge.experienceRecordHash !== contributionRecord.recordHash) {
    throw new Error("CONTRIBUTION_ENVELOPE_IDENTITY_MISMATCH");
  }
  if (!verifyContributionAttestation(attestation, contributionRecord, consent.deviceKeyId)) {
    throw new Error("CONTRIBUTION_ATTESTATION_BINDING_MISMATCH");
  }
  const body = {
    schema: CONTRIBUTION_SCHEMAS.envelope,
    envelopeVersion: "1.0.0",
    submissionId: randomUUID(),
    createdAt: nowIso(createdAt),
    audience: consent.endpoint,
    device: { keyId: consent.deviceKeyId, publicKeyPem: devicePublicKeyPem },
    consent: {
      consentHash: consent.consentHash, policyVersion: consent.policyVersion,
      purposes: consent.purposes, rawContentAllowed: false,
      retentionDays: consent.retentionDays, grantedAt: consent.grantedAt,
    },
    challenge: {
      challengeId: challenge.challengeId, challengeHash: challenge.challengeHash,
      nonce: challenge.nonce, expiresAt: challenge.expiresAt,
    },
    evidenceLevelClaimed: "L2_SEALED_STAGE05_SELF_ATTESTED",
    contributionRecord,
    attestation,
    authority: {
      mode: "none", establishesLossOrLiability: false,
      permitsPricing: false, permitsGuarantee: false, permitsSettlement: false,
    },
  };
  return signed(body, "envelopeHash", devicePrivateKeyPem);
}

export function verifyContributionEnvelope(envelope, { challenge = null,
  serverPublicKeyPem = null, now = new Date(), expectedAudience = null } = {}) {
  try {
    if (envelope?.schema !== CONTRIBUTION_SCHEMAS.envelope
      || envelope.envelopeVersion !== "1.0.0"
      || !exactKeys(envelope, ["schema", "envelopeVersion", "submissionId", "createdAt",
        "audience", "device", "consent", "challenge", "evidenceLevelClaimed",
        "contributionRecord", "attestation", "authority", "signature", "envelopeHash"])
      || !exactKeys(envelope.device, ["keyId", "publicKeyPem"])
      || !exactKeys(envelope.consent, ["consentHash", "policyVersion", "purposes",
        "rawContentAllowed", "retentionDays", "grantedAt"])
      || !exactKeys(envelope.challenge,
        ["challengeId", "challengeHash", "nonce", "expiresAt"])
      || !exactKeys(envelope.authority, ["mode", "establishesLossOrLiability",
        "permitsPricing", "permitsGuarantee", "permitsSettlement"])
      || envelope.evidenceLevelClaimed !== "L2_SEALED_STAGE05_SELF_ATTESTED"
      || !verifySigned(envelope, "envelopeHash", envelope.device?.publicKeyPem)
      || envelope.signature?.keyId !== envelope.device?.keyId
      || envelope.authority?.mode !== "none"
      || envelope.authority?.establishesLossOrLiability !== false
      || envelope.authority?.permitsPricing !== false
      || envelope.authority?.permitsGuarantee !== false
      || envelope.authority?.permitsSettlement !== false
      || envelope.consent?.rawContentAllowed !== false
      || envelope.consent?.policyVersion !== CONTRIBUTION_POLICY_VERSION
      || !HASH.test(String(envelope.consent?.consentHash ?? ""))
      || !Number.isInteger(Number(envelope.consent?.retentionDays))
      || Number(envelope.consent.retentionDays) < 1
      || Number(envelope.consent.retentionDays) > 730) {
      throw new Error("CONTRIBUTION_ENVELOPE_INVALID");
    }
    const recordCheck = verifyContributionRecord(envelope.contributionRecord);
    if (!recordCheck.ok || !verifyContributionAttestation(envelope.attestation,
      envelope.contributionRecord, envelope.device.keyId)) {
      throw new Error("CONTRIBUTION_EVIDENCE_INVALID");
    }
    const purposes = normalizePurposes(envelope.consent.purposes);
    if (canonicalizeStrict(purposes) !== canonicalizeStrict(envelope.consent.purposes)) {
      throw new Error("CONTRIBUTION_PURPOSES_NOT_CANONICAL");
    }
    if (challenge) {
      const challengeCheck = verifyContributionChallenge(challenge,
        { serverPublicKeyPem, now, expectedAudience });
      if (!challengeCheck.ok || challenge.challengeId !== envelope.challenge?.challengeId
        || challenge.challengeHash !== envelope.challenge?.challengeHash
        || challenge.nonce !== envelope.challenge?.nonce
        || challenge.deviceKeyId !== envelope.device.keyId
        || challenge.experienceRecordHash !== envelope.contributionRecord.recordHash) {
        throw new Error("CONTRIBUTION_CHALLENGE_BINDING_INVALID");
      }
    }
    if (expectedAudience && validateEndpoint(envelope.audience)
      !== validateEndpoint(expectedAudience)) throw new Error("CONTRIBUTION_AUDIENCE_MISMATCH");
    const createdAt = Date.parse(date(envelope.createdAt, "CREATED_AT"));
    date(envelope.consent.grantedAt, "CONSENT_GRANTED_AT");
    if (challenge && (createdAt < Date.parse(challenge.issuedAt)
      || createdAt > Date.parse(challenge.expiresAt))) {
      throw new Error("CONTRIBUTION_CREATED_OUTSIDE_CHALLENGE");
    }
    return Object.freeze({ ok: true, envelopeHash: envelope.envelopeHash,
      recordHash: envelope.contributionRecord.recordHash });
  } catch (error) {
    return Object.freeze({ ok: false, error: error?.message ?? String(error) });
  }
}

function atomicJson(file, value) {
  mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  if (existsSync(file) && lstatSync(file).isSymbolicLink()) {
    throw new Error("CONTRIBUTION_SYMLINK_REFUSED");
  }
  const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  renameSync(temporary, file);
}

function readJson(file) {
  if (lstatSync(file).isSymbolicLink()) throw new Error("CONTRIBUTION_SYMLINK_REFUSED");
  return JSON.parse(readFileSync(file, "utf8"));
}

function hashFile(directory, folder, hash) {
  if (!HASH.test(String(hash ?? ""))) throw new Error("CONTRIBUTION_HASH_INVALID");
  return path.join(directory, folder, `${hash.slice("sha256:".length)}.json`);
}

function nonceFile(directory, nonce) {
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(String(nonce ?? ""))) {
    throw new Error("CONTRIBUTION_NONCE_INVALID");
  }
  return path.join(directory, "challenges", `${nonce}.json`);
}

function registryBody({ registryId, serverKeyId, acceptedInstrumentHashes, entries }) {
  const head = entries.at(-1)?.entryHash ?? digest("outsider/contribution-registry/genesis/v1");
  return {
    schema: CONTRIBUTION_SCHEMAS.registry, registryId, serverKeyId,
    acceptedInstrumentHashes: [...acceptedInstrumentHashes].sort(),
    entries, head, count: entries.length,
    authority: { mode: "none", permitsPricing: false, permitsGuarantee: false,
      permitsSettlement: false, movesFunds: false },
  };
}

export function createContributionReceipt({ envelope, evidenceLevel, reasons, receivedAt, retentionUntil,
  privateKeyPem, registryId }) {
  return signed({
    schema: CONTRIBUTION_SCHEMAS.receipt,
    receiptId: randomUUID(), registryId,
    submissionId: envelope.submissionId,
    envelopeHash: envelope.envelopeHash,
    contributionRecordHash: envelope.contributionRecord.recordHash,
    supervisedExperienceHash: envelope.contributionRecord.source.supervisedExperienceHash,
    consentHash: envelope.consent.consentHash,
    contributorKeyId: envelope.device.keyId,
    receivedAt, retentionUntil,
    disposition: "QUARANTINED",
    evidenceLevel,
    reasonCodes: reasons,
    eligibleFor: {
      reliabilityResearch: false,
      supervisorResearch: false,
      routingResearch: false,
      correctionEffectLearning: false,
      pricing: false, guarantee: false, settlement: false,
    },
    authority: "none",
  }, "receiptHash", privateKeyPem);
}

export function verifyContributionReceipt(receipt, { serverPublicKeyPem = null } = {}) {
  try {
    if (receipt?.schema !== CONTRIBUTION_SCHEMAS.receipt
      || receipt.disposition !== "QUARANTINED"
      || !verifySigned(receipt, "receiptHash", serverPublicKeyPem)
      || receipt.eligibleFor?.pricing !== false || receipt.eligibleFor?.guarantee !== false
      || receipt.eligibleFor?.settlement !== false || receipt.authority !== "none") {
      throw new Error("CONTRIBUTION_RECEIPT_INVALID");
    }
    return Object.freeze({ ok: true, receiptHash: receipt.receiptHash });
  } catch (error) {
    return Object.freeze({ ok: false, error: error?.message ?? String(error) });
  }
}

/** Durable ingress registry. It validates transport identity and deterministic
 * evidence shape, then quarantines. It is intentionally not CURATE or PRICE. */
export class ExperienceContributionRegistry {
  constructor({ directory, privateKeyPem, registryId = "outsider-contributions",
    audience, acceptedInstrumentHashes = [] } = {}) {
    if (!directory || !privateKeyPem || !audience) {
      throw new Error("CONTRIBUTION_REGISTRY_INPUT_REQUIRED");
    }
    this.directory = path.resolve(directory);
    this.privateKeyPem = privateKeyPem;
    this.publicKeyPem = createPublicKey(createPrivateKey(privateKeyPem))
      .export({ type: "spki", format: "pem" }).toString();
    this.serverKeyId = keyId(this.publicKeyPem);
    this.registryId = String(registryId);
    this.audience = validateEndpoint(audience);
    this.acceptedInstrumentHashes = new Set(acceptedInstrumentHashes);
    for (const value of this.acceptedInstrumentHashes) {
      if (!HASH.test(value)) throw new Error("CONTRIBUTION_INSTRUMENT_HASH_INVALID");
    }
    for (const folder of ["challenges", "contributions", "receipts", "revocations"]) {
      mkdirSync(path.join(this.directory, folder), { recursive: true, mode: 0o700 });
    }
    this.registryFile = path.join(this.directory, "contribution-registry.json");
    if (existsSync(this.registryFile)) this.#restore(readJson(this.registryFile));
    else {
      this.entries = [];
      atomicJson(this.registryFile, addressed(registryBody(this), "registryHash"));
    }
  }

  serverInfo() {
    return Object.freeze({ schema: "outsider/experience-contribution-server/v1",
      registryId: this.registryId, audience: this.audience,
      serverKeyId: this.serverKeyId, serverPublicKeyPem: this.publicKeyPem,
      policyVersion: CONTRIBUTION_POLICY_VERSION,
      acceptedPurposes: CONTRIBUTION_PURPOSES, defaultDisposition: "QUARANTINED",
      permitsPricing: false, permitsGuarantee: false, permitsSettlement: false });
  }

  #restore(record) {
    const { registryHash, ...body } = record ?? {};
    if (registryHash !== digest(body) || body.schema !== CONTRIBUTION_SCHEMAS.registry
      || body.registryId !== this.registryId || body.serverKeyId !== this.serverKeyId
      || canonicalizeStrict(body.acceptedInstrumentHashes)
        !== canonicalizeStrict([...this.acceptedInstrumentHashes].sort())
      || !Array.isArray(body.entries) || body.count !== body.entries.length) {
      throw new Error("CONTRIBUTION_REGISTRY_INVALID");
    }
    let previous = digest("outsider/contribution-registry/genesis/v1");
    for (let index = 0; index < body.entries.length; index += 1) {
      const entry = body.entries[index];
      const { entryHash, ...entryBody } = entry;
      if (entry.ordinal !== index + 1 || entry.previousEntryHash !== previous
        || entryHash !== digest(entryBody)) throw new Error("CONTRIBUTION_REGISTRY_CHAIN_INVALID");
      const envelope = readJson(hashFile(this.directory, "contributions", entry.recordHash));
      const receipt = readJson(hashFile(this.directory, "receipts", entry.receiptHash));
      const challengeState = readJson(nonceFile(this.directory, envelope.challenge?.nonce));
      if (envelope.envelopeHash !== entry.envelopeHash
        || envelope.contributionRecord.recordHash !== entry.recordHash
        || challengeState.usedAt == null
        || challengeState.envelopeHash !== envelope.envelopeHash
        || !verifyContributionEnvelope(envelope, { challenge: challengeState.challenge,
          serverPublicKeyPem: this.publicKeyPem,
          expectedAudience: this.audience, now: challengeState.usedAt }).ok
        || receipt.receiptHash !== entry.receiptHash
        || !verifyContributionReceipt(receipt, { serverPublicKeyPem: this.publicKeyPem }).ok) {
        throw new Error("CONTRIBUTION_REGISTRY_ARTIFACT_INVALID");
      }
      previous = entryHash;
    }
    if (body.head !== previous) throw new Error("CONTRIBUTION_REGISTRY_HEAD_INVALID");
    this.entries = body.entries;
  }

  issueChallenge({ deviceKeyId, experienceRecordHash, now = new Date() } = {}) {
    const challenge = createContributionChallenge({ deviceKeyId, experienceRecordHash,
      audience: this.audience, privateKeyPem: this.privateKeyPem, issuedAt: now });
    atomicJson(nonceFile(this.directory, challenge.nonce), { challenge, usedAt: null });
    return challenge;
  }

  ingest(envelope, { now = new Date() } = {}) {
    const challengePath = nonceFile(this.directory, envelope?.challenge?.nonce);
    if (!existsSync(challengePath)) throw new Error("CONTRIBUTION_CHALLENGE_NOT_FOUND");
    const challengeState = readJson(challengePath);
    if (challengeState.usedAt) throw new Error("CONTRIBUTION_CHALLENGE_ALREADY_USED");
    const receivedAt = nowIso(now);
    const checked = verifyContributionEnvelope(envelope, {
      challenge: challengeState.challenge, serverPublicKeyPem: this.publicKeyPem,
      now, expectedAudience: this.audience,
    });
    if (!checked.ok) throw new Error(`CONTRIBUTION_INGRESS_INVALID:${checked.error}`);
    atomicJson(challengePath, { ...challengeState, usedAt: receivedAt,
      envelopeHash: envelope.envelopeHash });
    const recordHash = envelope.contributionRecord.recordHash;
    const prior = this.entries.find((entry) => entry.recordHash === recordHash);
    if (prior) {
      const receipt = readJson(hashFile(this.directory, "receipts", prior.receiptHash));
      return Object.freeze({ appended: false, duplicate: true, receipt });
    }
    const instrumentHash = envelope.contributionRecord.instrument?.controllerImplementationHash;
    const recognized = this.acceptedInstrumentHashes.has(instrumentHash);
    const evidenceLevel = recognized
      ? "L2_RECOGNIZED_INSTRUMENT_SELF_ATTESTED"
      : "L1_UNRECOGNIZED_INSTRUMENT_SELF_ATTESTED";
    const reasons = ["PENDING_CURATE_REVIEW", "CORRELATION_NOT_YET_DISCOUNTED",
      "OWNER_CONFIRMATION_ABSENT", "EXTERNAL_ADJUDICATION_ABSENT"];
    if (!recognized) reasons.push("INSTRUMENT_NOT_IN_SERVER_ALLOWLIST");
    const retentionUntil = new Date(Date.parse(receivedAt)
      + Number(envelope.consent.retentionDays) * 86_400_000).toISOString();
    const receipt = createContributionReceipt({ envelope, evidenceLevel, reasons, receivedAt,
      retentionUntil, privateKeyPem: this.privateKeyPem, registryId: this.registryId });
    const previousEntryHash = this.entries.at(-1)?.entryHash
      ?? digest("outsider/contribution-registry/genesis/v1");
    const entryBody = { ordinal: this.entries.length + 1, recordHash,
      envelopeHash: envelope.envelopeHash, receiptHash: receipt.receiptHash,
      contributorKeyId: envelope.device.keyId, consentHash: envelope.consent.consentHash,
      receivedAt, evidenceLevel, disposition: "QUARANTINED", previousEntryHash };
    const entry = addressed(entryBody, "entryHash");
    atomicJson(hashFile(this.directory, "contributions", recordHash), envelope);
    atomicJson(hashFile(this.directory, "receipts", receipt.receiptHash), receipt);
    this.entries = [...this.entries, entry];
    atomicJson(this.registryFile, addressed(registryBody(this), "registryHash"));
    return Object.freeze({ appended: true, duplicate: false, receipt });
  }

  verify() {
    try {
      const reopened = new ExperienceContributionRegistry({ directory: this.directory,
        privateKeyPem: this.privateKeyPem, registryId: this.registryId,
        audience: this.audience,
        acceptedInstrumentHashes: [...this.acceptedInstrumentHashes] });
      return Object.freeze({ ok: true, count: reopened.entries.length,
        head: reopened.entries.at(-1)?.entryHash ?? null });
    } catch (error) {
      return Object.freeze({ ok: false, error: error?.message ?? String(error) });
    }
  }
}

export function shareDirectoryForStateRoot(stateRoot) {
  return path.join(path.dirname(path.resolve(stateRoot)), "share");
}

export function initializeShareDirectory({ directory, endpoint, serverPublicKeyPem,
  purposes = CONTRIBUTION_PURPOSES, retentionDays = 365, now = new Date() } = {}) {
  if (!directory || !serverPublicKeyPem) throw new Error("CONTRIBUTION_SHARE_SETUP_REQUIRED");
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const privateFile = path.join(directory, "device-private.pem");
  const publicFile = path.join(directory, "device-public.pem");
  let privateKeyPem, publicKeyPem;
  if (existsSync(privateFile) || existsSync(publicFile)) {
    if (!existsSync(privateFile) || !existsSync(publicFile)) {
      throw new Error("CONTRIBUTION_DEVICE_KEYPAIR_INCOMPLETE");
    }
    privateKeyPem = readFileSync(privateFile, "utf8");
    publicKeyPem = readFileSync(publicFile, "utf8");
    if (keyId(createPublicKey(createPrivateKey(privateKeyPem))
      .export({ type: "spki", format: "pem" }).toString()) !== keyId(publicKeyPem)) {
      throw new Error("CONTRIBUTION_DEVICE_KEYPAIR_MISMATCH");
    }
  } else {
    const pair = generateKeyPairSync("ed25519", {
      publicKeyEncoding: { type: "spki", format: "pem" },
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
    });
    privateKeyPem = pair.privateKey;
    publicKeyPem = pair.publicKey;
    writeFileSync(privateFile, privateKeyPem, { mode: 0o600 });
    writeFileSync(publicFile, publicKeyPem, { mode: 0o600 });
  }
  const consent = createContributionConsent({ endpoint, deviceKeyId: keyId(publicKeyPem),
    purposes, retentionDays, grantedAt: now });
  const config = addressed({ schema: "outsider/experience-share-config/v1", enabled: true,
    endpoint: consent.endpoint, serverKeyId: keyId(serverPublicKeyPem),
    serverPublicKeyPem, deviceKeyId: consent.deviceKeyId,
    consentHash: consent.consentHash, explicitSendOnly: true, updatedAt: nowIso(now) },
  "configHash");
  atomicJson(path.join(directory, "consent.json"), consent);
  atomicJson(path.join(directory, "config.json"), config);
  mkdirSync(path.join(directory, "receipts"), { recursive: true, mode: 0o700 });
  return Object.freeze({ directory, config, consent });
}

export function readShareState(directory) {
  try {
    const config = readJson(path.join(directory, "config.json"));
    const consent = readJson(path.join(directory, "consent.json"));
    const { configHash, ...configBody } = config;
    const valid = configHash === digest(configBody) && verifyContributionConsent(consent).ok
      && config.consentHash === consent.consentHash
      && config.deviceKeyId === consent.deviceKeyId
      && config.serverKeyId === keyId(config.serverPublicKeyPem);
    if (!valid) throw new Error("CONTRIBUTION_SHARE_STATE_INVALID");
    return Object.freeze({ ok: true, directory, config, consent });
  } catch (error) {
    return Object.freeze({ ok: false, directory, error: error?.message ?? String(error) });
  }
}

export function setShareEnabled(directory, enabled, { now = new Date() } = {}) {
  const state = readShareState(directory);
  if (!state.ok) throw new Error(`CONTRIBUTION_SHARE_STATE_INVALID:${state.error}`);
  const { configHash: ignored, ...body } = state.config;
  const config = addressed({ ...body, enabled: enabled === true, updatedAt: nowIso(now) },
    "configHash");
  atomicJson(path.join(directory, "config.json"), config);
  return Object.freeze({ ...state, config });
}

export function previewRunContribution(runDirectory) {
  const verified = verifyStage05RunDirectory(runDirectory);
  if (!verified.ok) throw new Error(`CONTRIBUTION_RUN_NOT_SEALED:${verified.error}`);
  const experienceFile = path.join(runDirectory, "stage05-supervised-experience.json");
  if (!existsSync(experienceFile)) throw new Error("CONTRIBUTION_EXPERIENCE_NOT_EXPORTED");
  const experience = readJson(experienceFile);
  const checked = verifySupervisedExperienceV2(experience, { verified });
  if (!checked.ok) throw new Error(`CONTRIBUTION_EXPERIENCE_INVALID:${checked.error}`);
  const contributionRecord = createContributionRecord(experience);
  return Object.freeze({ schema: "outsider/experience-contribution-preview/v1",
    runId: verified.manifest.sourceRunId,
    terminalClass: contributionRecord.terminal.terminalClass,
    contributionRecord,
    disclosure: contributionRecord.disclosure,
    note: "Preview only. No network request was made and no consent was changed." });
}

export async function sendRunContribution({ runDirectory, shareDirectory, fetchImpl = fetch,
  now = new Date() } = {}) {
  const state = readShareState(shareDirectory);
  if (!state.ok) throw new Error(`CONTRIBUTION_SHARE_STATE_INVALID:${state.error}`);
  if (state.config.enabled !== true) throw new Error("CONTRIBUTION_SHARING_DISABLED");
  const preview = previewRunContribution(runDirectory);
  const privateKeyPem = readFileSync(path.join(shareDirectory, "device-private.pem"), "utf8");
  const challengeResponse = await fetchImpl(`${state.config.endpoint}/v1/contributions/challenge`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ deviceKeyId: state.config.deviceKeyId,
      experienceRecordHash: preview.contributionRecord.recordHash }),
  });
  if (!challengeResponse.ok) throw new Error(`CONTRIBUTION_CHALLENGE_HTTP_${challengeResponse.status}`);
  const challenge = await challengeResponse.json();
  const challengeCheck = verifyContributionChallenge(challenge, {
    serverPublicKeyPem: state.config.serverPublicKeyPem,
    expectedAudience: state.config.endpoint, now,
  });
  if (!challengeCheck.ok) throw new Error(`CONTRIBUTION_CHALLENGE_INVALID:${challengeCheck.error}`);
  const attestation = createAttestationV2({ runDirectories: [runDirectory], privateKeyPem });
  const envelope = createContributionEnvelope({ contributionRecord: preview.contributionRecord,
    attestation, consent: state.consent, challenge, devicePrivateKeyPem: privateKeyPem,
    createdAt: now });
  const ingestResponse = await fetchImpl(`${state.config.endpoint}/v1/contributions`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify(envelope),
  });
  if (!ingestResponse.ok) throw new Error(`CONTRIBUTION_INGEST_HTTP_${ingestResponse.status}`);
  const response = await ingestResponse.json();
  const receipt = response.receipt;
  const receiptCheck = verifyContributionReceipt(receipt,
    { serverPublicKeyPem: state.config.serverPublicKeyPem });
  if (!receiptCheck.ok || receipt.contributionRecordHash !== preview.contributionRecord.recordHash
    || receipt.envelopeHash !== envelope.envelopeHash) {
    throw new Error(`CONTRIBUTION_RECEIPT_INVALID:${receiptCheck.error ?? "binding mismatch"}`);
  }
  atomicJson(hashFile(shareDirectory, "receipts", receipt.receiptHash), receipt);
  return Object.freeze({ ok: true, duplicate: response.duplicate === true,
    contributionRecordHash: preview.contributionRecord.recordHash,
    envelopeHash: envelope.envelopeHash, receipt });
}

export function createContributionRevocation({ shareDirectory, reason = "USER_REQUEST",
  now = new Date() } = {}) {
  const state = readShareState(shareDirectory);
  if (!state.ok) throw new Error(`CONTRIBUTION_SHARE_STATE_INVALID:${state.error}`);
  const privateKeyPem = readFileSync(path.join(shareDirectory, "device-private.pem"), "utf8");
  const record = signed({ schema: CONTRIBUTION_SCHEMAS.revocation,
    revocationId: randomUUID(), consentHash: state.consent.consentHash,
    contributorKeyId: state.consent.deviceKeyId,
    requestedAt: nowIso(now), scope: "FUTURE_USE_AND_RETAINED_CONTRIBUTIONS",
    reason: String(reason).slice(0, 160),
    note: "Server acknowledgment is required; this local request alone does not prove deletion." },
  "revocationHash", privateKeyPem);
  atomicJson(path.join(shareDirectory, "revocation.json"), record);
  setShareEnabled(shareDirectory, false, { now });
  return record;
}

export function verifyContributionRevocation(record) {
  try {
    if (record?.schema !== CONTRIBUTION_SCHEMAS.revocation
      || !verifySigned(record, "revocationHash", record.signature?.publicKeyPem)
      || record.contributorKeyId !== record.signature?.keyId
      || !HASH.test(record.consentHash)) throw new Error("CONTRIBUTION_REVOCATION_INVALID");
    return Object.freeze({ ok: true, revocationHash: record.revocationHash });
  } catch (error) {
    return Object.freeze({ ok: false, error: error?.message ?? String(error) });
  }
}

export function createContributionRevocationReceipt({ revocation, deletedContributions,
  privateKeyPem, registryId = "outsider-contributions", processedAt = new Date() } = {}) {
  const checked = verifyContributionRevocation(revocation);
  if (!checked.ok || !privateKeyPem || !Number.isInteger(Number(deletedContributions))
    || Number(deletedContributions) < 0) {
    throw new Error("CONTRIBUTION_REVOCATION_RECEIPT_INPUT_INVALID");
  }
  return signed({ schema: CONTRIBUTION_SCHEMAS.revocationReceipt,
    acknowledgmentId: randomUUID(), registryId: String(registryId),
    revocationHash: revocation.revocationHash,
    contributorKeyId: revocation.contributorKeyId,
    consentHash: revocation.consentHash,
    processedAt: nowIso(processedAt),
    deletedContributions: Number(deletedContributions),
    futureUseBlocked: true,
    retainedAuditMaterial: ["content-hashes", "receipt-hashes", "registry-chain"],
    deletedMaterial: ["contribution-envelope", "contribution-record", "attestation"],
    authority: "none",
  }, "acknowledgmentHash", privateKeyPem);
}

export function verifyContributionRevocationReceipt(record,
  { serverPublicKeyPem = null } = {}) {
  try {
    if (record?.schema !== CONTRIBUTION_SCHEMAS.revocationReceipt
      || !verifySigned(record, "acknowledgmentHash", serverPublicKeyPem)
      || !HASH.test(String(record.revocationHash ?? ""))
      || !HASH.test(String(record.contributorKeyId ?? ""))
      || !HASH.test(String(record.consentHash ?? ""))
      || record.futureUseBlocked !== true
      || record.authority !== "none"
      || !Number.isInteger(Number(record.deletedContributions))
      || Number(record.deletedContributions) < 0
      || canonicalizeStrict(record.retainedAuditMaterial)
        !== canonicalizeStrict(["content-hashes", "receipt-hashes", "registry-chain"])
      || canonicalizeStrict(record.deletedMaterial)
        !== canonicalizeStrict(["contribution-envelope", "contribution-record", "attestation"])) {
      throw new Error("CONTRIBUTION_REVOCATION_RECEIPT_INVALID");
    }
    date(record.processedAt, "REVOCATION_PROCESSED_AT");
    return Object.freeze({ ok: true, acknowledgmentHash: record.acknowledgmentHash });
  } catch (error) {
    return Object.freeze({ ok: false, error: error?.message ?? String(error) });
  }
}

export async function sendContributionRevocation({ shareDirectory, reason = "USER_REQUEST",
  fetchImpl = fetch, now = new Date() } = {}) {
  const state = readShareState(shareDirectory);
  if (!state.ok) throw new Error(`CONTRIBUTION_SHARE_STATE_INVALID:${state.error}`);
  const revocation = createContributionRevocation({ shareDirectory, reason, now });
  const response = await fetchImpl(`${state.config.endpoint}/v1/contributions/revocations`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify(revocation),
  });
  if (!response.ok) throw new Error(`CONTRIBUTION_REVOCATION_HTTP_${response.status}`);
  const acknowledgment = await response.json();
  const checked = verifyContributionRevocationReceipt(acknowledgment,
    { serverPublicKeyPem: state.config.serverPublicKeyPem });
  if (!checked.ok || acknowledgment.revocationHash !== revocation.revocationHash
    || acknowledgment.contributorKeyId !== revocation.contributorKeyId
    || acknowledgment.consentHash !== revocation.consentHash) {
    throw new Error(`CONTRIBUTION_REVOCATION_ACK_INVALID:${checked.error ?? "binding mismatch"}`);
  }
  atomicJson(path.join(shareDirectory, "revocation-acknowledgment.json"), acknowledgment);
  return Object.freeze({ ok: true, revocation, acknowledgment });
}

export function removeLocalShareState(directory) {
  if (existsSync(directory) && lstatSync(directory).isSymbolicLink()) {
    throw new Error("CONTRIBUTION_SYMLINK_REFUSED");
  }
  rmSync(directory, { recursive: true, force: true });
}

export { digest as contributionDigest, keyId as contributionKeyId };
