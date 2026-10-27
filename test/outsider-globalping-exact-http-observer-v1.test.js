import assert from "node:assert/strict";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { createGlobalpingExactHttpObserverV1 }
  from "../src/outsider-globalping-exact-http-observer-v1.js";

function directory() {
  return realpathSync(mkdtempSync(path.join(tmpdir(),
    "outsider-globalping-exact-v1-")));
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

test("one external probe supplies exact status/body evidence and restart reuses it",
  async () => {
    const root = directory();
    const calls = [];
    try {
      const fetchImpl = async (url, options) => {
        calls.push([url, options.method]);
        if (options.method === "POST") {
          const request = JSON.parse(options.body);
          assert.equal(request.target, "result.example");
          assert.equal(request.measurementOptions.request.path, "/artifact");
          assert.equal(options.headers.authorization, undefined);
          return json(202, { id: "measure_123", probesCount: 1 });
        }
        if (calls.filter((call) => call[1] === "GET").length === 1) {
          return json(200, { status: "in-progress" });
        }
        return json(200, {
          id: "measure_123",
          type: "http",
          target: "result.example",
          status: "finished",
          probesCount: 1,
          results: [{
            probe: { country: "US", asn: 64500, network: "Test probe" },
            result: {
              status: "finished",
              statusCode: 200,
              rawBody: "outsider-result-v1\n",
              truncated: false,
              tls: { authorized: true },
            },
          }],
        });
      };
      const options = {
        directory: root,
        fetchImpl,
        wait: async () => {},
        clock: () => "2026-09-03T12:00:00.000Z",
      };
      const first = await createGlobalpingExactHttpObserverV1(options).observe({
        operationId: "op_exact_001",
        targetUrl: "https://result.example/artifact",
      });
      assert.equal(first.status, 200);
      assert.match(first.bodyHash, /^sha256:[a-f0-9]{64}$/u);
      assert.equal(first.providerReceipt.tlsAuthorized, true);
      assert.equal(calls.length, 3);

      const replay = await createGlobalpingExactHttpObserverV1(options).observe({
        operationId: "op_exact_001",
        targetUrl: "https://result.example/artifact",
      });
      assert.deepEqual(replay, first);
      assert.equal(calls.length, 3, "completed observation must replay locally");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

test("an ambiguous create is never posted twice", async () => {
  const root = directory();
  let posts = 0;
  try {
    const observer = createGlobalpingExactHttpObserverV1({
      directory: root,
      fetchImpl: async () => {
        posts += 1;
        throw new Error("response lost");
      },
      clock: () => "2026-09-03T12:00:00.000Z",
    });
    const input = {
      operationId: "op_ambiguous_001",
      targetUrl: "https://result.example/artifact",
    };
    await assert.rejects(observer.observe(input),
      /CREATE_COMMIT_AMBIGUOUS_NO_RETRY/u);
    await assert.rejects(observer.observe(input),
      /CREATE_COMMIT_AMBIGUOUS_NO_RETRY/u);
    assert.equal(posts, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("concurrent duplicate callers cannot issue two measurement creates",
  async () => {
    const root = directory();
    let posts = 0;
    let releasePost;
    const postBlocked = new Promise((resolve) => { releasePost = resolve; });
    try {
      const observer = createGlobalpingExactHttpObserverV1({
        directory: root,
        fetchImpl: async (_url, options) => {
          if (options.method === "POST") {
            posts += 1;
            await postBlocked;
            throw new Error("stop after proving single submit");
          }
          throw new Error("unexpected GET");
        },
        clock: () => "2026-09-03T12:00:00.000Z",
      });
      const input = {
        operationId: "op_concurrent_001",
        targetUrl: "https://result.example/artifact",
      };
      const first = observer.observe(input);
      await new Promise((resolve) => setImmediate(resolve));
      await assert.rejects(observer.observe(input), /OPERATION_BUSY/u);
      releasePost();
      await assert.rejects(first, /CREATE_COMMIT_AMBIGUOUS_NO_RETRY/u);
      assert.equal(posts, 1);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
