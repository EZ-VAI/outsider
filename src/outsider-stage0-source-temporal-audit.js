/*
 * Source-replayed temporal-authenticity audit for pinned evidence leaves.
 *
 * Exact source replay and local filesystem time ordering are separate facts.
 * Receipts with unestablished temporal authenticity remain quarantined even
 * when their frozen source bytes replay exactly.  Nothing here grants training,
 * pricing, action, fund, claims, closure, or institutional authority.
 */

import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import {
  closeSync, constants as fsConstants, fstatSync, lstatSync, openSync,
  readFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { canonicalizeStrict } from "./canonical.js";
import { verifyBridgeDataV2TrainingEvidenceWithSource } from
  "./outsider-bridgedata-v2-training-evidence.js";
import { verifyCaDmvAvOutcomeSensingWithSource } from
  "./outsider-ca-dmv-av-outcome-sensing.js";
import { verifyCdiNcigfRateGuarantyEvidenceWithSource } from
  "./outsider-cdi-ncigf-real-rate-guaranty-evidence.js";
import { verifyClinicalTrialsPostedResultsEvidenceWithSource } from
  "./outsider-clinicaltrials-posted-results-evidence.js";
import { verifyFdaMaudeOutcomeSensingWithSource } from
  "./outsider-fda-maude-outcome-sensing.js";
import { verifyFemaRealCasesEvidenceWithSource } from
  "./outsider-fema-real-cases-evidence.js";
import { verifyFraPhmsaSafetyEvidenceWithSource } from
  "./outsider-fra-phmsa-safety-evidence.js";
import { verifyInstitutionalCapitalClaimsEvidenceAgainstSource } from
  "./outsider-institutional-capital-claims-evidence.js";
import { verifyJudgmentFundGaoRealCasesEvidenceWithSource } from
  "./outsider-judgment-fund-gao-real-cases.js";
import { verifyNcuaPbgcMshaRealExperienceWithSource } from
  "./outsider-ncua-pbgc-msha-real-experience.js";
import { verifyNhtsaRecallRemedyEvidenceWithSource } from
  "./outsider-nhtsa-recall-remedy-evidence.js";
import { verifyNtsbBlsOutcomeEvidenceWithSource } from
  "./outsider-ntsb-bls-outcome-evidence.js";
import { verifyRealEvidenceStageProgressAgainstSources } from
  "./outsider-real-evidence-stage-progress.js";
import { verifyRemedyPaymentRecoveryEvidenceAgainstSource } from
  "./outsider-remedy-payment-recovery-evidence.js";
import { verifyWave5IntakeSnapshot } from
  "./outsider-wave5-intake-taxonomy-frontier.js";
import { verifyWaymoSafetyImpactEvidenceWithSource } from
  "./outsider-waymo-safety-impact-evidence.js";

const uncurryThis = (method) => Function.prototype.call.bind(method);
const ArrayEvery = uncurryThis(Array.prototype.every);
const ArrayFilter = uncurryThis(Array.prototype.filter);
const ArrayJoin = uncurryThis(Array.prototype.join);
const ArrayMap = uncurryThis(Array.prototype.map);
const ArrayPush = uncurryThis(Array.prototype.push);
const BigIntConstructor = BigInt;
const BigIntToString = uncurryThis(BigInt.prototype.toString);
const BufferFrom = Buffer.from;
const BufferIsBuffer = Buffer.isBuffer;
const BufferToString = uncurryThis(Buffer.prototype.toString);
const CryptoHashPrototype = Object.getPrototypeOf(createHash("sha256"));
const CryptoHashUpdate = uncurryThis(CryptoHashPrototype.update);
const CryptoHashDigest = uncurryThis(CryptoHashPrototype.digest);
const DateConstructor = Date;
const DateNow = Date.now;
const DateParse = Date.parse;
const DateToISOString = uncurryThis(Date.prototype.toISOString);
const ErrorConstructor = Error;
const JSONParse = JSON.parse;
const NumberIsFinite = Number.isFinite;
const ObjectFreeze = Object.freeze;
const ObjectGetPrototypeOf = Object.getPrototypeOf;
const ObjectIsFrozen = Object.isFrozen;
const ObjectPrototype = Object.prototype;
const ObjectValues = Object.values;
const ReflectOwnKeys = Reflect.ownKeys;
const RegExpTest = uncurryThis(RegExp.prototype.test);
const StatsPrototype = ObjectGetPrototypeOf(lstatSync(fileURLToPath(import.meta.url)));
const StatsIsFile = uncurryThis(StatsPrototype.isFile);
const StatsIsSymbolicLink = uncurryThis(StatsPrototype.isSymbolicLink);
const StringConstructor = String;
const StringIncludes = uncurryThis(String.prototype.includes);
const StringSplit = uncurryThis(String.prototype.split);
const StringStartsWith = uncurryThis(String.prototype.startsWith);
const NumberConstructor = Number;
const PathDirname = path.dirname;
const PathIsAbsolute = path.isAbsolute;
const PathResolve = path.resolve;
const PathSeparator = path.sep;
const CURRENT_SEMANTIC_TOKEN = /(?:^|[^A-Z0-9])CURRENT(?:[^A-Z0-9]|$)/u;

export const STAGE0_SOURCE_TEMPORAL_AUDIT_SCHEMA =
  "outsider/stage0-source-temporal-audit/v1";

export const STAGE0_SOURCE_TEMPORAL_AUDIT_PATH =
  "artifacts/stage0-source-temporal-audit-20260828/final-v2/manifest.json";

export const STAGE0_SOURCE_TEMPORAL_AUDIT_CANONICAL = ObjectFreeze({
  canonicalRelease: "final-v2",
  repositoryRelativePath: STAGE0_SOURCE_TEMPORAL_AUDIT_PATH,
  manifestHash:
    "sha256:9ab9517173af2b49f58dddd51a59d3b71ec76bfa6acb10cd5a84c4a426dcd453",
  artifactFileHash:
    "sha256:7a67d1474f67a8fe3c668f78d89096ccd69215aa89e7b782519737353585a44c",
  artifactFileBytes: 50283,
  pinnedReceiptCount: 16,
  temporalQuarantineReceiptCount: 7,
  temporallyOrderedCurrentReceiptCount: 9,
});

const REPOSITORY_ROOT = PathResolve(PathDirname(fileURLToPath(import.meta.url)), "..");
const HASH = /^sha256:[a-f0-9]{64}$/u;
const MAX_JSON_BYTES = 32 * 1024 * 1024;

const pin = (receiptId, repositoryRelativePath, sourceDirectory,
  semanticHashField, artifactHash, artifactFileHash, artifactFileBytes,
  sourceVerificationLevel, temporalAudit) => ObjectFreeze({
  receiptId, repositoryRelativePath, sourceDirectory, semanticHashField,
  artifactHash, artifactFileHash, artifactFileBytes, sourceVerificationLevel,
  temporalAudit: ObjectFreeze(ArrayMap(temporalAudit, (row) => ObjectFreeze(row))),
});

const LEAF_PINS = ObjectFreeze([
  pin("WAVE5_SOURCE_AWARE_INTAKE_TAXONOMY",
    "artifacts/public-evidence-wave5-intake-20260821/final-v3/snapshot.json",
    "artifacts/public-evidence-wave5-20260821/source", "snapshotHash",
    "sha256:2d40c4e44a7d9edb37ce15b526c8aa07bdca694db7cece8e9b3437c8307192ad",
    "sha256:b42a912a7a9ffcd31f9a0bf9670c078b71741edfb61ea722a203d22cd4f98ed5",
    208570, "FULL_SOURCE_REPLAY", [{ path: "$ARTIFACT", field: "generatedAt" }]),
  pin("CROSS_STAGE_SIX_LANE_PROGRESS",
    "artifacts/real-evidence-stage-progress-20260821/final-v1/progress.json",
    null, "artifactHash",
    "sha256:33e814497547ed4c49bd7c7e05f238915cd19cd71a6280ae20276364ba3a2b41",
    "sha256:a48ec04b872e0ea4215c0b20d697effb0a817c287d583fadbd2cd4de70540e7a",
    20848, "FULL_SIX_LANE_FROZEN_SOURCE_REPLAY",
    [{ path: "$ARTIFACT", field: "generatedAt" }]),
  pin("FDA_MAUDE_OUTCOME_SENSING",
    "artifacts/fda-maude-outcome-sensing-20260821/final-v2/outcome-sensing.json",
    "artifacts/fda-maude-outcome-sensing-20260821/source", "artifactHash",
    "sha256:450da676c54f9e8781cff0589618e5f8fbbbf66286c0b38316ae4eb95f643c73",
    "sha256:21478252c218b2732417ab5a1c8b554198c8d52b5b8b6cbdd259d3fb2a164cd5",
    21368, "FULL_OFFICIAL_FDA_MAUDE_SOURCE_REPLAYED",
    [{ path: "$ARTIFACT", field: "generatedAt" }]),
  pin("CA_DMV_AV_OUTCOME_SENSING",
    "artifacts/ca-dmv-av-outcome-sensing-20260821/final-v3/outcome-sensing.json",
    "artifacts/ca-dmv-av-outcome-sensing-20260821/source", "artifactHash",
    "sha256:1894ff1026062b9459cd532a3f75c49c8544d8e87c7aec3e76cfb01389e79138",
    "sha256:ecaab3ebfe7b4989c7c587f4506605f1920bcbacf6da6bfcd3d1b803fd14c5cd",
    14355, "FULL_OFFICIAL_CA_DMV_AV_SOURCE_REPLAYED", [
      { path: "$ARTIFACT", field: "generatedAt" },
      { path: "$ARTIFACT", field: "source.capturedAt" },
    ]),
  pin("INSTITUTIONAL_CAPITAL_CLAIMS",
    "artifacts/institutional-capital-claims-20260828/final-v4/evidence.json",
    "artifacts/institutional-capital-claims-20260821/source", "artifactHash",
    "sha256:43028caffe868adf1a6019a47ca99513bb964f632de761bb9e64ebe5c3447c7c",
    "sha256:e9db5d063f9b4ad4fecf589f759ea6234479b69497fb51cd4a78746595aad62c",
    74377, "FULL_OFFICIAL_FDIC_TREASURY_SEC_ASB_SOURCE_REPLAYED", [
      { path: "$ARTIFACT", field: "generatedAt" },
      { path: "artifacts/institutional-capital-claims-20260821/source/acquisition.json",
        field: "frozenAt" },
    ]),
  pin("FEMA_REAL_CASES", "artifacts/fema-real-cases-20260821/evidence-v1.0.0.json",
    "artifacts/fema-real-cases-20260821/source-v3", "artifactHash",
    "sha256:8e4a0c2c6e170e69f9bcaf1f2c6c8715956a367999d2d48412c14e76b94e6e5c",
    "sha256:60a4ecdd871d22a3c515f41a65c125ca766d5580074208acae968f19bbee3fb7",
    22847, "FULL_FEMA_CBCA_FROZEN_SOURCE_REPLAY",
    [{ path: "$ARTIFACT", field: "generatedAt" },
      { path: "artifacts/fema-real-cases-20260821/source-v3/acquisition-manifest.json",
        field: "acquiredAt" }]),
  pin("REMEDY_PAYMENT_RECOVERY",
    "artifacts/remedy-payment-recovery-20260821/evidence-book-final-v1/book.json",
    "artifacts/remedy-payment-recovery-20260821/source", "bookHash",
    "sha256:0d27c736a6c1a9ca6473b5656ea603f26593ef51a3cc154bedbbc660328a9997",
    "sha256:eb5a57cb442a95076de41feeff9a403c86befc5bf18b8c03740709f8e66b1e34",
    160720, "FULL_PINNED_OFFICIAL_SOURCE_SET_AND_PROJECTION_REPRODUCED",
    [{ path: "$ARTIFACT", field: "createdAt" }]),
  pin("NTSB_BLS_REAL_OUTCOME_EXPERIENCE",
    "artifacts/ntsb-bls-real-outcome-20260828/final-v2-canonical-hardening/outcome-evidence.json",
    "artifacts/ntsb-bls-real-outcome-20260821/source", "artifactHash",
    "sha256:da933b03d6ed8c3c56cc80561373f03bb2060b93adce45995eb88f13c8ff4792",
    "sha256:1b1b57250becd399ef0a698d7273275fe0f21e8b99bf7b9d5a15597835f399af",
    46469, "FULL_OFFICIAL_NTSB_BLS_SOURCE_REPLAYED", [
      { path: "$ARTIFACT", field: "generatedAt" },
      { path: "$ARTIFACT", field: "source.frozenAt" },
      { path: "artifacts/ntsb-bls-real-outcome-20260821/source/acquisition.json",
        field: "frozenAt" },
    ]),
  pin("JUDGMENT_FUND_GAO_REAL_CASES",
    "artifacts/judgment-fund-gao-real-cases-20260821/final-v1/evidence.json",
    "artifacts/judgment-fund-gao-real-cases-20260821/source", "artifactHash",
    "sha256:e10699896cd8e7de3ca420f4f7092d4871324110a0a299e8cd9c07f19263109e",
    "sha256:85277537539f6ed38d08a29b5b320c9c4572f237d7d440bebbcf3a5d7c676c09",
    99103, "FULL_PINNED_TREASURY_GAO_SOURCE_REPLAY_AND_EXACT_ARTIFACT_COMPARE",
    [{ path: "$ARTIFACT", field: "generatedAt" },
      { path: "artifacts/judgment-fund-gao-real-cases-20260821/source/acquisition.json",
        field: "freezeObservedAt" }]),
  pin("NCUA_PBGC_MSHA_REAL_EXPERIENCE",
    "artifacts/ncua-pbgc-msha-real-experience-20260821/final-v1/evidence.json",
    "artifacts/ncua-pbgc-msha-real-experience-20260821/source", "artifactHash",
    "sha256:ddc277d4548b097e7053487ae8572385046e7162246175f2a664d1f87be14973",
    "sha256:42cc5a07643dd638569e4ef6de7e0c81fc196ebcda516040db9cb9ca849d38e4",
    35972, "FULL_PINNED_NCUA_PBGC_MSHA_SOURCE_REPLAY_AND_EXACT_ARTIFACT_COMPARE", [
      { path: "$ARTIFACT", field: "generatedAt" },
      { path: "$ARTIFACT", field: "source.frozenAt" },
      { path: "artifacts/ncua-pbgc-msha-real-experience-20260821/source/acquisition.json",
        field: "frozenAt" },
    ]),
  pin("CDI_NCIGF_REAL_RATE_GUARANTY",
    "artifacts/cdi-ncigf-real-rate-guaranty-20260821/final-v1/evidence.json",
    "artifacts/cdi-ncigf-real-rate-guaranty-20260821/source", "artifactHash",
    "sha256:2ee3625eac2c35e1be5113a78477ac1128d6a663d2e2ee6c66e53570d09b086a",
    "sha256:2ea48baea38c71f7fe9aeb1029ea2bc00484eb65620a2f43db20e6bfec4a6823",
    27832, "FULL_EXACT_OFFICIAL_SOURCE_REPLAYED",
    [{ path: "$ARTIFACT", field: "generatedAt" }]),
  pin("FRA_PHMSA_REAL_SAFETY_EVIDENCE",
    "artifacts/fra-phmsa-safety-20260821/final-v2/evidence.json",
    "artifacts/fra-phmsa-safety-20260821/source-v2", "artifactHash",
    "sha256:faf6c83de86433ad2e97abfb63fca2a1b6045692acd39a8ff56916fcd9082836",
    "sha256:97326061fffefe20cb06c6640ea0f1c28e55a2edc2cd8a211ecb8dd1db4ba7ff",
    33606, "FULL_OFFICIAL_FRA_PHMSA_SOURCE_REPLAYED", [
      { path: "$ARTIFACT", field: "generatedAt" },
      { path: "$ARTIFACT", field: "source.frozenAt" },
      { path: "artifacts/fra-phmsa-safety-20260821/source-v2/acquisition.json",
        field: "frozenAt" },
    ]),
  pin("NHTSA_RECALL_REMEDY_STATUS_EVIDENCE",
    "artifacts/nhtsa-recall-remedy-evidence-20260821/final-v6/evidence.json",
    "artifacts/nhtsa-recall-remedy-evidence-20260821/source", "artifactHash",
    "sha256:afad74141571a82e40564f7b43bcacb0ccea2671684f3809e4bf4717af069034",
    "sha256:47ff5b8ccb8f780efe235d39bcf21c890917a54baa4f1de1114881af1fad628e",
    15646, "FULL_PINNED_NHTSA_RECALL_REMEDY_SOURCE_REPLAY_AND_EXACT_ARTIFACT_COMPARE", [
      { path: "$ARTIFACT", field: "generatedAt" },
      { path: "$ARTIFACT", field: "source.frozenAt" },
      { path: "artifacts/nhtsa-recall-remedy-evidence-20260821/source/acquisition.json",
        field: "capturedAt" },
    ]),
  pin("BRIDGEDATA_V2_TRAINING_CANDIDATE_EVIDENCE",
    "artifacts/bridgedata-v2-training-evidence-20260822/final-v5/evidence.json",
    "artifacts/bridgedata-v2-training-evidence-20260822/source-v1", "artifactHash",
    "sha256:1db2d9b893cdb6cfc604154a787d70092b5a6c03d2122f2b81f56fa9e79e97c2",
    "sha256:c5eaba1e0e910733ab6fad1007d90839762a6e8ae97ee68e9ddeb4266da5f25f",
    36204, "FULL_SOURCE_REPLAY", [
      { path: "$ARTIFACT", field: "generatedAt" },
      { path: "$ARTIFACT", field: "source.capturedAt" },
      { path: "artifacts/bridgedata-v2-training-evidence-20260822/source-v1/acquisition.json",
        field: "capturedAt" },
    ]),
  pin("WAYMO_SAFETY_IMPACT_OUTCOME_EXPOSURE_EVIDENCE",
    "artifacts/waymo-safety-impact-evidence-20260822/final-v5/evidence.json",
    "artifacts/waymo-safety-impact-evidence-20260822/source-v1", "artifactHash",
    "sha256:edccce782d93f0f8f6f01c14f427d44e4137d0b1cf5c040a0c84d0ada9da0a7a",
    "sha256:5bbb3c40d373551b5f3eeccc1521bd06c62ec0b46a23c8e0de7dda09313169bd",
    29849, "FULL_SOURCE_REPLAY", [
      { path: "$ARTIFACT", field: "generatedAt" },
      { path: "$ARTIFACT", field: "source.capturedAt" },
      { path: "artifacts/waymo-safety-impact-evidence-20260822/source-v1/acquisition.json",
        field: "capturedAt" },
    ]),
  pin("CLINICALTRIALS_POSTED_RESULTS_EVIDENCE",
    "artifacts/clinicaltrials-posted-results-evidence-20260822/final-v3/evidence.json",
    "artifacts/clinicaltrials-posted-results-evidence-20260822/source", "artifactHash",
    "sha256:93ae703761d069b7adbdc8ad781cc2ebb1d91b836aa21e027a5f6657f84840a6",
    "sha256:cc6a3847ca58003db1cf91ba3fdc6cb365152c3c7ca82bb9c6be4b42f491f210",
    81982, "FULL_EXACT_OFFICIAL_DATA_API_SOURCE_REPLAY_RIGHTS_TERMS_NOT_REPLAYED", [
      { path: "$ARTIFACT", field: "generatedAt" },
      { path: "$ARTIFACT", field: "source.capturedAt" },
      { path: "artifacts/clinicaltrials-posted-results-evidence-20260822/source/acquisition.json",
        field: "capturedAt" },
    ]),
]);

export const STAGE0_SOURCE_TEMPORAL_QUARANTINE_RECEIPTS = ObjectFreeze([
  "BRIDGEDATA_V2_TRAINING_CANDIDATE_EVIDENCE",
  "CDI_NCIGF_REAL_RATE_GUARANTY",
  "CLINICALTRIALS_POSTED_RESULTS_EVIDENCE",
  "CROSS_STAGE_SIX_LANE_PROGRESS",
  "INSTITUTIONAL_CAPITAL_CLAIMS",
  "REMEDY_PAYMENT_RECOVERY",
  "WAYMO_SAFETY_IMPACT_OUTCOME_EXPOSURE_EVIDENCE",
]);
const TEMPORAL_QUARANTINE_RECEIPTS = STAGE0_SOURCE_TEMPORAL_QUARANTINE_RECEIPTS;

function fail(code, detail = null) {
  throw new ErrorConstructor(detail === null ? `STAGE0_SOURCE_TEMPORAL_AUDIT_${code}`
    : `STAGE0_SOURCE_TEMPORAL_AUDIT_${code}:${detail}`);
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || ObjectIsFrozen(value)) return value;
  for (const child of ObjectValues(value)) deepFreeze(child);
  return ObjectFreeze(value);
}

