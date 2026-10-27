import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { createFirstCommittedDigitalRealityProgramV1 }
  from "../src/outsider-first-committed-digital-reality-program-v1.js";
import { createGitHubReleaseAssetProductionRecoveryAdapterV2 }
  from "../src/outsider-github-release-asset-production-recovery-adapter-v2.js";
import { createGitHubImmutableReleasePolicyProductionProbeV1 }
  from "../src/outsider-github-immutable-release-policy-production-probe-v1.js";

const TOKEN = "github_pat_outsider_release_asset_token_123456789";
const BASE_SHA = "a".repeat(40);
const MOVED_BASE_SHA = "b".repeat(40);
const ARTIFACT = Buffer.from("outsider:first-committed-reality:v2\n", "utf8");
const ARTIFACT_HASH = `sha256:${createHash("sha256")
  .update(ARTIFACT).digest("hex")}`;

function program() {
  return createFirstCommittedDigitalRealityProgramV1({
    programId: "program_github_release_asset_001",
    orderId: "order_github_release_asset_001",
    createdAt: "2026-09-04T12:00:00.000Z",
    formationDeadline: "2026-09-04T12:10:00.000Z",
    completionDeadline: "2026-09-04T12:30:00.000Z",
    cleanupDeadline: "2026-09-04T12:40:00.000Z",
    artifactHash: ARTIFACT_HASH,
  });
}

function responseJson(value, status = 200) {
  return Response.json(value, { status });
}

function world() {
  return {
    refs: new Map([["heads/main", BASE_SHA]]),
    releases: new Map(),
    assets: new Map(),
    calls: [],
    counts: {
      createRelease: 0,
      uploadAsset: 0,
      deleteAsset: 0,
      deleteRelease: 0,
      deleteTag: 0,
    },
    nextReleaseId: 100,
    nextAssetId: 200,
    throwAfter: new Set(),
    failNext: new Set(),
    lingeringPublicReads: 0,
    starterUploadOnce: false,
    immutableReleasesEnabled: false,
    administrationPreflightStatus: 200,
    policyCalls: [],
    clock: 0,
  };
}

function copyRelease(value) {
  return { ...value, assets: value.assets.map((item) => ({ ...item })) };
}

function releaseTagFromPath(pathname) {
  const marker = "/releases/tags/";
  return decodeURIComponent(pathname.slice(pathname.indexOf(marker)
    + marker.length));
}

function refNameFromPath(pathname, plural) {
  const marker = plural ? "/git/refs/" : "/git/ref/";
  return pathname.slice(pathname.indexOf(marker) + marker.length)
    .split("/").map(decodeURIComponent).join("/");
}

