/*
 * Stage 2 current-source-chain admission.
 *
 * The historical quote frontier replays its own ATTEST/CURATE/Reality,
 * empirical-factor, and loss/exposure inputs.  This module adds a separate
 * fail-closed bridge to the current catalog -> flywheel -> responsibility-math
 * -> actuarial-architecture chain.  It admits that chain only for bounded
 * source-domain diagnostics and gap design.  It never converts retrospective
 * evidence into a target pre-action row, model, price, capital decision, or
 * authority.
 *
 * Pins live in one exported contract so an upstream canonical advance can be
 * reviewed and updated atomically before a new no-clobber contract is frozen.
 */

import { createHash } from "node:crypto";
import {
  closeSync, constants as fsConstants, fstatSync, openSync, readFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isProxy } from "node:util/types";

import { canonicalizeStrict } from "./canonical.js";
import {
  verifyActuarialModelEvolution,
  verifyActuarialModelEvolutionAgainstSources,
} from "./outsider-actuarial-model-evolution.js";
import { verifyRealResponsibilityMathDiagnostics } from
  "./outsider-real-responsibility-math-diagnostics.js";
import {
  verifyStage2QuoteFrontier,
  verifyStage2QuoteFrontierStructure,
} from "./outsider-stage2-quote-frontier.js";

export const STAGE2_CURRENT_CHAIN_ADMISSION_SCHEMA =
  "outsider/stage2-ephemeral-current-source-chain-admission/v1";
export const STAGE2_CURRENT_CHAIN_ADMISSION_CONTRACT_SCHEMA =
  "outsider/stage2-current-source-chain-admission-contract/v1";
export const STAGE2_CURRENT_CHAIN_ADMISSION_FROZEN_AT =
  "2026-08-28T10:00:14.854Z";

export const STAGE2_CURRENT_CHAIN_ADMISSION_CANONICAL = deepFreeze({
  canonicalRelease: "final-v4",
  repositoryRelativePath:
    "artifacts/stage2-current-chain-admission-20260828/final-v4/contract.json",
  schema: STAGE2_CURRENT_CHAIN_ADMISSION_CONTRACT_SCHEMA,
  generatedAt: STAGE2_CURRENT_CHAIN_ADMISSION_FROZEN_AT,
  contractHash: "sha256:f132e191a2e53b87f677983b85dadb25c3f9c4693254e4e8e4c24856caeb0a33",
  artifactFileHash:
    "sha256:17b2ff445dd7042f59700a599a4b8a368c53a1bb6e9213ac55135278b68c093a",
  artifactFileBytes: 19_833,
});

export const STAGE2_CURRENT_CHAIN_PINS = deepFreeze({
  contractVersion: "2026-08-28.current-chain.v6-temporal-quarantine-hold",
  selectedTemporallyAuditedWaveSubgraph: {
    nodes: [
      "CLINICALTRIALS_POSTED_RESULTS_EVIDENCE",
      "WAVE5_SOURCE_AWARE_INTAKE_TAXONOMY",
      "STAGE0_SOURCE_TEMPORAL_AUDIT",
      "REAL_CASE_GAP_EVIDENCE_CATALOG",
      "REAL_CASE_RESPONSIBILITY_FLYWHEEL",
      "REAL_RESPONSIBILITY_MATH_DIAGNOSTICS",
      "ACTUARIAL_MODEL_EVOLUTION",
    ],
    edges: [
      { from: "CLINICALTRIALS_POSTED_RESULTS_EVIDENCE",
        to: "REAL_CASE_GAP_EVIDENCE_CATALOG",
        binding: "CATALOG_SOURCE_ROW_SEMANTIC_HASH" },
      { from: "WAVE5_SOURCE_AWARE_INTAKE_TAXONOMY",
        to: "REAL_CASE_GAP_EVIDENCE_CATALOG",
        binding: "CATALOG_SOURCE_ROW_SEMANTIC_HASH" },
      { from: "CLINICALTRIALS_POSTED_RESULTS_EVIDENCE",
        to: "REAL_CASE_RESPONSIBILITY_FLYWHEEL",
        binding: "FULL_EXACT_SOURCE_REPLAYED_ARTIFACT_RECEIPT" },
      { from: "WAVE5_SOURCE_AWARE_INTAKE_TAXONOMY",
        to: "REAL_CASE_RESPONSIBILITY_FLYWHEEL",
        binding: "FULL_EXACT_SOURCE_REPLAYED_ARTIFACT_RECEIPT" },
      { from: "CLINICALTRIALS_POSTED_RESULTS_EVIDENCE",
        to: "STAGE0_SOURCE_TEMPORAL_AUDIT",
        binding: "PINNED_RECEIPT_TEMPORAL_QUARANTINE_CLASSIFICATION" },
      { from: "WAVE5_SOURCE_AWARE_INTAKE_TAXONOMY",
        to: "STAGE0_SOURCE_TEMPORAL_AUDIT",
        binding: "PINNED_RECEIPT_TEMPORALLY_ORDERED_REFERENCE_CLASSIFICATION" },
      { from: "STAGE0_SOURCE_TEMPORAL_AUDIT",
        to: "REAL_CASE_GAP_EVIDENCE_CATALOG",
        binding: "PINNED_AUDIT_REFERENCE_STRUCTURE_ONLY_NOT_CATALOG_SOURCE_REPLAY" },
      { from: "STAGE0_SOURCE_TEMPORAL_AUDIT",
        to: "REAL_CASE_RESPONSIBILITY_FLYWHEEL",
        binding: "SAME_CALL_FULL_PINNED_TEMPORAL_AUDIT_REPLAY" },
      { from: "REAL_CASE_GAP_EVIDENCE_CATALOG",
        to: "REAL_CASE_RESPONSIBILITY_FLYWHEEL",
        binding: "CODE_FIXED_CATALOG_HASH_AND_LOCAL_ARTIFACT_RECONCILIATION" },
      { from: "REAL_CASE_RESPONSIBILITY_FLYWHEEL",
        to: "REAL_RESPONSIBILITY_MATH_DIAGNOSTICS",
        binding: "FROZEN_CANONICAL_PLUS_SAME_CALL_FULL_SOURCE_REPLAY" },
      { from: "REAL_RESPONSIBILITY_MATH_DIAGNOSTICS",
        to: "ACTUARIAL_MODEL_EVOLUTION",
        binding: "FROZEN_CANONICAL_PLUS_SAME_CALL_EXACT_MATH_REBUILD" },
    ],
  },
  temporalAudit: {
    canonicalRelease: "final-v2",
    repositoryRelativePath:
      "artifacts/stage0-source-temporal-audit-20260828/final-v2/manifest.json",
    schema: "outsider/stage0-source-temporal-audit/v1",
    createdAt: "2026-08-28T08:06:19.540Z",
    manifestHash:
      "sha256:9ab9517173af2b49f58dddd51a59d3b71ec76bfa6acb10cd5a84c4a426dcd453",
    artifactFileHash:
      "sha256:7a67d1474f67a8fe3c668f78d89096ccd69215aa89e7b782519737353585a44c",
    artifactFileBytes: 50_283,
    pinnedReceiptCount: 16,
    sourceReplayedReceiptCount: 16,
    temporallyOrderedCurrentReceiptCount: 9,
    temporalQuarantineReceiptCount: 7,
    currentCoverageReceiptCount: 9,
    allPinnedReceiptsTemporallyCurrent: false,
    closureCredit: false,
    causalExperienceUnits: 0,
    trainingAdmission: false,
    pricingAdmission: false,
    operationalAuthorityGranted: false,
  },
  clinicalTrials: {
    artifactId: "CLINICALTRIALS_POSTED_RESULTS_EVIDENCE",
    canonicalRelease: "final-v3",
    repositoryRelativePath:
      "artifacts/clinicaltrials-posted-results-evidence-20260822/final-v3/evidence.json",
    schema: "outsider/clinicaltrials-posted-results-evidence/v1",
    artifactPathRole:
      "TEMPORAL_QUARANTINE_CLINICALTRIALS_POSTED_RESULTS_FINAL_V3_REFERENCE_ONLY",
    sourcePathRole: "EXACT_SIX_OBJECT_PLUS_MANIFEST_CLINICALTRIALS_API_V2_SOURCE_DIRECTORY",
    hashField: "artifactHash",
    artifactHash: "sha256:93ae703761d069b7adbdc8ad781cc2ebb1d91b836aa21e027a5f6657f84840a6",
    artifactFileHash:
      "sha256:cc6a3847ca58003db1cf91ba3fdc6cb365152c3c7ca82bb9c6be4b42f491f210",
    artifactFileBytes: 81_982,
    sourceCommitment:
      "sha256:34199d825412cb9931378ebed6146a003e04e5788a492f8df3041a46d4fe6910",
    acquisitionManifestHash:
      "sha256:50a1bceba404de66969cb99b7bf0cbc6b817caf915855452d70bd011c77bb1a9",
    verifierLevel:
      "FULL_EXACT_OFFICIAL_DATA_API_SOURCE_REPLAY_RIGHTS_TERMS_NOT_REPLAYED",
    containedLaneIds: [
      "CLINICALTRIALS_SPONSOR_POSTED_AGGREGATE_RESULTS_REFERENCE",
    ],
    sourceBytesReplayed: true,
    temporalAuthenticityEstablished: false,
    temporalStatus:
      "PINNED_SOURCE_REPLAYED_TEMPORAL_AUTHENTICITY_UNESTABLISHED",
    currentRoutingEligible: false,
    currentCoverage: false,
    currentTruth: false,
    currentTruthMeaning:
      "TEMPORAL_AUTHENTICITY_UNESTABLISHED_QUARANTINED_REFERENCE_ONLY",
    closureCredit: false,
    causalExperienceUnits: 0,
    trainingAdmission: false,
    pricingAdmission: false,
    operationalAuthorityGranted: false,
  },
  wave5Intake: {
    artifactId: "WAVE5_SOURCE_AWARE_INTAKE_TAXONOMY",
    canonicalRelease: "final-v3",
    repositoryRelativePath:
      "artifacts/public-evidence-wave5-intake-20260821/final-v3/snapshot.json",
    schema: "outsider/wave5-source-aware-intake-snapshot/v1",
    artifactPathRole: "CURRENT_CANONICAL_WAVE5_INTAKE_FINAL_V3_SNAPSHOT_JSON",
    sourcePathRole: "EXACT_FIFTY_SEVEN_OBJECT_WAVE5_SOURCE_DIRECTORY",
    hashField: "snapshotHash",
    generatedAt: "2026-08-21T00:00:00.000Z",
    artifactHash: "sha256:2d40c4e44a7d9edb37ce15b526c8aa07bdca694db7cece8e9b3437c8307192ad",
    artifactFileHash:
      "sha256:b42a912a7a9ffcd31f9a0bf9670c078b71741edfb61ea722a203d22cd4f98ed5",
    artifactFileBytes: 208_570,
    sourceCommitment:
      "sha256:60849386032e4a10c8c1327188d4a154356dc0526388d10c2bde304f10005f48",
    verifierLevel: "FULL_SOURCE_REPLAY",
    containedLaneIds: ["WAVE5_REAL_SOFTWARE"],
    sourceBytesReplayed: true,
    temporalAuthenticityEstablished: true,
    temporalStatus: "PINNED_SOURCE_REPLAYED_TEMPORALLY_ORDERED_CURRENT_REFERENCE",
    currentRoutingEligible: true,
    currentCoverage: true,
    currentTruth: true,
    currentTruthMeaning:
      "CURRENT_RECEIPT_BYTES_AND_TEMPORAL_ORDER_ONLY_NOT_UNDERLYING_WORLD_TRUTH",
    closureCredit: false,
    causalExperienceUnits: 0,
    trainingAdmission: false,
    pricingAdmission: false,
    operationalAuthorityGranted: false,
  },
  catalog: {
    canonicalRelease: "final-v18",
    repositoryRelativePath:
      "artifacts/real-case-gap-evidence-catalog-20260828/final-v18/catalog.json",
    schema: "outsider/real-case-gap-evidence-catalog/v1",
    asOf: "2026-08-28T08:23:57.560Z",
    catalogHash: "sha256:b690ddeb4a9a01b94938f6558dfe565e4f6703d16eb22e0b05fb88d9c32d6f66",
    artifactFileHash:
      "sha256:cce91100a329ad2d8687945d48e3c8774aa6f9a4ed6ccdc077fe5b9b9fc20eb0",
    artifactFileBytes: 69_059,
  },
  flywheel: {
    canonicalRelease: "final-v16",
    repositoryRelativePath:
      "artifacts/real-case-responsibility-flywheel-20260828/final-v16/flywheel.json",
    schema: "outsider/real-case-responsibility-flywheel/v1",
    generatedAt: "2026-08-28T08:40:00.720Z",
    artifactHash: "sha256:0a80bf8bd7ad41fa49423a01ec2af3667510b2fa7dcb0f72a234adf1451fcd77",
    artifactFileHash:
      "sha256:18655bfce66c23d12c300fc7a9bc88a618bb240b0fcf07ca85a634a1aa358f68",
    artifactFileBytes: 644_539,
    requiredArtifactReceiptCount: 16,
    requiredArtifactReceiptSetHash:
      "sha256:ff9dd2cdf4a48d84d6667f606a0b28608920738c6d269ea99dd064bb5ee16d7a",
  },
  math: {
    canonicalRelease: "final-v14",
    repositoryRelativePath:
      "artifacts/real-responsibility-math-diagnostics-20260828/final-v14/diagnostics.json",
    schema: "outsider/real-responsibility-math-diagnostics/v1",
    generatedAt: "2026-08-28T09:03:30.091Z",
    artifactHash: "sha256:201199fbaec303e82ae41ea3b5555cbffdc24173536a8a1a33e347e95d01655e",
    artifactFileHash:
      "sha256:4e582303848e304500344121fbd0a7b415df430db29fb6ba6ab60320b87a70c8",
    artifactFileBytes: 539_149,
    factorDictionaryHash:
      "sha256:64edf882a2b06b7050e0c5ec934fc40c3c5838ae114ab975377fb61d203e9456",
  },
  architecture: {
    canonicalRelease: "final-v11",
    repositoryRelativePath:
      "artifacts/actuarial-model-evolution-20260828/final-v11/architecture.json",
    schema: "outsider/actuarial-model-evolution/v1",
    generatedAt: "2026-08-28T09:23:48.582Z",
    artifactHash: "sha256:8be9fc278e5efdd02800063f89b4564445feded7ed009340872ebc3f74059f47",
    artifactFileHash:
      "sha256:e3f83304edca352befaf689769f3cd79c4ffd8118e54ae00eeed484cc351c53c",
    artifactFileBytes: 253_171,
  },
});

