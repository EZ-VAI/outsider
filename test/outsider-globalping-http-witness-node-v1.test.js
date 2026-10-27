import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  chmodSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  createGlobalpingHttpWitnessPlanV1,
  executeGlobalpingHttpWitnessObservationV1,
  verifyGlobalpingHttpWitnessRawJournalV1,
} from "../src/outsider-globalping-http-witness-node-v1.js";
import {
  verifyDurableOneUseEndpointEffectLedgerV1,
} from "../src/outsider-durable-one-use-endpoint-effect-ledger-v1.js";
import {
  runGlobalpingHttpWitnessV1,
} from "../tools/run-globalping-http-witness-v1.mjs";

const MEASUREMENT_ID = "AbCdEf0123456789";
const LEDGER_ID = "ledger_0123456789abcdef0123456789abcdef";

function h(label) {
  return `sha256:${createHash("sha256").update(label).digest("hex")}`;
}

function clock() {
  let sequence = 0;
  return () => new Date(Date.parse("2026-09-03T22:00:00.000Z")
    + sequence++ * 1_000).toISOString();
}

function privateParent(t) {
  const parent = realpathSync(mkdtempSync(path.join(tmpdir(),
    "outsider-globalping-v1-")));
  chmodSync(parent, 0o700);
  t.after(() => rmSync(parent, { recursive: true, force: true }));
  return parent;
}

function plan(overrides = {}) {
  return createGlobalpingHttpWitnessPlanV1({
    targetUrl: "https://example.com/healthz",
    requestMethod: "HEAD",
    outcomeRequirementHash: h("outcome-requirement"),
    evidenceRequirementHash: h("evidence-requirement"),
    targetSelectionProvenanceClass: "CALLER_PINNED_PUBLIC_HTTPS_TARGET",
    targetSelectionProvenanceHash: h("target-selection-provenance"),
    acceptableStatusCodes: [200, 204],
    requireTlsAuthorized: true,
    maximumTotalMilliseconds: 2_000,
    probeLimit: 1,
    measurementTimeoutSeconds: 5,
    effectDeadline: "2026-09-03T23:00:00.000Z",
    projectionSaltBase64: Buffer.alloc(32, 7).toString("base64"),
    ...overrides,
  });
}

function execution(t, planValue = plan()) {
  const parent = privateParent(t);
  return {
    input: {
      plan: planValue,
      privateEpisodeDirectory: path.join(parent, "episode"),
      ledgerId: LEDGER_ID,
      transactionBindingHash: h("transaction"),
      adapterInstanceRefHash: h("adapter-instance"),
      permissionGrantHash: h("permission-binding-not-authority"),
      oneUseNonceHash: h("one-use-nonce"),
      idempotencyKeyHash: h("local-idempotency-binding"),
    },
    parent,
  };
}

function acceptedResponse(headers = {}) {
  return new Response(JSON.stringify({ id: MEASUREMENT_ID, probesCount: 1 }), {
    status: 202,
    headers: {
      "content-type": "application/json",
      location: `/v1/measurements/${MEASUREMENT_ID}`,
      "x-ratelimit-limit": "250",
      "x-ratelimit-remaining": "249",
      ...headers,
    },
  });
}

function statusResponse(status) {
  const body = status === "in-progress" ? {
    id: MEASUREMENT_ID,
    type: "http",
    status,
    createdAt: "2026-09-03T22:00:00.000Z",
    updatedAt: "2026-09-03T22:00:01.000Z",
    target: "example.com",
    probesCount: 1,
    results: [],
  } : {
    id: MEASUREMENT_ID,
    type: "http",
    status: "finished",
    createdAt: "2026-09-03T22:00:00.000Z",
    updatedAt: "2026-09-03T22:00:02.000Z",
    target: "example.com",
    probesCount: 1,
    results: [{
      probe: { continent: "NA", country: "US", city: "New York",
        network: "private-in-public-projection", tags: [], resolvers: [] },
      result: {
        status: "finished",
        rawOutput: "private raw output",
        rawHeaders: "set-cookie: must-not-project",
        rawBody: null,
        truncated: false,
        headers: { "set-cookie": "secret=value" },
        resolvedAddress: "93.184.216.34",
        statusCode: 200,
        statusCodeName: "OK",
        timings: { total: 91, dns: 10, tcp: 20, tls: 30,
          firstByte: 30, download: 1 },
        tls: { authorized: true, protocol: "TLSv1.3" },
      },
    }],
  };
  return new Response(JSON.stringify(body), {
    status: 200, headers: { "content-type": "application/json" },
  });
}

