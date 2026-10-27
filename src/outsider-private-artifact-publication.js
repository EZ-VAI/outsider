import { randomBytes } from "node:crypto";
import {
  closeSync, constants, fchmodSync, fsyncSync, fstatSync, linkSync, lstatSync,
  mkdirSync, openSync, readFileSync, unlinkSync, writeFileSync,
} from "node:fs";
import path from "node:path";

const NOFOLLOW = constants.O_NOFOLLOW ?? 0;
const DIRECTORY = constants.O_DIRECTORY ?? 0;

function fail(code, detail = "") {
  throw new Error(`PRIVATE_ARTIFACT_PUBLICATION_${code}${detail ? `:${detail}` : ""}`);
}

function isInside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative !== "" && relative !== ".." && !relative.startsWith(`..${path.sep}`)
    && !path.isAbsolute(relative);
}

function sameNode(left, right) {
  return left.dev === right.dev && left.ino === right.ino
    && (left.mode & 0o170000n) === (right.mode & 0o170000n);
}

function sameFile(left, right) {
  return sameNode(left, right) && left.mode === right.mode && left.size === right.size
    && left.mtimeNs === right.mtimeNs && left.ctimeNs === right.ctimeNs;
}

function lstatOrNull(target) {
  try { return lstatSync(target, { bigint: true }); }
  catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

function openCheckedDirectory(directory) {
  const initial = lstatOrNull(directory);
  if (!initial || initial.isSymbolicLink() || !initial.isDirectory()) {
    fail("DIRECTORY_UNSAFE", directory);
  }
  let descriptor;
  try {
    descriptor = openSync(directory, constants.O_RDONLY | DIRECTORY | NOFOLLOW);
    const opened = fstatSync(descriptor, { bigint: true });
    if (!opened.isDirectory() || !sameNode(initial, opened)) {
      fail("DIRECTORY_IDENTITY_CHANGED", directory);
    }
    return { descriptor, stat: opened };
  } catch (error) {
    if (descriptor != null) closeSync(descriptor);
    if (String(error?.message ?? "").startsWith("PRIVATE_ARTIFACT_PUBLICATION_")) throw error;
    fail("DIRECTORY_UNSAFE", directory);
  }
}

function assertDirectoryNodes(nodes) {
  for (const node of nodes) {
    const current = lstatOrNull(node.path);
    if (!current || current.isSymbolicLink() || !current.isDirectory()
      || !sameNode(node.stat, current)) fail("DIRECTORY_IDENTITY_CHANGED", node.path);
    if (node.private && (current.mode & 0o777n) !== 0o700n) {
      fail("DIRECTORY_MODE_CHANGED", node.path);
    }
  }
}

function ensurePrivateParent(trustedRoot, parent) {
  const resolvedRoot = path.resolve(trustedRoot);
  const resolvedParent = path.resolve(parent);
  if (resolvedRoot === path.parse(resolvedRoot).root) fail("TRUSTED_ROOT_TOO_BROAD");
  if (resolvedParent === resolvedRoot || !isInside(resolvedRoot, resolvedParent)) {
    fail("OUTPUT_OUTSIDE_PRIVATE_SUBDIRECTORY", resolvedParent);
  }

  const root = openCheckedDirectory(resolvedRoot);
  closeSync(root.descriptor);
  const nodes = [{ path: resolvedRoot, stat: root.stat, private: false }];
  let current = resolvedRoot;
  const relativeParts = path.relative(resolvedRoot, resolvedParent).split(path.sep);
  for (const part of relativeParts) {
    current = path.join(current, part);
    try { mkdirSync(current, { mode: 0o700 }); }
    catch (error) { if (error?.code !== "EEXIST") throw error; }
    const opened = openCheckedDirectory(current);
    try {
      fchmodSync(opened.descriptor, 0o700);
      const privateStat = fstatSync(opened.descriptor, { bigint: true });
      if ((privateStat.mode & 0o777n) !== 0o700n) fail("DIRECTORY_MODE_INVALID", current);
      nodes.push({ path: current, stat: privateStat, private: true });
    } finally { closeSync(opened.descriptor); }
  }
  assertDirectoryNodes(nodes);
  return nodes;
}

function readRegularFileNoFollow(file) {
  const initial = lstatOrNull(file);
  if (!initial || initial.isSymbolicLink() || !initial.isFile()) fail("TARGET_UNSAFE", file);
  let descriptor;
  try {
    descriptor = openSync(file, constants.O_RDONLY | NOFOLLOW);
    const before = fstatSync(descriptor, { bigint: true });
    if (!before.isFile() || !sameFile(initial, before)) fail("TARGET_IDENTITY_CHANGED", file);
    const bytes = readFileSync(descriptor);
    const after = fstatSync(descriptor, { bigint: true });
    const finalPath = lstatOrNull(file);
    if (!finalPath || !sameFile(before, after) || !sameFile(before, finalPath)) {
      fail("TARGET_CHANGED_DURING_READ", file);
    }
    return { bytes, stat: after };
  } finally { if (descriptor != null) closeSync(descriptor); }
}

function openRandomTemporary(parent, basename) {
  for (let attempt = 0; attempt < 16; attempt += 1) {
    const temporary = path.join(parent,
      `.${basename}.tmp-${process.pid}-${randomBytes(16).toString("hex")}`);
    try {
      const descriptor = openSync(temporary,
        constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | NOFOLLOW, 0o600);
      return { descriptor, temporary };
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
    }
  }
  fail("TEMPORARY_NAME_EXHAUSTED", parent);
}

/**
 * Atomically publishes a private regular file without replacing an existing path.
 * All path components below trustedRoot are symlink-rejected and made mode 0700.
 */
export function publishPrivateArtifact(outputPath, input, {
  trustedRoot,
  allowExistingIdentical = false,
} = {}) {
  const output = path.resolve(outputPath);
  const root = path.resolve(trustedRoot ?? process.cwd());
  if (output === path.parse(output).root) fail("OUTPUT_TOO_BROAD");
  if (!isInside(root, output)) fail("OUTPUT_OUTSIDE_TRUSTED_ROOT", output);
  const payload = Buffer.isBuffer(input) ? input : Buffer.from(String(input), "utf8");
  const parent = path.dirname(output);
  const nodes = ensurePrivateParent(root, parent);

  const existing = lstatOrNull(output);
  if (existing) {
    if (existing.isSymbolicLink() || !existing.isFile()) fail("TARGET_UNSAFE", output);
    if (!allowExistingIdentical) fail("TARGET_EXISTS", output);
    const current = readRegularFileNoFollow(output);
    if ((current.stat.mode & 0o777n) !== 0o600n) fail("TARGET_MODE_INVALID", output);
    if (!current.bytes.equals(payload)) fail("TARGET_CONTENT_CONFLICT", output);
    assertDirectoryNodes(nodes);
    return { output, created: false, reusedIdentical: true, bytes: payload.length };
  }

  const { descriptor, temporary } = openRandomTemporary(parent, path.basename(output));
  let open = true;
  let published = false;
  try {
    fchmodSync(descriptor, 0o600);
    writeFileSync(descriptor, payload);
    fsyncSync(descriptor);
    const temporaryStat = fstatSync(descriptor, { bigint: true });
    if (!temporaryStat.isFile() || temporaryStat.size !== BigInt(payload.length)
      || (temporaryStat.mode & 0o777n) !== 0o600n) fail("TEMPORARY_FILE_INVALID", temporary);
    closeSync(descriptor); open = false;

    assertDirectoryNodes(nodes);
    if (lstatOrNull(output)) fail("TARGET_EXISTS", output);
    try { linkSync(temporary, output); }
    catch (error) {
      if (error?.code === "EEXIST") fail("TARGET_EXISTS", output);
      throw error;
    }
    published = true;

    const temporaryAfter = lstatSync(temporary, { bigint: true });
    const outputAfter = lstatSync(output, { bigint: true });
    if (!temporaryAfter.isFile() || outputAfter.isSymbolicLink() || !outputAfter.isFile()
      || !sameNode(temporaryAfter, outputAfter)
      || (outputAfter.mode & 0o777n) !== 0o600n
      || outputAfter.size !== BigInt(payload.length)) fail("PUBLISHED_FILE_INVALID", output);
    assertDirectoryNodes(nodes);
    const parentHandle = openCheckedDirectory(parent);
    try { fsyncSync(parentHandle.descriptor); }
    finally { closeSync(parentHandle.descriptor); }
  } finally {
    if (open) closeSync(descriptor);
    try { unlinkSync(temporary); }
    catch (error) { if (error?.code !== "ENOENT") throw error; }
  }
  if (!published) fail("PUBLICATION_FAILED", output);
  return { output, created: true, reusedIdentical: false, bytes: payload.length };
}