function digestBytes(bytes) {
  const hash = createHash("sha256");
  CryptoHashUpdate(hash, bytes);
  return `sha256:${CryptoHashDigest(hash, "hex")}`;
}

function domainDigest(value) {
  return digestBytes(`${STAGE0_SOURCE_TEMPORAL_AUDIT_SCHEMA}\0${canonicalizeStrict(value)}`);
}

function exactObjectKeys(value, expected, code) {
  canonicalizeStrict(value);
  if (!value || typeof value !== "object"
    || ObjectGetPrototypeOf(value) !== ObjectPrototype) fail(`${code}_OBJECT_INVALID`);
  const actual = ReflectOwnKeys(value);
  if (actual.length !== expected.length) fail(`${code}_FIELDS_INVALID`);
  for (let expectedIndex = 0; expectedIndex < expected.length; expectedIndex += 1) {
    let found = false;
    for (let actualIndex = 0; actualIndex < actual.length; actualIndex += 1) {
      if (expected[expectedIndex] === actual[actualIndex]) { found = true; break; }
    }
    if (!found) fail(`${code}_FIELDS_INVALID`);
  }
}

function canonicalTime(value, code) {
  if (typeof value !== "string") fail(`${code}_INVALID`);
  const milliseconds = DateParse(value);
  if (!NumberIsFinite(milliseconds)
    || DateToISOString(new DateConstructor(milliseconds)) !== value) fail(`${code}_INVALID`);
  return milliseconds;
}

