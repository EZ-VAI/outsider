#!/usr/bin/env node

import { createHash, randomBytes } from "node:crypto";
import {
  closeSync, constants, fchmodSync, fsyncSync, fstatSync, linkSync, lstatSync,
  openSync, readFileSync, realpathSync, unlinkSync, writeFileSync,
} from "node:fs";
import path from "node:path";
import { canonicalizeStrict } from "../src/canonical.js";

const SCHEMA = "outsider/exact-artifact-lineage-supersession/v1";
const TIME_FIELDS = Object.freeze([
  "generatedAt", "asOf", "frozenAt", "createdAt", "indexedAt",
]);
const sha256 = (bytes) => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
const tagged = (domain, value) => sha256(Buffer.from(
  `${domain}\0${canonicalizeStrict(value)}`, "utf8"));
const fail = (code, detail = "") => {
  throw new Error(`EXACT_ARTIFACT_LINEAGE_${code}${detail ? `:${detail}` : ""}`);
};

function sameIdentity(left, right) {
  return left.dev === right.dev && left.ino === right.ino
    && left.mode === right.mode && left.size === right.size
    && left.mtimeNs === right.mtimeNs && left.ctimeNs === right.ctimeNs;
}

function safeRepositoryFile(repositoryPath) {
  if (typeof repositoryPath !== "string" || repositoryPath.includes("\\")
    || repositoryPath.includes("\0") || path.isAbsolute(repositoryPath)
    || repositoryPath.split("/").includes("..")) {
    fail("PATH_INVALID", repositoryPath);
  }
  const root = realpathSync(process.cwd());
  let cursor = root;
  for (const component of repositoryPath.split("/").slice(0, -1)) {
    cursor = path.join(cursor, component);
    const stat = lstatSync(cursor, { bigint: true });
    if (stat.isSymbolicLink() || !stat.isDirectory()) fail("ANCESTOR_UNSAFE", cursor);
  }
  const target = path.join(root, repositoryPath);
  const initial = lstatSync(target, { bigint: true });
  if (initial.isSymbolicLink() || !initial.isFile()
    || (initial.mode & 0o777n) !== 0o600n) fail("FILE_UNSAFE", repositoryPath);
  const descriptor = openSync(target, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const before = fstatSync(descriptor, { bigint: true });
    const bytes = readFileSync(descriptor);
    const after = fstatSync(descriptor, { bigint: true });
    const finalPath = lstatSync(target, { bigint: true });
    if (!sameIdentity(initial, before) || !sameIdentity(before, after)
      || !sameIdentity(after, finalPath) || BigInt(bytes.length) !== before.size) {
      fail("FILE_CHANGED_DURING_READ", repositoryPath);
    }
    return { target, bytes };
  } finally { closeSync(descriptor); }
}

function parseArtifactPath(repositoryPath) {
  const match = /^artifacts\/([a-z0-9][a-z0-9-]+)\/(final-v([1-9][0-9]*))\/([^/]+\.json)$/u
    .exec(repositoryPath);
  if (!match) fail("ARTIFACT_PATH_SHAPE_INVALID", repositoryPath);
  return { family: match[1], release: match[2], version: Number(match[3]), file: match[4] };
}

function readArtifact(repositoryPath, semanticHashField) {
  if (!/^[A-Za-z][A-Za-z0-9]*Hash$/u.test(semanticHashField)) {
    fail("SEMANTIC_HASH_FIELD_INVALID", semanticHashField);
  }
  const identity = parseArtifactPath(repositoryPath);
  const { target, bytes } = safeRepositoryFile(repositoryPath);
  let artifact;
  try { artifact = JSON.parse(bytes.toString("utf8")); }
  catch { fail("ARTIFACT_JSON_INVALID", repositoryPath); }
  if (!/^sha256:[a-f0-9]{64}$/u.test(artifact?.[semanticHashField])) {
    fail("ARTIFACT_SEMANTIC_HASH_INVALID", repositoryPath);
  }
  let declaredTime = { field: null, value: null };
  for (const field of TIME_FIELDS) {
    if (artifact[field] == null) continue;
    const value = artifact[field];
    if (typeof value !== "string" || !Number.isFinite(Date.parse(value))
      || new Date(value).toISOString() !== value) {
      fail("ARTIFACT_DECLARED_TIME_INVALID", `${repositoryPath}:${field}`);
    }
    declaredTime = { field, value };
    break;
  }
  return { ...identity, repositoryPath, semanticHashField,
    semanticHash: artifact[semanticHashField], fileSha256: sha256(bytes),
    fileBytes: bytes.length, declaredTime, target };
}

function parseArgs(argv) {
  if (argv.length === 1 && argv[0] === "--help") return { help: true };
  if (argv[0] !== "build") fail("USAGE");
  const options = {};
  for (let index = 1; index < argv.length; index += 2) {
    const key = argv[index], value = argv[index + 1];
    if (!key?.startsWith("--") || !value || value.startsWith("--")
      || Object.hasOwn(options, key)) fail("USAGE");
    options[key] = value;
  }
  const expected = ["--out", "--reason", "--source", "--source-semantic-field",
    "--target", "--target-semantic-field"];
  if (JSON.stringify(Object.keys(options).sort()) !== JSON.stringify(expected)) fail("USAGE");
  return {
    source: options["--source"], sourceSemanticHashField: options["--source-semantic-field"],
    target: options["--target"], targetSemanticHashField: options["--target-semantic-field"],
    reason: options["--reason"], out: options["--out"],
  };
}

