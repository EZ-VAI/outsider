/*
 * Source-bound Reality Stewardship integration.
 *
 * This module joins the existing Stage 0.5 -> ATTEST evidence path to one
 * fully replayed CURATE record and the advisory Reality Stewardship kernel.
 * It deliberately does not create an execution capability.  The resulting
 * envelope is an open-obligation record for an external owner and ledger to
 * review; every execution, training, financial and closure permission remains
 * false even when every local source is replayed successfully.
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { canonicalizeStrict } from "./canonical.js";
import {
  stage05Digest,
  verifyAttestationV2,
  verifyStage05RunDirectory,
} from "./outsider-stage05-evidence.js";
import { verifySupervisedExperienceV2 } from "./outsider-supervised-experience.js";
import {
  verifyCurateCheckpoint,
  verifyCurateClearance,
  verifyCurateEpisode,
  verifyCurateInclusionProof,
} from "./outsider-curate-core.js";
import {
  verifyRealityBoundary,
  verifyRealityBudgetCommitment,
  verifyRealityExecutionReceipt,
  verifyRealityStewardshipAssessment,
  verifyStewardshipClaim,
} from "./outsider-reality-stewardship.js";

export const REALITY_INTEGRATION_SCHEMAS = Object.freeze({
  curateIntent: "outsider/reality-curate-evidence-intent/v1",
  advisoryEnvelope: "outsider/reality-source-bound-advisory-envelope/v1",
});

const DOMAIN = Object.freeze({
  curateIntent: REALITY_INTEGRATION_SCHEMAS.curateIntent,
  declaredRights: "outsider/reality-declared-experience-rights-reference/v1",
  sourceAnchor: "outsider/reality-source-anchor/v1",
  obligations: "outsider/reality-obligation-set/v1",
  advisoryEnvelope: REALITY_INTEGRATION_SCHEMAS.advisoryEnvelope,
});

const HASH = /^sha256:[a-f0-9]{64}$/;
const TOKEN = /^[A-Za-z0-9][A-Za-z0-9._:+/-]{0,127}$/;

function fail(code) { throw new Error(code); }

function plain(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function exactKeys(value, keys) {
  return plain(value)
    && Object.keys(value).sort().join("\0") === [...keys].sort().join("\0");
}

function digest(domain, value) {
  return `sha256:${createHash("sha256")
    .update(`${domain}\0${canonicalizeStrict(value)}`).digest("hex")}`;
}

function same(left, right) {
  return canonicalizeStrict(left) === canonicalizeStrict(right);
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function hash(value, code) {
  if (!HASH.test(String(value ?? ""))) fail(code);
  return value;
}

function token(value, code) {
  if (typeof value !== "string" || !TOKEN.test(value)) fail(code);
  return value;
}

function iso(value, code) {
  if (typeof value !== "string" || value.length > 40 || !Number.isFinite(Date.parse(value))) {
    fail(code);
  }
  const normalized = new Date(value).toISOString();
  if (normalized !== value) fail(code);
  return normalized;
}

function sortedUniqueHashes(values, code, { minimum = 0 } = {}) {
  if (!Array.isArray(values) || values.length < minimum
    || values.some((value) => !HASH.test(String(value ?? "")))) fail(code);
  const output = [...new Set(values)].sort();
  if (output.length !== values.length) fail(`${code}_DUPLICATE`);
  return output;
}

function seal(schema, domain, body, field) {
  const record = { schema, schemaVersion: "1.0.0", ...body };
  return deepFreeze({ ...record, [field]: digest(domain, record) });
}

function verifySeal(record, schema, domain, keys, field) {
  if (!exactKeys(record, ["schema", "schemaVersion", ...keys, field])
    || record.schema !== schema || record.schemaVersion !== "1.0.0"
    || !HASH.test(record[field] ?? "")) return false;
  const body = Object.fromEntries(keys.map((key) => [key, record[key]]));
  return record[field] === digest(domain,
    { schema, schemaVersion: "1.0.0", ...body });
}

function noAuthorityBoundary() {
  return {
    lane: "RESEARCH_AND_ADVISORY_ONLY",
    authority: "none",
    externalOwnerAdoptionVerified: false,
    externalLedgerCompletenessVerified: false,
    affectedPartyStandingExternallyVerified: false,
    measurementTruthExternallyVerified: false,
    experienceRightsExternallyVerified: false,
    ownerGateInputEligible: false,
    executionAuthorized: false,
    priceAuthorized: false,
    closureAuthorized: false,
    automaticTraining: false,
    causalExperienceUnits: 0,
    financialEffect: "none",
    permits: {
      EXECUTE: false,
      TRAIN: false,
      PRICE: false,
      GUARANTEE: false,
      SETTLE: false,
      CLOSE: false,
    },
  };
}

const INTENT_KEYS = [
  "curate", "declaredExperienceRightsReferenceHash",
  "experienceRightsExternallyVerified", "rawSourceObjectBytesReverified",
  "automaticTraining", "causalExperienceUnits", "boundary",
];

function replayCurateSource({
  episode, history = [], clearance, checkpoint, checkpointClearances, inclusionProof,
} = {}) {
  if (!verifyCurateEpisode(episode).ok) fail("REALITY_INTEGRATION_CURATE_EPISODE_INVALID");
  if (!Array.isArray(history) || history.some((item) => !verifyCurateEpisode(item).ok)) {
    fail("REALITY_INTEGRATION_CURATE_HISTORY_INVALID");
  }
  const checkedClearance = verifyCurateClearance(clearance, { episode, history });
  if (!checkedClearance.ok || checkedClearance.derivationsVerified !== true) {
    fail("REALITY_INTEGRATION_CURATE_CLEARANCE_NOT_REPLAYED");
  }
  if (!Array.isArray(checkpointClearances)
    || !checkpointClearances.some((item) => same(item, clearance))) {
    fail("REALITY_INTEGRATION_CURATE_CLEARANCE_NOT_IN_RECORD_SET");
  }
  const checkedCheckpoint = verifyCurateCheckpoint(checkpoint, {
    clearances: checkpointClearances,
  });
  if (!checkedCheckpoint.ok || checkedCheckpoint.recordsVerified !== true) {
    fail("REALITY_INTEGRATION_CURATE_CHECKPOINT_NOT_REPLAYED");
  }
  const checkedProof = verifyCurateInclusionProof(inclusionProof, {
    checkpoint, clearance,
  });
  if (!checkedProof.ok) fail("REALITY_INTEGRATION_CURATE_PROOF_INVALID");
  if (clearance.disposition !== "QUARANTINED"
    || clearance.causal?.causalExperienceUnits !== 0
    || clearance.useBoundary?.automaticTraining !== false
    || Object.values(clearance.useBoundary?.permits ?? {}).some((value) => value !== false)
    || checkpoint.causalExperienceUnits !== 0
    || checkpoint.useBoundary?.automaticTraining !== false
    || Object.values(checkpoint.useBoundary?.permits ?? {}).some((value) => value !== false)) {
    fail("REALITY_INTEGRATION_CURATE_BOUNDARY_ELEVATED");
  }
  return {
    episodeHash: episode.episodeHash,
    clearanceHash: clearance.clearanceHash,
    checkpointHash: checkpoint.checkpointHash,
    inclusionProofHash: inclusionProof.proofHash,
    datasetId: episode.source.datasetId,
    datasetVersion: episode.source.datasetVersion,
    datasetManifestHash: episode.source.datasetManifestHash,
    sourceObjectHash: episode.source.sourceObjectHash,
    licenseId: episode.source.licenseId,
    attributionHash: episode.source.attributionHash,
    instrumentHash: clearance.instrumentHash,
    disposition: "QUARANTINED",
    fitToLearnAdmitted: false,
    causalExperienceUnits: 0,
  };
}

/**
 * Commit an already replayed CURATE source before the Stewardship Claim is
 * created.  The resulting intent hash must be an operation hash in the Claim;
 * this prevents a valid but unrelated CURATE episode from being swapped into a
 * later Stage 0.5 envelope.
 */
