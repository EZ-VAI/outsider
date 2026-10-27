import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  OUTSIDER_OUTCOME_PRODUCT_FOUNDATION_COMPOSITION_V1_BOUNDARY,
  createFoundationIntegratedOutcomeProductRuntimeV2,
  createOutcomeProductFoundationCompilerV1,
  orderCandidateRoutesWithShadowModelV1,
} from "../src/outsider-outcome-product-foundation-composition-v1.js";
import { verifyOutcomeProgramV1 }
  from "../src/outsider-outcome-program-v1.js";
import { verifyOutsiderOutcomeTenderV1 }
  from "../src/outsider-outcome-tender-v1.js";

const NOW = "2026-09-04T14:00:00.000Z";
const DONE = "2026-09-05T14:00:00.000Z";

function h(label) {
  return `sha256:${createHash("sha256").update(label).digest("hex")}`;
}

function request(requestId = "order_foundation") {
  return {
    requestId,
    goal: "Deliver one exact physical item before the deadline.",
    budget: { currency: "USD", maximumAmountMinor: "2500" },
    completionDeadline: DONE,
    context: { destinationRefHash: h("destination") },
    requestedAt: NOW,
  };
}

function modelDraft() {
  const discovery = (queryTerms) => ({
    queryTerms,
    routeKinds: ["USER_HELD_ACCOUNT", "OFFICIAL_API",
      "MARKETPLACE_BUYER_ENTRY", "PROVIDER_OWNED_PUBLIC_ENTRY"],
    maximumCandidates: 8,
  });
  return {
    schema: "outsider/private-outcome-formation-model-draft/v1",
    outcomeKindCode: "REQUESTED_PHYSICAL_STATE_ESTABLISHED",
    conditions: [{
      metricCode: "DELIVERY_STATE",
      comparator: "EQUAL",
      target: { valueKind: "STATE_CODE", booleanValue: null,
        integerValue: null, stateCode: "DELIVERED", unitCode: null },
      observationWindowMs: 0,
    }],
    acceptance: [{
      criterionId: "exact_item_delivered",
      comparator: "EQUAL",
      subject: "independently observed delivered item state",
      expected: { stateCode: "DELIVERED" },
    }],
    routes: {
      primary: {
        capability: "PURCHASE_AND_DELIVER_MATCHING_ITEM",
        classCode: "BUYER_NATIVE_FULFILLMENT_RESOURCE",
        quantity: 1,
        unitCode: "FULFILLMENT_ROUTE",
        constraints: { exactItemMatchRequired: true },
        discovery: discovery(["exact matching item direct checkout"]),
        observationMode: null,
        maximumAttempts: null,
      },
      recovery: {
        capability: "ALTERNATE_PURCHASE_AND_DELIVERY_ROUTE",
        classCode: "ALTERNATE_BUYER_NATIVE_FULFILLMENT_RESOURCE",
        quantity: 1,
        unitCode: "FULFILLMENT_ROUTE",
        constraints: { distinctFailureDomainRequired: true },
        discovery: discovery(["alternate exact item direct checkout"]),
        observationMode: null,
        maximumAttempts: 1,
      },
      independentWitness: {
        capability: "INDEPENDENT_DELIVERY_AND_ITEM_OBSERVATION",
        classCode: "INDEPENDENT_OUTCOME_WITNESS",
        quantity: 1,
        unitCode: "WITNESS_ROUTE",
        constraints: { providerNativeDoneInsufficient: true },
        discovery: discovery(["independent delivery outcome observation"]),
        observationMode: "AT_COMPLETION",
        maximumAttempts: null,
      },
    },
  };
}