function publishExclusive(repositoryPath, bytes) {
  const sourceIdentity = parseArtifactPath(repositoryPath.replace(/\/SUPERSEDED\.json$/u,
    "/placeholder.json"));
  if (path.basename(repositoryPath) !== "SUPERSEDED.json") fail("OUTPUT_NAME_INVALID");
  const root = realpathSync(process.cwd());
  const parent = path.join(root, "artifacts", sourceIdentity.family, sourceIdentity.release);
  if (path.resolve(repositoryPath) !== path.join(parent, "SUPERSEDED.json")) {
    fail("OUTPUT_PATH_INVALID");
  }
  const parentStat = lstatSync(parent, { bigint: true });
  if (parentStat.isSymbolicLink() || !parentStat.isDirectory()
    || (parentStat.mode & 0o777n) !== 0o700n) fail("OUTPUT_PARENT_UNSAFE");
  const target = path.join(parent, "SUPERSEDED.json");
  try { lstatSync(target); fail("OUTPUT_EXISTS", repositoryPath); }
  catch (error) { if (error?.code !== "ENOENT") throw error; }
  const temporary = path.join(parent,
    `.SUPERSEDED.${process.pid}.${randomBytes(12).toString("hex")}.tmp`);
  let descriptor;
  try {
    descriptor = openSync(temporary, constants.O_CREAT | constants.O_EXCL
      | constants.O_WRONLY | (constants.O_NOFOLLOW ?? 0), 0o600);
    fchmodSync(descriptor, 0o600);
    writeFileSync(descriptor, bytes);
    fsyncSync(descriptor);
    closeSync(descriptor); descriptor = null;
    linkSync(temporary, target);
    unlinkSync(temporary);
  } finally {
    if (descriptor !== null && descriptor !== undefined) closeSync(descriptor);
    try { unlinkSync(temporary); } catch (error) { if (error?.code !== "ENOENT") throw error; }
  }
  return target;
}

function usage() {
  return "node scripts/exact-artifact-lineage-supersession.mjs build --source <artifact> --source-semantic-field <field> --target <artifact> --target-semantic-field <field> --reason <code> --out <source-release/SUPERSEDED.json>";
}

try {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) { process.stdout.write(`${usage()}\n`); process.exit(0); }
  const source = readArtifact(options.source, options.sourceSemanticHashField);
  const target = readArtifact(options.target, options.targetSemanticHashField);
  const expectedOut = `${path.posix.dirname(source.repositoryPath)}/SUPERSEDED.json`;
  if (options.out !== expectedOut) fail("OUTPUT_NOT_SOURCE_RELEASE_MARKER", options.out);
  if (target.version <= source.version) fail("VERSION_ROLLBACK");
  if (!/^[A-Z0-9_]{8,200}$/u.test(options.reason)) fail("REASON_INVALID");
  const temporalOrderingStatus = source.declaredTime.value !== null
      && target.declaredTime.value !== null
    ? "DECLARED_ARTIFACT_TIMES_NONDECREASING_LOCAL_BYTES_ONLY"
    : "DECLARED_ARTIFACT_TIME_UNAVAILABLE_NO_TEMPORAL_AUTHENTICITY_CLAIM";
  if (source.declaredTime.value !== null && target.declaredTime.value !== null
    && Date.parse(target.declaredTime.value) < Date.parse(source.declaredTime.value)) {
    fail("DECLARED_TIME_ROLLBACK");
  }
  const body = {
    schema: SCHEMA,
    schemaVersion: "1.0.0",
    status: "SUPERSEDED_EXACT_BYTES_PRESERVED",
    lineageScope: source.family === target.family
      ? "SAME_DECLARED_FAMILY_EXACT_SUCCESSOR"
      : "DECLARATION_AUTHORIZED_EXACT_CROSS_FAMILY_SUCCESSOR",
    supersededFamily: source.family,
    supersededRelease: source.release,
    supersededArtifactPath: source.repositoryPath,
    supersededSemanticHashField: source.semanticHashField,
    supersededArtifactHash: source.semanticHash,
    supersededArtifactFileHash: source.fileSha256,
    supersededArtifactFileBytes: source.fileBytes,
    supersededArtifactBytesPreserved: true,
    successorFamily: target.family,
    supersededByRelease: target.release,
    currentCanonicalPath: target.repositoryPath,
    currentSemanticHashField: target.semanticHashField,
    currentArtifactHash: target.semanticHash,
    currentArtifactFileHash: target.fileSha256,
    currentArtifactFileBytes: target.fileBytes,
    previousDeclaredTimeField: source.declaredTime.field,
    previousDeclaredAt: source.declaredTime.value,
    currentDeclaredTimeField: target.declaredTime.field,
    currentDeclaredAt: target.declaredTime.value,
    temporalOrderingStatus,
    reason: options.reason,
    selectionAuthority: "CODE_FIXED_EXACT_BYTE_LINEAGE_ROUTE_NOT_EVIDENCE_CURRENTNESS",
    sourceArtifactsReverifiedByMarker: false,
    sourceTruthEstablishedByMarker: false,
    closureCredit: 0,
    causalExperienceUnits: 0,
    trainingAdmission: false,
    pricingAdmission: false,
    operationalAuthorityGranted: false,
  };
  const marker = { ...body, markerHash: tagged(SCHEMA, body) };
  const bytes = Buffer.from(`${JSON.stringify(marker, null, 2)}\n`, "utf8");
  const targetPath = publishExclusive(options.out, bytes);
  process.stdout.write(`${JSON.stringify({ ok: true, out: path.relative(process.cwd(), targetPath),
    markerHash: marker.markerHash, fileSha256: sha256(bytes), fileBytes: bytes.length,
    source: source.repositoryPath, target: target.repositoryPath,
    sourceArtifactsReverifiedByMarker: false, sourceTruthEstablishedByMarker: false,
    trainingAdmission: false, pricingAdmission: false,
    operationalAuthorityGranted: false }, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n${usage()}\n`);
  process.exitCode = 1;
}
