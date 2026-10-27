/*
 * Direct production recovery adapter backed by one authorized public GitHub
 * repository. Each order gets a deterministic temporary branch and path.
 * reserve() creates/reconciles the exact artifact, execute() verifies the
 * anonymous raw HTTPS route after primary failure, and release() removes the
 * content and branch. Credentials remain closure-only.
 *
 * Every mutation is preceded by a read. If a provider response is lost after
 * GitHub accepted a mutation, the adapter reconciles the exact intended state;
 * a restarted call performs the same reads before it can issue another write.
 */

import { createHash } from "node:crypto";

const API_ORIGIN = "https://api.github.com";
const RAW_ORIGIN = "https://raw.githubusercontent.com";
const API_VERSION = "2022-11-28";
const CAPABILITY = "PUBLIC_HTTPS_ARTIFACT_PUBLICATION";
const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;
const MAX_REQUEST_TIMEOUT_MS = 60_000;
const SHA = /^[a-f0-9]{40,64}$/u;
const HASH = /^sha256:[a-f0-9]{64}$/u;
const REPOSITORY_PART = /^[A-Za-z0-9_.-]{1,100}$/u;
const BRANCH = /^outsider-recovery-[a-f0-9]{32}$/u;
const PATH = /^\.outsider\/recovery\/[a-f0-9]{32}\/artifact$/u;

function fail(code) {
  const error = new TypeError(
    `OUTSIDER_GITHUB_CONTENTS_PRODUCTION_RECOVERY_V1_${code}`);
  error.outsiderCode = code;
  throw error;
}

function boundedRequestTimeout(value) {
  const selected = value ?? DEFAULT_REQUEST_TIMEOUT_MS;
  if (!Number.isSafeInteger(selected) || selected < 1
    || selected > MAX_REQUEST_TIMEOUT_MS) fail("CONFIG_INVALID");
  return selected;
}

