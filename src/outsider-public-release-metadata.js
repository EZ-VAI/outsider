import { createHash } from "node:crypto";
import {
  existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync,
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
  "certifierSourceClosure",
]);

export const PUBLIC_CLAIM_BOUNDARIES = Object.freeze([
  "certificate covers the named artifact on the recorded environment only",
  "deterministic tests do not prove multi-hour semantic reliability",
  "NOT_RUN and UNSUPPORTED are never counted as PASS",
]);

const SHA256 = /^sha256:[a-f0-9]{64}$/;
const STATUS = /^[A-Z][A-Z0-9_:-]{0,63}$/;
const SAFE_FILE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,254}$/;

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

function readRequired(file, code) {
  const absolute = path.resolve(file);
  if (!existsSync(absolute)) fail(code);
  return { absolute, bytes: readFileSync(absolute), size: statSync(absolute).size };
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
        sha256: sha256Bytes(pluginArtifactBytes),
        byteLength: pluginArtifactBytes.length,
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

function atomicWrite(file, bytes) {
  const temporary = `${file}.tmp-${process.pid}`;
  writeFileSync(temporary, bytes, { mode: 0o644 });
  renameSync(temporary, file);
}

export function writePublicReleaseMetadata({
  certificatePath,
  npmArtifactPath,
  pluginArtifactPath,
  outputDirectory,
  expectedProduct,
} = {}) {
  const exact = readRequired(certificatePath, "PUBLIC_RELEASE_CERTIFICATE_MISSING");
  const npm = readRequired(npmArtifactPath, "PUBLIC_RELEASE_NPM_ARTIFACT_MISSING");
  const plugin = readRequired(pluginArtifactPath, "PUBLIC_RELEASE_PLUGIN_ARTIFACT_MISSING");
  const projection = buildPublicReleaseCertificate({
    exactCertificateBytes: exact.bytes,
    npmArtifactBytes: npm.bytes,
    npmArtifactFile: path.basename(npm.absolute),
    pluginArtifactBytes: plugin.bytes,
    pluginArtifactFile: path.basename(plugin.absolute),
    expectedProduct,
  });
  const directory = path.resolve(outputDirectory);
  mkdirSync(directory, { recursive: true });
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
  atomicWrite(publicPath, publicBytes);
  atomicWrite(sumsPath, sums);
  return {
    publicCertificate: publicPath,
    publicCertificateSha256: sha256Bytes(publicBytes),
    sha256Sums: sumsPath,
    projection,
  };
}