export function createRealityCurateEvidenceIntent({ curateSource } = {}) {
  const curate = replayCurateSource(curateSource);
  const declaredExperienceRightsReferenceHash = digest(DOMAIN.declaredRights, {
    datasetId: curate.datasetId,
    datasetVersion: curate.datasetVersion,
    datasetManifestHash: curate.datasetManifestHash,
    sourceObjectHash: curate.sourceObjectHash,
    licenseId: curate.licenseId,
    attributionHash: curate.attributionHash,
    clearanceHash: curate.clearanceHash,
  });
  return seal(REALITY_INTEGRATION_SCHEMAS.curateIntent, DOMAIN.curateIntent, {
    curate,
    declaredExperienceRightsReferenceHash,
    experienceRightsExternallyVerified: false,
    rawSourceObjectBytesReverified: false,
    automaticTraining: false,
    causalExperienceUnits: 0,
    boundary: noAuthorityBoundary(),
  }, "intentHash");
}

export function verifyRealityCurateEvidenceIntent(record, { curateSource = null } = {}) {
  try {
    if (!verifySeal(record, REALITY_INTEGRATION_SCHEMAS.curateIntent,
      DOMAIN.curateIntent, INTENT_KEYS, "intentHash")
      || !exactKeys(record.curate, ["episodeHash", "clearanceHash", "checkpointHash",
        "inclusionProofHash", "datasetId", "datasetVersion", "datasetManifestHash",
        "sourceObjectHash", "licenseId", "attributionHash", "instrumentHash",
        "disposition", "fitToLearnAdmitted", "causalExperienceUnits"])
      || ![record.curate.episodeHash, record.curate.clearanceHash,
        record.curate.checkpointHash, record.curate.inclusionProofHash,
        record.curate.datasetManifestHash, record.curate.sourceObjectHash,
        record.curate.attributionHash, record.curate.instrumentHash,
        record.declaredExperienceRightsReferenceHash].every((value) => HASH.test(value ?? ""))
      || ![record.curate.datasetId, record.curate.datasetVersion,
        record.curate.licenseId].every((value) => TOKEN.test(value ?? ""))
      || record.curate.disposition !== "QUARANTINED"
      || record.curate.fitToLearnAdmitted !== false
      || record.curate.causalExperienceUnits !== 0
      || record.experienceRightsExternallyVerified !== false
      || record.rawSourceObjectBytesReverified !== false
      || record.automaticTraining !== false || record.causalExperienceUnits !== 0
      || !same(record.boundary, noAuthorityBoundary())
      || record.declaredExperienceRightsReferenceHash !== digest(DOMAIN.declaredRights, {
        datasetId: record.curate.datasetId,
        datasetVersion: record.curate.datasetVersion,
        datasetManifestHash: record.curate.datasetManifestHash,
        sourceObjectHash: record.curate.sourceObjectHash,
        licenseId: record.curate.licenseId,
        attributionHash: record.curate.attributionHash,
        clearanceHash: record.curate.clearanceHash,
      })) fail("REALITY_INTEGRATION_CURATE_INTENT_INVALID");
    if (curateSource !== null) {
      const rebuilt = createRealityCurateEvidenceIntent({ curateSource });
      if (!same(record, rebuilt)) fail("REALITY_INTEGRATION_CURATE_INTENT_SOURCE_MISMATCH");
    }
    return {
      ok: true,
      intentHash: record.intentHash,
      verificationLevel: curateSource === null ? "SELF_CHECK_ONLY"
        : "CURATE_PROTOCOL_INPUTS_REPLAYED",
      curateProtocolInputsReplayed: curateSource !== null,
      rawSourceObjectBytesReverified: false,
      experienceRightsExternallyVerified: false,
      authorityEstablished: false,
    };
  } catch (error) {
    return { ok: false, error: String(error?.message ?? error) };
  }
}

