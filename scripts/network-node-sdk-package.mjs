#!/usr/bin/env node

import { createHash } from "node:crypto";
import {
  chmodSync,
  constants as fsConstants,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = path.resolve(HERE, "..");

export const NETWORK_NODE_SDK_PACKAGE_PROFILE_FILE =
  "network-node-sdk-package-files.json";
export const NETWORK_NODE_SDK_PACKAGE_MANIFEST_FILE =
  "outsider-node-sdk-package-manifest.json";

const PACKAGE_NAME = "@outsider/network-node-sdk";
const PACKAGE_VERSION = "0.1.0-research-preview.0";
const PACKAGE_DESCRIPTION =
  "Local research-preview compatibility SDK for the Outsider quarantine network";
const ROOT_INDEX_SOURCE =
  "export * from \"./src/outsider-network-node-sdk.js\";\n";

const REVIEWED_SOURCE_FILES = Object.freeze([
  "src/canonical.js",
  "src/outsider-network-intake.js",
  "src/outsider-network-node-client.js",
  "src/outsider-network-node-sdk.js",
  "src/outsider-provider-pattern-registry.js",
]);

const REVIEWED_ENTRYPOINTS = Object.freeze([
  "src/outsider-network-intake.js",
  "src/outsider-network-node-client.js",
  "src/outsider-network-node-sdk.js",
]);

const REVIEWED_EXPORTS = Object.freeze({
  ".": "./index.js",
  "./sdk": "./src/outsider-network-node-sdk.js",
  "./client": "./src/outsider-network-node-client.js",
  "./intake": "./src/outsider-network-intake.js",
});

const REVIEWED_STATIC_FILES = Object.freeze([
  Object.freeze({ source: "LICENSE", target: "LICENSE" }),
  Object.freeze({
    source: "docs/NETWORK-NODE-SDK-RESEARCH-PREVIEW.md",
    target: "README.md",
  }),
]);

const REVIEWED_FORBIDDEN_PATTERNS = Object.freeze([
  "^artifacts/",
  "^artifact-index/",
  "^test/",
  "^scripts/",
  "^docs/",
  "^examples/",
  "^integrations/",
  "^plugins/",
  "^node_modules/",
  "^\\.outsider/",
  "\\.(?:csv|jsonl|parquet|pdf|tfrecord|zip|tar|tgz|xlsx|xls)$",
]);

export const NETWORK_NODE_SDK_PACKAGE_BOUNDARY = Object.freeze({
  releaseClass: "LOCAL_RESEARCH_PREVIEW_CANDIDATE_ONLY",
  status: "HOLD",
  decision: "HOLD",
  disposition: "QUARANTINED",
  publicDeploymentReady: false,
  npmPublishAuthorized: false,
  defaultFetchAvailable: false,
  sendRequiresInjectedFetch: true,
  persistencePerformed: false,
  transportKeyPersistencePerformed: false,
  authority: "NONE",
  authorityGrants: 0,
  actionReady: false,
  executable: false,
  automaticTraining: false,
  trainingRows: 0,
  causalExperienceUnits: 0,
  permitsPricing: false,
  permitsGuarantee: false,
  permitsSettlement: false,
});

const PACKAGE_FILES = Object.freeze([
  "LICENSE",
  "README.md",
  "index.js",
  NETWORK_NODE_SDK_PACKAGE_PROFILE_FILE,
  NETWORK_NODE_SDK_PACKAGE_MANIFEST_FILE,
  ...REVIEWED_SOURCE_FILES,
].sort());

function fail(code, detail = null) {
  throw new Error(detail === null ? code : `${code}:${detail}`);
}

function plain(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;
}

function exactKeys(value, keys) {
  return plain(value) && JSON.stringify(Object.keys(value).sort())
    === JSON.stringify([...keys].sort());
}

function same(left, right) {
  return canonical(left) === canonical(right);
}

function canonical(value) {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "number" && Number.isSafeInteger(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => canonical(item)).join(",")}]`;
  if (!plain(value)) fail("NETWORK_NODE_SDK_PACKAGE_CANONICAL_VALUE_INVALID");
  return `{${Object.keys(value).sort().map((key) =>
    `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
}

function domainHash(domain, value) {
  return `sha256:${createHash("sha256")
    .update(`outsider:network-node-sdk-package:${domain}:v1\0${canonical(value)}`)
    .digest("hex")}`;
}

function fileHash(file) {
  return `sha256:${createHash("sha256").update(readFileSync(file)).digest("hex")}`;
}

function denseStrings(value, code, { sorted = true } = {}) {
  if (!Array.isArray(value) || value.length === 0
    || value.some((item) => typeof item !== "string" || item.length === 0)
    || new Set(value).size !== value.length
    || (sorted && JSON.stringify(value) !== JSON.stringify([...value].sort()))) fail(code);
  return value;
}

export function assertNetworkNodeSdkPackageMemberPath(value) {
  if (typeof value !== "string" || value.length === 0 || value === "."
    || value.includes("\\") || value.includes("\0") || path.posix.isAbsolute(value)
    || value.startsWith("../") || path.posix.normalize(value) !== value
    || value.split("/").some((part) => part === "" || part === "." || part === "..")) {
    fail("NETWORK_NODE_SDK_PACKAGE_MEMBER_PATH_INVALID", String(value));
  }
  return value;
}

function readExactJson(file, code) {
  const source = readFileSync(file, "utf8");
  let value;
  try { value = JSON.parse(source); }
  catch (error) { fail(`${code}_JSON_INVALID`, error?.message ?? String(error)); }
  if (`${JSON.stringify(value, null, 2)}\n` !== source) fail(`${code}_BYTES_NOT_CANONICAL_PRETTY_JSON`);
  return value;
}

function assertDirectory(value, code) {
  const resolved = path.resolve(value);
  if (!existsSync(resolved)) fail(`${code}_MISSING`, resolved);
  const stat = lstatSync(resolved);
  if (!stat.isDirectory() || stat.isSymbolicLink()) fail(`${code}_INVALID`, resolved);
  return resolved;
}

function sourceMember(root, relative) {
  assertNetworkNodeSdkPackageMemberPath(relative);
  let current = root;
  const parts = relative.split("/");
  for (let index = 0; index < parts.length; index += 1) {
    current = path.join(current, parts[index]);
    if (!existsSync(current)) fail("NETWORK_NODE_SDK_PACKAGE_SOURCE_MISSING", relative);
    const stat = lstatSync(current);
    if (stat.isSymbolicLink()) fail("NETWORK_NODE_SDK_PACKAGE_SOURCE_SYMLINK_REFUSED", relative);
    if (index < parts.length - 1 && !stat.isDirectory()) {
      fail("NETWORK_NODE_SDK_PACKAGE_SOURCE_ANCESTOR_INVALID", relative);
    }
    if (index === parts.length - 1 && !stat.isFile()) {
      fail("NETWORK_NODE_SDK_PACKAGE_SOURCE_FILE_INVALID", relative);
    }
  }
  return current;
}

function targetDirectory(root, relativeDirectory) {
  if (relativeDirectory === ".") return root;
  assertNetworkNodeSdkPackageMemberPath(`${relativeDirectory}/placeholder`);
  let current = root;
  for (const part of relativeDirectory.split("/")) {
    current = path.join(current, part);
    if (!existsSync(current)) mkdirSync(current, { mode: 0o755 });
    const stat = lstatSync(current);
    if (!stat.isDirectory() || stat.isSymbolicLink()) {
      fail("NETWORK_NODE_SDK_PACKAGE_TARGET_ANCESTOR_INVALID", relativeDirectory);
    }
  }
  return current;
}

function copyExclusive(sourceRoot, targetRoot, sourceRelative, targetRelative = sourceRelative) {
  const source = sourceMember(sourceRoot, sourceRelative);
  assertNetworkNodeSdkPackageMemberPath(targetRelative);
  targetDirectory(targetRoot, path.posix.dirname(targetRelative));
  const target = path.join(targetRoot, ...targetRelative.split("/"));
  try { copyFileSync(source, target, fsConstants.COPYFILE_EXCL); }
  catch (error) { fail("NETWORK_NODE_SDK_PACKAGE_COPY_NO_CLOBBER", error?.code ?? targetRelative); }
  chmodSync(target, 0o644);
}

function writeExclusive(file, bytes) {
  try { writeFileSync(file, bytes, { flag: "wx", mode: 0o644 }); }
  catch (error) { fail("NETWORK_NODE_SDK_PACKAGE_WRITE_NO_CLOBBER", error?.code ?? file); }
}

export function listNetworkNodeSdkPackageFiles(root, directory = root) {
  const base = path.resolve(root);
  const selected = path.resolve(directory);
  const output = [];
  for (const name of readdirSync(selected).sort()) {
    const file = path.join(selected, name);
    const relative = path.relative(base, file).split(path.sep).join("/");
    const stat = lstatSync(file);
    if (stat.isSymbolicLink()) fail("NETWORK_NODE_SDK_PACKAGE_SYMLINK_REFUSED", relative);
    if (stat.isDirectory()) output.push(...listNetworkNodeSdkPackageFiles(base, file));
    else if (stat.isFile()) output.push(relative);
    else fail("NETWORK_NODE_SDK_PACKAGE_MEMBER_TYPE_INVALID", relative);
  }
  return output;
}

function importSpecifiers(source) {
  const found = new Set();
  const patterns = [
    /(?:^|\n)\s*(?:import|export)\s+(?:[^;"'`]*?\s+from\s+)?["']([^"']+)["']/gu,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/gu,
    /\bnew\s+URL\s*\(\s*["']([^"']+)["']\s*,\s*import\.meta\.url\s*\)/gu,
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) found.add(match[1]);
  }
  return [...found];
}