const DOMAINS = Object.freeze({
  pins: "outsider/stage2-current-source-chain-pins/v1",
  receipt: STAGE2_CURRENT_CHAIN_ADMISSION_SCHEMA,
  flywheelReceiptSet: "outsider/stage2-current-chain-flywheel-receipt-set/v1",
});
const HASH = /^sha256:[a-f0-9]{64}$/u;
const MAX_ARTIFACT_BYTES = 32 * 1024 * 1024;
const REPOSITORY_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)), "..",
);

function fail(code, detail = null) {
  throw new Error(detail === null ? `STAGE2_CURRENT_CHAIN_${code}`
    : `STAGE2_CURRENT_CHAIN_${code}:${detail}`);
}

function plain(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value, keys) {
  return plain(value)
    && Object.keys(value).sort().join("\0") === [...keys].sort().join("\0");
}

function same(left, right) {
  try { return canonicalizeStrict(left) === canonicalizeStrict(right); }
  catch { return false; }
}

function digest(domain, value) {
  return `sha256:${createHash("sha256")
    .update(`${domain}\0${canonicalizeStrict(value)}`, "utf8").digest("hex")}`;
}

function normalizedContractGeneratedAt(value, requireCanonical = false) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) {
    fail("CONTRACT_GENERATED_AT_INVALID");
  }
  const normalized = new Date(value).toISOString();
  if (normalized !== value) fail("CONTRACT_GENERATED_AT_NOT_NORMALIZED");
  if (Date.parse(normalized) < Date.parse(STAGE2_CURRENT_CHAIN_PINS.architecture.generatedAt)) {
    fail("CONTRACT_GENERATED_AT_PRECEDES_FROZEN_ARCHITECTURE");
  }
  if (requireCanonical
    && normalized !== STAGE2_CURRENT_CHAIN_ADMISSION_FROZEN_AT) {
    fail("CONTRACT_GENERATED_AT_NOT_CANONICAL_FIXED_VALUE");
  }
  return normalized;
}

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

/*
 * Turn caller-owned JSON-like input into an inert private snapshot without
 * invoking getters. This closes the async accessor/timer swap where source A
 * could be replayed and frontier B sealed after an await. Buffers are copied,
 * not shared. Cycles and exotic objects are outside every public schema.
 */
function inertSnapshot(value, code) {
  const memo = new WeakMap();
  const active = new WeakSet();
  let nodes = 0;
  const copyValue = (current, depth) => {
    nodes += 1;
    if (nodes > 1_000_000 || depth > 256) fail("INPUT_TOO_COMPLEX", code);
    if (current === null || typeof current === "string"
      || typeof current === "boolean") return current;
    if (typeof current === "number") {
      if (!Number.isFinite(current)) fail("INPUT_NONFINITE_NUMBER", code);
      return current;
    }
    if (typeof current !== "object") fail("INPUT_VALUE_INVALID", code);
    if (isProxy(current)) fail("INPUT_PROXY_INVALID", code);
    if (Buffer.isBuffer(current)) return Buffer.from(current);
    if (current instanceof Uint8Array) return new Uint8Array(current);
    if (current instanceof ArrayBuffer) return current.slice(0);
    if (memo.has(current)) {
      if (active.has(current)) fail("INPUT_CYCLE_INVALID", code);
      return memo.get(current);
    }
    if (Array.isArray(current)) {
      const output = new Array(current.length);
      memo.set(current, output);
      active.add(current);
      const keys = Reflect.ownKeys(current);
      for (const key of keys) {
        if (key === "length") continue;
        if (typeof key !== "string" || !/^(0|[1-9][0-9]*)$/u.test(key)
          || Number(key) >= current.length) fail("INPUT_ARRAY_SHAPE_INVALID", code);
        const descriptor = Object.getOwnPropertyDescriptor(current, key);
        if (!descriptor || !("value" in descriptor) || descriptor.enumerable !== true) {
          fail("INPUT_ACCESSOR_OR_HIDDEN_FIELD_INVALID", code);
        }
        output[Number(key)] = copyValue(descriptor.value, depth + 1);
      }
      if (Object.keys(output).length !== output.length) {
        fail("INPUT_SPARSE_ARRAY_INVALID", code);
      }
      active.delete(current);
      return output;
    }
    const prototype = Object.getPrototypeOf(current);
    if (prototype !== Object.prototype && prototype !== null) {
      fail("INPUT_EXOTIC_OBJECT_INVALID", code);
    }
    const output = prototype === null ? Object.create(null) : {};
    memo.set(current, output);
    active.add(current);
    for (const key of Reflect.ownKeys(current)) {
      if (typeof key !== "string") fail("INPUT_SYMBOL_FIELD_INVALID", code);
      const descriptor = Object.getOwnPropertyDescriptor(current, key);
      if (!descriptor || !("value" in descriptor) || descriptor.enumerable !== true) {
        fail("INPUT_ACCESSOR_OR_HIDDEN_FIELD_INVALID", code);
      }
      output[key] = copyValue(descriptor.value, depth + 1);
    }
    active.delete(current);
    return output;
  };
  return copyValue(value, 0);
}

