import assert from "node:assert/strict";
import test from "node:test";

import { createUptimeRobotAccountRateLimiterV1 }
  from "../src/outsider-uptimerobot-account-rate-limiter-v1.js";

test("shared rolling scheduler preserves two cleanup slots and never exceeds ten",
  async () => {
    let nowMs = Date.parse("2026-09-04T12:00:00.000Z");
    const calls = [];
    const limiter = createUptimeRobotAccountRateLimiterV1({
      clock: () => new Date(nowMs).toISOString(),
      wait: async (milliseconds) => { nowMs += milliseconds; },
      async requestImpl(_url, options) {
        calls.push({ at: nowMs, method: options.method });
        return new Response(null, { status: 204 });
      },
    });
    const route = (name, method, ordinal) => limiter.request(
      `https://api.uptimerobot.com/v3/${name}/${ordinal}`, { method });
    await Promise.all([
      route("primary", "POST", 0), route("recovery", "POST", 0),
      ...Array.from({ length: 4 }, (_, index) =>
        route("primary", "GET", index)),
      ...Array.from({ length: 4 }, (_, index) =>
        route("recovery", "GET", index)),
      route("primary", "DELETE", 0), route("recovery", "DELETE", 0),
    ]);
    assert.equal(calls.length, 12);
    const firstWindow = calls.filter((item) => item.at
      === Date.parse("2026-09-04T12:00:00.000Z"));
    assert.equal(firstWindow.length, 10);
    assert.equal(firstWindow.filter((item) => item.method === "DELETE").length,
      2, "cleanup crosses queued ordinary requests into reserved positions");
    assert.equal(firstWindow.filter((item) => item.method !== "DELETE").length,
      8);
    assert.equal(Math.min(...calls.filter((item) => !firstWindow.includes(item))
      .map((item) => item.at)) >= Date.parse("2026-09-04T12:01:00.000Z"),
    true);
    for (const right of calls) {
      assert.equal(calls.filter((left) => left.at > right.at - 60_000
        && left.at <= right.at).length <= 10, true);
    }
    assert.equal(limiter.publicSnapshot().reservedCleanupRequests, 2);
  });

test("an early-return wait cannot burst through the rolling window", async () => {
  const limiter = createUptimeRobotAccountRateLimiterV1({
    clock: () => "2026-09-04T12:00:00.000Z",
    wait: async () => {},
    requestImpl: async () => new Response(null, { status: 204 }),
  });
  for (let index = 0; index < 8; index += 1) {
    await limiter.request("https://api.uptimerobot.com/v3/monitors/1",
      { method: "GET" });
  }
  await assert.rejects(limiter.request(
    "https://api.uptimerobot.com/v3/monitors/1", { method: "GET" }),
  /WAIT_DID_NOT_REACH_RATE_SLOT/u);
});
