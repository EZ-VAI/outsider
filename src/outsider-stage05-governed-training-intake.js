/*
 * First-party Stage 0.5 -> governed-trainer intake diagnostic.
 *
 * This adapter deliberately stops before training. It source-replays every
 * locally discovered Stage 0.5 supervised sidecar, measures the exact gates
 * needed by the governed trainer, and emits only aggregate counts and hashes.
 * Raw paths, prompts, source payloads, session identifiers, and PII are never
 * projected into the diagnostic.
 */

import { createHash } from "node:crypto";
import {
  closeSync, constants as fsConstants, fstatSync, lstatSync, openSync,
  readFileSync, readdirSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { canonicalizeStrict } from "./canonical.js";
import {
  buildSupervisedExperienceV2,
  supervisedExperienceModelInput,
  verifySupervisedExperienceV2,
} from "./outsider-supervised-experience.js";
import { verifyStage05RunDirectory } from "./outsider-stage05-evidence.js";

export const STAGE05_GOVERNED_TRAINING_INTAKE_SCHEMA
  = "outsider/stage05-governed-training-intake-diagnostic/v1";

export const STAGE05_GOVERNED_TRAINING_INTAKE_CANONICAL = Object.freeze({
  generatedAt: "2026-08-22T09:00:00.000Z",
  canonicalRelease: "final-v1",
  repositoryRelativePath:
    "artifacts/stage05-governed-training-intake-20260822/final-v1/diagnostic.json",
  artifactHash:
    "sha256:cfec99c676390cbfc0d4af2b66e2baac2a71dd8e37c869b8d0c87ee11061b44b",
  artifactFileHash:
    "sha256:ac01a5471ac70f619af093af441408aa94ba3e82ff77e7efcceaaea1c6dbbf19",
  artifactFileBytes: 7_341,
});

const HASH = /^sha256:[a-f0-9]{64}$/u;
const SIDECAR_NAME = "stage05-supervised-experience.json";
const MAX_JSON_BYTES = 32 * 1024 * 1024;
const REPOSITORY_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)), "..",
);
const ROOT_FIELDS = Object.freeze([
  "controllerImplementationHash", "wayHash", "claimRefHash", "worldRefHash",
  "authorityRefHash",
]);
const FEATURE_FIELDS = Object.freeze([
  "nSteps", "costUsd", "costVsPeer", "claimedPass", "claimedDone",
  "ranTestClaim", "world.reversible", "world.externality",
]);
const OPTIONAL_REBUILD_FILES = Object.freeze({
  witness: "endurance-witness.json",
  preregistration: "endurance-preregistration.json",
  agentTeamPreregistration: "agent-team-probe-preregistration.json",
  r4Recovery: "r4-recovery-result.json",
});

function fail(code) {
  throw new Error(`STAGE05_GOVERNED_TRAINING_INTAKE_${code}`);
}

