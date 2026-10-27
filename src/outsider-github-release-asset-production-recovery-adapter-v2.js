/*
 * Production recovery adapter backed by an order-scoped GitHub Release Asset.
 *
 * A deterministic prerelease/tag/asset tuple is the remote durable stage. Every
 * mutation is followed by authoritative reads, so a lost acknowledgement is
 * reconciled on this call or the next call without creating a second tuple.
 * reserve() proves that the anonymous download route serves the exact bytes;
 * execute() repeats that proof after the primary route fails; release() removes
 * the asset, release and tag, then proves that the active route is absent.
 * Before any mutation, reserve() requires a separate, repository-bound
 * Administration:read policy capability proving immutable releases disabled;
 * the Contents:write credential alone is intentionally insufficient.
 *
 * Deleting these API-visible objects does not establish physical or irreversible
 * erasure in GitHub's underlying storage. The close receipt deliberately claims
 * only that the active public route and order-scoped API objects were removed.
 */

import { createHash } from "node:crypto";

import { isGitHubImmutableReleasePolicyProductionProbeV1 }
  from "./outsider-github-immutable-release-policy-production-probe-v1.js";

const API_ORIGIN = "https://api.github.com";
const API_VERSION = "2026-03-10";
const CAPABILITY = "PUBLIC_HTTPS_ARTIFACT_PUBLICATION";
const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;
const MAX_REQUEST_TIMEOUT_MS = 60_000;
const DEFAULT_ROUTE_VERIFICATION_TIMEOUT_MS = 15_000;
const MAX_ROUTE_VERIFICATION_TIMEOUT_MS = 60_000;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const SHA = /^[a-f0-9]{40,64}$/u;
const HASH = /^sha256:[a-f0-9]{64}$/u;
const REPOSITORY_PART = /^[A-Za-z0-9_.-]{1,100}$/u;
const TAG = /^outsider-recovery-[a-f0-9]{32}$/u;
const ASSET = /^artifact-[a-f0-9]{32}\.bin$/u;

function fail(code) {
  const error = new TypeError(
    `OUTSIDER_GITHUB_RELEASE_ASSET_PRODUCTION_RECOVERY_V2_${code}`);
  error.outsiderCode = code;
  throw error;
}

function boundedInteger(value, fallback, maximum) {
  const selected = value ?? fallback;
  if (!Number.isSafeInteger(selected) || selected < 1 || selected > maximum) {
    fail("CONFIG_INVALID");
  }
  return selected;
}

async function withRequestTimeout(timeoutMs, request) {
  const controller = new AbortController();
  let timer;
  const timeout = new Promise((_resolve, reject) => {
    timer = setTimeout(() => {
      const error = new TypeError(
        "OUTSIDER_GITHUB_RELEASE_ASSET_PRODUCTION_RECOVERY_V2_REQUEST_TIMEOUT");
      error.outsiderCode = "REQUEST_TIMEOUT";
      controller.abort(error);
      reject(error);
    }, timeoutMs);
  });
  try {
    return await Promise.race([
      Promise.resolve().then(() => request(controller.signal)),
      timeout,
    ]);
  } finally {
    clearTimeout(timer);
  }
}

function sha256(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function namespace(program, requirement) {
  return createHash("sha256")
    .update(`${program.programHash}\0${requirement.requirementId}`, "utf8")
    .digest("hex").slice(0, 32);
}

function parseJson(bytes) {
  try { return JSON.parse(bytes.toString("utf8")); } catch { return null; }
}

async function boundedBytes(response, maximum = MAX_RESPONSE_BYTES) {
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > maximum) fail("RESPONSE_TOO_LARGE");
  return bytes;
}

function maximumDeadline(program, requirement) {
  return program.obligations
    .filter((item) => item.targetRequirementId === requirement.requirementId)
    .reduce((latest, item) => Date.parse(item.deadline) > Date.parse(latest)
      ? item.deadline : latest, program.completionDeadline);
}