function repositoryPath(relativePath) {
  if (typeof relativePath !== "string" || relativePath.length === 0
    || StringIncludes(relativePath, "\0") || PathIsAbsolute(relativePath)) {
    fail("PATH_INVALID", relativePath);
  }
  const resolved = PathResolve(REPOSITORY_ROOT, relativePath);
  if (!StringStartsWith(resolved, `${REPOSITORY_ROOT}${PathSeparator}`)) {
    fail("PATH_OUTSIDE_REPOSITORY", relativePath);
  }
  return resolved;
}

function sameIdentity(left, right) {
  return left.dev === right.dev && left.ino === right.ino
    && left.size === right.size && left.mtimeNs === right.mtimeNs
    && left.ctimeNs === right.ctimeNs;
}

function stableFile(relativePath, maximumBytes = MAX_JSON_BYTES) {
  const absolute = repositoryPath(relativePath);
  const initial = lstatSync(absolute, { bigint: true });
  if (StatsIsSymbolicLink(initial) || !StatsIsFile(initial)
    || initial.size <= 0n || initial.size > BigIntConstructor(maximumBytes)) {
    fail("FILE_INVALID", relativePath);
  }
  let descriptor;
  try {
    descriptor = openSync(absolute, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0));
    const before = fstatSync(descriptor, { bigint: true });
    if (!StatsIsFile(before) || !sameIdentity(initial, before)) {
      fail("FILE_IDENTITY_CHANGED_BEFORE_READ", relativePath);
    }
    const bytes = readFileSync(descriptor);
    const after = fstatSync(descriptor, { bigint: true });
    const finalPath = lstatSync(absolute, { bigint: true });
    if (!sameIdentity(before, after) || !sameIdentity(before, finalPath)) {
      fail("FILE_CHANGED_DURING_READ", relativePath);
    }
    if (BigIntConstructor(bytes.length) !== before.size) {
      fail("FILE_SIZE_READ_MISMATCH", relativePath);
    }
    return { bytes, mtimeNs: before.mtimeNs };
  } finally { if (descriptor !== undefined) closeSync(descriptor); }
}