function dependencies({ postTransport, getTransport }) {
  return {
    clock: clock(),
    lookupTargetImpl: async () => [{ address: "93.184.216.34", family: 4 }],
    postTransport,
    getTransport,
    waitImpl: async (milliseconds) => {
      assert.equal(milliseconds, 500);
    },
    signal: new AbortController().signal,
  };
}

test("one unauthenticated POST is fsynced before contact, then exact-id GETs yield only a private source claim",
  async (t) => {
    const run = execution(t);
    const calls = [];
    const statuses = ["in-progress", "finished"];
    const result = await executeGlobalpingHttpWitnessObservationV1(run.input,
      dependencies({
        postTransport: async (url, options) => {
          calls.push({ kind: "POST", url, options });
          assert.equal(url, "https://api.globalping.io/v1/measurements");
          assert.equal(options.method, "POST");
          assert.equal(options.credentials, "omit");
          assert.equal(options.redirect, "error");
          assert.deepEqual(Object.keys(options.headers).sort(),
            ["Accept", "Content-Type"].sort());
          assert.equal(Object.hasOwn(options.headers, "Authorization"), false);
          const body = JSON.parse(Buffer.from(options.body).toString("utf8"));
          assert.equal(body.target, "example.com");
          assert.equal(body.limit, 1);
          assert.equal(body.measurementOptions.request.method, "HEAD");
          assert.equal(body.measurementOptions.request.path, "/healthz");
          assert.equal(body.measurementOptions.request.query, "");
          return acceptedResponse();
        },
        getTransport: async (url, options) => {
          calls.push({ kind: "GET", url, options });
          assert.equal(url,
            `https://api.globalping.io/v1/measurements/${MEASUREMENT_ID}`);
          assert.equal(options.method, "GET");
          assert.equal(options.credentials, "omit");
          assert.equal(options.redirect, "error");
          return statusResponse(statuses.shift());
        },
      }));

    assert.equal(calls.filter((call) => call.kind === "POST").length, 1);
    assert.equal(calls.filter((call) => call.kind === "GET").length, 2);
    assert.equal(result.disposition,
      "SOURCE_DECLARED_REQUIREMENT_MATCH_HOLD");
    assert.equal(result.sourceDeclaredRequirementMatch, true);
    assert.equal(result.independentOutcomeTruthEstablished, false);
    assert.equal(result.legalIndependenceEstablished, false);
    assert.equal(result.commitPermitted, false);
    assert.equal(result.authority, "NONE");
    assert.equal(result.decisionState, "HOLD");
    assert.equal(result.createPostAttemptCount, 1);
    assert.equal(result.createPostAutomaticRetryCount, 0);
    assert.equal(result.paidCreditsObserved, false);
    assert.equal(result.durableManifestPublishedLast, true);
    const projected = JSON.stringify(result);
    for (const secret of ["example.com", "/healthz", MEASUREMENT_ID,
      "93.184.216.34", "private raw output", "secret=value", "New York"]) {
      assert.equal(projected.includes(secret), false, secret);
    }

    const rawDirectory = path.join(run.input.privateEpisodeDirectory,
      "raw-globalping-journal");
    const rawNames = readdirSync(rawDirectory);
    assert.ok(rawNames.length >= 12);
    assert.equal(statSync(rawDirectory).mode & 0o777, 0o700);
    for (const name of rawNames) {
      assert.equal(statSync(path.join(rawDirectory, name)).mode & 0o777, 0o600);
    }
    const privateBytes = Buffer.concat(rawNames.sort().map((name) =>
      readFileSync(path.join(rawDirectory, name)))).toString("utf8");
    assert.match(privateBytes, /example\.com/u);
    assert.match(privateBytes, new RegExp(MEASUREMENT_ID, "u"));
    assert.match(privateBytes, /93\.184\.216\.34/u);
    const journal = verifyGlobalpingHttpWitnessRawJournalV1({
      directory: rawDirectory,
      expectedHeadHash: result.privateRawJournalHeadHash,
    });
    assert.equal(journal.ok, true);
    assert.equal(journal.recordCount, result.privateRawJournalRecordCount);
    const ledger = verifyDurableOneUseEndpointEffectLedgerV1({
      directory: path.join(run.input.privateEpisodeDirectory,
        "one-use-effect-ledger"),
      ledgerId: LEDGER_ID,
      expectedLocalHeadHash: result.oneUseEffectLedgerHeadHash,
    });
    assert.equal(ledger.ok, true);
    assert.equal(ledger.head.transitionCounts.INTENT_ADMITTED, 1);
    assert.equal(ledger.head.transitionCounts.SUBMIT_RESERVED, 1);
    assert.equal(ledger.head.transitionCounts.SUBMIT_ATTEMPTED, 1);
    assert.equal(ledger.head.transitionCounts.ENDPOINT_RECEIPT_OBSERVED, 1);
    const finalFile = path.join(run.input.privateEpisodeDirectory,
      "final-public-projection.json");
    const manifestFile = path.join(run.input.privateEpisodeDirectory,
      "manifest.json");
    assert.equal(statSync(finalFile).mode & 0o777, 0o600);
    assert.equal(statSync(manifestFile).mode & 0o777, 0o600);
    const finalBytes = readFileSync(finalFile);
    const manifestBytes = readFileSync(manifestFile);
    assert.equal(`sha256:${createHash("sha256").update(finalBytes).digest("hex")}`,
      result.durableFinalProjectionFileHash);
    assert.equal(`sha256:${createHash("sha256").update(manifestBytes).digest("hex")}`,
      result.durableManifestFileHash);
    const manifest = JSON.parse(manifestBytes.toString("utf8"));
    assert.equal(manifest.manifestPublishedLast, true);
    assert.equal(manifest.privateRawJournal.headHash,
      result.privateRawJournalHeadHash);
    assert.equal(manifest.oneUseEffectLedger.headHash,
      result.oneUseEffectLedgerHeadHash);
    assert.equal(manifest.targetSelectionProvenanceHash,
      run.input.plan.targetSelectionProvenanceHash);
    assert.equal(manifest.targetSelectionProvenanceClass,
      "CALLER_PINNED_PUBLIC_HTTPS_TARGET");
    assert.equal(manifest.targetSelectionVerificationPerformedByThisModule,
      false);
    assert.equal(manifest.sourcePins.apiSpecSha256,
      "1994758aa5f8b230f18cee513be6bece82b227fd87a6f9aa01072339acebd27d");
  });

