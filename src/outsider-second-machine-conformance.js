import { createHash, createPrivateKey, createPublicKey, sign, verify } from "node:crypto";

const digest = (value) => `sha256:${createHash("sha256").update(value).digest("hex")}`;
const canonical = (value) => JSON.stringify(value);

export function machineIdentity(environment = {}) {
  const normalized = {
    platform: String(environment.platform ?? ""),
    arch: String(environment.arch ?? ""),
    release: String(environment.release ?? ""),
    hostname: String(environment.hostname ?? ""),
  };
  return { environment: normalized,
    machineIdentityHash: digest(`outsider-machine-identity\0${canonical(normalized)}`) };
}

export function signSecondMachineConformance(body, privateKeyPem) {
  const privateKey = createPrivateKey(privateKeyPem);
  const publicKey = createPublicKey(privateKey);
  const publicDer = publicKey.export({ type: "spki", format: "der" });
  const normalizedBody = { ...body,
    schema: "outsider/stage05-second-machine-conformance/v1" };
  const bytes = Buffer.from(canonical(normalizedBody));
  return {
    body: normalizedBody,
    bodyHash: digest(bytes),
    signerPublicKeyHash: digest(publicDer),
    signatureAlgorithm: "ed25519",
    signature: sign(null, bytes, privateKey).toString("base64"),
  };
}

export function verifySecondMachineConformance(record, {
  publicKeyPem,
  expectedArtifactHash,
  expectedVersion,
  expectedEvaluatorHashes,
  primaryMachineIdentityHash,
} = {}) {
  const errors = [];
  const body = record?.body;
  let publicKey = null;
  try { publicKey = createPublicKey(publicKeyPem); }
  catch { errors.push("second-machine witness public key is invalid"); }
  if (body?.schema !== "outsider/stage05-second-machine-conformance/v1") {
    errors.push("second-machine record schema is invalid");
  }
  const bytes = Buffer.from(canonical(body ?? null));
  if (record?.bodyHash !== digest(bytes)) errors.push("second-machine record hash is invalid");
  if (publicKey) {
    const publicDer = publicKey.export({ type: "spki", format: "der" });
    if (record?.signerPublicKeyHash !== digest(publicDer)) {
      errors.push("second-machine signer differs from the trusted public key");
    }
    let valid = false;
    try { valid = verify(null, bytes, publicKey, Buffer.from(String(record?.signature ?? ""), "base64")); }
    catch { valid = false; }
    if (!valid) errors.push("second-machine signature is invalid");
  }
  const identity = machineIdentity(body?.environment);
  if (body?.machineIdentityHash !== identity.machineIdentityHash) {
    errors.push("second-machine identity commitment is invalid");
  }
  if (!primaryMachineIdentityHash || body?.machineIdentityHash === primaryMachineIdentityHash) {
    errors.push("second-machine evidence is not from a distinct host identity");
  }
  if (body?.artifact?.sha256 !== expectedArtifactHash
    || body?.artifact?.packageVersion !== expectedVersion) {
    errors.push("second-machine artifact differs from the release artifact");
  }
  if (!expectedEvaluatorHashes
    || Object.entries(expectedEvaluatorHashes).some(([name, value]) =>
      body?.evaluatorHashes?.[name] !== value)) {
    errors.push("second-machine evaluator differs from the release evaluator");
  }
  const requiredChecks = ["cleanInstall", "version", "help", "doctor", "packageTests",
    "corpus", "projectScopedInstall"];
  for (const name of requiredChecks) {
    if (body?.checks?.[name]?.ok !== true) errors.push(`second-machine check did not pass: ${name}`);
  }
  if (body?.checks?.version?.observedVersion !== expectedVersion) {
    errors.push("second-machine installed version differs from the release");
  }
  return {
    ok: errors.length === 0,
    status: errors.length ? "FAIL" : "PASS",
    gate: "SECOND_MACHINE",
    machineIdentityHash: body?.machineIdentityHash ?? null,
    signerPublicKeyHash: record?.signerPublicKeyHash ?? null,
    artifactHash: body?.artifact?.sha256 ?? null,
    errors,
  };
}