function stableJson(relativePath) {
  const stable = stableFile(relativePath);
  try {
    return { artifact: JSONParse(BufferToString(stable.bytes, "utf8")), stable };
  } catch { fail("JSON_INVALID", relativePath); }
}

function pinnedLeaf(pin) {
  const stable = stableFile(pin.repositoryRelativePath);
  if (stable.bytes.length !== pin.artifactFileBytes
    || digestBytes(stable.bytes) !== pin.artifactFileHash) {
    fail("LEAF_FILE_IDENTITY_MISMATCH", pin.receiptId);
  }
  let artifact;
  try { artifact = JSONParse(BufferToString(stable.bytes, "utf8")); }
  catch { fail("LEAF_JSON_INVALID", pin.receiptId); }
  if (artifact[pin.semanticHashField] !== pin.artifactHash) {
    fail("LEAF_SEMANTIC_IDENTITY_MISMATCH", pin.receiptId);
  }
  return { artifact, stable };
}

function fieldValue(value, dottedField) {
  let cursor = value;
  const fields = StringSplit(dottedField, ".");
  for (let index = 0; index < fields.length; index += 1) {
    if (!cursor || typeof cursor !== "object") fail("TEMPORAL_FIELD_MISSING", dottedField);
    cursor = cursor[fields[index]];
  }
  return cursor;
}

