#!/usr/bin/env node

import { createHash, randomBytes } from "node:crypto";
import {
  chmodSync, closeSync, constants, fchmodSync, fsyncSync, fstatSync, linkSync,
  lstatSync, mkdirSync, openSync, readFileSync, readdirSync, readlinkSync, realpathSync,
  rmSync, unlinkSync, writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalizeStrict } from "../src/canonical.js";

export const LOCAL_ARTIFACT_INDEX_SCHEMA = "outsider/local-artifact-canonical-index/v4";
export const LOCAL_ARTIFACT_DECLARATION_SCHEMA =
  "outsider/local-artifact-canonical-declaration/v2";
const EXACT_LINEAGE_MARKER_SCHEMA =
  "outsider/exact-artifact-lineage-supersession/v1";

const sha256 = (bytes) => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
const tagged = (domain, value) => sha256(Buffer.concat([
  Buffer.from(`${domain}\0`, "utf8"), Buffer.from(canonicalizeStrict(value), "utf8"),
]));
const exactKeys = (value, keys) => value && typeof value === "object"
  && !Array.isArray(value)
  && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());
const fail = (code, detail = "") => {
  throw new Error(`LOCAL_ARTIFACT_INDEX_${code}${detail ? `:${detail}` : ""}`);
};
const forbidFinderMetadata = (name, absolute) => {
  if (name === ".DS_Store") fail("FINDER_METADATA_FORBIDDEN", absolute);
};

function sameIdentity(left, right) {
  return left.dev === right.dev && left.ino === right.ino
    && left.mode === right.mode && left.size === right.size
    && left.mtimeNs === right.mtimeNs && left.ctimeNs === right.ctimeNs;
}

function sameNode(left, right) {
  return left.dev === right.dev && left.ino === right.ino
    && (left.mode & 0o170000n) === (right.mode & 0o170000n);
}

function safeDirectory(directory) {
  const stat = lstatSync(directory, { bigint: true });
  if (stat.isSymbolicLink() || !stat.isDirectory()) fail("DIRECTORY_UNSAFE", directory);
  return stat;
}

