import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, readdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { canonicalizeStrict } from "../src/canonical.js";
import { createGitHubDeferredSnapshotAdapter } from "../src/outsider-github-deferred-snapshot-adapter.js";
const hash = value => `sha256:${createHash("sha256").update(value).digest("hex")}`;
function harness({ lostReceipt = false } = {}) {
  const directory = mkdtempSync(path.join(os.tmpdir(), "outsider-deferred-snapshot-"));
  const program = { programHash: hash("program"), completionDeadline: "2026-09-06T00:45:00.000Z", obligations: [] };
  const requirement = { requirementId: "database_snapshot", role: "PRIMARY", constraints: {} };
  const sourceReadReceiptHash = hash("actual-select-fixture");
  const snapshotBytes = Buffer.from(canonicalizeStrict({ sourceReadReceiptHash,
    records: [{ id: "a", value: "1" }, { id: "b", value: "2" }, { id: "c", value: "3" }] }));
  const source = { snapshotBytes, snapshotHash: hash(snapshotBytes), sourceReadReceiptHash };
  const suffix = createHash("sha256").update(`${program.programHash}\0${requirement.requirementId}`).digest("hex").slice(0, 32);
  const tag = `outsider-recovery-${suffix}`, assetName = `artifact-${suffix}.bin`;
  const routeUrl = `https://github.com/outsider/snapshots/releases/download/${tag}/${assetName}`;
  const state = { active: false, uploads: 0, deletes: 0, reads: [], sourceCalls: 0, assetId: 21, badBytes: false };
  const expected = () => ({ owner: "outsider", repository: "snapshots", releaseId: 11, assetId: state.assetId,
    targetCommitSha: "a".repeat(40), tag, assetName, routeUrl, artifactHash: source.snapshotHash });
  const nativeFactory = input => {
    assert.deepEqual(input.artifactBytes, snapshotBytes);
    return {
      async reserve(context) {
        assert.equal(context.requirement.role, "RECOVERY");
        assert.equal(context.requirement.constraints.artifactHash, source.snapshotHash);
        state.uploads++; state.active = true;
        if (lostReceipt) throw new Error("FIXTURE_LOST_NATIVE_RECEIPT");
        return { status: "RESERVED", reservationId: "fixture-native", adapterState: expected() };
      },
      async release({ reservation }) {
        assert.deepEqual(reservation.adapterState, expected());
        if (state.releaseOpenOnce) { state.releaseOpenOnce = false; return { status: "OPEN" }; }
        state.deletes++; state.active = false;
        return { status: "RELEASED", activeRouteVerifiedAbsent: true };
      },
    };
  };
  const fetchImpl = async (url, options) => {
    assert.equal(options.method, "GET"); state.reads.push({ url, options });
    if (!state.active) return Response.json({}, { status: 404 });
    if (url === routeUrl) {
      assert.equal(Object.hasOwn(options.headers, "Authorization"), false);
      return new Response(state.badBytes ? "changed" : snapshotBytes);
    }
    assert.equal(new URL(url).origin, "https://api.github.com");
    assert.equal(options.redirect, "error");
    if (url.endsWith(`/releases/tags/${tag}`)) return Response.json({ id: 11, tag_name: tag,
      target_commitish: "a".repeat(40), name: `Outsider recovery ${suffix}`,
      body: `Outsider order-scoped recovery artifact.\nnamespace:${suffix}\nartifact:${source.snapshotHash}\nretention:ephemeral-active-route`,
      draft: false, prerelease: true, immutable: false });
    const asset = { id: state.assetId, name: assetName, state: "uploaded", content_type: "application/octet-stream",
      size: snapshotBytes.length, digest: source.snapshotHash, browser_download_url: routeUrl };
    return Response.json(url.endsWith("/assets") ? [asset] : asset);
  };
  const config = { directory, clock: () => "2026-09-06T00:00:00.000Z",
    github: { owner: "outsider", repository: "snapshots", apiToken: "FIXTURE_CREDENTIAL_NOT_REAL", fetchImpl },
    snapshotSource: async context => { state.sourceCalls++; assert.deepEqual(context.dependencyEvidence,
      [{ nodeId: "seed_workspace", witness: { status: "SATISFIED" } }]); return source; } };
  return { directory, program, requirement, state, source, config, nativeFactory,
    adapter: createGitHubDeferredSnapshotAdapter(config, { nativeFactory }),
    executeContext: reservation => ({ reservation, operationId: "snapshot-upload-001",
      dependencyEvidence: [{ nodeId: "seed_workspace", witness: { status: "SATISFIED" } }] }) };
}