test("ambiguous create failure is terminal no-retry and restart refuses before a second POST",
  async (t) => {
    const run = execution(t);
    let posts = 0;
    let gets = 0;
    const deps = dependencies({
      postTransport: async () => {
        posts += 1;
        throw new Error("ambiguous network failure");
      },
      getTransport: async () => { gets += 1; throw new Error("must not GET"); },
    });
    const result = await executeGlobalpingHttpWitnessObservationV1(run.input,
      deps);
    assert.equal(result.disposition,
      "CREATE_COMMIT_UNKNOWN_NO_RETRY_HOLD");
    assert.equal(posts, 1);
    assert.equal(gets, 0);
    const ledger = verifyDurableOneUseEndpointEffectLedgerV1({
      directory: path.join(run.input.privateEpisodeDirectory,
        "one-use-effect-ledger"),
      ledgerId: LEDGER_ID,
      expectedLocalHeadHash: result.oneUseEffectLedgerHeadHash,
    });
    assert.equal(ledger.head.transitionCounts.AMBIGUOUS_NO_RETRY_HOLD, 1);
    await assert.rejects(() => executeGlobalpingHttpWitnessObservationV1(
      run.input, deps), /PRIVATE_EPISODE_DIRECTORY_ALREADY_EXISTS/u);
    assert.equal(posts, 1);
  });

test("non-public or mixed target DNS is refused before ledger attempt and API contact",
  async (t) => {
    const run = execution(t);
    let posts = 0;
    await assert.rejects(() => executeGlobalpingHttpWitnessObservationV1(
      run.input, {
        clock: clock(),
        lookupTargetImpl: async () => [
          { address: "93.184.216.34", family: 4 },
          { address: "127.0.0.1", family: 4 },
        ],
        postTransport: async () => { posts += 1; return acceptedResponse(); },
        getTransport: async () => statusResponse("finished"),
        waitImpl: async () => {},
        signal: new AbortController().signal,
      }), /TARGET_DNS_NON_PUBLIC_OR_MIXED_REFUSED/u);
    assert.equal(posts, 0);
    assert.equal(readdirSync(path.join(run.input.privateEpisodeDirectory,
      "raw-globalping-journal")).length, 1);
  });