function plain(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function exactKeys(value, keys) {
  return plain(value)
    && Object.keys(value).sort().join("\0") === [...keys].sort().join("\0");
}

function same(left, right) {
  try { return canonicalizeStrict(left) === canonicalizeStrict(right); }
  catch { return false; }
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function digest(domain, value) {
  return `sha256:${createHash("sha256")
    .update(`${domain}\0${canonicalizeStrict(value)}`, "utf8").digest("hex")}`;
}

function digestBytes(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function canonicalTime(value) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) return null;
  const normalized = new Date(value).toISOString();
  return normalized === value ? normalized : null;
}

function countBy(values) {
  return Object.fromEntries([...new Set(values)].sort().map((value) => [
    value, values.filter((candidate) => candidate === value).length,
  ]));
}

function stableRead(filePath, maximumBytes = MAX_JSON_BYTES) {
  let descriptor;
  try {
    descriptor = openSync(filePath,
      fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0));
    const before = fstatSync(descriptor, { bigint: true });
    if (!before.isFile() || before.size <= 0n
      || before.size > BigInt(maximumBytes)) fail("SOURCE_FILE_SIZE_INVALID");
    const bytes = readFileSync(descriptor);
    const after = fstatSync(descriptor, { bigint: true });
    if (before.dev !== after.dev || before.ino !== after.ino
      || before.size !== after.size || before.mtimeNs !== after.mtimeNs
      || before.ctimeNs !== after.ctimeNs || BigInt(bytes.length) !== after.size) {
      fail("SOURCE_FILE_CHANGED_DURING_READ");
    }
    return bytes;
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function readJson(filePath) {
  try { return JSON.parse(stableRead(filePath).toString("utf8")); }
  catch (error) {
    if (error instanceof SyntaxError) fail("SOURCE_JSON_INVALID");
    throw error;
  }
}

function optionalJson(directory, name) {
  const filePath = path.join(directory, name);
  try {
    const stat = lstatSync(filePath);
    if (!stat.isFile() || stat.isSymbolicLink()) return null;
    return readJson(filePath);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

function requiredRoot(input) {
  if (!exactKeys(input, ["artifactsRootPath"])
    || typeof input.artifactsRootPath !== "string"
    || input.artifactsRootPath.length === 0
    || input.artifactsRootPath.includes("\0")) fail("INPUT_SCHEMA_INVALID");
  const resolved = path.resolve(input.artifactsRootPath);
  if (resolved === path.parse(resolved).root) fail("ARTIFACTS_ROOT_TOO_BROAD");
  const stat = lstatSync(resolved);
  if (!stat.isDirectory() || stat.isSymbolicLink()) fail("ARTIFACTS_ROOT_INVALID");
  return resolved;
}

function discoverSidecars(root) {
  const files = [];
  let symbolicLinksSkipped = 0;
  const walk = (directory) => {
    const entries = readdirSync(directory, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const target = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) {
        symbolicLinksSkipped += 1;
      } else if (entry.isDirectory()) {
        walk(target);
      } else if (entry.isFile() && entry.name === SIDECAR_NAME) {
        files.push(target);
      }
    }
  };
  walk(root);
  return { files: files.sort(), symbolicLinksSkipped };
}

function completeRoots(record) {
  const group = record?.attestationCompatibility?.groupKey;
  if (!plain(group)) return null;
  const roots = ROOT_FIELDS.map((field) => group[field]);
  return roots.every((value) => HASH.test(value ?? "")) ? roots : null;
}

function featureAudit(record) {
  let model;
  try { model = supervisedExperienceModelInput(record); }
  catch { return { complete: false, missing: [...FEATURE_FIELDS] }; }
  const missing = [];
  if (!Number.isSafeInteger(model.features?.nSteps)
    || model.features.nSteps < 0) missing.push("nSteps");
  if (!Number.isFinite(model.features?.costUsd)
    || model.features.costUsd < 0) missing.push("costUsd");
  if (!Number.isFinite(model.features?.costVsPeer)
    || model.features.costVsPeer < 0) missing.push("costVsPeer");
  for (const key of ["claimedPass", "claimedDone", "ranTestClaim"]) {
    if (typeof model.features?.[key] !== "boolean") missing.push(key);
  }
  if (typeof model.world?.reversible !== "boolean") {
    missing.push("world.reversible");
  }
  if (typeof model.world?.externality !== "boolean") {
    missing.push("world.externality");
  }
  return { complete: missing.length === 0, missing, model };
}

function explicitRightsContract(record) {
  const rights = record?.governedTrainingIntake?.rights;
  return plain(rights)
    && rights.ownerControlledTrainingUseAuthorized === true
    && HASH.test(rights.authorizationAuthorityHash ?? "")
    && HASH.test(rights.authorizationReceiptHash ?? "")
    && rights.authorizationScope === "GOVERNED_BEHAVIOR_SHADOW_TRAINING";
}

function explicitPreActionSnapshot(record) {
  const snapshot = record?.governedTrainingIntake?.preActionFeatureSnapshot;
  const snapshotAt = canonicalTime(snapshot?.snapshotAt);
  const actionStartedAt = canonicalTime(snapshot?.actionStartedAt);
  const outcomeObservedAt = canonicalTime(record?.source?.observedAt);
  return plain(snapshot) && snapshotAt && actionStartedAt && outcomeObservedAt
    && snapshotAt < actionStartedAt && actionStartedAt < outcomeObservedAt
    && HASH.test(snapshot.snapshotHash ?? "")
    && snapshot.labelFieldsExcluded === true
    && snapshot.frozenBeforeAction === true;
}

function explicitPrivacyContract(record) {
  const privacy = record?.governedTrainingIntake?.privacy;
  return plain(privacy)
    && HASH.test(privacy.reviewReceiptHash ?? "")
    && privacy.rawPromptsExcluded === true
    && privacy.rawSourcePayloadsExcluded === true
    && privacy.directIdentifiersExcluded === true
    && privacy.trainingPrivacyPermissionEstablished === true;
}

function projectionHasObviousRawIdentity(model) {
  if (!plain(model)) return true;
  const forbiddenKeys = new Set([
    "prompt", "instruction", "cwd", "absolutePath", "filePath", "email",
    "personName", "sourceText", "rawSource", "sessionId",
  ]);
  let unsafe = false;
  const visit = (value) => {
    if (unsafe || value === null || value === undefined) return;
    if (typeof value === "string") {
      if (value.startsWith("/Users/") || value.startsWith("file://")
        || /[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/u.test(value)) unsafe = true;
      return;
    }
    if (Array.isArray(value)) {
      for (const child of value) visit(child);
      return;
    }
    if (typeof value === "object") {
      for (const [key, child] of Object.entries(value)) {
        if (forbiddenKeys.has(key)) unsafe = true;
        visit(child);
      }
    }
  };
  visit(model);
  return unsafe;
}

function rebuildCurrentRecord(directory, verified) {
  const events = stableRead(path.join(directory, "events.jsonl"),
    256 * 1024 * 1024).toString("utf8").split("\n")
    .filter(Boolean).map((line) => JSON.parse(line));
  return buildSupervisedExperienceV2({
    verified,
    events,
    witness: optionalJson(directory, OPTIONAL_REBUILD_FILES.witness),
    preregistration: optionalJson(directory,
      OPTIONAL_REBUILD_FILES.preregistration),
    agentTeamPreregistration: optionalJson(directory,
      OPTIONAL_REBUILD_FILES.agentTeamPreregistration),
    r4Recovery: optionalJson(directory, OPTIONAL_REBUILD_FILES.r4Recovery),
  });
}

class UnionFind {
  constructor(size) {
    this.parent = [...Array(size).keys()];
  }

  find(value) {
    if (this.parent[value] !== value) this.parent[value] = this.find(this.parent[value]);
    return this.parent[value];
  }

  union(left, right) {
    const a = this.find(left), b = this.find(right);
    if (a !== b) this.parent[b] = a;
  }
}

function componentAudit(rows) {
  const eligible = rows.filter((row) => row.roots);
  if (eligible.length === 0) {
    return { componentCount: 0, largestComponentRows: 0 };
  }
  const union = new UnionFind(eligible.length);
  const owner = new Map();
  eligible.forEach((row, index) => {
    for (const root of row.roots) {
      if (owner.has(root)) union.union(index, owner.get(root));
      else owner.set(root, index);
    }
  });
  const sizes = new Map();
  eligible.forEach((_, index) => {
    const component = union.find(index);
    sizes.set(component, (sizes.get(component) ?? 0) + 1);
  });
  return {
    componentCount: sizes.size,
    largestComponentRows: Math.max(...sizes.values()),
  };
}

function sourceAudit(artifactsRoot) {
  const discovery = discoverSidecars(artifactsRoot);
  const rows = [];
  const refusalReasons = [];
  for (const filePath of discovery.files) {
    const bytes = stableRead(filePath);
    const relative = path.relative(artifactsRoot, filePath);
    const row = {
      sourceFileHash: digestBytes(bytes),
      sourceFileBytes: bytes.length,
      privateLocatorHash: digest(
        "outsider/stage05-governed-training-private-locator/v1", relative),
      parsed: false,
      record: null,
      recordValid: false,
      recordHash: null,
      runReplayed: false,
      sourceBound: false,
      currentExtractorExactRebuild: false,
      observedAtCanonical: false,
      runComplete: false,
      sealedCausalOutcome: false,
      roots: null,
      feature: { complete: false, missing: [...FEATURE_FIELDS] },
      rights: false,
      preAction: false,
      privacyContract: false,
      modelProjectionObviousRawIdentityFree: false,
      admissible: false,
    };
    try {
      row.record = JSON.parse(bytes.toString("utf8"));
      row.parsed = true;
      const checked = verifySupervisedExperienceV2(row.record);
      row.recordValid = checked.ok;
      if (!checked.ok) throw new Error(checked.error);
      row.recordHash = row.record.recordHash;
      const directory = path.dirname(filePath);
      const verified = verifyStage05RunDirectory(directory);
      row.runReplayed = verified.ok === true;
      if (!verified.ok) throw new Error(verified.error);
      const bound = verifySupervisedExperienceV2(row.record, { verified });
      row.sourceBound = bound.ok;
      if (!bound.ok) throw new Error(bound.error);
      const rebuilt = rebuildCurrentRecord(directory, verified);
      row.currentExtractorExactRebuild = same(rebuilt, row.record);
      row.observedAtCanonical = canonicalTime(row.record.source?.observedAt) !== null;
      row.runComplete = row.record.terminal?.runStatus === "complete";
      row.sealedCausalOutcome = Array.isArray(row.record.causalChains)
        && row.record.causalChains.some((chain) => chain.sealedComplete === true);
      row.roots = completeRoots(row.record);
      row.feature = featureAudit(row.record);
      row.rights = explicitRightsContract(row.record);
      row.preAction = explicitPreActionSnapshot(row.record);
      row.privacyContract = explicitPrivacyContract(row.record);
      row.modelProjectionObviousRawIdentityFree
        = !projectionHasObviousRawIdentity(row.feature.model);
      row.admissible = row.recordValid && row.runReplayed && row.sourceBound
        && row.currentExtractorExactRebuild && row.observedAtCanonical
        && row.runComplete && row.sealedCausalOutcome && row.roots !== null
        && row.feature.complete && row.rights && row.preAction
        && row.privacyContract && row.modelProjectionObviousRawIdentityFree;
    } catch (error) {
      refusalReasons.push(String(error instanceof Error ? error.message : error));
    }
    rows.push(row);
  }
  return { rows, refusalReasons, ...discovery };
}

function fixedCaptureContract() {
  return {
    schema: "outsider/stage05-governed-training-prospective-capture-contract/v1",
    createBeforeAnyAdmittedActionOrOutcome: true,
    requiredPerRowBindings: [
      "stage05ManifestHash", "eventChainHash", "preActionSnapshotHash",
      "outcomeReceiptHash", "rightsAuthorizationReceiptHash",
      "privacyReviewReceiptHash", "completeCorrelationRootAttestationHash",
    ],
    rightsGate: {
      ownerControlledTrainingUseAuthorized: true,
      authorizationScope: "GOVERNED_BEHAVIOR_SHADOW_TRAINING",
      authorizationAuthorityHashRequired: true,
      authorizationReceiptHashRequired: true,
      publicAvailabilityAloneIsAuthorization: false,
    },
    preActionGate: {
      strictOrder: "preregistrationAt < snapshotAt < actionStartedAt < outcomeObservedAt",
      snapshotHashRequired: true,
      labelFieldsExcluded: true,
      featureValuesFrozenBeforeAction: true,
      requiredFeatureFields: [...FEATURE_FIELDS],
      implicitMissingValueImputationPermitted: false,
    },
    outcomeGate: {
      sourceReplayRequired: true,
      sealedCausalOutcomeRequired: true,
      independentVerifierReceiptRequired: true,
      labelDefinitionFeatureOverlapAuditRequired: true,
    },
    correlationGate: {
      requiredRootFields: [...ROOT_FIELDS],
      rootCompletenessAttestationRequired: true,
      sharedRootConnectedComponentsAreIndivisible: true,
    },
    privacyGate: {
      rawPromptsExcluded: true,
      rawSourcePayloadsExcluded: true,
      directIdentifiersExcluded: true,
      trainingPrivacyPermissionRequired: true,
      reviewReceiptHashRequired: true,
    },
    cohortGate: {
      minimumRecords: 60,
      minimumKnownRootConnectedComponents: 12,
      separateTrainCalibrationTestComponentsRequired: true,
      strictComponentTimeOrderRequired: true,
      minimumPositiveBearingComponentsPerSplit: 3,
      minimumNegativeBearingComponentsPerSplit: 3,
      outOfDomainTestRequired: true,
      externallyTimestampedOutcomeBlindPreregistrationRequired: true,
    },
  };
}

function diagnosticProjection(audit) {
  const rows = audit.rows;
  const valid = rows.filter((row) => row.recordValid);
  const recordHashCounts = new Map();
  for (const row of valid) {
    recordHashCounts.set(row.recordHash,
      (recordHashCounts.get(row.recordHash) ?? 0) + 1);
  }
  const duplicateRecordHashes = [...recordHashCounts.values()]
    .reduce((sum, count) => sum + Math.max(0, count - 1), 0);
  const components = componentAudit(valid);
  const rootUniqueCounts = Object.fromEntries(ROOT_FIELDS.map((field, index) => [
    field, new Set(valid.map((row) => row.roots?.[index]).filter(Boolean)).size,
  ]));
  const canonicalTimes = valid.map((row) => canonicalTime(row.record.source?.observedAt))
    .filter(Boolean).sort();
  const missingFeatureCounts = Object.fromEntries(FEATURE_FIELDS.map((field) => [
    field, valid.filter((row) => row.feature.missing.includes(field)).length,
  ]));
  const admissibleRows = rows.filter((row) => row.admissible).length;
  return {
    schema: STAGE05_GOVERNED_TRAINING_INTAKE_SCHEMA,
    schemaVersion: "1.0.0",
    generatedAt: STAGE05_GOVERNED_TRAINING_INTAKE_CANONICAL.generatedAt,
    artifactLifecycle: {
      objectKind: "FIRST_PARTY_STAGE05_GOVERNED_TRAINING_INTAKE_DIAGNOSTIC",
      canonicalRelease:
        STAGE05_GOVERNED_TRAINING_INTAKE_CANONICAL.canonicalRelease,
      canonicalRepositoryRelativePath:
        STAGE05_GOVERNED_TRAINING_INTAKE_CANONICAL.repositoryRelativePath,
      noClobberFreezeRequired: true,
      containsTrainingModel: false,
      containsRawSourceData: false,
      containsRawPaths: false,
      containsRawPrompts: false,
      containsDirectIdentifiers: false,
    },
    sourceSet: {
      sourceClass: "LOCAL_FIRST_PARTY_STAGE05_COMPLETED_RUN_SIDECARS",
      discoveryRootRole: "LOCAL_REPOSITORY_ARTIFACTS_ROOT",
      exactCandidateFilename: SIDECAR_NAME,
      thirdPartyWave5RowsIncluded: 0,
      candidatesDiscovered: rows.length,
      symbolicLinksSkipped: audit.symbolicLinksSkipped,
      candidateFileIdentitySetHash: digest(
        "outsider/stage05-governed-training-candidate-files/v1",
        rows.map((row) => ({ hash: row.sourceFileHash, bytes: row.sourceFileBytes }))
          .sort((left, right) => left.hash.localeCompare(right.hash)
            || left.bytes - right.bytes),
      ),
      privateLocatorSetHash: digest(
        "outsider/stage05-governed-training-private-locators/v1",
        rows.map((row) => row.privateLocatorHash).sort(),
      ),
      recordIdentitySetHash: digest(
        "outsider/stage05-governed-training-record-identities/v1",
        valid.map((row) => row.recordHash).sort(),
      ),
      pathDisclosure: "AGGREGATE_HASH_COMMITMENT_ONLY",
      sourcePayloadDisclosure: "NONE",
    },
    verificationAccounting: {
      jsonParsed: rows.filter((row) => row.parsed).length,
      supervisedRecordHashVerified: valid.length,
      uniqueRecordHashes: recordHashCounts.size,
      exactDuplicateRecordHashes: duplicateRecordHashes,
      fullStage05RunDirectoryReplayed:
        rows.filter((row) => row.runReplayed).length,
      sidecarBoundToReplayedRun:
        rows.filter((row) => row.sourceBound).length,
      currentExtractorExactRebuild:
        rows.filter((row) => row.currentExtractorExactRebuild).length,
      currentExtractorVersionOrProjectionDrift:
        rows.filter((row) => row.sourceBound
          && !row.currentExtractorExactRebuild).length,
      runStatusComplete: rows.filter((row) => row.runComplete).length,
      canonicalObservedAt: rows.filter((row) => row.observedAtCanonical).length,
      noncanonicalOrMissingObservedAt:
        rows.filter((row) => !row.observedAtCanonical).length,
      sourceReplayedSealedCausalOutcome:
        rows.filter((row) => row.sourceBound && row.sealedCausalOutcome).length,
      independentExternalOutcomeAuthorityEstablished: 0,
      refusalCount: audit.refusalReasons.length,
      refusalReasonDistribution: countBy(audit.refusalReasons),
    },
    labelAccounting: {
      fakedSuccessTrue: valid.filter((row) =>
        row.record.modelInput?.labels?.fakedSuccess === true).length,
      fakedSuccessFalse: valid.filter((row) =>
        row.record.modelInput?.labels?.fakedSuccess === false).length,
      neededCorrectionTrue: valid.filter((row) =>
        row.record.modelInput?.labels?.neededCorrection === true).length,
      neededCorrectionFalse: valid.filter((row) =>
        row.record.modelInput?.labels?.neededCorrection === false).length,
      labelsAreRetrospectiveCompletedRunDerivations: true,
      labelsAreProspectivelyFrozenPreActionSignals: false,
    },
    admissionAccounting: {
      explicitOwnerControlledTrainingRights:
        rows.filter((row) => row.rights).length,
      explicitTrainingPrivacyPermission:
        rows.filter((row) => row.privacyContract).length,
      explicitFrozenPreActionFeatureSnapshots:
        rows.filter((row) => row.preAction).length,
      completeGovernedTrainerFeatureVectors:
        rows.filter((row) => row.feature.complete).length,
      completeKnownRootIdentity:
        rows.filter((row) => row.roots !== null).length,
      obviousRawPathPromptOrEmailPatternFreeModelInput:
        rows.filter((row) => row.modelProjectionObviousRawIdentityFree).length,
      formalPrivacyReviewCompleted: 0,
      currentExtractorExactSourceBoundRows:
        rows.filter((row) => row.sourceBound
          && row.currentExtractorExactRebuild).length,
      allRequiredGatesSatisfiedRows: admissibleRows,
      missingFeatureCounts,
    },
    dependenceAccounting: {
      knownRootFields: [...ROOT_FIELDS],
      uniqueRootValuesByField: rootUniqueCounts,
      sharedRootFieldsAcrossAllVerifiedRows: ROOT_FIELDS.filter((field) =>
        rootUniqueCounts[field] === 1),
      knownRootConnectedComponents: components.componentCount,
      largestKnownRootConnectedComponentRows: components.largestComponentRows,
      allVerifiedRowsInOneKnownRootConnectedComponent:
        components.componentCount === 1 && components.largestComponentRows === valid.length,
      strictComponentTrainCalibrationTestSplitPossible:
        components.componentCount >= 3,
      defaultGovernedTrainerMinimumComponents: 12,
      independenceBeyondDeclaredRootsEstablished: false,
      earliestCanonicalObservedAt: canonicalTimes[0] ?? null,
      latestCanonicalObservedAt: canonicalTimes.at(-1) ?? null,
    },
    admissibilityConclusion: {
      nontrivialAdmissibleSetExists: admissibleRows > 0,
      decision: admissibleRows > 0
        ? "ADAPTER_REVIEW_REQUIRED_BEFORE_ANY_TRAINING"
        : "REFUSE_TRAINING_NO_ADMISSIBLE_ROWS",
      governedTrainerInvoked: false,
      preregistrationCreated: false,
      trainingReport: null,
      modelArtifact: null,
      primaryBlockingGates: [
        "OWNER_CONTROLLED_TRAINING_RIGHTS_NOT_ESTABLISHED",
        "FROZEN_PRE_ACTION_FEATURE_SNAPSHOT_NOT_PRESENT",
        "COMPLETE_TRAINER_FEATURE_VECTOR_NOT_PRESENT",
        "PRIVACY_PERMISSION_AND_REVIEW_NOT_ESTABLISHED",
        "KNOWN_ROOT_COMPONENT_SPLIT_UNAVAILABLE",
        "EXTERNALLY_TIMESTAMPED_OUTCOME_BLIND_PREREGISTRATION_NOT_PRESENT",
      ],
      thirdPartyRetrospectiveRowsForceAdmitted: false,
    },
    prospectiveCaptureContract: fixedCaptureContract(),
    targetBoundary: {
      targetDomainTransferEstablished: false,
      targetQuotedPrice: null,
      targetQuotedPriceRepresentsNumericZero: false,
      pricePermission: false,
      responsibilityUseEligible: false,
      operationalAuthorityGranted: false,
    },
  };
}

const ROOT_KEYS = Object.freeze([
  "schema", "schemaVersion", "generatedAt", "artifactLifecycle", "sourceSet",
  "verificationAccounting", "labelAccounting", "admissionAccounting",
  "dependenceAccounting", "admissibilityConclusion", "prospectiveCaptureContract",
  "targetBoundary", "artifactHash",
]);

export function buildStage05GovernedTrainingIntakeDiagnostic(input) {
  const artifactsRoot = requiredRoot(input);
  const body = diagnosticProjection(sourceAudit(artifactsRoot));
  const artifact = deepFreeze({
    ...body,
    artifactHash: digest(STAGE05_GOVERNED_TRAINING_INTAKE_SCHEMA, body),
  });
  const checked = verifyStage05GovernedTrainingIntakeStructure(artifact);
  if (!checked.ok) fail("SELF_VERIFICATION_FAILED");
  return artifact;
}

function safeInvalid(error, level = "INVALID") {
  return deepFreeze({
    ok: false,
    verificationLevel: level,
    sourceRunsReplayed: false,
    admissibleRows: 0,
    governedTrainerInvoked: false,
    targetQuotedPrice: null,
    pricePermission: false,
    responsibilityUseEligible: false,
    operationalAuthorityGranted: false,
    error: error instanceof Error ? error.message : String(error),
  });
}

export function verifyStage05GovernedTrainingIntakeStructure(artifact) {
  try {
    if (!exactKeys(artifact, ROOT_KEYS)
      || artifact.schema !== STAGE05_GOVERNED_TRAINING_INTAKE_SCHEMA
      || artifact.schemaVersion !== "1.0.0"
      || artifact.generatedAt
        !== STAGE05_GOVERNED_TRAINING_INTAKE_CANONICAL.generatedAt
      || !HASH.test(artifact.artifactHash ?? "")) fail("ARTIFACT_SCHEMA_INVALID");
    const { artifactHash, ...body } = artifact;
    if (artifactHash !== digest(STAGE05_GOVERNED_TRAINING_INTAKE_SCHEMA, body)
      || body.admissionAccounting.allRequiredGatesSatisfiedRows !== 0
      || body.admissibilityConclusion.nontrivialAdmissibleSetExists !== false
      || body.admissibilityConclusion.decision
        !== "REFUSE_TRAINING_NO_ADMISSIBLE_ROWS"
      || body.admissibilityConclusion.governedTrainerInvoked !== false
      || body.admissibilityConclusion.preregistrationCreated !== false
      || body.admissibilityConclusion.trainingReport !== null
      || body.admissibilityConclusion.modelArtifact !== null
      || body.sourceSet.thirdPartyWave5RowsIncluded !== 0
      || body.artifactLifecycle.containsTrainingModel !== false
      || body.artifactLifecycle.containsRawSourceData !== false
      || body.artifactLifecycle.containsRawPaths !== false
      || body.artifactLifecycle.containsRawPrompts !== false
      || body.artifactLifecycle.containsDirectIdentifiers !== false
      || body.targetBoundary.targetQuotedPrice !== null
      || body.targetBoundary.targetQuotedPriceRepresentsNumericZero !== false
      || body.targetBoundary.pricePermission !== false
      || body.targetBoundary.responsibilityUseEligible !== false
      || body.targetBoundary.operationalAuthorityGranted !== false) {
      fail("FIXED_REFUSAL_OR_HASH_INVALID");
    }
    return deepFreeze({
      ok: true,
      verificationLevel: "STRUCTURE_AND_HASH_ONLY_NO_SOURCE_REPLAY",
      sourceRunsReplayed: false,
      candidatesDiscovered: artifact.sourceSet.candidatesDiscovered,
      admissibleRows: 0,
      knownRootConnectedComponents:
        artifact.dependenceAccounting.knownRootConnectedComponents,
      governedTrainerInvoked: false,
      targetQuotedPrice: null,
      pricePermission: false,
      responsibilityUseEligible: false,
      operationalAuthorityGranted: false,
      artifactHash,
    });
  } catch (error) {
    return safeInvalid(error);
  }
}

export function verifyStage05GovernedTrainingIntakeAgainstSources(
  artifact, input,
) {
  const structural = verifyStage05GovernedTrainingIntakeStructure(artifact);
  if (!structural.ok) return structural;
  try {
    const expected = buildStage05GovernedTrainingIntakeDiagnostic(input);
    if (!same(expected, artifact)) fail("SOURCE_REBUILD_MISMATCH");
    return deepFreeze({
      ...structural,
      verificationLevel:
        "FULL_LOCAL_STAGE05_RUN_SOURCE_REPLAY_INTAKE_REFUSAL_VERIFIED",
      sourceRunsReplayed: true,
      sidecarsBoundToReplayedRuns:
        artifact.verificationAccounting.sidecarBoundToReplayedRun,
      currentExtractorExactRebuild:
        artifact.verificationAccounting.currentExtractorExactRebuild,
      rawSourceContentProjected: false,
      rawPathsProjected: false,
      rawPromptsProjected: false,
      directIdentifiersProjected: false,
    });
  } catch (error) {
    return safeInvalid(error, "FULL_SOURCE_REPLAY_FAILED");
  }
}

function canonicalPinsFinalized() {
  return HASH.test(STAGE05_GOVERNED_TRAINING_INTAKE_CANONICAL.artifactHash ?? "")
    && HASH.test(
      STAGE05_GOVERNED_TRAINING_INTAKE_CANONICAL.artifactFileHash ?? "",
    )
    && Number.isSafeInteger(
      STAGE05_GOVERNED_TRAINING_INTAKE_CANONICAL.artifactFileBytes,
    ) && STAGE05_GOVERNED_TRAINING_INTAKE_CANONICAL.artifactFileBytes > 0;
}

export function verifyStage05GovernedTrainingIntakeCanonicalStructure(
  artifactPath,
) {
  try {
    if (!canonicalPinsFinalized()) fail("CANONICAL_PINS_NOT_FINALIZED");
    if (typeof artifactPath !== "string" || artifactPath.length === 0
      || artifactPath.includes("\0")) fail("CANONICAL_PATH_INVALID");
    const resolved = path.resolve(artifactPath);
    const expected = path.resolve(REPOSITORY_ROOT,
      STAGE05_GOVERNED_TRAINING_INTAKE_CANONICAL.repositoryRelativePath);
    if (resolved !== expected) fail("CANONICAL_PATH_MISMATCH");
    const bytes = stableRead(resolved);
    if (bytes.length
        !== STAGE05_GOVERNED_TRAINING_INTAKE_CANONICAL.artifactFileBytes
      || digestBytes(bytes)
        !== STAGE05_GOVERNED_TRAINING_INTAKE_CANONICAL.artifactFileHash) {
      fail("CANONICAL_EXACT_BYTES_INVALID");
    }
    const artifact = JSON.parse(bytes.toString("utf8"));
    if (artifact.artifactHash
      !== STAGE05_GOVERNED_TRAINING_INTAKE_CANONICAL.artifactHash) {
      fail("CANONICAL_ARTIFACT_HASH_INVALID");
    }
    const structural = verifyStage05GovernedTrainingIntakeStructure(artifact);
    if (!structural.ok) return structural;
    return deepFreeze({
      ...structural,
      verificationLevel:
        "PINNED_CANONICAL_EXACT_BYTES_INTAKE_REFUSAL_STRUCTURE_ONLY",
      canonicalArtifactExactBytesVerified: true,
      artifactFileHash:
        STAGE05_GOVERNED_TRAINING_INTAKE_CANONICAL.artifactFileHash,
      artifactFileBytes:
        STAGE05_GOVERNED_TRAINING_INTAKE_CANONICAL.artifactFileBytes,
    });
  } catch (error) {
    return safeInvalid(error, "CANONICAL_STRUCTURE_INVALID");
  }
}