function fetchFor(selected) {
  return async (url, init = {}) => {
    const parsed = new URL(url);
    const method = init.method ?? "GET";
    const headers = new Headers(init.headers);
    selected.calls.push({ url, method, signal: init.signal,
      authorization: headers.get("authorization"),
      apiVersion: headers.get("x-github-api-version") });

    if (parsed.hostname === "github.com") {
      const cleanUrl = `${parsed.origin}${parsed.pathname}`;
      const active = [...selected.assets.values()].find((asset) =>
        asset.browser_download_url === cleanUrl);
      if (active !== undefined) return new Response(active.bytes, { status: 200 });
      if (selected.lingeringPublicReads > 0) {
        selected.lingeringPublicReads -= 1;
        return new Response(ARTIFACT, { status: 200 });
      }
      return new Response("missing", { status: 404 });
    }

    if (parsed.hostname === "uploads.github.com" && method === "POST") {
      selected.counts.uploadAsset += 1;
      const releaseId = Number(parsed.pathname.match(/\/releases\/(\d+)\/assets/u)?.[1]);
      const release = [...selected.releases.values()].find((item) =>
        item.id === releaseId);
      assert.ok(release);
      const name = parsed.searchParams.get("name");
      const id = selected.nextAssetId++;
      const browserDownloadUrl = `https://github.com/outsider/public-recovery/`
        + `releases/download/${encodeURIComponent(release.tag_name)}/`
        + encodeURIComponent(name);
      const asset = {
        id,
        name,
        state: selected.starterUploadOnce ? "starter" : "uploaded",
        content_type: headers.get("content-type"),
        size: selected.starterUploadOnce ? 0 : Buffer.from(init.body).length,
        digest: selected.starterUploadOnce ? null : ARTIFACT_HASH,
        browser_download_url: browserDownloadUrl,
        bytes: selected.starterUploadOnce ? Buffer.alloc(0)
          : Buffer.from(init.body),
      };
      const starterUpload = selected.starterUploadOnce;
      selected.starterUploadOnce = false;
      selected.assets.set(id, asset);
      release.assets.push(asset);
      if (selected.throwAfter.delete("uploadAsset")) {
        selected.failNext.add(`release:${release.tag_name}`);
        throw new TypeError("injected lost upload acknowledgement");
      }
      return responseJson(asset, starterUpload ? 502 : 201);
    }

    assert.equal(parsed.hostname, "api.github.com");
    const pathname = parsed.pathname;
    if (pathname === "/repos/outsider/public-recovery" && method === "GET") {
      return responseJson({ private: false, default_branch: "main" });
    }
    if (pathname.includes("/git/ref/") && method === "GET") {
      const ref = refNameFromPath(pathname, false);
      if (selected.failNext.delete(`ref:${ref}`)) {
        throw new TypeError("injected ref read interruption");
      }
      const sha = selected.refs.get(ref);
      return sha === undefined
        ? responseJson({ message: "Not Found" }, 404)
        : responseJson({ object: { sha, type: "commit" } });
    }
    if (pathname.endsWith("/releases") && method === "POST") {
      selected.counts.createRelease += 1;
      const body = JSON.parse(init.body);
      const id = selected.nextReleaseId++;
      const release = {
        id,
        tag_name: body.tag_name,
        target_commitish: body.target_commitish,
        name: body.name,
        body: body.body,
        draft: body.draft,
        prerelease: body.prerelease,
        immutable: false,
        upload_url: `https://uploads.github.com/repos/outsider/`
          + `public-recovery/releases/${id}/assets{?name,label}`,
        assets: [],
      };
      selected.releases.set(body.tag_name, release);
      selected.refs.set(`tags/${body.tag_name}`, body.target_commitish);
      if (selected.throwAfter.delete("createRelease")) {
        selected.failNext.add(`release:${body.tag_name}`);
        throw new TypeError("injected lost release acknowledgement");
      }
      return responseJson(release, 201);
    }
    if (pathname.includes("/releases/tags/") && method === "GET") {
      const tag = releaseTagFromPath(pathname);
      if (selected.failNext.delete(`release:${tag}`)) {
        throw new TypeError("injected release read interruption");
      }
      const release = selected.releases.get(tag);
      return release === undefined
        ? responseJson({ message: "Not Found" }, 404)
        : responseJson(copyRelease(release));
    }
    const assetListMatch = pathname.match(/\/releases\/(\d+)\/assets$/u);
    if (assetListMatch && method === "GET") {
      const id = Number(assetListMatch[1]);
      const release = [...selected.releases.values()].find((item) =>
        item.id === id);
      return release === undefined
        ? responseJson({ message: "Not Found" }, 404)
        : responseJson(release.assets.map((asset) => ({ ...asset })));
    }
    const assetMatch = pathname.match(/\/releases\/assets\/(\d+)$/u);
    if (assetMatch && method === "GET") {
      const id = Number(assetMatch[1]);
      if (selected.failNext.delete(`asset:${id}`)) {
        throw new TypeError("injected asset read interruption");
      }
      const asset = selected.assets.get(id);
      return asset === undefined
        ? responseJson({ message: "Not Found" }, 404)
        : responseJson(asset);
    }
    if (assetMatch && method === "DELETE") {
      const id = Number(assetMatch[1]);
      selected.counts.deleteAsset += 1;
      selected.assets.delete(id);
      for (const release of selected.releases.values()) {
        release.assets = release.assets.filter((asset) => asset.id !== id);
      }
      if (selected.throwAfter.delete("deleteAsset")) {
        selected.failNext.add(`asset:${id}`);
        throw new TypeError("injected lost asset-delete acknowledgement");
      }
      return new Response(null, { status: 204 });
    }
    const releaseMatch = pathname.match(/\/releases\/(\d+)$/u);
    if (releaseMatch && method === "DELETE") {
      const id = Number(releaseMatch[1]);
      selected.counts.deleteRelease += 1;
      const entry = [...selected.releases.entries()].find(([, item]) =>
        item.id === id);
      assert.ok(entry);
      selected.releases.delete(entry[0]);
      if (selected.throwAfter.delete("deleteRelease")) {
        selected.failNext.add(`release:${entry[0]}`);
        throw new TypeError("injected lost release-delete acknowledgement");
      }
      return new Response(null, { status: 204 });
    }
    if (pathname.includes("/git/refs/") && method === "DELETE") {
      const ref = refNameFromPath(pathname, true);
      selected.counts.deleteTag += 1;
      selected.refs.delete(ref);
      if (selected.throwAfter.delete("deleteTag")) {
        selected.failNext.add(`ref:${ref}`);
        throw new TypeError("injected lost tag-delete acknowledgement");
      }
      return new Response(null, { status: 204 });
    }
    throw new Error(`unhandled ${method} ${url}`);
  };
}

