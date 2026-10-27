import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { createGlobalpingExactHttpObserverV2 }
  from "../src/outsider-globalping-exact-http-observer-v2.js";

const SUFFIX = "0123456789abcdef0123456789abcdef";
const INITIAL = "https://github.com/owner/repository/releases/download/"
  + `outsider-recovery-${SUFFIX}/artifact-${SUFFIX}.bin`;
const REDIRECT = "https://release-assets.githubusercontent.com/"
  + "github-production-release-asset/123/456/artifact.bin"
  + "?sp=r&se=2026-09-04T13%3A00%3A00Z&sig=private-signed-query";
const BODY = "outsider-release-recovery-v2\n";
const PROBE = Object.freeze({
  country: "US",
  asn: 64500,
  network: "Independent test probe",
});

function directory() {
  return realpathSync(mkdtempSync(path.join(tmpdir(),
    "outsider-globalping-exact-v2-")));
}

function json(status, value) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "content-type": "application/json",
      ...(status === 202
        ? { location: `/v1/measurements/${value.id}` } : {}),
    },
  });
}

function finished(id, target, result, probe = PROBE) {
  return {
    id,
    type: "http",
    target,
    status: "finished",
    probesCount: 1,
    results: [{ probe, result: {
      status: "finished",
      truncated: false,
      tls: { authorized: true },
      ...result,
    } }],
  };
}

function successfulFetch(calls, input = {}) {
  let create = 0;
  return async (url, options) => {
    calls.push([url, options]);
    if (options.method === "POST") {
      create += 1;
      const request = JSON.parse(options.body);
      assert.equal(options.headers.authorization, undefined);
      assert.equal(options.redirect, "error");
      if (create === 1) {
        assert.equal(request.target, "github.com");
        assert.equal(request.limit, 1);
        assert.equal(request.locations, undefined);
        assert.equal(request.measurementOptions.request.path,
          new URL(INITIAL).pathname);
        return json(202, { id: "measure_redirect_001", probesCount: 1 });
      }
      assert.equal(request.target, "release-assets.githubusercontent.com");
      assert.equal(request.limit, undefined);
      assert.deepEqual(request.locations,
        [{ magic: "measure_redirect_001" }],
        "redirect target must reuse the independently selected first probe");
      assert.equal(request.measurementOptions.request.path,
        `${new URL(REDIRECT).pathname}${new URL(REDIRECT).search}`);
      if (input.secondCreateError) throw new Error("lost acknowledgement");
      if (input.secondCreateRejected) {
        return json(422, { error: { type: "validation_error" } });
      }
      return json(202, { id: "measure_final_002", probesCount: 1 });
    }
    if (url.endsWith("measure_redirect_001")) {
      return json(200, finished("measure_redirect_001", "github.com", {
        statusCode: 302,
        rawBody: null,
        headers: { location: input.location ?? REDIRECT },
      }));
    }
    if (url.endsWith("measure_final_002")) {
      return json(200, finished("measure_final_002",
        "release-assets.githubusercontent.com", {
          statusCode: input.finalStatus ?? 200,
          rawBody: input.finalBody ?? BODY,
          truncated: input.truncated ?? false,
        }, input.secondProbe ?? PROBE));
    }
    throw new Error(`unexpected request ${url}`);
  };
}

