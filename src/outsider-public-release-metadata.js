import { createHash, randomUUID } from "node:crypto";
import {
  closeSync, constants, fchmodSync, fstatSync, fsyncSync, lstatSync, mkdirSync, openSync,
  readFileSync, readdirSync, renameSync, unlinkSync, writeFileSync,
} from "node:fs";
import path from "node:path";

export const PUBLIC_FIELD_GATES = Object.freeze([
  "liveCanary",
  "r1Repeatability",
  "r2AgentTeamDelivery",
  "r3IntegrationCorrection",
  "r4CrashRecovery",
  "localClaudeHost",
  "transparentAttachedHook",
  "desktopCoworkPlugin",
  "multiHourEndurance",
  "independentSecondMachineInstall",
  "codexLifecycleControl",
  "chatgptLivePluginInstall",
  "chatgptNewChatSkillEvaluation",
  "openAIPluginsDirectoryPublication",
  "traeLifecycleControl",
]);

export const PUBLIC_DETERMINISTIC_CHECKS = Object.freeze([
  "cleanInstall",
  "version",
  "help",
  "doctor",
  "packageTests",
  "corpus",
  "transparentInstall",
  "projectScopedInstall",
  "desktopPluginPackage",
  "openAIUniversalPluginPackage",
  "certifierSourceClosure",
]);

export const PUBLIC_CLAIM_BOUNDARIES = Object.freeze([
  "certificate covers the named artifact on the recorded environment only",
  "deterministic tests do not prove multi-hour semantic reliability",
  "NOT_RUN and UNSUPPORTED are never counted as PASS",
  "plugin packaging does not establish ChatGPT live install or Codex lifecycle control",
]);

const SHA256 = /^sha256:[a-f0-9]{64}$/;
const STATUS = /^[A-Z][A-Z0-9_:-]{0,63}$/;
const SAFE_FILE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,254}$/;
const NOFOLLOW = constants.O_NOFOLLOW ?? 0;
const DIRECTORY = constants.O_DIRECTORY ?? 0;

function fail(code) {
  throw new Error(code);
}

function object(value, code) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(code);
  return value;
}

