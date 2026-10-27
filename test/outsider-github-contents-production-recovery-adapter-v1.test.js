import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { createFirstCommittedDigitalRealityProgramV1 }
  from "../src/outsider-first-committed-digital-reality-program-v1.js";
import { createGitHubContentsProductionRecoveryAdapterV1 }
  from "../src/outsider-github-contents-production-recovery-adapter-v1.js";

const TOKEN = "github_pat_outsider_production_token_123456789";
const BASE_SHA = "a".repeat(40);
const CONTENT_SHA = "b".repeat(40);
const COMMIT_SHA = "c".repeat(40);
const DELETE_SHA = "d".repeat(40);
const ARTIFACT = Buffer.from("outsider:first-committed-reality:v1\n", "utf8");
const ARTIFACT_HASH = `sha256:${createHash("sha256").update(ARTIFACT).digest("hex")}`;

function program() {
  return createFirstCommittedDigitalRealityProgramV1({
    programId: "program_github_contents_001",
    orderId: "order_github_contents_001",
    createdAt: "2026-09-03T12:00:00.000Z",
    formationDeadline: "2026-09-03T12:10:00.000Z",
    completionDeadline: "2026-09-03T12:30:00.000Z",
    cleanupDeadline: "2026-09-03T12:40:00.000Z",
    artifactHash: ARTIFACT_HASH,
  });
}

function githubWorld() {
  return {
    refs: new Map([["main", BASE_SHA]]),
    contents: new Map(),
    commits: new Map(),
    calls: [],
    counts: { createRef: 0, put: 0, deleteContent: 0, deleteRef: 0 },
    throwAfter: new Set(),
    failNextRead: new Set(),
  };
}

function branchFromApi(url) {
  const marker = url.includes("/git/refs/heads/")
    ? "/git/refs/heads/" : "/git/ref/heads/";
  return decodeURIComponent(url.slice(url.indexOf(marker) + marker.length));
}

function contentKey(url) {
  const marker = "/contents/";
  const start = url.indexOf(marker) + marker.length;
  const [encoded, query] = url.slice(start).split("?");
  return `${decodeURIComponent(new URLSearchParams(query).get("ref"))}:${encoded
    .split("/").map(decodeURIComponent).join("/")}`;
}

function responseJson(value, status = 200) {
  return Response.json(value, { status });
}