function resolveRelativeImport(sourceFile, specifier, root) {
  const bare = specifier.split(/[?#]/u, 1)[0];
  const base = path.resolve(path.dirname(sourceFile), bare);
  const relativeBase = path.relative(root, base);
  if (relativeBase === "" || relativeBase.startsWith("..") || path.isAbsolute(relativeBase)) {
    fail("NETWORK_NODE_SDK_PACKAGE_IMPORT_ESCAPE", specifier);
  }
  const candidates = [base, `${base}.js`, `${base}.mjs`, `${base}.cjs`, `${base}.json`,
    path.join(base, "index.js"), path.join(base, "index.mjs")];
  for (const candidate of candidates) {
    if (!existsSync(candidate)) continue;
    const relative = path.relative(root, candidate).split(path.sep).join("/");
    sourceMember(root, relative);
    return candidate;
  }
  fail("NETWORK_NODE_SDK_PACKAGE_RELATIVE_IMPORT_NOT_FOUND", specifier);
}

export function networkNodeSdkDependencyFiles({ sourceRoot = DEFAULT_ROOT,
  entrypoints = REVIEWED_ENTRYPOINTS } = {}) {
  const root = assertDirectory(sourceRoot, "NETWORK_NODE_SDK_PACKAGE_SOURCE_ROOT");
  const queue = entrypoints.map((item) => sourceMember(root, item));
  const visited = new Set();
  while (queue.length > 0) {
    const file = queue.shift();
    if (visited.has(file)) continue;
    visited.add(file);
    const source = readFileSync(file, "utf8");
    for (const specifier of importSpecifiers(source)) {
      if (specifier.startsWith("node:")) continue;
      if (!specifier.startsWith(".")) {
        fail("NETWORK_NODE_SDK_PACKAGE_EXTERNAL_DEPENDENCY_FORBIDDEN", specifier);
      }
      const dependency = resolveRelativeImport(file, specifier, root);
      if (!visited.has(dependency)) queue.push(dependency);
    }
  }
  return [...visited].map((file) => path.relative(root, file).split(path.sep).join("/"))
    .sort();
}

function assertProfile(profile) {
  if (!exactKeys(profile, ["schema", "schemaVersion", "package", "boundary",
    "entrypoints", "sourceFiles", "exports", "staticFiles", "forbiddenPathPatterns"])
    || profile.schema !== "outsider/network-node-sdk-package-profile/v1"
    || profile.schemaVersion !== "1.0.0"
    || !exactKeys(profile.package, ["name", "version"])
    || profile.package.name !== PACKAGE_NAME || profile.package.version !== PACKAGE_VERSION
    || !same(profile.boundary, NETWORK_NODE_SDK_PACKAGE_BOUNDARY)
    || !same(profile.entrypoints, REVIEWED_ENTRYPOINTS)
    || !same(profile.sourceFiles, REVIEWED_SOURCE_FILES)
    || !same(profile.exports, REVIEWED_EXPORTS)
    || !same(profile.staticFiles, REVIEWED_STATIC_FILES)
    || !same(profile.forbiddenPathPatterns, REVIEWED_FORBIDDEN_PATTERNS)) {
    fail("NETWORK_NODE_SDK_PACKAGE_PROFILE_INVALID");
  }
  denseStrings(profile.entrypoints, "NETWORK_NODE_SDK_PACKAGE_ENTRYPOINTS_INVALID");
  denseStrings(profile.sourceFiles, "NETWORK_NODE_SDK_PACKAGE_SOURCE_FILES_INVALID");
  denseStrings(profile.forbiddenPathPatterns,
    "NETWORK_NODE_SDK_PACKAGE_FORBIDDEN_PATTERNS_INVALID", { sorted: false });
  for (const relative of [...profile.entrypoints, ...profile.sourceFiles]) {
    assertNetworkNodeSdkPackageMemberPath(relative);
  }
  for (const record of profile.staticFiles) {
    if (!exactKeys(record, ["source", "target"])) {
      fail("NETWORK_NODE_SDK_PACKAGE_STATIC_FILE_INVALID");
    }
    assertNetworkNodeSdkPackageMemberPath(record.source);
    assertNetworkNodeSdkPackageMemberPath(record.target);
  }
  for (const [key, value] of Object.entries(profile.exports)) {
    if (typeof key !== "string" || typeof value !== "string" || !value.startsWith("./")) {
      fail("NETWORK_NODE_SDK_PACKAGE_EXPORT_INVALID");
    }
    assertNetworkNodeSdkPackageMemberPath(value.slice(2));
  }
  for (const pattern of profile.forbiddenPathPatterns) {
    try { new RegExp(pattern, "iu"); }
    catch { fail("NETWORK_NODE_SDK_PACKAGE_FORBIDDEN_PATTERN_INVALID", pattern); }
  }
  return profile;
}

export function readNetworkNodeSdkPackageProfile(sourceRoot = DEFAULT_ROOT) {
  const root = assertDirectory(sourceRoot, "NETWORK_NODE_SDK_PACKAGE_SOURCE_ROOT");
  const file = sourceMember(root, NETWORK_NODE_SDK_PACKAGE_PROFILE_FILE);
  return assertProfile(readExactJson(file, "NETWORK_NODE_SDK_PACKAGE_PROFILE"));
}

function packageJson(profile) {
  return {
    name: profile.package.name,
    version: profile.package.version,
    private: true,
    description: PACKAGE_DESCRIPTION,
    license: "Apache-2.0",
    type: "module",
    main: "./index.js",
    exports: profile.exports,
    files: PACKAGE_FILES,
    engines: { node: ">=20" },
    outsiderBoundary: profile.boundary,
  };
}

function assertForbidden(paths, profile) {
  const patterns = profile.forbiddenPathPatterns.map((item) => new RegExp(item, "iu"));
  for (const relative of paths) {
    assertNetworkNodeSdkPackageMemberPath(relative);
    if (patterns.some((pattern) => pattern.test(relative))) {
      fail("NETWORK_NODE_SDK_PACKAGE_FORBIDDEN_MEMBER", relative);
    }
  }
}

function manifestMember(root, relative) {
  const file = sourceMember(root, relative);
  const stat = lstatSync(file);
  return { path: relative, bytes: stat.size, sha256: fileHash(file) };
}

function assertManifestRecord(record) {
  if (!exactKeys(record, ["path", "bytes", "sha256"])) {
    fail("NETWORK_NODE_SDK_PACKAGE_MANIFEST_MEMBER_INVALID");
  }
  assertNetworkNodeSdkPackageMemberPath(record.path);
  if (!Number.isSafeInteger(record.bytes) || record.bytes < 0
    || typeof record.sha256 !== "string" || !/^sha256:[a-f0-9]{64}$/u.test(record.sha256)) {
    fail("NETWORK_NODE_SDK_PACKAGE_MANIFEST_MEMBER_INVALID", record.path);
  }
  return record;
}

function manifestBody({ profile, profileHash, members }) {
  return {
    schema: "outsider/network-node-sdk-package-manifest/v1",
    schemaVersion: "1.0.0",
    package: { name: profile.package.name, version: profile.package.version, private: true },
    profileFile: NETWORK_NODE_SDK_PACKAGE_PROFILE_FILE,
    profileFileHash: profileHash,
    boundary: profile.boundary,
    exports: profile.exports,
    dependencyClosure: profile.sourceFiles,
    memberCount: members.length,
    members,
    exclusions: {
      stage05PublicRuntimeProfileIncluded: false,
      artifactsIncluded: false,
      artifactIndexIncluded: false,
      testsIncluded: false,
      rawResearchIncluded: false,
      npmRuntimeDependenciesIncluded: false,
    },
  };
}

export function verifyNetworkNodeSdkPackage({ packageRoot, expectedManifestHash = null } = {}) {
  const root = assertDirectory(packageRoot, "NETWORK_NODE_SDK_PACKAGE_ROOT");
  const actual = listNetworkNodeSdkPackageFiles(root).sort();
  if (!actual.includes(NETWORK_NODE_SDK_PACKAGE_MANIFEST_FILE)) {
    fail("NETWORK_NODE_SDK_PACKAGE_MANIFEST_MISSING");
  }
  const manifest = readExactJson(path.join(root, NETWORK_NODE_SDK_PACKAGE_MANIFEST_FILE),
    "NETWORK_NODE_SDK_PACKAGE_MANIFEST");
  if (!exactKeys(manifest, ["schema", "schemaVersion", "package", "profileFile",
    "profileFileHash", "boundary", "exports", "dependencyClosure", "memberCount",
    "members", "exclusions", "manifestHash"])) {
    fail("NETWORK_NODE_SDK_PACKAGE_MANIFEST_INVALID");
  }
  const { manifestHash, ...body } = manifest;
  if (manifestHash !== domainHash("manifest", body)
    || (expectedManifestHash !== null && manifestHash !== expectedManifestHash)) {
    fail("NETWORK_NODE_SDK_PACKAGE_MANIFEST_HASH_INVALID");
  }
  if (body.schema !== "outsider/network-node-sdk-package-manifest/v1"
    || body.schemaVersion !== "1.0.0"
    || !same(body.package, { name: PACKAGE_NAME, version: PACKAGE_VERSION, private: true })
    || body.profileFile !== NETWORK_NODE_SDK_PACKAGE_PROFILE_FILE
    || typeof body.profileFileHash !== "string"
    || !/^sha256:[a-f0-9]{64}$/u.test(body.profileFileHash)
    || !same(body.boundary, NETWORK_NODE_SDK_PACKAGE_BOUNDARY)
    || !same(body.exports, REVIEWED_EXPORTS)
    || !same(body.dependencyClosure, REVIEWED_SOURCE_FILES)
    || !same(body.exclusions, {
      stage05PublicRuntimeProfileIncluded: false,
      artifactsIncluded: false,
      artifactIndexIncluded: false,
      testsIncluded: false,
      rawResearchIncluded: false,
      npmRuntimeDependenciesIncluded: false,
    })
    || !Array.isArray(body.members) || body.memberCount !== body.members.length) {
    fail("NETWORK_NODE_SDK_PACKAGE_MANIFEST_BOUNDARY_INVALID");
  }
  const records = body.members.map(assertManifestRecord);
  const declared = records.map((record) => record.path);
  if (new Set(declared).size !== declared.length
    || JSON.stringify(declared) !== JSON.stringify([...declared].sort())) {
    fail("NETWORK_NODE_SDK_PACKAGE_MANIFEST_MEMBER_SET_INVALID");
  }
  const expectedActual = [...declared, NETWORK_NODE_SDK_PACKAGE_MANIFEST_FILE].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expectedActual)) {
    fail("NETWORK_NODE_SDK_PACKAGE_ACTUAL_MEMBER_SET_MISMATCH");
  }
  for (const record of records) {
    const file = sourceMember(root, record.path);
    const stat = lstatSync(file);
    if (stat.size !== record.bytes || fileHash(file) !== record.sha256) {
      fail("NETWORK_NODE_SDK_PACKAGE_MEMBER_BYTES_INVALID", record.path);
    }
  }
  const profile = readNetworkNodeSdkPackageProfile(root);
  if (fileHash(path.join(root, NETWORK_NODE_SDK_PACKAGE_PROFILE_FILE))
    !== body.profileFileHash) fail("NETWORK_NODE_SDK_PACKAGE_PROFILE_HASH_INVALID");
  const expectedPackage = packageJson(profile);
  const actualPackage = readExactJson(path.join(root, "package.json"),
    "NETWORK_NODE_SDK_PACKAGE_JSON");
  if (!same(actualPackage, expectedPackage)) fail("NETWORK_NODE_SDK_PACKAGE_JSON_INVALID");
  if (readFileSync(path.join(root, "index.js"), "utf8") !== ROOT_INDEX_SOURCE) {
    fail("NETWORK_NODE_SDK_PACKAGE_INDEX_INVALID");
  }
  const closure = networkNodeSdkDependencyFiles({ sourceRoot: root,
    entrypoints: profile.entrypoints });
  if (!same(closure, REVIEWED_SOURCE_FILES)) {
    fail("NETWORK_NODE_SDK_PACKAGE_DEPENDENCY_CLOSURE_INVALID");
  }
  assertForbidden(actual, profile);
  return Object.freeze({
    ok: true,
    packageRoot: root,
    package: Object.freeze({ ...body.package }),
    boundary: Object.freeze({ ...body.boundary }),
    manifestHash,
    profileFileHash: body.profileFileHash,
    memberCount: body.memberCount,
    dependencyClosure: Object.freeze([...body.dependencyClosure]),
  });
}

