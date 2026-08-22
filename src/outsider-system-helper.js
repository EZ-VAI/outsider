import { createHash, randomUUID } from "node:crypto";
import {
  closeSync, constants, fchmodSync, fstatSync, fsyncSync, linkSync, lstatSync, mkdirSync,
  openSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, unlinkSync,
  writeFileSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { redactExternalSupervisorText } from "./outsider-supervisor-projection.js";

export const SYSTEM_HELPER_LABEL = "ai.outsider.stage05";
export const SYSTEM_HELPER_PROTOCOL = 1;

const DEFAULT_SYSTEM_PATH = "/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin";
const NOFOLLOW = constants.O_NOFOLLOW ?? 0;
const DIRECTORY = constants.O_DIRECTORY ?? 0;
const CANONICAL_UUID_V4_TOKEN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\n?$/u;
const SYSTEM_HELPER_RUNTIME_MANIFEST = ".outsider-runtime-manifest.json";
const SYSTEM_HELPER_RUNTIME_MANIFEST_SCHEMA = "outsider/system-helper-runtime-manifest/v1";
const SYSTEM_HELPER_PUBLICATION_CLAIM_SCHEMA = "outsider/system-helper-publication-claim/v1";
// The claim covers only the final fsync/link/rename publication critical section.
// A one-hour upper bound is deliberately conservative while preventing PID reuse
// or an unclean shutdown from blocking this package version forever.
const SYSTEM_HELPER_PUBLICATION_CLAIM_LEASE_MS = 60 * 60 * 1000;
const CANONICAL_UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

function systemHelperFileError(code, file) {
  const error = new Error(`${code}:${file}`);
  error.code = code;
  return error;
}

function lstatOrNull(file) {
  try {
    return lstatSync(file, { bigint: true });
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

function sameFileIdentity(left, right) {
  return Boolean(left && right
    && left.dev === right.dev
    && left.ino === right.ino
    && left.mode === right.mode
    && left.size === right.size
    && left.mtimeNs === right.mtimeNs
    && left.ctimeNs === right.ctimeNs);
}

function sameDirectoryIdentity(left, right) {
  return Boolean(left && right
    && left.dev === right.dev
    && left.ino === right.ino
    && left.mode === right.mode
    && left.isDirectory() && right.isDirectory());
}

function sameNodeIdentity(left, right) {
  return Boolean(left && right
    && left.dev === right.dev
    && left.ino === right.ino
    && left.mode === right.mode
    && left.size === right.size);
}

function canonicalPathBelowTrustedRoot(file, trustedRoot) {
  if (typeof trustedRoot !== "string" || !trustedRoot) {
    throw new Error("SYSTEM_HELPER_TRUSTED_ROOT_REQUIRED");
  }
  const requestedRoot = path.resolve(trustedRoot);
  const requestedFile = path.resolve(file);
  const relative = path.relative(requestedRoot, requestedFile);
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw systemHelperFileError("SYSTEM_HELPER_PATH_OUTSIDE_TRUSTED_ROOT", requestedFile);
  }
  const canonicalRoot = realpathSync(requestedRoot);
  return { canonicalRoot, canonicalFile: path.join(canonicalRoot, relative) };
}

/** Create missing directories one component at a time and refuse every symlink
 * below the caller-designated trust anchor. Recursive mkdir would otherwise
 * follow an attacker-controlled intermediate component. */
function ensurePrivateDirectoryChain(directory, trustedRoot, symlinkCode,
  privateDirectories = false) {
  const { canonicalRoot, canonicalFile } = canonicalPathBelowTrustedRoot(directory, trustedRoot);
  const rootStats = lstatSync(canonicalRoot, { bigint: true });
  if (!rootStats.isDirectory()) {
    throw systemHelperFileError("SYSTEM_HELPER_TRUSTED_ROOT_NOT_DIRECTORY", canonicalRoot);
  }
  const chain = [{ file: canonicalRoot, stats: rootStats }];
  const relative = path.relative(canonicalRoot, canonicalFile);
  let current = canonicalRoot;
  for (const component of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, component);
    let stats = lstatOrNull(current);
    if (!stats) {
      try {
        mkdirSync(current, { mode: 0o700 });
      } catch (error) {
        if (error?.code !== "EEXIST") throw error;
      }
      stats = lstatSync(current, { bigint: true });
    }
    if (stats.isSymbolicLink()) throw systemHelperFileError(symlinkCode, current);
    if (!stats.isDirectory()) {
      throw systemHelperFileError("SYSTEM_HELPER_DIRECTORY_TYPE_REFUSED", current);
    }
    if (privateDirectories && (Number(stats.mode) & 0o777) !== 0o700) {
      const descriptor = openSync(current, constants.O_RDONLY | DIRECTORY | NOFOLLOW);
      try {
        const opened = fstatSync(descriptor, { bigint: true });
        if (!sameDirectoryIdentity(stats, opened)) {
          throw systemHelperFileError("SYSTEM_HELPER_DIRECTORY_IDENTITY_CHANGED", current);
        }
        fchmodSync(descriptor, 0o700);
        stats = fstatSync(descriptor, { bigint: true });
      } finally {
        closeSync(descriptor);
      }
    }
    chain.push({ file: current, stats });
  }
  return { directory: canonicalFile, chain };
}

function directoryChainIsStable(chain) {
  return chain.every(({ file, stats }) => {
    const current = lstatOrNull(file);
    return current && !current.isSymbolicLink() && sameDirectoryIdentity(stats, current);
  });
}

function fsyncDirectory(directory) {
  const descriptor = openSync(directory, constants.O_RDONLY | DIRECTORY | NOFOLLOW);
  try {
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}

function readRegularFileSnapshotNoFollow(file, { symlinkCode, typeCode, privateMode = false,
  exactMode = null, modeCode = "SYSTEM_HELPER_FILE_PERMISSIONS_INSECURE" } = {}) {
  const before = lstatOrNull(file);
  if (!before) throw systemHelperFileError("SYSTEM_HELPER_FILE_MISSING", file);
  if (before.isSymbolicLink()) throw systemHelperFileError(symlinkCode, file);
  if (!before.isFile()) throw systemHelperFileError(typeCode, file);
  if (privateMode && (Number(before.mode) & 0o077) !== 0) {
    throw systemHelperFileError("SYSTEM_HELPER_TOKEN_PERMISSIONS_INSECURE", file);
  }
  if (exactMode != null && (Number(before.mode) & 0o777) !== exactMode) {
    throw systemHelperFileError(modeCode, file);
  }
  const descriptor = openSync(file, constants.O_RDONLY | NOFOLLOW);
  try {
    const opened = fstatSync(descriptor, { bigint: true });
    if (!opened.isFile() || !sameFileIdentity(before, opened)) {
      throw systemHelperFileError("SYSTEM_HELPER_FILE_IDENTITY_CHANGED", file);
    }
    const content = readFileSync(descriptor);
    const after = fstatSync(descriptor, { bigint: true });
    if (!sameFileIdentity(opened, after)) {
      throw systemHelperFileError("SYSTEM_HELPER_FILE_IDENTITY_CHANGED", file);
    }
    return { bytes: content, stats: after };
  } finally {
    closeSync(descriptor);
  }
}

function readRegularFileNoFollow(file, options = {}) {
  return readRegularFileSnapshotNoFollow(file, options).bytes;
}

function openRandomPrivateTemporary(file) {
  const directory = path.dirname(file);
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const temporary = path.join(directory, `.${path.basename(file)}.${randomUUID()}.tmp`);
    try {
      const descriptor = openSync(temporary,
        constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | NOFOLLOW, 0o600);
      return { descriptor, temporary };
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
    }
  }
  throw systemHelperFileError("SYSTEM_HELPER_TEMPORARY_CREATE_FAILED", file);
}

/** Durable same-directory replacement. The random O_EXCL temporary prevents a
 * pre-planted predictable temp symlink, while rename replaces the name rather
 * than following a final target. We still fail closed when that target is a
 * symlink before committing. */
function writePrivateFileAtomically(file, content, { trustedRoot, directorySymlinkCode,
  finalSymlinkCode, identityCode, durable = true, privateDirectories = false } = {}) {
  const secured = ensurePrivateDirectoryChain(path.dirname(file), trustedRoot,
    directorySymlinkCode, privateDirectories);
  const canonicalFile = path.join(secured.directory, path.basename(file));
  const before = lstatOrNull(canonicalFile);
  if (before?.isSymbolicLink()) throw systemHelperFileError(finalSymlinkCode, canonicalFile);
  if (before && !before.isFile()) {
    throw systemHelperFileError("SYSTEM_HELPER_FILE_TYPE_REFUSED", canonicalFile);
  }
  const { descriptor, temporary } = openRandomPrivateTemporary(canonicalFile);
  let temporaryExists = true;
  let written;
  try {
    try {
      fchmodSync(descriptor, 0o600);
      writeFileSync(descriptor, content);
      fsyncSync(descriptor);
      written = fstatSync(descriptor, { bigint: true });
    } finally {
      closeSync(descriptor);
    }
    if (!directoryChainIsStable(secured.chain)) {
      throw systemHelperFileError("SYSTEM_HELPER_DIRECTORY_IDENTITY_CHANGED", canonicalFile);
    }
    const current = lstatOrNull(canonicalFile);
    if (current?.isSymbolicLink()) throw systemHelperFileError(finalSymlinkCode, canonicalFile);
    if ((before == null) !== (current == null)
      || (before && !sameFileIdentity(before, current))) {
      throw systemHelperFileError(identityCode, canonicalFile);
    }
    renameSync(temporary, canonicalFile);
    temporaryExists = false;
    if (durable) fsyncDirectory(secured.directory);
    const installed = lstatSync(canonicalFile, { bigint: true });
    if (!installed.isFile() || installed.isSymbolicLink()
      || (Number(installed.mode) & 0o777) !== 0o600
      || !sameNodeIdentity(written, installed)) {
      throw systemHelperFileError("SYSTEM_HELPER_PRIVATE_FILE_VERIFY_FAILED", canonicalFile);
    }
    return canonicalFile;
  } finally {
    if (temporaryExists) {
      try {
        unlinkSync(temporary);
      } catch (error) {
        if (error?.code !== "ENOENT") throw error;
      }
    }
  }
}

const CREDENTIAL_OPTION = "(?:api[-_]?key|api[-_]?token|access[-_]?key|access[-_]?token|auth(?:orization)?|bearer|client[-_]?secret|credential|password|private[-_]?key|refresh[-_]?token|secret|session[-_]?token|token)";
const INLINE_CREDENTIAL_OPTION = new RegExp(`(?:^|\\s)--${CREDENTIAL_OPTION}(?:\\s|=)`, "iu");
const TYPED_CREDENTIAL_OPTION = new RegExp(`^--${CREDENTIAL_OPTION}(?:=|$)`, "iu");

export function validatedSupervisorCommand(supervisorCommand) {
  if (Array.isArray(supervisorCommand)) {
    if (supervisorCommand.length === 0
      || supervisorCommand.some((item) => typeof item !== "string" || item.length === 0)) {
      throw new Error("EXTERNAL_SUPERVISOR_ARGV_INVALID");
    }
  } else if (typeof supervisorCommand !== "string" || !supervisorCommand.trim()) {
    throw new Error("EXTERNAL_SUPERVISOR_COMMAND_INVALID");
  }
  const serialized = Array.isArray(supervisorCommand)
    ? JSON.stringify(supervisorCommand) : supervisorCommand;
  if (redactExternalSupervisorText(serialized) !== serialized
    || (Array.isArray(supervisorCommand)
      ? supervisorCommand.some((item) => TYPED_CREDENTIAL_OPTION.test(item))
      : INLINE_CREDENTIAL_OPTION.test(serialized))) {
    throw new Error("EXTERNAL_SUPERVISOR_COMMAND_CONTAINS_INLINE_SECRET");
  }
  return Array.isArray(supervisorCommand)
    ? { OUTSIDER_SUPERVISOR_ARGV: serialized }
    : { OUTSIDER_SUPERVISOR: serialized };
}

/** Only command identity and the distinct disclosure bit may be persisted.
 * Credentials belong in the supervisor tool's own protected login store, never
 * in a Claude/Codex settings command or LaunchAgent plist. */
export function externalSupervisorConfigurationEnvironment({ supervisorCommand = null,
  allowExternalSupervisor = false } = {}) {
  if (supervisorCommand == null && allowExternalSupervisor !== true) return {};
  if (supervisorCommand != null && allowExternalSupervisor !== true) {
    throw new Error("EXTERNAL_SUPERVISOR_CONSENT_REQUIRED");
  }
  if (allowExternalSupervisor === true && supervisorCommand == null) {
    throw new Error("EXTERNAL_SUPERVISOR_COMMAND_REQUIRED");
  }
  return { ...validatedSupervisorCommand(supervisorCommand),
    OUTSIDER_ALLOW_EXTERNAL_SUPERVISOR: "1" };
}

export function shellQuoteHookValue(value) {
  return `'${String(value).replaceAll("'", `'"'"'`)}'`;
}

/** Persist the external-supervisor dual gate in a host hook command without
 * allowing spaces, quotes or shell metacharacters in argv JSON to escape into
 * the hook shell. */
export function hookCommandWithExternalSupervisor({ hookCommand,
  supervisorCommand = null, allowExternalSupervisor = false } = {}) {
  if (typeof hookCommand !== "string" || !hookCommand.trim()) {
    throw new Error("HOOK_COMMAND_REQUIRED");
  }
  const environment = externalSupervisorConfigurationEnvironment({ supervisorCommand,
    allowExternalSupervisor });
  const fields = Object.entries(environment);
  if (!fields.length) return hookCommand;
  const assignments = fields.map(([key, value]) => `${key}=${shellQuoteHookValue(value)}`);
  return `/usr/bin/env ${assignments.join(" ")} ${hookCommand}`;
}

export function systemHelperPath(nodeExecutable, inheritedPath = process.env.PATH) {
  const entries = [path.dirname(path.resolve(nodeExecutable)),
    ...String(inheritedPath ?? "").split(path.delimiter),
    ...DEFAULT_SYSTEM_PATH.split(path.delimiter)]
    .map((entry) => entry.trim()).filter(Boolean);
  return [...new Set(entries)].join(path.delimiter);
}

const xml = (value) => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&apos;");

export function systemHelperPaths({ home, version, uid = process.getuid?.() ?? 0 } = {}) {
  const root = path.join(home, ".outsider", "system-helper");
  const releaseRoot = path.join(root, "releases", String(version));
  return {
    root,
    releaseRoot,
    entry: path.join(releaseRoot, "bin", "outsider-attached-daemon.mjs"),
    attachedRoot: path.join(home, ".outsider", "attached"),
    tokenFile: path.join(root, "token"),
    stdoutFile: path.join(root, "helper.stdout.log"),
    stderrFile: path.join(root, "helper.stderr.log"),
    plistFile: path.join(home, "Library", "LaunchAgents", `${SYSTEM_HELPER_LABEL}.plist`),
    socketPath: path.join("/tmp", `outsider-attached-system-${uid}.sock`),
  };
}

function sourceDirectory(file) {
  const stats = lstatSync(file, { bigint: true });
  if (stats.isSymbolicLink()) {
    throw systemHelperFileError("SYSTEM_HELPER_SOURCE_SYMLINK_REFUSED", file);
  }
  if (!stats.isDirectory()) {
    throw systemHelperFileError("SYSTEM_HELPER_SOURCE_DIRECTORY_REQUIRED", file);
  }
  return file;
}

function sourcePackageAt(sourceRoot) {
  const canonicalSourceRoot = realpathSync(path.resolve(sourceRoot));
  const rootStats = lstatSync(canonicalSourceRoot, { bigint: true });
  if (!rootStats.isDirectory() || rootStats.isSymbolicLink()) {
    throw systemHelperFileError("SYSTEM_HELPER_SOURCE_DIRECTORY_REQUIRED", canonicalSourceRoot);
  }
  const packageFile = path.join(canonicalSourceRoot, "package.json");
  const packageSnapshot = readRegularFileSnapshotNoFollow(packageFile, {
    symlinkCode: "SYSTEM_HELPER_SOURCE_SYMLINK_REFUSED",
    typeCode: "SYSTEM_HELPER_SOURCE_FILE_REQUIRED",
  });
  return { canonicalSourceRoot,
    sourcePackage: JSON.parse(packageSnapshot.bytes.toString("utf8")),
    sourceSnapshots: {
      directories: [{ file: canonicalSourceRoot, stats: rootStats, names: null }],
      files: [{ file: packageFile, ...packageSnapshot, options: {
        symlinkCode: "SYSTEM_HELPER_SOURCE_SYMLINK_REFUSED",
        typeCode: "SYSTEM_HELPER_SOURCE_FILE_REQUIRED",
      } }],
    } };
}

const runtimeMemberPath = (...components) => components.join("/");
const runtimeMemberFile = (root, member) => path.join(root, ...member.split("/"));
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

function sameDirectorySnapshot(left, right) {
  return sameDirectoryIdentity(left, right)
    && left.size === right.size
    && left.mtimeNs === right.mtimeNs
    && left.ctimeNs === right.ctimeNs;
}

function revalidateRuntimeSnapshot(snapshot, identityCode) {
  for (const record of snapshot.files) {
    const current = readRegularFileSnapshotNoFollow(record.file, record.options);
    if (!sameFileIdentity(record.stats, current.stats) || !record.bytes.equals(current.bytes)) {
      throw systemHelperFileError(identityCode, record.file);
    }
  }
  for (const record of snapshot.directories) {
    const current = lstatSync(record.file, { bigint: true });
    if (current.isSymbolicLink() || !sameDirectorySnapshot(record.stats, current)) {
      throw systemHelperFileError(identityCode, record.file);
    }
    if (record.names) {
      const currentNames = readdirSync(record.file).toSorted();
      if (record.names.length !== currentNames.length
        || record.names.some((name, index) => name !== currentNames[index])) {
        throw systemHelperFileError(identityCode, record.file);
      }
    }
  }
}

/** Read a complete source subtree before creating a release. Besides making the
 * manifest deterministic, the before/after directory snapshots ensure a source
 * mutation cannot silently produce a mixed release. */
function collectRuntimeSourceDirectory(source, member, directories, files, snapshots,
  testOnlySnapshotObserver) {
  const before = lstatSync(source, { bigint: true });
  if (before.isSymbolicLink()) {
    throw systemHelperFileError("SYSTEM_HELPER_SOURCE_SYMLINK_REFUSED", source);
  }
  if (!before.isDirectory()) {
    throw systemHelperFileError("SYSTEM_HELPER_SOURCE_DIRECTORY_REQUIRED", source);
  }
  directories.add(member);
  const names = readdirSync(source).toSorted();
  for (const name of names) {
    const sourceEntry = path.join(source, name);
    const childMember = runtimeMemberPath(member, name);
    const stats = lstatSync(sourceEntry, { bigint: true });
    if (stats.isSymbolicLink()) {
      throw systemHelperFileError("SYSTEM_HELPER_SOURCE_SYMLINK_REFUSED", sourceEntry);
    }
    if (stats.isDirectory()) {
      collectRuntimeSourceDirectory(sourceEntry, childMember, directories, files, snapshots,
        testOnlySnapshotObserver);
    } else if (stats.isFile()) {
      const options = {
        symlinkCode: "SYSTEM_HELPER_SOURCE_SYMLINK_REFUSED",
        typeCode: "SYSTEM_HELPER_SOURCE_FILE_REQUIRED",
      };
      const snapshot = readRegularFileSnapshotNoFollow(sourceEntry, options);
      files.set(childMember, snapshot.bytes);
      snapshots.files.push({ file: sourceEntry, ...snapshot, options });
      testOnlySnapshotObserver?.({ phase: "source-member-read", member: childMember });
    } else {
      throw systemHelperFileError("SYSTEM_HELPER_SOURCE_FILE_TYPE_REFUSED", sourceEntry);
    }
  }
  const afterNames = readdirSync(source).toSorted();
  const after = lstatSync(source, { bigint: true });
  if (!sameDirectorySnapshot(before, after)
    || names.length !== afterNames.length
    || names.some((name, index) => name !== afterNames[index])) {
    throw systemHelperFileError("SYSTEM_HELPER_SOURCE_IDENTITY_CHANGED", source);
  }
  snapshots.directories.push({ file: source, stats: after, names });
}

function runtimeSourceImage(canonicalSourceRoot, sourcePackage, snapshots,
  testOnlySnapshotObserver) {
  const directories = new Set();
  const files = new Map();
  collectRuntimeSourceDirectory(path.join(canonicalSourceRoot, "src"), "src",
    directories, files, snapshots, testOnlySnapshotObserver);
  const binDirectory = path.join(canonicalSourceRoot, "bin");
  const binBefore = lstatSync(sourceDirectory(binDirectory), { bigint: true });
  const binNames = readdirSync(binDirectory).toSorted();
  directories.add("bin");
  for (const name of ["outsider-attached-daemon.mjs", "outsider-controller-host.mjs",
    "outsider-hook.mjs"]) {
    const source = path.join(canonicalSourceRoot, "bin", name);
    const member = runtimeMemberPath("bin", name);
    const options = {
      symlinkCode: "SYSTEM_HELPER_SOURCE_SYMLINK_REFUSED",
      typeCode: "SYSTEM_HELPER_SOURCE_FILE_REQUIRED",
    };
    const snapshot = readRegularFileSnapshotNoFollow(source, options);
    files.set(member, snapshot.bytes);
    snapshots.files.push({ file: source, ...snapshot, options });
    testOnlySnapshotObserver?.({ phase: "source-member-read", member });
  }
  const binAfterNames = readdirSync(binDirectory).toSorted();
  const binAfter = lstatSync(binDirectory, { bigint: true });
  if (!sameDirectorySnapshot(binBefore, binAfter)
    || binNames.length !== binAfterNames.length
    || binNames.some((name, index) => name !== binAfterNames[index])) {
    throw systemHelperFileError("SYSTEM_HELPER_SOURCE_IDENTITY_CHANGED", binDirectory);
  }
  snapshots.directories.push({ file: binDirectory, stats: binAfter, names: binNames });
  files.set("package.json", Buffer.from(`${JSON.stringify({
    name: sourcePackage.name,
    version: sourcePackage.version,
    private: true,
    type: "module",
    engines: sourcePackage.engines,
  }, null, 2)}\n`));
  const manifest = {
    schema: SYSTEM_HELPER_RUNTIME_MANIFEST_SCHEMA,
    package: { name: sourcePackage.name, version: sourcePackage.version },
    directories: [...directories].toSorted(),
    files: [...files].toSorted(([left], [right]) => left.localeCompare(right))
      .map(([member, bytes]) => ({ path: member, bytes: bytes.length, sha256: sha256(bytes) })),
  };
  files.set(SYSTEM_HELPER_RUNTIME_MANIFEST,
    Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`));
  revalidateRuntimeSnapshot(snapshots, "SYSTEM_HELPER_SOURCE_IDENTITY_CHANGED");
  return { directories, files };
}

/** Stable, no-follow snapshot of an installed release. Modes are part of the
 * release contract: verification never repairs an existing same-version tree. */
function readInstalledRuntimeDirectory(directory, member, directories, files, snapshots,
  testOnlySnapshotObserver) {
  const before = lstatSync(directory, { bigint: true });
  if (before.isSymbolicLink()) {
    throw systemHelperFileError("SYSTEM_HELPER_RELEASE_SYMLINK_REFUSED", directory);
  }
  if (!before.isDirectory()) {
    throw systemHelperFileError("SYSTEM_HELPER_RELEASE_DIRECTORY_TYPE_REFUSED", directory);
  }
  if (member) directories.add(member);
  const names = readdirSync(directory).toSorted();
  for (const name of names) {
    const installed = path.join(directory, name);
    const childMember = member ? runtimeMemberPath(member, name) : name;
    const stats = lstatSync(installed, { bigint: true });
    if (stats.isSymbolicLink()) {
      throw systemHelperFileError("SYSTEM_HELPER_RELEASE_SYMLINK_REFUSED", installed);
    }
    if (stats.isDirectory()) {
      readInstalledRuntimeDirectory(installed, childMember, directories, files, snapshots,
        testOnlySnapshotObserver);
    } else if (stats.isFile()) {
      const options = {
        symlinkCode: "SYSTEM_HELPER_RELEASE_SYMLINK_REFUSED",
        typeCode: "SYSTEM_HELPER_RELEASE_FILE_TYPE_REFUSED",
        exactMode: 0o600,
        modeCode: "SYSTEM_HELPER_RELEASE_PERMISSIONS_INSECURE",
      };
      const snapshot = readRegularFileSnapshotNoFollow(installed, options);
      files.set(childMember, snapshot.bytes);
      snapshots.files.push({ file: installed, ...snapshot, options });
      testOnlySnapshotObserver?.({ phase: "installed-member-read", member: childMember });
    } else {
      throw systemHelperFileError("SYSTEM_HELPER_RELEASE_FILE_TYPE_REFUSED", installed);
    }
  }
  const afterNames = readdirSync(directory).toSorted();
  const after = lstatSync(directory, { bigint: true });
  if ((Number(before.mode) & 0o777) !== 0o700) {
    throw systemHelperFileError("SYSTEM_HELPER_RELEASE_PERMISSIONS_INSECURE", directory);
  }
  if (!sameDirectorySnapshot(before, after)
    || names.length !== afterNames.length
    || names.some((name, index) => name !== afterNames[index])) {
    throw systemHelperFileError("SYSTEM_HELPER_RELEASE_IDENTITY_CHANGED", directory);
  }
  snapshots.directories.push({ file: directory, stats: after, names });
}

function runtimeImageMatches(left, right) {
  if (left.size !== right.size) return false;
  for (const [member, bytes] of left) {
    const candidate = right.get(member);
    if (!candidate || !bytes.equals(candidate)) return false;
  }
  return true;
}

function verifyImmutableRuntimeRelease(targetRoot, desired, testOnlySnapshotObserver) {
  const installed = { directories: new Set(), files: new Map(),
    snapshots: { directories: [], files: [] } };
  readInstalledRuntimeDirectory(targetRoot, "", installed.directories, installed.files,
    installed.snapshots, testOnlySnapshotObserver);
  const desiredDirectories = [...desired.directories].toSorted();
  const installedDirectories = [...installed.directories].toSorted();
  const directorySetMatches = desiredDirectories.length === installedDirectories.length
    && desiredDirectories.every((member, index) => member === installedDirectories[index]);
  if (!directorySetMatches || !runtimeImageMatches(desired.files, installed.files)) {
    throw systemHelperFileError("SYSTEM_HELPER_RELEASE_IMMUTABLE_MISMATCH", targetRoot);
  }
  revalidateRuntimeSnapshot(installed.snapshots, "SYSTEM_HELPER_RELEASE_IDENTITY_CHANGED");
}

function createOwnedRuntimeStaging(parent, releaseName) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const directory = path.join(parent, `.${releaseName}.${randomUUID()}.staging`);
    try {
      mkdirSync(directory, { mode: 0o700 });
      const stats = lstatSync(directory, { bigint: true });
      if (!stats.isDirectory() || stats.isSymbolicLink()
        || (Number(stats.mode) & 0o777) !== 0o700) {
        throw systemHelperFileError("SYSTEM_HELPER_RELEASE_STAGING_VERIFY_FAILED", directory);
      }
      return { directory, stats };
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
    }
  }
  throw systemHelperFileError("SYSTEM_HELPER_RELEASE_STAGING_CREATE_FAILED", parent);
}

function cleanupOwnedRuntimeStaging(owned) {
  const current = lstatOrNull(owned.directory);
  if (!current) return;
  if (current.isSymbolicLink() || !sameDirectoryIdentity(owned.stats, current)) {
    throw systemHelperFileError("SYSTEM_HELPER_RELEASE_STAGING_IDENTITY_CHANGED",
      owned.directory);
  }
  rmSync(owned.directory, { recursive: true, force: false });
}

function readRuntimePublicationClaim(file) {
  const before = lstatOrNull(file);
  if (!before) throw systemHelperFileError("SYSTEM_HELPER_RELEASE_PUBLICATION_CLAIM_MISSING",
    file);
  if (before.isSymbolicLink()) {
    throw systemHelperFileError("SYSTEM_HELPER_RELEASE_PUBLICATION_CLAIM_SYMLINK_REFUSED",
      file);
  }
  if (!before.isFile() || (Number(before.mode) & 0o777) !== 0o600) {
    throw systemHelperFileError("SYSTEM_HELPER_RELEASE_PUBLICATION_CLAIM_INVALID", file);
  }
  const options = {
    symlinkCode: "SYSTEM_HELPER_RELEASE_PUBLICATION_CLAIM_SYMLINK_REFUSED",
    typeCode: "SYSTEM_HELPER_RELEASE_PUBLICATION_CLAIM_INVALID",
    exactMode: 0o600,
    modeCode: "SYSTEM_HELPER_RELEASE_PUBLICATION_CLAIM_INVALID",
  };
  const receiptSnapshot = readRegularFileSnapshotNoFollow(file, options);
  let receipt;
  try {
    receipt = JSON.parse(receiptSnapshot.bytes.toString("utf8"));
  } catch {
    throw systemHelperFileError("SYSTEM_HELPER_RELEASE_PUBLICATION_CLAIM_INVALID", file);
  }
  const expectedKeys = ["createdAt", "ownerPid", "schema", "token"];
  const keys = receipt && typeof receipt === "object" && !Array.isArray(receipt)
    ? Object.keys(receipt).toSorted() : [];
  const createdAt = typeof receipt?.createdAt === "string" ? receipt.createdAt : "";
  let canonicalCreatedAt = false;
  try {
    canonicalCreatedAt = new Date(createdAt).toISOString() === createdAt;
  } catch {
    canonicalCreatedAt = false;
  }
  if (keys.length !== expectedKeys.length
    || keys.some((key, index) => key !== expectedKeys[index])
    || receipt.schema !== SYSTEM_HELPER_PUBLICATION_CLAIM_SCHEMA
    || !Number.isInteger(receipt.ownerPid) || receipt.ownerPid < 1
    || receipt.ownerPid > 2_147_483_647
    || !canonicalCreatedAt
    || typeof receipt.token !== "string" || !CANONICAL_UUID_V4.test(receipt.token)) {
    throw systemHelperFileError("SYSTEM_HELPER_RELEASE_PUBLICATION_CLAIM_INVALID", file);
  }
  const after = lstatSync(file, { bigint: true });
  if (!sameFileIdentity(before, after)
    || !sameFileIdentity(receiptSnapshot.stats, after)) {
    throw systemHelperFileError("SYSTEM_HELPER_RELEASE_PUBLICATION_CLAIM_IDENTITY_CHANGED",
      file);
  }
  return { file, stats: after, receipt, receiptSnapshot, options };
}

function publicationClaimOwnerIsLive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error?.code === "ESRCH") return false;
    if (error?.code === "EPERM") return true;
    throw systemHelperFileError("SYSTEM_HELPER_RELEASE_PUBLICATION_OWNER_CHECK_FAILED",
      String(pid));
  }
}

function removeOwnedRuntimePublicationClaim(owned) {
  const current = readRuntimePublicationClaim(owned.file);
  if (!sameFileIdentity(owned.stats, current.stats)
    || !owned.receiptSnapshot.bytes.equals(current.receiptSnapshot.bytes)) {
    throw systemHelperFileError("SYSTEM_HELPER_RELEASE_PUBLICATION_CLAIM_IDENTITY_CHANGED",
      owned.file);
  }
  unlinkSync(current.file);
  fsyncDirectory(path.dirname(owned.file));
}

function assertRuntimePublicationClaimOwned(owned) {
  const current = readRuntimePublicationClaim(owned.file);
  if (!sameFileIdentity(owned.stats, current.stats)
    || !owned.receiptSnapshot.bytes.equals(current.receiptSnapshot.bytes)) {
    throw systemHelperFileError("SYSTEM_HELPER_RELEASE_PUBLICATION_CLAIM_IDENTITY_CHANGED",
      owned.file);
  }
}

function recoverDeadRuntimePublicationClaim(file, nowMs) {
  const claim = readRuntimePublicationClaim(file);
  const ageMs = nowMs - Date.parse(claim.receipt.createdAt);
  if (ageMs < SYSTEM_HELPER_PUBLICATION_CLAIM_LEASE_MS
    && publicationClaimOwnerIsLive(claim.receipt.ownerPid)) {
    throw systemHelperFileError("SYSTEM_HELPER_RELEASE_PUBLICATION_BUSY", file);
  }
  removeOwnedRuntimePublicationClaim(claim);
}

function cleanupOwnedPublicationClaimTemporary(owned) {
  const current = lstatOrNull(owned.file);
  if (!current) return;
  if (current.isSymbolicLink() || !current.isFile()
    || !sameNodeIdentity(owned.stats, current)) {
    throw systemHelperFileError("SYSTEM_HELPER_RELEASE_PUBLICATION_TEMP_IDENTITY_CHANGED",
      owned.file);
  }
  unlinkSync(owned.file);
}

function acquireRuntimePublicationClaim(parent, releaseName, testOnlySnapshotObserver,
  testOnlyNow) {
  const file = path.join(parent, `.${releaseName}.publish-claim`);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const nowMs = Number(testOnlyNow());
    if (!Number.isFinite(nowMs)) {
      throw systemHelperFileError("SYSTEM_HELPER_RELEASE_PUBLICATION_CLOCK_INVALID", file);
    }
    if (lstatOrNull(file)) {
      if (attempt === 0) {
        recoverDeadRuntimePublicationClaim(file, nowMs);
        continue;
      }
      throw systemHelperFileError("SYSTEM_HELPER_RELEASE_PUBLICATION_BUSY", file);
    }
    const serialized = Buffer.from(`${JSON.stringify({
      schema: SYSTEM_HELPER_PUBLICATION_CLAIM_SCHEMA,
      ownerPid: process.pid,
      createdAt: new Date(nowMs).toISOString(),
      token: randomUUID(),
    }, null, 2)}\n`);
    const { descriptor, temporary } = openRandomPrivateTemporary(file);
    let temporaryExists = true;
    let ownedTemporary;
    try {
      try {
        fchmodSync(descriptor, 0o600);
        writeFileSync(descriptor, serialized);
        fsyncSync(descriptor);
        ownedTemporary = { file: temporary, stats: fstatSync(descriptor, { bigint: true }) };
      } finally {
        closeSync(descriptor);
      }
      testOnlySnapshotObserver?.({ phase: "publication-claim-temp-durable",
        claimTemporary: temporary, publicationClaim: file });
      try {
        linkSync(temporary, file);
      } catch (error) {
        if (error?.code !== "EEXIST") throw error;
        if (attempt === 0) {
          recoverDeadRuntimePublicationClaim(file, nowMs);
          continue;
        }
        throw systemHelperFileError("SYSTEM_HELPER_RELEASE_PUBLICATION_BUSY", file);
      }
      fsyncDirectory(parent);
      testOnlySnapshotObserver?.({ phase: "publication-claim-linked",
        claimTemporary: temporary, publicationClaim: file });
      cleanupOwnedPublicationClaimTemporary(ownedTemporary);
      temporaryExists = false;
      fsyncDirectory(parent);
      const claim = readRuntimePublicationClaim(file);
      if (!sameNodeIdentity(ownedTemporary.stats, claim.stats)
        || !serialized.equals(claim.receiptSnapshot.bytes)) {
        throw systemHelperFileError("SYSTEM_HELPER_RELEASE_PUBLICATION_CLAIM_IDENTITY_CHANGED",
          file);
      }
      return claim;
    } finally {
      if (temporaryExists && ownedTemporary) {
        cleanupOwnedPublicationClaimTemporary(ownedTemporary);
      }
    }
  }
  throw systemHelperFileError("SYSTEM_HELPER_RELEASE_PUBLICATION_BUSY", file);
}

function cleanupOwnedRuntimePublicationClaim(owned) {
  if (!lstatOrNull(owned.file)) return;
  removeOwnedRuntimePublicationClaim(owned);
}

function fsyncRuntimeImage(root, directories) {
  for (const member of [...directories]
    .toSorted((left, right) => right.split("/").length - left.split("/").length
      || right.localeCompare(left))) {
    fsyncDirectory(runtimeMemberFile(root, member));
  }
  fsyncDirectory(root);
}

function populateRuntimeStaging(owned, desired, trustedRoot, testOnlySnapshotObserver) {
  const securedRelease = { directory: owned.directory,
    chain: [{ file: owned.directory, stats: owned.stats }] };
  for (const member of [...desired.directories].toSorted()) {
    ensurePrivateDirectoryChain(runtimeMemberFile(owned.directory, member), trustedRoot,
      "SYSTEM_HELPER_RELEASE_SYMLINK_REFUSED", true);
  }
  for (const [member, bytes] of [...desired.files]
    .toSorted(([left], [right]) => left.localeCompare(right))) {
    writePrivateFileAtomically(runtimeMemberFile(owned.directory, member), bytes, {
      trustedRoot,
      directorySymlinkCode: "SYSTEM_HELPER_RELEASE_SYMLINK_REFUSED",
      finalSymlinkCode: "SYSTEM_HELPER_RELEASE_SYMLINK_REFUSED",
      identityCode: "SYSTEM_HELPER_RELEASE_IDENTITY_CHANGED",
      durable: false,
      privateDirectories: true,
    });
    testOnlySnapshotObserver?.({ phase: "staging-member-written", member });
  }
  if (!directoryChainIsStable(securedRelease.chain)) {
    throw systemHelperFileError("SYSTEM_HELPER_RELEASE_IDENTITY_CHANGED", owned.directory);
  }
  verifyImmutableRuntimeRelease(owned.directory, desired, testOnlySnapshotObserver);
  fsyncRuntimeImage(owned.directory, desired.directories);
  verifyImmutableRuntimeRelease(owned.directory, desired, testOnlySnapshotObserver);
}

export function stageSystemHelperRuntime({ sourceRoot, targetRoot,
  trustedRoot = path.dirname(path.resolve(targetRoot)), testOnlySnapshotObserver = null,
  testOnlyNow = Date.now }) {
  const { canonicalSourceRoot, sourcePackage, sourceSnapshots } = sourcePackageAt(sourceRoot);
  const desired = runtimeSourceImage(canonicalSourceRoot, sourcePackage, sourceSnapshots,
    testOnlySnapshotObserver);
  const mappedTarget = canonicalPathBelowTrustedRoot(targetRoot, trustedRoot);
  const canonicalTrustedRoot = mappedTarget.canonicalRoot;
  const securedParent = ensurePrivateDirectoryChain(path.dirname(mappedTarget.canonicalFile),
    canonicalTrustedRoot, "SYSTEM_HELPER_RELEASE_SYMLINK_REFUSED", true);
  const canonicalTargetRoot = path.join(securedParent.directory,
    path.basename(mappedTarget.canonicalFile));
  const existing = lstatOrNull(canonicalTargetRoot);
  if (existing) {
    verifyImmutableRuntimeRelease(canonicalTargetRoot, desired, testOnlySnapshotObserver);
    if (!directoryChainIsStable(securedParent.chain)) {
      throw systemHelperFileError("SYSTEM_HELPER_RELEASE_IDENTITY_CHANGED", canonicalTargetRoot);
    }
    return { version: sourcePackage.version, entry: path.join(targetRoot, "bin",
      "outsider-attached-daemon.mjs") };
  }
  const owned = createOwnedRuntimeStaging(securedParent.directory,
    path.basename(canonicalTargetRoot));
  let published = false;
  try {
    populateRuntimeStaging(owned, desired, canonicalTrustedRoot, testOnlySnapshotObserver);
    testOnlySnapshotObserver?.({ phase: "before-release-publish",
      stagingRoot: owned.directory, targetRoot: canonicalTargetRoot });
    if (!directoryChainIsStable(securedParent.chain)) {
      throw systemHelperFileError("SYSTEM_HELPER_RELEASE_PARENT_IDENTITY_CHANGED",
        securedParent.directory);
    }
    const claim = acquireRuntimePublicationClaim(securedParent.directory,
      path.basename(canonicalTargetRoot), testOnlySnapshotObserver, testOnlyNow);
    try {
      testOnlySnapshotObserver?.({ phase: "before-release-rename",
        stagingRoot: owned.directory, targetRoot: canonicalTargetRoot,
        publicationClaim: claim.file });
      assertRuntimePublicationClaimOwned(claim);
      if (!directoryChainIsStable(securedParent.chain)) {
        throw systemHelperFileError("SYSTEM_HELPER_RELEASE_PARENT_IDENTITY_CHANGED",
          securedParent.directory);
      }
      const winner = lstatOrNull(canonicalTargetRoot);
      if (winner) {
        verifyImmutableRuntimeRelease(canonicalTargetRoot, desired, testOnlySnapshotObserver);
        return { version: sourcePackage.version, entry: path.join(targetRoot, "bin",
          "outsider-attached-daemon.mjs") };
      }
      if (!directoryChainIsStable(securedParent.chain)) {
        throw systemHelperFileError("SYSTEM_HELPER_RELEASE_PARENT_IDENTITY_CHANGED",
          securedParent.directory);
      }
      assertRuntimePublicationClaimOwned(claim);
      try {
        renameSync(owned.directory, canonicalTargetRoot);
        published = true;
      } catch (error) {
        if (!["EEXIST", "ENOTEMPTY"].includes(error?.code)) throw error;
        verifyImmutableRuntimeRelease(canonicalTargetRoot, desired, testOnlySnapshotObserver);
        return { version: sourcePackage.version, entry: path.join(targetRoot, "bin",
          "outsider-attached-daemon.mjs") };
      }
      const publishedStats = lstatSync(canonicalTargetRoot, { bigint: true });
      if (!sameDirectoryIdentity(owned.stats, publishedStats)
        || !directoryChainIsStable(securedParent.chain)) {
        throw systemHelperFileError("SYSTEM_HELPER_RELEASE_PUBLICATION_IDENTITY_CHANGED",
          canonicalTargetRoot);
      }
      fsyncDirectory(securedParent.directory);
      verifyImmutableRuntimeRelease(canonicalTargetRoot, desired, testOnlySnapshotObserver);
      return { version: sourcePackage.version, entry: path.join(targetRoot, "bin",
        "outsider-attached-daemon.mjs") };
    } finally {
      cleanupOwnedRuntimePublicationClaim(claim);
    }
  } finally {
    if (!published) cleanupOwnedRuntimeStaging(owned);
  }
}

export function systemHelperPlist({ nodeExecutable, entry, workingDirectory, attachedRoot,
  socketPath, token, stdoutFile, stderrFile, environmentPath,
  supervisorCommand = null, allowExternalSupervisor = false } = {}) {
  const args = [nodeExecutable, entry].map((value) => `      <string>${xml(value)}</string>`).join("\n");
  let supervisorEnvironment;
  try {
    supervisorEnvironment = externalSupervisorConfigurationEnvironment({ supervisorCommand,
      allowExternalSupervisor });
  } catch (error) {
    throw new Error(`SYSTEM_HELPER_${error?.message ?? error}`);
  }
  const env = {
    OUTSIDER_ATTACHED_ROOT: attachedRoot,
    OUTSIDER_ATTACHED_SOCKET: socketPath,
    OUTSIDER_ATTACHED_TOKEN: token,
    OUTSIDER_DAEMON_TRANSPORT: "system-helper",
    /* launchd's default PATH is /usr/bin:/bin:/usr/sbin:/sbin. On machines
       where Node/npm live in /usr/local/bin or /opt/homebrew/bin, an acceptance
       command discovered as `npm test` therefore exists in the user's terminal
       and disappears inside the helper. Capture the installer's executable
       search path, while always retaining the Node directory and system paths. */
    PATH: systemHelperPath(nodeExecutable, environmentPath),
  };
  Object.assign(env, supervisorEnvironment);
  const environment = Object.entries(env).map(([key, value]) =>
    `      <key>${xml(key)}</key>\n      <string>${xml(value)}</string>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${SYSTEM_HELPER_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
${args}
  </array>
  <key>WorkingDirectory</key><string>${xml(workingDirectory)}</string>
  <key>EnvironmentVariables</key>
  <dict>
${environment}
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ProcessType</key><string>Interactive</string>
  <key>StandardOutPath</key><string>${xml(stdoutFile)}</string>
  <key>StandardErrorPath</key><string>${xml(stderrFile)}</string>
</dict>
</plist>
`;
}

const runLaunchctl = (args, run) => run("/bin/launchctl", args, {
  encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 20_000,
});

function stableSystemHelperToken(tokenFile, trustedRoot) {
  const secured = ensurePrivateDirectoryChain(path.dirname(tokenFile), trustedRoot,
    "SYSTEM_HELPER_TOKEN_DIRECTORY_SYMLINK_REFUSED", true);
  const canonicalTokenFile = path.join(secured.directory, path.basename(tokenFile));
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const before = lstatOrNull(canonicalTokenFile);
    if (before) {
      if (before.isSymbolicLink()) {
        throw systemHelperFileError("SYSTEM_HELPER_TOKEN_SYMLINK_REFUSED", canonicalTokenFile);
      }
      if (!before.isFile()) {
        throw systemHelperFileError("SYSTEM_HELPER_TOKEN_TYPE_REFUSED", canonicalTokenFile);
      }
      if (!directoryChainIsStable(secured.chain)) {
        throw systemHelperFileError("SYSTEM_HELPER_DIRECTORY_IDENTITY_CHANGED",
          canonicalTokenFile);
      }
      const bytes = readRegularFileNoFollow(canonicalTokenFile, {
        symlinkCode: "SYSTEM_HELPER_TOKEN_SYMLINK_REFUSED",
        typeCode: "SYSTEM_HELPER_TOKEN_TYPE_REFUSED",
        privateMode: true,
      });
      const after = lstatOrNull(canonicalTokenFile);
      if (!sameFileIdentity(before, after) || !directoryChainIsStable(secured.chain)) {
        throw systemHelperFileError("SYSTEM_HELPER_TOKEN_IDENTITY_CHANGED",
          canonicalTokenFile);
      }
      const serializedToken = bytes.toString("utf8");
      if (!serializedToken) throw new Error("SYSTEM_HELPER_TOKEN_EMPTY");
      if (!CANONICAL_UUID_V4_TOKEN.test(serializedToken)) {
        /* Never include token bytes in an error: this branch also handles a
         * damaged file that happens to contain some other local secret. */
        throw new Error("SYSTEM_HELPER_TOKEN_FORMAT_INVALID");
      }
      return serializedToken.endsWith("\n")
        ? serializedToken.slice(0, -1) : serializedToken;
    }

    if (!directoryChainIsStable(secured.chain)) {
      throw systemHelperFileError("SYSTEM_HELPER_DIRECTORY_IDENTITY_CHANGED",
        canonicalTokenFile);
    }
    const token = randomUUID();
    let descriptor;
    let created;
    try {
      descriptor = openSync(canonicalTokenFile,
        constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | NOFOLLOW, 0o600);
    } catch (error) {
      if (error?.code === "EEXIST") continue;
      throw error;
    }
    try {
      fchmodSync(descriptor, 0o600);
      writeFileSync(descriptor, `${token}\n`);
      fsyncSync(descriptor);
      created = fstatSync(descriptor, { bigint: true });
    } finally {
      closeSync(descriptor);
    }
    const installed = lstatSync(canonicalTokenFile, { bigint: true });
    if (!installed.isFile() || installed.isSymbolicLink()
      || (Number(installed.mode) & 0o777) !== 0o600
      || !sameNodeIdentity(created, installed)
      || !directoryChainIsStable(secured.chain)) {
      throw systemHelperFileError("SYSTEM_HELPER_TOKEN_VERIFY_FAILED", canonicalTokenFile);
    }
    fsyncDirectory(secured.directory);
    return token;
  }
  throw systemHelperFileError("SYSTEM_HELPER_TOKEN_CREATE_RACE", canonicalTokenFile);
}

export function installSystemHelper({ sourceRoot, home, nodeExecutable = process.execPath,
  uid = process.getuid?.() ?? 0, run = spawnSync, register = true,
  supervisorCommand = null, allowExternalSupervisor = false } = {}) {
  const { sourcePackage } = sourcePackageAt(sourceRoot);
  const version = String(sourcePackage.version ?? "");
  if (!version || version === "." || version === ".." || path.basename(version) !== version) {
    throw new Error("SYSTEM_HELPER_VERSION_INVALID");
  }
  const trustedHome = path.resolve(home);
  realpathSync(trustedHome);
  const target = systemHelperPaths({ home: trustedHome, version, uid });
  stageSystemHelperRuntime({ sourceRoot, targetRoot: target.releaseRoot,
    trustedRoot: trustedHome });
  const token = stableSystemHelperToken(target.tokenFile, trustedHome);
  const plist = systemHelperPlist({
    nodeExecutable,
    entry: target.entry,
    workingDirectory: target.releaseRoot,
    attachedRoot: target.attachedRoot,
    socketPath: target.socketPath,
    token,
    stdoutFile: target.stdoutFile,
    stderrFile: target.stderrFile,
    environmentPath: process.env.PATH,
    supervisorCommand,
    allowExternalSupervisor,
  });
  writePrivateFileAtomically(target.plistFile, plist, {
    trustedRoot: trustedHome,
    directorySymlinkCode: "SYSTEM_HELPER_PLIST_DIRECTORY_SYMLINK_REFUSED",
    finalSymlinkCode: "SYSTEM_HELPER_PLIST_SYMLINK_REFUSED",
    identityCode: "SYSTEM_HELPER_PLIST_IDENTITY_CHANGED",
    durable: true,
  });
  if (!register) {
    return { ...target, version: sourcePackage.version, label: SYSTEM_HELPER_LABEL,
      protocolVersion: SYSTEM_HELPER_PROTOCOL, registered: false,
      externalSupervisorConfigured: allowExternalSupervisor === true };
  }
  const domain = `gui/${uid}`;
  runLaunchctl(["bootout", domain, target.plistFile], run);
  const boot = runLaunchctl(["bootstrap", domain, target.plistFile], run);
  if (boot.error || boot.status !== 0) {
    throw new Error(`SYSTEM_HELPER_BOOTSTRAP_FAILED:${boot.error?.message
      ?? String(boot.stderr ?? boot.stdout ?? `exit ${boot.status}`).trim()}`);
  }
  const kick = runLaunchctl(["kickstart", "-k", `${domain}/${SYSTEM_HELPER_LABEL}`], run);
  if (kick.error || kick.status !== 0) {
    throw new Error(`SYSTEM_HELPER_KICKSTART_FAILED:${kick.error?.message
      ?? String(kick.stderr ?? kick.stdout ?? `exit ${kick.status}`).trim()}`);
  }
  return { ...target, version: sourcePackage.version, label: SYSTEM_HELPER_LABEL,
    protocolVersion: SYSTEM_HELPER_PROTOCOL, registered: true,
    externalSupervisorConfigured: allowExternalSupervisor === true };
}
