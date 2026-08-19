import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { canonicalizeStrict } from "../src/canonical.js";

const demo = JSON.parse(readFileSync(new URL(
  "../deploy/cloudflare-product-demo/public/demo-run.json", import.meta.url,
), "utf8"));

test("public demo embeds an authentic hashed public evidence projection", () => {
  const { publicEvidenceHash, ...body } = demo.publicEvidence;
  const actual = `sha256:${createHash("sha256").update(canonicalizeStrict(body)).digest("hex")}`;
  assert.equal(actual, publicEvidenceHash);
  assert.equal(demo.publicEvidence.terminal.terminalClass, "SAFE_DELIVERY");
  assert.equal(demo.publicEvidence.terminal.proofComplete, true);
  assert.equal(demo.publicEvidence.terminal.interventionComplete, true);
});

test("public demo causal stages are exact, ordered and privacy projected", () => {
  const firstBoundarySeq = demo.timeline.find((event) => event.type === "boundary_paused")?.seq;
  const causal = demo.timeline.filter((event) => event.seq >= firstBoundarySeq
    && demo.requiredStages.includes(event.type));
  assert.deepEqual(causal.map((event) => event.type), demo.requiredStages);
  assert.ok(causal.every((event, index) => index === 0 || causal[index - 1].seq < event.seq));
  assert.ok(demo.timeline.every((event) => /^sha256:[a-f0-9]{64}$/.test(event.eventHash)));
  const serialized = JSON.stringify(demo);
  for (const forbidden of [
    '"prompt":', '"transcript":', '"commandOutput":', '"rawEvents":',
    '"credentials":', "/Users/",
  ]) {
    assert.equal(serialized.includes(forbidden), false, forbidden);
  }
});