function replayStage05Source({ runDirectory, attestation } = {}) {
  if (typeof runDirectory !== "string" || runDirectory.length === 0) {
    fail("REALITY_INTEGRATION_STAGE05_DIRECTORY_REQUIRED");
  }
  const verified = verifyStage05RunDirectory(runDirectory);
  if (!verified.ok) fail(`REALITY_INTEGRATION_STAGE05_RUN_INVALID:${verified.error}`);
  const checkedAttestation = verifyAttestationV2(attestation);
  if (!checkedAttestation.ok) {
    fail(`REALITY_INTEGRATION_ATTEST_INVALID:${checkedAttestation.error}`);
  }
  if (checkedAttestation.signed !== true) {
    fail("REALITY_INTEGRATION_SIGNED_ATTESTATION_REQUIRED");
  }
  let supervisedExperience;
  try {
    supervisedExperience = JSON.parse(readFileSync(path.join(runDirectory,
      "stage05-supervised-experience.json"), "utf8"));
  } catch {
    fail("REALITY_INTEGRATION_SUPERVISED_EXPERIENCE_REQUIRED");
  }
  if (!verifySupervisedExperienceV2(supervisedExperience, { verified }).ok) {
    fail("REALITY_INTEGRATION_SUPERVISED_EXPERIENCE_INVALID");
  }
  const { binding, manifest, projection, publicEvidence } = verified;
  const groupKey = {
    extractorId: binding.source.extractorId,
    productVersion: binding.source.packageVersion,
    controllerImplementationHash: binding.source.controllerImplementationHash,
    hostProtocol: binding.source.hostProtocol,
    wayHash: binding.wayRef.wayHash,
    claimRefHash: stage05Digest(binding.claimRef),
    worldRefHash: stage05Digest(binding.worldRef),
    authorityRefHash: stage05Digest(binding.authority),
  };
  const outcome = projection.outcome;
  const legacy = supervisedExperience.modelInput?.verified ?? {};
  const item = {
    runId: manifest.sourceRunId,
    manifestHash: manifest.manifestHash,
    projectionHash: projection.projectionHash,
    supervisedExperienceHash: supervisedExperience.recordHash,
    evidenceRoot: manifest.rawLocalRoot.merkleRoot,
    terminalClass: outcome.terminalClass,
    proofComplete: outcome.proofComplete === true,
    deliveryComplete: outcome.deliveryComplete ?? legacy.deliveryResolved ?? false,
    interventionRequired: outcome.interventionRequired
      ?? legacy.interventionRequired ?? false,
    interventionComplete: outcome.interventionComplete
      ?? legacy.interventionComplete ?? false,
  };
  const terminalClasses = ["SAFE_DELIVERY", "VERIFIED_DELIVERY_UNATTRIBUTED",
    "CONTROL_BOUNDARY_CONTAINMENT", "CONSERVATIVE_STOP", "UNFINALIZED"];
  const outcomes = Object.fromEntries(terminalClasses
    .map((name) => [name, item.terminalClass === name ? 1 : 0]));
  const expectedBody = {
    artifactType: "outsider_attestation_v2",
    authority: "none",
    evidenceClass: item.terminalClass === "CONTROL_BOUNDARY_CONTAINMENT"
      ? "CONTROL_BOUNDARY_CONTAINMENT" : "CONTROLLED_STAGE05",
    groupKey,
    included: [item],
    duplicates: [],
    nUnique: 1,
    outcomes,
    correlation: {
      independenceClaimed: false,
      correlationRoots: [groupKey.controllerImplementationHash, groupKey.wayHash],
    },
    validityDomain: {
      claimMode: binding.claimRef.mode,
      worldMode: binding.worldRef.mode,
      generalizesBeyondIncludedEvidence: false,
    },
    commitment: stage05Digest({ groupKey, included: [item], counts: outcomes }),
    signature: null,
  };
  const expected = { ...expectedBody, attestationHash: stage05Digest(expectedBody) };
  const sourceBody = { ...attestation, signature: null };
  if (!same(sourceBody, expected)
    || attestation.nUnique !== 1 || attestation.included?.length !== 1
    || attestation.duplicates?.length !== 0) {
    fail("REALITY_INTEGRATION_ATTEST_SOURCE_DERIVATION_MISMATCH");
  }
  if (manifest.bindingHash !== binding.bindingHash
    || projection.bindingHash !== binding.bindingHash
    || publicEvidence.bindingHash !== binding.bindingHash
    || projection.manifestHash !== manifest.manifestHash
    || publicEvidence.manifestHash !== manifest.manifestHash
    || publicEvidence.projectionHash !== projection.projectionHash
    || !same(projection.realityClaimRef, binding.claimRef)
    || !same(projection.executionWay, binding.wayRef)
    || !same(projection.worldRef, binding.worldRef)
    || !same(projection.authority, binding.authority)
    || !same(publicEvidence.commitments, projection.evidenceCommitment)) {
    fail("REALITY_INTEGRATION_STAGE05_PROJECTION_BINDING_INVALID");
  }
  if (!HASH.test(item.supervisedExperienceHash ?? "")
    || !HASH.test(attestation.signature?.keyId ?? "")) {
    fail("REALITY_INTEGRATION_ATTEST_REQUIRED_HASH_MISSING");
  }
  return {
    sourceRunId: manifest.sourceRunId,
    bindingHash: binding.bindingHash,
    manifestHash: manifest.manifestHash,
    projectionHash: projection.projectionHash,
    publicEvidenceHash: publicEvidence.publicEvidenceHash,
    rawLocalMerkleRoot: manifest.rawLocalRoot.merkleRoot,
    publicDerivativeMerkleRoot: manifest.publicDerivativeRoot.merkleRoot,
    eventChainHash: manifest.eventChain.chainHash,
    terminalClass: manifest.terminal.terminalClass,
    supervisedExperienceHash: item.supervisedExperienceHash,
    attestationHash: attestation.attestationHash,
    attestationSignerKeyId: attestation.signature.keyId,
    attestationSignatureVerified: true,
    attestationSignerExternallyTrusted: false,
    boundClaimHash: binding.claimRef.claimHash,
    boundWayHash: binding.wayRef.wayHash,
    boundWorldHash: binding.worldRef.worldHash,
    createdBeforeFirstAction: binding.createdBeforeFirstAction,
  };
}