test("namespace is offline; execute binds SELECT snapshot, cold GET checks exact version and release reuses native ownership", async () => {
  const x = harness(); const reservation = await x.adapter.reserve({ program: x.program,
    requirement: x.requirement, operationId: "namespace-001" });
  assert.equal(reservation.status, "NAMESPACE_PREPARED"); assert.equal(reservation.capacityEstablished, false);
  assert.equal(x.state.sourceCalls, 0); assert.equal(x.state.reads.length, 0); assert.equal(x.state.uploads, 0);
  const result = await x.adapter.execute(x.executeContext(reservation));
  assert.equal(result.status, "SUCCEEDED"); assert.equal(result.sourceKind, "PROVIDER_FIXTURE");
  assert.equal(result.sourceReadReceiptHash, x.source.sourceReadReceiptHash);
  const cold = createGitHubDeferredSnapshotAdapter({ ...x.config,
    snapshotSource: () => { throw new Error("MUST_NOT_REFETCH_SOURCE"); } }, { nativeFactory: x.nativeFactory });
  const repeated = await cold.execute(x.executeContext(reservation));
  assert.equal(repeated.providerReceipt, result.providerReceipt);
  assert.equal(x.state.uploads, 1); assert.equal(x.state.sourceCalls, 1);
  const downloaded = await cold.downloadSnapshot({ reservation, operationId: "download-001" });
  assert.equal(downloaded.downloadedFromProvider, true);
  assert.deepEqual(downloaded.snapshotBytes, x.source.snapshotBytes);
  assert.equal(x.state.uploads, 1);
  x.state.releaseOpenOnce = true;
  assert.equal((await cold.release({ reservation, operationId: "cleanup-001" })).status, "OPEN");
  assert.equal(readdirSync(path.join(x.directory, reservation.namespaceHash.slice(7))).includes("released.json"), false);
  assert.equal((await cold.release({ reservation, operationId: "cleanup-001" })).status, "RELEASED");
  assert.equal((await cold.release({ reservation, operationId: "cleanup-001" })).status, "RELEASED");
  assert.equal(x.state.deletes, 1);
  const files = path.join(x.directory, reservation.namespaceHash.slice(7));
  assert.equal(readdirSync(files).map(name => readFileSync(path.join(files, name), "utf8")).join("\n")
    .includes("FIXTURE_CREDENTIAL_NOT_REAL"), false);
});

test("lost native receipt only performs exact reads and cannot reupload or delete without ownership binding", async () => {
  const x = harness({ lostReceipt: true }); const reservation = await x.adapter.reserve({ program: x.program,
    requirement: x.requirement, operationId: "namespace-001" });
  await assert.rejects(x.adapter.execute(x.executeContext(reservation)), /LOST_NATIVE_RECEIPT/);
  const result = await x.adapter.execute(x.executeContext(reservation));
  assert.equal(result.status, "PUBLICATION_OBSERVED_CLEANUP_BINDING_REQUIRED");
  assert.equal(result.nativeCleanupBindingAvailable, false); assert.equal(x.state.uploads, 1);
  assert.equal((await x.adapter.release({ reservation, operationId: "cleanup" })).status, "CLEANUP_RECONCILIATION_REQUIRED");
  assert.equal(x.state.deletes, 0); assert.equal(x.state.active, true);
});

test("snapshot provenance mismatch fails before dispatch; replaced provider object or bytes cannot reconcile", async () => {
  const x = harness(); const reservation = await x.adapter.reserve({ program: x.program,
    requirement: x.requirement, operationId: "namespace-001" });
  const bad = createGitHubDeferredSnapshotAdapter({ ...x.config, snapshotSource: () => ({ ...x.source,
    sourceReadReceiptHash: hash("unrelated-read") }) }, { nativeFactory: x.nativeFactory });
  await assert.rejects(bad.execute(x.executeContext(reservation)), /SOURCE_RECEIPT_BINDING_MISMATCH/);
  assert.equal(x.state.uploads, 0);
  await x.adapter.execute(x.executeContext(reservation));
  x.state.assetId = 22;
  await assert.rejects(x.adapter.reconcile({ reservation, operationId: "read-2" }), /NATIVE_RECEIPT_VERSION_CHANGED/);
  x.state.assetId = 21; x.state.badBytes = true;
  await assert.rejects(x.adapter.reconcile({ reservation, operationId: "read-3" }), /DOWNLOAD_NOT_EXACT/);
  assert.equal(x.state.uploads, 1);
});
