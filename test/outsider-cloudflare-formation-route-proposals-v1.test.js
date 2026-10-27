import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import formationWorker, {
  OutcomeOsLifecycleLedger,
  OutcomeRouteProposalLedger,
} from "../deploy/cloudflare-formation-job-worker/src/worker.mjs";
import {
  OUTSIDER_AGENT_NEUTRAL_ROUTE_PROPOSAL_REGISTRY_V1_GENESIS,
} from "../src/outsider-agent-neutral-route-proposal-registry-v1.js";

const h = (label) => `sha256:${createHash("sha256")
  .update(label, "utf8").digest("hex")}`;
const outcomeToken = "outcome-os-route-proposal-test-token-000000000001";
const formationToken = "formation-route-proposal-test-token-0000000000001";
const CONTRACT_ID = `contract_${h("route-contract").slice(7, 39)}`;

class FakeLifecycleSqliteStorage {
  constructor(database = { events: [] }) {
    this.database = database;
    this.sql = { exec: (statement, ...bindings) =>
      this.#exec(statement, bindings) };
  }

  transactionSync(callback) { return callback(); }

  #cursor(rows = [], rowsWritten = 0) {
    return { rowsWritten, toArray: () => structuredClone(rows) };
  }

  #exec(statement, bindings) {
    const sql = statement.replace(/\s+/gu, " ").trim();
    if (sql.startsWith("CREATE TABLE IF NOT EXISTS")) return this.#cursor();
    if (sql.startsWith("SELECT revision, contract_id, event_hash")) {
      return this.#cursor(this.database.events
        .toSorted((left, right) => left.revision - right.revision));
    }
    if (sql.startsWith("INSERT INTO outsider_outcome_os_lifecycle_events_v1")) {
      if (this.database.events.some((row) => row.revision === bindings[0]
        || row.event_hash === bindings[2]
        || row.idempotency_key_hash === bindings[3])) {
        throw new Error("UNIQUE constraint failed");
      }
      this.database.events.push({
        revision: bindings[0], contract_id: bindings[1],
        event_hash: bindings[2], idempotency_key_hash: bindings[3],
        operation_hash: bindings[4], event_json: bindings[5],
      });
      return this.#cursor([], 1);
    }
    if (sql.startsWith("SELECT event_hash, event_json")) {
      const row = this.database.events.find((item) =>
        item.revision === bindings[0]);
      return this.#cursor(row ? [{ event_hash: row.event_hash,
        event_json: row.event_json }] : []);
    }
    throw new Error(`unhandled lifecycle SQL: ${sql}`);
  }
}

class FakeProposalSqliteStorage {
  constructor(database = { events: [] }) {
    this.database = database;
    this.sql = { exec: (statement, ...bindings) =>
      this.#exec(statement, bindings) };
  }

  transactionSync(callback) { return callback(); }

  #cursor(rows = [], rowsWritten = 0) {
    return { rowsWritten, toArray: () => structuredClone(rows) };
  }

  #exec(statement, bindings) {
    const sql = statement.replace(/\s+/gu, " ").trim();
    if (sql.startsWith("CREATE TABLE IF NOT EXISTS")) return this.#cursor();
    if (sql.startsWith("SELECT revision, contract_id, event_hash")) {
      return this.#cursor(this.database.events
        .toSorted((left, right) => left.revision - right.revision));
    }
    if (sql.startsWith("INSERT INTO outsider_route_proposal_events_v1")) {
      if (this.database.events.some((row) => row.revision === bindings[0]
        || row.event_hash === bindings[2]
        || row.idempotency_key_hash === bindings[3]
        || row.occurrence_ref_hash === bindings[5])) {
        throw new Error("UNIQUE constraint failed");
      }
      this.database.events.push({
        revision: bindings[0], contract_id: bindings[1],
        event_hash: bindings[2], idempotency_key_hash: bindings[3],
        operation_hash: bindings[4], occurrence_ref_hash: bindings[5],
        event_json: bindings[6],
      });
      return this.#cursor([], 1);
    }
    if (sql.startsWith("SELECT event_hash, event_json")) {
      const row = this.database.events.find((item) =>
        item.revision === bindings[0]);
      return this.#cursor(row ? [{ event_hash: row.event_hash,
        event_json: row.event_json }] : []);
    }
    throw new Error(`unhandled proposal SQL: ${sql}`);
  }
}