async function withRequestTimeout(timeoutMs, request) {
  const controller = new AbortController();
  let timer;
  const timeout = new Promise((_resolve, reject) => {
    timer = setTimeout(() => {
      const error = new TypeError(
        "OUTSIDER_GITHUB_CONTENTS_PRODUCTION_RECOVERY_V1_REQUEST_TIMEOUT");
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

function encodedPath(value) {
  return value.split("/").map(encodeURIComponent).join("/");
}

function maximumDeadline(program, requirement) {
  return program.obligations
    .filter((item) => item.targetRequirementId === requirement.requirementId)
    .reduce((latest, item) => Date.parse(item.deadline) > Date.parse(latest)
      ? item.deadline : latest, program.completionDeadline);
}

function parseJson(bytes) {
  try { return JSON.parse(bytes.toString("utf8")); } catch { return null; }
}

async function boundedBytes(response, maximum = 2 * 1024 * 1024) {
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > maximum) fail("RESPONSE_TOO_LARGE");
  return bytes;
}

function contentBytes(body) {
  if (body?.type !== "file" || body.encoding !== "base64"
    || typeof body.content !== "string") return null;
  try { return Buffer.from(body.content.replaceAll(/\s/gu, ""), "base64"); }
  catch { return null; }
}

function publicReceipt(kind, state, extra = {}) {
  return sha256(Buffer.from(JSON.stringify({
    schema: "outsider/github-contents-production-recovery-receipt/v1",
    kind,
    repository: `${state.owner}/${state.repository}`,
    branch: state.branch,
    path: state.path,
    artifactHash: state.artifactHash,
    ...extra,
  }), "utf8"));
}

function checkedState(config, reservation) {
  const state = reservation?.adapterState;
  if (state === null || typeof state !== "object" || Array.isArray(state)
    || state.owner !== config.owner || state.repository !== config.repository
    || state.artifactHash !== config.artifactHash
    || !BRANCH.test(state.branch) || !PATH.test(state.path)
    || state.path.split("/")[2] !== state.branch.slice("outsider-recovery-".length)
    || typeof state.routeUrl !== "string"
    || state.routeUrl !== config.rawUrl(state.branch, state.path)
    || typeof state.contentSha !== "string" || !SHA.test(state.contentSha)
    || typeof state.baseSha !== "string" || !SHA.test(state.baseSha)
    || typeof state.reserveOperationId !== "string"
    || state.containsCredential !== false) fail("RESERVATION_STATE_INVALID");
  return state;
}

export function createGitHubContentsProductionRecoveryAdapterV1(input = {}) {
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
  const requestTimeoutMs = boundedRequestTimeout(input.requestTimeoutMs);
  const artifactBytes = Buffer.from(input.artifactBytes);
  const artifactHash = sha256(artifactBytes);
  const owner = input.owner;
  const repository = input.repository;
  const repoPath = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}`;

  const rawUrl = (branch, path) =>
    `${RAW_ORIGIN}/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}`
      + `/${encodeURIComponent(branch)}/${encodedPath(path)}`;

  const config = Object.freeze({ owner, repository, artifactHash, rawUrl });

  async function api(path, init = {}) {
    const headers = new Headers(init.headers ?? {});
    headers.set("Accept", "application/vnd.github+json");
    headers.set("Authorization", `Bearer ${input.apiToken}`);
    headers.set("X-GitHub-Api-Version", API_VERSION);
    headers.set("User-Agent", "outsider-outcome-formation-engine-v1");
    return withRequestTimeout(requestTimeoutMs, async (signal) => {
      const response = await fetchImpl(`${API_ORIGIN}${path}`, {
        ...init,
        headers,
        redirect: "error",
        signal,
      });
      const bytes = await boundedBytes(response);
      return { status: response.status, ok: response.ok, bytes,
        body: parseJson(bytes) };
    });
  }

  const readRefPath = (branch) =>
    `${repoPath}/git/ref/heads/${encodeURIComponent(branch)}`;
  const mutateRefPath = (branch) =>
    `${repoPath}/git/refs/heads/${encodeURIComponent(branch)}`;
  const contentPath = (path, branch) =>
    `${repoPath}/contents/${encodedPath(path)}?ref=${encodeURIComponent(branch)}`;

  async function readRef(branch) {
    const result = await api(readRefPath(branch));
    if (result.status === 404) return null;
    if (!result.ok || typeof result.body?.object?.sha !== "string"
      || !SHA.test(result.body.object.sha)) fail("REF_READ_FAILED");
    return result.body.object.sha;
  }

  async function readContent(path, branch) {
    const result = await api(contentPath(path, branch));
    if (result.status === 404) return null;
    const bytes = contentBytes(result.body);
    if (!result.ok || bytes === null || typeof result.body.sha !== "string"
      || !SHA.test(result.body.sha)) fail("CONTENT_READ_FAILED");
    return { bytes, sha: result.body.sha };
  }

  async function readCommit(sha) {
    const result = await api(`${repoPath}/git/commits/${sha}`);
    if (!result.ok || typeof result.body?.message !== "string") {
      fail("COMMIT_READ_FAILED");
    }
    return result.body.message;
  }

  async function ensureBranch(branch, baseBranch) {
    const baseSha = await readRef(baseBranch);
    if (baseSha === null) fail("BASE_BRANCH_MISSING");
    let currentSha = await readRef(branch);
    if (currentSha !== null) return { baseSha, currentSha };
    try {
      await api(`${repoPath}/git/refs`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: baseSha }),
      });
    } catch {
      // The request may have reached GitHub. Only an exact GET decides.
    }
    currentSha = await readRef(branch);
    if (currentSha === null) fail("BRANCH_CREATE_NOT_RECONCILED");
    if (currentSha !== baseSha) fail("BRANCH_CREATE_CONFLICT");
    return { baseSha, currentSha };
  }

  async function ensureContent(state, operationId) {
    const message = `outsider reserve ${operationId}`;
    let content = await readContent(state.path, state.branch);
    if (content !== null) {
      const head = await readRef(state.branch);
      if (!content.bytes.equals(artifactBytes) || head === null
        || await readCommit(head) !== message) fail("CONTENT_CONFLICT");
      return { contentSha: content.sha, commitSha: head };
    }
    const head = await readRef(state.branch);
    if (head !== state.baseSha) fail("BRANCH_NOT_PRISTINE");
    try {
      await api(`${repoPath}/contents/${encodedPath(state.path)}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          message,
          content: artifactBytes.toString("base64"),
          branch: state.branch,
        }),
      });
    } catch {
      // Lost write acknowledgement is resolved by the exact reads below.
    }
    content = await readContent(state.path, state.branch);
    const commitSha = await readRef(state.branch);
    if (content === null || !content.bytes.equals(artifactBytes)
      || commitSha === null || await readCommit(commitSha) !== message) {
      fail("CONTENT_CREATE_NOT_RECONCILED");
    }
    return { contentSha: content.sha, commitSha };
  }

  async function deleteContent(state, operationId) {
    let content = await readContent(state.path, state.branch);
    if (content === null) return;
    if (!content.bytes.equals(artifactBytes)
      || content.sha !== state.contentSha) fail("CLEANUP_CONTENT_CONFLICT");
    try {
      await api(`${repoPath}/contents/${encodedPath(state.path)}`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          message: `outsider release ${operationId}`,
          sha: state.contentSha,
          branch: state.branch,
        }),
      });
    } catch {
      // Resolve the possibly accepted delete before allowing another write.
    }
    content = await readContent(state.path, state.branch);
    if (content !== null) fail("CONTENT_DELETE_NOT_RECONCILED");
  }

  async function deleteBranch(state) {
    let head = await readRef(state.branch);
    if (head === null) return;
    try { await api(mutateRefPath(state.branch), { method: "DELETE" }); }
    catch {
      // Resolve the possibly accepted delete before allowing another write.
    }
    head = await readRef(state.branch);
    if (head !== null) fail("BRANCH_DELETE_NOT_RECONCILED");
  }

  const adapter = {
    adapterId: input.adapterId ?? "github-contents-production-recovery-v1",
    providerRef: "github-contents",
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
      const repo = await api(repoPath);
      if (!repo.ok || repo.body?.private !== false
        || typeof repo.body?.default_branch !== "string") {
        return { status: "UNAVAILABLE", reason: "PUBLIC_REPOSITORY_REQUIRED" };
      }
      const suffix = namespace(program, requirement);
      const branch = `outsider-recovery-${suffix}`;
      const path = `.outsider/recovery/${suffix}/artifact`;
      const baseBranch = input.baseBranch ?? repo.body.default_branch;
      const branchState = await ensureBranch(branch, baseBranch);
      const partialState = { owner, repository, branch, path, baseBranch,
        baseSha: branchState.baseSha };
      const content = await ensureContent(partialState, operationId);
      const routeUrl = rawUrl(branch, path);
      const adapterState = {
        owner,
        repository,
        branch,
        path,
        baseBranch,
        baseSha: branchState.baseSha,
        contentSha: content.contentSha,
        commitSha: content.commitSha,
        routeUrl,
        artifactHash,
        reserveOperationId: operationId,
        containsCredential: false,
      };
      return {
        status: "RESERVED",
        reservationId: `github-contents:${suffix}`,
        validUntil: maximumDeadline(program, requirement),
        providerReceipt: publicReceipt("RESERVED", adapterState, {
          commitSha: content.commitSha,
        }),
        adapterState,
      };
    },

    async execute({ reservation, operationId, primaryFailure }) {
      const state = checkedState(config, reservation);
      if (primaryFailure?.status !== "FAILED") {
        return { status: "FAILED", reason: "PRIMARY_FAILURE_REQUIRED" };
      }
      const content = await readContent(state.path, state.branch);
      if (content === null || content.sha !== state.contentSha
        || !content.bytes.equals(artifactBytes)) {
        return { status: "FAILED", reason: "STAGED_ARTIFACT_NOT_EXACT" };
      }
      let observed;
      try {
        observed = await withRequestTimeout(requestTimeoutMs,
          async (signal) => {
            const response = await fetchImpl(state.routeUrl, {
              method: "GET",
              headers: { accept: "application/octet-stream",
                "cache-control": "no-cache" },
              redirect: "error",
              signal,
            });
            const bytes = await boundedBytes(response,
              artifactBytes.length + 1024);
            return { status: response.status, bytes };
          });
      } catch {
        return { status: "FAILED", reason: "PUBLIC_ROUTE_TRANSPORT_FAILED",
          routeUrl: state.routeUrl };
      }
      const visible = observed.status === 200
        && observed.bytes.equals(artifactBytes);
      return {
        status: visible ? "SUCCEEDED" : "FAILED",
        reason: visible ? null : "PUBLIC_ARTIFACT_NOT_EXACT",
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
      await deleteContent(state, operationId);
      await deleteBranch(state);
      return {
        status: "RELEASED",
        receipt: publicReceipt("RELEASED", state),
      };
    },

    async closeObligation(context) {
      const result = await adapter.release(context);
      return { status: "CLOSED", receipt: result.receipt };
    },
  };

  return Object.freeze(adapter);
}