function temporalObservation(pin, specification) {
  const repositoryRelativePath = specification.path === "$ARTIFACT"
    ? pin.repositoryRelativePath : specification.path;
  const { artifact, stable } = stableJson(repositoryRelativePath);
  const declaredAt = fieldValue(artifact, specification.field);
  const declaredAtMs = canonicalTime(declaredAt, "TEMPORAL_DECLARATION");
  const declaredAtNs = BigIntConstructor(declaredAtMs) * 1_000_000n;
  const deltaNs = declaredAtNs - stable.mtimeNs;
  return {
    repositoryRelativePath,
    fileRole: specification.path === "$ARTIFACT"
      ? "PINNED_RECEIPT_ARTIFACT" : "PINNED_RAW_ACQUISITION_METADATA",
    declaredField: specification.field,
    declaredAt,
    stableFileMtime:
      DateToISOString(new DateConstructor(NumberConstructor(stable.mtimeNs / 1_000_000n))),
    stableFileMtimeNanoseconds: BigIntToString(stable.mtimeNs, 10),
    declaredMinusStableFileMtimeNanoseconds: BigIntToString(deltaNs, 10),
    declaredNoLaterThanStableFileMtime: deltaNs <= 0n,
    localFileHash: digestBytes(stable.bytes),
    localFileBytes: stable.bytes.length,
    observationBasis: "LOCAL_FILESYSTEM_MTIME_NOT_EXTERNAL_TIME_ATTESTATION",
  };
}

function isExpectedTemporalQuarantine(receiptId) {
  for (let index = 0; index < TEMPORAL_QUARANTINE_RECEIPTS.length; index += 1) {
    if (TEMPORAL_QUARANTINE_RECEIPTS[index] === receiptId) return true;
  }
  return false;
}

function assertNoCurrentSemanticTokenInValues(value, receiptId) {
  if (typeof value === "string") {
    if (RegExpTest(CURRENT_SEMANTIC_TOKEN, value)) {
      fail("QUARANTINED_RECEIPT_CURRENT_SEMANTIC_TOKEN", receiptId);
    }
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const child of ObjectValues(value)) {
    assertNoCurrentSemanticTokenInValues(child, receiptId);
  }
}

function progressSources() {
  return {
    wave5: {
      traceCommonsDirectory: repositoryPath(
        "artifacts/public-evidence-wave5-20260821/source/trace-commons"),
      robustRosDirectory: repositoryPath(
        "artifacts/public-evidence-wave5-20260821/source/robust-ros"),
    },
    osha: { archivePath: repositoryPath(
      "artifacts/reality-consequence-osha-20260821/January2015toNovember2025.zip") },
    aiid: {
      archivePath: repositoryPath(
        "artifacts/reality-consequence-aiid-20260817/backup-20260817101120.tar.bz2"),
      termsSnapshotPath: repositoryPath(
        "artifacts/reality-consequence-aiid-20260817/terms-of-use-20260821.html"),
    },
    institutionalRemedies: { sourceDirectory: repositoryPath(
      "artifacts/reality-institutional-ai-remedies-20260821/source") },
    rma: {
      archivePath: repositoryPath(
        "artifacts/stage234-rma-crop-insurance-2024/source/sobcov_2024.zip"),
      recordLayoutPath: repositoryPath(
        "artifacts/stage234-rma-crop-insurance-2024/source/SOB_State_County_Crop_with_Coverage_Level_1989_Forward.pdf"),
    },
    cas: {
      sourceDirectory: repositoryPath("artifacts/stage234-cas-schedule-p-2025/source"),
      sourcePagePath: repositoryPath(
        "artifacts/stage234-cas-schedule-p-2025/source/source-page.html"),
    },
  };
}