test("unsafe target surface is rejected by the pure plan compiler",
  () => {
    for (const targetUrl of [
      "http://example.com/", "https://127.0.0.1/",
      "https://service.local/", "https://example.com/?token=secret",
      "https://user:secret@example.com/",
    ]) {
      assert.throws(() => plan({ targetUrl }),
        /EXACT_PUBLIC_HTTPS_TARGET_REQUIRED/u);
    }
    assert.throws(() => plan({ requestMethod: "POST" }),
      /READ_ONLY_TARGET_METHOD_REQUIRED/u);
    assert.throws(() => plan({ acceptableStatusCodes: [302] }),
      /ACCEPTABLE_STATUS_CODES_INVALID/u);
    assert.throws(() => plan({ probeLimit: 2 }), /EXACTLY_ONE_PROBE_REQUIRED/u);
    assert.throws(() => plan({
      targetSelectionProvenanceClass: "TUF_VERIFIED_ROUTE_SELECTION",
    }), /TARGET_SELECTION_PROVENANCE_CLASS_INVALID/u);
  });

test("unexpected paid-credit receipt is explicitly projected and status GET is refused",
  async (t) => {
    const run = execution(t);
    let posts = 0;
    let gets = 0;
    const result = await executeGlobalpingHttpWitnessObservationV1(run.input,
      dependencies({
        postTransport: async () => {
          posts += 1;
          return acceptedResponse({ "x-credits-consumed": "1" });
        },
        getTransport: async () => { gets += 1; return statusResponse("finished"); },
      }));
    assert.equal(posts, 1);
    assert.equal(gets, 0);
    assert.equal(result.disposition,
      "PAYMENT_POLICY_VIOLATION_NO_RETRY_HOLD");
    assert.equal(result.paidCreditsObserved, true);
    assert.equal(result.paidCreditsPermitted, false);
    assert.equal(result.createPostAutomaticRetryCount, 0);
  });

test("runner prepare is network-free and live requires exact two-part confirmation",
  async (t) => {
    const run = execution(t);
    const document = {
      planInput: {
        targetUrl: run.input.plan.targetUrl,
        requestMethod: run.input.plan.requestMethod,
        outcomeRequirementHash: run.input.plan.outcomeRequirementHash,
        evidenceRequirementHash: run.input.plan.evidenceRequirementHash,
        targetSelectionProvenanceClass:
          run.input.plan.targetSelectionProvenanceClass,
        targetSelectionProvenanceHash:
          run.input.plan.targetSelectionProvenanceHash,
        acceptableStatusCodes: run.input.plan.acceptableStatusCodes,
        requireTlsAuthorized: true,
        maximumTotalMilliseconds: run.input.plan.maximumTotalMilliseconds,
        probeLimit: 1,
        measurementTimeoutSeconds: run.input.plan.measurementTimeoutSeconds,
        effectDeadline: run.input.plan.effectDeadline,
        projectionSaltBase64: run.input.plan.projectionSaltBase64,
      },
      executionBinding: {
        privateEpisodeDirectory: run.input.privateEpisodeDirectory,
        ledgerId: LEDGER_ID,
        transactionBindingHash: run.input.transactionBindingHash,
        adapterInstanceRefHash: run.input.adapterInstanceRefHash,
        permissionGrantHash: run.input.permissionGrantHash,
        oneUseNonceHash: run.input.oneUseNonceHash,
        idempotencyKeyHash: run.input.idempotencyKeyHash,
      },
    };
    const prepared = await runGlobalpingHttpWitnessV1(document,
      { live: false });
    assert.equal(prepared.liveExecutionPerformed, false);
    assert.equal(prepared.paidCreditsPermitted, false);
    assert.equal(prepared.probeLimit, 1);
    assert.equal(prepared.targetSelectionVerificationPerformedByThisModule,
      false);
    assert.equal(readdirSync(run.parent).length, 0);
    await assert.rejects(() => runGlobalpingHttpWitnessV1(document, {
      live: true,
      confirmation: "wrong",
      confirmedPrivateBindingCommitment:
        prepared.privateTargetAndRequirementsBindingCommitment,
      dependencies: { postTransport: async () => {
        throw new Error("must not POST");
      } },
    }), /EXACT_LIVE_CONFIRMATION_REQUIRED/u);
    assert.equal(readdirSync(run.parent).length, 0);
  });