function fetchFor(world) {
  return async (url, init = {}) => {
    const method = init.method ?? "GET";
    world.calls.push({ url, method, signal: init.signal,
      authorization: new Headers(init.headers).get("authorization") });
    if (url.startsWith("https://raw.githubusercontent.com/")) {
      const branch = [...world.refs.keys()].find((item) =>
        item.startsWith("outsider-recovery-"));
      const entry = [...world.contents.entries()].find(([key]) =>
        key.startsWith(`${branch}:`))?.[1];
      return entry ? new Response(entry.bytes, { status: 200 })
        : new Response("missing", { status: 404 });
    }
    if (url.endsWith("/repos/outsider/public-recovery") && method === "GET") {
      return responseJson({ private: false, default_branch: "main" });
    }
    if (url.includes("/git/ref/heads/") && method === "GET") {
      const branch = branchFromApi(url);
      if (world.failNextRead.delete(`ref:${branch}`)) {
        throw new TypeError("injected ref read interruption");
      }
      const sha = world.refs.get(branch);
      return sha ? responseJson({ object: { sha } })
        : responseJson({ message: "Not Found" }, 404);
    }
    if (url.endsWith("/git/refs") && method === "POST") {
      world.counts.createRef += 1;
      const body = JSON.parse(init.body);
      const branch = body.ref.slice("refs/heads/".length);
      world.refs.set(branch, body.sha);
      if (world.throwAfter.delete("createRef")) {
        world.failNextRead.add(`ref:${branch}`);
        throw new TypeError("injected lost create-ref acknowledgement");
      }
      return responseJson({ ref: body.ref, object: { sha: body.sha } }, 201);
    }
    if (url.includes("/contents/") && method === "GET") {
      const key = contentKey(url);
      if (world.failNextRead.delete(`content:${key}`)) {
        throw new TypeError("injected content read interruption");
      }
      const entry = world.contents.get(key);
      return entry ? responseJson({ type: "file", encoding: "base64",
        content: entry.bytes.toString("base64"), sha: entry.sha })
        : responseJson({ message: "Not Found" }, 404);
    }
    if (url.includes("/contents/") && method === "PUT") {
      world.counts.put += 1;
      const body = JSON.parse(init.body);
      const encoded = url.split("/contents/")[1];
      const path = encoded.split("/").map(decodeURIComponent).join("/");
      const key = `${body.branch}:${path}`;
      world.contents.set(key, { bytes: Buffer.from(body.content, "base64"),
        sha: CONTENT_SHA });
      world.refs.set(body.branch, COMMIT_SHA);
      world.commits.set(COMMIT_SHA, body.message);
      if (world.throwAfter.delete("put")) {
        world.failNextRead.add(`content:${key}`);
        throw new TypeError("injected lost put acknowledgement");
      }
      return responseJson({ content: { sha: CONTENT_SHA },
        commit: { sha: COMMIT_SHA } }, 201);
    }
    if (url.includes("/git/commits/") && method === "GET") {
      const sha = url.split("/git/commits/")[1];
      return responseJson({ sha, message: world.commits.get(sha) });
    }
    if (url.includes("/contents/") && method === "DELETE") {
      world.counts.deleteContent += 1;
      const body = JSON.parse(init.body);
      const encoded = url.split("/contents/")[1];
      const path = encoded.split("/").map(decodeURIComponent).join("/");
      const key = `${body.branch}:${path}`;
      world.contents.delete(key);
      world.refs.set(body.branch, DELETE_SHA);
      world.commits.set(DELETE_SHA, body.message);
      if (world.throwAfter.delete("deleteContent")) {
        world.failNextRead.add(`content:${key}`);
        throw new TypeError("injected lost delete-content acknowledgement");
      }
      return responseJson({ commit: { sha: DELETE_SHA } });
    }
    if (url.includes("/git/refs/heads/") && method === "DELETE") {
      world.counts.deleteRef += 1;
      const branch = branchFromApi(url);
      world.refs.delete(branch);
      if (world.throwAfter.delete("deleteRef")) {
        world.failNextRead.add(`ref:${branch}`);
        throw new TypeError("injected lost delete-ref acknowledgement");
      }
      return new Response(null, { status: 204 });
    }
    throw new Error(`unhandled ${method} ${url}`);
  };
}

function adapter(world) {
  return createGitHubContentsProductionRecoveryAdapterV1({
    apiToken: TOKEN,
    owner: "outsider",
    repository: "public-recovery",
    baseBranch: "main",
    artifactBytes: ARTIFACT,
    fetchImpl: fetchFor(world),
  });
}

async function reserve(world) {
  const selected = program();
  const requirement = selected.requirements.find((item) =>
    item.role === "RECOVERY");
  return adapter(world).reserve({ program: selected, requirement,
    operationId: "op_reserve_recovery_001" });
}

