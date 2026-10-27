/*
 * Read-only GitHub repository policy capability used before an ephemeral
 * Release Asset is created. A 404 from the immutable-release endpoint means
 * "disabled" only after the same credential receives HTTP 200 from GitHub's
 * same-repository Actions-permissions endpoint, which independently requires
 * repository Administration:read. The constructor acknowledgement is not used
 * as evidence; both read-only HTTP observations are bound into the receipt.
 */

import { createHash } from "node:crypto";

const API_ORIGIN = "https://api.github.com";
const API_VERSION = "2026-03-10";
const CAPABILITY = "GITHUB_REPOSITORY_ADMINISTRATION_READ";
const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;
const MAX_REQUEST_TIMEOUT_MS = 60_000;
const REPOSITORY_PART = /^[A-Za-z0-9_.-]{1,100}$/u;
const ISSUED_CAPABILITIES = new WeakMap();

function fail(code) {
  const error = new TypeError(
    `OUTSIDER_GITHUB_IMMUTABLE_RELEASE_POLICY_PROBE_V1_${code}`);
  error.outsiderCode = code;
  throw error;
}

function sha256(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function boundedTimeout(value) {
  const selected = value ?? DEFAULT_REQUEST_TIMEOUT_MS;
  if (!Number.isSafeInteger(selected) || selected < 1
    || selected > MAX_REQUEST_TIMEOUT_MS) fail("CONFIG_INVALID");
  return selected;
}

async function boundedBytes(response, maximum = 64 * 1024) {
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > maximum) fail("RESPONSE_TOO_LARGE");
  return bytes;
}

function parseJson(bytes) {
  try { return JSON.parse(bytes.toString("utf8")); } catch { return null; }
}

async function timedRequest(fetchImpl, url, init, timeoutMs, callerSignal) {
  const controller = new AbortController();
  let timer;
  const abortFromCaller = () => controller.abort(callerSignal.reason);
  if (callerSignal?.aborted) abortFromCaller();
  else callerSignal?.addEventListener("abort", abortFromCaller, { once: true });
  const timeout = new Promise((_resolve, reject) => {
    timer = setTimeout(() => {
      const error = new TypeError(
        "OUTSIDER_GITHUB_IMMUTABLE_RELEASE_POLICY_PROBE_V1_REQUEST_TIMEOUT");
      error.outsiderCode = "REQUEST_TIMEOUT";
      controller.abort(error);
      reject(error);
    }, timeoutMs);
  });
  try {
    return await Promise.race([
      Promise.resolve().then(async () => {
        const response = await fetchImpl(url, {
          ...init,
          signal: controller.signal,
        });
        return { response, bytes: await boundedBytes(response) };
      }),
      timeout,
    ]);
  } finally {
    clearTimeout(timer);
    callerSignal?.removeEventListener("abort", abortFromCaller);
  }
}

export function isGitHubImmutableReleasePolicyProductionProbeV1(value,
  input = {}) {
  if (value === null || typeof value !== "object"
    || typeof input.apiToken !== "string") return false;
  const binding = ISSUED_CAPABILITIES.get(value);
  return binding?.credentialHash === sha256(Buffer.from(input.apiToken, "utf8"))
    && binding.owner === input.owner
    && binding.repository === input.repository;
}

export function createGitHubImmutableReleasePolicyProductionProbeV1(input = {}) {
  if (typeof input.apiToken !== "string" || input.apiToken.length < 20
    || input.administrationReadCapabilityConfirmed !== true
    || typeof input.owner !== "string" || !REPOSITORY_PART.test(input.owner)
    || typeof input.repository !== "string"
    || !REPOSITORY_PART.test(input.repository)) fail("CONFIG_INVALID");
  const fetchImpl = input.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") fail("FETCH_INVALID");
  const requestTimeoutMs = boundedTimeout(input.requestTimeoutMs);
  const owner = input.owner;
  const repository = input.repository;
  const repositoryRef = `${owner}/${repository}`;
  const repoUrl = `${API_ORIGIN}/repos/${encodeURIComponent(owner)}`
    + `/${encodeURIComponent(repository)}`;

  async function get(path, signal) {
    const headers = new Headers({
      accept: "application/vnd.github+json",
      authorization: `Bearer ${input.apiToken}`,
      "x-github-api-version": API_VERSION,
      "user-agent": "outsider-outcome-formation-policy-probe-v1",
    });
    return timedRequest(fetchImpl, `${repoUrl}${path}`, {
      method: "GET",
      headers,
      redirect: "error",
    }, requestTimeoutMs, signal);
  }

  async function probe({ owner: selectedOwner, repository: selectedRepository,
    signal } = {}) {
    if (selectedOwner !== owner || selectedRepository !== repository
      || (signal !== undefined && !(signal instanceof AbortSignal))) {
      fail("PROBE_INPUT_INVALID");
    }
    const administration = await get("/actions/permissions", signal);
    const administrationBody = parseJson(administration.bytes);
    if (administration.response.status !== 200
      || !administration.response.ok
      || administrationBody === null
      || typeof administrationBody !== "object"
      || Array.isArray(administrationBody)
      || typeof administrationBody.enabled !== "boolean") {
      fail("ADMINISTRATION_READ_PREFLIGHT_FAILED");
    }

    const { response, bytes } = await get("/immutable-releases", signal);
    const body = parseJson(bytes);
    let status;
    if (response.status === 404) status = "DISABLED";
    else if (response.ok && body?.enabled === true) status = "ENABLED";
    else if (response.ok && body?.enabled === false) status = "DISABLED";
    else fail("POLICY_READ_FAILED");

    const observation = {
      schema: "outsider/github-immutable-release-policy-observation/v1",
      repositoryRef,
      status,
      observedHttpStatus: response.status,
      responseBodyHash: sha256(bytes),
      administrationPreflightHttpStatus: administration.response.status,
      administrationPreflightResponseBodyHash: sha256(administration.bytes),
      immutablePolicyHttpStatus: response.status,
      immutablePolicyResponseBodyHash: sha256(bytes),
      apiVersion: API_VERSION,
      capability: CAPABILITY,
      authorizationBasis: "SAME_CREDENTIAL_ADMINISTRATION_ENDPOINT_200",
    };
    return Object.freeze({
      ...observation,
      observationReceipt: sha256(Buffer.from(JSON.stringify(observation),
        "utf8")),
      containsCredential: false,
    });
  }

  const capability = Object.freeze({
    probeId: input.probeId ?? "github-immutable-release-policy-probe-v1",
    capability: CAPABILITY,
    repositoryRef,
    probe,
  });
  ISSUED_CAPABILITIES.set(capability, Object.freeze({
    credentialHash: sha256(Buffer.from(input.apiToken, "utf8")),
    owner,
    repository,
  }));
  return capability;
}
