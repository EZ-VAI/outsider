import assert from "node:assert/strict";
import {
  createHash,
  generateKeyPairSync,
  sign,
} from "node:crypto";
import test from "node:test";

import { canonicalizeStrict } from "../src/canonical.js";
import { compileOutsiderOutcomeTenderV1 }
  from "../src/outsider-outcome-tender-v1.js";
import {
  OUTSIDER_EXTERNAL_CAPACITY_EVENT_GENESIS_V1,
  OUTSIDER_ONE_USE_TENDER_RESPONSE_LIFECYCLE_V1_BOUNDARY,
  OUTSIDER_ONE_USE_TENDER_RESPONSE_OCCURRENCE_GENESIS_V1,
  createExternalCapacityVerifierContextV1,
  createInitialOneUseTenderResponseV1,
  createOneUseTenderResponseDescendantV1,
  createOneUseTenderResponseOccurrenceV1,
  externalCapacitySourceSigningMessageV1,
  verifyExternalCapacityReceiptLifecycleV1,
  verifyExternalCapacityVerifierContextV1,
  verifyOneUseTenderResponseLifecycleV1,
} from "../src/outsider-one-use-tender-response-lifecycle-v1.js";

function h(label) {
  return `sha256:${createHash("sha256").update(label, "utf8").digest("hex")}`;
}

function alias(prefix, label) {
  return `${prefix}_${h(label).slice(7, 39)}`;
}

function mutable(value) {
  return JSON.parse(JSON.stringify(value));
}