function captureCurrentChainInput(input) {
  const snapshot = inertSnapshot(input, "CURRENT_CHAIN");
  if (!exactKeys(snapshot, [
    "mathArtifactPath", "architectureArtifactPath", "mathSources",
  ]) || !plain(snapshot.mathSources)) fail("CURRENT_CHAIN_INPUT_SCHEMA_INVALID");
  return snapshot;
}

function captureAdmissionInput(input) {
  const snapshot = inertSnapshot(input, "ADMISSION");
  if (!exactKeys(snapshot, [
    "frontier", "frontierSources", "mathArtifactPath", "architectureArtifactPath",
    "mathSources",
  ]) || !plain(snapshot.mathSources)) fail("INPUT_SCHEMA_INVALID");
  return snapshot;
}

function captureCanonicalContractInput(input) {
  const snapshot = inertSnapshot(input, "CANONICAL_ADMISSION_CONTRACT");
  if (!exactKeys(snapshot, [
    "contractArtifactPath", "mathArtifactPath", "architectureArtifactPath",
    "mathSources",
  ]) || !plain(snapshot.mathSources)) {
    fail("CANONICAL_CONTRACT_INPUT_SCHEMA_INVALID");
  }
  return snapshot;
}

export const STAGE2_CURRENT_CHAIN_PIN_SET_HASH = digest(
  DOMAINS.pins, STAGE2_CURRENT_CHAIN_PINS,
);

function requiredPath(value, code) {
  if (typeof value !== "string" || value.length === 0 || value.includes("\0")) {
    fail("PATH_INVALID", code);
  }
  const resolved = path.resolve(value);
  if (resolved === path.parse(resolved).root) fail("PATH_TOO_BROAD", code);
  return resolved;
}