function foundationBindings() {
  return {
    workOrderHash: h("work-order"),
    typedGraph: {
      principalEpoch: {
        principalRefHash: h("principal"),
        epochRefHash: h("principal-epoch"),
        principalEpochProjectionHash: h("principal-epoch-projection"),
      },
      accountableDeployment: {
        deploymentLineageRefHash: h("deployment-lineage"),
        deploymentRevisionHash: h("deployment-revision"),
        accountableDeploymentSubjectHash: h("deployment-subject"),
      },
      runtime: {
        runtimeInstanceRefHash: h("runtime-ref"),
        runtimeInstanceHash: h("runtime"),
      },
      embodiment: {
        present: false,
        deviceLineageRefHash: null,
        embodimentRevisionHash: null,
      },
      delegation: {
        delegationEvidenceRefHash: h("delegation-evidence"),
        delegationEdgeHash: h("delegation-edge"),
      },
      episode: {
        episodeHash: h("episode"),
        networkCompleteEpisodeJoinHash: h("complete-episode"),
      },
      attempt: {
        attemptHash: h("attempt"),
        attemptActorSubjectHash: h("attempt-actor"),
      },
    },
    authorizationBinding: {
      actorIdentityEnvelopeHash: h("actor-envelope"),
      delegationEvidenceRefHash: h("delegation-evidence"),
      delegationEdgeHash: h("delegation-edge"),
      authorityScopeRefHash: h("authority-scope"),
      resourceOwnerAuthorizationRefHash: h("owner-authorization"),
      rightsPrivacyPolicyRefHash: h("rights-privacy-policy"),
    },
    subjectRefHash: h("subject"),
    regionRefHash: h("region"),
    consequenceEnvelopeRefHash: h("consequence-envelope"),
    affectedChannelRefHashes: [h("affected-channel")],
    maximumConsequence: {
      consequenceClassCode: "BOUNDED_PURCHASE_FAILURE",
      measureCode: "MAXIMUM_DELAY",
      maximumValue: 1,
      unitCode: "DAY",
    },
  };
}

function compiler(overrides = {}) {
  return createOutcomeProductFoundationCompilerV1({
    formationWindowMs: 10 * 60 * 1_000,
    async modelInference(input) {
      assert.equal(input.authority, "NONE");
      assert.equal(input.actionPermitted, false);
      return overrides.draft ?? modelDraft();
    },
    async resolveFoundationBindings() {
      return foundationBindings();
    },
  });
}

function privateDirectory(t) {
  const directory = mkdtempSync(path.join(tmpdir(),
    "outsider-foundation-composition-"));
  chmodSync(directory, 0o700);
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}

test("natural goal compiles through existing tender/program foundations into a provider-neutral routing request",
  async () => {
    const compilation = await compiler().compile(request());
    assert.equal(Object.isFrozen(compilation), true);
    assert.equal(Object.isFrozen(compilation.frozenOutcome), true);
    assert.equal(compilation.program.orderId, "order_foundation");
    assert.equal(compilation.program.tenderHash, compilation.tender.tenderHash);
    assert.equal(compilation.program.outcome.statement, request().goal);
    assert.equal(compilation.frozenOutcome.outcomeHash,
      compilation.formationRequirements.outcomeHash);
    assert.equal(verifyOutcomeProgramV1(compilation.program).programHash,
      compilation.program.programHash);
    assert.equal(verifyOutsiderOutcomeTenderV1(compilation.tender, {
      expectedTenderHash: compilation.tender.tenderHash,
    }).ok, true);
    assert.deepEqual(compilation.formationRequirements.slots
      .map(({ routeRole }) => routeRole),
    ["PRIMARY", "RECOVERY", "INDEPENDENT_WITNESS"]);
    assert.deepEqual(compilation.candidateRoutingRequest.jobs
      .map(({ tenderRequirementKind }) => tenderRequirementKind),
    ["RESOURCE", "RECOVERY", "EVIDENCE"]);
    assert.equal(compilation.candidateRoutingRequest.providerRegistryRequired,
      false);
    assert.equal(compilation.candidateRoutingRequest.sellerReplyRequired, false);
    assert.equal(compilation.inferenceAuthority, "NONE");
    assert.equal(compilation.capacityEstablished, false);
    assert.equal(compilation.actionReady, false);
    assert.equal(JSON.stringify(compilation).includes("Adafruit"), false);
    assert.equal(JSON.stringify(compilation).includes("SparkFun"), false);
  });

test("typed-graph resolution follows the model draft and receives the exact frozen outcome",
  async () => {
    const calls = [];
    let resolverInput;
    const instance = createOutcomeProductFoundationCompilerV1({
      formationWindowMs: 10 * 60 * 1_000,
      async modelInference() {
        calls.push("MODEL");
        return modelDraft();
      },
      async resolveFoundationBindings(input) {
        calls.push("FOUNDATION");
        resolverInput = input;
        assert.equal(Object.isFrozen(input), true);
        assert.equal(Object.isFrozen(input.frozenOutcome), true);
        assert.equal(input.frozenOutcome.statement, input.goal);
        assert.match(input.frozenOutcome.outcomeHash,
          /^sha256:[a-f0-9]{64}$/u);
        return foundationBindings();
      },
    });
    const compilation = await instance.compile(request("order_two_stage"));
    assert.deepEqual(calls, ["MODEL", "FOUNDATION"]);
    assert.equal(resolverInput.frozenOutcome.outcomeHash,
      compilation.frozenOutcome.outcomeHash);
    assert.equal(resolverInput.formationDeadline,
      compilation.program.formationDeadline);
  });

