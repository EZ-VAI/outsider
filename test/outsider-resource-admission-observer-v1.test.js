import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { prepareOutcomeOsV1 }
  from "../src/outsider-three-layer-outcome-product-contract-v1.js";
import { createOutcomeOsLifecycleRuntimeV1 }
  from "../src/outsider-outcome-os-lifecycle-v1.js";
import {
  observeResourceAdmissionV1,
  verifyResourceAdmissionObservationV1,
} from "../src/outsider-resource-admission-observer-v1.js";

const h = (label) => `sha256:${createHash("sha256")
  .update(label, "utf8").digest("hex")}`;

function lifecycle() {
  const outcomeOs = prepareOutcomeOsV1({
    requestIdHash: h("request"),
    outcomeProgramHash: null,
    outcomeDefinitionHash: h("outcome"),
    acceptancePredicateHash: h("acceptance"),
    formationDeadline: "2099-01-01T00:30:00.000Z",
    completionDeadline: "2099-01-01T01:00:00.000Z",
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
  });
  const runtime = createOutcomeOsLifecycleRuntimeV1({ events: [] });
  const created = runtime.create({
    contractId: `contract_${h("contract").slice(7, 39)}`,
    outcomeOs,
    expectedOutcomeOsArtifactHash: outcomeOs.artifactHash,
    recordedAt: "2099-01-01T00:00:00.000Z",
    idempotencyKeyHash: h("create"),
  });
  runtime.append({
    eventType: "CONTRACT_OPENED",
    recordedAt: "2099-01-01T00:01:00.000Z",
    idempotencyKeyHash: h("open"),
    expectedHeadHash: created.head.headHash,
    payload: { openInstructionRefHash: h("open-instruction") },
  });
  return runtime.exportEvents();
}

function observation(overrides = {}) {
  return {
    recordedAt: "2099-01-01T00:05:00.000Z",
    validUntil: "2099-01-01T00:15:00.000Z",
    retryAt: null,
    occurrenceRefHash: h("occurrence"),
    resourceNodeRefHash: h("resource-node"),
    routeOptionRefHash: h("route-option"),
    policyRefHash: h("policy"),
    sourceReceiptRefHash: h("source-receipt"),
    sourceVerificationRefHash: h("source-verification"),
    sourceVerificationStatus: "VERIFIED",
    disposition: "ADMITTED",
    capacityPressureBand: "LOW",
    queuePosition: null,
    concurrencyLimit: 4,
    ...overrides,
  };
}

test("verified positive admission is useful evidence but never capacity or authority",
  () => {
    const result = observeResourceAdmissionV1({
      outcomeLifecycleEvents: lifecycle(),
      evaluatedAt: "2099-01-01T00:06:00.000Z",
      observation: observation(),
    });
    assert.equal(result.resourceRouteDecision, "ROUTE_ADMISSION_OBSERVED");
    assert.equal(result.positiveAdmissionObserved, true);
    assert.equal(result.routeLocalVeto, false);
    assert.equal(result.capacityReserved, false);
    assert.equal(result.authorityMinted, false);
    assert.equal(result.outcomeTruthEstablished, false);
    assert.equal(result.outcomeCommitIssued, false);
    assert.equal(result.decisionState, "HOLD");
    assert.equal(verifyResourceAdmissionObservationV1(result), true);
  });

test("verified resource rejection is a route-local veto only", () => {
  const result = observeResourceAdmissionV1({
    outcomeLifecycleEvents: lifecycle(),
    evaluatedAt: "2099-01-01T00:06:00.000Z",
    observation: observation({
      disposition: "REJECTED",
      capacityPressureBand: "HIGH",
      retryAt: "2099-01-01T00:20:00.000Z",
    }),
  });
  assert.equal(result.resourceRouteDecision, "ROUTE_REJECTED");
  assert.equal(result.routeLocalVeto, true);
  assert.equal(result.decisionState, "UNAVAILABLE_ROUTE");
  assert.equal(result.outcomePromiseIssued, false);
});

test("queue, stale, and unverified observations remain non-promoting", () => {
  const queued = observeResourceAdmissionV1({
    outcomeLifecycleEvents: lifecycle(),
    evaluatedAt: "2099-01-01T00:06:00.000Z",
    observation: observation({ disposition: "QUEUED", queuePosition: 7 }),
  });
  assert.equal(queued.resourceRouteDecision, "ROUTE_QUEUE_OBSERVED");
  assert.equal(queued.queueObserved, true);
  assert.equal(queued.capacityReserved, false);

  const stale = observeResourceAdmissionV1({
    outcomeLifecycleEvents: lifecycle(),
    evaluatedAt: "2099-01-01T00:16:00.000Z",
    observation: observation(),
  });
  assert.equal(stale.resourceRouteDecision, "STALE_OBSERVATION_HOLD");

  const unverified = observeResourceAdmissionV1({
    outcomeLifecycleEvents: lifecycle(),
    evaluatedAt: "2099-01-01T00:06:00.000Z",
    observation: observation({
      sourceVerificationRefHash: null,
      sourceVerificationStatus: "UNVERIFIED",
    }),
  });
  assert.equal(unverified.resourceRouteDecision, "SOURCE_UNVERIFIED_HOLD");
  assert.equal(unverified.positiveAdmissionObserved, false);
});

test("time and disposition-specific fields fail closed", () => {
  const base = {
    outcomeLifecycleEvents: lifecycle(),
    evaluatedAt: "2099-01-01T00:06:00.000Z",
  };
  assert.throws(() => observeResourceAdmissionV1({
    ...base, observation: observation({ disposition: "QUEUED" }),
  }), /QUEUE_POSITION_REQUIRED/);
  assert.throws(() => observeResourceAdmissionV1({
    ...base,
    observation: observation({ disposition: "ADMITTED", queuePosition: 1 }),
  }), /QUEUE_POSITION_FORBIDDEN/);
  assert.throws(() => observeResourceAdmissionV1({
    ...base, observation: observation({ disposition: "THROTTLED" }),
  }), /RETRY_AT_REQUIRED/);
  assert.throws(() => observeResourceAdmissionV1({
    ...base,
    observation: observation({
      sourceVerificationRefHash: null,
      sourceVerificationStatus: "VERIFIED",
    }),
  }), /VERIFIED_SOURCE_REFERENCE_REQUIRED/);
});

test("provider names, URLs, PII, credentials, and payment are outside schema",
  () => {
    for (const extra of [
      { providerName: "example" },
      { endpoint: "https://example.test" },
      { email: "person@example.test" },
      { credential: "secret" },
      { paymentToken: "token" },
    ]) {
      assert.throws(() => observeResourceAdmissionV1({
        outcomeLifecycleEvents: lifecycle(),
        evaluatedAt: "2099-01-01T00:06:00.000Z",
        observation: { ...observation(), ...extra },
      }), /OBSERVATION_FIELDS_INVALID/);
    }
  });

test("artifact is deterministic and tampering is rejected", () => {
  const input = {
    outcomeLifecycleEvents: lifecycle(),
    evaluatedAt: "2099-01-01T00:06:00.000Z",
    observation: observation(),
  };
  const one = observeResourceAdmissionV1(input);
  const two = observeResourceAdmissionV1(input);
  assert.equal(one.artifactHash, two.artifactHash);
  assert.equal(verifyResourceAdmissionObservationV1(
    JSON.parse(JSON.stringify(one))), true);
  assert.throws(() => verifyResourceAdmissionObservationV1({
    ...one, resourceRouteDecision: "ROUTE_REJECTED",
  }), /ARTIFACT_HASH_INVALID/);
});