async function replaySource(pin, artifact) {
  const sourceDirectory = pin.sourceDirectory == null
    ? null : repositoryPath(pin.sourceDirectory);
  let receipt;
  switch (pin.receiptId) {
    case "WAVE5_SOURCE_AWARE_INTAKE_TAXONOMY":
      receipt = verifyWave5IntakeSnapshot(artifact, { sourceDirectory }); break;
    case "CROSS_STAGE_SIX_LANE_PROGRESS":
      receipt = verifyRealEvidenceStageProgressAgainstSources(artifact,
        { sources: progressSources() }); break;
    case "FDA_MAUDE_OUTCOME_SENSING":
      receipt = await verifyFdaMaudeOutcomeSensingWithSource(artifact, sourceDirectory); break;
    case "CA_DMV_AV_OUTCOME_SENSING":
      receipt = verifyCaDmvAvOutcomeSensingWithSource(artifact, sourceDirectory); break;
    case "INSTITUTIONAL_CAPITAL_CLAIMS":
      receipt = verifyInstitutionalCapitalClaimsEvidenceAgainstSource(artifact,
        { sourceDirectory }); break;
    case "FEMA_REAL_CASES":
      receipt = verifyFemaRealCasesEvidenceWithSource(artifact, sourceDirectory); break;
    case "REMEDY_PAYMENT_RECOVERY":
      receipt = verifyRemedyPaymentRecoveryEvidenceAgainstSource(artifact,
        { sourceDirectory }); break;
    case "NTSB_BLS_REAL_OUTCOME_EXPERIENCE":
      receipt = verifyNtsbBlsOutcomeEvidenceWithSource(artifact, sourceDirectory); break;
    case "JUDGMENT_FUND_GAO_REAL_CASES":
      receipt = verifyJudgmentFundGaoRealCasesEvidenceWithSource(artifact, sourceDirectory); break;
    case "NCUA_PBGC_MSHA_REAL_EXPERIENCE":
      receipt = verifyNcuaPbgcMshaRealExperienceWithSource(artifact, sourceDirectory); break;
    case "CDI_NCIGF_REAL_RATE_GUARANTY":
      receipt = verifyCdiNcigfRateGuarantyEvidenceWithSource(artifact, sourceDirectory); break;
    case "FRA_PHMSA_REAL_SAFETY_EVIDENCE":
      receipt = verifyFraPhmsaSafetyEvidenceWithSource(artifact, sourceDirectory); break;
    case "NHTSA_RECALL_REMEDY_STATUS_EVIDENCE":
      receipt = await verifyNhtsaRecallRemedyEvidenceWithSource(artifact, sourceDirectory); break;
    case "BRIDGEDATA_V2_TRAINING_CANDIDATE_EVIDENCE":
      receipt = verifyBridgeDataV2TrainingEvidenceWithSource(artifact, sourceDirectory); break;
    case "WAYMO_SAFETY_IMPACT_OUTCOME_EXPOSURE_EVIDENCE":
      receipt = verifyWaymoSafetyImpactEvidenceWithSource(artifact, sourceDirectory); break;
    case "CLINICALTRIALS_POSTED_RESULTS_EVIDENCE":
      receipt = verifyClinicalTrialsPostedResultsEvidenceWithSource(artifact,
        sourceDirectory); break;
    default: fail("SOURCE_REPLAY_DISPATCH_MISSING", pin.receiptId);
  }
  if (!receipt?.ok || receipt.sourceArtifactsReverified !== true
    || receipt.verificationLevel !== pin.sourceVerificationLevel) {
    fail("SOURCE_REPLAY_INVALID", `${pin.receiptId}:${receipt?.error
      ?? (receipt?.errors ? ArrayJoin(receipt.errors, ",") : null)
      ?? (receipt?.failures ? ArrayJoin(receipt.failures, ",") : null) ?? "BOUNDARY"}`);
  }
  return receipt;
}

function receiptProjection(pin, observations) {
  const temporalAuthenticityEstablished = ArrayEvery(observations, (row) =>
    row.declaredNoLaterThanStableFileMtime === true);
  const expectedQuarantine = isExpectedTemporalQuarantine(pin.receiptId);
  if (temporalAuthenticityEstablished === expectedQuarantine) {
    fail("TEMPORAL_CLASSIFICATION_MISMATCH", pin.receiptId);
  }
  const projection = {
    receiptId: pin.receiptId,
    repositoryRelativePath: pin.repositoryRelativePath,
    artifactPathRole: expectedQuarantine
      ? "QUARANTINED_REFERENCE_GAP_EVIDENCE_ONLY"
      : "EXACT_PINNED_CURRENT_REFERENCE_NOT_DIRECTORY_NAMING_AUTHORITY",
    semanticHashField: pin.semanticHashField,
    artifactHash: pin.artifactHash,
    artifactFileHash: pin.artifactFileHash,
    artifactFileBytes: pin.artifactFileBytes,
    sourceDirectory: pin.sourceDirectory,
    sourceVerificationLevel: pin.sourceVerificationLevel,
    sourceBytesReplayed: true,
    temporalObservations: observations,
    temporalObservationCount: observations.length,
    temporalAuthenticityEstablished,
    temporalStatus: expectedQuarantine
      ? "PINNED_SOURCE_REPLAYED_TEMPORAL_AUTHENTICITY_UNESTABLISHED"
      : "PINNED_SOURCE_REPLAYED_TEMPORALLY_ORDERED_CURRENT_REFERENCE",
    directoryNameIsSelectionAuthority: false,
    currentRoutingEligible: !expectedQuarantine,
    currentCoverage: !expectedQuarantine,
    currentTruth: !expectedQuarantine,
    currentTruthMeaning: expectedQuarantine
      ? "TEMPORAL_AUTHENTICITY_UNESTABLISHED_QUARANTINED_REFERENCE_ONLY"
      : "CURRENT_RECEIPT_BYTES_AND_TEMPORAL_ORDER_ONLY_NOT_UNDERLYING_WORLD_TRUTH",
    sourceTruthEstablished: false,
    underlyingWorldTruthEstablished: false,
    closureCredit: false,
    causalExperienceUnits: 0,
    trainingAdmission: false,
    pricingAdmission: false,
    operationalAuthorityGranted: false,
  };
  if (expectedQuarantine) {
    assertNoCurrentSemanticTokenInValues(projection, pin.receiptId);
  }
  return projection;
}