function createSystem(databases = {
  lifecycle: { events: [] }, proposals: { events: [] },
}) {
  const internalLifecycleReads = [];
  const lifecycleLedger = new OutcomeOsLifecycleLedger({
    storage: new FakeLifecycleSqliteStorage(databases.lifecycle),
  });
  const lifecycleNamespace = {
    idFromName: (name) => name,
    get: () => ({ fetch: (request) => {
      if (request.method === "GET"
        && new URL(request.url).pathname.endsWith("/events")) {
        internalLifecycleReads.push(new URL(request.url).pathname);
      }
      return lifecycleLedger.fetch(request);
    } }),
  };
  let proposalLedger = new OutcomeRouteProposalLedger({
    storage: new FakeProposalSqliteStorage(databases.proposals),
  }, { OUTCOME_OS_LIFECYCLES: lifecycleNamespace });
  const proposalNamespace = {
    idFromName: (name) => name,
    get: () => ({ fetch: (request) => proposalLedger.fetch(request) }),
  };
  return {
    databases,
    internalLifecycleReads,
    env: {
      OUTCOME_OS_API_BEARER_TOKEN: outcomeToken,
      FORMATION_DISPATCH_BEARER_TOKEN: formationToken,
      OUTCOME_OS_LIFECYCLES: lifecycleNamespace,
      OUTCOME_ROUTE_PROPOSALS: proposalNamespace,
    },
    restartProposalLedger() {
      proposalLedger = new OutcomeRouteProposalLedger({
        storage: new FakeProposalSqliteStorage(databases.proposals),
      }, { OUTCOME_OS_LIFECYCLES: lifecycleNamespace });
    },
  };
}