function validateExactStage05Binding(stage05, boundary, claim) {
  if (stage05.boundClaimHash !== claim.claimHash
    || stage05.boundWayHash !== claim.wayHash
    || stage05.boundWorldHash !== boundary.worldHash
    || stage05.createdBeforeFirstAction !== true) {
    fail("REALITY_INTEGRATION_STAGE05_NOT_EXACTLY_BOUND_TO_CLAIM_WORLD_WAY");
  }
}

function uniqueCommitments(priorCommitmentEntries, currentCommitment) {
  if (!Array.isArray(priorCommitmentEntries)) {
    fail("REALITY_INTEGRATION_PRIOR_COMMITMENTS_INVALID");
  }
  const hashes = [];
  const claims = [];
  for (const entry of priorCommitmentEntries) {
    if (!exactKeys(entry, ["commitment", "claim"])) {
      fail("REALITY_INTEGRATION_PRIOR_COMMITMENT_ENTRY_INVALID");
    }
    hashes.push(entry.commitment?.commitmentHash);
    claims.push(entry.commitment?.claimHash);
  }
  hashes.push(currentCommitment?.commitmentHash);
  claims.push(currentCommitment?.claimHash);
  if (hashes.some((value) => !HASH.test(String(value ?? "")))
    || new Set(hashes).size !== hashes.length) {
    fail("REALITY_INTEGRATION_DUPLICATE_BUDGET_COMMITMENT");
  }
  if (claims.some((value) => !HASH.test(String(value ?? "")))
    || new Set(claims).size !== claims.length) {
    fail("REALITY_INTEGRATION_DUPLICATE_CLAIM_BUDGET_RESERVATION");
  }
  return hashes.sort();
}

function constraintBindings(boundary, claim, assessment, currentCommitment) {
  const requests = new Map(claim.requestedExternalities
    .map((item) => [item.channelId, item.amount]));
  const commitments = new Map(currentCommitment.channelAmounts
    .map((item) => [item.channelId, item.amount]));
  const assessed = new Map(assessment.budgetRows
    .map((item) => [item.channelId, item]));
  return boundary.constraints.map((constraint) => {
    const requested = requests.get(constraint.channelId);
    const committed = commitments.get(constraint.channelId);
    const row = assessed.get(constraint.channelId);
    if (requested === undefined || committed === undefined || !row
      || committed !== requested || row.requested !== requested
      || row.status !== "PASS" || row.kind !== constraint.kind
      || row.unit !== constraint.unit || row.cap !== constraint.cap) {
      fail("REALITY_INTEGRATION_CONSTRAINT_CHANNEL_BINDING_INVALID");
    }
    return {
      channelId: constraint.channelId,
      kind: constraint.kind,
      unit: constraint.unit,
      cap: constraint.cap,
      aggregation: constraint.aggregation,
      affectedPartyRootHashes: [...constraint.affectedPartyRootHashes],
      alreadyCommitted: row.alreadyCommitted,
      requested,
      currentCommitment: committed,
      projected: row.projected,
      status: "PASS",
      nonCompensable: true,
    };
  });
}