function parseManifest(input) {
  const bytes = typeof input === "string" ? BufferFrom(input, "utf8") : input;
  if (!BufferIsBuffer(bytes) || bytes.length <= 0 || bytes.length > 256 * 1024) {
    fail("MANIFEST_BYTES_INVALID");
  }
  let manifest;
  try { manifest = JSONParse(BufferToString(bytes, "utf8")); }
  catch { fail("MANIFEST_JSON_INVALID"); }
  exactObjectKeys(manifest, [
    "schema", "schemaVersion", "createdAt", "status", "selectionModel",
    "receipts", "counts", "sourceReplay", "boundary", "manifestHash",
  ], "MANIFEST");
  if (manifest.schema !== STAGE0_SOURCE_TEMPORAL_AUDIT_SCHEMA
    || manifest.schemaVersion !== "1.0.0"
    || manifest.status !== "FULL_PINNED_SOURCE_REPLAY_WITH_TEMPORAL_QUARANTINE"
    || manifest.selectionModel
      !== "EXACT_BYTES_SOURCE_REPLAY_AND_LOCAL_MTIME_AUDIT_NO_DIRECTORY_AUTHORITY"
    || !RegExpTest(HASH, StringConstructor(manifest.manifestHash ?? ""))) {
    fail("MANIFEST_STRUCTURE_INVALID");
  }
  const body = { ...manifest };
  delete body.manifestHash;
  if (domainDigest(body) !== manifest.manifestHash) fail("MANIFEST_HASH_MISMATCH");
  return manifest;
}

function fixedBoundary() {
  return {
    routingMetadataOnly: true,
    localFilesystemMtimeIsExternalAttestation: false,
    sourceTruthEstablished: false,
    underlyingWorldTruthEstablished: false,
    productionTraining: false,
    automaticTraining: false,
    causalExperienceUnits: 0,
    targetTrainingAdmission: false,
    pricing: false,
    guarantee: false,
    settlement: false,
    fundsMovement: false,
    remoteOrPhysicalAction: false,
    closureCredit: false,
    operationalAuthorityGranted: false,
  };
}

export async function buildStage0SourceTemporalAuditManifest({ createdAt } = {}) {
  const createdAtMs = canonicalTime(createdAt, "CREATED_AT");
  if (createdAtMs > DateNow()) fail("CREATED_AT_IN_FUTURE");
  const createdAtNs = BigIntConstructor(createdAtMs) * 1_000_000n;
  const pending = [];
  let latestObservedFileMtimeNs = 0n;
  for (let index = 0; index < LEAF_PINS.length; index += 1) {
    const pinValue = LEAF_PINS[index];
    const leaf = pinnedLeaf(pinValue);
    const observations = [];
    for (let auditIndex = 0; auditIndex < pinValue.temporalAudit.length;
      auditIndex += 1) {
      const observation = temporalObservation(pinValue,
        pinValue.temporalAudit[auditIndex]);
      const observedMtimeNs = BigIntConstructor(observation.stableFileMtimeNanoseconds);
      if (observedMtimeNs > latestObservedFileMtimeNs) {
        latestObservedFileMtimeNs = observedMtimeNs;
      }
      ArrayPush(observations, observation);
    }
    ArrayPush(pending, { pinValue, leaf, observations });
  }
  if (createdAtNs < latestObservedFileMtimeNs) {
    fail("CREATED_AT_PRECEDES_OBSERVED_FILE_MTIME");
  }
  const receipts = [];
  for (let index = 0; index < pending.length; index += 1) {
    const { pinValue, leaf, observations } = pending[index];
    await replaySource(pinValue, leaf.artifact);
    ArrayPush(receipts, receiptProjection(pinValue, observations));
  }
  const temporalQuarantineReceiptCount = ArrayFilter(receipts, (row) =>
    row.temporalAuthenticityEstablished === false).length;
  const temporallyOrderedCurrentReceiptCount = receipts.length
    - temporalQuarantineReceiptCount;
  if (temporalQuarantineReceiptCount !== 7
    || temporallyOrderedCurrentReceiptCount !== 9) {
    fail("TEMPORAL_RECEIPT_COUNTS_INVALID");
  }
  const body = {
    schema: STAGE0_SOURCE_TEMPORAL_AUDIT_SCHEMA,
    schemaVersion: "1.0.0",
    createdAt,
    status: "FULL_PINNED_SOURCE_REPLAY_WITH_TEMPORAL_QUARANTINE",
    selectionModel:
      "EXACT_BYTES_SOURCE_REPLAY_AND_LOCAL_MTIME_AUDIT_NO_DIRECTORY_AUTHORITY",
    receipts,
    counts: {
      pinnedReceiptCount: 16,
      sourceReplayedReceiptCount: 16,
      temporallyOrderedCurrentReceiptCount,
      temporalQuarantineReceiptCount,
      currentCoverageReceiptCount: temporallyOrderedCurrentReceiptCount,
      closureCreditReceiptCount: 0,
    },
    sourceReplay: {
      sourceArtifactsReverifiedInThisBuild: true,
      exactReceiptArtifactsRebuiltFromFrozenSources: true,
      replayedReceiptCount: 16,
      temporalQuarantineDoesNotEraseSourceReplay: true,
      temporalQuarantineDoesNotEstablishCurrentTruth: true,
      auditCreatedAtNotEarlierThanEveryObservedFileMtime: true,
      latestObservedFileMtime: DateToISOString(new DateConstructor(
        NumberConstructor(latestObservedFileMtimeNs / 1_000_000n))),
      latestObservedFileMtimeNanoseconds:
        BigIntToString(latestObservedFileMtimeNs, 10),
      localFilesystemMtimeIsExternalAttestation: false,
      directoryNamingUsedAsSelectionAuthority: false,
      callerVerificationClaimsAccepted: false,
    },
    boundary: fixedBoundary(),
  };
  return deepFreeze({ ...body, manifestHash: domainDigest(body) });
}