function adapter(selected, overrides = {}) {
  return createGitHubReleaseAssetProductionRecoveryAdapterV2({
    apiToken: TOKEN,
    owner: "outsider",
    repository: "public-recovery",
    baseBranch: "main",
    artifactBytes: ARTIFACT,
    immutableReleasePolicyProbe: policyProbe(selected),
    fetchImpl: fetchFor(selected),
    routeVerificationTimeoutMs: 100,
    routePollIntervalMs: 10,
    now: () => selected.clock,
    wait: async (milliseconds) => { selected.clock += milliseconds; },
    ...overrides,
  });
}

function policyProbe(selected) {
  return createGitHubImmutableReleasePolicyProductionProbeV1({
    apiToken: TOKEN,
    administrationReadCapabilityConfirmed: true,
    owner: "outsider",
    repository: "public-recovery",
    async fetchImpl(url, init) {
      selected.policyCalls.push({ url, init });
      if (url.endsWith("/actions/permissions")) {
        const status = selected.administrationPreflightStatus;
        return status === 200
          ? Response.json({ enabled: true, allowed_actions: "all" })
          : Response.json({ message: status === 403
            ? "Forbidden" : "Not Found" }, { status });
      }
      if (url.endsWith("/immutable-releases")) {
        return selected.immutableReleasesEnabled
          ? Response.json({ enabled: true, enforced_by_owner: false })
          : Response.json({ message: "Not Found" }, { status: 404 });
      }
      throw new Error(`unexpected policy URL ${url}`);
    },
  });
}

async function reserve(selected, overrides = {}) {
  const compiled = program();
  const requirement = compiled.requirements.find((item) =>
    item.role === "RECOVERY");
  return adapter(selected, overrides).reserve({
    program: compiled,
    requirement,
    operationId: "op_reserve_release_asset_001",
  });
}