function releaseIdentity(suffix, artifactHash) {
  const tag = `outsider-recovery-${suffix}`;
  return Object.freeze({
    tag,
    assetName: `artifact-${suffix}.bin`,
    releaseName: `Outsider recovery ${suffix}`,
    releaseBody: [
      "Outsider order-scoped recovery artifact.",
      `namespace:${suffix}`,
      `artifact:${artifactHash}`,
      "retention:ephemeral-active-route",
    ].join("\n"),
  });
}

function expectedRoute(owner, repository, tag, assetName) {
  return `https://github.com/${encodeURIComponent(owner)}`
    + `/${encodeURIComponent(repository)}/releases/download/`
    + `${encodeURIComponent(tag)}/${encodeURIComponent(assetName)}`;
}

function publicReceipt(kind, state, extra = {}) {
  return sha256(Buffer.from(JSON.stringify({
    schema: "outsider/github-release-asset-production-recovery-receipt/v2",
    kind,
    repository: `${state.owner}/${state.repository}`,
    tag: state.tag,
    assetName: state.assetName,
    artifactHash: state.artifactHash,
    ...extra,
  }), "utf8"));
}

function validateRelease(release, identity) {
  if (release === null || typeof release !== "object" || Array.isArray(release)
    || !Number.isSafeInteger(release.id) || release.id < 1
    || release.tag_name !== identity.tag
    || release.name !== identity.releaseName
    || release.body !== identity.releaseBody
    || release.draft !== false || release.prerelease !== true
    || release.immutable !== false
    || typeof release.target_commitish !== "string"
    || !SHA.test(release.target_commitish)
    || typeof release.upload_url !== "string"
    || !Array.isArray(release.assets)) fail("RELEASE_CONFLICT");
  return release;
}

function validateUploadUrl(url, owner, repository, releaseId) {
  let parsed;
  try { parsed = new URL(url.replace(/\{\?name,label\}$/u, "")); }
  catch { fail("UPLOAD_URL_INVALID"); }
  const expectedPath = `/repos/${encodeURIComponent(owner)}`
    + `/${encodeURIComponent(repository)}/releases/${releaseId}/assets`;
  if (parsed.protocol !== "https:" || parsed.hostname !== "uploads.github.com"
    || parsed.pathname !== expectedPath || parsed.search !== "") {
    fail("UPLOAD_URL_INVALID");
  }
  return parsed.toString();
}

function validateAsset(asset, identity, artifactBytes, routeUrl) {
  if (asset === null || typeof asset !== "object" || Array.isArray(asset)
    || !Number.isSafeInteger(asset.id) || asset.id < 1
    || asset.name !== identity.assetName || asset.state !== "uploaded"
    || asset.content_type !== "application/octet-stream"
    || asset.size !== artifactBytes.length
    || asset.browser_download_url !== routeUrl
    || (asset.digest !== undefined && asset.digest !== null
      && asset.digest !== sha256(artifactBytes))) fail("ASSET_CONFLICT");
  return asset;
}

function checkedState(config, reservation) {
  const state = reservation?.adapterState;
  if (state === null || typeof state !== "object" || Array.isArray(state)
    || state.owner !== config.owner || state.repository !== config.repository
    || state.artifactHash !== config.artifactHash
    || !TAG.test(state.tag) || !ASSET.test(state.assetName)
    || state.assetName.slice("artifact-".length, -".bin".length)
      !== state.tag.slice("outsider-recovery-".length)
    || typeof state.releaseName !== "string"
    || typeof state.releaseBody !== "string"
    || !Number.isSafeInteger(state.releaseId) || state.releaseId < 1
    || !Number.isSafeInteger(state.assetId) || state.assetId < 1
    || typeof state.targetCommitSha !== "string"
    || !SHA.test(state.targetCommitSha)
    || typeof state.routeUrl !== "string"
    || state.routeUrl !== expectedRoute(config.owner, config.repository,
      state.tag, state.assetName)
    || typeof state.reserveOperationId !== "string"
    || typeof state.immutableReleasePolicyReceipt !== "string"
    || !HASH.test(state.immutableReleasePolicyReceipt)
    || state.containsCredential !== false
    || state.activeRouteVerified !== true
    || state.irreversibleErasureClaimed !== false) {
    fail("RESERVATION_STATE_INVALID");
  }
  const suffix = state.tag.slice("outsider-recovery-".length);
  const identity = releaseIdentity(suffix, config.artifactHash);
  if (state.releaseName !== identity.releaseName
    || state.releaseBody !== identity.releaseBody) {
    fail("RESERVATION_STATE_INVALID");
  }
  return state;
}