async function request(system, path, body, authorization = "OUTCOME") {
  const headers = {};
  if (body !== undefined) headers["content-type"] = "application/json";
  if (authorization === "OUTCOME") {
    headers.authorization = `Bearer ${outcomeToken}`;
  } else if (authorization === "FORMATION") {
    headers.authorization = `Bearer ${formationToken}`;
  }
  const response = await formationWorker.fetch(new Request(
    `https://formation.example${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    }), system.env);
  return { response, value: await response.json() };
}

function outcomeRequest() {
  return {
    schema: "outsider/outcome-os-prepare-request/v1",
    requestIdHash: h("request"),
    outcomeProgramHash: null,
    outcomeDefinitionHash: h("outcome"),
    acceptancePredicateHash: h("acceptance"),
    formationDeadline: "2099-01-02T00:00:00.000Z",
    completionDeadline: "2099-01-03T00:00:00.000Z",
    maximumLossConstraintHash: h("loss"),
    typedGraphRefs: {
      principalEpochRefHash: h("principal"),
      accountableDeploymentRefHash: h("deployment"),
      runtimeRefHash: h("runtime"),
      embodimentRefHash: null,
      delegationRefHash: h("delegation"),
      episodeRefHash: h("episode"),
      attemptRefHash: h("attempt"),
    },
  };
}

async function openOutcome(system) {
  const outcomeOs = (await request(system, "/v1/outcomes/prepare",
    outcomeRequest())).value.artifact;
  const created = await request(system, "/v1/outcome-os-lifecycles", {
    schema: "outsider/outcome-os-lifecycle-create-request/v1",
    contractId: CONTRACT_ID,
    outcomeOs,
    expectedOutcomeOsArtifactHash: outcomeOs.artifactHash,
    recordedAt: "2099-01-01T00:00:00.000Z",
    idempotencyKeyHash: h("create"),
  });
  const opened = await request(system,
    `/v1/outcome-os-lifecycles/${CONTRACT_ID}/events`, {
      schema: "outsider/outcome-os-lifecycle-append-request/v1",
      eventType: "CONTRACT_OPENED",
      recordedAt: "2099-01-01T00:01:00.000Z",
      idempotencyKeyHash: h("open"),
      expectedHeadHash: created.value.result.head.headHash,
      payload: { openInstructionRefHash: h("open-instruction") },
    });
  assert.equal(opened.response.status, 201);
}

function proposal(label, expectedRegistryHeadHash, overrides = {}) {
  return {
    schema: "outsider/agent-neutral-route-proposal-append-request/v1",
    recordedAt: label === "one"
      ? "2099-01-01T00:05:00.000Z" : "2099-01-01T00:06:00.000Z",
    idempotencyKeyHash: h(`${label}:idempotency`),
    expectedRegistryHeadHash,
    routeProposalRefHash: h(`${label}:route`),
    occurrenceRefHash: h(`${label}:occurrence`),
    ...overrides,
  };
}

test("proposal DO source-replays lifecycle, appends many proposals, and restarts cold",
  async () => {
    const system = createSystem();
    await openOutcome(system);
    const path = `/v1/outcomes/${CONTRACT_ID}/route-proposals`;

    const health = await request(system, "/healthz", undefined);
    assert.equal(health.value.productProfiles.outcomeOs
      .durableRouteProposalRegistryBindingAvailable, true);
    assert.equal(health.value.productProfiles.outcomeOs
      .durableRouteProposalRegistryAvailable, true);

    const empty = await request(system, path, undefined);
    assert.equal(empty.response.status, 200);
    assert.equal(empty.value.registry.head.proposalOccurrenceCount, 0);
    assert.equal(empty.value.registry.head.headEventHash,
      OUTSIDER_AGENT_NEUTRAL_ROUTE_PROPOSAL_REGISTRY_V1_GENESIS);
    assert.equal(empty.value.rawEventsProjected, false);

    const firstBody = proposal("one",
      OUTSIDER_AGENT_NEUTRAL_ROUTE_PROPOSAL_REGISTRY_V1_GENESIS);
    const first = await request(system, path, firstBody);
    assert.equal(first.response.status, 201);
    assert.equal(first.value.result.head.proposalOccurrenceCount, 1);
    assert.equal(first.value.result.routeSelected, false);
    assert.equal(first.value.result.executableCapabilityEstablished, false);
    assert.equal(first.value.result.capacityEstablished, false);
    assert.equal(first.value.result.authority, "NONE");
    assert.equal(first.value.result.outcomeTruthEstablished, false);
    assert.equal(first.value.result.outcomePromiseIssued, false);
    assert.equal(first.value.result.outcomeCommitIssued, false);
    assert.equal(first.value.result.rawEventsProjected, false);
    assert.equal(Object.hasOwn(first.value.result, "exportedEvents"), false);
    assert.equal(Object.hasOwn(first.value, "events"), false);

    const duplicate = await request(system, path, firstBody);
    assert.equal(duplicate.response.status, 200);
    assert.equal(duplicate.value.result.idempotentReplay, true);
    assert.equal(duplicate.value.result.eventAppended, false);
    assert.equal(system.databases.proposals.events.length, 1);

    const second = await request(system, path,
      proposal("two", first.value.result.head.headEventHash));
    assert.equal(second.response.status, 201);
    assert.equal(second.value.result.head.proposalOccurrenceCount, 2);
    assert.equal(second.value.result.head.distinctRouteProposalCount, 2);
    assert.equal(system.databases.proposals.events.length, 2);

    system.restartProposalLedger();
    const afterRestart = await request(system, path, undefined);
    assert.equal(afterRestart.response.status, 200);
    assert.equal(afterRestart.value.registry.head.proposalOccurrenceCount, 2);
    assert.equal(afterRestart.value.registry.head.headHash,
      second.value.result.head.headHash);
    assert.equal(afterRestart.value.rawEventsProjected, false);
    assert.equal(Object.hasOwn(afterRestart.value.registry,
      "exportedEvents"), false);
    assert.ok(system.internalLifecycleReads.length >= 5);
    assert.ok(system.internalLifecycleReads.every((value) =>
      value === `/internal/v1/outcome-os-lifecycles/${CONTRACT_ID}/events`));
  });

test("proposal route uses Outcome auth, exact hash-only fields, and occurrence CAS",
  async () => {
    const system = createSystem();
    await openOutcome(system);
    const path = `/v1/outcomes/${CONTRACT_ID}/route-proposals`;
    const firstBody = proposal("one",
      OUTSIDER_AGENT_NEUTRAL_ROUTE_PROPOSAL_REGISTRY_V1_GENESIS);

    const wrongCredential = await request(system, path, firstBody,
      "FORMATION");
    assert.equal(wrongCredential.response.status, 401);
    assert.equal(system.databases.proposals.events.length, 0);

    const first = await request(system, path, firstBody);
    assert.equal(first.response.status, 201);
    const count = system.databases.proposals.events.length;
    for (const extra of [
      { agentBrand: "Codex" },
      { agentIdentity: "agent-1" },
      { providerUrl: "https://provider.example/order" },
      { email: "private@example.invalid" },
      { credential: "secret" },
      { paymentToken: "payment" },
    ]) {
      const rejected = await request(system, path, {
        ...proposal("two", first.value.result.head.headEventHash), ...extra,
      });
      assert.equal(rejected.response.status, 400);
      assert.equal(rejected.value.error, "API_REQUEST_FIELDS_INVALID");
      assert.equal(system.databases.proposals.events.length, count);
    }

    const duplicateOccurrence = await request(system, path,
      proposal("two", first.value.result.head.headEventHash, {
        occurrenceRefHash: firstBody.occurrenceRefHash,
      }));
    assert.equal(duplicateOccurrence.response.status, 409);
    assert.equal(duplicateOccurrence.value.error, "OCCURRENCE_REF_DUPLICATE");
    assert.equal(system.databases.proposals.events.length, count);
    assert.equal(JSON.stringify(system.databases.proposals)
      .includes("private@example.invalid"), false);
  });