function obligationRows(boundary, execution, createdAt, sourceEvidenceAnchorHash) {
  const executedMs = Date.parse(execution.executedAt);
  const createdMs = Date.parse(createdAt);
  return boundary.observationHorizons.map((horizon) => {
    const dueAt = new Date(executedMs + horizon.closesAfterMs).toISOString();
    return {
      horizonId: horizon.horizonId,
      closesAfterMs: horizon.closesAfterMs,
      dueAt,
      mandatory: true,
      status: createdMs >= Date.parse(dueAt) ? "REPORT_DUE_OR_OVERDUE" : "OPEN_UNTIL_DUE",
      consequenceReportHash: null,
      sourceEvidenceAnchorHash,
      obligationOpen: true,
      canClose: false,
    };
  });
}

const ENVELOPE_KEYS = [
  "intentHash", "boundaryHash", "claimHash", "assessmentHash", "executionHash",
  "createdAt", "sources", "constitutionalBindings", "budget", "consequenceObligations",
  "sourceEvidenceAnchorHash", "advisoryDisposition", "denyReasons", "boundary",
];

/**
 * Join exact local evidence into a machine-readable advisory envelope.
 *
 * Local source replay is necessary but never sufficient for execution.  This
 * function intentionally accepts no switch that can assert owner adoption,
 * ledger completeness, external standing, truth, PRICE or closure.
 */
export function createSourceBoundRealityAdvisoryEnvelope({
  boundary, claim, assessment, priorCommitmentEntries = [], currentCommitment,
  execution, curateIntent, curateSource, stage05Source, createdAt,
} = {}) {
  if (!verifyRealityBoundary(boundary).ok
    || !verifyStewardshipClaim(claim, { boundary }).ok) {
    fail("REALITY_INTEGRATION_CLAIM_OR_BOUNDARY_INVALID");
  }
  const intentCheck = verifyRealityCurateEvidenceIntent(curateIntent, { curateSource });
  if (!intentCheck.ok || intentCheck.curateProtocolInputsReplayed !== true) {
    fail("REALITY_INTEGRATION_CURATE_INTENT_NOT_SOURCE_REPLAYED");
  }
  if (claim.purpose !== "EXPERIENCE"
    || !claim.operationHashes.includes(curateIntent.intentHash)
    || claim.experienceRightsHash !== curateIntent.declaredExperienceRightsReferenceHash) {
    fail("REALITY_INTEGRATION_CURATE_INTENT_NOT_BOUND_TO_CLAIM");
  }
  const assessmentCheck = verifyRealityStewardshipAssessment(assessment, {
    boundary, claim, priorCommitmentEntries,
  });
  if (!assessmentCheck.ok
    || assessment.decision
      !== "STRUCTURALLY_READY_PENDING_EXTERNAL_LEDGER_AND_OWNER_GATE"
    || assessment.executionAuthorized !== false
    || assessment.ownerGateInputEligible !== false) {
    fail("REALITY_INTEGRATION_ASSESSMENT_NOT_STRUCTURALLY_READY");
  }
  if (!verifyRealityBudgetCommitment(currentCommitment, { boundary, claim }).ok
    || currentCommitment.claimHash !== claim.claimHash) {
    fail("REALITY_INTEGRATION_CURRENT_COMMITMENT_INVALID");
  }
  const allCommitmentHashes = uniqueCommitments(priorCommitmentEntries, currentCommitment);
  if (Date.parse(currentCommitment.committedAt) < Date.parse(assessment.assessedAt)) {
    fail("REALITY_INTEGRATION_COMMITMENT_PRECEDES_ASSESSMENT");
  }
  const stage05 = replayStage05Source(stage05Source);
  validateExactStage05Binding(stage05, boundary, claim);
  if (!verifyRealityExecutionReceipt(execution, { boundary, claim }).ok
    || execution.executionEvidenceHash !== stage05.publicEvidenceHash
    || Date.parse(execution.executedAt) < Date.parse(currentCommitment.committedAt)) {
    fail("REALITY_INTEGRATION_EXECUTION_NOT_BOUND_TO_STAGE05_AND_BUDGET");
  }
  const at = iso(createdAt, "REALITY_INTEGRATION_CREATED_AT_INVALID");
  if (Date.parse(at) < Date.parse(execution.executedAt)) {
    fail("REALITY_INTEGRATION_ENVELOPE_BEFORE_EXECUTION");
  }
  const sourceEvidenceAnchorHash = digest(DOMAIN.sourceAnchor, {
    stage05ManifestHash: stage05.manifestHash,
    stage05PublicEvidenceHash: stage05.publicEvidenceHash,
    attestationHash: stage05.attestationHash,
    curateIntentHash: curateIntent.intentHash,
    curateCheckpointHash: curateIntent.curate.checkpointHash,
    executionHash: execution.executionHash,
  });
  const obligations = obligationRows(boundary, execution, at, sourceEvidenceAnchorHash);
  const obligationSetHash = digest(DOMAIN.obligations, obligations);
  const channels = constraintBindings(boundary, claim, assessment, currentCommitment);
  return seal(REALITY_INTEGRATION_SCHEMAS.advisoryEnvelope,
    DOMAIN.advisoryEnvelope, {
      intentHash: curateIntent.intentHash,
      boundaryHash: boundary.boundaryHash,
      claimHash: claim.claimHash,
      assessmentHash: assessment.assessmentHash,
      executionHash: execution.executionHash,
      createdAt: at,
      sources: {
        stage05,
        curate: { ...curateIntent.curate,
          intentHash: curateIntent.intentHash,
          declaredExperienceRightsReferenceHash:
            curateIntent.declaredExperienceRightsReferenceHash,
          rawSourceObjectBytesReverified: false,
          experienceRightsExternallyVerified: false,
        },
      },
      constitutionalBindings: {
        worldHash: boundary.worldHash,
        wayHash: claim.wayHash,
        claimantRootHash: claim.claimantRootHash,
        affectedPartyRootHashes: [...boundary.affectedPartyRootHashes],
        representedPartyRootHashes: [...claim.representedPartyRootHashes],
        constraintChannels: channels,
        challengePolicyHash: boundary.challengePolicyHash,
        recoveryStandardHash: boundary.recoveryStandardHash,
        recoveryPlanHash: claim.recoveryPlanHash,
        responsibilityRootHashes: [...execution.responsibilityRootHashes],
        providerRootHash: execution.providerRootHash,
        declaredExperienceRightsReferenceHash: claim.experienceRightsHash,
      },
      budget: {
        priorCommitmentHashes: [...assessment.priorCommitmentHashes],
        currentCommitmentHash: currentCommitment.commitmentHash,
        allCommitmentHashes,
        currentClaimHash: claim.claimHash,
        completeness: "OPERATOR_OBSERVED_NOT_EXTERNALLY_COMPLETE",
        externalLedgerCompletenessVerified: false,
      },
      consequenceObligations: {
        executedAt: execution.executedAt,
        horizons: obligations,
        obligationSetHash,
        everyMandatoryHorizonBound: true,
        allConsequenceReportsBound: false,
        obligationOpen: true,
        canClose: false,
        externalClosureRequired: true,
        externalClosureEligibilityVerified: false,
      },
      sourceEvidenceAnchorHash,
      advisoryDisposition: "HOLD_EXTERNAL_OWNER_LEDGER_AND_OPEN_CONSEQUENCES",
      denyReasons: [
        "AFFECTED_PARTY_STANDING_NOT_EXTERNALLY_VERIFIED",
        "CONSEQUENCE_OBLIGATIONS_OPEN",
        "EXTERNAL_LEDGER_COMPLETENESS_NOT_VERIFIED",
        "EXTERNAL_OWNER_ADOPTION_NOT_VERIFIED",
      ],
      boundary: noAuthorityBoundary(),
    }, "envelopeHash");
}