test("forms a GitHub hot standby, executes only after primary failure, and removes it", async () => {
  const world = githubWorld();
  const reservation = await reserve(world);
  assert.equal(reservation.status, "RESERVED");
  assert.equal(reservation.adapterState.containsCredential, false);
  assert.equal(JSON.stringify(reservation).includes(TOKEN), false);
  assert.match(reservation.adapterState.branch, /^outsider-recovery-[a-f0-9]{32}$/u);
  assert.match(reservation.adapterState.routeUrl,
    /^https:\/\/raw\.githubusercontent\.com\//u);

  const result = await adapter(world).execute({ reservation,
    operationId: "op_execute_recovery_001",
    primaryFailure: { status: "FAILED", reason: "PRIMARY_DOWN" } });
  assert.equal(result.status, "SUCCEEDED");
  assert.equal(result.routeUrl, reservation.adapterState.routeUrl);
  assert.equal(result.providerObservationIndependent, false);

  const closed = await adapter(world).closeObligation({ reservation,
    operationId: "op_close_recovery_001" });
  assert.equal(closed.status, "CLOSED");
  assert.equal(world.counts.createRef, 1);
  assert.equal(world.counts.put, 1);
  assert.equal(world.counts.deleteContent, 1);
  assert.equal(world.counts.deleteRef, 1);
  assert.equal(world.calls.every((call) =>
    call.signal instanceof AbortSignal), true);
  assert.equal(new Set(world.calls.map((call) => call.signal)).size,
    world.calls.length,
    "every GitHub API and raw-route request receives a fresh timeout signal");
});

test("API timeout aborts recovery formation and remains retryable", async () => {
  let observedSignal = null;
  const timeoutAdapter = createGitHubContentsProductionRecoveryAdapterV1({
    apiToken: TOKEN,
    owner: "outsider",
    repository: "public-recovery",
    baseBranch: "main",
    artifactBytes: ARTIFACT,
    requestTimeoutMs: 5,
    async fetchImpl(_url, init) {
      observedSignal = init.signal;
      return new Promise(() => {});
    },
  });
  const selected = program();
  await assert.rejects(timeoutAdapter.reserve({
    program: selected,
    requirement: selected.requirements.find((item) =>
      item.role === "RECOVERY"),
    operationId: "op_reserve_timeout_retryable",
  }), (error) => {
    assert.equal(error.outsiderCode, "REQUEST_TIMEOUT");
    return true;
  });
  assert.equal(observedSignal instanceof AbortSignal, true);
  assert.equal(observedSignal.aborted, true);
});

test("rejects a per-request timeout above the production ceiling", () => {
  assert.throws(() => createGitHubContentsProductionRecoveryAdapterV1({
    apiToken: TOKEN,
    owner: "outsider",
    repository: "public-recovery",
    artifactBytes: ARTIFACT,
    requestTimeoutMs: 60_001,
  }), /CONFIG_INVALID/u);
});

test("lost create acknowledgements reconcile across restarts without duplicate writes", async () => {
  const world = githubWorld();
  world.throwAfter.add("createRef");
  await assert.rejects(() => reserve(world), /ref read interruption/u);
  assert.equal(world.counts.createRef, 1);

  world.throwAfter.add("put");
  await assert.rejects(() => reserve(world), /content read interruption/u);
  assert.equal(world.counts.createRef, 1);
  assert.equal(world.counts.put, 1);

  const reconciled = await reserve(world);
  assert.equal(reconciled.status, "RESERVED");
  assert.equal(world.counts.createRef, 1);
  assert.equal(world.counts.put, 1);
});

test("lost cleanup acknowledgements reconcile across restarts without duplicate deletes", async () => {
  const world = githubWorld();
  const reservation = await reserve(world);
  world.throwAfter.add("deleteContent");
  await assert.rejects(() => adapter(world).release({ reservation,
    operationId: "op_release_recovery_001" }), /content read interruption/u);
  assert.equal(world.counts.deleteContent, 1);

  world.throwAfter.add("deleteRef");
  await assert.rejects(() => adapter(world).release({ reservation,
    operationId: "op_release_recovery_001" }), /ref read interruption/u);
  assert.equal(world.counts.deleteContent, 1);
  assert.equal(world.counts.deleteRef, 1);

  const released = await adapter(world).release({ reservation,
    operationId: "op_release_recovery_001" });
  assert.equal(released.status, "RELEASED");
  assert.equal(world.counts.deleteContent, 1);
  assert.equal(world.counts.deleteRef, 1);
});