function tenderInput(overrides = {}) {
  const evidenceId = alias("evidence", "independent-capacity-test");
  const base = {
    tenderId: alias("tender", "capacity-test"),
    compiledAt: "2026-09-02T12:00:00.000Z",
    lineage: {
      revision: 0,
      predecessorTenderHash: null,
      supersedesTenderHash: null,
    },
    workOrderHash: h("work-order"),
    typedGraph: {
      principalEpoch: {
        principalRefHash: h("principal"),
        epochRefHash: h("epoch"),
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
        networkCompleteEpisodeJoinHash: h("episode-join"),
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
      rightsPrivacyPolicyRefHash: h("rights-policy"),
    },
    exactOutcome: {
      outcomeKindCode: "BOUNDED_RESOURCE_READY",
      outcomeSpecRefHash: h("outcome-spec"),
      subjectRefHash: h("subject"),
      acceptanceCriteriaRefHash: h("acceptance"),
      conditions: [{
        conditionId: alias("condition", "ready"),
        metricCode: "RESOURCE_READY_STATE",
        comparator: "EQUAL",
        target: {
          valueKind: "STATE_CODE",
          booleanValue: null,
          integerValue: null,
          stateCode: "READY",
          unitCode: null,
        },
        observationWindowMs: 0,
        conditionRefHash: h("condition-ref"),
        mandatory: true,
      }],
      deadline: "2026-09-02T16:00:00.000Z",
    },
    formationDeadline: "2026-09-02T12:30:00.000Z",
    resourceRequirements: [{
      resourceRequirementId: alias("resource", "primary"),
      resourceClassCode: "GENERIC_BOUNDED_RESOURCE",
      capabilityRefHash: h("capability"),
      quantity: 2,
      unitCode: "RESOURCE_UNIT",
      regionRefHash: h("region"),
      requiredBy: "2026-09-02T15:00:00.000Z",
      mandatory: true,
    }],
    evidenceRequirements: [{
      evidenceRequirementId: evidenceId,
      evidenceClassCode: "INDEPENDENT_RESOURCE_OBSERVATION",
      evidenceRequirementRefHash: h("evidence-ref"),
      sourceControl: "INDEPENDENT_OF_PROVIDER",
      observationMode: "AT_COMPLETION",
      dueBy: "2026-09-02T16:00:00.000Z",
      mandatory: true,
    }],
    recoveryRequirements: [{
      recoveryRequirementId: alias("recovery", "alternate"),
      triggerRefHash: h("trigger"),
      recoveryOutcomeRefHash: h("recovery-outcome"),
      resourceClassCode: "ALTERNATE_BOUNDED_RESOURCE",
      maximumAttempts: 1,
      completionDeadline: "2026-09-02T16:00:00.000Z",
      recoveryEvidenceRequirementId: evidenceId,
      routePolicy: "ALTERNATE_RESOURCE_REQUIRED",
      mandatory: true,
    }],
    maximumConsequence: {
      consequenceEnvelopeRefHash: h("consequence"),
      consequenceClassCode: "BOUNDED_DELAY",
      measureCode: "MAXIMUM_DELAY_MINUTES",
      maximumValue: 60,
      unitCode: "MINUTE",
      affectedChannelRefHashes: [h("channel")],
      irreversibleHarmAllowed: false,
      unboundedConsequenceAllowed: false,
    },
    zeroInternalOps: {
      outsiderStaffInterventionsAllowed: 0,
      internalManualSourcingAllowed: false,
      internalManualCoordinationAllowed: false,
      internalManualVerificationAllowed: false,
      internalManualRecoveryAllowed: false,
      humanQueueFallbackAllowed: false,
      failureDisposition: "DECLINE_NOT_HUMAN_QUEUE",
    },
  };
  return { ...base, ...overrides };
}

function responseInput(tender, overrides = {}) {
  const requirement = tender.resourceRequirements.items[0];
  return {
    tender,
    expectedTenderHash: tender.tenderHash,
    providerRefHash: h("provider"),
    requirementKind: "RESOURCE",
    requirementId: requirement.resourceRequirementId,
    discoveryRouteObjectHash: h("discovery-route-object"),
    discoveryCandidateHash: h("discovery-candidate"),
    quantity: requirement.quantity,
    unitCode: requirement.unitCode,
    serviceFrom: "2026-09-02T13:00:00.000Z",
    serviceUntil: "2026-09-02T14:00:00.000Z",
    responseState: "OFFERED",
    stateAt: "2026-09-02T12:05:00.000Z",
    expiresAt: "2026-09-02T14:30:00.000Z",
    reasonCode: "ONE_USE_OFFER_CREATED",
    responseNonceHash: h("response-nonce"),
    sourceResponseRefHash: h("source-response-ref"),
    ...overrides,
  };
}

function responseLifecycle(overrides = {}) {
  const tender = overrides.tender ?? compileOutsiderOutcomeTenderV1(tenderInput());
  const initial = overrides.initial
    ?? createInitialOneUseTenderResponseV1(responseInput(tender,
      overrides.responseInput));
  const responses = [initial];
  if (overrides.descendant) responses.push(overrides.descendant);
  const occurrences = [];
  let previous = OUTSIDER_ONE_USE_TENDER_RESPONSE_OCCURRENCE_GENESIS_V1;
  for (let index = 0; index < responses.length; index += 1) {
    const occurrence = createOneUseTenderResponseOccurrenceV1({
      response: responses[index],
      ordinal: index + 1,
      previousOccurrenceHash: previous,
      recordedAt: index === 0
        ? "2026-09-02T12:05:01.000Z" : responses[index].stateAt,
      occurrenceNonceHash: h(`occurrence-${index + 1}`),
    });
    occurrences.push(occurrence);
    previous = occurrence.occurrenceHash;
  }
  return { tender, initial, responses, occurrences, headHash: previous };
}

function responseVerifyInput(lifecycle, overrides = {}) {
  return {
    tender: lifecycle.tender,
    expectedTenderHash: lifecycle.tender.tenderHash,
    responses: lifecycle.responses,
    occurrences: lifecycle.occurrences,
    expectedOccurrenceCount: lifecycle.occurrences.length,
    expectedLifecycleHeadHash: lifecycle.headHash,
    observedAt: "2026-09-02T13:30:00.000Z",
    ...overrides,
  };
}

function keyFixture() {
  const pair = generateKeyPairSync("ed25519");
  const publicKeyPem = pair.publicKey.export({ type: "spki", format: "pem" });
  const publicKeyDer = pair.publicKey.export({ type: "spki", format: "der" });
  return {
    privateKey: pair.privateKey,
    publicKeyPem,
    keyId: `sha256:${createHash("sha256").update(publicKeyDer).digest("hex")}`,
  };
}

function contextFixture(keys, overrides = {}) {
  return createExternalCapacityVerifierContextV1({
    verifierId: "example.capacity.adapter",
    verifierRevisionHash: h("verifier-revision"),
    adapterArtifactHash: h("adapter-artifact"),
    sourceSystemId: "example.capacity.source",
    semanticsSchema: "example/capacity-semantics/v3",
    standingSchema: "example/resource-owner-standing/v5",
    receiptSchema: "example/capacity-receipt/v7",
    lifecycleEventSchema: "example/capacity-lifecycle-event/v4",
    lifecycleHeadSchema: "example/capacity-lifecycle-head/v4",
    sourcePublicKeyPem: keys.publicKeyPem,
    expectedSourceKeyId: keys.keyId,
    sourceTrustPolicyRefHash: h("trust-policy-ref"),
    rightsPrivacyPolicyRefHash: h("rights-policy-ref"),
    validFrom: "2026-09-02T00:00:00.000Z",
    validUntil: "2026-09-03T00:00:00.000Z",
    issuedAt: "2026-09-01T23:00:00.000Z",
    maximumLifecycleHeadAgeMs: 600_000,
    ...overrides,
  });
}

function signedSource(kind, payload, keys) {
  const signature = sign(null,
    externalCapacitySourceSigningMessageV1(kind, payload), keys.privateKey);
  return Buffer.from(canonicalizeStrict({
    payload,
    signature: {
      algorithm: "ED25519",
      keyId: keys.keyId,
      valueBase64: signature.toString("base64"),
    },
  }), "utf8");
}

function byteHash(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function sourceBundle(lifecycle, context, keys, overrides = {}) {
  const response = verifyOneUseTenderResponseLifecycleV1(
    responseVerifyInput(lifecycle));
  assert.equal(response.ok, true);

  const semanticsPayload = {
    schema: context.semanticsSchema,
    sourceSystemId: context.sourceSystemId,
    verifierId: context.verifierId,
    verifierRevisionHash: context.verifierRevisionHash,
    adapterArtifactHash: context.adapterArtifactHash,
    receiptSchema: context.receiptSchema,
    lifecycleEventSchema: context.lifecycleEventSchema,
    lifecycleHeadSchema: context.lifecycleHeadSchema,
    reservedStatusSemanticCode:
      "RESERVED_MEANS_CAPACITY_HELD_FOR_EXACT_TENDER_SCOPE",
    semanticsEvidenceRefHash: h("semantics-evidence"),
    validFrom: "2026-09-02T00:00:00.000Z",
    validUntil: "2026-09-03T00:00:00.000Z",
    issuedAt: "2026-09-02T00:00:00.000Z",
    ...overrides.semanticsPayload,
  };
  const semanticsBytes = signedSource("SEMANTICS", semanticsPayload, keys);

  const standingPayload = {
    schema: context.standingSchema,
    sourceSystemId: context.sourceSystemId,
    providerRefHash: response.providerRefHash,
    resourceOwnerRefHash: h("resource-owner"),
    discoveryRouteObjectHash: response.discoveryRouteObjectHash,
    discoveryCandidateHash: response.discoveryCandidateHash,
    scopeHash: response.scopeHash,
    requirementKind: response.requirementKind,
    requirementId: response.requirementId,
    requirementSetHash: response.requirementSetHash,
    requirementObjectHash: response.requirementObjectHash,
    requirementClassCode: response.requirementClassCode,
    requirementScopeRefHash: response.requirementScopeRefHash,
    quantity: response.quantity,
    unitCode: response.unitCode,
    regionRefHash: response.regionRefHash,
    quantitySemantics: response.quantitySemantics,
    validFrom: "2026-09-02T12:30:00.000Z",
    validUntil: "2026-09-02T14:30:00.000Z",
    issuedAt: "2026-09-02T12:00:00.000Z",
    standingState: "SOURCE_DECLARED_ACTIVE",
    standingEvidenceRefHash: h("standing-evidence"),
    ...overrides.standingPayload,
  };
  const standingBytes = signedSource("STANDING", standingPayload, keys);

  const receiptPayload = {
    schema: context.receiptSchema,
    sourceSystemId: context.sourceSystemId,
    sourceReceiptId: "reservation-0001",
    lifecycleStreamId: "reservation-stream-0001",
    semanticsSourceHash: byteHash(semanticsBytes),
    standingSourceHash: byteHash(standingBytes),
    oneUseResponseHash: response.initialResponseHash,
    tenderHash: response.tenderHash,
    typedGraphHash: response.typedGraphHash,
    episodeHash: response.episodeHash,
    networkCompleteEpisodeJoinHash: response.networkCompleteEpisodeJoinHash,
    attemptHash: response.attemptHash,
    providerRefHash: response.providerRefHash,
    discoveryRouteObjectHash: response.discoveryRouteObjectHash,
    discoveryCandidateHash: response.discoveryCandidateHash,
    scopeHash: response.scopeHash,
    requirementKind: response.requirementKind,
    requirementId: response.requirementId,
    requirementSetHash: response.requirementSetHash,
    requirementObjectHash: response.requirementObjectHash,
    requirementClassCode: response.requirementClassCode,
    requirementScopeRefHash: response.requirementScopeRefHash,
    quantity: response.quantity,
    unitCode: response.unitCode,
    regionRefHash: response.regionRefHash,
    quantitySemantics: response.quantitySemantics,
    reservedFrom: "2026-09-02T13:00:00.000Z",
    reservedUntil: "2026-09-02T14:00:00.000Z",
    issuedAt: "2026-09-02T12:10:00.000Z",
    status: "RESERVED",
    ...overrides.receiptPayload,
  };
  const receiptBytes = signedSource("RECEIPT", receiptPayload, keys);
  const receiptSourceHash = byteHash(receiptBytes);

  const states = overrides.eventStates ?? ["RESERVED"];
  const eventBytes = [];
  let previous = OUTSIDER_EXTERNAL_CAPACITY_EVENT_GENESIS_V1;
  for (let index = 0; index < states.length; index += 1) {
    const eventPayload = {
      schema: context.lifecycleEventSchema,
      sourceSystemId: context.sourceSystemId,
      lifecycleStreamId: receiptPayload.lifecycleStreamId,
      receiptSourceHash,
      oneUseResponseHash: response.initialResponseHash,
      tenderHash: response.tenderHash,
      providerRefHash: response.providerRefHash,
      scopeHash: response.scopeHash,
      ordinal: index + 1,
      previousEventSourceHash: previous,
      eventState: states[index],
      occurredAt: index === 0
        ? "2026-09-02T12:11:00.000Z" : "2026-09-02T13:20:00.000Z",
      occurrenceIdentityHash: h(`external-occurrence-${index + 1}`),
    };
    const bytes = signedSource("LIFECYCLE_EVENT", eventPayload, keys);
    eventBytes.push(bytes);
    previous = byteHash(bytes);
  }
  const headPayload = {
    schema: context.lifecycleHeadSchema,
    sourceSystemId: context.sourceSystemId,
    lifecycleStreamId: receiptPayload.lifecycleStreamId,
    receiptSourceHash,
    oneUseResponseHash: response.initialResponseHash,
    tenderHash: response.tenderHash,
    providerRefHash: response.providerRefHash,
    scopeHash: response.scopeHash,
    eventCount: eventBytes.length,
    coveredFromOrdinal: 1,
    coveredToOrdinal: eventBytes.length,
    headEventSourceHash: previous,
    currentState: states[states.length - 1],
    observedAt: "2026-09-02T13:25:00.000Z",
    occurrencePolicy:
      "EVERY_SOURCE_EVENT_COUNTED_OBJECT_DEDUP_NEVER_REDUCES_DENOMINATOR",
    ...overrides.headPayload,
  };
  const headBytes = signedSource("LIFECYCLE_HEAD", headPayload, keys);
  return {
    semanticsBytes,
    standingBytes,
    receiptBytes,
    eventBytes,
    headBytes,
  };
}

function capacityInput(lifecycle, context, sources, overrides = {}) {
  return {
    tender: lifecycle.tender,
    expectedTenderHash: lifecycle.tender.tenderHash,
    responses: lifecycle.responses,
    responseOccurrences: lifecycle.occurrences,
    expectedResponseOccurrenceCount: lifecycle.occurrences.length,
    expectedResponseLifecycleHeadHash: lifecycle.headHash,
    verifierContext: context,
    expectedVerifierContextHash: context.verifierContextHash,
    semanticsSourceBytes: sources.semanticsBytes,
    expectedSemanticsSourceHash: byteHash(sources.semanticsBytes),
    standingSourceBytes: sources.standingBytes,
    expectedStandingSourceHash: byteHash(sources.standingBytes),
    receiptSourceBytes: sources.receiptBytes,
    expectedReceiptSourceHash: byteHash(sources.receiptBytes),
    lifecycleEventSourceBytes: sources.eventBytes,
    lifecycleHeadSourceBytes: sources.headBytes,
    expectedLifecycleHeadSourceHash: byteHash(sources.headBytes),
    observedAt: "2026-09-02T13:30:00.000Z",
    ...overrides,
  };
}

test("an exact OFFERED response binds tender, typed graph, Episode, Attempt, and scope",
  () => {
    const lifecycle = responseLifecycle();
    const checked = verifyOneUseTenderResponseLifecycleV1(
      responseVerifyInput(lifecycle));

    assert.equal(checked.ok, true);
    assert.equal(checked.currentResponseState, "OFFERED");
    assert.equal(checked.currentCallerDeclaredOneUseOfferReference, true);
    assert.equal(checked.tenderHash, lifecycle.tender.tenderHash);
    assert.equal(checked.typedGraphHash,
      lifecycle.tender.typedGraph.typedGraphHash);
    assert.equal(checked.episodeHash,
      lifecycle.tender.typedGraph.episode.episodeHash);
    assert.equal(checked.attemptHash,
      lifecycle.tender.typedGraph.attempt.attemptHash);
    assert.equal(checked.discoveryRouteObjectHash,
      lifecycle.initial.discoveryRouteObjectHash);
    assert.equal(checked.discoveryCandidateHash,
      lifecycle.initial.discoveryCandidateHash);
    assert.equal(checked.responseOccurrenceDenominatorReplayed, true);
    assert.equal(checked.responseNonceUniqueWithinSuppliedLifecycle, true);
    assert.equal(checked.nonceGlobalFreshnessEstablished, false);
    assert.equal(checked.nonceConsumptionPersisted, false);
    assert.equal(checked.responseOccurrenceDenominatorExternallyAnchored, false);
    assert.equal(checked.capacityReserved, false);
    assert.equal(checked.authority, "NONE");
    assert.equal(checked.actionReady, false);
    assert.equal(checked.executable, false);
    assert.ok(Object.isFrozen(checked));
  });

test("RESOURCE, EVIDENCE, and RECOVERY remain distinct exact tender slots", () => {
  const tender = compileOutsiderOutcomeTenderV1(tenderInput());
  const selections = [
    {
      kind: "RESOURCE",
      id: tender.resourceRequirements.items[0].resourceRequirementId,
      quantity: 2,
      unitCode: "RESOURCE_UNIT",
      quantitySemantics: "EXACT_TENDER_RESOURCE_QUANTITY_AND_UNIT",
    },
    {
      kind: "EVIDENCE",
      id: tender.evidenceRequirements.items[0].evidenceRequirementId,
      quantity: 1,
      unitCode: "REQUIREMENT",
      quantitySemantics: "ONE_EXACT_EVIDENCE_REQUIREMENT_SLOT",
    },
    {
      kind: "RECOVERY",
      id: tender.recoveryRequirements.items[0].recoveryRequirementId,
      quantity: 1,
      unitCode: "REQUIREMENT",
      quantitySemantics: "ONE_EXACT_RECOVERY_REQUIREMENT_SLOT",
    },
  ];
  const scopeHashes = new Set();
  const bindingHashes = new Set();
  for (const selection of selections) {
    const initial = createInitialOneUseTenderResponseV1(responseInput(tender, {
      requirementKind: selection.kind,
      requirementId: selection.id,
      quantity: selection.quantity,
      unitCode: selection.unitCode,
      responseNonceHash: h(`response-${selection.kind}`),
    }));
    const lifecycle = responseLifecycle({ tender, initial });
    const checked = verifyOneUseTenderResponseLifecycleV1(
      responseVerifyInput(lifecycle));
    assert.equal(checked.ok, true);
    assert.equal(checked.requirementKind, selection.kind);
    assert.equal(checked.requirementId, selection.id);
    assert.equal(checked.quantity, selection.quantity);
    assert.equal(checked.unitCode, selection.unitCode);
    assert.equal(checked.quantitySemantics, selection.quantitySemantics);
    if (selection.kind !== "RESOURCE") assert.equal(checked.regionRefHash, null);
    scopeHashes.add(checked.scopeHash);
    bindingHashes.add(checked.requirementObjectHash);
  }
  assert.equal(scopeHashes.size, 3);
  assert.equal(bindingHashes.size, 3);
});

test("DECLINED is a terminal initial response and never becomes capacity", () => {
  const tender = compileOutsiderOutcomeTenderV1(tenderInput());
  const declined = createInitialOneUseTenderResponseV1(responseInput(tender, {
    responseState: "DECLINED",
    reasonCode: "NO_CAPACITY",
  }));
  const lifecycle = responseLifecycle({ tender, initial: declined });
  const checked = verifyOneUseTenderResponseLifecycleV1(
    responseVerifyInput(lifecycle));

  assert.equal(checked.ok, true);
  assert.equal(checked.currentResponseState, "DECLINED");
  assert.equal(checked.currentCallerDeclaredOneUseOfferReference, false);
  assert.equal(checked.capacityReserved, false);
  assert.throws(() => createOneUseTenderResponseDescendantV1({
    tender,
    expectedTenderHash: tender.tenderHash,
    predecessorResponse: declined,
    responseState: "REVOKED",
    stateAt: "2026-09-02T12:10:00.000Z",
    reasonCode: "CAPACITY_WITHDRAWN",
    responseNonceHash: h("declined-descendant"),
    sourceResponseRefHash: h("declined-descendant-ref"),
  }), /ONLY_OFFERED/u);
});

test("EXPIRED and REVOKED are append-only descendants with exact supersession", () => {
  for (const [state, stateAt, reason] of [
    ["EXPIRED", "2026-09-02T14:30:00.000Z", "OFFER_WINDOW_EXPIRED"],
    ["REVOKED", "2026-09-02T13:20:00.000Z", "CAPACITY_WITHDRAWN"],
  ]) {
    const base = responseLifecycle();
    const descendant = createOneUseTenderResponseDescendantV1({
      tender: base.tender,
      expectedTenderHash: base.tender.tenderHash,
      predecessorResponse: base.initial,
      responseState: state,
      stateAt,
      reasonCode: reason,
      responseNonceHash: h(`descendant-${state}`),
      sourceResponseRefHash: h(`descendant-source-${state}`),
    });
    const lifecycle = responseLifecycle({
      tender: base.tender,
      initial: base.initial,
      descendant,
    });
    const checked = verifyOneUseTenderResponseLifecycleV1(responseVerifyInput(
      lifecycle, { observedAt: stateAt }));
    assert.equal(checked.ok, true);
    assert.equal(checked.currentResponseState, state);
    assert.equal(checked.currentCallerDeclaredOneUseOfferReference, false);
    assert.equal(descendant.revision, 1);
    assert.equal(descendant.predecessorResponseHash, base.initial.responseHash);
    assert.equal(descendant.supersedesResponseHash, base.initial.responseHash);
  }
});

test("expired offers without an append-only EXPIRED descendant fail closed", () => {
  const lifecycle = responseLifecycle();
  const checked = verifyOneUseTenderResponseLifecycleV1(responseVerifyInput(
    lifecycle, { observedAt: "2026-09-02T14:31:00.000Z" }));
  assert.equal(checked.ok, false);
  assert.match(checked.error, /EXPIRED_OFFER_MISSING_APPEND_ONLY_DESCENDANT/u);
  assert.equal(checked.capacityReserved, false);
});

test("tender, typed-graph, Episode, lineage, and occurrence splices fail source rebuild",
  () => {
    const lifecycle = responseLifecycle();
    for (const mutate of [
      (response) => { response.tenderHash = h("spliced-tender"); },
      (response) => { response.typedGraphHash = h("spliced-graph"); },
      (response) => { response.episodeHash = h("spliced-episode"); },
      (response) => { response.predecessorResponseHash = h("spliced-parent"); },
    ]) {
      const response = mutable(lifecycle.initial);
      mutate(response);
      const checked = verifyOneUseTenderResponseLifecycleV1(responseVerifyInput(
        lifecycle, { responses: [response] }));
      assert.equal(checked.ok, false);
      assert.equal(checked.capacityReserved, false);
    }

    const occurrence = mutable(lifecycle.occurrences[0]);
    occurrence.previousOccurrenceHash = h("spliced-occurrence-parent");
    const checked = verifyOneUseTenderResponseLifecycleV1(responseVerifyInput(
      lifecycle, { occurrences: [occurrence] }));
    assert.equal(checked.ok, false);
  });

test("replayed occurrence nonce and a missing occurrence denominator fail closed", () => {
  const base = responseLifecycle();
  const revoked = createOneUseTenderResponseDescendantV1({
    tender: base.tender,
    expectedTenderHash: base.tender.tenderHash,
    predecessorResponse: base.initial,
    responseState: "REVOKED",
    stateAt: "2026-09-02T13:20:00.000Z",
    reasonCode: "CAPACITY_WITHDRAWN",
    responseNonceHash: h("revoked-nonce"),
    sourceResponseRefHash: h("revoked-ref"),
  });
  const lifecycle = responseLifecycle({ tender: base.tender,
    initial: base.initial, descendant: revoked });
  const replayed = createOneUseTenderResponseOccurrenceV1({
    response: lifecycle.responses[1],
    ordinal: 2,
    previousOccurrenceHash: lifecycle.occurrences[0].occurrenceHash,
    recordedAt: revoked.stateAt,
    occurrenceNonceHash: lifecycle.occurrences[0].occurrenceNonceHash,
  });
  let checked = verifyOneUseTenderResponseLifecycleV1(responseVerifyInput(
    lifecycle, { occurrences: [lifecycle.occurrences[0], replayed],
      expectedLifecycleHeadHash: replayed.occurrenceHash }));
  assert.equal(checked.ok, false);
  assert.match(checked.error, /OCCURRENCE_REPLAY_DETECTED/u);

  checked = verifyOneUseTenderResponseLifecycleV1(responseVerifyInput(
    base, { expectedOccurrenceCount: 2 }));
  assert.equal(checked.ok, false);
  assert.match(checked.error, /DENOMINATOR_MISMATCH/u);
});

test("repeated observations of one response count as distinct occurrences", () => {
  const lifecycle = responseLifecycle();
  const first = lifecycle.occurrences[0];
  const second = createOneUseTenderResponseOccurrenceV1({
    response: lifecycle.initial,
    ordinal: 2,
    previousOccurrenceHash: first.occurrenceHash,
    recordedAt: "2026-09-02T12:06:00.000Z",
    occurrenceNonceHash: h("same-object-second-occurrence"),
  });
  const checked = verifyOneUseTenderResponseLifecycleV1(responseVerifyInput(
    lifecycle, {
      occurrences: [first, second],
      expectedOccurrenceCount: 2,
      expectedLifecycleHeadHash: second.occurrenceHash,
    }));
  assert.equal(checked.ok, true);
  assert.equal(checked.responseOccurrenceCount, 2);
  assert.equal(checked.initialResponseHash, checked.currentResponseHash);
  assert.equal(checked.objectDedupReducedOccurrenceDenominator, false);
});

test("a descendant occurrence cannot omit its initial response occurrence", () => {
  const base = responseLifecycle();
  const descendant = createOneUseTenderResponseDescendantV1({
    tender: base.tender,
    expectedTenderHash: base.tender.tenderHash,
    predecessorResponse: base.initial,
    responseState: "REVOKED",
    stateAt: "2026-09-02T13:20:00.000Z",
    reasonCode: "CAPACITY_WITHDRAWN",
    responseNonceHash: h("omitted-initial-descendant"),
    sourceResponseRefHash: h("omitted-initial-descendant-ref"),
  });
  const occurrence = createOneUseTenderResponseOccurrenceV1({
    response: descendant,
    ordinal: 1,
    previousOccurrenceHash:
      OUTSIDER_ONE_USE_TENDER_RESPONSE_OCCURRENCE_GENESIS_V1,
    recordedAt: descendant.stateAt,
    occurrenceNonceHash: h("descendant-only-occurrence"),
  });
  const checked = verifyOneUseTenderResponseLifecycleV1({
    tender: base.tender,
    expectedTenderHash: base.tender.tenderHash,
    responses: [base.initial, descendant],
    occurrences: [occurrence],
    expectedOccurrenceCount: 1,
    expectedLifecycleHeadHash: occurrence.occurrenceHash,
    observedAt: descendant.stateAt,
  });
  assert.equal(checked.ok, false);
  assert.match(checked.error, /RESPONSE_OBJECT_MISSING_FROM_OCCURRENCE_CENSUS/u);
  assert.equal(checked.capacityReserved, false);
});

test("pinned source bundle replays every layer but generated trust cannot mint capacity",
  () => {
    const lifecycle = responseLifecycle();
    const keys = keyFixture();
    const context = contextFixture(keys);
    const contextCheck = verifyExternalCapacityVerifierContextV1(context, {
      expectedVerifierContextHash: context.verifierContextHash,
    });
    assert.equal(contextCheck.ok, true);
    const sources = sourceBundle(lifecycle, context, keys);
    const checked = verifyExternalCapacityReceiptLifecycleV1(
      capacityInput(lifecycle, context, sources));

    assert.equal(checked.ok, true);
    assert.equal(checked.rightsPrivacyPolicySourceReplayed, false);
    assert.equal(checked.rightsEstablished, false);
    assert.equal(checked.privacyEstablished, false);
    assert.equal(checked.sourceSemanticsSignatureVerified, true);
    assert.equal(checked.ownerStandingClaimSigned, true);
    assert.equal(checked.ownerStandingClaimCoversScopeAndInterval, true);
    assert.equal(checked.receiptSignatureVerifiedForPinnedSource, true);
    assert.equal(checked.receiptScopeQuantityTimeAndProviderCovered, true);
    assert.equal(checked.externalOccurrenceDenominatorReplayed, true);
    assert.equal(checked.nonRevocationAtPinnedHeadEstablished, true);
    assert.equal(checked.sourceBundleCryptographicallyConsistent, true);
    assert.equal(checked.sourceDeclaredReservationCurrent, true);
    assert.equal(checked.independentResourceOwnerTrustAnchorReplayed, false);
    assert.equal(checked.trustAnchorUnestablished, true);
    assert.equal(checked.externalCapacityEstablished, false);
    assert.equal(checked.capacityReserved, false);
    assert.equal(checked.providerLegalIdentityEstablished, false);
    assert.equal(checked.authorityEstablished, false);
    assert.equal(checked.actionReady, false);
    assert.equal(checked.executable, false);
    assert.equal(checked.boundary,
      OUTSIDER_ONE_USE_TENDER_RESPONSE_LIFECYCLE_V1_BOUNDARY);
  });

test("external source replay preserves EVIDENCE and RECOVERY slot semantics", () => {
  const tender = compileOutsiderOutcomeTenderV1(tenderInput());
  const selections = [
    ["EVIDENCE", tender.evidenceRequirements.items[0].evidenceRequirementId,
      "ONE_EXACT_EVIDENCE_REQUIREMENT_SLOT"],
    ["RECOVERY", tender.recoveryRequirements.items[0].recoveryRequirementId,
      "ONE_EXACT_RECOVERY_REQUIREMENT_SLOT"],
  ];
  for (const [kind, id, quantitySemantics] of selections) {
    const initial = createInitialOneUseTenderResponseV1(responseInput(tender, {
      requirementKind: kind,
      requirementId: id,
      quantity: 1,
      unitCode: "REQUIREMENT",
      responseNonceHash: h(`source-response-${kind}`),
    }));
    const lifecycle = responseLifecycle({ tender, initial });
    const keys = keyFixture();
    const context = contextFixture(keys);
    const sources = sourceBundle(lifecycle, context, keys);
    const checked = verifyExternalCapacityReceiptLifecycleV1(
      capacityInput(lifecycle, context, sources));
    assert.equal(checked.ok, true);
    assert.equal(checked.sourceDeclaredReservationCurrent, true);
    assert.equal(checked.externalCapacityEstablished, false);
    assert.equal(checked.capacityReserved, false);
    const response = verifyOneUseTenderResponseLifecycleV1(
      responseVerifyInput(lifecycle));
    assert.equal(response.requirementKind, kind);
    assert.equal(response.quantitySemantics, quantitySemantics);
    assert.equal(response.regionRefHash, null);
  }
});

test("partial quantity, scope, interval, provider, and graph receipt splices fail",
  () => {
    const lifecycle = responseLifecycle();
    const keys = keyFixture();
    const context = contextFixture(keys);
    for (const receiptPayload of [
      { quantity: 1 },
      { scopeHash: h("other-scope") },
      { reservedFrom: "2026-09-02T13:01:00.000Z" },
      { reservedUntil: "2026-09-02T13:59:59.000Z" },
      { providerRefHash: h("other-provider") },
      { discoveryRouteObjectHash: h("other-route-object") },
      { discoveryCandidateHash: h("other-candidate") },
      { typedGraphHash: h("other-graph") },
      { episodeHash: h("other-episode") },
    ]) {
      const sources = sourceBundle(lifecycle, context, keys, { receiptPayload });
      const checked = verifyExternalCapacityReceiptLifecycleV1(
        capacityInput(lifecycle, context, sources));
      assert.equal(checked.ok, false);
      assert.equal(checked.capacityReserved, false);
    }
  });

test("re-signing or rehashing a changed source cannot bypass caller source pins", () => {
  const lifecycle = responseLifecycle();
  const keys = keyFixture();
  const context = contextFixture(keys);
  const original = sourceBundle(lifecycle, context, keys);
  const changed = sourceBundle(lifecycle, context, keys, {
    receiptPayload: { sourceReceiptId: "reservation-forged" },
  });
  const checked = verifyExternalCapacityReceiptLifecycleV1(capacityInput(
    lifecycle, context, changed, {
      expectedReceiptSourceHash: byteHash(original.receiptBytes),
    }));
  assert.equal(checked.ok, false);
  assert.match(checked.error, /RECEIPT_SOURCE_PIN_MISMATCH/u);
  assert.equal(checked.capacityReserved, false);
});

test("a signed REVOKED external head preserves replay but removes current declaration",
  () => {
    const lifecycle = responseLifecycle();
    const keys = keyFixture();
    const context = contextFixture(keys);
    const sources = sourceBundle(lifecycle, context, keys,
      { eventStates: ["RESERVED", "REVOKED"] });
    const checked = verifyExternalCapacityReceiptLifecycleV1(
      capacityInput(lifecycle, context, sources));

    assert.equal(checked.ok, true);
    assert.equal(checked.externalLifecycleState, "REVOKED");
    assert.equal(checked.externalOccurrenceDenominatorReplayed, true);
    assert.equal(checked.nonRevocationAtPinnedHeadEstablished, false);
    assert.equal(checked.sourceDeclaredReservationCurrent, false);
    assert.equal(checked.capacityReserved, false);
  });

test("missing or forged external occurrence denominator cannot establish even a source declaration",
  () => {
    const lifecycle = responseLifecycle();
    const keys = keyFixture();
    const context = contextFixture(keys);
    const sources = sourceBundle(lifecycle, context, keys, {
      headPayload: { eventCount: 2, coveredToOrdinal: 2 },
    });
    let checked = verifyExternalCapacityReceiptLifecycleV1(
      capacityInput(lifecycle, context, sources));
    assert.equal(checked.ok, false);
    assert.match(checked.error, /HEAD_DENOMINATOR_OR_BINDING_MISMATCH/u);

    const input = capacityInput(lifecycle, context,
      sourceBundle(lifecycle, context, keys));
    delete input.lifecycleHeadSourceBytes;
    checked = verifyExternalCapacityReceiptLifecycleV1(input);
    assert.equal(checked.ok, false);
    assert.equal(checked.sourceDeclaredReservationCurrent, false);
  });

test("future reservation windows are not current even when every source document is valid",
  () => {
    const lifecycle = responseLifecycle();
    const keys = keyFixture();
    const context = contextFixture(keys);
    const sources = sourceBundle(lifecycle, context, keys);
    const checked = verifyExternalCapacityReceiptLifecycleV1(capacityInput(
      lifecycle, context, sources, {
        observedAt: "2026-09-02T12:20:00.000Z",
      }));
    assert.equal(checked.ok, false,
      "head from the future must fail before reservation currency is considered");

    const earlySources = sourceBundle(lifecycle, context, keys, {
      headPayload: { observedAt: "2026-09-02T12:15:00.000Z" },
    });
    const early = verifyExternalCapacityReceiptLifecycleV1(capacityInput(
      lifecycle, context, earlySources, {
        observedAt: "2026-09-02T12:20:00.000Z",
      }));
    assert.equal(early.ok, true);
    assert.equal(early.reservationWindowCurrent, false);
    assert.equal(early.ownerStandingClaimCurrentAtObservedAt, false);
    assert.equal(early.sourceDeclaredReservationCurrent, false);
    assert.equal(early.capacityReserved, false);
  });

test("a cryptographically valid but stale lifecycle head cannot claim current state",
  () => {
    const lifecycle = responseLifecycle();
    const keys = keyFixture();
    const context = contextFixture(keys, { maximumLifecycleHeadAgeMs: 60_000 });
    const sources = sourceBundle(lifecycle, context, keys);
    const checked = verifyExternalCapacityReceiptLifecycleV1(
      capacityInput(lifecycle, context, sources));
    assert.equal(checked.ok, false);
    assert.match(checked.error, /LIFECYCLE_HEAD_TIME_INVALID/u);
    assert.equal(checked.lifecycleHeadFreshAtObservedAt, false);
    assert.equal(checked.sourceDeclaredReservationCurrent, false);
    assert.equal(checked.capacityReserved, false);
  });

test("signature references, caller booleans, extra fields, and wrong context pins fail closed",
  () => {
    const lifecycle = responseLifecycle();
    const keys = keyFixture();
    const context = contextFixture(keys);
    const sources = sourceBundle(lifecycle, context, keys);
    let checked = verifyExternalCapacityReceiptLifecycleV1({
      ...capacityInput(lifecycle, context, sources),
      claimedCapacityReserved: true,
    });
    assert.equal(checked.ok, false);
    assert.equal(checked.capacityReserved, false);

    checked = verifyExternalCapacityReceiptLifecycleV1(capacityInput(
      lifecycle, context, sources, {
        expectedVerifierContextHash: h("attacker-context-pin"),
      }));
    assert.equal(checked.ok, false);
    assert.equal(checked.capacityReserved, false);

    const envelope = JSON.parse(sources.receiptBytes.toString("utf8"));
    envelope.signature.valueBase64 = Buffer.alloc(64, 7).toString("base64");
    const forgedBytes = Buffer.from(canonicalizeStrict(envelope), "utf8");
    checked = verifyExternalCapacityReceiptLifecycleV1(capacityInput(
      lifecycle, context, { ...sources, receiptBytes: forgedBytes }));
    assert.equal(checked.ok, false);
    assert.equal(checked.capacityReserved, false);
  });

test("oversized dense and sparse source structures fail before lifecycle processing", () => {
  const lifecycle = responseLifecycle();
  const keys = keyFixture();
  const context = contextFixture(keys);
  const sources = sourceBundle(lifecycle, context, keys);
  const oversized = new Array(4_097).fill(Buffer.from("{}", "utf8"));
  let checked = verifyExternalCapacityReceiptLifecycleV1(capacityInput(
    lifecycle, context, sources, { lifecycleEventSourceBytes: oversized }));
  assert.equal(checked.ok, false);
  assert.match(checked.error, /SOURCE_ARRAY_LENGTH_BUDGET_EXCEEDED/u);
  assert.equal(checked.capacityReserved, false);

  const sparse = [];
  sparse.length = 4_097;
  checked = verifyExternalCapacityReceiptLifecycleV1(capacityInput(
    lifecycle, context, sources, { lifecycleEventSourceBytes: sparse }));
  assert.equal(checked.ok, false);
  assert.match(checked.error, /SOURCE_ARRAY_LENGTH_BUDGET_EXCEEDED/u);
  assert.equal(checked.capacityReserved, false);
});