function validStage05Summary(value) {
  const keys = ["sourceRunId", "bindingHash", "manifestHash", "projectionHash",
    "publicEvidenceHash", "rawLocalMerkleRoot", "publicDerivativeMerkleRoot",
    "eventChainHash", "terminalClass", "supervisedExperienceHash", "attestationHash",
    "attestationSignerKeyId", "attestationSignatureVerified",
    "attestationSignerExternallyTrusted", "boundClaimHash", "boundWayHash",
    "boundWorldHash", "createdBeforeFirstAction"];
  return exactKeys(value, keys)
    && typeof value.sourceRunId === "string" && value.sourceRunId.length > 0
    && [value.bindingHash, value.manifestHash, value.projectionHash,
      value.publicEvidenceHash, value.rawLocalMerkleRoot,
      value.publicDerivativeMerkleRoot, value.eventChainHash,
      value.supervisedExperienceHash, value.attestationHash,
      value.attestationSignerKeyId, value.boundClaimHash, value.boundWayHash,
      value.boundWorldHash].every((item) => HASH.test(item ?? ""))
    && TOKEN.test(value.terminalClass ?? "")
    && value.attestationSignatureVerified === true
    && value.attestationSignerExternallyTrusted === false
    && value.createdBeforeFirstAction === true;
}