test("forms an exact public Release Asset standby and removes its active route", async () => {
  const selected = world();
  const reservation = await reserve(selected);
  assert.equal(reservation.status, "RESERVED");
  assert.equal(reservation.adapterState.containsCredential, false);
  assert.equal(reservation.adapterState.activeRouteVerified, true);
  assert.equal(reservation.adapterState.irreversibleErasureClaimed, false);
  assert.equal(JSON.stringify(reservation).includes(TOKEN), false);
  assert.match(reservation.adapterState.tag,
    /^outsider-recovery-[a-f0-9]{32}$/u);
  assert.match(reservation.adapterState.routeUrl,
    /^https:\/\/github\.com\/outsider\/public-recovery\/releases\/download\//u);
  const replayedReservation = JSON.parse(JSON.stringify(reservation));

  const result = await adapter(selected).execute({
    reservation: replayedReservation,
    operationId: "op_execute_release_asset_001",
    primaryFailure: { status: "FAILED", reason: "PRIMARY_DOWN" } });
  assert.equal(result.status, "SUCCEEDED");
  assert.equal(result.providerObservationIndependent, false);

  const closed = await adapter(selected).closeObligation({
    reservation: replayedReservation,
    operationId: "op_close_release_asset_001" });
  assert.equal(closed.status, "CLOSED");
  assert.equal(closed.activeRouteVerifiedAbsent, true);
  assert.equal(closed.irreversibleErasureClaimed, false);
  assert.deepEqual(selected.counts, {
    createRelease: 1,
    uploadAsset: 1,
    deleteAsset: 1,
    deleteRelease: 1,
    deleteTag: 1,
  });
  assert.equal(selected.releases.size, 0);
  assert.equal(selected.assets.size, 0);
  assert.equal([...selected.refs.keys()].some((ref) =>
    ref.startsWith("tags/outsider-recovery-")), false);
  assert.equal(selected.calls.every((call) =>
    call.signal instanceof AbortSignal), true);
  assert.equal(new Set(selected.calls.map((call) => call.signal)).size,
    selected.calls.length,
    "each API, upload, and public request receives a fresh timeout signal");
  assert.equal(selected.calls.filter((call) =>
    call.url.startsWith("https://api.github.com")
      || call.url.startsWith("https://uploads.github.com"))
    .every((call) => call.apiVersion === "2026-03-10"
      && call.authorization === `Bearer ${TOKEN}`), true);
  assert.equal(selected.calls.filter((call) =>
    call.url.startsWith("https://github.com"))
    .every((call) => call.authorization === null), true);
  assert.equal(selected.policyCalls.every((call) =>
    call.init.signal instanceof AbortSignal), true);
});

test("lost create and upload acknowledgements reconcile without duplicate mutations", async () => {
  const selected = world();
  selected.throwAfter.add("createRelease");
  await assert.rejects(() => reserve(selected), /release read interruption/u);
  assert.equal(selected.counts.createRelease, 1);
  selected.refs.set("heads/main", MOVED_BASE_SHA);

  selected.throwAfter.add("uploadAsset");
  await assert.rejects(() => reserve(selected), /release read interruption/u);
  assert.equal(selected.counts.createRelease, 1);
  assert.equal(selected.counts.uploadAsset, 1);

  const reconciled = await reserve(selected);
  assert.equal(reconciled.status, "RESERVED");
  assert.equal(reconciled.adapterState.targetCommitSha, BASE_SHA,
    "the recovered tag remains bound to the first exact target commit");
  assert.equal(selected.counts.createRelease, 1);
  assert.equal(selected.counts.uploadAsset, 1);
});

test("a documented 502 starter asset is removed before one later retry uploads", async () => {
  const selected = world();
  selected.starterUploadOnce = true;
  await assert.rejects(() => reserve(selected), (error) => {
    assert.equal(error.outsiderCode,
      "INCOMPLETE_ASSET_REMOVED_RETRY_REQUIRED");
    return true;
  });
  assert.equal(selected.counts.createRelease, 1);
  assert.equal(selected.counts.uploadAsset, 1);
  assert.equal(selected.counts.deleteAsset, 1);
  assert.equal(selected.assets.size, 0);

  const reservation = await reserve(selected);
  assert.equal(reservation.status, "RESERVED");
  assert.equal(selected.counts.createRelease, 1);
  assert.equal(selected.counts.uploadAsset, 2);
  assert.equal(selected.counts.deleteAsset, 1);
});

test("lost cleanup acknowledgements reconcile without duplicate deletes", async () => {
  const selected = world();
  const reservation = await reserve(selected);

  selected.throwAfter.add("deleteAsset");
  await assert.rejects(() => adapter(selected).release({ reservation,
    operationId: "op_close_release_asset_ambiguous" }),
  /asset read interruption/u);
  assert.equal(selected.counts.deleteAsset, 1);

  selected.throwAfter.add("deleteRelease");
  await assert.rejects(() => adapter(selected).release({ reservation,
    operationId: "op_close_release_asset_ambiguous" }),
  /release read interruption/u);
  assert.equal(selected.counts.deleteAsset, 1);
  assert.equal(selected.counts.deleteRelease, 1);

  selected.throwAfter.add("deleteTag");
  await assert.rejects(() => adapter(selected).release({ reservation,
    operationId: "op_close_release_asset_ambiguous" }),
  /ref read interruption/u);
  assert.equal(selected.counts.deleteRelease, 1);
  assert.equal(selected.counts.deleteTag, 1);

  const released = await adapter(selected).release({ reservation,
    operationId: "op_close_release_asset_ambiguous" });
  assert.equal(released.status, "RELEASED");
  assert.equal(released.activeRouteVerifiedAbsent, true);
  assert.deepEqual(selected.counts, {
    createRelease: 1,
    uploadAsset: 1,
    deleteAsset: 1,
    deleteRelease: 1,
    deleteTag: 1,
  });
});

test("cleanup waits for a stale public edge then proves a terminal absent route", async () => {
  const selected = world();
  const reservation = await reserve(selected);
  selected.lingeringPublicReads = 2;
  const released = await adapter(selected).release({ reservation,
    operationId: "op_close_release_asset_edge_001" });
  assert.equal(released.status, "RELEASED");
  assert.equal(selected.lingeringPublicReads, 0);
  assert.equal(selected.clock, 20);
});

test("an existing order-scoped release with changed provenance is rejected", async () => {
  const selected = world();
  const reservation = await reserve(selected);
  const release = selected.releases.get(reservation.adapterState.tag);
  release.body = "not the bound Outsider release";
  await assert.rejects(() => reserve(selected), (error) => {
    assert.equal(error.outsiderCode, "RELEASE_CONFLICT");
    return true;
  });
  assert.equal(selected.counts.createRelease, 1);
  assert.equal(selected.counts.uploadAsset, 1);
});

test("cleanup refuses an order release containing an unbound foreign asset", async () => {
  const selected = world();
  const reservation = await reserve(selected);
  const release = selected.releases.get(reservation.adapterState.tag);
  const foreign = {
    id: 999,
    name: "foreign.bin",
    state: "uploaded",
    content_type: "application/octet-stream",
    size: 1,
    digest: `sha256:${"f".repeat(64)}`,
    browser_download_url: "https://github.com/outsider/public-recovery/"
      + `releases/download/${reservation.adapterState.tag}/foreign.bin`,
    bytes: Buffer.from("x"),
  };
  release.assets.push(foreign);
  selected.assets.set(foreign.id, foreign);
  await assert.rejects(() => adapter(selected).release({ reservation,
    operationId: "op_close_release_asset_foreign" }), (error) => {
    assert.equal(error.outsiderCode, "RELEASE_ASSET_SET_CONFLICT");
    return true;
  });
  assert.equal(selected.counts.deleteAsset, 0);
  assert.equal(selected.counts.deleteRelease, 0);
  assert.equal(selected.counts.deleteTag, 0);
});

test("immutable-release policy is rejected before any remote mutation", async () => {
  const selected = world();
  selected.immutableReleasesEnabled = true;
  const result = await reserve(selected);
  assert.deepEqual(result, { status: "UNAVAILABLE",
    reason: "IMMUTABLE_RELEASES_INCOMPATIBLE_WITH_EPHEMERAL_ROUTE" });
  assert.deepEqual(selected.counts, {
    createRelease: 0,
    uploadAsset: 0,
    deleteAsset: 0,
    deleteRelease: 0,
    deleteTag: 0,
  });
  assert.throws(() => createGitHubReleaseAssetProductionRecoveryAdapterV2({
    apiToken: TOKEN,
    owner: "outsider",
    repository: "public-recovery",
    artifactBytes: ARTIFACT,
    fetchImpl: fetchFor(selected),
  }), (error) => {
    assert.equal(error.outsiderCode,
      "IMMUTABLE_RELEASE_POLICY_CAPABILITY_REQUIRED");
    return true;
  });
});

for (const status of [403, 404]) {
  test(`administration preflight ${status} blocks every release mutation`,
    async () => {
      const selected = world();
      selected.administrationPreflightStatus = status;
      await assert.rejects(() => reserve(selected), (error) => {
        assert.equal(error.outsiderCode,
          "ADMINISTRATION_READ_PREFLIGHT_FAILED");
        return true;
      });
      assert.deepEqual(selected.counts, {
        createRelease: 0,
        uploadAsset: 0,
        deleteAsset: 0,
        deleteRelease: 0,
        deleteTag: 0,
      });
      assert.equal(selected.policyCalls.length, 1);
      assert.equal(selected.policyCalls[0].url.endsWith(
        "/actions/permissions"), true);
    });
}

test("policy capability issued to a different token cannot satisfy the adapter", () => {
  const selected = world();
  const differentToken = `${TOKEN}_different`;
  const differentCapability = createGitHubImmutableReleasePolicyProductionProbeV1({
    apiToken: differentToken,
    administrationReadCapabilityConfirmed: true,
    owner: "outsider",
    repository: "public-recovery",
    fetchImpl: async () => Response.json({ enabled: true }),
  });
  assert.throws(() => createGitHubReleaseAssetProductionRecoveryAdapterV2({
    apiToken: TOKEN,
    owner: "outsider",
    repository: "public-recovery",
    artifactBytes: ARTIFACT,
    immutableReleasePolicyProbe: differentCapability,
    fetchImpl: fetchFor(selected),
  }), (error) => {
    assert.equal(error.outsiderCode,
      "IMMUTABLE_RELEASE_POLICY_CAPABILITY_REQUIRED");
    return true;
  });
});

test("request timeout aborts formation and timeout ceilings are enforced", async () => {
  let observedSignal;
  const timeoutAdapter = createGitHubReleaseAssetProductionRecoveryAdapterV2({
    apiToken: TOKEN,
    owner: "outsider",
    repository: "public-recovery",
    artifactBytes: ARTIFACT,
    immutableReleasePolicyProbe: policyProbe(world()),
    requestTimeoutMs: 5,
    async fetchImpl(_url, init) {
      observedSignal = init.signal;
      return new Promise(() => {});
    },
  });
  const compiled = program();
  await assert.rejects(timeoutAdapter.reserve({
    program: compiled,
    requirement: compiled.requirements.find((item) =>
      item.role === "RECOVERY"),
    operationId: "op_reserve_release_asset_timeout",
  }), (error) => {
    assert.equal(error.outsiderCode, "REQUEST_TIMEOUT");
    return true;
  });
  assert.equal(observedSignal instanceof AbortSignal, true);
  assert.equal(observedSignal.aborted, true);

  assert.throws(() => createGitHubReleaseAssetProductionRecoveryAdapterV2({
    apiToken: TOKEN,
    owner: "outsider",
    repository: "public-recovery",
    artifactBytes: ARTIFACT,
    immutableReleasePolicyProbe: policyProbe(world()),
    requestTimeoutMs: 60_001,
  }), /CONFIG_INVALID/u);
  assert.throws(() => createGitHubReleaseAssetProductionRecoveryAdapterV2({
    apiToken: TOKEN,
    owner: "outsider",
    repository: "public-recovery",
    artifactBytes: ARTIFACT,
    immutableReleasePolicyProbe: policyProbe(world()),
    routeVerificationTimeoutMs: 60_001,
  }), /CONFIG_INVALID/u);
});
