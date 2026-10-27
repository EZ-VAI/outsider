import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { buildAdafruitGroundAdvantageQuote, runAdafruitShippingQuote }
  from "../scripts/outsider-adafruit-shipping-quote.mjs";

const FORM = `<form action="/checkout" method="post">
<input name="csrf_token" type="hidden" value="fixture0123456789abcdef">
<input name="shipping" type="radio" id="ups" value="ups_ground" checked>
<label for="ups">UPS Ground Saver : $8.69</label>
<input name="shipping" type="radio" id="usps" value="easyshipusps_fixture">
<label for="usps">USPS - Ground Advantage : $5.93</label>
<button name="action" value="save_three">Continue</button></form>`;

test("quote body contains only the actual offered service, source CSRF, and save_three", () => {
  const quote = buildAdafruitGroundAdvantageQuote(FORM);
  assert.deepEqual([...new URLSearchParams(quote.body.toString()).entries()], [
    ["csrf_token", "fixture0123456789abcdef"],
    ["shipping", "easyshipusps_fixture"], ["action", "save_three"]]);
  assert.equal(quote.rate.amountMinor, 593);
  assert.throws(() => buildAdafruitGroundAdvantageQuote(FORM.replace(
    "USPS - Ground Advantage", "USPS - Priority Mail")), /REQUESTED_SERVICE_NOT_OFFERED/u);
});

test("ambiguous shipping POST is persisted and a cold rerun performs no I/O", async t => {
  const root = mkdtempSync(path.join(tmpdir(), "outsider-shipping-quote-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const orderRefHash = `sha256:${createHash("sha256").update("fixture-order").digest("hex")}`;
  const cookie = path.join(root, `${orderRefHash.slice(7)}.cookies-v1.json`);
  writeFileSync(cookie, JSON.stringify({ schema: "outsider/order-scoped-buyer-native-cookie-jar/v1",
    schemaVersion: "1.0.0", orderRefHash, nextCreationIndex: 0, cookies: [] }), { mode: 0o600 });
  const calls = [];
  const options = { sourceCookieFile: cookie, outputDirectory: path.join(root, "run"),
    completionDeadline: "2026-09-11T03:59:59.999Z", fetchImpl: async (url, init) => {
      calls.push({ url, method: init.method });
      if (init.method === "GET") return new Response(FORM, { status: 200 });
      throw new Error("fixture lost response after server could accept POST");
    } };
  const first = await runAdafruitShippingQuote(options);
  assert.equal(first.state, "AMBIGUOUS_SHIPPING_CHOICE_NO_RETRY");
  assert.equal(first.counts.postRequests, 1);
  assert.equal(first.counts.getRequests, 1);
  assert.equal(JSON.parse(readFileSync(path.join(options.outputDirectory,
    "shipping-choice-attempt.json"))).postRetryPermitted, false);
  const replay = await runAdafruitShippingQuote({ ...options,
    fetchImpl: async () => assert.fail("cold replay cannot repeat external effects") });
  assert.equal(replay.replayed, true);
  assert.equal(calls.length, 2);
});