export function sha256Bytes(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function safeFileName(value, code) {
  if (typeof value !== "string" || !SAFE_FILE.test(value) || path.basename(value) !== value) {
    fail(code);
  }
  return value;
}

function status(value, code) {
  if (typeof value !== "string" || !STATUS.test(value)) fail(code);
  return value;
}

function claimBoundary(value) {
  if (!Array.isArray(value)
    || value.length !== PUBLIC_CLAIM_BOUNDARIES.length
    || value.some((item, index) => item !== PUBLIC_CLAIM_BOUNDARIES[index])) {
    fail("PUBLIC_RELEASE_CLAIM_BOUNDARY_INVALID");
  }
  return [...value];
}

function fileError(code, file) {
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

function sameFile(left, right) {
  return Boolean(left && right && left.isFile() && right.isFile()
    && left.dev === right.dev && left.ino === right.ino && left.mode === right.mode
    && left.size === right.size && left.mtimeNs === right.mtimeNs
    && left.ctimeNs === right.ctimeNs);
}

function sameDirectory(left, right) {
  return Boolean(left && right && left.isDirectory() && right.isDirectory()
    && left.dev === right.dev && left.ino === right.ino && left.mode === right.mode);
}

function sameNode(left, right) {
  return Boolean(left && right && left.dev === right.dev && left.ino === right.ino
    && left.mode === right.mode && left.size === right.size);
}

function sameInode(left, right) {
  return Boolean(left && right && left.dev === right.dev && left.ino === right.ino);
}

function readRequired(file, code, testOnlyReadObserver) {
  const absolute = path.resolve(file);
  const before = lstatOrNull(absolute);
  if (!before) fail(code);
  if (before.isSymbolicLink()) throw fileError("PUBLIC_RELEASE_INPUT_SYMLINK_REFUSED", absolute);
  if (!before.isFile()) throw fileError("PUBLIC_RELEASE_INPUT_TYPE_REFUSED", absolute);
  const descriptor = openSync(absolute, constants.O_RDONLY | NOFOLLOW);
  try {
    const opened = fstatSync(descriptor, { bigint: true });
    if (!sameFile(before, opened)) {
      throw fileError("PUBLIC_RELEASE_INPUT_IDENTITY_CHANGED", absolute);
    }
    testOnlyReadObserver?.({ phase: "input-opened", file: absolute });
    const bytes = readFileSync(descriptor);
    testOnlyReadObserver?.({ phase: "input-read", file: absolute });
    const after = fstatSync(descriptor, { bigint: true });
    const current = lstatOrNull(absolute);
    if (!sameFile(opened, after) || !sameFile(after, current)) {
      throw fileError("PUBLIC_RELEASE_INPUT_IDENTITY_CHANGED", absolute);
    }
    return { absolute, bytes, size: Number(after.size), stats: after };
  } finally {
    closeSync(descriptor);
  }
}

function revalidateRequiredInputs(inputs) {
  for (const input of inputs) {
    const current = readRequired(input.absolute, "PUBLIC_RELEASE_INPUT_MISSING");
    if (!sameFile(input.stats, current.stats) || !input.bytes.equals(current.bytes)) {
      throw fileError("PUBLIC_RELEASE_INPUT_IDENTITY_CHANGED", input.absolute);
    }
  }
}

function stableReadOutput(file) {
  const before = lstatOrNull(file);
  if (!before || before.isSymbolicLink() || !before.isFile()) {
    throw fileError("PUBLIC_RELEASE_OUTPUT_IDENTITY_CHANGED", file);
  }
  const descriptor = openSync(file, constants.O_RDONLY | NOFOLLOW);
  try {
    const opened = fstatSync(descriptor, { bigint: true });
    const bytes = readFileSync(descriptor);
    const after = fstatSync(descriptor, { bigint: true });
    const current = lstatOrNull(file);
    if (!sameFile(before, opened) || !sameFile(opened, after) || !sameFile(after, current)) {
      throw fileError("PUBLIC_RELEASE_OUTPUT_IDENTITY_CHANGED", file);
    }
    return { bytes, stats: after };
  } finally {
    closeSync(descriptor);
  }
}

function readJson(bytes) {
  try {
    return JSON.parse(bytes.toString("utf8"));
  } catch {
    fail("PUBLIC_RELEASE_CERTIFICATE_INVALID_JSON");
  }
}

function projectGateStatuses(fieldEvidence) {
  const evidence = object(fieldEvidence, "PUBLIC_RELEASE_FIELD_EVIDENCE_INVALID");
  return Object.fromEntries(PUBLIC_FIELD_GATES.map((name) => {
    const gate = object(evidence[name], `PUBLIC_RELEASE_GATE_MISSING:${name}`);
    return [name, status(gate.status, `PUBLIC_RELEASE_GATE_STATUS_INVALID:${name}`)];
  }));
}

function projectDeterministicChecks(checks) {
  const source = object(checks, "PUBLIC_RELEASE_CHECKS_INVALID");
  return Object.fromEntries(PUBLIC_DETERMINISTIC_CHECKS.map((name) => {
    const check = object(source[name], `PUBLIC_RELEASE_CHECK_MISSING:${name}`);
    if (typeof check.ok !== "boolean") fail(`PUBLIC_RELEASE_CHECK_STATUS_INVALID:${name}`);
    return [name, check.ok ? "PASS" : "FAIL"];
  }));
}

export function buildPublicReleaseCertificate({
  exactCertificateBytes,
  npmArtifactBytes,
  npmArtifactFile,
  pluginArtifactBytes,
  pluginArtifactFile,
  expectedProduct,
} = {}) {
  if (!Buffer.isBuffer(exactCertificateBytes)
    || !Buffer.isBuffer(npmArtifactBytes) || !Buffer.isBuffer(pluginArtifactBytes)) {
    fail("PUBLIC_RELEASE_BYTES_REQUIRED");
  }
  const certificate = object(readJson(exactCertificateBytes),
    "PUBLIC_RELEASE_CERTIFICATE_INVALID");
  if (certificate.schema !== "outsider/stage05-release-certificate/v1") {
    fail("PUBLIC_RELEASE_CERTIFICATE_SCHEMA_INVALID");
  }
  const product = object(certificate.product, "PUBLIC_RELEASE_PRODUCT_INVALID");
  if (typeof product.name !== "string" || typeof product.version !== "string"
    || !product.name || !product.version) {
    fail("PUBLIC_RELEASE_PRODUCT_INVALID");
  }
  if (expectedProduct && (product.name !== expectedProduct.name
    || product.version !== expectedProduct.version)) {
    fail("PUBLIC_RELEASE_PACKAGE_VERSION_MISMATCH");
  }

  const npmFile = safeFileName(npmArtifactFile, "PUBLIC_RELEASE_NPM_FILENAME_INVALID");
  const pluginFile = safeFileName(pluginArtifactFile, "PUBLIC_RELEASE_PLUGIN_FILENAME_INVALID");
  const expectedNpmFile = `${product.name}-${product.version}.tgz`;
  const expectedPluginFile = `${product.name}-${product.version}-claude.plugin.zip`;
  if (npmFile !== expectedNpmFile) fail("PUBLIC_RELEASE_NPM_FILENAME_MISMATCH");
  if (pluginFile !== expectedPluginFile) fail("PUBLIC_RELEASE_PLUGIN_FILENAME_MISMATCH");

  const exactArtifact = object(certificate.artifact, "PUBLIC_RELEASE_ARTIFACT_INVALID");
  const npmHash = sha256Bytes(npmArtifactBytes);
  if (exactArtifact.file !== npmFile || !SHA256.test(exactArtifact.sha256 ?? "")
    || exactArtifact.sha256 !== npmHash) {
    fail("PUBLIC_RELEASE_NPM_ARTIFACT_HASH_MISMATCH");
  }
  const exactPluginArtifact = object(certificate.coworkPluginArtifact,
    "PUBLIC_RELEASE_PLUGIN_ARTIFACT_INVALID");
  const pluginHash = sha256Bytes(pluginArtifactBytes);
  if (exactPluginArtifact.file !== pluginFile
    || !SHA256.test(exactPluginArtifact.sha256 ?? "")
    || exactPluginArtifact.sha256 !== pluginHash
    || exactPluginArtifact.byteLength !== pluginArtifactBytes.length
    || exactPluginArtifact.layoutValidation !== "PASS"
    || !Number.isSafeInteger(exactPluginArtifact.memberCount)
    || exactPluginArtifact.memberCount < 1) {
    fail("PUBLIC_RELEASE_PLUGIN_ARTIFACT_HASH_MISMATCH");
  }
  const releaseDecision = status(certificate.releaseDecision,
    "PUBLIC_RELEASE_DECISION_INVALID");
  if (typeof certificate.stablePublicReleaseReady !== "boolean") {
    fail("PUBLIC_RELEASE_STABLE_FLAG_INVALID");
  }

  return {
    schema: "outsider/stage05-public-release-certificate/v1",
    product: { name: product.name, version: product.version },
    sourceCertificateCommitment: {
      schema: certificate.schema,
      sha256: sha256Bytes(exactCertificateBytes),
      byteLength: exactCertificateBytes.length,
    },
    assets: {
      npm: { file: npmFile, sha256: npmHash, byteLength: npmArtifactBytes.length },
      coworkPlugin: {
        file: pluginFile,
        sha256: pluginHash,
        byteLength: pluginArtifactBytes.length,
        layoutValidation: "PASS",
        memberCount: exactPluginArtifact.memberCount,
      },
    },
    deterministicChecks: projectDeterministicChecks(certificate.checks),
    fieldGateStatuses: projectGateStatuses(certificate.fieldEvidence),
    releaseDecision,
    stablePublicReleaseReady: certificate.stablePublicReleaseReady,
    claimBoundary: claimBoundary(certificate.claimBoundary),
  };
}

export function renderSha256Sums(entries) {
  if (!Array.isArray(entries) || entries.length === 0) fail("SHA256SUMS_ENTRIES_REQUIRED");
  const names = new Set();
  const validated = entries.map(({ file, sha256 }) => {
    const name = safeFileName(file, "SHA256SUMS_FILENAME_INVALID");
    if (names.has(name)) fail("SHA256SUMS_DUPLICATE_FILENAME");
    names.add(name);
    if (!SHA256.test(sha256 ?? "")) fail("SHA256SUMS_HASH_INVALID");
    return { name, sha256 };
  }).sort((left, right) => left.name.localeCompare(right.name));
  return `${validated.map(({ name, sha256 }) => (
    `${sha256.slice("sha256:".length)}  ${name}`
  )).join("\n")}\n`;
}

function secureOutputDirectory(outputDirectory, trustedOutputRoot) {
  const root = path.resolve(trustedOutputRoot);
  const directory = path.resolve(outputDirectory);
  const relative = path.relative(root, directory);
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw fileError("PUBLIC_RELEASE_OUTPUT_OUTSIDE_TRUSTED_ROOT", directory);
  }
  const rootStats = lstatSync(root, { bigint: true });
  if (rootStats.isSymbolicLink()) throw fileError("PUBLIC_RELEASE_OUTPUT_SYMLINK_REFUSED", root);
  if (!rootStats.isDirectory()) throw fileError("PUBLIC_RELEASE_OUTPUT_DIRECTORY_REQUIRED", root);
  const chain = [{ file: root, stats: rootStats }];
  let current = root;
  for (const component of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, component);
    let stats = lstatOrNull(current);
    if (!stats) {
      try {
        mkdirSync(current, { mode: 0o755 });
      } catch (error) {
        if (error?.code !== "EEXIST") throw error;
      }
      stats = lstatSync(current, { bigint: true });
    }
    if (stats.isSymbolicLink()) throw fileError("PUBLIC_RELEASE_OUTPUT_SYMLINK_REFUSED", current);
    if (!stats.isDirectory()) {
      throw fileError("PUBLIC_RELEASE_OUTPUT_DIRECTORY_REQUIRED", current);
    }
    chain.push({ file: current, stats });
  }
  return { directory, chain };
}