function safeFile(file) {
  const initial = lstatSync(file, { bigint: true });
  if (initial.isSymbolicLink() || !initial.isFile()) fail("FILE_UNSAFE", file);
  let descriptor;
  try {
    descriptor = openSync(file, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    const before = fstatSync(descriptor, { bigint: true });
    if (!before.isFile() || !sameIdentity(before, initial)) {
      fail("FILE_IDENTITY_CHANGED_BEFORE_READ", file);
    }
    const bytes = readFileSync(descriptor);
    const after = fstatSync(descriptor, { bigint: true });
    const finalPath = lstatSync(file, { bigint: true });
    if (!sameIdentity(after, before) || !sameIdentity(finalPath, before)) {
      fail("FILE_CHANGED_DURING_READ", file);
    }
    return bytes;
  } finally { if (descriptor != null) closeSync(descriptor); }
}

function safeWorkspaceFile(file) {
  const root = realpathSync(process.cwd());
  const target = path.resolve(file);
  const relative = path.relative(root, target);
  if (relative === ".." || relative.startsWith(`..${path.sep}`)
    || path.isAbsolute(relative)) fail("WORKSPACE_FILE_OUTSIDE_ROOT", file);
  let cursor = root;
  for (const component of relative.split(path.sep).slice(0, -1).filter(Boolean)) {
    cursor = path.join(cursor, component);
    const stat = lstatSync(cursor, { bigint: true });
    if (stat.isSymbolicLink() || !stat.isDirectory()) {
      fail("WORKSPACE_FILE_ANCESTOR_UNSAFE", cursor);
    }
  }
  return safeFile(target);
}

function directoryFiles(root, { quarantine = false } = {}) {
  const rootBefore = safeDirectory(root);
  const files = [];
  const walk = (directory) => {
    const before = safeDirectory(directory);
    for (const name of readdirSync(directory).sort()) {
      const absolute = path.join(directory, name);
      forbidFinderMetadata(name, absolute);
      const stat = lstatSync(absolute, { bigint: true });
      if (stat.isSymbolicLink()) {
        if (!quarantine) fail("SYMLINK_REJECTED", absolute);
        const target = readlinkSync(absolute);
        const afterLink = lstatSync(absolute, { bigint: true });
        if (!sameIdentity(stat, afterLink)) fail("SYMLINK_CHANGED_DURING_READ", absolute);
        files.push({ path: path.relative(root, absolute).replaceAll("\\", "/"),
          kind: "SYMLINK", target });
      }
      if (stat.isDirectory()) walk(absolute);
      else if (stat.isFile()) {
        const bytes = safeFile(absolute);
        files.push({ path: path.relative(root, absolute).replaceAll("\\", "/"),
          kind: "FILE", bytes: bytes.length, sha256: sha256(bytes) });
      } else if (!stat.isSymbolicLink()) fail("NONREGULAR_ENTRY", absolute);
    }
    const after = safeDirectory(directory);
    if (!sameIdentity(before, after)) fail("DIRECTORY_CHANGED_DURING_READ", directory);
  };
  walk(root);
  if (!sameIdentity(rootBefore, safeDirectory(root))) {
    fail("DIRECTORY_CHANGED_DURING_READ", root);
  }
  return files;
}

function directoryCommitment(root, domain, { quarantine = false } = {}) {
  const files = directoryFiles(root, { quarantine });
  return {
    directoryEntryCount: files.length,
    directoryFileCount: files.filter((entry) => entry.kind === "FILE").length,
    directorySymlinkCount: files.filter((entry) => entry.kind === "SYMLINK").length,
    directoryBytes: files.reduce((sum, file) => sum + (file.bytes ?? 0), 0),
    directoryHash: tagged(domain, files),
  };
}

function residualCommitments(familyRoot) {
  return readdirSync(familyRoot).filter((name) => {
    forbidFinderMetadata(name, path.join(familyRoot, name));
    return versionOf(name) == null;
  }).sort()
    .map((name) => {
      const absolute = path.join(familyRoot, name);
      const stat = lstatSync(absolute, { bigint: true });
      if (stat.isSymbolicLink()) return {
        path: name, kind: "SYMLINK", status: "NONCANONICAL_BYTE_BOUND_QUARANTINE",
        target: readlinkSync(absolute),
      };
      if (stat.isDirectory()) return {
        path: name, kind: "DIRECTORY", status: "NONCANONICAL_BYTE_BOUND_QUARANTINE",
        ...directoryCommitment(absolute,
          "outsider/local-family-nonrelease-directory/v1", { quarantine: true }),
      };
      if (stat.isFile()) {
        const bytes = safeFile(absolute);
        return { path: name, kind: "FILE", status: "NONCANONICAL_BYTE_BOUND_QUARANTINE",
          fileBytes: bytes.length, fileSha256: sha256(bytes) };
      }
      fail("NONREGULAR_ENTRY", absolute);
    });
}

const versionOf = (name) => /^final-v([1-9][0-9]*)$/u.exec(name)?.[1]
  ? Number(/^final-v([1-9][0-9]*)$/u.exec(name)[1]) : null;

const DECLARED_TIME_FIELDS = Object.freeze([
  "generatedAt", "asOf", "frozenAt", "createdAt", "indexedAt",
]);

function declaredTimeIdentity(artifact, detail) {
  for (const field of DECLARED_TIME_FIELDS) {
    if (artifact?.[field] == null) continue;
    const value = artifact[field];
    if (typeof value !== "string" || !Number.isFinite(Date.parse(value))
      || new Date(value).toISOString() !== value) {
      fail("ARTIFACT_DECLARED_TIME_INVALID", `${detail}:${field}`);
    }
    return { field, value };
  }
  return { field: null, value: null };
}

function requireExactLineageMarkerArtifactBindings(marker, {
  sourceFamily, sourceRelease, sourceCanonicalFile, sourceSemanticHashField,
  sourceArtifact, sourceBytes, targetFamily, targetRelease, targetCanonicalFile,
  targetSemanticHashField, targetArtifact, targetBytes,
}) {
  const sourcePath = `artifacts/${sourceFamily}/${sourceRelease}/${sourceCanonicalFile}`;
  const targetPath = `artifacts/${targetFamily}/${targetRelease}/${targetCanonicalFile}`;
  const sourceTime = declaredTimeIdentity(sourceArtifact, sourcePath);
  const targetTime = declaredTimeIdentity(targetArtifact, targetPath);
  const temporalStatus = sourceTime.value !== null && targetTime.value !== null
    ? "DECLARED_ARTIFACT_TIMES_NONDECREASING_LOCAL_BYTES_ONLY"
    : "DECLARED_ARTIFACT_TIME_UNAVAILABLE_NO_TEMPORAL_AUTHENTICITY_CLAIM";
  if (marker.schema !== EXACT_LINEAGE_MARKER_SCHEMA
    || marker.status !== "SUPERSEDED_EXACT_BYTES_PRESERVED"
    || marker.supersededFamily !== sourceFamily
    || marker.supersededRelease !== sourceRelease
    || marker.supersededArtifactPath !== sourcePath
    || marker.supersededSemanticHashField !== sourceSemanticHashField
    || marker.supersededArtifactHash !== sourceArtifact[sourceSemanticHashField]
    || marker.supersededArtifactFileHash !== sha256(sourceBytes)
    || marker.supersededArtifactFileBytes !== sourceBytes.length
    || marker.supersededArtifactBytesPreserved !== true
    || marker.successorFamily !== targetFamily
    || marker.supersededByRelease !== targetRelease
    || marker.currentCanonicalPath !== targetPath
    || marker.currentSemanticHashField !== targetSemanticHashField
    || marker.currentArtifactHash !== targetArtifact[targetSemanticHashField]
    || marker.currentArtifactFileHash !== sha256(targetBytes)
    || marker.currentArtifactFileBytes !== targetBytes.length
    || marker.previousDeclaredTimeField !== sourceTime.field
    || marker.previousDeclaredAt !== sourceTime.value
    || marker.currentDeclaredTimeField !== targetTime.field
    || marker.currentDeclaredAt !== targetTime.value
    || marker.temporalOrderingStatus !== temporalStatus
    || marker.lineageScope !== (sourceFamily === targetFamily
      ? "SAME_DECLARED_FAMILY_EXACT_SUCCESSOR"
      : "DECLARATION_AUTHORIZED_EXACT_CROSS_FAMILY_SUCCESSOR")
    || (sourceTime.value !== null && targetTime.value !== null
      && Date.parse(targetTime.value) < Date.parse(sourceTime.value))
    || marker.sourceArtifactsReverifiedByMarker !== false
    || marker.sourceTruthEstablishedByMarker !== false
    || marker.closureCredit !== 0
    || marker.causalExperienceUnits !== 0
    || marker.trainingAdmission !== false
    || marker.pricingAdmission !== false
    || marker.operationalAuthorityGranted !== false
    || marker.selectionAuthority
      !== "CODE_FIXED_EXACT_BYTE_LINEAGE_ROUTE_NOT_EVIDENCE_CURRENTNESS") {
    fail("EXACT_LINEAGE_MARKER_ARTIFACT_BINDING_INVALID",
      `${sourceFamily}:${sourceRelease}`);
  }
  return true;
}

const MARKER_KEYS = Object.freeze({
  [EXACT_LINEAGE_MARKER_SCHEMA]: [
    "causalExperienceUnits", "closureCredit", "currentArtifactFileBytes",
    "currentArtifactFileHash", "currentArtifactHash", "currentCanonicalPath",
    "currentDeclaredAt", "currentDeclaredTimeField", "currentSemanticHashField",
    "lineageScope", "markerHash", "operationalAuthorityGranted", "previousDeclaredAt",
    "previousDeclaredTimeField", "pricingAdmission", "reason", "schema",
    "schemaVersion", "selectionAuthority", "sourceArtifactsReverifiedByMarker",
    "sourceTruthEstablishedByMarker", "status", "successorFamily",
    "supersededArtifactBytesPreserved", "supersededArtifactFileBytes",
    "supersededArtifactFileHash", "supersededArtifactHash",
    "supersededArtifactPath", "supersededByRelease", "supersededFamily",
    "supersededRelease", "supersededSemanticHashField", "temporalOrderingStatus",
    "trainingAdmission",
  ],
  "outsider/actuarial-model-evolution-supersession/v1": [
    "currentCanonicalPath", "currentFrozenMathArtifactHash", "currentFrozenMathRelease",
    "currentSnapshotAsOf", "frozenMathArtifactHash", "futureDatedCanonicalAccepted",
    "markerHash", "operationalAuthorityGranted", "previousFrozenMathRelease",
    "previousGeneratedAt", "reason", "schema", "schemaVersion",
    "selectionAuthority", "status", "supersededArtifactBytesPreserved",
    "supersededArtifactFileBytes", "supersededArtifactFileHash",
    "supersededArtifactHash", "supersededArtifactPath", "supersededByRelease",
    "supersededRelease", "targetDomainTransferEstablished",
    "temporallyOrderedCurrentReceiptCount", "temporalQuarantineReceiptCount",
    "temporalQuarantineReferenceFactorCount",
    "factorsAdmittedForCurrentCoverage", "factorsAdmittedForCurrentRouting",
    "targetTrainingRowsAdmitted", "targetModelComponentsFitted",
    "targetPreActionPredictorsAdmitted", "targetPrice", "wave5PreActionAvailableRows",
    "wave5SourceNativeRows", "wave5TargetPredictorsAdmitted", "wave5TrainerRowsEnqueued",
  ],
  "outsider/artifact-supersession-marker/v1": [
    "currentArtifact", "currentGeneratedAt", "currentInternalCanonicalRelease",
    "factorDictionaryHash", "futureDatedCanonicalAccepted", "generatedAt",
    "operationalAuthorityGranted", "previousGeneratedAt",
    "previousInternalCanonicalRelease", "reason", "schema", "supersededArtifact",
    "targetDomainFactorsAdmitted", "targetDomainTransferEstablished",
    "wave5PreActionAvailableRows", "wave5SourceNativeRows",
    "wave5TargetPredictorEligibleRows", "wave5TargetPriceEligibleRows",
    "wave5TrainerRowsEnqueued",
  ],
  "outsider/artifact-supersession/v1": [
    "currentArtifactHash", "oldArtifactBytesPreserved", "reason",
    "replacementArtifactFileHash", "replacementArtifactHash",
    "rightsTermsSourceReplayed", "schema", "sourceArtifactsReverifiedByMarker",
    "status", "supersededArtifact", "supersededArtifactBytesPreserved",
    "supersededArtifactFileHash", "supersededArtifactHash", "supersededAt",
    "supersededBy", "supersededFileBytes", "supersededFileSha256",
  ],
  "outsider/directory-artifact-supersession/v1": [
    "currentReceiptHash", "oldArtifactBytesPreserved", "schema",
    "sourceArtifactsReverifiedByMarker", "status", "supersededBy",
    "supersededDirectoryCommitmentBeforeMarker", "supersededDirectoryFileBytesBeforeMarker",
    "supersededReceiptHash",
  ],
  "outsider/local-artifact-supersession-pointer/v1": [
    "canonical", "oldArtifactBytesPreserved", "schema",
    "sourceArtifactsReverifiedByThisMarker", "status", "superseded",
    "temporalAudit", "closureCredit", "causalExperienceUnits",
    "trainingAdmission", "pricingAdmission", "operationalAuthorityGranted",
  ],
  "outsider/real-case-responsibility-flywheel-supersession/v1": [
    "bridgeTrainerRowsEnqueued", "bridgeTrainingCandidateHeld",
    "candidateGeneratedAtUsedForReplay", "canonicalGeneratedAt",
    "clinicalTrialsRightsDetermination", "clinicalTrialsRightsTermsSourceReplayed",
    "clinicalTrialsSponsorOrPersonNamesPersisted",
    "clinicalTrialsStudyTermGroupOrRatePoolingPerformed",
    "clinicalTrialsTargetTransferEstablished", "clinicalTrialsTrainerRowsEnqueued",
    "markerHash", "operationalAuthorityGranted", "pastOrFutureCoherentResealAccepted",
    "previousArtifactBytesPreserved", "previousArtifactIsCurrentCanonical", "reason",
    "recordedAt", "schema", "successor", "successorRequiresFullSourceReplay",
    "superseded", "targetSpecificGapClosureCredit", "targetTransferEstablished",
    "waymoCrossLanePoolingPerformed", "wave5PreActionAvailableRows",
    "wave5SourceNativeRows", "wave5TargetPredictorEligibleRows",
    "wave5TrainerRowsEnqueued",
  ],
  "outsider/superseded-artifact/v1": [
    "canonical", "mustNotUseForClaims", "schema", "status",
  ],
});

const LEGACY_OUTCOME_MARKER_KEYS = Object.freeze([
  "canonicalArtifact", "canonicalArtifactHash", "canonicalDirectory",
  "canonicalVerificationLevel", "reason", "sourceArtifactsReverifiedByThisMarker",
  "status", "supersededArtifactHash",
]);

function versionsForFamily(familyRoot) {
  safeDirectory(familyRoot);
  return readdirSync(familyRoot).map((name) => ({ name, version: versionOf(name) }))
    .filter((entry) => entry.version != null).sort((a, b) => a.version - b.version);
}

function resolveSupersessionTarget(targetReference, family, canonicalFile,
  releaseName) {
  if (typeof targetReference !== "string" || targetReference.includes("\\")
    || path.isAbsolute(targetReference) || targetReference.includes("\0")) {
    fail("SUPERSESSION_TARGET_PATH_INVALID", `${family}:${releaseName}`);
  }
  let match = /^\.\.\/(final-v[1-9][0-9]*)(?:\/(.+))?$/u.exec(targetReference);
  if (!match) match = /^(final-v[1-9][0-9]*)(?:\/(.+))?$/u.exec(targetReference);
  if (!match) {
    const rooted = /^artifacts\/([^/]+)\/(final-v[1-9][0-9]*)(?:\/(.+))?$/u
      .exec(targetReference);
    if (!rooted || rooted[1] !== family) {
      fail("SUPERSESSION_TARGET_FOREIGN_FAMILY", `${family}:${releaseName}`);
    }
    match = [rooted[0], rooted[2], rooted[3]];
  }
  if (match[2] != null && match[2] !== canonicalFile) {
    fail("SUPERSESSION_TARGET_CANONICAL_FILE_INVALID", `${family}:${releaseName}`);
  }
  return Number(match[1].slice("final-v".length));
}

function supersessionMarker(directory, family, releaseName, version, canonicalFile,
  { crossFamilyTarget = null } = {}) {
  const markerNames = readdirSync(directory)
    .filter((name) => /supersed/iu.test(name) && name.endsWith(".json")).sort();
  if (markerNames.length !== 1) fail(markerNames.length === 0
    ? "SUPERSESSION_MARKER_MISSING" : "SUPERSESSION_MARKER_AMBIGUOUS", directory);
  const name = markerNames[0];
  const markerPath = path.join(directory, name);
  const bytes = safeFile(markerPath);
  let marker;
  try { marker = JSON.parse(bytes.toString("utf8")); }
  catch { fail("SUPERSESSION_MARKER_JSON_INVALID", markerPath); }
  if (!marker || typeof marker !== "object" || Array.isArray(marker)) {
    fail("SUPERSESSION_MARKER_SHAPE_INVALID", markerPath);
  }
  const schema = marker.schema ?? null;
  const allowed = schema === null ? LEGACY_OUTCOME_MARKER_KEYS : MARKER_KEYS[schema];
  if (!allowed || Object.keys(marker).some((key) => !allowed.includes(key))) {
    fail("SUPERSESSION_MARKER_SCHEMA_INVALID", `${family}:${releaseName}`);
  }
  if (schema === null && (!exactKeys(marker, LEGACY_OUTCOME_MARKER_KEYS)
    || !["SUPERSEDED_SOURCE_PROFILE_EXPANDED.json",
      "SUPERSEDED_PERMIT_TRANSCRIPTION_BOUNDARY.json",
      "SUPERSEDED_PRIVACY_BOUNDARY.json"].includes(name))) {
    fail("SUPERSESSION_LEGACY_MARKER_INVALID", `${family}:${releaseName}`);
  }
  let targetReference;
  if (schema === EXACT_LINEAGE_MARKER_SCHEMA) {
    const { markerHash, ...markerBody } = marker;
    if (!exactKeys(marker, MARKER_KEYS[EXACT_LINEAGE_MARKER_SCHEMA])
      || marker.schemaVersion !== "1.0.0"
      || markerHash !== tagged(EXACT_LINEAGE_MARKER_SCHEMA, markerBody)) {
      fail("EXACT_LINEAGE_MARKER_SCHEMA_OR_HASH_INVALID",
        `${family}:${releaseName}`);
    }
    targetReference = marker.currentCanonicalPath;
  } else if (schema === "outsider/actuarial-model-evolution-supersession/v1") {
    if (marker.status !== "SUPERSEDED" || marker.supersededRelease !== releaseName) {
      fail("SUPERSESSION_MARKER_SOURCE_INVALID", `${family}:${releaseName}`);
    }
    targetReference = marker.supersededByRelease;
  } else if (schema === "outsider/artifact-supersession-marker/v1") {
    targetReference = marker.currentArtifact?.path;
  } else if (schema === "outsider/artifact-supersession/v1"
    || schema === "outsider/directory-artifact-supersession/v1") {
    targetReference = marker.supersededBy;
  } else if (schema === "outsider/local-artifact-supersession-pointer/v1") {
    targetReference = marker.canonical?.path;
  } else if (schema
    === "outsider/real-case-responsibility-flywheel-supersession/v1") {
    targetReference = marker.successor?.path;
  } else if (schema === "outsider/superseded-artifact/v1") {
    targetReference = marker.canonical;
  } else if (schema === null) targetReference = marker.canonicalArtifact;
  if (typeof targetReference !== "string") {
    fail("SUPERSESSION_TARGET_MISSING", `${family}:${releaseName}`);
  }
  let targetVersion;
  let targetFamily = family;
  if (crossFamilyTarget) {
    const expectedTarget = `artifacts/${crossFamilyTarget.family}/`
      + `${crossFamilyTarget.release}/${crossFamilyTarget.canonicalFile}`;
    const exactLineageCrossTargetValid = schema === EXACT_LINEAGE_MARKER_SCHEMA
      && marker.successorFamily === crossFamilyTarget.family
      && marker.supersededByRelease === crossFamilyTarget.release
      && marker.currentCanonicalPath === expectedTarget;
    const actuatorCrossTargetValid = schema
        === "outsider/actuarial-model-evolution-supersession/v1"
      && marker.supersededByRelease === crossFamilyTarget.release
      && marker.currentCanonicalPath === expectedTarget;
    if (!exactLineageCrossTargetValid && !actuatorCrossTargetValid
      && targetReference !== expectedTarget) {
      fail("SUPERSESSION_CROSS_FAMILY_TARGET_EXACT_PATH_INVALID",
        `${family}:${releaseName}`);
    }
    targetReference = expectedTarget;
    targetVersion = versionOf(crossFamilyTarget.release);
    targetFamily = crossFamilyTarget.family;
  } else {
    targetVersion = resolveSupersessionTarget(targetReference, family,
      canonicalFile, releaseName);
  }
  if (targetVersion <= version) {
    fail(crossFamilyTarget ? "SUPERSESSION_CROSS_FAMILY_ROLLBACK"
      : "SUPERSESSION_TARGET_INVALID", `${family}:${releaseName}`);
  }
  return {
    markerPath: name,
    markerSchema: schema ?? "LEGACY_CODE_FIXED_OUTCOME_SUPERSESSION_MARKER",
    markerFileSha256: sha256(bytes),
    markerFileBytes: bytes.length,
    resolvedTargetRelease: `final-v${targetVersion}`,
    resolvedTargetVersion: targetVersion,
    resolvedTargetFamily: targetFamily,
    targetReference,
    marker,
  };
}

function validateDeclaration(declaration) {
  if (!exactKeys(declaration, [
    "schema", "indexedAt", "entries", "crossFamilyLineages",
  ])
    || declaration.schema !== LOCAL_ARTIFACT_DECLARATION_SCHEMA
    || !/^20\d\d-\d\d-\d\dT\d\d:\d\d:\d\d\.\d\d\dZ$/u.test(declaration.indexedAt)
    || !Array.isArray(declaration.entries) || !declaration.entries.length
    || !Array.isArray(declaration.crossFamilyLineages)) {
    fail("DECLARATION_INVALID");
  }
  const seen = new Set();
  for (const entry of declaration.entries) {
    const archived = entry?.selectionStatus
      === "ARCHIVED_CROSS_FAMILY_PREDECESSOR_ONLY";
    const expectedKeys = ["family", "currentRelease", "canonicalFile",
      "semanticHashField", ...(archived ? ["selectionStatus"] : [])];
    if (!exactKeys(entry, expectedKeys)
      || !/^[a-z0-9][a-z0-9-]+$/u.test(entry.family)
      || !/^final-v[1-9][0-9]*$/u.test(entry.currentRelease)
      || !/^[A-Za-z0-9._/-]+\.json$/u.test(entry.canonicalFile)
      || entry.canonicalFile.includes("..") || path.isAbsolute(entry.canonicalFile)
      || !/^[A-Za-z][A-Za-z0-9]*Hash$/u.test(entry.semanticHashField)
      || seen.has(entry.family)) fail("DECLARATION_ENTRY_INVALID", entry?.family);
    seen.add(entry.family);
  }
  const sorted = [...declaration.entries].sort((a, b) => a.family.localeCompare(b.family));
  if (canonicalizeStrict(sorted) !== canonicalizeStrict(declaration.entries)) {
    fail("DECLARATION_NOT_SORTED");
  }
  const lineagesByPredecessor = new Set();
  const sortedLineages = [...declaration.crossFamilyLineages].sort((left, right) =>
    left.predecessorFamily.localeCompare(right.predecessorFamily));
  if (canonicalizeStrict(sortedLineages)
    !== canonicalizeStrict(declaration.crossFamilyLineages)) {
    fail("DECLARATION_CROSS_FAMILY_LINEAGES_NOT_SORTED");
  }
  for (const lineage of declaration.crossFamilyLineages) {
    if (!exactKeys(lineage, [
      "predecessorFamily", "predecessorTerminalRelease",
      "predecessorArtifactHash", "predecessorArtifactFileHash",
      "predecessorArtifactFileBytes", "predecessorMarkerRepositoryRelativePath",
      "predecessorMarkerSchema",
      "predecessorMarkerHash",
      "predecessorMarkerFileHash", "predecessorMarkerFileBytes",
      "successorFamily", "successorEntryRelease", "successorArtifactHash",
      "successorArtifactFileHash", "successorArtifactFileBytes",
    ])
      || !seen.has(lineage.predecessorFamily)
      || !seen.has(lineage.successorFamily)
      || lineage.predecessorFamily === lineage.successorFamily
      || !/^final-v[1-9][0-9]*$/u.test(lineage.predecessorTerminalRelease)
      || !/^final-v[1-9][0-9]*$/u.test(lineage.successorEntryRelease)
      || !/^sha256:[a-f0-9]{64}$/u.test(lineage.predecessorArtifactHash)
      || !/^sha256:[a-f0-9]{64}$/u.test(lineage.predecessorArtifactFileHash)
      || !Number.isSafeInteger(lineage.predecessorArtifactFileBytes)
      || lineage.predecessorArtifactFileBytes <= 0
      || typeof lineage.predecessorMarkerRepositoryRelativePath !== "string"
      || ![
        "outsider/actuarial-model-evolution-supersession/v1",
        EXACT_LINEAGE_MARKER_SCHEMA,
      ].includes(lineage.predecessorMarkerSchema)
      || !/^sha256:[a-f0-9]{64}$/u.test(lineage.predecessorMarkerHash)
      || !/^sha256:[a-f0-9]{64}$/u.test(lineage.predecessorMarkerFileHash)
      || !Number.isSafeInteger(lineage.predecessorMarkerFileBytes)
      || lineage.predecessorMarkerFileBytes <= 0
      || !/^sha256:[a-f0-9]{64}$/u.test(lineage.successorArtifactHash)
      || !/^sha256:[a-f0-9]{64}$/u.test(lineage.successorArtifactFileHash)
      || !Number.isSafeInteger(lineage.successorArtifactFileBytes)
      || lineage.successorArtifactFileBytes <= 0
      || lineagesByPredecessor.has(lineage.predecessorFamily)) {
      fail("DECLARATION_CROSS_FAMILY_LINEAGE_INVALID",
        lineage?.predecessorFamily);
    }
    const predecessor = declaration.entries.find((entry) =>
      entry.family === lineage.predecessorFamily);
    const successor = declaration.entries.find((entry) =>
      entry.family === lineage.successorFamily);
    if (predecessor?.selectionStatus
        !== "ARCHIVED_CROSS_FAMILY_PREDECESSOR_ONLY"
      || predecessor.currentRelease !== lineage.predecessorTerminalRelease
      || lineage.predecessorMarkerRepositoryRelativePath
        !== `artifacts/${predecessor.family}/`
          + `${predecessor.currentRelease}/SUPERSEDED.json`
      || successor?.selectionStatus != null
      || versionOf(lineage.successorEntryRelease)
        > versionOf(successor.currentRelease)) {
      fail("DECLARATION_CROSS_FAMILY_ROLE_INVALID",
        lineage.predecessorFamily);
    }
    lineagesByPredecessor.add(lineage.predecessorFamily);
  }
  for (const entry of declaration.entries) {
    const archived = entry.selectionStatus
      === "ARCHIVED_CROSS_FAMILY_PREDECESSOR_ONLY";
    if (archived !== lineagesByPredecessor.has(entry.family)) {
      fail("DECLARATION_ARCHIVED_LINEAGE_BINDING_INVALID", entry.family);
    }
  }
  const familyEdges = new Map(declaration.crossFamilyLineages.map((lineage) =>
    [lineage.predecessorFamily, lineage.successorFamily]));
  for (const family of familyEdges.keys()) {
    const visited = new Set();
    let cursor = family;
    while (familyEdges.has(cursor)) {
      if (visited.has(cursor)) fail("DECLARATION_CROSS_FAMILY_CYCLE", family);
      visited.add(cursor);
      cursor = familyEdges.get(cursor);
    }
  }
}

export function buildLocalArtifactCanonicalIndex({ declaration, artifactsRoot = "artifacts",
  now = new Date() } = {}) {
  validateDeclaration(declaration);
  const nowMs = now instanceof Date ? now.getTime() : Date.parse(String(now));
  if (!Number.isFinite(nowMs) || Date.parse(declaration.indexedAt) > nowMs) {
    fail("DECLARATION_TIME_IN_FUTURE");
  }
  const root = path.resolve(artifactsRoot);
  const rootIdentity = safeDirectory(root);
  for (const name of readdirSync(root)) {
    forbidFinderMetadata(name, path.join(root, name));
  }
  const declared = new Set(declaration.entries.map((entry) => entry.family));
  const versionedFamilies = readdirSync(root).filter((name) => {
    const absolute = path.join(root, name);
    return lstatSync(absolute).isDirectory() && versionsForFamily(absolute).length > 0;
  }).sort();
  const undeclared = versionedFamilies.filter((family) => !declared.has(family));
  if (undeclared.length) fail("VERSIONED_FAMILY_UNDECLARED", undeclared.join(","));
  const missing = [...declared].filter((family) => !versionedFamilies.includes(family));
  if (missing.length) fail("DECLARED_FAMILY_MISSING", missing.join(","));

  const declaredEntriesByFamily = new Map(declaration.entries.map((entry) =>
    [entry.family, entry]));
  const crossFamilyLineageReceipts = declaration.crossFamilyLineages.map((lineage) => {
    const predecessor = declaredEntriesByFamily.get(lineage.predecessorFamily);
    const successor = declaredEntriesByFamily.get(lineage.successorFamily);
    const successorReleaseRoot = path.join(root, successor.family,
      lineage.successorEntryRelease);
    safeDirectory(successorReleaseRoot);
    const successorReleases = versionsForFamily(path.join(root, successor.family));
    if (!successorReleases
      .some((release) => release.name === lineage.successorEntryRelease)) {
      fail("CROSS_FAMILY_SUCCESSOR_ENTRY_RELEASE_MISSING", successor.family);
    }
    if (successorReleases[0]?.name !== lineage.successorEntryRelease) {
      fail("CROSS_FAMILY_SUCCESSOR_ENTRY_IS_NOT_FAMILY_ORIGIN",
        successor.family);
    }
    const successorArtifactPath = path.join(successorReleaseRoot,
      successor.canonicalFile);
    const successorReleaseFiles = directoryFiles(successorReleaseRoot);
    const successorFileCommitment = successorReleaseFiles.find((file) =>
      file.path === successor.canonicalFile);
    if (!successorFileCommitment) {
      fail("CROSS_FAMILY_SUCCESSOR_CANONICAL_FILE_MISSING", successor.family);
    }
    const successorBytes = safeFile(successorArtifactPath);
    if (successorBytes.length !== lineage.successorArtifactFileBytes
      || sha256(successorBytes) !== lineage.successorArtifactFileHash
      || successorFileCommitment.bytes !== lineage.successorArtifactFileBytes
      || successorFileCommitment.sha256
        !== lineage.successorArtifactFileHash) {
      fail("CROSS_FAMILY_SUCCESSOR_EXACT_BYTES_INVALID", successor.family);
    }
    let successorArtifact;
    try { successorArtifact = JSON.parse(successorBytes.toString("utf8")); }
    catch { fail("CROSS_FAMILY_SUCCESSOR_JSON_INVALID", successor.family); }
    if (successorArtifact[successor.semanticHashField]
      !== lineage.successorArtifactHash) {
      fail("CROSS_FAMILY_SUCCESSOR_SEMANTIC_HASH_INVALID", successor.family);
    }
    const successorDeclaredTime = declaredTimeIdentity(successorArtifact,
      `${successor.family}:${lineage.successorEntryRelease}`);
    if (successorDeclaredTime.value !== null
      && Date.parse(successorDeclaredTime.value) > Date.parse(declaration.indexedAt)) {
      fail("CROSS_FAMILY_SUCCESSOR_TIME_INVALID", successor.family);
    }
    return {
      predecessorFamily: predecessor.family,
      predecessorTerminalRelease: lineage.predecessorTerminalRelease,
      predecessorTerminalCanonicalPath:
        `artifacts/${predecessor.family}/${lineage.predecessorTerminalRelease}/`
          + predecessor.canonicalFile,
      predecessorArtifactHash: lineage.predecessorArtifactHash,
      predecessorArtifactFileHash: lineage.predecessorArtifactFileHash,
      predecessorArtifactFileBytes: lineage.predecessorArtifactFileBytes,
      predecessorMarkerRepositoryRelativePath:
        lineage.predecessorMarkerRepositoryRelativePath,
      predecessorMarkerSchema: lineage.predecessorMarkerSchema,
      predecessorMarkerHash: lineage.predecessorMarkerHash,
      predecessorMarkerFileHash: lineage.predecessorMarkerFileHash,
      predecessorMarkerFileBytes: lineage.predecessorMarkerFileBytes,
      successorFamily: successor.family,
      successorEntryRelease: lineage.successorEntryRelease,
      successorCanonicalPath:
        `artifacts/${successor.family}/${lineage.successorEntryRelease}/`
          + successor.canonicalFile,
      successorArtifactHash: lineage.successorArtifactHash,
      successorArtifactFileHash: lineage.successorArtifactFileHash,
      successorArtifactFileBytes: lineage.successorArtifactFileBytes,
      successorDeclaredTimeField: successorDeclaredTime.field,
      successorDeclaredAt: successorDeclaredTime.value,
      successorCurrentRelease: successor.currentRelease,
      successorEntryPrecedesOrEqualsCurrent:
        versionOf(lineage.successorEntryRelease)
          <= versionOf(successor.currentRelease),
      predecessorMarkerExactBytesVerified: false,
      predecessorMarkerSchemaVerified: false,
      predecessorMarkerTargetExactPathVerified: false,
      sameFamilySuccessorChainToCurrentEstablished: false,
      sourceArtifactsReverified: false,
      sourceTruthEstablished: false,
      targetTrainingOrPricingAuthorityGranted: false,
    };
  });
  const crossFamilyReceiptByPredecessor = new Map(
    crossFamilyLineageReceipts.map((receipt) =>
      [receipt.predecessorFamily, receipt]),
  );

  const entries = declaration.entries.map((declaredEntry) => {
    const familyRoot = path.join(root, declaredEntry.family);
    const releases = versionsForFamily(familyRoot);
    const currentVersion = versionOf(declaredEntry.currentRelease);
    const archivedLineage = crossFamilyReceiptByPredecessor
      .get(declaredEntry.family) ?? null;
    const archived = archivedLineage !== null;
    if (releases.at(-1)?.version !== currentVersion) {
      fail("CURRENT_RELEASE_NOT_HIGHEST", declaredEntry.family);
    }
    const available = new Set(releases.map((release) => release.version));
    const edges = new Map();
    const releaseHistory = [];
    for (const release of releases.filter((item) => item.version < currentVersion)) {
      const releaseRoot = path.join(familyRoot, release.name);
      const marker = supersessionMarker(releaseRoot, declaredEntry.family,
        release.name, release.version, declaredEntry.canonicalFile);
      const targets = [marker.resolvedTargetVersion]
        .filter((target) => target <= currentVersion && available.has(target));
      if (targets.length !== 1) fail("SUPERSESSION_TARGET_UNAVAILABLE",
        `${declaredEntry.family}:${release.name}`);
      edges.set(release.version, targets);
      const files = directoryFiles(releaseRoot);
      let exactLineageMarkerArtifactIdentityVerified = false;
      if (marker.markerSchema === EXACT_LINEAGE_MARKER_SCHEMA) {
        const targetRoot = path.join(familyRoot, marker.resolvedTargetRelease);
        safeDirectory(targetRoot);
        directoryFiles(targetRoot);
        const sourceBytes = safeFile(path.join(releaseRoot,
          declaredEntry.canonicalFile));
        const targetBytes = safeFile(path.join(targetRoot,
          declaredEntry.canonicalFile));
        let sourceArtifact, targetArtifact;
        try {
          sourceArtifact = JSON.parse(sourceBytes.toString("utf8"));
          targetArtifact = JSON.parse(targetBytes.toString("utf8"));
        } catch {
          fail("EXACT_LINEAGE_MARKER_ARTIFACT_JSON_INVALID",
            `${declaredEntry.family}:${release.name}`);
        }
        exactLineageMarkerArtifactIdentityVerified =
          requireExactLineageMarkerArtifactBindings(marker.marker, {
            sourceFamily: declaredEntry.family,
            sourceRelease: release.name,
            sourceCanonicalFile: declaredEntry.canonicalFile,
            sourceSemanticHashField: declaredEntry.semanticHashField,
            sourceArtifact,
            sourceBytes,
            targetFamily: declaredEntry.family,
            targetRelease: marker.resolvedTargetRelease,
            targetCanonicalFile: declaredEntry.canonicalFile,
            targetSemanticHashField: declaredEntry.semanticHashField,
            targetArtifact,
            targetBytes,
          });
      }
      releaseHistory.push({
        release: release.name,
        releaseDirectoryFileCount: files.length,
        releaseDirectoryBytes: files.reduce((sum, file) => sum + file.bytes, 0),
        releaseDirectoryHash: tagged("outsider/local-superseded-directory/v1", files),
        markerPath: marker.markerPath,
        markerSchema: marker.markerSchema,
        markerFileSha256: marker.markerFileSha256,
        markerFileBytes: marker.markerFileBytes,
        resolvedTargetRelease: marker.resolvedTargetRelease,
        exactLineageMarkerArtifactIdentityVerified,
      });
    }
    const reachesCurrent = (version, visited = new Set()) => {
      if (version === currentVersion) return true;
      if (visited.has(version)) return false;
      visited.add(version);
      return (edges.get(version) ?? []).some((target) => reachesCurrent(target, new Set(visited)));
    };
    for (const release of releases.filter((item) => item.version < currentVersion)) {
      if (!reachesCurrent(release.version)) fail("SUPERSESSION_CHAIN_BROKEN",
        `${declaredEntry.family}:${release.name}`);
    }
    const currentRoot = path.join(familyRoot, declaredEntry.currentRelease);
    if (!archived
      && readdirSync(currentRoot).some((name) => /supersed/iu.test(name))) {
      fail("CURRENT_RELEASE_MARKED_SUPERSEDED", declaredEntry.family);
    }
    let archivedTerminalSupersession = null;
    let archivedTerminalMarker = null;
    if (archived) {
      const successorEntry = declaredEntriesByFamily.get(
        archivedLineage.successorFamily,
      );
      const marker = supersessionMarker(currentRoot, declaredEntry.family,
        declaredEntry.currentRelease, currentVersion,
        declaredEntry.canonicalFile, { crossFamilyTarget: {
          family: archivedLineage.successorFamily,
          release: archivedLineage.successorEntryRelease,
          canonicalFile: successorEntry.canonicalFile,
        } });
      if (marker.markerFileSha256
          !== archivedLineage.predecessorMarkerFileHash
        || marker.markerFileBytes
          !== archivedLineage.predecessorMarkerFileBytes
        || marker.resolvedTargetFamily !== archivedLineage.successorFamily
        || marker.resolvedTargetRelease
          !== archivedLineage.successorEntryRelease
        || marker.markerPath
          !== path.basename(archivedLineage
            .predecessorMarkerRepositoryRelativePath)
        || marker.markerSchema !== archivedLineage.predecessorMarkerSchema
        || marker.marker.markerHash !== archivedLineage.predecessorMarkerHash
        || archivedLineage.predecessorMarkerRepositoryRelativePath
          !== `artifacts/${declaredEntry.family}/`
            + `${declaredEntry.currentRelease}/${marker.markerPath}`) {
        fail("CROSS_FAMILY_PREDECESSOR_MARKER_EXACT_IDENTITY_INVALID",
          declaredEntry.family);
      }
      const { markerHash, ...markerBody } = marker.marker;
      if (markerHash !== tagged(marker.markerSchema, markerBody)) {
        fail("CROSS_FAMILY_PREDECESSOR_MARKER_SEMANTIC_HASH_INVALID",
          declaredEntry.family);
      }
      archivedTerminalMarker = marker.marker;
      archivedLineage.predecessorMarkerExactBytesVerified = true;
      archivedLineage.predecessorMarkerSchemaVerified = true;
      archivedLineage.predecessorMarkerTargetExactPathVerified = true;
      archivedTerminalSupersession = {
        markerPath: marker.markerPath,
        markerSchema: marker.markerSchema,
        markerFileSha256: marker.markerFileSha256,
        markerFileBytes: marker.markerFileBytes,
        resolvedTargetFamily: marker.resolvedTargetFamily,
        resolvedTargetRelease: marker.resolvedTargetRelease,
        resolvedTargetCanonicalPath:
          `${marker.resolvedTargetFamily}/${marker.resolvedTargetRelease}/`
            + successorEntry.canonicalFile,
      };
    }
    const files = directoryFiles(currentRoot);
    const nonReleaseQuarantine = residualCommitments(familyRoot);
    const canonical = files.find((file) => file.path === declaredEntry.canonicalFile);
    if (!canonical) fail("CANONICAL_FILE_MISSING", declaredEntry.family);
    const canonicalBytes = safeFile(path.join(currentRoot,
      declaredEntry.canonicalFile));
    let body;
    try { body = JSON.parse(canonicalBytes.toString("utf8")); }
    catch { fail("CANONICAL_JSON_INVALID", declaredEntry.family); }
    const semanticHash = body[declaredEntry.semanticHashField];
    if (!/^sha256:[0-9a-f]{64}$/u.test(semanticHash)) {
      fail("CANONICAL_SEMANTIC_HASH_MISSING", declaredEntry.family);
    }
    if (archived) {
      if (semanticHash !== archivedLineage.predecessorArtifactHash
        || canonical.sha256 !== archivedLineage.predecessorArtifactFileHash
        || canonical.bytes !== archivedLineage.predecessorArtifactFileBytes) {
        fail("CROSS_FAMILY_PREDECESSOR_ARTIFACT_IDENTITY_INVALID",
          declaredEntry.family);
      }
      if (archivedTerminalMarker.schema === EXACT_LINEAGE_MARKER_SCHEMA) {
        const successorEntry = declaredEntriesByFamily.get(
          archivedLineage.successorFamily);
        const successorRoot = path.join(root, successorEntry.family,
          archivedLineage.successorEntryRelease);
        safeDirectory(successorRoot);
        directoryFiles(successorRoot);
        const successorBytes = safeFile(path.join(successorRoot,
          successorEntry.canonicalFile));
        let successorArtifact;
        try { successorArtifact = JSON.parse(successorBytes.toString("utf8")); }
        catch {
          fail("EXACT_LINEAGE_MARKER_ARTIFACT_JSON_INVALID",
            declaredEntry.family);
        }
        requireExactLineageMarkerArtifactBindings(archivedTerminalMarker, {
          sourceFamily: declaredEntry.family,
          sourceRelease: declaredEntry.currentRelease,
          sourceCanonicalFile: declaredEntry.canonicalFile,
          sourceSemanticHashField: declaredEntry.semanticHashField,
          sourceArtifact: body,
          sourceBytes: canonicalBytes,
          targetFamily: successorEntry.family,
          targetRelease: archivedLineage.successorEntryRelease,
          targetCanonicalFile: successorEntry.canonicalFile,
          targetSemanticHashField: successorEntry.semanticHashField,
          targetArtifact: successorArtifact,
          targetBytes: successorBytes,
        });
      } else if (archivedTerminalMarker.supersededArtifactPath
          !== `artifacts/${declaredEntry.family}/`
            + `${declaredEntry.currentRelease}/${declaredEntry.canonicalFile}`
        || archivedTerminalMarker.supersededArtifactHash !== semanticHash
        || archivedTerminalMarker.supersededArtifactFileHash !== canonical.sha256
        || archivedTerminalMarker.supersededArtifactFileBytes !== canonical.bytes
        || archivedTerminalMarker.supersededArtifactBytesPreserved !== true
        || archivedTerminalMarker.supersededRelease
          !== declaredEntry.currentRelease
        || archivedTerminalMarker.supersededByRelease
          !== archivedLineage.successorEntryRelease
        || archivedTerminalMarker.currentCanonicalPath
          !== archivedLineage.successorCanonicalPath
        || archivedTerminalMarker.previousGeneratedAt !== body.generatedAt
        || archivedTerminalMarker.currentSnapshotAsOf
          !== archivedLineage.successorDeclaredAt
        || archivedTerminalMarker.operationalAuthorityGranted !== false
        || Date.parse(archivedLineage.successorDeclaredAt)
          < Date.parse(body.generatedAt)) {
        fail("CROSS_FAMILY_PREDECESSOR_SOURCE_OR_MARKER_BINDING_INVALID",
          declaredEntry.family);
      }
    }
    for (const timeField of DECLARED_TIME_FIELDS) {
      if (body[timeField] != null && (!Number.isFinite(Date.parse(body[timeField]))
        || Date.parse(body[timeField]) > Date.parse(declaration.indexedAt))) {
        fail("CANONICAL_TIME_AFTER_INDEX", `${declaredEntry.family}:${timeField}`);
      }
    }
    return {
      family: declaredEntry.family,
      familySelectionStatus: archived
        ? "ARCHIVED_CROSS_FAMILY_PREDECESSOR_ONLY"
        : "CURRENT_CANONICAL_WITHIN_DECLARED_LINEAGE",
      currentRelease: archived ? null : declaredEntry.currentRelease,
      canonicalPath: archived ? null
        : `${declaredEntry.family}/${declaredEntry.currentRelease}/`
          + declaredEntry.canonicalFile,
      archivedTerminalRelease: archived ? declaredEntry.currentRelease : null,
      archivedTerminalArtifactPath: archived
        ? `${declaredEntry.family}/${declaredEntry.currentRelease}/`
          + declaredEntry.canonicalFile : null,
      semanticHashField: declaredEntry.semanticHashField,
      semanticHash,
      canonicalFileSha256: canonical.sha256,
      canonicalFileBytes: canonical.bytes,
      currentDirectoryFileCount: files.length,
      currentDirectoryBytes: files.reduce((sum, file) => sum + file.bytes, 0),
      currentDirectoryHash: tagged("outsider/local-canonical-directory/v1", files),
      currentDirectoryFiles: files,
      nonReleaseQuarantine,
      nonReleaseQuarantineCount: nonReleaseQuarantine.length,
      nonReleaseQuarantineHash: tagged(
        "outsider/local-family-nonrelease-quarantine/v1", nonReleaseQuarantine),
      supersededReleaseCount: releases.length - (archived ? 0 : 1),
      supersededReleaseHistory: releaseHistory,
      archivedTerminalSupersession,
      supersessionChainEstablished: true,
    };
  });

  for (const receipt of crossFamilyLineageReceipts) {
    const predecessorEntry = entries.find((entry) =>
      entry.family === receipt.predecessorFamily);
    const successorEntry = entries.find((entry) =>
      entry.family === receipt.successorFamily);
    const entryReleaseIsCurrent = receipt.successorEntryRelease
      === successorEntry.currentRelease;
    const entryReleaseReachesCurrent = entryReleaseIsCurrent
      || successorEntry.supersededReleaseHistory.some((release) =>
        release.release === receipt.successorEntryRelease);
    if (predecessorEntry.familySelectionStatus
        !== "ARCHIVED_CROSS_FAMILY_PREDECESSOR_ONLY"
      || predecessorEntry.currentRelease !== null
      || predecessorEntry.archivedTerminalRelease
        !== receipt.predecessorTerminalRelease
      || successorEntry.familySelectionStatus
        !== "CURRENT_CANONICAL_WITHIN_DECLARED_LINEAGE"
      || successorEntry.currentRelease !== receipt.successorCurrentRelease
      || !entryReleaseReachesCurrent
      || receipt.predecessorMarkerExactBytesVerified !== true
      || receipt.predecessorMarkerSchemaVerified !== true
      || receipt.predecessorMarkerTargetExactPathVerified !== true) {
      fail("CROSS_FAMILY_LINEAGE_DID_NOT_REACH_UNIQUE_CURRENT",
        receipt.predecessorFamily);
    }
    receipt.sameFamilySuccessorChainToCurrentEstablished = true;
  }

  const unversionedQuarantine = readdirSync(root).filter((name) => {
    const absolute = path.join(root, name);
    const stat = lstatSync(absolute, { bigint: true });
    return stat.isDirectory() && !declared.has(name);
  }).sort().map((family) => ({ family,
    status: "UNVERSIONED_OR_NONCANONICAL_BYTE_BOUND_QUARANTINE",
    selectedAsCanonical: false,
    ...directoryCommitment(path.join(root, family),
      "outsider/local-unversioned-quarantine-directory/v1", { quarantine: true }) }));
  const artifactsRootEntries = readdirSync(root).filter((name) => {
    const absolute = path.join(root, name);
    return !lstatSync(absolute, { bigint: true }).isDirectory();
  }).sort().map((name) => {
    const absolute = path.join(root, name);
    const stat = lstatSync(absolute, { bigint: true });
    if (stat.isSymbolicLink()) return { path: name, kind: "SYMLINK",
      target: readlinkSync(absolute), status: "ROOT_SYMLINK_BOUND_QUARANTINE" };
    if (!stat.isFile()) fail("NONREGULAR_ENTRY", absolute);
    const bytes = safeFile(absolute);
    return { path: name, kind: "FILE", bytes: bytes.length, sha256: sha256(bytes),
      status: "ROOT_FILE_BYTE_BOUND_QUARANTINE" };
  });
  const committedRegularFileCount = entries.reduce((sum, entry) => sum
    + entry.currentDirectoryFileCount
    + entry.supersededReleaseHistory.reduce((inner, release) => inner
      + release.releaseDirectoryFileCount, 0)
    + entry.nonReleaseQuarantine.reduce((inner, residual) => inner
      + (residual.kind === "FILE" ? 1 : (residual.directoryFileCount ?? 0)), 0), 0)
    + unversionedQuarantine.reduce((sum, family) => sum + family.directoryFileCount, 0)
    + artifactsRootEntries.filter((entry) => entry.kind === "FILE").length;
  const committedRegularFileBytes = entries.reduce((sum, entry) => sum
    + entry.currentDirectoryBytes
    + entry.supersededReleaseHistory.reduce((inner, release) => inner
      + release.releaseDirectoryBytes, 0)
    + entry.nonReleaseQuarantine.reduce((inner, residual) => inner
      + (residual.kind === "FILE" ? residual.fileBytes : (residual.directoryBytes ?? 0)), 0), 0)
    + unversionedQuarantine.reduce((sum, family) => sum + family.directoryBytes, 0)
    + artifactsRootEntries.reduce((sum, entry) => sum + (entry.bytes ?? 0), 0);
  const partial = {
    schema: LOCAL_ARTIFACT_INDEX_SCHEMA,
    indexedAt: declaration.indexedAt,
    indexedAtExternallyAttested: false,
    artifactsRoot: "artifacts",
    entries,
    versionedFamilyCount: entries.length,
    crossFamilyLineageReceipts,
    crossFamilyLineageCount: crossFamilyLineageReceipts.length,
    crossFamilyLineageHash: tagged(
      "outsider/local-artifact-cross-family-lineages/v1",
      crossFamilyLineageReceipts,
    ),
    unversionedQuarantine,
    unversionedQuarantineCount: unversionedQuarantine.length,
    unversionedQuarantineHash: tagged(
      "outsider/local-unversioned-quarantine/v1", unversionedQuarantine),
    artifactsRootEntries,
    artifactsRootEntryCount: artifactsRootEntries.length,
    artifactsRootFileCount: artifactsRootEntries
      .filter((entry) => entry.kind === "FILE").length,
    artifactsRootSymlinkCount: artifactsRootEntries
      .filter((entry) => entry.kind === "SYMLINK").length,
    artifactsRootEntriesHash: tagged("outsider/local-artifacts-root-entries/v1",
      artifactsRootEntries),
    everyRegularArtifactByteIsCommittedOrBuildFails: true,
    committedRegularFileCount,
    committedRegularFileBytes,
    supersessionMarkerAuthorityBoundBySupportedSchema: true,
    supersessionTargetScope:
      "SAME_DECLARED_FAMILY_BY_DEFAULT_WITH_EXACT_DECLARATION_AUTHORIZED_CROSS_FAMILY_LINEAGE_EXCEPTION",
    outputPublisherContract:
      "WORKSPACE_ROOTED_ANCESTOR_SYMLINK_REJECTING_RANDOM_TEMP_ATOMIC_NO_CLOBBER",
    maximumVersionIsNotSelectionAuthority: true,
    declarationIsSelectionAuthority: true,
    archivedPredecessorFamiliesAreNotCurrent: true,
    crossFamilyLineageGrantsSourceTruthTrainingPricingOrAuthority: false,
    indexReplaysArtifactSources: false,
  };
  if (!sameIdentity(rootIdentity, safeDirectory(root))) {
    fail("ARTIFACTS_ROOT_CHANGED_DURING_INDEX", root);
  }
  return { ...partial, indexHash: tagged("outsider/local-artifact-canonical-index/v4", partial) };
}

export function verifyLocalArtifactCanonicalIndex({ declaration, artifact,
  artifactsRoot = "artifacts", now = new Date() } = {}) {
  try {
    const expected = buildLocalArtifactCanonicalIndex({ declaration, artifactsRoot, now });
    if (canonicalizeStrict(expected) !== canonicalizeStrict(artifact)) {
      return { ok: false, error: "LOCAL_ARTIFACT_INDEX_EXACT_REBUILD_MISMATCH" };
    }
    return { ok: true, verificationLevel: "LOCAL_ARTIFACT_BYTES_AND_SELECTION_EXACT_REBUILT",
      indexHash: expected.indexHash, versionedFamilyCount: expected.versionedFamilyCount,
      sourceArtifactsReverified: false, sourceTruthEstablished: false,
      canonicalSelectionManifestReproduced: true };
  } catch (error) {
    return { ok: false, error: String(error?.message ?? error) };
  }
}

export function verifyLocalArtifactIndexSupersessionV3({ markerPath,
  predecessorPath, successorPath, declaration, artifactsRoot = "artifacts",
  now = new Date() } = {}) {
  try {
    const markerStat = lstatSync(markerPath, { bigint: true });
    if (markerStat.isSymbolicLink() || !markerStat.isFile()
      || (markerStat.mode & 0o777n) !== 0o600n) {
      fail("INDEX_SUPERSESSION_MARKER_FILE_INVALID");
    }
    const markerBytes = safeFile(markerPath);
    let marker;
    try { marker = JSON.parse(markerBytes.toString("utf8")); }
    catch { fail("INDEX_SUPERSESSION_MARKER_JSON_INVALID"); }
    if (!exactKeys(marker, [
      "schema", "status", "superseded", "successor", "reason",
      "declarationSchema", "oldBytesPreserved",
      "sourceArtifactsReverifiedByThisMarker",
      "sourceTruthEstablishedByThisMarker", "trainingAdmission",
      "pricingAdmission", "operationalAuthorityGranted", "markerHashDomain",
      "markerHash",
    ])
      || !exactKeys(marker.superseded, [
        "path", "schema", "indexHash", "fileSha256", "fileBytes",
      ])
      || !exactKeys(marker.successor, [
        "path", "schema", "indexHash", "fileSha256", "fileBytes",
        "indexedAt", "versionedFamilyCount", "crossFamilyLineageCount",
      ])
      || marker.schema !== "outsider/local-artifact-index-supersession/v3"
      || marker.markerHashDomain !== marker.schema
      || marker.status !== "SUPERSEDED_DO_NOT_USE_AS_CANONICAL"
      || marker.declarationSchema !== LOCAL_ARTIFACT_DECLARATION_SCHEMA
      || marker.oldBytesPreserved !== true
      || marker.sourceArtifactsReverifiedByThisMarker !== false
      || marker.sourceTruthEstablishedByThisMarker !== false
      || marker.trainingAdmission !== false
      || marker.pricingAdmission !== false
      || marker.operationalAuthorityGranted !== false) {
      fail("INDEX_SUPERSESSION_MARKER_SCHEMA_OR_BOUNDARY_INVALID");
    }
    const { markerHash, ...markerBody } = marker;
    if (markerHash !== tagged(marker.schema, markerBody)) {
      fail("INDEX_SUPERSESSION_MARKER_HASH_INVALID");
    }
    for (const [claimed, actual] of [
      [marker.superseded.path, predecessorPath],
      [marker.successor.path, successorPath],
    ]) {
      if (typeof claimed !== "string" || claimed.includes("\\")
        || claimed.includes("\0") || path.isAbsolute(claimed)
        || claimed.split("/").includes("..")
        || path.resolve(claimed) !== path.resolve(actual)) {
        fail("INDEX_SUPERSESSION_ARTIFACT_PATH_INVALID");
      }
    }
    const predecessorBytes = safeFile(predecessorPath);
    const successorBytes = safeFile(successorPath);
    if (predecessorBytes.length !== marker.superseded.fileBytes
      || sha256(predecessorBytes) !== marker.superseded.fileSha256
      || successorBytes.length !== marker.successor.fileBytes
      || sha256(successorBytes) !== marker.successor.fileSha256) {
      fail("INDEX_SUPERSESSION_ARTIFACT_EXACT_BYTES_INVALID");
    }
    let predecessor, successor;
    try {
      predecessor = JSON.parse(predecessorBytes.toString("utf8"));
      successor = JSON.parse(successorBytes.toString("utf8"));
    } catch { fail("INDEX_SUPERSESSION_ARTIFACT_JSON_INVALID"); }
    if (predecessor.schema !== marker.superseded.schema
      || predecessor.indexHash !== marker.superseded.indexHash
      || successor.schema !== marker.successor.schema
      || successor.indexHash !== marker.successor.indexHash
      || successor.indexedAt !== marker.successor.indexedAt
      || successor.versionedFamilyCount !== marker.successor.versionedFamilyCount
      || successor.crossFamilyLineageCount
        !== marker.successor.crossFamilyLineageCount) {
      fail("INDEX_SUPERSESSION_ARTIFACT_IDENTITY_INVALID");
    }
    const { indexHash: successorIndexHash, ...successorBody } = successor;
    if (successorIndexHash !== tagged(successor.schema, successorBody)) {
      fail("INDEX_SUPERSESSION_SUCCESSOR_SELF_HASH_INVALID");
    }
    const rebuilt = verifyLocalArtifactCanonicalIndex({ declaration,
      artifact: successor, artifactsRoot, now });
    return {
      ok: true,
      verificationLevel: rebuilt.ok
        ? "PINNED_0600_INDEX_V7_TO_V8_AND_SUCCESSOR_EXACT_REBUILD"
        : "PINNED_0600_INDEX_V7_TO_V8_HISTORICAL_SUCCESSOR_SELF_HASH_ONLY_NOT_CURRENT_SELECTION",
      markerHash,
      markerFileSha256: sha256(markerBytes),
      markerFileBytes: markerBytes.length,
      predecessorBytesPreserved: true,
      successorExactBytesVerified: true,
      successorHistoricalSelfHashVerified: true,
      successorExactRebuildVerified: rebuilt.ok,
      successorCurrentSelectionVerified: rebuilt.ok,
      successorCurrentSelectionError: rebuilt.ok ? null : rebuilt.error,
      crossFamilyLineageCount: successor.crossFamilyLineageCount,
      sourceArtifactsReverifiedByMarker: false,
      sourceTruthEstablishedByMarker: false,
      trainingAdmission: false,
      pricingAdmission: false,
      operationalAuthorityGranted: false,
    };
  } catch (error) {
    return { ok: false,
      verificationLevel: "INDEX_SUPERSESSION_V3_INVALID",
      predecessorBytesPreserved: false,
      successorExactBytesVerified: false,
      successorHistoricalSelfHashVerified: false,
      successorExactRebuildVerified: false,
      successorCurrentSelectionVerified: false,
      sourceArtifactsReverifiedByMarker: false,
      sourceTruthEstablishedByMarker: false,
      trainingAdmission: false,
      pricingAdmission: false,
      operationalAuthorityGranted: false,
      error: String(error?.message ?? error) };
  }
}

export function verifyLocalArtifactIndexSupersessionV4({ markerPath,
  predecessorPath, successorPath, declaration, artifactsRoot = "artifacts",
  now = new Date(), requireSuccessorExactRebuild = true } = {}) {
  const failure = (error) => ({ ok: false,
    verificationLevel: "INDEX_SUPERSESSION_V4_INVALID",
    predecessorBytesPreserved: false,
    successorExactBytesVerified: false,
    successorHistoricalSelfHashVerified: false,
    successorExactRebuildVerified: false,
    successorCurrentSelectionVerified: false,
    sourceArtifactsReverifiedByMarker: false,
    sourceTruthEstablishedByMarker: false,
    trainingAdmission: false,
    pricingAdmission: false,
    operationalAuthorityGranted: false,
    error: String(error?.message ?? error) });
  try {
    if (typeof requireSuccessorExactRebuild !== "boolean") {
      fail("INDEX_SUPERSESSION_V4_REBUILD_POLICY_INVALID");
    }
    for (const candidate of [markerPath, predecessorPath, successorPath]) {
      const stat = lstatSync(candidate, { bigint: true });
      if (stat.isSymbolicLink() || !stat.isFile()
        || (stat.mode & 0o777n) !== 0o600n) {
        fail("INDEX_SUPERSESSION_V4_FILE_INVALID", candidate);
      }
    }
    const markerBytes = safeWorkspaceFile(markerPath);
    let marker;
    try { marker = JSON.parse(markerBytes.toString("utf8")); }
    catch { fail("INDEX_SUPERSESSION_V4_MARKER_JSON_INVALID"); }
    if (!exactKeys(marker, [
      "schema", "status", "lineageScope", "superseded", "successor", "reason",
      "declarationSchema", "oldBytesPreserved",
      "sourceArtifactsReverifiedByThisMarker",
      "sourceTruthEstablishedByThisMarker", "closureCredit",
      "causalExperienceUnits", "trainingAdmission", "pricingAdmission",
      "operationalAuthorityGranted", "markerHashDomain", "markerHash",
    ])
      || !exactKeys(marker.superseded, [
        "path", "schema", "indexHash", "fileSha256", "fileBytes",
      ])
      || !exactKeys(marker.successor, [
        "path", "schema", "indexHash", "fileSha256", "fileBytes",
        "indexedAt", "versionedFamilyCount", "crossFamilyLineageCount",
      ])
      || marker.schema !== "outsider/local-artifact-index-supersession/v4"
      || marker.markerHashDomain !== marker.schema
      || !["SUPERSEDED_DO_NOT_USE_AS_CANONICAL",
        "REJECTED_STALE_INDEX_DO_NOT_USE_AS_CANONICAL"].includes(marker.status)
      || !["SAME_FAMILY_EXACT_SUCCESSOR",
        "DECLARATION_AUTHORIZED_EXACT_CROSS_FAMILY_REJECTION_SUCCESSOR"]
        .includes(marker.lineageScope)
      || marker.declarationSchema !== LOCAL_ARTIFACT_DECLARATION_SCHEMA
      || marker.oldBytesPreserved !== true
      || marker.sourceArtifactsReverifiedByThisMarker !== false
      || marker.sourceTruthEstablishedByThisMarker !== false
      || marker.closureCredit !== 0
      || marker.causalExperienceUnits !== 0
      || marker.trainingAdmission !== false
      || marker.pricingAdmission !== false
      || marker.operationalAuthorityGranted !== false) {
      fail("INDEX_SUPERSESSION_V4_MARKER_SCHEMA_OR_BOUNDARY_INVALID");
    }
    if ((marker.lineageScope === "SAME_FAMILY_EXACT_SUCCESSOR"
        && marker.status !== "SUPERSEDED_DO_NOT_USE_AS_CANONICAL")
      || (marker.lineageScope
          === "DECLARATION_AUTHORIZED_EXACT_CROSS_FAMILY_REJECTION_SUCCESSOR"
        && marker.status !== "REJECTED_STALE_INDEX_DO_NOT_USE_AS_CANONICAL")) {
      fail("INDEX_SUPERSESSION_V4_STATUS_SCOPE_INVALID");
    }
    const { markerHash, ...markerBody } = marker;
    if (markerHash !== tagged(marker.schema, markerBody)) {
      fail("INDEX_SUPERSESSION_V4_MARKER_HASH_INVALID");
    }
    for (const [claimed, actual] of [
      [marker.superseded.path, predecessorPath],
      [marker.successor.path, successorPath],
    ]) {
      if (typeof claimed !== "string" || claimed.includes("\\")
        || claimed.includes("\0") || path.isAbsolute(claimed)
        || claimed.split("/").includes("..")
        || path.resolve(claimed) !== path.resolve(actual)) {
        fail("INDEX_SUPERSESSION_V4_ARTIFACT_PATH_INVALID");
      }
    }
    if (path.resolve(markerPath) !== path.join(path.dirname(
      path.resolve(predecessorPath)), "superseded-by.json")) {
      fail("INDEX_SUPERSESSION_V4_MARKER_NOT_ADJACENT_TO_PREDECESSOR");
    }
    const predecessorVersion = versionOf(path.basename(path.dirname(
      path.resolve(predecessorPath))));
    const successorVersion = versionOf(path.basename(path.dirname(
      path.resolve(successorPath))));
    if (predecessorVersion === null || successorVersion === null
      || successorVersion !== predecessorVersion + 1) {
      fail("INDEX_SUPERSESSION_V4_NOT_ADJACENT_VERSION");
    }
    const predecessorFamilyRoot = path.dirname(path.dirname(
      path.resolve(predecessorPath)));
    const successorFamilyRoot = path.dirname(path.dirname(path.resolve(successorPath)));
    if ((marker.lineageScope === "SAME_FAMILY_EXACT_SUCCESSOR"
        && predecessorFamilyRoot !== successorFamilyRoot)
      || (marker.lineageScope
          === "DECLARATION_AUTHORIZED_EXACT_CROSS_FAMILY_REJECTION_SUCCESSOR"
        && predecessorFamilyRoot === successorFamilyRoot)) {
      fail("INDEX_SUPERSESSION_V4_FAMILY_SCOPE_INVALID");
    }
    const predecessorBytes = safeWorkspaceFile(predecessorPath);
    const successorBytes = safeWorkspaceFile(successorPath);
    if (predecessorBytes.length !== marker.superseded.fileBytes
      || sha256(predecessorBytes) !== marker.superseded.fileSha256
      || successorBytes.length !== marker.successor.fileBytes
      || sha256(successorBytes) !== marker.successor.fileSha256) {
      fail("INDEX_SUPERSESSION_V4_ARTIFACT_EXACT_BYTES_INVALID");
    }
    let predecessor, successor;
    try {
      predecessor = JSON.parse(predecessorBytes.toString("utf8"));
      successor = JSON.parse(successorBytes.toString("utf8"));
    } catch { fail("INDEX_SUPERSESSION_V4_ARTIFACT_JSON_INVALID"); }
    if (predecessor.schema !== marker.superseded.schema
      || predecessor.indexHash !== marker.superseded.indexHash
      || successor.schema !== marker.successor.schema
      || successor.indexHash !== marker.successor.indexHash
      || successor.indexedAt !== marker.successor.indexedAt
      || successor.versionedFamilyCount !== marker.successor.versionedFamilyCount
      || successor.crossFamilyLineageCount
        !== marker.successor.crossFamilyLineageCount
      || successor.schema !== LOCAL_ARTIFACT_INDEX_SCHEMA
      || Date.parse(successor.indexedAt) < Date.parse(predecessor.indexedAt)) {
      fail("INDEX_SUPERSESSION_V4_ARTIFACT_IDENTITY_OR_TIME_INVALID");
    }
    for (const candidate of [predecessor, successor]) {
      const { indexHash, ...indexBody } = candidate;
      if (indexHash !== tagged(candidate.schema, indexBody)) {
        fail("INDEX_SUPERSESSION_V4_ARTIFACT_SELF_HASH_INVALID");
      }
    }
    const rebuilt = verifyLocalArtifactCanonicalIndex({ declaration,
      artifact: successor, artifactsRoot, now });
    if (requireSuccessorExactRebuild && !rebuilt.ok) {
      fail("INDEX_SUPERSESSION_V4_SUCCESSOR_REBUILD_INVALID", rebuilt.error);
    }
    return {
      ok: true,
      verificationLevel: rebuilt.ok
        ? "PINNED_0600_INDEX_SUCCESSOR_EXACT_REBUILD"
        : "PINNED_0600_INDEX_SUCCESSOR_HISTORICAL_SELF_HASH_ONLY_NOT_CURRENT_SELECTION",
      lineageScope: marker.lineageScope,
      markerHash,
      markerFileSha256: sha256(markerBytes),
      markerFileBytes: markerBytes.length,
      predecessorBytesPreserved: true,
      successorExactBytesVerified: true,
      successorHistoricalSelfHashVerified: true,
      successorExactRebuildVerified: rebuilt.ok,
      successorCurrentSelectionVerified: rebuilt.ok,
      successorCurrentSelectionError: rebuilt.ok ? null : rebuilt.error,
      crossFamilyLineageCount: successor.crossFamilyLineageCount,
      sourceArtifactsReverifiedByMarker: false,
      sourceTruthEstablishedByMarker: false,
      closureCredit: 0,
      causalExperienceUnits: 0,
      trainingAdmission: false,
      pricingAdmission: false,
      operationalAuthorityGranted: false,
    };
  } catch (error) { return failure(error); }
}

function parseArgs(argv) {
  if (argv.length === 1 && ["--help", "-h"].includes(argv[0])) return { help: true };
  const command = argv[0];
  const options = {};
  for (let index = 1; index < argv.length; index += 1) {
    const name = argv[index], value = argv[index + 1];
    if (!name?.startsWith("--") || value == null || value.startsWith("--")) fail("ARGUMENT_INVALID", name);
    options[name.slice(2)] = value; index += 1;
  }
  return { command, options };
}

function ensurePrivateParent(target) {
  const trustedRoot = path.resolve(process.cwd());
  const trustedRootIdentity = safeDirectory(trustedRoot);
  const parent = path.dirname(target);
  const relativeParent = path.relative(trustedRoot, parent);
  if (relativeParent === ".." || relativeParent.startsWith(`..${path.sep}`)
    || path.isAbsolute(relativeParent)) {
    fail("OUTPUT_OUTSIDE_TRUSTED_WORKSPACE", target);
  }
  let cursor = trustedRoot;
  const chain = [{ path: trustedRoot, identity: trustedRootIdentity }];
  for (const component of relativeParent.split(path.sep).filter(Boolean)) {
    cursor = path.join(cursor, component);
    try {
      const stat = lstatSync(cursor, { bigint: true });
      if (stat.isSymbolicLink() || !stat.isDirectory()) fail("OUTPUT_PARENT_UNSAFE", cursor);
      chain.push({ path: cursor, identity: stat });
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      mkdirSync(cursor, { mode: 0o700 });
      const stat = safeDirectory(cursor);
      if ((Number(stat.mode) & 0o777) !== 0o700) chmodSync(cursor, 0o700);
      chain.push({ path: cursor, identity: safeDirectory(cursor) });
    }
  }
  const canonicalRoot = realpathSync(trustedRoot);
  const canonicalParent = realpathSync(parent);
  if (canonicalParent !== path.join(canonicalRoot, relativeParent)) {
    fail("OUTPUT_PARENT_ESCAPED", parent);
  }
  return { parent, canonicalParent, chain };
}

function writeExclusive(file, value) {
  const requestedTarget = path.resolve(file);
  const parent = ensurePrivateParent(requestedTarget);
  const target = path.join(parent.canonicalParent, path.basename(requestedTarget));
  try { lstatSync(target); fail("OUTPUT_EXISTS", target); }
  catch (error) { if (error?.code !== "ENOENT") throw error; }
  const temporary = path.join(parent.parent,
    `.${path.basename(target)}.${process.pid}.${randomBytes(12).toString("hex")}.tmp`);
  let descriptor;
  try {
    descriptor = openSync(temporary, constants.O_CREAT | constants.O_EXCL
      | constants.O_WRONLY | (constants.O_NOFOLLOW ?? 0), 0o600);
    writeFileSync(descriptor, `${JSON.stringify(value, null, 2)}\n`);
    fchmodSync(descriptor, 0o600);
    fsyncSync(descriptor);
    const temporaryIdentity = fstatSync(descriptor, { bigint: true });
    closeSync(descriptor); descriptor = undefined;
    if (parent.chain.some((entry) => !sameNode(entry.identity,
      safeDirectory(entry.path))) || realpathSync(parent.parent) !== parent.canonicalParent) {
      fail("OUTPUT_PARENT_CHANGED", parent.parent);
    }
    linkSync(temporary, target);
    const targetIdentity = lstatSync(target, { bigint: true });
    const tempIdentityAfter = lstatSync(temporary, { bigint: true });
    if (!sameIdentity(targetIdentity, tempIdentityAfter)
      || targetIdentity.dev !== temporaryIdentity.dev
      || targetIdentity.ino !== temporaryIdentity.ino) {
      fail("OUTPUT_LINK_IDENTITY_MISMATCH", target);
    }
    unlinkSync(temporary);
  } catch (error) {
    if (descriptor != null) closeSync(descriptor);
    try { unlinkSync(temporary); } catch {}
    throw error;
  }
}

export async function main(argv = process.argv.slice(2)) {
  const parsed = parseArgs(argv);
  const usage = "Usage: node scripts/local-artifact-canonical-index.mjs <build|verify> --declaration FILE [--artifact FILE|--out FILE] [--artifacts-root DIR]";
  if (parsed.help) { process.stdout.write(`${usage}\n`); return 0; }
  try {
    const declaration = JSON.parse(safeFile(path.resolve(parsed.options.declaration)).toString("utf8"));
    const artifactsRoot = parsed.options["artifacts-root"] ?? "artifacts";
    if (parsed.command === "build" && parsed.options.out) {
      const resolvedRoot = path.resolve(artifactsRoot);
      const resolvedOutput = path.resolve(parsed.options.out);
      if (resolvedOutput === resolvedRoot
        || resolvedOutput.startsWith(`${resolvedRoot}${path.sep}`)) {
        fail("INDEX_OUTPUT_MUST_BE_OUTSIDE_INDEXED_ROOT");
      }
      const artifact = buildLocalArtifactCanonicalIndex({ declaration, artifactsRoot });
      writeExclusive(resolvedOutput, artifact);
      process.stdout.write(`${JSON.stringify({ ok: true, path: resolvedOutput,
        indexHash: artifact.indexHash, versionedFamilyCount: artifact.versionedFamilyCount })}\n`);
      return 0;
    }
    if (parsed.command === "verify" && parsed.options.artifact) {
      const artifact = JSON.parse(safeFile(path.resolve(parsed.options.artifact)).toString("utf8"));
      const result = verifyLocalArtifactCanonicalIndex({ declaration, artifact, artifactsRoot });
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return result.ok ? 0 : 1;
    }
    process.stderr.write(`${usage}\n`); return 2;
  } catch (error) { process.stderr.write(`${error?.message ?? error}\n`); return 1; }
}

if (process.argv[1]
  && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  process.exitCode = await main();
}