test("model output cannot smuggle provider endpoints, authority, or payment into compilation",
  async () => {
    const authority = modelDraft();
    authority.routes.primary.constraints.authorityEstablished = true;
    await assert.rejects(compiler({ draft: authority }).compile(request()),
      /MODEL_DRAFT_FORBIDDEN_CONTROL_FIELD/u);

    const endpoint = modelDraft();
    endpoint.routes.primary.discovery.queryTerms = [
      "https://specific-provider.example/checkout",
    ];
    await assert.rejects(compiler({ draft: endpoint }).compile(request()),
      /MODEL_DRAFT_URL_OR_CONTACT_FORBIDDEN/u);
  });

test("small Runtime v2 factory persists the frozen foundation and injects it directly into production preparation",
  async (t) => {
    const directory = privateDirectory(t);
    let inferenceCalls = 0;
    let seamCalls = 0;
    const runtime = createFoundationIntegratedOutcomeProductRuntimeV2({
      directory,
      formationWindowMs: 10 * 60 * 1_000,
      clock: () => NOW,
      restoreCoordinator: null,
      async modelInference() {
        inferenceCalls += 1;
        return modelDraft();
      },
      async resolveFoundationBindings() { return foundationBindings(); },
      async prepareFormation(input) {
        seamCalls += 1;
        assert.equal(input.foundationCompilation.program.programHash,
          input.program.programHash);
        assert.equal(input.foundationCompilation.tender.tenderHash,
          input.program.tenderHash);
        assert.equal(input.foundationCompilation.candidateRoutingRequest.jobs
          .length, 3);
        throw new Error("PRODUCTION_FORMATION_SEAM_REACHED");
      },
    });
    const productInput = { ...request("order_runtime"), requestedAt: undefined };
    delete productInput.requestedAt;
    await assert.rejects(runtime.requestOutcome(productInput, {
      formationAuthorization: {
        formationOperationsAuthorized: true,
        commitWithoutSeparatePaymentAuthorization: false,
      },
    }), /PRODUCTION_FORMATION_SEAM_REACHED/u);
    assert.equal(inferenceCalls, 1);
    assert.equal(seamCalls, 1);
    const persisted = runtime.inspectFoundation("order_runtime");
    assert.equal(persisted.program.orderId, "order_runtime");
    assert.equal(persisted.program.tenderHash, persisted.tender.tenderHash);
    const files = readdirSync(path.join(directory, "formation-foundation-v1"));
    assert.equal(files.length, 1);
    const file = path.join(directory, "formation-foundation-v1", files[0]);
    assert.equal(statSync(file).mode & 0o077, 0);
    assert.equal(readFileSync(file, "utf8").includes("apiToken"), false);
  });

test("retrospective/logistic model can only shadow-order probes and invalid output keeps baseline",
  async () => {
    const compilation = await compiler().compile(request("order_shadow"));
    const candidates = [
      { candidateRefHash: h("candidate-a"), routeRole: "PRIMARY",
        features: [0, 1] },
      { candidateRefHash: h("candidate-b"), routeRole: "PRIMARY",
        features: [1, 0] },
    ];
    const shadow = await orderCandidateRoutesWithShadowModelV1({
      candidateRoutingRequest: compilation.candidateRoutingRequest,
      candidates,
    }, {
      async rankCandidates(input) {
        assert.equal(input.authority, "NONE");
        return { orderedCandidateRefHashes: [h("candidate-b"),
          h("candidate-a")] };
      },
    });
    assert.equal(shadow.decision,
      "USE_SHADOW_ORDER_FOR_DISCOVERY_PROBES_ONLY");
    assert.equal(shadow.candidatesAdmitted, 0);
    assert.equal(shadow.authority, "NONE");
    assert.equal(shadow.capacityEstablished, false);
    assert.equal(shadow.actionAuthorized, false);

    const baseline = await orderCandidateRoutesWithShadowModelV1({
      candidateRoutingRequest: compilation.candidateRoutingRequest,
      candidates,
    }, { async rankCandidates() {
      return { orderedCandidateRefHashes: [h("unknown")] };
    } });
    assert.equal(baseline.decision, "KEEP_BASELINE");
    assert.deepEqual(baseline.orderedCandidateRefHashes,
      candidates.map(({ candidateRefHash }) => candidateRefHash));
    assert.equal(
      OUTSIDER_OUTCOME_PRODUCT_FOUNDATION_COMPOSITION_V1_BOUNDARY
        .retrospectiveAndLogisticModelsPermittedUse,
      "OPTIONAL_SHADOW_DISCOVERY_PROBE_ORDER_ONLY");
  });
