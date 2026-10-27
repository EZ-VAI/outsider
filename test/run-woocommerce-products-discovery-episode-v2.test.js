import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, realpathSync, statSync, writeFileSync }
  from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

test("v2 mock dry-run uses namespace discovery and writes one privacy-closed 0600 JSONL row",
  () => {
    const directory = mkdtempSync(path.join(tmpdir(), "outsider-woo-runner-"));
    const capability = path.join(directory, "capability.json");
    const transcript = path.join(directory, "transcript.jsonl");
    const secret = "PRIVATE_BRAVE_TOKEN_1234567890";
    writeFileSync(capability, JSON.stringify({ apiToken: secret }),
      { mode: 0o600, flag: "wx" });
    const result = spawnSync(process.execPath,
      ["tools/run-woocommerce-products-discovery-episode-v2.mjs",
        "--mock-dry-run", "--capability", realpathSync(capability),
        "--transcript", transcript], { cwd: process.cwd(), encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(statSync(transcript).mode & 0o777, 0o600);
    const durable = readFileSync(transcript, "utf8");
    assert.equal(durable.endsWith("\n"), true);
    assert.equal(durable.trim().split("\n").length, 1);
    assert.equal(durable.includes(secret), false);
    assert.equal(durable.includes("seller.example"), false);
    assert.equal(durable.includes("buy products or services"), false);
    const row = JSON.parse(durable);
    assert.equal(row.mode, "MOCK_DRY_RUN");
    assert.equal(row.schema,
      "outsider/woocommerce-products-discovery-episode-privacy-closed/v2");
    assert.equal(row.wooCommerce.status, "SUCCEEDED");
    assert.equal(row.wooCommerce.namespaceIndexFetched, true);
    assert.equal(row.wooCommerce.wordpressRootIndexFetched, false);
    assert.equal(row.decisionState, "HOLD");
    assert.equal(row.authority, "NONE");
    assert.equal(row.cartCheckoutPaymentPerformed, false);
  });
