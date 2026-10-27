/*
 * Full-source verifier for the public agent corpus.
 *
 * The verifier accepts directories only. It never accepts caller-supplied
 * records, replay callbacks, source hashes, labels, or authority overrides.
 */

import { createHash } from "node:crypto";
import { closeSync, existsSync, fstatSync, openSync, readFileSync, readdirSync,
  statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { Readable } from "node:stream";
import readline from "node:readline";
import { createGunzip } from "node:zlib";
import {
  canonicalizeStrict,
  canonicalizeStrictBoundedArtifact,
} from "./canonical.js";
import {
  PUBLIC_AGENT_PINS,
  buildPublicAgentProvenanceProof,
  buildPublicAgentAcquisitionManifest,
  normalizeComputerAgentArenaRow,
  normalizeNebiusOpenHandsRow,
  normalizeOpenHandsFeedbackRow,
  normalizeTraceLabSession,
  parseComputerAgentArenaSessionsCsv,
  publicAgentDigest,
  summarizePublicAgentRecords,
  traceLabUserTurnCount,
  verifyPublicAgentAcquisitionManifest,
  verifyPublicAgentRecordSet,
} from "./outsider-public-agent-corpus.js";

export const PUBLIC_AGENT_ARTIFACT_SCHEMAS = Object.freeze({
  verification: "outsider/public-agent-full-source-verification/v2",
});

const OPENHANDS_TOTAL = 275;
const NEBIUS_TOTAL = 67074;
const NEBIUS_QUOTA = 100;
const NEBIUS_BATCH_WIDTH = 8;
const SHA256 = /^sha256:[a-f0-9]{64}$/;
const SUPPORT_PINS = Object.freeze({
  caaSessions: Object.freeze({ sizeBytes: 7270213,
    sha256: "sha256:2a8f48b865ce72d1bbdce4ce73a57a4a429a1383be5fded1e1b32d9bc5d3751d" }),
  openhandsReadme: Object.freeze({ sizeBytes: 5031,
    sha256: "sha256:e7b7abb593d9f0c97bcda6e8ce689d577b5963dc20b2cfb22265cb36085f1b47" }),
  nebiusReadme: Object.freeze({ sizeBytes: 6924,
    sha256: "sha256:90fa586c747d9ed1022c28847439489576049cde7de1fdfb80d24b2a0ae77b32" }),
  nebiusLicense: Object.freeze({ sizeBytes: 18656,
    sha256: "sha256:9e5f1b3c610b9c2da5c313bf81d577a7d1acec686bdb0384edefa6df0f90cd94" }),
});
const CAA_PROVENANCE_PINS = Object.freeze({
  "computer-agent-arena/repository-revision.json": Object.freeze({ sizeBytes: 2146,
    sha256: "sha256:6c806bd89792f876f2e892a7af6e57c3609c3b172376e4bbeb2bbd2b320f4fe9" }),
  "computer-agent-arena/repository-tree.json": Object.freeze({ sizeBytes: 11806,
    sha256: "sha256:2e3a2ae6f74ac4f29b2a3ff10c5e397c9b41ebcbf18d7dbbedb5def0cf134259" }),
  "computer-agent-arena/README.md": Object.freeze({ sizeBytes: 4742,
    sha256: "sha256:7534d4c014dc4fb99aeb5baad09da8d696ef0d31ed34c43bd271cba27a08bacf" }),
});
const TRACELAB_PROVENANCE_PINS = Object.freeze({
  "tracelab.commit.json": Object.freeze({ sizeBytes: 2689,
    sha256: "sha256:ba60ac23c95e4f4382dca481d9dc6097c8bd18a99ebc3198bc3fc136cc73221a" }),
  "tracelab.tag-v0.0.1.json": Object.freeze({ sizeBytes: 333,
    sha256: "sha256:abfbb350eb01ab8df805193a83a0ee554a45e33031e2547e04dd1176480de676" }),
  "tracelab.release-v0.0.1.json": Object.freeze({ sizeBytes: 5894,
    sha256: "sha256:6146f40a11c7526faffaa1bf26a6241cbc63760ccb662af46661206c83736461" }),
  "tracelab.README.md": Object.freeze({ sizeBytes: 16679,
    sha256: "sha256:4b3259783b8e84dbda953b9eabf47fbb7a077b0cfb5ee3138eecd79d5a0c3afb" }),
  "tracelab.LICENSE-DATASET.md": Object.freeze({ sizeBytes: 2061,
    sha256: "sha256:1e96a0ec55f98ee0e4e2432626c0201104ebfb7f98cecf0a31d5313ddad92e9a" }),
  "tracelab.NOTICE": Object.freeze({ sizeBytes: 540,
    sha256: "sha256:84f5e286d199c15c4ed2a85584ba0792cb813aa4a74ddbcf0559740244c24615" }),
});
const OPENHANDS_ACQUISITION_PINS = Object.freeze({
  "openhands-feedback.repo.json": Object.freeze({ sizeBytes: 2388,
    sha256: "sha256:7958a60ddfbef6e18f8e0ad74ee66a7c382e3a9f0865e1b06c8c66bfc128ba31" }),
  "openhands-feedback.repo-after.json": Object.freeze({ sizeBytes: 2388,
    sha256: "sha256:7958a60ddfbef6e18f8e0ad74ee66a7c382e3a9f0865e1b06c8c66bfc128ba31" }),
  "openhands-feedback.rows-000-099.json": Object.freeze({ sizeBytes: 147396384,
    sha256: "sha256:66d898c14efa084a3c4e246b17f2ecfcfb7e259ee30a2788375559b55f14a272" }),
  "openhands-feedback.rows-100-199.json": Object.freeze({ sizeBytes: 167650434,
    sha256: "sha256:4d9ee554ff79823660aa4d20bc73ac838f7ab3e714b938d04c295a1860f4b3f0" }),
  "openhands-feedback.rows-200-274.json": Object.freeze({ sizeBytes: 49434210,
    sha256: "sha256:f5a505bd04acdb50fff94931ff21c36348a9e9a99fef69c67d424a58e3f8e63e" }),
});
const NEBIUS_ACQUISITION_PINS = Object.freeze({
  "nebius-openhands.repo.json": Object.freeze({ sizeBytes: 1533,
    sha256: "sha256:82cbe2b4ac69ca6bb80b262c5da34e272844137ad12f44198dac9b31abb9ebf9" }),
  "nebius-openhands.repo-after.json": Object.freeze({ sizeBytes: 1533,
    sha256: "sha256:82cbe2b4ac69ca6bb80b262c5da34e272844137ad12f44198dac9b31abb9ebf9" }),
  "nebius-stratified-selection.json": Object.freeze({ sizeBytes: 57491507,
    sha256: "sha256:fbfb0b55c11d0576bb1a25eb911aa41d39645c26ccb412b7dd5831152cfb1880" }),
  "nebius.rows-00000.json": Object.freeze({ sizeBytes: 2987305,
    sha256: "sha256:c907566dd29e4859f602a01d178ade54b3d478154a212736513d84c0959f2649" }),
  "nebius.rows-01719.json": Object.freeze({ sizeBytes: 2652259,
    sha256: "sha256:da2804dedcb17e5254a98baa6fe01c5615d45e0745a00a70905082227646519e" }),
  "nebius.rows-03439.json": Object.freeze({ sizeBytes: 2706280,
    sha256: "sha256:6d214fab21aa36a89d6b1d8075b0b06f8e8c2cceea012ab3bae6e5d0fb9a37cb" }),
  "nebius.rows-05158.json": Object.freeze({ sizeBytes: 2716675,
    sha256: "sha256:3d63a66cfc8ce8de5c04c8a7600c133ee5063ee966cc290a03c586bc38ceef7b" }),
  "nebius.rows-06878.json": Object.freeze({ sizeBytes: 2860046,
    sha256: "sha256:1874a0fe144ee97d067e154649a5ca8b0d06b1c35fdf90151c4091348d856364" }),
  "nebius.rows-08597.json": Object.freeze({ sizeBytes: 3004117,
    sha256: "sha256:2faf228e417e2c263fbf68893163c44fe265bd48a35e699d85f82d1044e5be41" }),
  "nebius.rows-10317.json": Object.freeze({ sizeBytes: 3050015,
    sha256: "sha256:1ad6146181eee1b745c1ac58c99b2f9a1f16adaf995391074b49ca58b4ba0d33" }),
  "nebius.rows-12037.json": Object.freeze({ sizeBytes: 3102045,
    sha256: "sha256:357adaa57664640c8caa3622765ed2bbe8e26cc9b2ac7ded7d011c4ca3cbfc62" }),
  "nebius.rows-13756.json": Object.freeze({ sizeBytes: 3033166,
    sha256: "sha256:69a95ff03fc589d9dccc30b3e7ee953c4cdb491d2740dc33538202808ec4bd14" }),
  "nebius.rows-15476.json": Object.freeze({ sizeBytes: 2606266,
    sha256: "sha256:1df07f41903b762a9b2d0866577920702051baac1531b5e527fba279262fe575" }),
  "nebius.rows-17195.json": Object.freeze({ sizeBytes: 3040845,
    sha256: "sha256:0231d98adf96730639afd6c8ff41834db432ba8e0388ff7e3b246ba332b5d652" }),
  "nebius.rows-18915.json": Object.freeze({ sizeBytes: 2747500,
    sha256: "sha256:91ae342af25c6aff47d11400196ffa428873a91cd3866472dc1238107e8a5d73" }),
  "nebius.rows-20635.json": Object.freeze({ sizeBytes: 2679824,
    sha256: "sha256:172b0b2d3be5635afae0ba14d9bfb3b77c07fb732ed2cb06e75e75bb47751266" }),
  "nebius.rows-22354.json": Object.freeze({ sizeBytes: 3032256,
    sha256: "sha256:0ca7158a76dc83529c63ec5fe51995eca43204ae5899f14c9aff0c84dfed59a1" }),
  "nebius.rows-24074.json": Object.freeze({ sizeBytes: 3391322,
    sha256: "sha256:2f6b31b3d7b3a9461c7604320ca0c1df8993f25505121169003b63775841283c" }),
  "nebius.rows-25793.json": Object.freeze({ sizeBytes: 2800572,
    sha256: "sha256:30a1a552615385a1fe3239e429ead10a95ae6dfba98f4d6870dc253dbe9d0317" }),
  "nebius.rows-27513.json": Object.freeze({ sizeBytes: 2963077,
    sha256: "sha256:a4ddfbdd3423da21755656ed3af6cf00eead70d0ae206ac6b63bd943dcdc133b" }),
  "nebius.rows-29233.json": Object.freeze({ sizeBytes: 3044499,
    sha256: "sha256:9995907b365558bb888c335c5d8c514f1ce4450bf8b37a9bdb9be034cb5b5069" }),
  "nebius.rows-30952.json": Object.freeze({ sizeBytes: 2742997,
    sha256: "sha256:138dba7bdc1751bb85ecb39ccc73c3a44be9cc5c26a049361865cb8e7fe5fbcc" }),
  "nebius.rows-32672.json": Object.freeze({ sizeBytes: 2832299,
    sha256: "sha256:1b85a124dc17a37e60a10b7e4089dff2410a04734e1664733f77bd8bfc81a6eb" }),
  "nebius.rows-34391.json": Object.freeze({ sizeBytes: 2761544,
    sha256: "sha256:8609661f5d52b2cd240630cfac06e9f393c55363979b903395da77c6a6a6b38e" }),
  "nebius.rows-36111.json": Object.freeze({ sizeBytes: 2773975,
    sha256: "sha256:8aed9ae21fdbe548bd845db1a702a8015bcf4ba5acc2233e6bf4630ee2b5fcac" }),
  "nebius.rows-37830.json": Object.freeze({ sizeBytes: 2762793,
    sha256: "sha256:4734c61d0dec9f1b3354e31692d64b08d86e8c6baa8738c022832f1648434eca" }),
  "nebius.rows-39550.json": Object.freeze({ sizeBytes: 3046981,
    sha256: "sha256:54f4a2457d14fe9d8ae7133a84c1893c56daaf7c17038c66eaa3af11c6878894" }),
});

export const PUBLIC_AGENT_SOURCE_OBJECT_PINS = Object.freeze({
  computerAgentArenaSessions: SUPPORT_PINS.caaSessions,
  computerAgentArenaProvenance: CAA_PROVENANCE_PINS,
  traceLabProvenance: TRACELAB_PROVENANCE_PINS,
  openHandsReadme: SUPPORT_PINS.openhandsReadme,
  nebiusReadme: SUPPORT_PINS.nebiusReadme,
  nebiusLicense: SUPPORT_PINS.nebiusLicense,
  openHandsAcquisition: OPENHANDS_ACQUISITION_PINS,
  nebiusAcquisition: NEBIUS_ACQUISITION_PINS,
});

function fail(code, detail = null) {
  throw new Error(detail == null ? code : `${code}:${detail}`);
}

function same(left, right) {
  return canonicalizeStrict(left) === canonicalizeStrict(right);
}

function readJson(path) {
  try {
    const snapshot = readPinnedPublicAgentSourceSnapshot(path, null,
      "PUBLIC_AGENT_ARTIFACT_SNAPSHOT_MISMATCH");
    return JSON.parse(snapshot.bytes.toString("utf8"));
  }
  catch (error) { fail("PUBLIC_AGENT_ARTIFACT_JSON_INVALID", `${path}:${error.message}`); }
}

function fileIdentity(stat) {
  return [stat.dev, stat.ino, stat.size, stat.mtimeNs, stat.ctimeNs]
    .map((value) => String(value)).join(":");
}

/*
 * One source open, one immutable byte snapshot, one hash, one parse input.
 * The path and opened descriptor must still name the same unchanged object
 * after the read. Derivation never reopens a verified source path.
 */
export function readPinnedPublicAgentSourceSnapshot(path, pin, code =
  "PUBLIC_AGENT_SOURCE_SNAPSHOT_MISMATCH") {
  if (!existsSync(path)) fail(code, path);
  let descriptor = null;
  try {
    const pathBefore = statSync(path, { bigint: true });
    descriptor = openSync(path, "r");
    const descriptorBefore = fstatSync(descriptor, { bigint: true });
    if (!descriptorBefore.isFile()
      || fileIdentity(pathBefore) !== fileIdentity(descriptorBefore)) fail(code, path);
    const bytes = readFileSync(descriptor);
    const descriptorAfter = fstatSync(descriptor, { bigint: true });
    const pathAfter = statSync(path, { bigint: true });
    if (fileIdentity(descriptorBefore) !== fileIdentity(descriptorAfter)
      || fileIdentity(descriptorAfter) !== fileIdentity(pathAfter)
      || BigInt(bytes.length) !== descriptorAfter.size) fail(code, path);
    const object = { sizeBytes: bytes.length,
      sha256: `sha256:${createHash("sha256").update(bytes).digest("hex")}` };
    if (pin != null && !same(object, pin)) fail(code, path);
    return { bytes, object };
  } catch (error) {
    if (error instanceof Error && error.message.startsWith(code)) throw error;
    fail(code, `${path}:${error instanceof Error ? error.message : String(error)}`);
  } finally {
    if (descriptor != null) closeSync(descriptor);
  }
}

function pinnedJsonSnapshot(path, pin, code) {
  const snapshot = readPinnedPublicAgentSourceSnapshot(path, pin, code);
  try { return { ...snapshot, value: JSON.parse(snapshot.bytes.toString("utf8")) }; }
  catch (error) { fail("PUBLIC_AGENT_SOURCE_JSON_INVALID", `${path}:${error.message}`); }
}

function snapshotEntry(path, snapshot) {
  return { path, object: snapshot.object };
}

function snapshotStream(bytes) {
  async function* chunks() {
    const width = 64 * 1024;
    for (let offset = 0; offset < bytes.length; offset += width) {
      yield bytes.subarray(offset, Math.min(offset + width, bytes.length));
    }
  }
  return Readable.from(chunks());
}

function requireSizedFile(path, sizeBytes, code) {
  if (!existsSync(path) || !statSync(path).isFile() || statSync(path).size !== sizeBytes) {
    fail(code, path);
  }
}

function preflightSourceShape(sourceDirectory) {
  const trace = PUBLIC_AGENT_PINS.traceLab.upstreamObject;
  requireSizedFile(join(sourceDirectory, trace.path), trace.sizeBytes,
    "PUBLIC_AGENT_TRACELAB_SOURCE_INCOMPLETE");

  const caa = PUBLIC_AGENT_PINS.computerAgentArena.upstreamObject;
  requireSizedFile(join(sourceDirectory, "computer-agent-arena", caa.path), caa.sizeBytes,
    "PUBLIC_AGENT_CAA_SOURCE_INCOMPLETE");
  requireSizedFile(join(sourceDirectory, "computer-agent-arena", "sessions.csv"),
    SUPPORT_PINS.caaSessions.sizeBytes, "PUBLIC_AGENT_CAA_SESSIONS_INCOMPLETE");
  for (const [name, pin] of Object.entries(CAA_PROVENANCE_PINS)) {
    requireSizedFile(join(sourceDirectory, name), pin.sizeBytes,
      "PUBLIC_AGENT_CAA_PROVENANCE_INCOMPLETE");
  }

  for (const [name, pin] of Object.entries(TRACELAB_PROVENANCE_PINS)) {
    requireSizedFile(join(sourceDirectory, name), pin.sizeBytes,
      "PUBLIC_AGENT_TRACELAB_PROVENANCE_INCOMPLETE");
  }

  for (const [name, pin] of Object.entries(OPENHANDS_ACQUISITION_PINS)) {
    requireSizedFile(join(sourceDirectory, name), pin.sizeBytes,
      "PUBLIC_AGENT_OPENHANDS_SOURCE_INCOMPLETE");
  }
  requireSizedFile(join(sourceDirectory, "openhands-feedback.README.md"),
    SUPPORT_PINS.openhandsReadme.sizeBytes, "PUBLIC_AGENT_OPENHANDS_SOURCE_INCOMPLETE");

  for (const [name, pin] of Object.entries(NEBIUS_ACQUISITION_PINS)) {
    requireSizedFile(join(sourceDirectory, name), pin.sizeBytes,
      "PUBLIC_AGENT_NEBIUS_SOURCE_INCOMPLETE");
  }
  requireSizedFile(join(sourceDirectory, "nebius-openhands.README.md"),
    SUPPORT_PINS.nebiusReadme.sizeBytes, "PUBLIC_AGENT_NEBIUS_SOURCE_INCOMPLETE");
  requireSizedFile(join(sourceDirectory, "nebius-openhands.LICENSE"),
    SUPPORT_PINS.nebiusLicense.sizeBytes, "PUBLIC_AGENT_NEBIUS_SOURCE_INCOMPLETE");

  const expectedNebiusPages = Object.keys(NEBIUS_ACQUISITION_PINS)
    .filter((name) => /^nebius\.rows-[0-9]{5}\.json$/.test(name)).sort();
  const actualNebiusPages = readdirSync(sourceDirectory)
    .filter((name) => /^nebius\.rows-[0-9]{5}\.json$/.test(name)).sort();
  if (!same(actualNebiusPages, expectedNebiusPages)) {
    fail("PUBLIC_AGENT_NEBIUS_SOURCE_PAGE_SET_MISMATCH");
  }
}

function requireRepoMetadata(metadata, pin) {
  if (metadata.id !== pin.id || metadata.sha !== pin.revision
    || metadata.cardData?.license?.toUpperCase() !== pin.licenseId.toUpperCase()
    || !Array.isArray(metadata.siblings)
    || !metadata.siblings.some((item) => item.rfilename === pin.upstreamObject.path)) {
    fail("PUBLIC_AGENT_REPOSITORY_METADATA_PIN_MISMATCH", pin.id);
  }
  return metadata;
}

function openHandsPageNames() {
  return [
    "openhands-feedback.rows-000-099.json",
    "openhands-feedback.rows-100-199.json",
    "openhands-feedback.rows-200-274.json",
  ];
}

function validateRowsPage(page, { datasetId, total, offset, length }) {
  if (!page || page.partial !== false || page.num_rows_total !== total
    || !Array.isArray(page.rows) || page.rows.length !== length) {
    fail("PUBLIC_AGENT_ROWS_PAGE_INCOMPLETE", `${datasetId}:${offset}`);
  }
  for (let index = 0; index < page.rows.length; index += 1) {
    const item = page.rows[index];
    if (item.row_idx !== offset + index || !item.row
      || Array.isArray(item.truncated_cells) && item.truncated_cells.length > 0) {
      fail("PUBLIC_AGENT_ROWS_PAGE_TRUNCATED_OR_REORDERED", `${datasetId}:${offset + index}`);
    }
  }
}

async function deriveOpenHands(sourceDirectory) {
  const pin = PUBLIC_AGENT_PINS.openhandsFeedback;
  const repo = join(sourceDirectory, "openhands-feedback.repo.json");
  const repoAfter = join(sourceDirectory, "openhands-feedback.repo-after.json");
  const readme = join(sourceDirectory, "openhands-feedback.README.md");
  const repoSnapshot = pinnedJsonSnapshot(repo,
    OPENHANDS_ACQUISITION_PINS["openhands-feedback.repo.json"],
    "PUBLIC_AGENT_OPENHANDS_REPOSITORY_SNAPSHOT_MISMATCH");
  const repoAfterSnapshot = pinnedJsonSnapshot(repoAfter,
    OPENHANDS_ACQUISITION_PINS["openhands-feedback.repo-after.json"],
    "PUBLIC_AGENT_OPENHANDS_REPOSITORY_SNAPSHOT_MISMATCH");
  requireRepoMetadata(repoSnapshot.value, pin);
  requireRepoMetadata(repoAfterSnapshot.value, pin);
  const readmeSnapshot = readPinnedPublicAgentSourceSnapshot(readme,
    SUPPORT_PINS.openhandsReadme, "PUBLIC_AGENT_OPENHANDS_LICENSE_EVIDENCE_MISMATCH");
  if (!readmeSnapshot.bytes.toString("utf8").includes("license: mit")) {
    fail("PUBLIC_AGENT_OPENHANDS_LICENSE_DECLARATION_INVALID");
  }
  const pages = [];
  const snapshots = [snapshotEntry(repo, repoSnapshot), snapshotEntry(repoAfter,
    repoAfterSnapshot), snapshotEntry(readme, readmeSnapshot)];
  const records = [];
  for (const [index, name] of openHandsPageNames().entries()) {
    const offset = index * 100;
    const length = Math.min(100, OPENHANDS_TOTAL - offset);
    const path = join(sourceDirectory, name);
    const pagePin = OPENHANDS_ACQUISITION_PINS[name];
    if (!pagePin) fail("PUBLIC_AGENT_OPENHANDS_PAGE_PIN_MISSING", name);
    const pageSnapshot = pinnedJsonSnapshot(path, pagePin,
      "PUBLIC_AGENT_OPENHANDS_PAGE_PIN_MISMATCH");
    const sha256 = pagePin.sha256;
    const page = pageSnapshot.value;
    validateRowsPage(page, { datasetId: pin.id, total: OPENHANDS_TOTAL, offset, length });
    pages.push(path);
    snapshots.push(snapshotEntry(path, pageSnapshot));
    for (const item of page.rows) records.push(normalizeOpenHandsFeedbackRow(item.row,
      { rowIndex: item.row_idx, sourceObjectHash: sha256 }));
  }
  if (records.length !== OPENHANDS_TOTAL) fail("PUBLIC_AGENT_OPENHANDS_COUNT_INVALID");
  return { records, snapshots };
}

function nebiusOffsets() {
  const windows = 40;
  const width = 10;
  return Array.from({ length: windows }, (_, index) =>
    Math.floor(index * (NEBIUS_TOTAL - width) / (windows - 1)));
}

function expectedNebiusSelection(selected) {
  return {
    schema: "outsider/public-agent-nebius-sampling/v1",
    populationRows: NEBIUS_TOTAL,
    rule: "forty-evenly-spaced-index-windows-width-10; retain first 100 rows per resolved class",
    rowsApiRevisionBinding: "repository SHA checked before and after; API rows are not an independent proof of the pinned Parquet LFS object",
    prevalenceEligible: false,
    quota: { resolved: NEBIUS_QUOTA, unresolved: NEBIUS_QUOTA },
    selected: [...selected].sort((left, right) => left.row_idx - right.row_idx),
  };
}

async function deriveNebius(sourceDirectory) {
  const pin = PUBLIC_AGENT_PINS.nebiusOpenHands;
  const repo = join(sourceDirectory, "nebius-openhands.repo.json");
  const repoAfter = join(sourceDirectory, "nebius-openhands.repo-after.json");
  const readme = join(sourceDirectory, "nebius-openhands.README.md");
  const license = join(sourceDirectory, "nebius-openhands.LICENSE");
  const selectionPath = join(sourceDirectory, "nebius-stratified-selection.json");
  const repoSnapshot = pinnedJsonSnapshot(repo,
    NEBIUS_ACQUISITION_PINS["nebius-openhands.repo.json"],
    "PUBLIC_AGENT_NEBIUS_REPOSITORY_SNAPSHOT_MISMATCH");
  const repoAfterSnapshot = pinnedJsonSnapshot(repoAfter,
    NEBIUS_ACQUISITION_PINS["nebius-openhands.repo-after.json"],
    "PUBLIC_AGENT_NEBIUS_REPOSITORY_SNAPSHOT_MISMATCH");
  requireRepoMetadata(repoSnapshot.value, pin);
  requireRepoMetadata(repoAfterSnapshot.value, pin);
  const readmeSnapshot = readPinnedPublicAgentSourceSnapshot(readme,
    SUPPORT_PINS.nebiusReadme, "PUBLIC_AGENT_NEBIUS_README_MISMATCH");
  const licenseSnapshot = readPinnedPublicAgentSourceSnapshot(license,
    SUPPORT_PINS.nebiusLicense, "PUBLIC_AGENT_NEBIUS_LICENSE_MISMATCH");
  if (!licenseSnapshot.bytes.toString("utf8").includes("Creative Commons Attribution 4.0")) {
    fail("PUBLIC_AGENT_NEBIUS_LICENSE_DECLARATION_INVALID");
  }
  const selectionSnapshot = pinnedJsonSnapshot(selectionPath,
    NEBIUS_ACQUISITION_PINS["nebius-stratified-selection.json"],
    "PUBLIC_AGENT_NEBIUS_SELECTION_PIN_MISMATCH");

  const names = readdirSync(sourceDirectory)
    .filter((name) => /^nebius\.rows-[0-9]{5}\.json$/.test(name)).sort();
  const allOffsets = nebiusOffsets();
  if (names.length < NEBIUS_BATCH_WIDTH || names.length % NEBIUS_BATCH_WIDTH !== 0) {
    fail("PUBLIC_AGENT_NEBIUS_PAGE_BATCH_INVALID");
  }
  const expectedNames = allOffsets.slice(0, names.length)
    .map((offset) => `nebius.rows-${String(offset).padStart(5, "0")}.json`);
  if (!same(names, expectedNames)) fail("PUBLIC_AGENT_NEBIUS_PAGE_GRID_INVALID");

  const buckets = { resolved: [], unresolved: [] };
  const snapshots = [snapshotEntry(repo, repoSnapshot), snapshotEntry(repoAfter,
    repoAfterSnapshot), snapshotEntry(readme, readmeSnapshot), snapshotEntry(license,
    licenseSnapshot), snapshotEntry(selectionPath, selectionSnapshot)];
  let firstCompleteBatch = null;
  for (let pageIndex = 0; pageIndex < names.length; pageIndex += 1) {
    const name = names[pageIndex];
    const offset = allOffsets[pageIndex];
    const path = join(sourceDirectory, name);
    const pagePin = NEBIUS_ACQUISITION_PINS[name];
    if (!pagePin) fail("PUBLIC_AGENT_NEBIUS_PAGE_PIN_MISSING", name);
    const pageSnapshot = pinnedJsonSnapshot(path, pagePin,
      "PUBLIC_AGENT_NEBIUS_PAGE_PIN_MISMATCH");
    const sha256 = pagePin.sha256;
    const page = pageSnapshot.value;
    validateRowsPage(page, { datasetId: pin.id, total: NEBIUS_TOTAL, offset, length: 10 });
    snapshots.push(snapshotEntry(path, pageSnapshot));
    for (const item of page.rows) {
      const bucket = Number(item.row.resolved) === 1 ? buckets.resolved
        : Number(item.row.resolved) === 0 ? buckets.unresolved : null;
      if (!bucket) fail("PUBLIC_AGENT_NEBIUS_LABEL_INVALID", String(item.row_idx));
      if (bucket.length < NEBIUS_QUOTA) bucket.push({ row_idx: item.row_idx, row: item.row,
        sourceObjectHash: sha256, sourcePath: name });
    }
    const atBatchBoundary = (pageIndex + 1) % NEBIUS_BATCH_WIDTH === 0;
    if (atBatchBoundary && firstCompleteBatch == null
      && buckets.resolved.length >= NEBIUS_QUOTA
      && buckets.unresolved.length >= NEBIUS_QUOTA) firstCompleteBatch = pageIndex + 1;
  }
  if (firstCompleteBatch !== names.length || buckets.resolved.length !== NEBIUS_QUOTA
    || buckets.unresolved.length !== NEBIUS_QUOTA) {
    fail("PUBLIC_AGENT_NEBIUS_STOP_RULE_INVALID");
  }
  const selected = [...buckets.resolved, ...buckets.unresolved]
    .sort((left, right) => left.row_idx - right.row_idx);
  const expectedSelection = expectedNebiusSelection(selected);
  const { selected: storedSelected, ...storedSelectionHeader } = selectionSnapshot.value;
  const { selected: expectedSelected, ...expectedSelectionHeader } = expectedSelection;
  if (!same(storedSelectionHeader, expectedSelectionHeader)
    || !Array.isArray(storedSelected) || !Array.isArray(expectedSelected)
    || storedSelected.length !== expectedSelected.length) {
    fail("PUBLIC_AGENT_NEBIUS_SELECTION_DERIVATION_MISMATCH");
  }
  for (let index = 0; index < storedSelected.length; index += 1) {
    if (!same(storedSelected[index], expectedSelected[index])) {
      fail("PUBLIC_AGENT_NEBIUS_SELECTION_DERIVATION_MISMATCH", String(index));
    }
  }
  const records = selected.map((item) => normalizeNebiusOpenHandsRow(item.row,
    { rowIndex: item.row_idx, sourceObjectHash: item.sourceObjectHash }));
  return { records, snapshots };
}

async function deriveCAA(sourceDirectory) {
  const pin = PUBLIC_AGENT_PINS.computerAgentArena;
  const directory = join(sourceDirectory, "computer-agent-arena");
  const trajectoriesPath = join(directory, "agent_arena_data.jsonl");
  const sessionsPath = join(directory, "sessions.csv");
  const repositoryPath = join(directory, "repository-revision.json");
  const treePath = join(directory, "repository-tree.json");
  const readmePath = join(directory, "README.md");
  const trajectoriesSnapshot = readPinnedPublicAgentSourceSnapshot(trajectoriesPath,
    { sizeBytes: pin.upstreamObject.sizeBytes, sha256: pin.upstreamObject.sha256 },
    "PUBLIC_AGENT_CAA_TRAJECTORY_PIN_MISMATCH");
  const sessionsSnapshot = readPinnedPublicAgentSourceSnapshot(sessionsPath,
    SUPPORT_PINS.caaSessions, "PUBLIC_AGENT_CAA_SESSIONS_PIN_MISMATCH");
  const repositorySnapshot = pinnedJsonSnapshot(repositoryPath,
    CAA_PROVENANCE_PINS["computer-agent-arena/repository-revision.json"],
    "PUBLIC_AGENT_CAA_REPOSITORY_METADATA_MISMATCH");
  const treeSnapshot = pinnedJsonSnapshot(treePath,
    CAA_PROVENANCE_PINS["computer-agent-arena/repository-tree.json"],
    "PUBLIC_AGENT_CAA_REPOSITORY_TREE_MISMATCH");
  const readmeSnapshot = readPinnedPublicAgentSourceSnapshot(readmePath,
    CAA_PROVENANCE_PINS["computer-agent-arena/README.md"],
    "PUBLIC_AGENT_CAA_README_MISMATCH");
  requireRepoMetadata(repositorySnapshot.value, pin);
  if (!Array.isArray(treeSnapshot.value)) fail("PUBLIC_AGENT_CAA_REPOSITORY_TREE_INVALID");
  const treeEntry = (path) => treeSnapshot.value.find((entry) => entry?.path === path);
  const trajectoryEntry = treeEntry(pin.upstreamObject.path);
  const sessionsEntry = treeEntry("sessions.csv");
  const readmeEntry = treeEntry("README.md");
  const gitBlobOid = (bytes) => createHash("sha1")
    .update(`blob ${bytes.length}\0`).update(bytes).digest("hex");
  if (trajectoryEntry?.type !== "file" || trajectoryEntry?.size !== pin.upstreamObject.sizeBytes
    || trajectoryEntry?.lfs?.size !== pin.upstreamObject.sizeBytes
    || trajectoryEntry?.lfs?.oid !== pin.upstreamObject.sha256.slice("sha256:".length)
    || sessionsEntry?.type !== "file" || sessionsEntry?.size !== sessionsSnapshot.object.sizeBytes
    || sessionsEntry?.oid !== gitBlobOid(sessionsSnapshot.bytes)
    || readmeEntry?.type !== "file" || readmeEntry?.size !== readmeSnapshot.object.sizeBytes
    || readmeEntry?.oid !== gitBlobOid(readmeSnapshot.bytes)) {
    fail("PUBLIC_AGENT_CAA_REVISION_OBJECT_INCLUSION_MISMATCH");
  }
  const readmeText = readmeSnapshot.bytes.toString("utf8");
  if (!readmeText.includes("license: cc-by-4.0")
    || !readmeText.includes("released under CC-BY-4.0 license")) {
    fail("PUBLIC_AGENT_CAA_LICENSE_DECLARATION_INVALID");
  }
  const contexts = parseComputerAgentArenaSessionsCsv(sessionsSnapshot.bytes.toString("utf8"));
  const sourceObjectHash = pin.upstreamObject.sha256;
  const lines = readline.createInterface({ input: snapshotStream(trajectoriesSnapshot.bytes),
    crlfDelay: Infinity });
  const records = [];
  for await (const line of lines) {
    if (!line.trim()) continue;
    const row = JSON.parse(line);
    const correlation = contexts.get(String(row.task_id));
    if (!correlation) fail("PUBLIC_AGENT_CAA_SESSION_CONTEXT_MISSING", row.task_id);
    records.push(normalizeComputerAgentArenaRow(row,
      { rowIndex: records.length, sourceObjectHash, correlation }));
  }
  if (records.length !== 4641) fail("PUBLIC_AGENT_CAA_COUNT_INVALID", records.length);
  return { records, snapshots: [snapshotEntry(trajectoriesPath, trajectoriesSnapshot),
    snapshotEntry(sessionsPath, sessionsSnapshot), snapshotEntry(repositoryPath,
      repositorySnapshot), snapshotEntry(treePath, treeSnapshot),
    snapshotEntry(readmePath, readmeSnapshot)] };
}

function traceSessionId(row, index) {
  const candidate = row.session_id ?? row.sessionId ?? row.session ?? row.conversation_id
    ?? (typeof row.trace_key === "string" ? row.trace_key.split(":")[0] : null);
  return candidate == null ? `unkeyed-round-${index}` : String(candidate);
}

function traceTimestamp(row) {
  const candidates = [row.timestamp, row.started_at, row.round_started_at,
    ...(Array.isArray(row.timing_events) ? row.timing_events.map((event) =>
      event.timestamp ?? event.at ?? event.emitted_at) : [])];
  return candidates.map((value) => Date.parse(value ?? "")).find(Number.isFinite) ?? null;
}

async function deriveTraceLab(sourceDirectory) {
  const pin = PUBLIC_AGENT_PINS.traceLab;
  const path = join(sourceDirectory, "syfi_coding_trace.jsonl.gz");
  const provenancePaths = Object.fromEntries(Object.keys(TRACELAB_PROVENANCE_PINS)
    .map((name) => [name, join(sourceDirectory, name)]));
  const traceSnapshot = readPinnedPublicAgentSourceSnapshot(path,
    { sizeBytes: pin.upstreamObject.sizeBytes, sha256: pin.upstreamObject.sha256 },
    "PUBLIC_AGENT_TRACELAB_PIN_MISMATCH");
  const provenanceSnapshots = Object.fromEntries(Object.entries(provenancePaths)
    .map(([name, provenancePath]) => [name, name.endsWith(".json")
      ? pinnedJsonSnapshot(provenancePath, TRACELAB_PROVENANCE_PINS[name],
        "PUBLIC_AGENT_TRACELAB_PROVENANCE_MISMATCH")
      : readPinnedPublicAgentSourceSnapshot(provenancePath, TRACELAB_PROVENANCE_PINS[name],
        "PUBLIC_AGENT_TRACELAB_PROVENANCE_MISMATCH")]));
  const commit = provenanceSnapshots["tracelab.commit.json"].value;
  const tag = provenanceSnapshots["tracelab.tag-v0.0.1.json"].value;
  const release = provenanceSnapshots["tracelab.release-v0.0.1.json"].value;
  const asset = Array.isArray(release?.assets) ? release.assets.find((item) =>
    item?.name === pin.upstreamObject.path) : null;
  if (commit?.sha !== pin.revision || commit?.verification?.verified !== true
    || commit?.verification?.reason !== "valid" || tag?.ref !== `refs/tags/${pin.release}`
    || tag?.object?.type !== "commit" || tag?.object?.sha !== pin.revision
    || release?.tag_name !== pin.release || release?.draft !== false
    || release?.prerelease !== false || asset?.state !== "uploaded"
    || asset?.size !== pin.upstreamObject.sizeBytes || asset?.digest !== pin.upstreamObject.sha256
    || asset?.browser_download_url !==
      `https://github.com/uw-syfi/TraceLab/releases/download/${pin.release}/${pin.upstreamObject.path}`) {
    fail("PUBLIC_AGENT_TRACELAB_RELEASE_REVISION_BINDING_INVALID");
  }
  const readmeText = provenanceSnapshots["tracelab.README.md"].bytes.toString("utf8");
  const licenseText = provenanceSnapshots["tracelab.LICENSE-DATASET.md"].bytes.toString("utf8");
  const noticeText = provenanceSnapshots["tracelab.NOTICE"].bytes.toString("utf8");
  if (!readmeText.includes(pin.upstreamObject.sha256.slice("sha256:".length))
    || !readmeText.includes("Dataset: CC BY 4.0")
    || !licenseText.includes("Creative Commons Attribution 4.0 International")
    || !licenseText.includes("syfi_coding_trace.jsonl.gz")
    || !noticeText.includes("Creative Commons Attribution 4.0 International License")) {
    fail("PUBLIC_AGENT_TRACELAB_LICENSE_OR_DIGEST_DECLARATION_INVALID");
  }
  const lines = readline.createInterface({ input: snapshotStream(traceSnapshot.bytes)
    .pipe(createGunzip()),
    crlfDelay: Infinity });
  const sessions = new Map();
  let rounds = 0;
  for await (const line of lines) {
    if (!line.trim()) continue;
    const row = JSON.parse(line);
    const sessionId = traceSessionId(row, rounds++);
    const item = sessions.get(sessionId) ?? { sessionId,
      userId: String(row.user ?? row.user_id ?? row.pseudonymous_user ?? "unknown"),
      roundCount: 0, toolCallCount: 0, toolResultCount: 0, errorCount: 0,
      userTurnCount: 0, inputTokens: 0, outputTokens: 0, cachedInputTokens: 0,
      providers: new Set(), minTime: null, maxTime: null };
    item.roundCount += 1;
    if (row.provider != null) item.providers.add(String(row.provider));
    const tools = Array.isArray(row.tools) ? row.tools : [];
    item.toolCallCount += tools.length;
    item.toolResultCount += tools.filter((tool) => tool?.result_chars != null
      || tool?.result_at != null).length;
    item.errorCount += tools.filter((tool) => tool?.is_error === true).length;
    item.userTurnCount += traceLabUserTurnCount(row);
    item.inputTokens += Number(row.input_tokens_total ?? row.input_tokens ?? 0) || 0;
    item.outputTokens += Number(row.output_tokens ?? 0) || 0;
    item.cachedInputTokens += Number(row.prefix_tokens ?? row.cache_read_input_tokens ?? 0) || 0;
    const time = traceTimestamp(row);
    if (time != null) {
      item.minTime = item.minTime == null ? time : Math.min(item.minTime, time);
      item.maxTime = item.maxTime == null ? time : Math.max(item.maxTime, time);
    }
    sessions.set(sessionId, item);
  }
  if (rounds !== 357161 || sessions.size !== 4265) {
    fail("PUBLIC_AGENT_TRACELAB_DENOMINATOR_INVALID", `${rounds}:${sessions.size}`);
  }
  const records = [...sessions.values()].sort((a, b) => a.sessionId.localeCompare(b.sessionId))
    .map((item) => normalizeTraceLabSession({ ...item, providers: [...item.providers].sort(),
      durationMs: item.minTime == null || item.maxTime == null ? null : item.maxTime - item.minTime },
    { sourceObjectHash: pin.upstreamObject.sha256 }));
  return { records, snapshots: [snapshotEntry(path, traceSnapshot),
    ...Object.entries(provenanceSnapshots).map(([name, snapshot]) =>
      snapshotEntry(provenancePaths[name], snapshot))] };
}

function license(pin) {
  return { identifier: pin.licenseId, declarationUrl: pin.licenseDeclarationUrl,
    adapterGrantsRights: false, attributionRequired: pin.licenseId === "CC-BY-4.0" };
}

function acquired(snapshots, artifactDirectory) {
  return snapshots.map(({ path, object }) => ({ path: relative(artifactDirectory, path),
    sizeBytes: object.sizeBytes, sha256: object.sha256 }));
}

async function rederive({ sourceDirectory, artifactDirectory, generatedAt }) {
  const caa = await deriveCAA(sourceDirectory);
  const trace = await deriveTraceLab(sourceDirectory);
  const openhands = await deriveOpenHands(sourceDirectory);
  const nebius = await deriveNebius(sourceDirectory);
  const sources = [
    { pin: PUBLIC_AGENT_PINS.computerAgentArena, derived: caa,
      sampling: { kind: "complete-structured-trajectory-file", expectedRows: 4641,
        imagesDownloaded: false }, correlationPolicy: "same task root is dependent",
      proofPaths: {
        byteObjectPaths: ["source/computer-agent-arena/agent_arena_data.jsonl"],
        revisionObjectPaths: ["source/computer-agent-arena/repository-revision.json",
          "source/computer-agent-arena/repository-tree.json"],
        licenseObjectPaths: ["source/computer-agent-arena/README.md"],
      } },
    { pin: PUBLIC_AGENT_PINS.traceLab, derived: trace,
      sampling: { kind: "complete-sanitized-jsonl-gzip", expectedRounds: 357161 },
      correlationPolicy: "same pseudonymous contributor root is dependent",
      proofPaths: {
        byteObjectPaths: ["source/syfi_coding_trace.jsonl.gz",
          "source/tracelab.release-v0.0.1.json"],
        revisionObjectPaths: ["source/tracelab.commit.json",
          "source/tracelab.release-v0.0.1.json", "source/tracelab.tag-v0.0.1.json"],
        licenseObjectPaths: ["source/tracelab.LICENSE-DATASET.md",
          "source/tracelab.NOTICE", "source/tracelab.README.md"],
      } },
    { pin: PUBLIC_AGENT_PINS.openhandsFeedback, derived: openhands,
      sampling: { kind: "complete-logical-rows-via-datasets-server", expectedRows: 275,
        revisionBinding: "repo SHA checked before/after; not independent Parquet inclusion proof" },
      correlationPolicy: "all rows share one public-submission collector root",
      proofPaths: {
        byteObjectPaths: ["source/openhands-feedback.rows-000-099.json",
          "source/openhands-feedback.rows-100-199.json",
          "source/openhands-feedback.rows-200-274.json"],
        revisionObjectPaths: ["source/openhands-feedback.repo-after.json",
          "source/openhands-feedback.repo.json"],
        licenseObjectPaths: ["source/openhands-feedback.README.md"],
      } },
    { pin: PUBLIC_AGENT_PINS.nebiusOpenHands, derived: nebius,
      sampling: { kind: "case-control-even-index-window-sample", resolvedRows: 100,
        unresolvedRows: 100, prevalenceEligible: false,
        revisionBinding: "repo SHA checked before/after; not independent Parquet inclusion proof" },
      correlationPolicy: "same repository and issue roots are dependent",
      proofPaths: {
        byteObjectPaths: ["source/nebius-stratified-selection.json",
          ...Object.keys(NEBIUS_ACQUISITION_PINS)
            .filter((name) => /^nebius\.rows-[0-9]{5}\.json$/.test(name))
            .sort().map((name) => `source/${name}`)],
        revisionObjectPaths: ["source/nebius-openhands.repo-after.json",
          "source/nebius-openhands.repo.json"],
        licenseObjectPaths: ["source/nebius-openhands.LICENSE"],
      } },
  ];
  const manifestSources = [];
  for (const source of sources) manifestSources.push({ id: source.pin.id,
    revision: source.pin.revision, sourceClass: source.pin.sourceClass,
    upstreamObject: source.pin.upstreamObject, license: license(source.pin),
    provenanceProof: buildPublicAgentProvenanceProof({ datasetId: source.pin.id,
      ...source.proofPaths }),
    sampling: source.sampling, correlationPolicy: source.correlationPolicy,
    acquiredObjects: acquired(source.derived.snapshots, artifactDirectory) });
  const manifest = buildPublicAgentAcquisitionManifest({ generatedAt, sources: manifestSources });
  if (!verifyPublicAgentAcquisitionManifest(manifest).ok) {
    fail("PUBLIC_AGENT_REDERIVED_MANIFEST_INVALID");
  }
  const recordsBySource = { caa: caa.records, trace: trace.records,
    openhands: openhands.records, nebius: nebius.records };
  const records = [caa.records, trace.records, openhands.records, nebius.records].flat();
  const recordSetProof = verifyPublicAgentRecordSet(records, { manifest });
  if (!recordSetProof.ok) fail("PUBLIC_AGENT_REDERIVED_RECORD_SET_INVALID");
  const summary = summarizePublicAgentRecords(records, { manifestHash: manifest.manifestHash });
  return { manifest, recordsBySource, records, recordSetProof, summary };
}

function readJsonl(path) {
  if (!existsSync(path)) fail("PUBLIC_AGENT_ARTIFACT_FILE_MISSING", path);
  const snapshot = readPinnedPublicAgentSourceSnapshot(path, null,
    "PUBLIC_AGENT_ARTIFACT_SNAPSHOT_MISMATCH");
  const text = snapshot.bytes.toString("utf8");
  if (!text.endsWith("\n")) fail("PUBLIC_AGENT_ARTIFACT_JSONL_NOT_TERMINATED", path);
  return text.trim().split("\n").map((line, index) => {
    try { return JSON.parse(line); }
    catch { fail("PUBLIC_AGENT_ARTIFACT_JSONL_INVALID", `${path}:${index + 1}`); }
  });
}

function compare(label, actual, expected) {
  // A full public-agent projection contains thousands of independently sealed
  // records.  Comparing the whole array in one canonicalization needlessly
  // crosses the strict canonical work budget after canonical hardening.  Keep
  // the same exact comparison, but replay it record-by-record so the bound is
  // enforced per already-sealed object instead of being weakened globally.
  if (Array.isArray(actual) || Array.isArray(expected)) {
    if (!Array.isArray(actual) || !Array.isArray(expected)
      || actual.length !== expected.length) {
      fail("PUBLIC_AGENT_ARTIFACT_EXACT_MISMATCH", `${label}:length`);
    }
    for (let index = 0; index < actual.length; index += 1) {
      if (!same(actual[index], expected[index])) {
        fail("PUBLIC_AGENT_ARTIFACT_EXACT_MISMATCH", `${label}:${index}`);
      }
    }
    return;
  }
  if (label === "acquisition-manifest.json") {
    if (canonicalizeStrictBoundedArtifact(actual)
      !== canonicalizeStrictBoundedArtifact(expected)) {
      fail("PUBLIC_AGENT_ARTIFACT_EXACT_MISMATCH", label);
    }
    return;
  }
  if (!same(actual, expected)) fail("PUBLIC_AGENT_ARTIFACT_EXACT_MISMATCH", label);
}

export async function verifyPublicAgentArtifactsAgainstSource({ sourceDirectory,
  artifactDirectory }) {
  try {
    if (typeof sourceDirectory !== "string" || typeof artifactDirectory !== "string") {
      fail("PUBLIC_AGENT_ARTIFACT_DIRECTORY_REQUIRED");
    }
    const sourceRoot = resolve(sourceDirectory);
    const artifactRoot = resolve(artifactDirectory);
    if (sourceRoot !== join(artifactRoot, "source") || dirname(sourceRoot) !== artifactRoot) {
      fail("PUBLIC_AGENT_SOURCE_DIRECTORY_NOT_ARTIFACT_CHILD");
    }
    preflightSourceShape(sourceRoot);
    const storedManifest = readJson(join(artifactRoot, "acquisition-manifest.json"));
    const derived = await rederive({ sourceDirectory: sourceRoot, artifactDirectory: artifactRoot,
      generatedAt: storedManifest.generatedAt });
    compare("acquisition-manifest.json", storedManifest, derived.manifest);
    compare("normalized-computer-agent-arena.jsonl",
      readJsonl(join(artifactRoot, "normalized-computer-agent-arena.jsonl")),
      derived.recordsBySource.caa);
    compare("normalized-tracelab.jsonl",
      readJsonl(join(artifactRoot, "normalized-tracelab.jsonl")),
      derived.recordsBySource.trace);
    compare("normalized-openhands-feedback.jsonl",
      readJsonl(join(artifactRoot, "normalized-openhands-feedback.jsonl")),
      derived.recordsBySource.openhands);
    compare("normalized-nebius-openhands.jsonl",
      readJsonl(join(artifactRoot, "normalized-nebius-openhands.jsonl")),
      derived.recordsBySource.nebius);
    compare("normalized-records.jsonl",
      readJsonl(join(artifactRoot, "normalized-records.jsonl")), derived.records);
    compare("effect-summary.json", readJson(join(artifactRoot, "effect-summary.json")),
      derived.summary);
    const verifiedSourceObjectHashes = derived.manifest.sources.flatMap((source) =>
      source.acquiredObjects.map((object) => ({ datasetId: source.id, path: object.path,
        sizeBytes: object.sizeBytes, sha256: object.sha256 })))
      .sort((left, right) => left.datasetId.localeCompare(right.datasetId)
        || left.path.localeCompare(right.path));
    if (verifiedSourceObjectHashes.some((object) => !SHA256.test(object.sha256))) {
      fail("PUBLIC_AGENT_VERIFIED_SOURCE_HASH_INVALID");
    }
    const body = {
      schema: PUBLIC_AGENT_ARTIFACT_SCHEMAS.verification,
      schemaVersion: "2.0.0",
      status: "FULL_SOURCE_REPRODUCED",
      derivation: "FULL_SOURCE_REDERIVED",
      manifestHash: derived.manifest.manifestHash,
      recordSetHash: derived.recordSetProof.recordSetHash,
      summaryHash: derived.summary.summaryHash,
      records: derived.records.length,
      counts: derived.recordSetProof.counts,
      verifiedSourceObjectHashes,
      scope: {
        caa: "complete-structured-trajectory-file-no-images",
        traceLab: "complete-sanitized-jsonl-gzip",
        openHandsFeedback: "complete-275-logical-rows-via-api-no-parquet-inclusion-proof",
        nebius: "case-control-200-logical-rows-via-api-no-parquet-inclusion-proof",
        generatedAt: "SELF_ASSERTED_LOCAL_TIME_NOT_EXTERNALLY_VERIFIED",
        provenance: "BYTE_IDENTITY_REVISION_BINDING_AND_LICENSE_DECLARATION_REPORTED_SEPARATELY",
      },
      boundary: { economicLossRows: 0, pricingEligibleRows: 0,
        permitsPrice: false, permitsGuarantee: false, permitsSettle: false },
    };
    const attestation = Object.freeze({ ...body,
      verificationHash: publicAgentDigest(body, PUBLIC_AGENT_ARTIFACT_SCHEMAS.verification) });
    return Object.freeze({ ok: true, status: body.status, attestation,
      manifest: derived.manifest, records: Object.freeze(derived.records),
      summary: derived.summary, recordSetProof: derived.recordSetProof });
  } catch (error) {
    return Object.freeze({ ok: false, status: "FULL_SOURCE_REPRODUCTION_FAILED",
      error: error instanceof Error ? error.message : String(error) });
  }
}