function stableReadPinnedJson(filePath, pin, hashField, code) {
  const resolved = requiredPath(filePath, code);
  const canonicalPath = path.resolve(REPOSITORY_ROOT, pin.repositoryRelativePath);
  if (resolved !== canonicalPath) fail("PINNED_CANONICAL_PATH_MISMATCH", code);
  let descriptor;
  try {
    descriptor = openSync(resolved,
      fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0));
    const before = fstatSync(descriptor, { bigint: true });
    if (!before.isFile() || before.size < 2n
      || before.size > BigInt(MAX_ARTIFACT_BYTES)) {
      fail("ARTIFACT_FILE_INVALID", code);
    }
    const bytes = readFileSync(descriptor);
    const after = fstatSync(descriptor, { bigint: true });
    if (before.dev !== after.dev || before.ino !== after.ino
      || before.size !== after.size || before.mtimeNs !== after.mtimeNs
      || before.ctimeNs !== after.ctimeNs || bytes.length !== Number(before.size)) {
      fail("ARTIFACT_FILE_CHANGED_DURING_READ", code);
    }
    const fileHash = `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
    if (bytes.length !== pin.artifactFileBytes || fileHash !== pin.artifactFileHash) {
      fail("PINNED_ARTIFACT_BYTES_MISMATCH", code);
    }
    let value;
    try { value = JSON.parse(bytes.toString("utf8")); }
    catch { fail("ARTIFACT_JSON_INVALID", code); }
    if (!plain(value) || value.schema !== pin.schema
      || value[hashField] !== pin[hashField]) {
      fail("PINNED_ARTIFACT_SEMANTIC_HASH_MISMATCH", code);
    }
    const declaredTime = value.generatedAt ?? value.asOf ?? value.createdAt ?? null;
    if (declaredTime !== null && (typeof declaredTime !== "string"
      || !Number.isFinite(Date.parse(declaredTime))
      || BigInt(Date.parse(declaredTime)) * 1_000_000n > before.mtimeNs)) {
      fail("PINNED_ARTIFACT_DECLARED_TIME_AFTER_FILE_MTIME", code);
    }
    return { value, fileHash, fileBytes: bytes.length, stableRead: true };
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function selected(object, keys) {
  return Object.fromEntries(keys.map((key) => [key, object?.[key]]));
}

function flywheelReceiptSet(rows) {
  if (!Array.isArray(rows)) fail("FLYWHEEL_REQUIRED_ARTIFACT_SET_INVALID");
  const keys = [
    "artifactId", "artifactPathRole", "sourcePathRole", "artifactHash",
    "artifactFileHash", "artifactFileBytes", "hashField", "sourceCommitment",
    "sourceCommitmentMeaning", "verifierLevel", "containedLaneIds",
    "upstreamArtifactHashes", "upstreamBindingHashes", "sourceBytesReplayed",
    "sourceBytesReplayedClaimBasis", "temporalAuthenticityEstablished",
    "temporalStatus", "currentRoutingEligible", "currentCoverage", "currentTruth",
    "currentTruthMeaning", "closureCredit", "causalExperienceUnits",
    "trainingAdmission", "pricingAdmission", "operationalAuthorityGranted",
    "sourceReplayClaimedByArtifactAlone", "exactArtifactComparedByArtifactAlone",
  ];
  const commitments = rows.map((row) => {
    if (!plain(row)) fail("FLYWHEEL_REQUIRED_ARTIFACT_ROW_INVALID");
    const expectedKeys = Object.hasOwn(row, "acquisitionManifestHash")
      ? [...keys, "acquisitionManifestHash"] : keys;
    if (!exactKeys(row, expectedKeys)) fail("FLYWHEEL_REQUIRED_ARTIFACT_ROW_SHAPE_INVALID");
    const commitment = selected(row, keys);
    if (Object.hasOwn(row, "acquisitionManifestHash")) {
      commitment.acquisitionManifestHash = row.acquisitionManifestHash;
    }
    return commitment;
  }).sort((left, right) => left.artifactId.localeCompare(right.artifactId));
  if (new Set(commitments.map((row) => row.artifactId)).size !== commitments.length) {
    fail("FLYWHEEL_REQUIRED_ARTIFACT_ID_DUPLICATE");
  }
  return commitments;
}

function requirePinnedFlywheelArtifact(receipt, pin, code) {
  const matches = receipt.requiredArtifacts?.filter((row) =>
    row.artifactId === pin.artifactId) ?? [];
  const keys = [
    "artifactId", "artifactPathRole", "sourcePathRole", "hashField",
    "artifactHash", "artifactFileHash", "artifactFileBytes", "sourceCommitment",
    "verifierLevel", "containedLaneIds", "sourceBytesReplayed",
    "temporalAuthenticityEstablished", "temporalStatus", "currentRoutingEligible",
    "currentCoverage", "currentTruth", "currentTruthMeaning", "closureCredit",
    "causalExperienceUnits", "trainingAdmission", "pricingAdmission",
    "operationalAuthorityGranted",
  ];
  if (Object.hasOwn(pin, "acquisitionManifestHash")) {
    keys.push("acquisitionManifestHash");
  }
  if (matches.length !== 1 || !same(selected(matches[0], keys), selected(pin, keys))) {
    fail(code);
  }
}

function requirePinnedTransitiveChain(math, architecture) {
  const pins = STAGE2_CURRENT_CHAIN_PINS;
  const architectureBindingKeys = [
    "repositoryRelativePath", "generatedAt", "artifactHash", "artifactFileHash",
    "artifactFileBytes", "factorDictionaryHash", "readinessStatus",
    "pinnedReceiptCount", "temporallyOrderedCurrentReceiptCount",
    "temporalQuarantineReceiptCount", "currentCoverageReceiptCount",
    "allPinnedReceiptsTemporallyCurrent", "temporalAuditManifestHash",
    "temporalQuarantineReferenceFactorCount",
    "temporallyOrderedReceiptReferenceFactorCount",
    "factorsAdmittedForCurrentCoverage", "factorsAdmittedForCurrentRouting",
    "temporalQuarantineClosureCredit", "temporalQuarantineCausalExperienceUnits",
    "temporalQuarantineTrainingAdmission", "temporalQuarantinePricingAdmission",
    "temporalQuarantineOperationalAuthority",
  ];
  const expectedArchitectureBinding = {
    ...selected(pins.math, [
    "repositoryRelativePath", "generatedAt", "artifactHash", "artifactFileHash",
    "artifactFileBytes", "factorDictionaryHash",
    ]),
    readinessStatus: "HOLD_TEMPORAL_QUARANTINE_REFERENCE_ONLY",
    pinnedReceiptCount: 16,
    temporallyOrderedCurrentReceiptCount: 9,
    temporalQuarantineReceiptCount: 7,
    currentCoverageReceiptCount: 9,
    allPinnedReceiptsTemporallyCurrent: false,
    temporalAuditManifestHash: pins.temporalAudit.manifestHash,
    temporalQuarantineReferenceFactorCount: 40,
    temporallyOrderedReceiptReferenceFactorCount: 62,
    factorsAdmittedForCurrentCoverage: 0,
    factorsAdmittedForCurrentRouting: 0,
    temporalQuarantineClosureCredit: 0,
    temporalQuarantineCausalExperienceUnits: 0,
    temporalQuarantineTrainingAdmission: 0,
    temporalQuarantinePricingAdmission: 0,
    temporalQuarantineOperationalAuthority: 0,
  };
  if (!same(selected(architecture.upstreamMathBinding, architectureBindingKeys),
    expectedArchitectureBinding)) {
    fail("ARCHITECTURE_TO_MATH_BINDING_MISMATCH");
  }
  const receipt = math.upstreamFlywheelReceipt;
  if (!plain(receipt) || receipt.schema !== pins.flywheel.schema
    || receipt.artifactHash !== pins.flywheel.artifactHash
    || !same(receipt.frozenCatalog, {
      repositoryRelativePath: pins.catalog.repositoryRelativePath,
      artifactPathRole: "FROZEN_CANONICAL_REAL_CASE_GAP_EVIDENCE_CATALOG_JSON",
      asOf: pins.catalog.asOf,
      catalogHash: pins.catalog.catalogHash,
      artifactFileHash: pins.catalog.artifactFileHash,
      artifactFileBytes: pins.catalog.artifactFileBytes,
    })
    || !same(receipt.frozenCanonical, {
      repositoryRelativePath: pins.flywheel.repositoryRelativePath,
      artifactPathRole: "FROZEN_CANONICAL_REAL_CASE_RESPONSIBILITY_FLYWHEEL_JSON",
      generatedAt: pins.flywheel.generatedAt,
      artifactHash: pins.flywheel.artifactHash,
      artifactFileHash: pins.flywheel.artifactFileHash,
      artifactFileBytes: pins.flywheel.artifactFileBytes,
    })
    || !same(receipt.temporalAuditBinding, {
      canonicalRelease: pins.temporalAudit.canonicalRelease,
      repositoryRelativePath: pins.temporalAudit.repositoryRelativePath,
      manifestHash: pins.temporalAudit.manifestHash,
      artifactFileHash: pins.temporalAudit.artifactFileHash,
      artifactFileBytes: pins.temporalAudit.artifactFileBytes,
      pinnedReceiptCount: 16,
      temporalQuarantineReceiptCount: 7,
      temporallyOrderedCurrentReceiptCount: 9,
      currentCoverageReceiptCount: 9,
      currentCoverageMeaning:
        "RECEIPT_ROUTING_ONLY_NOT_GAP_CLOSURE_OR_WORLD_TRUTH",
      sourceBytesReplayedByFlywheelArtifactAlone: false,
      temporalAuditReverifiedByFlywheelArtifactAlone: false,
      closureCredit: false,
      operationalAuthorityGranted: false,
    })
    || !same(receipt.temporalRoutingSummary, {
      status: "HOLD_TEMPORAL_QUARANTINE_REFERENCE_ONLY",
      pinnedReceiptCount: 16,
      temporallyOrderedCurrentReceiptCount: 9,
      temporalQuarantineReceiptCount: 7,
      currentCoverageReceiptCount: 9,
      allPinnedReceiptsTemporallyCurrent: false,
      temporalQuarantineClosureCredit: 0,
      temporalQuarantineCausalExperienceUnits: 0,
      temporalQuarantineTrainingAdmission: 0,
      temporalQuarantinePricingAdmission: 0,
      temporalQuarantineOperationalAuthority: 0,
    })) {
    fail("MATH_TO_CATALOG_OR_FLYWHEEL_BINDING_MISMATCH");
  }
  if (!same(selected(receipt.temporalAuthenticityBoundary, [
    "status", "auditCanonicalRelease", "auditRepositoryRelativePath",
    "auditManifestHash", "auditArtifactFileHash", "auditArtifactFileBytes",
    "pinnedReceiptCount", "sourceBytesReplayedReceiptCount",
    "temporallyOrderedCurrentReceiptCount", "temporalQuarantineReceiptCount",
    "currentCoverageReceiptCount", "allPinnedReceiptsTemporallyCurrent",
    "temporalQuarantineCurrentCoverage", "temporalQuarantineClosureCredit",
    "temporalQuarantineCausalExperienceUnits", "temporalQuarantineTrainingAdmission",
    "temporalQuarantinePricingAdmission", "temporalQuarantineOperationalAuthority",
  ]), {
    status: "FULL_PINNED_SOURCE_REPLAY_WITH_TEMPORAL_QUARANTINE",
    auditCanonicalRelease: pins.temporalAudit.canonicalRelease,
    auditRepositoryRelativePath: pins.temporalAudit.repositoryRelativePath,
    auditManifestHash: pins.temporalAudit.manifestHash,
    auditArtifactFileHash: pins.temporalAudit.artifactFileHash,
    auditArtifactFileBytes: pins.temporalAudit.artifactFileBytes,
    pinnedReceiptCount: 16,
    sourceBytesReplayedReceiptCount: 16,
    temporallyOrderedCurrentReceiptCount: 9,
    temporalQuarantineReceiptCount: 7,
    currentCoverageReceiptCount: 9,
    allPinnedReceiptsTemporallyCurrent: false,
    temporalQuarantineCurrentCoverage: 0,
    temporalQuarantineClosureCredit: 0,
    temporalQuarantineCausalExperienceUnits: 0,
    temporalQuarantineTrainingAdmission: 0,
    temporalQuarantinePricingAdmission: 0,
    temporalQuarantineOperationalAuthority: 0,
  })) fail("MATH_TEMPORAL_AUTHENTICITY_BOUNDARY_MISMATCH");
  const receiptSet = flywheelReceiptSet(receipt.requiredArtifacts);
  if (receiptSet.length !== pins.flywheel.requiredArtifactReceiptCount
    || digest(DOMAINS.flywheelReceiptSet, receiptSet)
      !== pins.flywheel.requiredArtifactReceiptSetHash) {
    fail("FULL_FLYWHEEL_REQUIRED_ARTIFACT_SET_BINDING_MISMATCH");
  }
  requirePinnedFlywheelArtifact(receipt, pins.clinicalTrials,
    "FLYWHEEL_TO_CLINICALTRIALS_BINDING_MISMATCH");
  requirePinnedFlywheelArtifact(receipt, pins.wave5Intake,
    "FLYWHEEL_TO_WAVE5_INTAKE_BINDING_MISMATCH");
}

function requireNullArchitectureBoundary(math, architecture) {
  const sourceAdmissions = math.factorAdmissionDiagnostics?.sourceDomainAdmission;
  const factorRows = math.factorAdmissionDiagnostics?.rows;
  const mathBoundary = math.mathematicalBoundary;
  const mathTargetEstimates = [
    "targetDomainLossEstimate", "targetDomainFrequencyEstimate",
    "targetDomainSeverityEstimate", "targetDomainTailEstimate",
    "targetDomainDependenceEstimate", "targetDomainPrice",
  ];
  if (!Array.isArray(sourceAdmissions) || !Array.isArray(factorRows)
    || sourceAdmissions.some((row) => row.admittedForTargetDomainUse !== 0
      || row.targetDomainTransferEstablished !== false)
    || factorRows.some((row) => row.targetDomainUseAdmitted !== false
      || row.targetTransferEstablished !== false)
    || !plain(math.authority)
    || Object.values(math.authority).some((value) => value !== false)
    || !plain(mathBoundary)
    || mathTargetEstimates.some((key) => mathBoundary[key] !== null)
    || mathBoundary.bridgeDataCandidateTrainerRowsEnqueued !== 0
    || mathBoundary.postOutcomeFactorsUsedAsPreActionPredictors !== false
    || mathBoundary.heterogeneousSourceDomainsPooled !== false
    || mathBoundary.clinicalTrialsTrainingOrPriceAdmitted !== false
    || math.readiness?.status !== "HOLD_TEMPORAL_QUARANTINE_REFERENCE_ONLY"
    || math.readiness?.pinnedReceiptCount !== 16
    || math.readiness?.temporallyOrderedCurrentReceiptCount !== 9
    || math.readiness?.temporalQuarantineReceiptCount !== 7
    || math.readiness?.currentCoverageReceiptCount !== 9
    || math.readiness?.allPinnedReceiptsTemporallyCurrent !== false
    || math.readiness?.temporalQuarantineClosureCredit !== 0
    || math.readiness?.temporalQuarantineCausalExperienceUnits !== 0
    || math.readiness?.temporalQuarantineTrainingAdmission !== 0
    || math.readiness?.temporalQuarantinePricingAdmission !== 0
    || math.readiness?.temporalQuarantineOperationalAuthority !== 0
    || math.factorAdmissionDiagnostics?.temporalQuarantineReferenceFactorCount !== 40
    || math.factorAdmissionDiagnostics
      ?.temporallyOrderedReceiptReferenceFactorCount !== 62
    || math.factorAdmissionDiagnostics?.factorsAdmittedForCurrentCoverage !== 0
    || math.factorAdmissionDiagnostics?.factorsAdmittedForCurrentRouting !== 0
    || math.readiness?.targetDomainTransferEstablished !== false
    || math.readiness?.readyToPrice !== false
    || math.readiness?.readyToGuarantee !== false
    || math.readiness?.readyToSettle !== false
    || math.readiness?.readyToBearResponsibility !== false) {
    fail("MATH_TARGET_FACTOR_ADMISSION_NONZERO");
  }
  if (architecture.trainingBoundary?.automaticallyAdmittedTargetTrainingRows !== 0
    || architecture.trainingBoundary?.automaticallyAdmittedTargetPredictors !== 0
    || architecture.trainingBoundary?.temporalQuarantineReferenceFactors !== 40
    || architecture.trainingBoundary?.temporallyOrderedReceiptReferenceFactors !== 62
    || architecture.trainingBoundary?.factorsAdmittedForCurrentCoverage !== 0
    || architecture.trainingBoundary?.factorsAdmittedForCurrentRouting !== 0
    || architecture.promotionProtocol?.targetModelComponentsFitted !== 0
    || architecture.promotionProtocol?.temporalQuarantineCanAdvanceState !== false
    || architecture.factorRoleAudit?.temporalQuarantineReferenceFactorCount !== 40
    || architecture.factorRoleAudit
      ?.temporallyOrderedReceiptReferenceFactorCount !== 62
    || architecture.factorRoleAudit?.factorsAdmittedForCurrentCoverage !== 0
    || architecture.factorRoleAudit?.factorsAdmittedForCurrentRouting !== 0
    || !plain(architecture.outputs)
    || Object.values(architecture.outputs).some((value) => value !== null)
    || architecture.readiness?.status !== "HOLD_TEMPORAL_QUARANTINE_REFERENCE_ONLY"
    || architecture.readiness?.pinnedReceiptCount !== 16
    || architecture.readiness?.temporallyOrderedCurrentReceiptCount !== 9
    || architecture.readiness?.temporalQuarantineReceiptCount !== 7
    || architecture.readiness?.currentFactorCoverageAdmission !== 0
    || architecture.readiness?.currentFactorRoutingAdmission !== 0
    || architecture.readiness?.currentTargetModelAdmission !== 0
    || architecture.readiness?.temporalQuarantineClosureCredit !== 0
    || architecture.readiness?.temporalQuarantineCausalExperienceUnits !== 0
    || architecture.readiness?.temporalQuarantineTrainingAdmission !== 0
    || architecture.readiness?.temporalQuarantinePricingAdmission !== 0
    || architecture.readiness?.temporalQuarantineOperationalAuthority !== 0
    || architecture.readiness?.readyToPrice !== false
    || architecture.readiness?.readyToBearResponsibility !== false
    || !plain(architecture.authority)
    || Object.values(architecture.authority).some((value) => value !== false)
    || architecture.modernActuarialContracts?.globalNullBoundary
      ?.qualifiedTargetRecords !== 0
    || architecture.modernActuarialContracts?.globalNullBoundary?.PRICE !== null
    || architecture.modernActuarialContracts?.globalNullBoundary?.authority !== false) {
    fail("ARCHITECTURE_NULL_AUTHORITY_BOUNDARY_INVALID");
  }
}

function noOutputs() {
  return {
    targetFrequencyEstimate: null,
    targetSeverityEstimate: null,
    targetRiskEstimate: null,
    targetModel: null,
    premium: null,
    price: null,
    PRICE: null,
    capital: null,
    coverage: null,
    guarantee: null,
    settlementInstruction: null,
    responsibilityDecision: null,
  };
}

function noReadiness() {
  return {
    status: "HOLD_TEMPORAL_QUARANTINE_REFERENCE_ONLY",
    pinnedReceiptCount: 16,
    temporallyOrderedCurrentReceiptCount: 9,
    temporalQuarantineReceiptCount: 7,
    currentCoverageReceiptCount: 9,
    allPinnedReceiptsTemporallyCurrent: false,
    temporalQuarantineReferenceFactorCount: 40,
    temporallyOrderedReceiptReferenceFactorCount: 62,
    currentFactorCoverageAdmission: 0,
    currentFactorRoutingAdmission: 0,
    currentTargetModelAdmission: 0,
    temporalQuarantineClosureCredit: 0,
    temporalQuarantineCausalExperienceUnits: 0,
    temporalQuarantineTrainingAdmission: 0,
    temporalQuarantinePricingAdmission: 0,
    temporalQuarantineOperationalAuthority: 0,
    targetObservationContractComplete: false,
    targetPreActionFeatureContractComplete: false,
    targetProspectiveHoldoutComplete: false,
    targetModelCalibrated: false,
    targetDomainTransferEstablished: false,
    readyToPrice: false,
    readyForCapital: false,
    readyToGuarantee: false,
    readyToSettle: false,
    readyToBearResponsibility: false,
  };
}

function temporalHoldReceiptFields() {
  return {
    readinessStatus: "HOLD_TEMPORAL_QUARANTINE_REFERENCE_ONLY",
    temporalAuditManifestHash: STAGE2_CURRENT_CHAIN_PINS.temporalAudit.manifestHash,
    pinnedReceiptCount: 16,
    temporallyOrderedCurrentReceiptCount: 9,
    temporalQuarantineReceiptCount: 7,
    currentCoverageReceiptCount: 9,
    allPinnedReceiptsTemporallyCurrent: false,
    temporalQuarantineReferenceFactorCount: 40,
    temporallyOrderedReceiptReferenceFactorCount: 62,
    factorsAdmittedForCurrentCoverage: 0,
    factorsAdmittedForCurrentRouting: 0,
    temporalQuarantineClosureCredit: 0,
    temporalQuarantineCausalExperienceUnits: 0,
    temporalQuarantineTrainingAdmission: 0,
    temporalQuarantinePricingAdmission: 0,
    temporalQuarantineOperationalAuthority: 0,
  };
}

function noPermissions() {
  return {
    TRAIN: false,
    PRICE: false,
    PREMIUM: false,
    CAPITAL: false,
    COVERAGE: false,
    GUARANTEE: false,
    SETTLE: false,
    MOVE_FUNDS: false,
    DEPLOY: false,
  };
}

function noAuthority() {
  return {
    professionalActuarialOpinion: false,
    independentActuarialReview: false,
    targetDomainTransfer: false,
    priceAuthority: false,
    underwritingAuthority: false,
    capitalAuthority: false,
    custodyAuthority: false,
    claimsAuthority: false,
    paymentAuthority: false,
    operationalAuthorityGranted: false,
  };
}

function currentChainVerificationRequirements() {
  return {
    requiredVerificationLevel:
      "FULL_PINNED_SOURCE_REPLAY_WITH_TEMPORAL_QUARANTINE_HOLD",
    temporalAuditCanonicalStableReadThroughFlywheelRequired: true,
    temporalAuditExactFileHashThroughFlywheelRequired: true,
    pinnedReceiptCountRequired: 16,
    temporallyOrderedCurrentReceiptCountRequired: 9,
    temporalQuarantineReceiptCountRequired: 7,
    currentCoverageReceiptCountRequired: 9,
    allPinnedReceiptsTemporallyCurrentExpected: false,
    mathCanonicalStableReadRequired: true,
    mathCanonicalExactFileHashRequired: true,
    architectureCanonicalStableReadRequired: true,
    architectureCanonicalExactFileHashRequired: true,
    architectureFixedProjectionRequired: true,
    exactMathSourceRebuildThroughArchitectureRequired: true,
    catalogCanonicalStableReadThroughMathRequired: true,
    catalogCodeProjectionMatchThroughMathRequired: true,
    flywheelCanonicalStableReadThroughMathRequired: true,
    exactFlywheelSourceRebuildThroughMathRequired: true,
    clinicalTrialsArtifactAndSixApiObjectReplayRequired: true,
    clinicalTrialsRightsTermsExpectedReplayed: false,
    wave5IntakeArtifactAndFiftySevenSourceObjectReplayRequired: true,
    wave5UniformTrainingRightsExpectedEstablished: false,
    callerReceiptsOrTrustFlagsAccepted: false,
    staleOrSupersededCanonicalAccepted: false,
    sourceReplayClaimedByPersistedObject: false,
    structureVerifierCanEstablishSourceReplay: false,
  };
}

function receiptVerificationRequirements() {
  return {
    stage2FrontierFullSourceReplayRequired: true,
    ...currentChainVerificationRequirements(),
  };
}

function contractLifecycle() {
  return {
    objectKind: "TEMPORALLY_AUDITED_SOURCE_CHAIN_HOLD_CONTRACT_NO_QUOTE",
    containsClaimWayWorld: false,
    containsQuote: false,
    canonicalizable: true,
    codeSelectedCanonical: true,
    evidenceTemporalCurrent: false,
    status: "CANONICAL_RELEASE_WITH_TEMPORAL_QUARANTINE_HOLD",
    canonicalRelease: STAGE2_CURRENT_CHAIN_ADMISSION_CANONICAL.canonicalRelease,
    canonicalRepositoryRelativePath:
      STAGE2_CURRENT_CHAIN_ADMISSION_CANONICAL.repositoryRelativePath,
    noClobberFreezeRequired: true,
  };
}

function ephemeralReceiptLifecycle() {
  return {
    objectKind: "QUOTE_FRONTIER_SPECIFIC_EPHEMERAL_ADMISSION_RECEIPT",
    canonicalEligible: false,
    durableStage2SourceBundleManifestHash: null,
    protocolTestFixtureMayNotBePresentedAsRealQuoteEvidence: true,
    futureCanonicalQuoteRequiresNewDurableBundleBoundSchema: true,
  };
}

function stage2Binding(frontier) {
  return {
    schema: frontier.schema,
    frontierHash: frontier.frontierHash,
    claimHash: frontier.bindings.reality.claimHash,
    wayHash: frontier.bindings.reality.wayHash,
    worldHash: frontier.bindings.reality.worldHash,
    registryHash: frontier.bindings.registry.registryHash,
    realityEnvelopeHash: frontier.bindings.reality.envelopeHash,
    factorPolicyHash: frontier.bindings.model.factorPolicyHash,
    modelDomainHash: frontier.bindings.model.modelDomainHash,
    validityDomainHash: frontier.bindings.model.validityDomainHash,
    evidenceSetHash: frontier.bindings.evidenceSetHash,
    preActionValuesAdmitted: frontier.preAction.admittedValues.length,
    targetModelComponentsFitted: 0,
    quoteDecision: frontier.quoteBoundary.decision,
  };
}

function currentChainBinding() {
  const pins = STAGE2_CURRENT_CHAIN_PINS;
  return {
    status: "HOLD_TEMPORAL_QUARANTINE_REFERENCE_ONLY",
    pinSetHash: STAGE2_CURRENT_CHAIN_PIN_SET_HASH,
    selectedTemporallyAuditedWaveSubgraph:
      clone(pins.selectedTemporallyAuditedWaveSubgraph),
    temporalAuditManifestHash: pins.temporalAudit.manifestHash,
    pinnedReceiptCount: 16,
    temporallyOrderedCurrentReceiptCount: 9,
    temporalQuarantineReceiptCount: 7,
    currentCoverageReceiptCount: 9,
    allPinnedReceiptsTemporallyCurrent: false,
    temporalQuarantineReferenceFactorCount: 40,
    temporallyOrderedReceiptReferenceFactorCount: 62,
    factorsAdmittedForCurrentCoverage: 0,
    factorsAdmittedForCurrentRouting: 0,
    clinicalTrialsTemporalStatus: pins.clinicalTrials.temporalStatus,
    clinicalTrialsCurrentRoutingEligible: false,
    wave5TemporalStatus: pins.wave5Intake.temporalStatus,
    wave5CurrentRoutingEligible: true,
    clinicalTrialsArtifactHash: pins.clinicalTrials.artifactHash,
    clinicalTrialsSourceCommitment: pins.clinicalTrials.sourceCommitment,
    wave5IntakeArtifactHash: pins.wave5Intake.artifactHash,
    wave5IntakeSourceCommitment: pins.wave5Intake.sourceCommitment,
    catalogHash: pins.catalog.catalogHash,
    flywheelArtifactHash: pins.flywheel.artifactHash,
    fullFlywheelRequiredArtifactReceiptCount:
      pins.flywheel.requiredArtifactReceiptCount,
    fullFlywheelRequiredArtifactReceiptSetHash:
      pins.flywheel.requiredArtifactReceiptSetHash,
    mathArtifactHash: pins.math.artifactHash,
    mathFactorDictionaryHash: pins.math.factorDictionaryHash,
    architectureArtifactHash: pins.architecture.artifactHash,
  };
}

function admissionBoundary() {
  return {
    status: "HOLD_TEMPORAL_QUARANTINE_FROZEN_REFERENCE_DIAGNOSTIC_ONLY",
    permittedUses: [
      "FROZEN_SOURCE_DOMAIN_REFERENCE_DIAGNOSTICS",
      "FROZEN_REFERENCE_FACTOR_ROLE_AUDIT",
      "MODEL_ARCHITECTURE_GAP_DESIGN_WITHOUT_CURRENT_COVERAGE",
    ],
    pinnedReceiptCount: 16,
    temporallyOrderedCurrentReceiptCount: 9,
    temporalQuarantineReceiptCount: 7,
    currentCoverageReceiptCount: 9,
    allPinnedReceiptsTemporallyCurrent: false,
    temporalQuarantineReferenceFactorCount: 40,
    temporallyOrderedReceiptReferenceFactorCount: 62,
    currentFactorCoverageAdmission: 0,
    currentFactorRoutingAdmission: 0,
    temporalQuarantineClosureCredit: 0,
    temporalQuarantineCausalExperienceUnits: 0,
    temporalQuarantineTrainingAdmission: 0,
    temporalQuarantinePricingAdmission: 0,
    temporalQuarantineOperationalAuthority: 0,
    targetPreActionRowsAdmitted: 0,
    targetPreActionPredictorsAdmitted: 0,
    targetTrainingRowsAdmitted: 0,
    targetLossRowsAdmitted: 0,
    targetDomainTransferEstablished: false,
    crossSourcePoolingPerformed: false,
    sourceDomainEvidenceIsTargetReadiness: false,
    sourceDomainEvidenceIsAuthority: false,
    clinicalTrialsRightsForTrainingOrPricingEstablished: false,
  };
}

function contractProjectionAt(generatedAt) {
  generatedAt = normalizedContractGeneratedAt(generatedAt);
  const body = {
    schema: STAGE2_CURRENT_CHAIN_ADMISSION_CONTRACT_SCHEMA,
    schemaVersion: "1.1.0",
    generatedAt,
    generatedAtTrust:
      "CODE_FIXED_BUILD_START_BOUND_NOT_EXTERNAL_TIME_ATTESTATION",
    contractVersion: STAGE2_CURRENT_CHAIN_PINS.contractVersion,
    artifactLifecycle: contractLifecycle(),
    pinSet: clone(STAGE2_CURRENT_CHAIN_PINS),
    pinSetHash: STAGE2_CURRENT_CHAIN_PIN_SET_HASH,
    currentChainBinding: currentChainBinding(),
    verificationRequirements: currentChainVerificationRequirements(),
    admissionBoundary: admissionBoundary(),
    outputs: noOutputs(),
    readiness: noReadiness(),
    permissions: noPermissions(),
    authority: noAuthority(),
  };
  return deepFreeze({ ...body,
    contractHash: digest(STAGE2_CURRENT_CHAIN_ADMISSION_CONTRACT_SCHEMA, body) });
}

function contractProjection() {
  return contractProjectionAt(normalizedContractGeneratedAt(
    STAGE2_CURRENT_CHAIN_ADMISSION_FROZEN_AT, true,
  ));
}

function receiptProjection(frontier) {
  const body = {
    schema: STAGE2_CURRENT_CHAIN_ADMISSION_SCHEMA,
    schemaVersion: "1.0.0",
    contractVersion: STAGE2_CURRENT_CHAIN_PINS.contractVersion,
    artifactLifecycle: ephemeralReceiptLifecycle(),
    admissionContractHash: contractProjection().contractHash,
    pinSet: clone(STAGE2_CURRENT_CHAIN_PINS),
    pinSetHash: STAGE2_CURRENT_CHAIN_PIN_SET_HASH,
    stage2FrontierBinding: stage2Binding(frontier),
    currentChainBinding: currentChainBinding(),
    verificationRequirements: receiptVerificationRequirements(),
    admissionBoundary: admissionBoundary(),
    outputs: noOutputs(),
    readiness: noReadiness(),
    permissions: noPermissions(),
    authority: noAuthority(),
  };
  return deepFreeze({ ...body, receiptHash: digest(DOMAINS.receipt, body) });
}

const ROOT_KEYS = Object.freeze([
  "schema", "schemaVersion", "contractVersion", "artifactLifecycle",
  "admissionContractHash",
  "pinSet", "pinSetHash",
  "stage2FrontierBinding", "currentChainBinding", "verificationRequirements",
  "admissionBoundary", "outputs", "readiness", "permissions", "authority",
  "receiptHash",
]);

const CONTRACT_ROOT_KEYS = Object.freeze([
  "schema", "schemaVersion", "generatedAt", "generatedAtTrust",
  "contractVersion", "artifactLifecycle", "pinSet",
  "pinSetHash", "currentChainBinding", "verificationRequirements",
  "admissionBoundary", "outputs",
  "readiness", "permissions", "authority", "contractHash",
]);

async function replayCurrentChainSources(input) {
  if (!exactKeys(input, [
    "mathArtifactPath", "architectureArtifactPath", "mathSources",
  ]) || !plain(input.mathSources)) {
    fail("CURRENT_CHAIN_INPUT_SCHEMA_INVALID");
  }

  // Authenticate the small canonical envelope before starting expensive source replay.
  const architectureLoaded = stableReadPinnedJson(input.architectureArtifactPath,
    STAGE2_CURRENT_CHAIN_PINS.architecture, "artifactHash", "ARCHITECTURE");
  const mathLoaded = stableReadPinnedJson(input.mathArtifactPath,
    STAGE2_CURRENT_CHAIN_PINS.math, "artifactHash", "MATH");
  const architecture = architectureLoaded.value;
  const math = mathLoaded.value;

  const mathStandalone = verifyRealResponsibilityMathDiagnostics(math);
  if (!mathStandalone.ok || mathStandalone.sourceArtifactsReverified !== false) {
    fail("MATH_FIXED_PROJECTION_INVALID", mathStandalone.error);
  }
  const architectureStandalone = verifyActuarialModelEvolution(architecture);
  if (!architectureStandalone.ok
    || architectureStandalone.sourceArtifactsReverified !== false) {
    fail("ARCHITECTURE_FIXED_PROJECTION_INVALID", architectureStandalone.error);
  }
  requirePinnedTransitiveChain(math, architecture);
  requireNullArchitectureBoundary(math, architecture);

  const architectureFull = await verifyActuarialModelEvolutionAgainstSources(
    architecture,
    { mathArtifactPath: input.mathArtifactPath, mathSources: input.mathSources },
  );
  if (!architectureFull.ok
    || architectureFull.verificationLevel
      !== "FULL_SOURCE_REPLAYED_REFERENCE_ARCHITECTURE_WITH_MATH_TEMPORAL_QUARANTINE"
    || architectureFull.sourceArtifactsReverified !== true
    || architectureFull.frozenMathCanonicalStableRead !== true
    || architectureFull.frozenMathCanonicalFileHashVerified !== true
    || architectureFull.frozenMathExactlyRebuiltFromSources !== true
    || architectureFull.staleOrSupersededMathAccepted !== false
    || architectureFull.readinessStatus
      !== "HOLD_TEMPORAL_QUARANTINE_REFERENCE_ONLY"
    || architectureFull.pinnedReceiptCount !== 16
    || architectureFull.temporallyOrderedCurrentReceiptCount !== 9
    || architectureFull.temporalQuarantineReceiptCount !== 7
    || architectureFull.temporalQuarantineReferenceFactorCount !== 40
    || architectureFull.temporallyOrderedReceiptReferenceFactorCount !== 62
    || architectureFull.factorsAdmittedForCurrentCoverage !== 0
    || architectureFull.factorsAdmittedForCurrentRouting !== 0
    || architectureFull.targetTrainingRowsAdmitted !== 0
    || architectureFull.temporalQuarantineClosureCredit !== 0
    || architectureFull.temporalQuarantineCausalExperienceUnits !== 0
    || architectureFull.temporalQuarantineTrainingAdmission !== 0
    || architectureFull.temporalQuarantinePricingAdmission !== 0
    || architectureFull.temporalQuarantineOperationalAuthority !== 0
    || architectureFull.targetPreActionPredictorsAdmitted !== 0
    || architectureFull.targetModelComponentsFitted !== 0
    || architectureFull.targetDomainTransferEstablished !== false
    || architectureFull.operationalAuthorityGranted !== false) {
    fail("ARCHITECTURE_FULL_SOURCE_REPLAY_FAILED", architectureFull.error);
  }
  return { architectureFull };
}

async function replayAdmissionSources(input) {
  if (!exactKeys(input, [
    "frontier", "frontierSources", "mathArtifactPath", "architectureArtifactPath",
    "mathSources",
  ]) || !plain(input.mathSources)) {
    fail("INPUT_SCHEMA_INVALID");
  }
  const currentChain = await replayCurrentChainSources({
    mathArtifactPath: input.mathArtifactPath,
    architectureArtifactPath: input.architectureArtifactPath,
    mathSources: input.mathSources,
  });

  const stage2 = verifyStage2QuoteFrontier(input.frontier, input.frontierSources);
  if (!stage2.ok || stage2.sourceArtifactsReplayed !== true
    || stage2.sourceReverified !== true || stage2.pricingEligible !== false
    || stage2.bindingQuote !== false || stage2.price !== null
    || stage2.premium !== null || stage2.capital !== null) {
    fail("FRONTIER_FULL_SOURCE_REPLAY_FAILED", stage2.error);
  }

  return { stage2, architectureFull: currentChain.architectureFull };
}

/**
 * Build the canonicalizable source-chain contract. It contains no synthetic or
 * transient Claim/Way/World and grants no quote authority.
 */
export async function buildStage2CurrentChainAdmissionContract(input) {
  const capturedInput = captureCurrentChainInput(input);
  await replayCurrentChainSources(capturedInput);
  const contract = contractProjection();
  const checked = verifyStage2CurrentChainAdmissionContractStructure(contract);
  if (!checked.ok) fail("CONTRACT_SELF_VERIFICATION_FAILED", checked.error);
  return contract;
}

export async function buildStage2CurrentChainAdmissionContractCandidate(
  input, options = {},
) {
  if (!exactKeys(options, ["generatedAt"])) {
    fail("CONTRACT_CANDIDATE_OPTIONS_INVALID");
  }
  // Validate the sampled build-start time before any stable read or source replay.
  const generatedAt = normalizedContractGeneratedAt(options.generatedAt);
  if (Date.parse(generatedAt) > Date.now()) {
    fail("CONTRACT_CANDIDATE_GENERATED_AT_IN_FUTURE");
  }
  const capturedInput = captureCurrentChainInput(input);
  await replayCurrentChainSources(capturedInput);
  return contractProjectionAt(generatedAt);
}

export function verifyStage2CurrentChainAdmissionContractStructure(contract) {
  try {
    contract = inertSnapshot(contract, "ADMISSION_CONTRACT");
    if (!exactKeys(contract, CONTRACT_ROOT_KEYS)
      || contract.schema !== STAGE2_CURRENT_CHAIN_ADMISSION_CONTRACT_SCHEMA
      || contract.schemaVersion !== "1.1.0"
      || contract.generatedAt !== STAGE2_CURRENT_CHAIN_ADMISSION_FROZEN_AT
      || contract.generatedAtTrust
        !== "CODE_FIXED_BUILD_START_BOUND_NOT_EXTERNAL_TIME_ATTESTATION"
      || !HASH.test(contract.contractHash ?? "")
      || !same(contract, contractProjection())) {
      fail("CONTRACT_FIXED_PROJECTION_INVALID");
    }
    return deepFreeze({
      ok: true,
      verificationLevel: "FIXED_ADMISSION_CONTRACT_STRUCTURE_ONLY_NO_SOURCE_AUTHENTICATION",
      sourceArtifactsReverified: false,
      currentChainSourcesReplayed: false,
      contractHash: contract.contractHash,
      pinSetHash: contract.pinSetHash,
      architectureArtifactHash: contract.currentChainBinding.architectureArtifactHash,
      mathArtifactHash: contract.currentChainBinding.mathArtifactHash,
      ...temporalHoldReceiptFields(),
      targetPreActionRowsAdmitted: 0,
      targetModelComponentsFitted: 0,
      price: null,
      PRICE: null,
      capital: null,
      readyToPrice: false,
      readyToBearResponsibility: false,
      operationalAuthorityGranted: false,
    });
  } catch (error) {
    return deepFreeze({
      ok: false,
      verificationLevel: "INVALID",
      sourceArtifactsReverified: false,
      currentChainSourcesReplayed: false,
      targetPreActionRowsAdmitted: 0,
      targetModelComponentsFitted: 0,
      price: null,
      PRICE: null,
      capital: null,
      readyToPrice: false,
      readyToBearResponsibility: false,
      operationalAuthorityGranted: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Stable-read the one canonical contract from its physical repository path and
 * verify its exact bytes plus fixed projection. This authenticates no sources.
 */
export function verifyStage2CurrentChainAdmissionCanonicalStructure(
  contractArtifactPath,
) {
  try {
    const loaded = stableReadPinnedJson(contractArtifactPath,
      STAGE2_CURRENT_CHAIN_ADMISSION_CANONICAL, "contractHash",
      "ADMISSION_CONTRACT");
    const structural = verifyStage2CurrentChainAdmissionContractStructure(
      loaded.value,
    );
    if (!structural.ok) return structural;
    return deepFreeze({
      ...structural,
      verificationLevel:
        "PINNED_CANONICAL_EXACT_BYTES_STRUCTURE_ONLY_NO_SOURCE_AUTHENTICATION",
      contractCanonicalStableRead: true,
      contractCanonicalExactFileHashVerified: true,
      contractArtifactFileHash: loaded.fileHash,
      contractArtifactFileBytes: loaded.fileBytes,
    });
  } catch (error) {
    return deepFreeze({
      ok: false,
      verificationLevel: "INVALID",
      sourceArtifactsReverified: false,
      currentChainSourcesReplayed: false,
      contractCanonicalStableRead: false,
      contractCanonicalExactFileHashVerified: false,
      targetPreActionRowsAdmitted: 0,
      targetModelComponentsFitted: 0,
      price: null,
      PRICE: null,
      capital: null,
      readyToPrice: false,
      readyToBearResponsibility: false,
      operationalAuthorityGranted: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function verifyStage2CurrentChainAdmissionContractAgainstSources(
  contract, input,
) {
  try {
    const capturedContract = inertSnapshot(contract, "ADMISSION_CONTRACT");
    const capturedInput = captureCurrentChainInput(input);
    const structural = verifyStage2CurrentChainAdmissionContractStructure(capturedContract);
    if (!structural.ok) return structural;
    await replayCurrentChainSources(capturedInput);
    if (!same(capturedContract, contractProjection())) {
      fail("FULL_SOURCE_CONTRACT_MISMATCH");
    }
    return deepFreeze({
      ok: true,
      verificationLevel:
        "FULL_PINNED_SOURCE_REPLAY_WITH_TEMPORAL_QUARANTINE_HOLD_CONTRACT",
      sourceArtifactsReverified: true,
      currentChainSourcesReplayed: true,
      mathCanonicalStableRead: true,
      architectureCanonicalStableRead: true,
      catalogCanonicalStableReadThroughMath: true,
      flywheelExactlyRebuiltFromSourcesThroughMath: true,
      clinicalTrialsArtifactAndSixApiObjectsReplayedThroughFlywheel: true,
      clinicalTrialsRightsTermsReplayed: false,
      wave5IntakeArtifactAndFiftySevenSourceObjectsReplayedThroughFlywheel: true,
      wave5UniformTrainingRightsEstablished: false,
      callerReceiptsOrTrustFlagsAccepted: false,
      staleOrSupersededCanonicalAccepted: false,
      contractHash: capturedContract.contractHash,
      pinSetHash: capturedContract.pinSetHash,
      architectureArtifactHash:
        capturedContract.currentChainBinding.architectureArtifactHash,
      mathArtifactHash: capturedContract.currentChainBinding.mathArtifactHash,
      ...temporalHoldReceiptFields(),
      targetPreActionRowsAdmitted: 0,
      targetModelComponentsFitted: 0,
      targetDomainTransferEstablished: false,
      price: null,
      PRICE: null,
      capital: null,
      readyToPrice: false,
      readyToBearResponsibility: false,
      operationalAuthorityGranted: false,
    });
  } catch (error) {
    return deepFreeze({
      ok: false,
      verificationLevel: "FULL_TEMPORAL_QUARANTINE_CHAIN_CONTRACT_SOURCE_REPLAY_FAILED",
      sourceArtifactsReverified: false,
      currentChainSourcesReplayed: false,
      staleOrSupersededCanonicalAccepted: false,
      targetPreActionRowsAdmitted: 0,
      targetModelComponentsFitted: 0,
      targetDomainTransferEstablished: false,
      price: null,
      PRICE: null,
      capital: null,
      readyToPrice: false,
      readyToBearResponsibility: false,
      operationalAuthorityGranted: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Verify the exact canonical contract and replay its entire current source
 * chain in the same call. Caller trust flags and alternate contract bytes are
 * outside this interface.
 */
export async function verifyStage2CurrentChainAdmissionCanonicalAgainstSources(
  input,
) {
  try {
    const capturedInput = captureCanonicalContractInput(input);
    const loaded = stableReadPinnedJson(capturedInput.contractArtifactPath,
      STAGE2_CURRENT_CHAIN_ADMISSION_CANONICAL, "contractHash",
      "ADMISSION_CONTRACT");
    const full = await verifyStage2CurrentChainAdmissionContractAgainstSources(
      loaded.value,
      {
        mathArtifactPath: capturedInput.mathArtifactPath,
        architectureArtifactPath: capturedInput.architectureArtifactPath,
        mathSources: capturedInput.mathSources,
      },
    );
    if (!full.ok) return full;
    return deepFreeze({
      ...full,
      verificationLevel:
        "FULL_PINNED_CANONICAL_CONTRACT_AND_SOURCE_REPLAY_WITH_TEMPORAL_QUARANTINE_HOLD",
      contractCanonicalStableRead: true,
      contractCanonicalExactFileHashVerified: true,
      contractArtifactFileHash: loaded.fileHash,
      contractArtifactFileBytes: loaded.fileBytes,
    });
  } catch (error) {
    return deepFreeze({
      ok: false,
      verificationLevel: "FULL_CANONICAL_CONTRACT_SOURCE_REPLAY_FAILED",
      sourceArtifactsReverified: false,
      currentChainSourcesReplayed: false,
      contractCanonicalStableRead: false,
      contractCanonicalExactFileHashVerified: false,
      staleOrSupersededCanonicalAccepted: false,
      targetPreActionRowsAdmitted: 0,
      targetModelComponentsFitted: 0,
      targetDomainTransferEstablished: false,
      price: null,
      PRICE: null,
      capital: null,
      readyToPrice: false,
      readyToBearResponsibility: false,
      operationalAuthorityGranted: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Build a deterministic admission receipt only after replaying both the legacy
 * quote-frontier sources and the exact current actuarial source chain.
 */
export async function buildStage2CurrentChainAdmission(input) {
  const capturedInput = captureAdmissionInput(input);
  await replayAdmissionSources(capturedInput);
  const receipt = receiptProjection(capturedInput.frontier);
  const checked = verifyStage2CurrentChainAdmissionStructure(receipt);
  if (!checked.ok) fail("SELF_VERIFICATION_FAILED", checked.error);
  return receipt;
}

export function verifyStage2CurrentChainAdmissionStructure(receipt) {
  try {
    receipt = inertSnapshot(receipt, "EPHEMERAL_ADMISSION_RECEIPT");
    if (!exactKeys(receipt, ROOT_KEYS)
      || receipt.schema !== STAGE2_CURRENT_CHAIN_ADMISSION_SCHEMA
      || receipt.schemaVersion !== "1.0.0"
      || receipt.contractVersion !== STAGE2_CURRENT_CHAIN_PINS.contractVersion
      || !same(receipt.artifactLifecycle, ephemeralReceiptLifecycle())
      || receipt.admissionContractHash !== contractProjection().contractHash
      || !HASH.test(receipt.receiptHash ?? "")
      || !same(receipt.pinSet, STAGE2_CURRENT_CHAIN_PINS)
      || receipt.pinSetHash !== STAGE2_CURRENT_CHAIN_PIN_SET_HASH
      || !same(receipt.currentChainBinding, currentChainBinding())
      || !same(receipt.verificationRequirements, receiptVerificationRequirements())
      || !same(receipt.admissionBoundary, admissionBoundary())
      || !same(receipt.outputs, noOutputs())
      || !same(receipt.readiness, noReadiness())
      || !same(receipt.permissions, noPermissions())
      || !same(receipt.authority, noAuthority())) {
      fail("RECEIPT_FIXED_BOUNDARY_INVALID");
    }
    if (!exactKeys(receipt.stage2FrontierBinding, [
      "schema", "frontierHash", "claimHash", "wayHash", "worldHash",
      "registryHash", "realityEnvelopeHash", "factorPolicyHash", "modelDomainHash",
      "validityDomainHash", "evidenceSetHash", "preActionValuesAdmitted",
      "targetModelComponentsFitted", "quoteDecision",
    ]) || Object.entries(receipt.stage2FrontierBinding)
      .filter(([key]) => key.endsWith("Hash"))
      .some(([, value]) => !HASH.test(value ?? ""))
      || receipt.stage2FrontierBinding.schema
        !== "outsider/stage2-model-quote-frontier/v1"
      || receipt.stage2FrontierBinding.preActionValuesAdmitted !== 0
      || receipt.stage2FrontierBinding.targetModelComponentsFitted !== 0
      || receipt.stage2FrontierBinding.quoteDecision !== "NON_BINDING_ABSTAIN") {
      fail("FRONTIER_BINDING_INVALID");
    }
    const { receiptHash, ...body } = receipt;
    if (receiptHash !== digest(DOMAINS.receipt, body)) fail("RECEIPT_HASH_INVALID");
    return deepFreeze({
      ok: true,
      verificationLevel: "SELF_SEALED_STRUCTURE_ONLY_NO_SOURCE_AUTHENTICATION",
      sourceArtifactsReverified: false,
      currentChainSourcesReplayed: false,
      staleOrSupersededCanonicalAccepted: false,
      receiptHash,
      frontierHash: receipt.stage2FrontierBinding.frontierHash,
      architectureArtifactHash: receipt.currentChainBinding.architectureArtifactHash,
      mathArtifactHash: receipt.currentChainBinding.mathArtifactHash,
      ...temporalHoldReceiptFields(),
      targetPreActionRowsAdmitted: 0,
      targetModelComponentsFitted: 0,
      price: null,
      PRICE: null,
      capital: null,
      readyToPrice: false,
      readyToBearResponsibility: false,
      operationalAuthorityGranted: false,
    });
  } catch (error) {
    return deepFreeze({
      ok: false,
      verificationLevel: "INVALID",
      sourceArtifactsReverified: false,
      currentChainSourcesReplayed: false,
      staleOrSupersededCanonicalAccepted: false,
      targetPreActionRowsAdmitted: 0,
      targetModelComponentsFitted: 0,
      price: null,
      PRICE: null,
      capital: null,
      readyToPrice: false,
      readyToBearResponsibility: false,
      operationalAuthorityGranted: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function verifyStage2CurrentChainAdmissionAgainstSources(receipt, input) {
  try {
    const capturedReceipt = inertSnapshot(receipt, "EPHEMERAL_ADMISSION_RECEIPT");
    const capturedInput = captureAdmissionInput(input);
    const structural = verifyStage2CurrentChainAdmissionStructure(capturedReceipt);
    if (!structural.ok) return structural;
    await replayAdmissionSources(capturedInput);
    const frontierStructural = verifyStage2QuoteFrontierStructure(capturedInput.frontier);
    if (!frontierStructural.ok
      || capturedReceipt.stage2FrontierBinding.frontierHash
        !== capturedInput.frontier.frontierHash
      || !same(capturedReceipt, receiptProjection(capturedInput.frontier))) {
      fail("FULL_SOURCE_RECEIPT_MISMATCH", frontierStructural.error);
    }
    return deepFreeze({
      ok: true,
      verificationLevel:
        "FULL_STAGE2_AND_PINNED_SOURCE_REPLAY_WITH_TEMPORAL_QUARANTINE_HOLD",
      sourceArtifactsReverified: true,
      currentChainSourcesReplayed: true,
      stage2FrontierSourcesReplayed: true,
      mathCanonicalStableRead: true,
      architectureCanonicalStableRead: true,
      catalogCanonicalStableReadThroughMath: true,
      flywheelExactlyRebuiltFromSourcesThroughMath: true,
      clinicalTrialsArtifactAndSixApiObjectsReplayedThroughFlywheel: true,
      clinicalTrialsRightsTermsReplayed: false,
      wave5IntakeArtifactAndFiftySevenSourceObjectsReplayedThroughFlywheel: true,
      wave5UniformTrainingRightsEstablished: false,
      callerReceiptsOrTrustFlagsAccepted: false,
      staleOrSupersededCanonicalAccepted: false,
      receiptHash: capturedReceipt.receiptHash,
      frontierHash: capturedReceipt.stage2FrontierBinding.frontierHash,
      architectureArtifactHash:
        capturedReceipt.currentChainBinding.architectureArtifactHash,
      mathArtifactHash: capturedReceipt.currentChainBinding.mathArtifactHash,
      ...temporalHoldReceiptFields(),
      targetPreActionRowsAdmitted: 0,
      targetModelComponentsFitted: 0,
      targetDomainTransferEstablished: false,
      price: null,
      PRICE: null,
      capital: null,
      readyToPrice: false,
      readyToBearResponsibility: false,
      operationalAuthorityGranted: false,
    });
  } catch (error) {
    return deepFreeze({
      ok: false,
      verificationLevel: "FULL_TEMPORAL_QUARANTINE_CHAIN_SOURCE_REPLAY_FAILED",
      sourceArtifactsReverified: false,
      currentChainSourcesReplayed: false,
      staleOrSupersededCanonicalAccepted: false,
      targetPreActionRowsAdmitted: 0,
      targetModelComponentsFitted: 0,
      targetDomainTransferEstablished: false,
      price: null,
      PRICE: null,
      capital: null,
      readyToPrice: false,
      readyToBearResponsibility: false,
      operationalAuthorityGranted: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export function describeStage2CurrentChainAdmission() {
  const contract = contractProjection();
  return deepFreeze({
    schema: STAGE2_CURRENT_CHAIN_ADMISSION_SCHEMA,
    canonicalizableContractSchema: STAGE2_CURRENT_CHAIN_ADMISSION_CONTRACT_SCHEMA,
    admissionContractHash: contract.contractHash,
    canonicalContract: clone(STAGE2_CURRENT_CHAIN_ADMISSION_CANONICAL),
    contractVersion: STAGE2_CURRENT_CHAIN_PINS.contractVersion,
    pinSetHash: STAGE2_CURRENT_CHAIN_PIN_SET_HASH,
    selectedTemporallyAuditedWaveSubgraph:
      clone(STAGE2_CURRENT_CHAIN_PINS.selectedTemporallyAuditedWaveSubgraph),
    readinessStatus: "HOLD_TEMPORAL_QUARANTINE_REFERENCE_ONLY",
    temporalAuditManifestHash:
      STAGE2_CURRENT_CHAIN_PINS.temporalAudit.manifestHash,
    pinnedReceiptCount: 16,
    temporallyOrderedCurrentReceiptCount: 9,
    temporalQuarantineReceiptCount: 7,
    currentCoverageReceiptCount: 9,
    temporalQuarantineReferenceFactorCount: 40,
    temporallyOrderedReceiptReferenceFactorCount: 62,
    factorsAdmittedForCurrentCoverage: 0,
    factorsAdmittedForCurrentRouting: 0,
    fullFlywheelRequiredArtifactReceiptCount:
      STAGE2_CURRENT_CHAIN_PINS.flywheel.requiredArtifactReceiptCount,
    fullFlywheelRequiredArtifactReceiptSetHash:
      STAGE2_CURRENT_CHAIN_PINS.flywheel.requiredArtifactReceiptSetHash,
    permittedUse: "SOURCE_DOMAIN_DIAGNOSTIC_AND_MODEL_ARCHITECTURE_GAP_DESIGN_ONLY",
    targetPreActionRowsAdmitted: 0,
    targetModelComponentsFitted: 0,
    price: null,
    PRICE: null,
    capital: null,
    readyToPrice: false,
    readyToBearResponsibility: false,
    operationalAuthorityGranted: false,
  });
}