function validateEnvelopeInternals(record) {
  if (!validStage05Summary(record.sources?.stage05)
    || !exactKeys(record.sources, ["stage05", "curate"])
    || !exactKeys(record.sources.curate, ["episodeHash", "clearanceHash", "checkpointHash",
      "inclusionProofHash", "datasetId", "datasetVersion", "datasetManifestHash",
      "sourceObjectHash", "licenseId", "attributionHash", "instrumentHash",
      "disposition", "fitToLearnAdmitted", "causalExperienceUnits", "intentHash",
      "declaredExperienceRightsReferenceHash", "rawSourceObjectBytesReverified",
      "experienceRightsExternallyVerified"])
    || record.sources.curate.intentHash !== record.intentHash
    || record.sources.curate.disposition !== "QUARANTINED"
    || record.sources.curate.fitToLearnAdmitted !== false
    || record.sources.curate.causalExperienceUnits !== 0
    || record.sources.curate.rawSourceObjectBytesReverified !== false
    || record.sources.curate.experienceRightsExternallyVerified !== false
    || !exactKeys(record.constitutionalBindings, ["worldHash", "wayHash",
      "claimantRootHash", "affectedPartyRootHashes", "representedPartyRootHashes",
      "constraintChannels", "challengePolicyHash", "recoveryStandardHash",
      "recoveryPlanHash", "responsibilityRootHashes", "providerRootHash",
      "declaredExperienceRightsReferenceHash"])
    || record.sources.stage05.boundClaimHash !== record.claimHash
    || record.sources.stage05.boundWayHash !== record.constitutionalBindings.wayHash
    || record.sources.stage05.boundWorldHash !== record.constitutionalBindings.worldHash
    || record.sources.curate.declaredExperienceRightsReferenceHash
      !== record.constitutionalBindings.declaredExperienceRightsReferenceHash) {
    fail("REALITY_INTEGRATION_ENVELOPE_SOURCE_BINDING_INVALID");
  }
  const parties = sortedUniqueHashes(record.constitutionalBindings.affectedPartyRootHashes,
    "REALITY_INTEGRATION_ENVELOPE_PARTIES_INVALID", { minimum: 1 });
  const represented = sortedUniqueHashes(
    record.constitutionalBindings.representedPartyRootHashes,
    "REALITY_INTEGRATION_ENVELOPE_REPRESENTED_PARTIES_INVALID", { minimum: 1 });
  if (!same(parties, represented)) fail("REALITY_INTEGRATION_ENVELOPE_PARTY_OMITTED");
  const responsibilities = sortedUniqueHashes(
    record.constitutionalBindings.responsibilityRootHashes,
    "REALITY_INTEGRATION_ENVELOPE_RESPONSIBILITY_INVALID", { minimum: 1 });
  if (!responsibilities.includes(record.constitutionalBindings.providerRootHash)) {
    fail("REALITY_INTEGRATION_ENVELOPE_PROVIDER_NOT_RESPONSIBLE");
  }
  const channels = record.constitutionalBindings.constraintChannels;
  if (!Array.isArray(channels) || channels.length === 0
    || new Set(channels.map((item) => item?.channelId)).size !== channels.length) {
    fail("REALITY_INTEGRATION_ENVELOPE_CHANNELS_INVALID");
  }
  for (const row of channels) {
    if (!exactKeys(row, ["channelId", "kind", "unit", "cap", "aggregation",
      "affectedPartyRootHashes", "alreadyCommitted", "requested", "currentCommitment",
      "projected", "status", "nonCompensable"])
      || !TOKEN.test(row.channelId ?? "") || !TOKEN.test(row.kind ?? "")
      || !TOKEN.test(row.unit ?? "") || !TOKEN.test(row.aggregation ?? "")
      || ![row.cap, row.alreadyCommitted, row.requested, row.currentCommitment,
        row.projected].every((item) => Number.isSafeInteger(item) && item >= 0)
      || row.currentCommitment !== row.requested
      || row.projected !== row.alreadyCommitted + row.requested
      || row.status !== "PASS" || row.nonCompensable !== true
      || !same(sortedUniqueHashes(row.affectedPartyRootHashes,
        "REALITY_INTEGRATION_ENVELOPE_CHANNEL_PARTIES_INVALID", { minimum: 1 }),
      row.affectedPartyRootHashes)
      || row.affectedPartyRootHashes.some((party) => !parties.includes(party))) {
      fail("REALITY_INTEGRATION_ENVELOPE_CHANNEL_BINDING_INVALID");
    }
  }
  if (!exactKeys(record.budget, ["priorCommitmentHashes", "currentCommitmentHash",
    "allCommitmentHashes", "currentClaimHash", "completeness",
    "externalLedgerCompletenessVerified"])
    || record.budget.currentClaimHash !== record.claimHash
    || record.budget.completeness !== "OPERATOR_OBSERVED_NOT_EXTERNALLY_COMPLETE"
    || record.budget.externalLedgerCompletenessVerified !== false) {
    fail("REALITY_INTEGRATION_ENVELOPE_BUDGET_INVALID");
  }
  const prior = sortedUniqueHashes(record.budget.priorCommitmentHashes,
    "REALITY_INTEGRATION_ENVELOPE_PRIOR_BUDGET_INVALID");
  const all = sortedUniqueHashes(record.budget.allCommitmentHashes,
    "REALITY_INTEGRATION_ENVELOPE_ALL_BUDGET_INVALID", { minimum: 1 });
  if (!HASH.test(record.budget.currentCommitmentHash ?? "")
    || !same(all, [...prior, record.budget.currentCommitmentHash].sort())) {
    fail("REALITY_INTEGRATION_ENVELOPE_BUDGET_SET_INVALID");
  }
  const expectedAnchor = digest(DOMAIN.sourceAnchor, {
    stage05ManifestHash: record.sources.stage05.manifestHash,
    stage05PublicEvidenceHash: record.sources.stage05.publicEvidenceHash,
    attestationHash: record.sources.stage05.attestationHash,
    curateIntentHash: record.intentHash,
    curateCheckpointHash: record.sources.curate.checkpointHash,
    executionHash: record.executionHash,
  });
  if (record.sourceEvidenceAnchorHash !== expectedAnchor
    || !exactKeys(record.consequenceObligations, ["executedAt", "horizons",
      "obligationSetHash", "everyMandatoryHorizonBound", "allConsequenceReportsBound",
      "obligationOpen", "canClose", "externalClosureRequired",
      "externalClosureEligibilityVerified"])
    || record.consequenceObligations.everyMandatoryHorizonBound !== true
    || record.consequenceObligations.allConsequenceReportsBound !== false
    || record.consequenceObligations.obligationOpen !== true
    || record.consequenceObligations.canClose !== false
    || record.consequenceObligations.externalClosureRequired !== true
    || record.consequenceObligations.externalClosureEligibilityVerified !== false) {
    fail("REALITY_INTEGRATION_ENVELOPE_OBLIGATION_BOUNDARY_INVALID");
  }
  const executedAt = iso(record.consequenceObligations.executedAt,
    "REALITY_INTEGRATION_ENVELOPE_EXECUTED_AT_INVALID");
  const createdAt = iso(record.createdAt, "REALITY_INTEGRATION_ENVELOPE_CREATED_AT_INVALID");
  const horizons = record.consequenceObligations.horizons;
  if (!Array.isArray(horizons) || horizons.length === 0
    || new Set(horizons.map((item) => item?.horizonId)).size !== horizons.length) {
    fail("REALITY_INTEGRATION_ENVELOPE_HORIZONS_INVALID");
  }
  for (const horizon of horizons) {
    if (!exactKeys(horizon, ["horizonId", "closesAfterMs", "dueAt", "mandatory",
      "status", "consequenceReportHash", "sourceEvidenceAnchorHash",
      "obligationOpen", "canClose"])
      || !TOKEN.test(horizon.horizonId ?? "")
      || !Number.isSafeInteger(horizon.closesAfterMs) || horizon.closesAfterMs < 0
      || horizon.dueAt !== new Date(Date.parse(executedAt)
        + horizon.closesAfterMs).toISOString()
      || horizon.mandatory !== true
      || horizon.status !== (Date.parse(createdAt) >= Date.parse(horizon.dueAt)
        ? "REPORT_DUE_OR_OVERDUE" : "OPEN_UNTIL_DUE")
      || horizon.consequenceReportHash !== null
      || horizon.sourceEvidenceAnchorHash !== expectedAnchor
      || horizon.obligationOpen !== true || horizon.canClose !== false) {
      fail("REALITY_INTEGRATION_ENVELOPE_HORIZON_BINDING_INVALID");
    }
  }
  if (record.consequenceObligations.obligationSetHash
    !== digest(DOMAIN.obligations, horizons)) {
    fail("REALITY_INTEGRATION_ENVELOPE_OBLIGATION_SET_INVALID");
  }
}