/*
 * Build-time inspection only.  This checks that a newly written no-clobber
 * candidate is the exact serialization produced by the already source-replayed
 * builder and is not future-dated.  It deliberately does not make the candidate
 * a routing trust root; only the exact canonical verifier below can do that.
 */
export function inspectStage0SourceTemporalAuditCandidate(manifestPath,
  expectedManifest) {
  try {
    const stable = stableFile(manifestPath, 256 * 1024);
    const manifest = parseManifest(stable.bytes);
    if (canonicalizeStrict(manifest) !== canonicalizeStrict(expectedManifest)) {
      fail("CANDIDATE_SERIALIZATION_MISMATCH");
    }
    const createdAtMs = canonicalTime(manifest.createdAt, "CREATED_AT");
    if (createdAtMs > DateNow()) fail("CREATED_AT_IN_FUTURE");
    if (BigIntConstructor(createdAtMs) * 1_000_000n > stable.mtimeNs) {
      fail("CREATED_AT_AFTER_STABLE_FILE_MTIME");
    }
    return deepFreeze({
      ok: true,
      verificationLevel: "BUILD_CANDIDATE_EXACT_BYTES_NOT_CANONICAL_AUTHORITY",
      candidateOnly: true,
      canonicalRoutingEligible: false,
      sourceArtifactsReverifiedByThisInspection: false,
      sourceArtifactsReverifiedByBuilder: true,
      manifestHash: manifest.manifestHash,
      artifactFileHash: digestBytes(stable.bytes),
      artifactFileBytes: stable.bytes.length,
      createdAt: manifest.createdAt,
      closureCredit: false,
      operationalAuthorityGranted: false,
    });
  } catch (error) { return invalid(error); }
}

function invalid(error) {
  return deepFreeze({
    ok: false,
    verificationLevel: "INVALID",
    sourceArtifactsReverified: false,
    exactReceiptArtifactsRebuiltFromFrozenSources: false,
    temporalAuthenticityEstablishedForAllReceipts: false,
    temporalQuarantineReceiptCount: null,
    currentCoverageReceiptCount: 0,
    pathNamingSelectionAuthority: false,
    operationalAuthorityGranted: false,
    error: error instanceof ErrorConstructor ? error.message : StringConstructor(error),
  });
}

export async function verifyStage0SourceTemporalAuditManifest(manifestPath =
  STAGE0_SOURCE_TEMPORAL_AUDIT_PATH) {
  try {
    const stable = stableFile(manifestPath, 256 * 1024);
    if (stable.bytes.length !== STAGE0_SOURCE_TEMPORAL_AUDIT_CANONICAL.artifactFileBytes
      || digestBytes(stable.bytes)
        !== STAGE0_SOURCE_TEMPORAL_AUDIT_CANONICAL.artifactFileHash) {
      fail("CANONICAL_FILE_IDENTITY_MISMATCH");
    }
    const manifest = parseManifest(stable.bytes);
    if (manifest.manifestHash
      !== STAGE0_SOURCE_TEMPORAL_AUDIT_CANONICAL.manifestHash) {
      fail("CANONICAL_MANIFEST_HASH_MISMATCH");
    }
    const createdAtMs = canonicalTime(manifest.createdAt, "CREATED_AT");
    if (createdAtMs > DateNow()) fail("CREATED_AT_IN_FUTURE");
    if (BigIntConstructor(createdAtMs) * 1_000_000n > stable.mtimeNs) {
      fail("CREATED_AT_AFTER_STABLE_FILE_MTIME");
    }
    const expected = await buildStage0SourceTemporalAuditManifest({
      createdAt: manifest.createdAt,
    });
    if (canonicalizeStrict(expected) !== canonicalizeStrict(manifest)) {
      fail("MANIFEST_EXACT_SOURCE_REPLAY_MISMATCH");
    }
    return deepFreeze({
      ok: true,
      verificationLevel: "FULL_PINNED_SOURCE_REPLAY_WITH_TEMPORAL_QUARANTINE",
      manifestHash: manifest.manifestHash,
      artifactFileHash: STAGE0_SOURCE_TEMPORAL_AUDIT_CANONICAL.artifactFileHash,
      artifactFileBytes: STAGE0_SOURCE_TEMPORAL_AUDIT_CANONICAL.artifactFileBytes,
      sourceArtifactsReverified: true,
      exactReceiptArtifactsRebuiltFromFrozenSources: true,
      temporalAuthenticityEstablishedForAllReceipts: false,
      temporalQuarantineReceiptCount: 7,
      temporallyOrderedCurrentReceiptCount: 9,
      currentCoverageReceiptCount: 9,
      pathNamingSelectionAuthority: false,
      pointedReceiptCount: 16,
      closureCredit: false,
      operationalAuthorityGranted: false,
    });
  } catch (error) { return invalid(error); }
}