export function stageNetworkNodeSdkPackage({ sourceRoot = DEFAULT_ROOT, targetRoot } = {}) {
  if (typeof targetRoot !== "string" || targetRoot.length === 0) {
    fail("NETWORK_NODE_SDK_PACKAGE_TARGET_REQUIRED");
  }
  const source = assertDirectory(sourceRoot, "NETWORK_NODE_SDK_PACKAGE_SOURCE_ROOT");
  const target = path.resolve(targetRoot);
  if (existsSync(target)) fail("NETWORK_NODE_SDK_PACKAGE_TARGET_EXISTS", target);
  const parent = assertDirectory(path.dirname(target), "NETWORK_NODE_SDK_PACKAGE_TARGET_PARENT");
  if (parent !== path.dirname(target)) fail("NETWORK_NODE_SDK_PACKAGE_TARGET_PARENT_INVALID");
  mkdirSync(target, { mode: 0o755 });
  const profile = readNetworkNodeSdkPackageProfile(source);
  const closure = networkNodeSdkDependencyFiles({ sourceRoot: source,
    entrypoints: profile.entrypoints });
  if (!same(closure, REVIEWED_SOURCE_FILES)) {
    fail("NETWORK_NODE_SDK_PACKAGE_DEPENDENCY_CLOSURE_INVALID");
  }
  for (const relative of closure) copyExclusive(source, target, relative);
  for (const record of profile.staticFiles) {
    copyExclusive(source, target, record.source, record.target);
  }
  copyExclusive(source, target, NETWORK_NODE_SDK_PACKAGE_PROFILE_FILE);
  writeExclusive(path.join(target, "index.js"), ROOT_INDEX_SOURCE);
  writeExclusive(path.join(target, "package.json"),
    `${JSON.stringify(packageJson(profile), null, 2)}\n`);

  const expectedBeforeManifest = ["LICENSE", "README.md", "index.js",
    NETWORK_NODE_SDK_PACKAGE_PROFILE_FILE, "package.json", ...REVIEWED_SOURCE_FILES].sort();
  const actualBeforeManifest = listNetworkNodeSdkPackageFiles(target).sort();
  if (JSON.stringify(actualBeforeManifest) !== JSON.stringify(expectedBeforeManifest)) {
    fail("NETWORK_NODE_SDK_PACKAGE_STAGED_MEMBER_SET_INVALID");
  }
  assertForbidden(actualBeforeManifest, profile);
  const members = actualBeforeManifest.map((relative) => manifestMember(target, relative));
  const body = manifestBody({
    profile,
    profileHash: fileHash(path.join(target, NETWORK_NODE_SDK_PACKAGE_PROFILE_FILE)),
    members,
  });
  const manifest = { ...body, manifestHash: domainHash("manifest", body) };
  writeExclusive(path.join(target, NETWORK_NODE_SDK_PACKAGE_MANIFEST_FILE),
    `${JSON.stringify(manifest, null, 2)}\n`);
  const verification = verifyNetworkNodeSdkPackage({ packageRoot: target,
    expectedManifestHash: manifest.manifestHash });
  return Object.freeze({ targetRoot: target, profile, manifest, verification });
}

function usage() {
  return "Usage: node scripts/network-node-sdk-package.mjs --out NEW_DIRECTORY\n"
    + "Stages a private local research-preview package; the target must not exist.\n";
}

if (process.argv[1]
  && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  if (process.argv.slice(2).some((argument) => argument === "--help" || argument === "-h")) {
    process.stdout.write(usage());
  } else {
    const index = process.argv.indexOf("--out");
    if (index < 0 || !process.argv[index + 1]) fail("NETWORK_NODE_SDK_PACKAGE_TARGET_REQUIRED");
    const result = stageNetworkNodeSdkPackage({ targetRoot: process.argv[index + 1] });
    process.stdout.write(`${JSON.stringify({
      ok: true,
      targetRoot: result.targetRoot,
      package: result.manifest.package,
      boundary: result.manifest.boundary.releaseClass,
      manifestHash: result.manifest.manifestHash,
      memberCount: result.manifest.memberCount,
      npmPublished: false,
    })}\n`);
  }
}