function stableDirectoryChain(chain) {
  return chain.every(({ file, stats }) => {
    const current = lstatOrNull(file);
    return current && !current.isSymbolicLink() && sameDirectory(stats, current);
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

function atomicWrite(file, bytes, secured, testOnlyWriteObserver) {
  const before = lstatOrNull(file);
  if (before?.isSymbolicLink()) throw fileError("PUBLIC_RELEASE_OUTPUT_SYMLINK_REFUSED", file);
  if (before && !before.isFile()) throw fileError("PUBLIC_RELEASE_OUTPUT_TYPE_REFUSED", file);
  let descriptor;
  let temporary;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    temporary = path.join(secured.directory,
      `.${path.basename(file)}.${randomUUID()}.tmp`);
    try {
      descriptor = openSync(temporary,
        constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | NOFOLLOW, 0o644);
      break;
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
    }
  }
  if (descriptor == null) throw fileError("PUBLIC_RELEASE_TEMP_CREATE_FAILED", file);
  let temporaryExists = true;
  let written;
  let owned;
  try {
    try {
      owned = fstatSync(descriptor, { bigint: true });
      fchmodSync(descriptor, 0o644);
      writeFileSync(descriptor, bytes);
      fsyncSync(descriptor);
      written = fstatSync(descriptor, { bigint: true });
    } finally {
      closeSync(descriptor);
    }
    testOnlyWriteObserver?.({ phase: "output-temp-durable", file, temporary });
    if (!stableDirectoryChain(secured.chain)) {
      throw fileError("PUBLIC_RELEASE_OUTPUT_PARENT_IDENTITY_CHANGED", file);
    }
    const stableTemporary = stableReadOutput(temporary);
    if (!sameFile(written, stableTemporary.stats) || !Buffer.from(bytes).equals(stableTemporary.bytes)) {
      throw fileError("PUBLIC_RELEASE_TEMP_IDENTITY_CHANGED", temporary);
    }
    const current = lstatOrNull(file);
    if (current?.isSymbolicLink()) throw fileError("PUBLIC_RELEASE_OUTPUT_SYMLINK_REFUSED", file);
    if ((before == null) !== (current == null) || (before && !sameFile(before, current))) {
      throw fileError("PUBLIC_RELEASE_OUTPUT_IDENTITY_CHANGED", file);
    }
    renameSync(temporary, file);
    temporaryExists = false;
    fsyncDirectory(secured.directory);
    const stableInstalled = stableReadOutput(file);
    if (!sameNode(written, stableInstalled.stats)
      || (Number(stableInstalled.stats.mode) & 0o777) !== 0o644
      || !Buffer.from(bytes).equals(stableInstalled.bytes)
      || !stableDirectoryChain(secured.chain)) {
      throw fileError("PUBLIC_RELEASE_OUTPUT_PUBLISH_VERIFY_FAILED", file);
    }
    return stableInstalled;
  } finally {
    if (temporaryExists) {
      const current = lstatOrNull(temporary);
      if (current && sameInode(owned, current)) unlinkSync(temporary);
      else if (current) throw fileError("PUBLIC_RELEASE_TEMP_IDENTITY_CHANGED", temporary);
    }
  }
}

function optionalOutputSnapshot(file) {
  const stats = lstatOrNull(file);
  if (!stats) return null;
  if (stats.isSymbolicLink()) throw fileError("PUBLIC_RELEASE_OUTPUT_SYMLINK_REFUSED", file);
  if (!stats.isFile()) throw fileError("PUBLIC_RELEASE_OUTPUT_TYPE_REFUSED", file);
  return stableReadOutput(file);
}

function rollbackOutput(file, original, attemptedBytes, secured, published) {
  const current = optionalOutputSnapshot(file);
  if (!current) {
    if (original) throw fileError("PUBLIC_RELEASE_OUTPUT_ROLLBACK_IDENTITY_CHANGED", file);
    return;
  }
  if (original && current.bytes.equals(original.bytes)) return;
  if (!Buffer.from(attemptedBytes).equals(current.bytes)
    && !(published && sameInode(published.stats, current.stats))) {
    throw fileError("PUBLIC_RELEASE_OUTPUT_ROLLBACK_IDENTITY_CHANGED", file);
  }
  if (original) {
    atomicWrite(file, original.bytes, secured, null);
  } else {
    const before = lstatSync(file, { bigint: true });
    const verified = stableReadOutput(file);
    if (!sameFile(before, verified.stats) || !verified.bytes.equals(current.bytes)) {
      throw fileError("PUBLIC_RELEASE_OUTPUT_ROLLBACK_IDENTITY_CHANGED", file);
    }
    unlinkSync(file);
    fsyncDirectory(secured.directory);
  }
}

function revalidatePublishedOutput(file, expectedBytes, published) {
  const current = stableReadOutput(file);
  if (!sameFile(published.stats, current.stats)
    || (Number(current.stats.mode) & 0o777) !== 0o644
    || !Buffer.from(expectedBytes).equals(current.bytes)) {
    throw fileError("PUBLIC_RELEASE_OUTPUT_IDENTITY_CHANGED", file);
  }
}

export function writePublicReleaseMetadata({
  certificatePath,
  npmArtifactPath,
  pluginArtifactPath,
  outputDirectory,
  trustedOutputRoot = path.dirname(path.resolve(outputDirectory)),
  expectedProduct,
  stagePublicUploadSet = false,
  testOnlyReadObserver = null,
  testOnlyWriteObserver = null,
} = {}) {
  const exact = readRequired(certificatePath, "PUBLIC_RELEASE_CERTIFICATE_MISSING",
    testOnlyReadObserver);
  const npm = readRequired(npmArtifactPath, "PUBLIC_RELEASE_NPM_ARTIFACT_MISSING",
    testOnlyReadObserver);
  const plugin = readRequired(pluginArtifactPath, "PUBLIC_RELEASE_PLUGIN_ARTIFACT_MISSING",
    testOnlyReadObserver);
  const projection = buildPublicReleaseCertificate({
    exactCertificateBytes: exact.bytes,
    npmArtifactBytes: npm.bytes,
    npmArtifactFile: path.basename(npm.absolute),
    pluginArtifactBytes: plugin.bytes,
    pluginArtifactFile: path.basename(plugin.absolute),
    expectedProduct,
  });
  const directory = path.resolve(outputDirectory);
  const secured = secureOutputDirectory(directory, trustedOutputRoot);
  const publicFile = `release-certificate-public-${projection.product.version}.json`;
  const publicBytes = Buffer.from(`${JSON.stringify(projection, null, 2)}\n`);
  const sums = renderSha256Sums([
    { file: projection.assets.npm.file, sha256: projection.assets.npm.sha256 },
    { file: projection.assets.coworkPlugin.file,
      sha256: projection.assets.coworkPlugin.sha256 },
    { file: publicFile, sha256: sha256Bytes(publicBytes) },
  ]);
  const publicPath = path.join(directory, publicFile);
  const sumsPath = path.join(directory, "SHA256SUMS");
  revalidateRequiredInputs([exact, npm, plugin]);
  const uploadMembers = [
    { file: projection.assets.npm.file, bytes: npm.bytes,
      sha256: projection.assets.npm.sha256 },
    { file: projection.assets.coworkPlugin.file, bytes: plugin.bytes,
      sha256: projection.assets.coworkPlugin.sha256 },
    { file: publicFile, bytes: publicBytes, sha256: sha256Bytes(publicBytes) },
    { file: "SHA256SUMS", bytes: Buffer.from(sums), sha256: sha256Bytes(sums) },
  ];
  const uploadManifest = {
    schema: "outsider/stage05-public-release-upload-set/v1",
    product: { ...projection.product },
    memberCount: uploadMembers.length,
    members: uploadMembers.map(({ file, bytes, sha256 }) => ({
      file, sha256, byteLength: bytes.length,
    })),
    privateCertificateExcluded: true,
  };
  if (stagePublicUploadSet) {
    if (readdirSync(directory).length !== 0) fail("PUBLIC_RELEASE_UPLOAD_DIRECTORY_NOT_EMPTY");
    const published = [];
    try {
      for (const member of uploadMembers) {
        const file = path.join(directory, member.file);
        const installed = atomicWrite(file, member.bytes, secured, testOnlyWriteObserver);
        published.push({ ...member, path: file, installed });
      }
      for (const member of published) {
        revalidatePublishedOutput(member.path, member.bytes, member.installed);
      }
      const expectedFiles = uploadMembers.map((member) => member.file).sort();
      if (JSON.stringify(readdirSync(directory).sort()) !== JSON.stringify(expectedFiles)) {
        fail("PUBLIC_RELEASE_UPLOAD_MEMBER_SET_INVALID");
      }
      revalidateRequiredInputs([exact, npm, plugin]);
    } catch (error) {
      try {
        for (const member of [...published].reverse()) {
          rollbackOutput(member.path, null, member.bytes, secured, member.installed);
        }
      } catch (rollbackError) {
        rollbackError.cause = error;
        throw rollbackError;
      }
      throw error;
    }
    return {
      publicCertificate: publicPath,
      publicCertificateSha256: sha256Bytes(publicBytes),
      sha256Sums: sumsPath,
      projection,
      publicUploadDirectory: directory,
      publicUploadManifest: uploadManifest,
    };
  }
  const originals = {
    publicCertificate: optionalOutputSnapshot(publicPath),
    sha256Sums: optionalOutputSnapshot(sumsPath),
  };
  let publishedPublic;
  let publishedSums;
  try {
    publishedPublic = atomicWrite(publicPath, publicBytes, secured, testOnlyWriteObserver);
    publishedSums = atomicWrite(sumsPath, sums, secured, testOnlyWriteObserver);
    revalidatePublishedOutput(publicPath, publicBytes, publishedPublic);
    revalidatePublishedOutput(sumsPath, sums, publishedSums);
    revalidateRequiredInputs([exact, npm, plugin]);
  } catch (error) {
    try {
      rollbackOutput(sumsPath, originals.sha256Sums, sums, secured, publishedSums);
      rollbackOutput(publicPath, originals.publicCertificate, publicBytes, secured,
        publishedPublic);
    } catch (rollbackError) {
      rollbackError.cause = error;
      throw rollbackError;
    }
    throw error;
  }
  return {
    publicCertificate: publicPath,
    publicCertificateSha256: sha256Bytes(publicBytes),
    sha256Sums: sumsPath,
    projection,
    publicUploadDirectory: null,
    publicUploadManifest: uploadManifest,
  };
}
