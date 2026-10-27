import assert from "node:assert/strict";
import test from "node:test";

import formationWorker, { OutcomeOsLifecycleLedger }
  from "../deploy/cloudflare-formation-job-worker/src/worker.mjs";

const h = (character) => `sha256:${character.repeat(64)}`;
const outcomeToken = "outcome-os-api-test-bearer-token-00000000000001";
const formationToken = "formation-api-test-bearer-token-000000000000001";

function typedGraphRefs() {
  return {
    principalEpochRefHash: h("1"),
    accountableDeploymentRefHash: h("2"),
    runtimeRefHash: h("3"),
    embodimentRefHash: null,
    delegationRefHash: h("4"),
    episodeRefHash: h("5"),
    attemptRefHash: h("6"),
  };
}

function outcomeRequest(overrides = {}) {
  return {
    schema: "outsider/outcome-os-prepare-request/v1",
    requestIdHash: h("7"),
    outcomeProgramHash: null,
    outcomeDefinitionHash: h("8"),
    acceptancePredicateHash: h("9"),
    formationDeadline: "2099-01-02T00:00:00.000Z",
    completionDeadline: "2099-01-03T00:00:00.000Z",
    maximumLossConstraintHash: h("a"),
    typedGraphRefs: typedGraphRefs(),
    ...overrides,
  };
}

function option(role, character, overrides = {}) {
  return {
    optionRefHash: h(character),
    role,
    providerRefHash: h(character === "b" ? "c" : character === "d" ? "e" : "f"),
    controllerRefHash: h(character === "b" ? "0" : character === "d" ? "1" : "2"),
    failureDomainRefHash:
      h(character === "b" ? "3" : character === "d" ? "4" : "5"),
    capabilityRefHash: h(character === "b" ? "6" : character === "d" ? "7" : "8"),
    reservationRefHash: h(character === "b" ? "9" : character === "d" ? "a" : "b"),
    reservationLifecycleHeadRefHash:
      h(character === "b" ? "c" : character === "d" ? "d" : "e"),
    serviceWindowRefHash:
      h(character === "b" ? "f" : character === "d" ? "0" : "1"),
    validFrom: "2098-12-01T00:00:00.000Z",
    validUntil: "2099-02-01T00:00:00.000Z",
    ...overrides,
  };
}

function typedRecoveryOption(role, character, domainCharacter,
  overrides = {}) {
  return {
    optionRefHash: h(character),
    role,
    recoveryMechanismKind: role === "PRIMARY"
      ? "ROUTE_SUBSTITUTION" : "COMPENSATING_ACTION",
    latestSafeExerciseAt: "2099-01-02T12:00:00.000Z",
    exerciseAuthorityRefHash: h(character),
    exerciseInstructionRefHash: h(character),
    cancellationRefHash: h(character),
    exclusiveExerciseSemantics: "SINGLE_WRITER_PRIMARY_XOR_RECOVERY",
    failureDomainRefHashes: [h(domainCharacter)],
    failureDomainEvidenceRefHash: h(character),
    ...overrides,
  };
}

function commitReferences(value = h("f")) {
  return {
    outcomeProgramVerificationRefHash: value,
    authorityAdmissionRefHash: value,
    primaryCapacityAdmissionRefHash: value,
    recoveryCapacityAdmissionRefHash: value,
    independentWitnessAdmissionRefHash: value,
    obligationAcceptanceRefHash: value,
    rightsPrivacyDecisionRefHash: value,
    maximumLossCapitalReservationRefHash: value,
    custodyPaymentAuthorityRefHash: value,
    adjudicationAuthorityRefHash: value,
    externalTrustPolicyRefHash: value,
    executionAdmissionRefHash: value,
  };
}