function createGitHubReleaseAssetOperationsV2(input = {}) {
  if (typeof input.apiToken !== "string" || input.apiToken.length < 20
    || typeof input.owner !== "string" || !REPOSITORY_PART.test(input.owner)
    || typeof input.repository !== "string"
    || !REPOSITORY_PART.test(input.repository)
    || (input.baseBranch !== undefined
      && (typeof input.baseBranch !== "string"
        || input.baseBranch.length < 1 || input.baseBranch.length > 200
        || /[\u0000-\u001f\u007f]/u.test(input.baseBranch)))
    || !Buffer.isBuffer(input.artifactBytes)
    || input.artifactBytes.length < 1) fail("CONFIG_INVALID");

  const fetchImpl = input.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") fail("FETCH_INVALID");
  const requestTimeoutMs = boundedInteger(input.requestTimeoutMs,
    DEFAULT_REQUEST_TIMEOUT_MS, MAX_REQUEST_TIMEOUT_MS);
  const routeVerificationTimeoutMs = boundedInteger(
    input.routeVerificationTimeoutMs,
    DEFAULT_ROUTE_VERIFICATION_TIMEOUT_MS,
    MAX_ROUTE_VERIFICATION_TIMEOUT_MS);
  const routePollIntervalMs = boundedInteger(input.routePollIntervalMs, 250,
    routeVerificationTimeoutMs);
  const now = input.now ?? Date.now;
  const wait = input.wait ?? ((milliseconds) => new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  }));
  if (typeof now !== "function" || typeof wait !== "function") {
    fail("CONFIG_INVALID");
  }

  const artifactBytes = Buffer.from(input.artifactBytes);
  const artifactHash = sha256(artifactBytes);
  const owner = input.owner;
  const repository = input.repository;
  const immutablePolicyProbe = input.immutableReleasePolicyProbe;
  if (immutablePolicyProbe === null
    || typeof immutablePolicyProbe !== "object"
    || immutablePolicyProbe.capability
      !== "GITHUB_REPOSITORY_ADMINISTRATION_READ"
    || immutablePolicyProbe.repositoryRef !== `${owner}/${repository}`
    || typeof immutablePolicyProbe.probe !== "function"
    || !isGitHubImmutableReleasePolicyProductionProbeV1(
      immutablePolicyProbe, { apiToken: input.apiToken, owner, repository })) {
    fail("IMMUTABLE_RELEASE_POLICY_CAPABILITY_REQUIRED");
  }
  const repoPath = `/repos/${encodeURIComponent(owner)}`
    + `/${encodeURIComponent(repository)}`;
  const config = Object.freeze({ owner, repository, artifactHash });

  async function request(url, init = {}, maximum = MAX_RESPONSE_BYTES) {
    return withRequestTimeout(requestTimeoutMs, async (signal) => {
      const response = await fetchImpl(url, {
        ...init,
        redirect: init.redirect ?? "error",
        signal,
      });
      const bytes = await boundedBytes(response, maximum);
      return { status: response.status, ok: response.ok, bytes,
        body: parseJson(bytes) };
    });
  }

  async function api(path, init = {}) {
    const headers = new Headers(init.headers ?? {});
    headers.set("Accept", "application/vnd.github+json");
    headers.set("Authorization", `Bearer ${input.apiToken}`);
    headers.set("X-GitHub-Api-Version", API_VERSION);
    headers.set("User-Agent", "outsider-outcome-formation-engine-v2");
    return request(`${API_ORIGIN}${path}`, { ...init, headers });
  }

  async function upload(uploadUrl, assetName) {
    const headers = new Headers();
    headers.set("Accept", "application/vnd.github+json");
    headers.set("Authorization", `Bearer ${input.apiToken}`);
    headers.set("X-GitHub-Api-Version", API_VERSION);
    headers.set("User-Agent", "outsider-outcome-formation-engine-v2");
    headers.set("Content-Type", "application/octet-stream");
    const url = new URL(uploadUrl);
    url.searchParams.set("name", assetName);
    return request(url.toString(), { method: "POST", headers,
      body: artifactBytes });
  }

  const releaseByTagPath = (tag) =>
    `${repoPath}/releases/tags/${encodeURIComponent(tag)}`;
  const releasePath = (releaseId) =>
    `${repoPath}/releases/${releaseId}`;
  const assetPath = (assetId) =>
    `${repoPath}/releases/assets/${assetId}`;
  const refReadPath = (tag) =>
    `${repoPath}/git/ref/tags/${encodeURIComponent(tag)}`;
  const refDeletePath = (tag) =>
    `${repoPath}/git/refs/tags/${encodeURIComponent(tag)}`;

  async function readRepository() {
    const result = await api(repoPath);
    if (!result.ok || result.body?.private !== false
      || typeof result.body?.default_branch !== "string") return null;
    return result.body;
  }

  async function readImmutableReleasePolicy() {
    const result = await withRequestTimeout(requestTimeoutMs, (signal) =>
      immutablePolicyProbe.probe({ owner, repository, signal }));
    if (result === null || typeof result !== "object" || Array.isArray(result)
      || !["DISABLED", "ENABLED"].includes(result.status)
      || result.repositoryRef !== `${owner}/${repository}`
      || result.capability !== "GITHUB_REPOSITORY_ADMINISTRATION_READ"
      || result.authorizationBasis
        !== "SAME_CREDENTIAL_ADMINISTRATION_ENDPOINT_200"
      || result.administrationPreflightHttpStatus !== 200
      || typeof result.administrationPreflightResponseBodyHash !== "string"
      || !HASH.test(result.administrationPreflightResponseBodyHash)
      || result.immutablePolicyHttpStatus !== result.observedHttpStatus
      || typeof result.immutablePolicyResponseBodyHash !== "string"
      || !HASH.test(result.immutablePolicyResponseBodyHash)
      || result.immutablePolicyResponseBodyHash !== result.responseBodyHash
      || ![200, 404].includes(result.observedHttpStatus)
      || (result.status === "ENABLED" && result.observedHttpStatus !== 200)
      || (result.status === "DISABLED"
        && ![200, 404].includes(result.observedHttpStatus))
      || typeof result.observationReceipt !== "string"
      || !HASH.test(result.observationReceipt)
      || result.containsCredential !== false) {
      fail("IMMUTABLE_RELEASE_POLICY_OBSERVATION_INVALID");
    }
    return result;
  }

  async function readRelease(tag) {
    const result = await api(releaseByTagPath(tag));
    if (result.status === 404) return null;
    if (!result.ok) fail("RELEASE_READ_FAILED");
    return result.body;
  }

  async function readAsset(assetId) {
    const result = await api(assetPath(assetId));
    if (result.status === 404) return null;
    if (!result.ok) fail("ASSET_READ_FAILED");
    return result.body;
  }

  async function listAssets(releaseId) {
    const result = await api(`${releasePath(releaseId)}/assets?per_page=100`);
    if (!result.ok || !Array.isArray(result.body)) fail("ASSET_LIST_FAILED");
    return result.body;
  }

  async function listExclusiveOrderAssets(releaseId, identity) {
    const assets = await listAssets(releaseId);
    if (assets.some((item) => item?.name !== identity.assetName)
      || assets.length > 1) fail("RELEASE_ASSET_SET_CONFLICT");
    return assets;
  }

  async function readRef(tag) {
    const result = await api(refReadPath(tag));
    if (result.status === 404) return null;
    if (!result.ok || typeof result.body?.object?.sha !== "string"
      || !SHA.test(result.body.object.sha)
      || result.body.object.type !== "commit") fail("TAG_REF_READ_FAILED");
    return result.body.object.sha;
  }

  async function exactPublicObservation(routeUrl) {
    try {
      const result = await request(routeUrl, {
        method: "GET",
        headers: { accept: "application/octet-stream",
          "cache-control": "no-cache" },
        redirect: "follow",
      }, artifactBytes.length + 1024);
      return { status: result.status, exact: result.status === 200
        && result.bytes.equals(artifactBytes) };
    } catch (error) {
      if (error?.outsiderCode === "REQUEST_TIMEOUT") throw error;
      return { status: null, exact: false, transportFailed: true };
    }
  }

  async function provePublicExact(routeUrl) {
    const observation = await exactPublicObservation(routeUrl);
    if (!observation.exact) fail("PUBLIC_ARTIFACT_NOT_EXACT");
    return observation.status;
  }

  async function createOrReconcileRelease(identity, targetCommitSha) {
    let selected = await readRelease(identity.tag);
    if (selected !== null) {
      selected = validateRelease(selected, identity);
      const tagSha = await readRef(identity.tag);
      if (tagSha === null) fail("RELEASE_TAG_MISSING");
      if (tagSha !== selected.target_commitish) fail("RELEASE_TAG_CONFLICT");
      return { release: selected, targetCommitSha: tagSha };
    }
    if (await readRef(identity.tag) !== null) fail("TAG_CONFLICT");
    try {
      await api(`${repoPath}/releases`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tag_name: identity.tag,
          target_commitish: targetCommitSha,
          name: identity.releaseName,
          body: identity.releaseBody,
          draft: false,
          prerelease: true,
          generate_release_notes: false,
          make_latest: "false",
        }),
      });
    } catch {
      // The create may have reached GitHub. Only the reads below decide.
    }
    selected = await readRelease(identity.tag);
    const tagSha = await readRef(identity.tag);
    if (selected === null || tagSha === null || tagSha !== targetCommitSha) {
      fail("RELEASE_CREATE_NOT_RECONCILED");
    }
    const validated = validateRelease(selected, identity);
    if (validated.target_commitish !== targetCommitSha) {
      fail("RELEASE_TARGET_CONFLICT");
    }
    return { release: validated, targetCommitSha };
  }

  async function removeIncompleteAssetForRetry(asset, identity, routeUrl) {
    if (asset === null || typeof asset !== "object" || Array.isArray(asset)
      || !Number.isSafeInteger(asset.id) || asset.id < 1
      || asset.name !== identity.assetName || asset.state !== "starter"
      || asset.size !== 0 || asset.browser_download_url !== routeUrl) {
      fail("ASSET_CONFLICT");
    }
    try { await api(assetPath(asset.id), { method: "DELETE" }); }
    catch {
      // GitHub documents a 502 upload as possibly leaving an empty `starter`
      // asset. Resolve deletion before a later call is allowed to upload again.
    }
    if (await readAsset(asset.id) !== null) {
      fail("INCOMPLETE_ASSET_DELETE_NOT_RECONCILED");
    }
    fail("INCOMPLETE_ASSET_REMOVED_RETRY_REQUIRED");
  }

  async function createOrReconcileAsset(release, identity, routeUrl) {
    let candidates = await listExclusiveOrderAssets(release.id, identity);
    if (candidates.length === 1) {
      if (candidates[0]?.state === "starter") {
        await removeIncompleteAssetForRetry(candidates[0], identity, routeUrl);
      }
      return validateAsset(candidates[0], identity, artifactBytes, routeUrl);
    }
    const uploadUrl = validateUploadUrl(release.upload_url, owner, repository,
      release.id);
    try { await upload(uploadUrl, identity.assetName); }
    catch {
      // The upload may have reached GitHub. Only the release GET below decides.
    }
    const reconciled = validateRelease(await readRelease(identity.tag), identity);
    if (reconciled.id !== release.id) fail("RELEASE_ID_CHANGED");
    candidates = await listExclusiveOrderAssets(reconciled.id, identity);
    if (candidates.length !== 1) fail("ASSET_UPLOAD_NOT_RECONCILED");
    if (candidates[0]?.state === "starter") {
      await removeIncompleteAssetForRetry(candidates[0], identity, routeUrl);
    }
    return validateAsset(candidates[0], identity, artifactBytes, routeUrl);
  }

  async function deleteAsset(state) {
    const asset = await readAsset(state.assetId);
    if (asset === null) return;
    const identity = releaseIdentity(
      state.tag.slice("outsider-recovery-".length), artifactHash);
    validateAsset(asset, identity, artifactBytes, state.routeUrl);
    try { await api(assetPath(state.assetId), { method: "DELETE" }); }
    catch {
      // The delete may have reached GitHub. Only the exact GET below decides.
    }
    if (await readAsset(state.assetId) !== null) {
      fail("ASSET_DELETE_NOT_RECONCILED");
    }
  }

  async function preflightCleanup(state) {
    const identity = releaseIdentity(
      state.tag.slice("outsider-recovery-".length), artifactHash);
    const release = await readRelease(state.tag);
    if (release === null) return;
    validateRelease(release, identity);
    if (release.id !== state.releaseId) fail("RELEASE_ID_CHANGED");
    if (release.target_commitish !== state.targetCommitSha) {
      fail("RELEASE_TARGET_CONFLICT");
    }
    const assets = await listExclusiveOrderAssets(release.id, identity);
    if (assets.length === 1 && assets[0]?.id !== state.assetId) {
      fail("ASSET_ID_CHANGED");
    }
  }

  async function deleteRelease(state) {
    const identity = releaseIdentity(
      state.tag.slice("outsider-recovery-".length), artifactHash);
    const release = await readRelease(state.tag);
    if (release === null) return;
    validateRelease(release, identity);
    if (release.id !== state.releaseId) fail("RELEASE_ID_CHANGED");
    if (release.target_commitish !== state.targetCommitSha) {
      fail("RELEASE_TARGET_CONFLICT");
    }
    if ((await listExclusiveOrderAssets(release.id, identity)).length !== 0) {
      fail("RELEASE_ASSET_SET_NOT_EMPTY");
    }
    try { await api(releasePath(state.releaseId), { method: "DELETE" }); }
    catch {
      // The delete may have reached GitHub. Only the exact GET below decides.
    }
    if (await readRelease(state.tag) !== null) {
      fail("RELEASE_DELETE_NOT_RECONCILED");
    }
  }

  async function deleteTag(state) {
    const tagSha = await readRef(state.tag);
    if (tagSha === null) return;
    if (tagSha !== state.targetCommitSha) fail("TAG_REF_CONFLICT");
    try { await api(refDeletePath(state.tag), { method: "DELETE" }); }
    catch {
      // The delete may have reached GitHub. Only the exact GET below decides.
    }
    if (await readRef(state.tag) !== null) fail("TAG_DELETE_NOT_RECONCILED");
  }

  async function proveRouteAbsent(routeUrl) {
    const startedAt = now();
    for (;;) {
      const separator = routeUrl.includes("?") ? "&" : "?";
      const observation = await exactPublicObservation(
        `${routeUrl}${separator}outsider_cleanup_probe=${startedAt}`);
      if (observation.status === 404 || observation.status === 410) return;
      const elapsed = now() - startedAt;
      if (elapsed >= routeVerificationTimeoutMs) {
        fail(observation.exact ? "PUBLIC_ROUTE_STILL_ACTIVE"
          : "PUBLIC_ROUTE_ABSENCE_NOT_VERIFIED");
      }
      await wait(Math.min(routePollIntervalMs,
        routeVerificationTimeoutMs - elapsed));
    }
  }

  // This provider operation publishes exact bytes. The recovery adapter stages
  // it during reserve; a transaction can call it after its own prerequisites.
  // Neither path needs to invent a primary failure to create a public artifact.
  async function publish({ programHash, publicationId, operationId, availableUntil }) {
    if (!HASH.test(programHash ?? "") || typeof publicationId !== "string"
      || !publicationId || typeof operationId !== "string" || !operationId
      || !Number.isFinite(Date.parse(availableUntil))) fail("PUBLICATION_INPUT_INVALID");
    const repo = await readRepository();
    if (repo === null) return { status: "UNAVAILABLE", reason: "PUBLIC_REPOSITORY_REQUIRED" };
    const immutablePolicy = await readImmutableReleasePolicy();
    if (immutablePolicy.status !== "DISABLED") return { status: "UNAVAILABLE",
      reason: "IMMUTABLE_RELEASES_INCOMPATIBLE_WITH_EPHEMERAL_ROUTE" };
    const suffix = namespace({ programHash }, { requirementId: publicationId });
    const identity = releaseIdentity(suffix, artifactHash);
    const baseBranch = input.baseBranch ?? repo.default_branch;
    const baseRef = await api(`${repoPath}/git/ref/heads/` + encodeURIComponent(baseBranch));
    if (!baseRef.ok || typeof baseRef.body?.object?.sha !== "string"
      || !SHA.test(baseRef.body.object.sha)) fail("BASE_BRANCH_MISSING");
    const stagedRelease = await createOrReconcileRelease(identity, baseRef.body.object.sha);
    const routeUrl = expectedRoute(owner, repository, identity.tag, identity.assetName);
    const asset = await createOrReconcileAsset(stagedRelease.release, identity, routeUrl);
    const publicStatus = await provePublicExact(routeUrl);
    const publicationState = { owner, repository, tag: identity.tag, assetName: identity.assetName,
      releaseName: identity.releaseName, releaseBody: identity.releaseBody,
      releaseId: stagedRelease.release.id, assetId: asset.id,
      targetCommitSha: stagedRelease.targetCommitSha, routeUrl, artifactHash,
      reserveOperationId: operationId, immutableReleasePolicyReceipt: immutablePolicy.observationReceipt,
      containsCredential: false, activeRouteVerified: true, irreversibleErasureClaimed: false };
    return { status: "PUBLISHED", publicationId: `github-release-asset:${suffix}`, availableUntil,
      publicStatus, publicationState, providerReceipt: publicReceipt("PUBLISHED", publicationState, {
        releaseId: publicationState.releaseId, assetId: publicationState.assetId, publicStatus,
        immutableReleasePolicyReceipt: immutablePolicy.observationReceipt }) };
  }

  async function withdraw({ programHash, publicationId, operationId, submittedTargetCommitSha }) {
    if (!HASH.test(programHash ?? "") || typeof publicationId !== "string" || !publicationId
      || typeof operationId !== "string" || !operationId || !SHA.test(submittedTargetCommitSha ?? ""))
      fail("PUBLICATION_CLEANUP_INPUT_INVALID");
    const suffix = namespace({ programHash }, { requirementId: publicationId });
    const identity = releaseIdentity(suffix, artifactHash);
    const routeUrl = expectedRoute(owner, repository, identity.tag, identity.assetName);
    const current = await readRelease(identity.tag);
    let targetCommitSha = submittedTargetCommitSha;
    if (current !== null) {
      const release = validateRelease(current, identity);
      targetCommitSha = release.target_commitish;
      if (targetCommitSha !== submittedTargetCommitSha) fail("RELEASE_TARGET_CONFLICT");
      const assets = await listExclusiveOrderAssets(release.id, identity);
      if (assets.length === 1) {
        const asset = assets[0];
        if (asset.state === "starter") {
          try { await removeIncompleteAssetForRetry(asset, identity, routeUrl); }
          catch (error) { if (error.outsiderCode !== "INCOMPLETE_ASSET_REMOVED_RETRY_REQUIRED") throw error; }
        } else {
          validateAsset(asset, identity, artifactBytes, routeUrl);
          await deleteAsset({ tag: identity.tag, assetId: asset.id, routeUrl });
        }
      }
      await deleteRelease({ tag: identity.tag, releaseId: release.id, targetCommitSha });
    }
    await deleteTag({ tag: identity.tag, targetCommitSha });
    await proveRouteAbsent(routeUrl);
    return { status: "RELEASED", activeRouteVerifiedAbsent: true, irreversibleErasureClaimed: false,
      receipt: publicReceipt("WITHDRAWN", { owner, repository, tag: identity.tag,
        assetName: identity.assetName, artifactHash }, { activeRouteVerifiedAbsent: true }) };
  }

  const adapter = {
    adapterId: input.adapterId
      ?? "github-release-asset-production-recovery-v2",
    providerRef: "github-release-assets",
    failureDomainRef: "github.com",
    roles: Object.freeze(["RECOVERY"]),
    capabilities: Object.freeze([CAPABILITY]),

    supports(requirement) {
      return requirement?.role === "RECOVERY"
        && requirement?.capability === CAPABILITY
        && requirement.constraints?.artifactHash === artifactHash;
    },

    async reserve({ program, requirement, operationId }) {
      if (!adapter.supports(requirement) || typeof operationId !== "string"
        || operationId.length < 1) {
        return { status: "UNAVAILABLE", reason: "CAPABILITY_OR_INPUT_MISMATCH" };
      }
      const published = await publish({ programHash: program.programHash,
        publicationId: requirement.requirementId, operationId,
        availableUntil: maximumDeadline(program, requirement) });
      if (published.status !== "PUBLISHED") return published;
      const adapterState = published.publicationState;
      return {
        status: "RESERVED",
        reservationId: published.publicationId,
        validUntil: published.availableUntil,
        providerReceipt: publicReceipt("RESERVED", adapterState, {
          releaseId: adapterState.releaseId,
          assetId: adapterState.assetId,
          publicStatus: published.publicStatus,
          immutableReleasePolicyReceipt:
            adapterState.immutableReleasePolicyReceipt,
        }),
        adapterState,
      };
    },

    async execute({ reservation, operationId, primaryFailure }) {
      const state = checkedState(config, reservation);
      if (primaryFailure?.status !== "FAILED") {
        return { status: "FAILED", reason: "PRIMARY_FAILURE_REQUIRED" };
      }
      const identity = releaseIdentity(
        state.tag.slice("outsider-recovery-".length), artifactHash);
      const release = validateRelease(await readRelease(state.tag), identity);
      if (release.id !== state.releaseId) fail("RELEASE_ID_CHANGED");
      if (release.target_commitish !== state.targetCommitSha) {
        fail("RELEASE_TARGET_CONFLICT");
      }
      const asset = validateAsset(await readAsset(state.assetId), identity,
        artifactBytes, state.routeUrl);
      if (asset.id !== state.assetId) fail("ASSET_ID_CHANGED");
      const observed = await exactPublicObservation(state.routeUrl);
      const visible = observed.exact === true;
      return {
        status: visible ? "SUCCEEDED" : "FAILED",
        reason: visible ? null : observed.transportFailed
          ? "PUBLIC_ROUTE_TRANSPORT_FAILED" : "PUBLIC_ARTIFACT_NOT_EXACT",
        routeUrl: state.routeUrl,
        artifactHash,
        operationId,
        providerReceipt: publicReceipt("EXECUTED", state, {
          publicStatus: observed.status,
        }),
        providerObservationIndependent: false,
      };
    },

    async release({ reservation, operationId }) {
      const state = checkedState(config, reservation);
      if (typeof operationId !== "string" || operationId.length < 1) {
        fail("RELEASE_OPERATION_ID_INVALID");
      }
      await preflightCleanup(state);
      await deleteAsset(state);
      await deleteRelease(state);
      await deleteTag(state);
      await proveRouteAbsent(state.routeUrl);
      return {
        status: "RELEASED",
        activeRouteVerifiedAbsent: true,
        irreversibleErasureClaimed: false,
        receipt: publicReceipt("RELEASED", state, {
          activeRouteVerifiedAbsent: true,
          irreversibleErasureClaimed: false,
        }),
      };
    },

    async closeObligation(context) {
      const result = await adapter.release(context);
      return {
        status: "CLOSED",
        activeRouteVerifiedAbsent: result.activeRouteVerifiedAbsent,
        irreversibleErasureClaimed: result.irreversibleErasureClaimed,
        receipt: result.receipt,
      };
    },
  };

  return { adapter: Object.freeze(adapter), publisher: Object.freeze({
    providerRef: "github-release-assets", publish, withdraw,
    async release({ publication, operationId }) {
      return adapter.release({ reservation: { adapterState: publication?.publicationState }, operationId });
    },
  }) };
}

export function createGitHubReleaseAssetProductionRecoveryAdapterV2(input = {}) {
  return createGitHubReleaseAssetOperationsV2(input).adapter;
}

export function createGitHubReleaseAssetPublisherV1(input = {}) {
  return createGitHubReleaseAssetOperationsV2(input).publisher;
}