export function verifySourceBoundRealityAdvisoryEnvelope(record, sources = null) {
  try {
    if (!verifySeal(record, REALITY_INTEGRATION_SCHEMAS.advisoryEnvelope,
      DOMAIN.advisoryEnvelope, ENVELOPE_KEYS, "envelopeHash")
      || record.advisoryDisposition
        !== "HOLD_EXTERNAL_OWNER_LEDGER_AND_OPEN_CONSEQUENCES"
      || !same(record.denyReasons, [
        "AFFECTED_PARTY_STANDING_NOT_EXTERNALLY_VERIFIED",
        "CONSEQUENCE_OBLIGATIONS_OPEN",
        "EXTERNAL_LEDGER_COMPLETENESS_NOT_VERIFIED",
        "EXTERNAL_OWNER_ADOPTION_NOT_VERIFIED",
      ])
      || !same(record.boundary, noAuthorityBoundary())) {
      fail("REALITY_INTEGRATION_ENVELOPE_INVALID");
    }
    validateEnvelopeInternals(record);
    if (sources !== null) {
      if (!plain(sources)) fail("REALITY_INTEGRATION_SOURCE_SET_INVALID");
      const rebuilt = createSourceBoundRealityAdvisoryEnvelope({
        ...sources,
        createdAt: record.createdAt,
      });
      if (!same(record, rebuilt)) fail("REALITY_INTEGRATION_ENVELOPE_SOURCE_MISMATCH");
    }
    return {
      ok: true,
      envelopeHash: record.envelopeHash,
      verificationLevel: sources === null ? "SELF_CHECK_ONLY"
        : "LOCAL_PROTOCOL_SOURCES_REPLAYED",
      localProtocolSourcesReplayed: sources !== null,
      stage05EvidenceBytesReverified: sources !== null,
      attestationDerivationReverified: sources !== null,
      curateProtocolDerivationReverified: sources !== null,
      rawCurateSourceObjectBytesReverified: false,
      externalLedgerCompletenessVerified: false,
      externalOwnerAdoptionVerified: false,
      affectedPartyStandingExternallyVerified: false,
      executionAuthorized: false,
      priceAuthorized: false,
      closureAuthorized: false,
    };
  } catch (error) {
    return { ok: false, error: String(error?.message ?? error) };
  }
}

export function describeRealityIntegrationMachineBoundary() {
  return deepFreeze({
    sourceBinding: "Stage05 sealed bytes + exact single-run signed ATTEST + replayed CURATE derivation",
    externalTruth: "not established by local hashes",
    ownerGate: "missing; fail closed",
    cumulativeLedger: "operator-observed only; fail closed",
    affectedPartyStanding: "not externally verified",
    delayedConsequences: "every mandatory horizon remains open until separately reported",
    permissions: noAuthorityBoundary().permits,
  });
}