async function request(path, body, env = {}, authorization = "OUTCOME") {
  const headers = {};
  if (body !== undefined) headers["content-type"] = "application/json";
  if (authorization === true || authorization === "OUTCOME") {
    headers.authorization = `Bearer ${outcomeToken}`;
  } else if (authorization === "FORMATION") {
    headers.authorization = `Bearer ${formationToken}`;
  }
  const response = await formationWorker.fetch(new Request(
    `https://formation.example${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    }), {
    OUTCOME_OS_API_BEARER_TOKEN: outcomeToken,
    FORMATION_DISPATCH_BEARER_TOKEN: formationToken,
    ...env,
  });
  return { response, value: await response.json() };
}

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
        revision: bindings[0],
        contract_id: bindings[1],
        event_hash: bindings[2],
        idempotency_key_hash: bindings[3],
        operation_hash: bindings[4],
        event_json: bindings[5],
      });
      return this.#cursor([], 1);
    }
    if (sql.startsWith("SELECT event_hash, event_json")) {
      const row = this.database.events.find((item) =>
        item.revision === bindings[0]);
      return this.#cursor(row ? [{ event_hash: row.event_hash,
        event_json: row.event_json }] : []);
    }
    throw new Error(`unhandled fake SQL: ${sql}`);
  }
}

test("public manifest exposes three agent-neutral layers without claiming COMMIT",
  async () => {
    const health = await request("/healthz", undefined, {}, false);
    assert.equal(health.response.status, 200);
    assert.equal(health.value.version, "2.5.0");
    assert.equal(health.value.outcomeApiAuthConfigured, true);
    assert.equal(health.value.formationDispatchAuthConfigured, true);
    assert.equal(health.value.productProfiles.outcomeOs
      .structuralProjectionAvailable, true);
    assert.equal(health.value.productProfiles.outcomeOs
      .durableLifecycleAvailable, false);
    assert.equal(health.value.productProfiles.formationRecoveryOptions
      .externalCapacityEstablished, false);
    assert.equal(health.value.productProfiles.formationRecoveryOptions
      .promotionPermitted, false);
    assert.equal(health.value.productProfiles.outcomeCommit.issuanceAvailable,
      false);

    const { response, value } = await request(
      "/v1/outcomes/capabilities", undefined, {}, false);
    assert.equal(response.status, 200);
    assert.equal(value.apiVersion, "2.5.0");
    assert.deepEqual(value.productContract.layers, {
      outcomeOs: "OUTCOME_OS",
      formationRecoveryOptions: "FORMATION_RECOVERY_OPTIONS",
      outcomeCommit: "OUTCOME_COMMIT",
    });
    assert.equal(value.productContract.positiveCommitEmitted, false);
    assert.equal(value.outcomeOsLifecycleContract.schemas.event,
      "outsider/outcome-os-lifecycle-event/v1");
    assert.ok(value.outcomeOsLifecycleContract.eventTypes
      .includes("ATTEMPT_EVIDENCE_APPENDED"));
    assert.equal(value.outcomeOsLifecycleContract.boundary
      .outcomeCommitIssued, false);
    assert.equal(value.typedLayerTwoContract.schema,
      "outsider/recovery-option-portfolio/v2");
    assert.deepEqual(value.typedLayerTwoContract.recoveryMechanisms,
      ["ROUTE_SUBSTITUTION", "STATE_ROLLBACK", "COMPENSATING_ACTION"]);
    assert.deepEqual(value.typedLayerTwoContract.failureDomainStatuses,
      ["PROVEN_DISTINCT", "KNOWN_SHARED", "UNKNOWN"]);
    assert.equal(value.typedLayerTwoContract.semantics
      .primaryOptionRequired, true);
    assert.equal(value.typedLayerTwoContract.semantics
      .recoveryOptionRequired, true);
    assert.equal(value.typedLayerTwoContract.semantics
      .structuralReferencesEstablishExternalCapacity, false);
    assert.equal(value.typedLayerTwoContract.semantics
      .structuralPreparationPermitsLayerTwoPromotion, false);
    assert.deepEqual(value.standardBindingContract.acceptedStandardNames,
      ["UCP", "AP2", "A2A"]);
    assert.equal(value.standardBindingContract.compatibilityOnly, true);
    assert.equal(value.standardBindingContract.sourceReportOnly, true);
    assert.equal(value.standardBindingContract.boundary
      .externalStandardImplemented, false);
    assert.equal(value.standardBindingContract.boundary
      .externalStandardStateAcceptedAsOutcomeTruth, false);
    assert.equal(value.boundary.naturalLanguageAccepted, false);
    assert.equal(value.boundary.rawPersonalDataAccepted, false);
    assert.equal(value.boundary
      .callerReferencesEstablishRecoveryOptionReadiness, false);
    assert.equal(value.boundary.layerTwoPromotionPermitted, false);
    assert.equal(value.boundary
      .typedLayerTwoPreparationEstablishesExternalCapacity, false);
    assert.equal(value.boundary.standardBindingCompatibilityOnly, true);
    assert.equal(value.boundary.externalStandardReceiptAcceptedAsOutcomeTruth,
      false);
    assert.equal(value.boundary.authorityMinted, false);
    assert.equal(value.boundary.outcomePromiseIssued, false);
    assert.equal(value.boundary
      .outcomeOsApiAndFormationDispatchAuthSeparated, true);
    assert.equal(value.boundary
      .outcomeApiCredentialCanDispatchFormationJobs, false);
    assert.equal(value.routes.find((route) =>
      route.path === "/v1/outcomes/capabilities").authentication, "PUBLIC");
    assert.equal(value.routes.find((route) =>
      route.path === "/v1/commit-readiness/evaluate").authentication,
    "OUTCOME_OS_API_BEARER");
    assert.equal(value.routes.find((route) =>
      route.path === "/v1/recovery-option-portfolios/prepare")
      .authentication, "OUTCOME_OS_API_BEARER");
    assert.equal(value.routes.find((route) =>
      route.path === "/v1/standard-bindings/create").authentication,
    "OUTCOME_OS_API_BEARER");
    assert.equal(value.routes.find((route) =>
      route.path === "/v1/formation-jobs").authentication,
    "FORMATION_DISPATCH_BEARER");
    assert.equal(JSON.stringify(value).includes("SPARKFUN"), false);
    assert.equal(JSON.stringify(value).includes("CODEX"), false);
  });

test("health distinguishes Outcome auth from lifecycle binding availability",
  async () => {
    const lifecycleNamespace = {
      idFromName: (name) => name,
      get: () => ({ fetch: async () => new Response(null, { status: 500 }) }),
    };
    const { response, value } = await request("/healthz", undefined, {
      OUTCOME_OS_API_BEARER_TOKEN: "",
      OUTCOME_OS_LIFECYCLES: lifecycleNamespace,
    }, false);
    assert.equal(response.status, 200);
    assert.equal(value.outcomeApiAuthConfigured, false);
    assert.equal(value.formationDispatchAuthConfigured, true);
    assert.equal(value.productProfiles.outcomeOs
      .durableLifecycleBindingAvailable, true);
    assert.equal(value.productProfiles.outcomeOs
      .durableLifecycleAvailable, false);
  });

test("Outcome API and formation dispatch bearer credentials are not interchangeable",
  async () => {
    const outcomePaths = [
      ["/v1/outcomes/prepare", {}],
      ["/v1/outcome-os-lifecycles", {}],
      ["/v1/recovery-options/prepare", {}],
      ["/v1/recovery-option-portfolios/prepare", {}],
      ["/v1/standard-bindings/create", {}],
      ["/v1/commit-readiness/evaluate", {}],
    ];
    for (const [path, body] of outcomePaths) {
      const rejected = await request(path, body, {}, "FORMATION");
      assert.equal(rejected.response.status, 401, path);
    }

    const jobKey = h("a");
    const formationPaths = [
      ["/v1/formation-jobs", {}],
      [`/v1/formation-jobs/${jobKey}`, undefined],
      [`/v1/outcomes/${jobKey}/status`, undefined],
    ];
    for (const [path, body] of formationPaths) {
      const rejected = await request(path, body, {}, "OUTCOME");
      assert.equal(rejected.response.status, 401, path);
    }

    const outcomeAccepted = await request("/v1/outcomes/prepare",
      outcomeRequest());
    assert.equal(outcomeAccepted.response.status, 200);
    const formationAccepted = await request(`/v1/formation-jobs/${jobKey}`,
      undefined, {}, "FORMATION");
    assert.equal(formationAccepted.response.status, 500);
    assert.equal(formationAccepted.value.error, "DURABLE_BINDING_UNAVAILABLE");

    const missingOutcomeSecret = await request("/v1/outcomes/prepare",
      outcomeRequest(), { OUTCOME_OS_API_BEARER_TOKEN: "" }, "OUTCOME");
    assert.equal(missingOutcomeSecret.response.status, 401);
  });

test("Outcome OS HTTP preparation is hash-only, stateless, and route-free",
  async () => {
    const unauthorized = await request("/v1/outcomes/prepare",
      outcomeRequest(), {}, false);
    assert.equal(unauthorized.response.status, 401);

    const first = await request("/v1/outcomes/prepare", outcomeRequest());
    const replay = await request("/v1/outcomes/prepare", outcomeRequest());
    assert.equal(first.response.status, 200);
    assert.deepEqual(replay.value, first.value);
    assert.equal(first.value.layer, "OUTCOME_OS");
    assert.equal(first.value.artifact.executionRoutesRequired, false);
    assert.equal(first.value.artifact.recoveryRoutesRequired, false);
    assert.equal(first.value.artifact.witnessRoutesRequired, false);
    assert.equal(first.value.artifact.sourceProgramReplayPerformed, false);
    assert.equal(first.value.artifact.sourceVerification,
      "CALLER_SUPPLIED_HASH_REFERENCES_ONLY");
    assert.equal(first.value.externalEffect, "NONE");
    assert.equal(first.value.authorityMinted, false);
    assert.equal(first.value.outcomePromiseIssued, false);

    const rejected = await request("/v1/outcomes/prepare", {
      ...outcomeRequest(), prompt: "deliver a real-world result",
    });
    assert.equal(rejected.response.status, 400);
    assert.equal(rejected.value.error, "API_REQUEST_FIELDS_INVALID");
  });

test("Outcome OS lifecycle durably creates, appends, replays, and survives restart",
  async () => {
    const database = { events: [] };
    let ledger = new OutcomeOsLifecycleLedger({
      storage: new FakeLifecycleSqliteStorage(database),
    });
    const lookups = [];
    const lifecycleNamespace = {
      idFromName(name) { lookups.push(["id", name]); return name; },
      get(id) {
        lookups.push(["get", id]);
        return { fetch: (req) => ledger.fetch(req) };
      },
    };
    const env = { OUTCOME_OS_LIFECYCLES: lifecycleNamespace };
    const contractId = `contract_${"a".repeat(32)}`;
    const health = await request("/healthz", undefined, env, false);
    assert.equal(health.value.productProfiles.outcomeOs
      .durableLifecycleBindingAvailable, true);
    assert.equal(health.value.productProfiles.outcomeOs
      .durableLifecycleAvailable, true);
    const outcomeOs = (await request("/v1/outcomes/prepare",
      outcomeRequest())).value.artifact;
    const createBody = {
      schema: "outsider/outcome-os-lifecycle-create-request/v1",
      contractId,
      outcomeOs,
      expectedOutcomeOsArtifactHash: outcomeOs.artifactHash,
      recordedAt: "2099-01-01T00:00:00.000Z",
      idempotencyKeyHash: h("b"),
    };

    const created = await request("/v1/outcome-os-lifecycles", createBody,
      env);
    assert.equal(created.response.status, 201);
    assert.equal(created.value.result.eventAppended, true);
    assert.equal(created.value.result.idempotentReplay, false);
    assert.equal(created.value.result.head.state, "CREATED");
    assert.equal(created.value.durableStorageIoPerformed, true);
    assert.equal(created.value.authorityMinted, false);
    assert.equal(created.value.outcomePromiseIssued, false);
    assert.equal(database.events.length, 1);

    const duplicateCreate = await request("/v1/outcome-os-lifecycles",
      createBody, env);
    assert.equal(duplicateCreate.response.status, 200);
    assert.equal(duplicateCreate.value.result.eventAppended, false);
    assert.equal(duplicateCreate.value.result.idempotentReplay, true);
    assert.equal(database.events.length, 1);

    const openBody = {
      schema: "outsider/outcome-os-lifecycle-append-request/v1",
      eventType: "CONTRACT_OPENED",
      recordedAt: "2099-01-01T00:01:00.000Z",
      idempotencyKeyHash: h("c"),
      expectedHeadHash: created.value.result.head.headHash,
      payload: { openInstructionRefHash: h("d") },
    };
    const opened = await request(
      `/v1/outcome-os-lifecycles/${contractId}/events`, openBody, env);
    assert.equal(opened.response.status, 201);
    assert.equal(opened.value.result.head.state, "OPEN");
    assert.equal(opened.value.result.head.eventCount, 2);
    assert.equal(database.events.length, 2);

    const duplicateOpen = await request(
      `/v1/outcome-os-lifecycles/${contractId}/events`, openBody, env);
    assert.equal(duplicateOpen.response.status, 200);
    assert.equal(duplicateOpen.value.result.idempotentReplay, true);
    assert.equal(database.events.length, 2);

    ledger = new OutcomeOsLifecycleLedger({
      storage: new FakeLifecycleSqliteStorage(database),
    });
    const read = await request(
      `/v1/outcome-os-lifecycles/${contractId}`, undefined, env);
    assert.equal(read.response.status, 200);
    assert.equal(read.value.read.head.state, "OPEN");
    assert.equal(read.value.read.head.eventCount, 2);
    assert.equal(read.value.rawEventsProjected, false);

    const replay = await request(
      `/v1/outcome-os-lifecycles/${contractId}/replay`, undefined, env);
    assert.equal(replay.response.status, 200);
    assert.equal(replay.value.replay.eventCount, 2);
    assert.equal(replay.value.replay.fullSuppliedEventChainReplayed, true);
    assert.equal(replay.value.rawEventsProjected, false);
    assert.ok(lookups.length >= 6);
  });

test("Outcome OS lifecycle rejects stale CAS, idempotency drift, and PII fields",
  async () => {
    const database = { events: [] };
    const ledger = new OutcomeOsLifecycleLedger({
      storage: new FakeLifecycleSqliteStorage(database),
    });
    const env = { OUTCOME_OS_LIFECYCLES: {
      idFromName: (name) => name,
      get: () => ({ fetch: (req) => ledger.fetch(req) }),
    } };
    const contractId = `contract_${"b".repeat(32)}`;
    const outcomeOs = (await request("/v1/outcomes/prepare",
      outcomeRequest({ requestIdHash: h("c") }))).value.artifact;
    const create = await request("/v1/outcome-os-lifecycles", {
      schema: "outsider/outcome-os-lifecycle-create-request/v1",
      contractId,
      outcomeOs,
      expectedOutcomeOsArtifactHash: outcomeOs.artifactHash,
      recordedAt: "2099-01-01T00:00:00.000Z",
      idempotencyKeyHash: h("d"),
    }, env);
    const genesisHead = create.value.result.head.headHash;
    const open = {
      schema: "outsider/outcome-os-lifecycle-append-request/v1",
      eventType: "CONTRACT_OPENED",
      recordedAt: "2099-01-01T00:01:00.000Z",
      idempotencyKeyHash: h("e"),
      expectedHeadHash: genesisHead,
      payload: { openInstructionRefHash: h("f") },
    };
    assert.equal((await request(
      `/v1/outcome-os-lifecycles/${contractId}/events`, open, env))
      .response.status, 201);

    const idempotencyDrift = await request(
      `/v1/outcome-os-lifecycles/${contractId}/events`, {
        ...open, recordedAt: "2099-01-01T00:02:00.000Z",
      }, env);
    assert.equal(idempotencyDrift.response.status, 409);
    assert.equal(idempotencyDrift.value.error,
      "IDEMPOTENCY_KEY_OPERATION_CONFLICT");

    const stale = await request(
      `/v1/outcome-os-lifecycles/${contractId}/events`, {
        ...open,
        idempotencyKeyHash: h("0"),
        expectedHeadHash: genesisHead,
      }, env);
    assert.equal(stale.response.status, 409);
    assert.equal(stale.value.error, "EXPECTED_HEAD_HASH_MISMATCH");

    const withPii = await request(
      `/v1/outcome-os-lifecycles/${contractId}/events`, {
        ...open,
        idempotencyKeyHash: h("1"),
        expectedHeadHash: (await request(
          `/v1/outcome-os-lifecycles/${contractId}`, undefined, env))
          .value.read.head.headHash,
        payload: { openInstructionRefHash: h("f"),
          email: "private@example.invalid" },
      }, env);
    assert.equal(withPii.response.status, 400);
    assert.match(withPii.value.error, /OPEN_PAYLOAD_FIELDS_INVALID/u);
    assert.equal(database.events.length, 2);
    assert.equal(JSON.stringify(database).includes("private@example.invalid"),
      false);
  });

test("Layer 2 accepts a partial portfolio and reports absent recovery honestly",
  async () => {
    const outcome = (await request("/v1/outcomes/prepare",
      outcomeRequest())).value.artifact;
    const primaryOnly = await request("/v1/recovery-options/prepare", {
      schema: "outsider/formation-recovery-options-prepare-request/v1",
      outcomeOs: outcome,
      observedAt: "2099-01-01T00:00:00.000Z",
      recoveryTriggerPolicyRefHash: h("2"),
      routeOptions: [option("PRIMARY", "b", {
        reservationRefHash: null,
        reservationLifecycleHeadRefHash: null,
      })],
    });
    assert.equal(primaryOnly.response.status, 200);
    assert.equal(primaryOnly.value.artifact.optionCount, 1);
    assert.equal(primaryOnly.value.artifact.roleCoverage.PRIMARY, 1);
    assert.equal(primaryOnly.value.artifact.roleCoverage.RECOVERY, 0);
    assert.equal(primaryOnly.value.artifact
      .declaredRecoveryOptionReferenceCurrent, false);
    assert.equal(primaryOnly.value.artifact.externalCapacityEstablished, false);
    assert.equal(primaryOnly.value.artifact.recoveryOptionHeld, false);
    assert.equal(primaryOnly.value.artifact.layerTwoPromotionPermitted, false);
    assert.equal(primaryOnly.value.artifact.attainedServiceProfile,
      "OUTCOME_OS");
    assert.equal(primaryOnly.value.artifact.guaranteeCreated, false);
    assert.equal(primaryOnly.value.artifact.outcomePromiseIssued, false);
    assert.equal(primaryOnly.value.artifact.allReservationReferencePairsPresent,
      false);
  });

test("typed Layer 2 portfolio preparation is deterministic and never holds capacity",
  async () => {
    const outcome = (await request("/v1/outcomes/prepare",
      outcomeRequest())).value.artifact;
    const body = {
      schema: "outsider/recovery-option-portfolio-prepare-request/v2",
      outcomeOs: outcome,
      observedAt: "2099-01-01T00:00:00.000Z",
      primaryOption: typedRecoveryOption("PRIMARY", "b", "1"),
      recoveryOptions: [typedRecoveryOption("RECOVERY", "c", "2")],
    };
    const first = await request(
      "/v1/recovery-option-portfolios/prepare", body);
    const replay = await request(
      "/v1/recovery-option-portfolios/prepare", body);
    assert.equal(first.response.status, 200);
    assert.deepEqual(replay.value, first.value);
    assert.equal(first.value.apiVersion, "2.5.0");
    assert.equal(first.value.layer, "FORMATION_RECOVERY_OPTIONS");
    assert.equal(first.value.artifact.schema,
      "outsider/recovery-option-portfolio/v2");
    assert.equal(first.value.artifact.failureDomainRelationship,
      "PROVEN_DISTINCT");
    assert.equal(first.value.artifact.failureDomainPromotionEligible, true);
    assert.equal(first.value.artifact.externalCapacityEstablished, false);
    assert.equal(first.value.artifact.recoveryOptionHeld, false);
    assert.equal(first.value.artifact.recoverableActive, false);
    assert.equal(first.value.artifact.layerTwoPromotionPermitted, false);
    assert.equal(first.value.externalEffect, "NONE");
    assert.equal(first.value.externalCapacityEstablished, false);
    assert.equal(first.value.recoveryOptionHeld, false);
    assert.equal(first.value.layerTwoPromotionPermitted, false);
    assert.equal(first.value.authorityMinted, false);
    assert.equal(first.value.outcomeTruthEstablished, false);
    assert.equal(first.value.outcomeCommitIssued, false);

    const rejected = await request(
      "/v1/recovery-option-portfolios/prepare", {
        ...body, providerUrl: "https://provider.example/execute",
      });
    assert.equal(rejected.response.status, 400);
    assert.equal(rejected.value.error, "API_REQUEST_FIELDS_INVALID");
  });

test("UCP, AP2, and A2A HTTP bindings stay hash-only source reports",
  async () => {
    const outcome = (await request("/v1/outcomes/prepare",
      outcomeRequest())).value.artifact;
    const cases = [
      ["UCP", "2026-01-23", "1", "2", "LIFECYCLE_STATE_REPORT"],
      ["AP2", "v0.2", "3", "4", "SOURCE_RECEIPT_REPORT"],
      ["A2A", "1.0.0", "5", "6", "LIFECYCLE_STATE_REPORT"],
    ];
    for (const [standardName, standardVersion, revisionCharacter,
      payloadCharacter, bindingKind] of cases) {
      const body = {
        schema: "outsider/outcome-standard-binding-create-request/v1",
        standardName,
        standardVersion,
        standardRevisionHash: h(revisionCharacter),
        sourcePayloadHash: h(payloadCharacter),
        outsiderOutcomeArtifactHash: outcome.artifactHash,
        outsiderLifecycleHeadHash: h("7"),
        bindingKind,
      };
      const first = await request("/v1/standard-bindings/create", body);
      const replay = await request("/v1/standard-bindings/create", body);
      assert.equal(first.response.status, 200, standardName);
      assert.deepEqual(replay.value, first.value);
      assert.equal(first.value.apiVersion, "2.5.0");
      assert.equal(first.value.compatibilityOnly, true);
      assert.equal(first.value.sourceReportOnly, true);
      assert.equal(first.value.externalEffect, "NONE");
      assert.equal(first.value.receipt.standardName, standardName);
      assert.equal(first.value.receipt.standardRevisionPinned, true);
      assert.equal(first.value.receipt.sourceReportMeaning,
        "SOURCE_REPORT_ONLY");
      assert.equal(first.value.receipt.externalStandardImplemented, false);
      assert.equal(first.value.receipt.externalStandardStateAcceptedAsOutcomeTruth,
        false);
      assert.equal(first.value.receipt.externalStandardReceiptAcceptedAsOutcomeTruth,
        false);
      assert.equal(first.value.receipt.externalStandardMandateAcceptedAsAuthority,
        false);
      assert.equal(first.value.receipt.externalStandardCapabilityAcceptedAsCapacity,
        false);
      assert.equal(first.value.authorityMinted, false);
      assert.equal(first.value.capacityEstablished, false);
      assert.equal(first.value.outcomeTruthEstablished, false);
      assert.equal(first.value.outcomeCommitIssued, false);
    }

    const unknown = await request("/v1/standard-bindings/create", {
      schema: "outsider/outcome-standard-binding-create-request/v1",
      standardName: "UNKNOWN",
      standardVersion: "1.0.0",
      standardRevisionHash: h("1"),
      sourcePayloadHash: h("2"),
      outsiderOutcomeArtifactHash: outcome.artifactHash,
      outsiderLifecycleHeadHash: h("7"),
      bindingKind: "LIFECYCLE_STATE_REPORT",
    });
    assert.equal(unknown.response.status, 400);
    assert.equal(unknown.value.error, "STANDARD_NAME_INVALID");

    const rawPayload = await request("/v1/standard-bindings/create", {
      schema: "outsider/outcome-standard-binding-create-request/v1",
      standardName: "UCP",
      standardVersion: "2026-01-23",
      standardRevisionHash: h("1"),
      sourcePayloadHash: h("2"),
      outsiderOutcomeArtifactHash: outcome.artifactHash,
      outsiderLifecycleHeadHash: h("7"),
      bindingKind: "LIFECYCLE_STATE_REPORT",
      sourcePayload: { status: "COMPLETED" },
    });
    assert.equal(rawPayload.response.status, 400);
    assert.equal(rawPayload.value.error, "API_REQUEST_FIELDS_INVALID");
    assert.equal(JSON.stringify(rawPayload.value).includes("COMPLETED"), false);
  });

test("complete hash slots remain a non-authoritative L3 HOLD", async () => {
  const outcome = (await request("/v1/outcomes/prepare",
    outcomeRequest({ outcomeProgramHash: h("0") }))).value.artifact;
  const routes = [
    option("PRIMARY", "b"),
    option("RECOVERY", "d"),
    option("INDEPENDENT_WITNESS", "e"),
  ];
  const formation = (await request("/v1/recovery-options/prepare", {
    schema: "outsider/formation-recovery-options-prepare-request/v1",
    outcomeOs: outcome,
    observedAt: "2099-01-01T00:00:00.000Z",
    recoveryTriggerPolicyRefHash: h("2"),
    routeOptions: routes,
  })).value.artifact;
  const result = await request("/v1/commit-readiness/evaluate", {
    schema: "outsider/outcome-commit-readiness-evaluate-request/v1",
    formationRecoveryOptions: formation,
    observedAt: "2099-01-01T00:00:00.000Z",
    selectedOptions: {
      primaryOptionRefHash: h("b"),
      recoveryOptionRefHash: h("d"),
      independentWitnessOptionRefHash: h("e"),
    },
    commitReferences: commitReferences(),
  });
  assert.equal(result.response.status, 200);
  assert.equal(result.value.classification.referenceSlotsComplete, true);
  assert.equal(result.value.classification.readinessState,
    "REFERENCE_SLOTS_COMPLETE_EXTERNAL_SOURCE_REPLAY_REQUIRED_HOLD");
  assert.equal(result.value.classification.layerThreePromotionPermitted, false);
  assert.equal(result.value.classification.outcomeCommitIssued, false);
  assert.equal(result.value.classification.guaranteeCreated, false);
  assert.equal(result.value.classification.outcomePromiseIssued, false);
  assert.equal(result.value.classification.callerHashesAcceptedAsAuthority, false);
  assert.equal(result.value.authorityMinted, false);
  assert.equal(result.value.outcomePromiseIssued, false);
  assert.ok(result.value.classification.externalVerificationGapCodes.length > 0);
});

test("legacy job read remains intact and status alias never upgrades its receipt",
  async () => {
    const jobKey = h("a");
    const legacyValue = {
      ok: true,
      state: "COMPLETED",
      jobKey,
      jobHash: h("b"),
      claimedAt: "2099-01-01T00:00:00.000Z",
      receipt: { state: "COMPLETED", authorityMinted: false,
        independentOutcomeTruthEstablished: false },
    };
    const calls = [];
    const env = {
      FORMATION_JOBS: {
        idFromName(name) { calls.push(["idFromName", name]); return name; },
        get(id) {
          calls.push(["get", id]);
          return { async fetch(req) {
            calls.push(["fetch", new URL(req.url).pathname]);
            return new Response(`${JSON.stringify(legacyValue)}\n`, {
              status: 200, headers: { "content-type": "application/json" },
            });
          } };
        },
      },
    };

    const legacy = await request(`/v1/formation-jobs/${jobKey}`,
      undefined, env, "FORMATION");
    assert.equal(legacy.response.status, 200);
    assert.deepEqual(legacy.value, legacyValue);

    const status = await request(`/v1/outcomes/${jobKey}/status`,
      undefined, env, "FORMATION");
    assert.equal(status.response.status, 200);
    assert.equal(status.value.formationJob.receipt.state, "COMPLETED");
    assert.equal(status.value.outcomeCommit.state, "NOT_COMMITTED");
    assert.equal(status.value.outcomeCommit.authorityMinted, false);
    assert.equal(status.value.outcomeCommit.outcomePromiseIssued, false);
    assert.deepEqual(calls.filter(([kind]) => kind === "idFromName"), [
      ["idFromName", jobKey], ["idFromName", jobKey],
    ]);
  });
