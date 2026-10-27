import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  chmodSync, mkdtempSync, rmSync, writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  appendProductionRouteProposalOccurrenceV1,
} from "../scripts/outsider-production-route-proposal-append-v1.mjs";

const h = (value) => `sha256:${createHash("sha256")
  .update(value, "utf8").digest("hex")}`;
const CONTRACT = "contract_eb17007dce08d9359f95e8f24fda59d7";
const NOW = "2026-09-04T23:30:00.000Z";
const HEAD = h("registry-head");
const ROUTE = h("redacted-route-projection");
const OCCURRENCE = h("source-occurrence");

function privateToken(t, mode = 0o600) {
  const directory = mkdtempSync(path.join(tmpdir(), "outsider-route-token-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const file = path.join(directory, "token.secret");
  writeFileSync(file, `${"a".repeat(64)}\n`, { mode });
  chmodSync(file, mode);
  return file;
}

function response(value, status = 200) {
  return new Response(JSON.stringify(value), { status,
    headers: { "content-type": "application/json; charset=utf-8" } });
}

function input(tokenFile) {
  return { centralOrigin: "https://formation.example",
    tokenFile, contractId: CONTRACT, routeProposalRefHash: ROUTE,
    occurrenceRefHash: OCCURRENCE, recordedAt: NOW };
}

test("reads the current head then appends exactly one hash-only production occurrence",
  async (t) => {
    const calls = [];
    const fetchImpl = async (url, init) => {
      calls.push({ url, init });
      assert.equal(init.headers.authorization, `Bearer ${"a".repeat(64)}`);
      if (init.method === "GET") {
        return response({ ok: true, rawEventsProjected: false,
          registry: { head: { headEventHash: HEAD } } });
      }
      const body = JSON.parse(init.body);
      assert.deepEqual(Object.keys(body).sort(), [
        "expectedRegistryHeadHash", "idempotencyKeyHash", "occurrenceRefHash",
        "recordedAt", "routeProposalRefHash", "schema",
      ]);
      assert.equal(body.expectedRegistryHeadHash, HEAD);
      assert.equal(body.routeProposalRefHash, ROUTE);
      assert.equal(body.occurrenceRefHash, OCCURRENCE);
      return response({ ok: true, result: {
        receipt: { routeProposalRefHash: ROUTE,
          occurrenceRefHash: OCCURRENCE,
          idempotencyKeyHash: body.idempotencyKeyHash },
        eventAppended: true, idempotentReplay: false,
        head: { headEventHash: h("new-head"), proposalOccurrenceCount: 5,
          distinctRouteProposalCount: 5 }, rawEventsProjected: false,
        routeSelected: false, executableCapabilityEstablished: false,
        capacityEstablished: false, authority: "NONE",
        outcomeTruthEstablished: false, outcomeCommitIssued: false,
      } }, 201);
    };
    const result = await appendProductionRouteProposalOccurrenceV1(
      input(privateToken(t)), { fetchImpl });
    assert.equal(calls.length, 2);
    assert.deepEqual(calls.map(({ init }) => init.method), ["GET", "POST"]);
    assert.equal(result.appendHttpStatus, 201);
    assert.equal(result.registryHead.proposalOccurrenceCount, 5);
    assert.equal(result.capacityEstablished, false);
    assert.equal(result.outcomeCommitIssued, false);
    const projected = JSON.stringify(result);
    assert.equal(projected.includes("a".repeat(64)), false);
    assert.equal(projected.includes("email"), false);
  });

test("rejects a non-private token and invalid input before network I/O",
  async (t) => {
    let calls = 0;
    const fetchImpl = async () => { calls += 1; };
    await assert.rejects(appendProductionRouteProposalOccurrenceV1(
      input(privateToken(t, 0o644)), { fetchImpl }), /TOKEN_FILE_NOT_PRIVATE/u);
    await assert.rejects(appendProductionRouteProposalOccurrenceV1({
      ...input(privateToken(t)), email: "private@example.invalid",
    }, { fetchImpl }), /INPUT_FIELDS_INVALID/u);
    assert.equal(calls, 0);
  });

test("never accepts a server response that promotes capacity or Outcome truth",
  async (t) => {
    let call = 0;
    const fetchImpl = async () => {
      call += 1;
      if (call === 1) return response({ ok: true, rawEventsProjected: false,
        registry: { head: { headEventHash: HEAD } } });
      return response({ ok: true, result: {
        receipt: { routeProposalRefHash: ROUTE,
          occurrenceRefHash: OCCURRENCE,
          idempotencyKeyHash: h("wrong") },
        eventAppended: true, idempotentReplay: false, head: {},
        rawEventsProjected: false, routeSelected: false,
        executableCapabilityEstablished: false, capacityEstablished: true,
        authority: "NONE", outcomeTruthEstablished: false,
        outcomeCommitIssued: false,
      } }, 201);
    };
    await assert.rejects(appendProductionRouteProposalOccurrenceV1(
      input(privateToken(t)), { fetchImpl }), /REGISTRY_APPEND_REJECTED/u);
  });