test("one probe follows the canonical GitHub 302 once, hashes final bytes, and replays locally",
  async () => {
    const root = directory();
    const calls = [];
    try {
      const options = {
        directory: root,
        fetchImpl: successfulFetch(calls),
        wait: async () => {},
        clock: () => "2026-09-04T12:00:00.000Z",
      };
      const first = await createGlobalpingExactHttpObserverV2(options).observe({
        operationId: "op_release_redirect_001",
        targetUrl: INITIAL,
      });
      assert.equal(first.status, 200);
      assert.equal(first.bodyHash, `sha256:${createHash("sha256")
        .update(Buffer.from(BODY, "utf8")).digest("hex")}`);
      assert.equal(first.providerReceipt.redirectCount, 1);
      assert.equal(first.providerReceipt.hopCount, 2);
      assert.deepEqual(first.providerReceipt.hopStatuses, [302, 200]);
      assert.equal(first.providerReceipt.sameProbeAcrossHops, true);
      assert.equal(first.providerReceipt.tlsAuthorizedAtEveryHop, true);
      assert.equal(first.providerReceipt.finalBodyTruncated, false);
      assert.equal(first.providerReceipt.signedRedirectQueryProjected, false);
      assert.equal(JSON.stringify(first).includes("github.com"), false);
      assert.equal(JSON.stringify(first).includes("private-signed-query"),
        false);
      assert.equal(calls.length, 4);

      const replay = await createGlobalpingExactHttpObserverV2(options).observe({
        operationId: "op_release_redirect_001",
        targetUrl: INITIAL,
      });
      assert.deepEqual(replay, first);
      assert.equal(calls.length, 4, "finished observation must replay locally");

      const journals = readFileSync(path.join(root,
        `${createHash("sha256").update("op_release_redirect_001")
          .digest("hex")}.globalping-redirect.jsonl`), "utf8");
      assert.equal(journals.includes("private-signed-query"), false);
      assert.equal(journals.includes(REDIRECT), false,
        "neither raw Location nor its signed query may be persisted");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

test("the same observer preflights the direct Cloudflare primary without a redirect",
  async () => {
    const root = directory();
    const calls = [];
    const target = "https://outsider-result.account-subdomain.workers.dev/";
    try {
      const observer = createGlobalpingExactHttpObserverV2({
        directory: root,
        fetchImpl: async (url, options) => {
          calls.push([url, options]);
          if (options.method === "POST") {
            const request = JSON.parse(options.body);
            assert.equal(request.target,
              "outsider-result.account-subdomain.workers.dev");
            assert.equal(request.measurementOptions.request.path, "/");
            assert.equal(request.limit, 1);
            assert.equal(request.locations, undefined);
            return json(202, { id: "measure_direct_001", probesCount: 1 });
          }
          return json(200, finished("measure_direct_001",
            "outsider-result.account-subdomain.workers.dev", {
              statusCode: 200,
              rawBody: BODY,
            }));
        },
      });
      const result = await observer.observe({
        operationId: "op_direct_workers_001",
        targetUrl: target,
      });
      assert.equal(result.status, 200);
      assert.equal(result.providerReceipt.redirectCount, 0);
      assert.equal(result.providerReceipt.hopCount, 1);
      assert.deepEqual(result.providerReceipt.hopStatuses, [200]);
      assert.equal(result.providerReceipt.redirectTargetHash, null);
      assert.equal(calls.length, 2);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

test("initial queries, credentials, fragments, and non-release paths fail before provider I/O",
  async (t) => {
    for (const [name, target] of [
      ["initial query", `${INITIAL}?sig=forbidden`],
      ["credentials", INITIAL.replace("https://", "https://user:pass@")],
      ["fragment", `${INITIAL}#forbidden`],
      ["other path", "https://github.com/owner/repository/archive/main.zip"],
    ]) {
      await t.test(name, async () => {
        const root = directory();
        let calls = 0;
        try {
          const observer = createGlobalpingExactHttpObserverV2({
            directory: root,
            fetchImpl: async () => { calls += 1; },
          });
          await assert.rejects(observer.observe({
            operationId: `op_invalid_${name.replace(" ", "_")}`,
            targetUrl: target,
          }), /TARGET_(?:INVALID|POLICY_MISMATCH)/u);
          assert.equal(calls, 0);
        } finally {
          rmSync(root, { recursive: true, force: true });
        }
      });
    }
  });

test("a redirect outside the exact GitHub release-assets host policy fails closed",
  async () => {
    const root = directory();
    const calls = [];
    try {
      const observer = createGlobalpingExactHttpObserverV2({
        directory: root,
        fetchImpl: successfulFetch(calls, {
          location: "https://evil.example/github-production-release-asset/x?sig=x",
        }),
      });
      await assert.rejects(observer.observe({
        operationId: "op_bad_redirect_host_001",
        targetUrl: INITIAL,
      }), /REDIRECT_TARGET_POLICY_MISMATCH/u);
      assert.equal(calls.filter(([, options]) =>
        options.method === "POST").length, 1,
      "policy rejection must happen before a second measurement");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

test("an expired provider-signed redirect capability is never forwarded",
  async () => {
    const root = directory();
    const calls = [];
    try {
      const expired = "https://release-assets.githubusercontent.com/"
        + "github-production-release-asset/123/456/artifact.bin"
        + "?sp=r&se=2026-09-04T11%3A59%3A59Z&sig=expired";
      const observer = createGlobalpingExactHttpObserverV2({
        directory: root,
        clock: () => "2026-09-04T12:00:00.000Z",
        fetchImpl: successfulFetch(calls, { location: expired }),
      });
      await assert.rejects(observer.observe({
        operationId: "op_expired_redirect_001",
        targetUrl: INITIAL,
      }), /SIGNED_REDIRECT_CAPABILITY_INVALID_OR_EXPIRED/u);
      assert.equal(calls.filter(([, options]) =>
        options.method === "POST").length, 1);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

test("the redirect measurement must be executed by the same external probe",
  async () => {
    const root = directory();
    try {
      const observer = createGlobalpingExactHttpObserverV2({
        directory: root,
        clock: () => "2026-09-04T12:00:00.000Z",
        fetchImpl: successfulFetch([], {
          secondProbe: { ...PROBE, network: "Different probe" },
        }),
      });
      await assert.rejects(observer.observe({
        operationId: "op_probe_mismatch_001",
        targetUrl: INITIAL,
      }), /REDIRECT_PROBE_BINDING_MISMATCH/u);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

test("a truncated final body never becomes exact-hash evidence", async () => {
  const root = directory();
  try {
    const observer = createGlobalpingExactHttpObserverV2({
      directory: root,
      clock: () => "2026-09-04T12:00:00.000Z",
      fetchImpl: successfulFetch([], { truncated: true }),
    });
    await assert.rejects(observer.observe({
      operationId: "op_truncated_final_001",
      targetUrl: INITIAL,
    }), /EXACT_FINAL_BODY_UNAVAILABLE/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("an ambiguous second create is durable and is never submitted again",
  async () => {
    const root = directory();
    const calls = [];
    try {
      const options = {
        directory: root,
        clock: () => "2026-09-04T12:00:00.000Z",
        fetchImpl: successfulFetch(calls, { secondCreateError: true }),
      };
      const input = {
        operationId: "op_ambiguous_second_create_001",
        targetUrl: INITIAL,
      };
      await assert.rejects(
        createGlobalpingExactHttpObserverV2(options).observe(input),
        /CREATE_COMMIT_AMBIGUOUS_NO_RETRY/u);
      const postCount = calls.filter(([, options]) =>
        options.method === "POST").length;
      await assert.rejects(
        createGlobalpingExactHttpObserverV2(options).observe(input),
        /CREATE_COMMIT_AMBIGUOUS_NO_RETRY/u);
      assert.equal(calls.filter(([, options]) =>
        options.method === "POST").length, postCount);
      assert.equal(postCount, 2);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

test("a provider 422 on the second measurement cannot become final evidence",
  async () => {
    const root = directory();
    const calls = [];
    try {
      const observer = createGlobalpingExactHttpObserverV2({
        directory: root,
        clock: () => "2026-09-04T12:00:00.000Z",
        fetchImpl: successfulFetch(calls, { secondCreateRejected: true }),
      });
      await assert.rejects(observer.observe({
        operationId: "op_second_create_422_001",
        targetUrl: INITIAL,
      }), /CREATE_REJECTED/u);
      assert.equal(calls.filter(([, options]) =>
        options.method === "POST").length, 2);
      assert.equal(calls.some(([url]) => url.endsWith("measure_final_002")),
        false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

test("provider I/O is bounded: create timeout is ambiguous, read timeout is safely replayable",
  async (t) => {
    await t.test("create timeout", async () => {
      const root = directory();
      let posts = 0;
      try {
        const observer = createGlobalpingExactHttpObserverV2({
          directory: root,
          requestTimeoutMs: 5,
          fetchImpl: async () => {
            posts += 1;
            return new Promise(() => {});
          },
        });
        const input = { operationId: "op_create_timeout_001",
          targetUrl: INITIAL };
        await assert.rejects(observer.observe(input),
          /CREATE_COMMIT_AMBIGUOUS_NO_RETRY/u);
        await assert.rejects(observer.observe(input),
          /CREATE_COMMIT_AMBIGUOUS_NO_RETRY/u);
        assert.equal(posts, 1);
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    });

    await t.test("read timeout", async () => {
      const root = directory();
      let posts = 0;
      let gets = 0;
      try {
        const observer = createGlobalpingExactHttpObserverV2({
          directory: root,
          requestTimeoutMs: 5,
          fetchImpl: async (_url, options) => {
            if (options.method === "POST") {
              posts += 1;
              return json(202, {
                id: "measure_read_timeout_001", probesCount: 1,
              });
            }
            gets += 1;
            return new Promise(() => {});
          },
        });
        const input = { operationId: "op_read_timeout_001",
          targetUrl: INITIAL };
        await assert.rejects(observer.observe(input),
          /MEASUREMENT_READ_TIMEOUT/u);
        await assert.rejects(observer.observe(input),
          /MEASUREMENT_READ_TIMEOUT/u);
        assert.equal(posts, 1, "safe reads may replay, create may not");
        assert.equal(gets, 2);
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    });
  });
