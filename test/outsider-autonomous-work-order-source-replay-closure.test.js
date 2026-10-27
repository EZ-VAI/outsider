import assert from "node:assert/strict";
import test from "node:test";

import {
  buildOutsiderNetworkNodeContractConformance,
} from "../src/outsider-network-node-contract-conformance.js";
import {
  AUTONOMOUS_WORK_ORDER_SOURCE_REPLAY_CLOSURE_BOUNDARY,
  AUTONOMOUS_WORK_ORDER_SOURCE_REPLAY_CLOSURE_SCHEMAS,
  createAutonomousWorkOrderDelegationLaneCrosswalkSource,
  createAutonomousWorkOrderProductTermReferenceSource,
  createAutonomousWorkOrderSourceReplayClosureReceipt,
  verifyAutonomousWorkOrderDelegationLaneCrosswalkSource,
  verifyAutonomousWorkOrderProductTermReferenceSource,
  verifyAutonomousWorkOrderSourceReplayClosureReceipt,
} from "../src/outsider-autonomous-work-order-source-replay-closure.js";
import {
  createAutonomousWorkOrderSourceReplayFixture,
} from "./helpers/outsider-autonomous-work-order-source-replay-fixture.js";
import {
  stage5Hash,
} from "./helpers/outsider-network-stage5-fixture.js";

function delegationLane(base) {
  const matches = base.network.input.laneBundles.filter(
    (row) => row.preview.manifest.lane === "DELEGATION_RESPONSIBILITY",
  );
  assert.equal(matches.length, 1);
  return matches[0];
}

function actorEdge(base) {
  const graph = base.workOrder.typedGraph.delegation;
  const matches = base.foundation.actorEnvelope.delegationEdges.filter(
    (row) => row.delegationEdgeHash === graph.delegationEdgeHash
      && row.delegationEvidenceRefHash === graph.delegationEvidenceRefHash,
  );
  assert.equal(matches.length, 1);
  return matches[0];
}

function delegationSourceInput(base) {
  const edge = actorEdge(base);
  return {
    actorIdentityEnvelopeHash:
      base.foundation.actorEnvelope.actorIdentityEnvelopeHash,
    accountableDeploymentSubjectHash:
      base.foundation.actorEnvelope.actorSubjectHash,
    actorDelegationEdge: {
      parent: edge.parent,
      child: edge.child,
      delegationEvidenceRefHash: edge.delegationEvidenceRefHash,
      delegationEdgeHash: edge.delegationEdgeHash,
    },
    laneProjection: delegationLane(base).preview.payload,
  };
}

function productTermSourceInput(base) {
  return {
    orderIdentityHash: base.workOrder.episodeAlias.orderIdentityHash,
    resourceOwner: base.workOrder.resourceOwner,
    promisedOutcome: base.workOrder.promisedOutcome,
    obligors: base.workOrder.obligorSet.items.map((row) => ({
      obligorRefHash: row.obligorRefHash,
      role: row.role,
      obligationRefHash: row.obligationRefHash,
    })),
    remedies: base.workOrder.remedyMenu.items.map((row) => ({
      remedyId: row.remedyId,
      kind: row.kind,
      remedyTermsHash: row.remedyTermsHash,
      obligorRefHashes: row.obligorRefHashes,
    })),
    proofAccessPolicy: {
      roleScopedProofPolicyHash:
        base.workOrder.proofAccessPolicy.roleScopedProofPolicyHash,
      redactionPolicyHash: base.workOrder.proofAccessPolicy.redactionPolicyHash,
    },
  };
}

function closureFixture(t) {
  const base = createAutonomousWorkOrderSourceReplayFixture(t);
  const pins = {
    expectedJoinHash: base.network.join.joinHash,
    laneTrust: base.network.laneTrust,
  };
  const conformance = buildOutsiderNetworkNodeContractConformance({
    input: base.network.input,
    join: base.network.join,
  }, pins);
  const delegationCrosswalkSource
    = createAutonomousWorkOrderDelegationLaneCrosswalkSource(
      delegationSourceInput(base));
  const productTermReferenceSource
    = createAutonomousWorkOrderProductTermReferenceSource(
      productTermSourceInput(base));
  const input = {
    predecessor: {
      receipt: base.receipt,
      input: base.input,
      context: base.context,
    },
    networkNodeContract: { conformance, pins },
    delegationCrosswalkSource,
    productTermReferenceSource,
    independentPinProvenance: null,
  };
  const context = {
    expectedPredecessorReceiptHash: base.receipt.sourceReplayReceiptHash,
    expectedNetworkNodeContractConformanceHash: conformance.conformanceHash,
    expectedDelegationCrosswalkSourceHash: delegationCrosswalkSource.sourceHash,
    expectedProductTermReferenceSourceHash:
      productTermReferenceSource.sourceHash,
  };
  const receipt = createAutonomousWorkOrderSourceReplayClosureReceipt(
    input, context);
  return {
    base,
    pins,
    conformance,
    delegationCrosswalkSource,
    productTermReferenceSource,
    input,
    context,
    receipt,
  };
}

test("v2 descendant proves exact reference crosswalks but keeps every aggregate gate HOLD",
  (t) => {
    const value = closureFixture(t);
    const checked = verifyAutonomousWorkOrderSourceReplayClosureReceipt(
      value.receipt, {
        input: value.input,
        context: value.context,
        expectedClosureReceiptHash: value.receipt.closureReceiptHash,
      });

    assert.equal(value.receipt.schema,
      AUTONOMOUS_WORK_ORDER_SOURCE_REPLAY_CLOSURE_SCHEMAS.receipt);
    assert.equal(value.receipt.supersession.predecessorReceiptHash,
      value.base.receipt.sourceReplayReceiptHash);
    assert.equal(value.receipt.supersession.predecessorGloballyReplaced, false);
    assert.equal(value.receipt.supersession
      .predecessorAndFrozenArtifactsRemainUnmodified, true);
    assert.equal(value.receipt.delegationCrosswalk
      .actorDelegationEdgeToLanePayloadExactReferenceCrosswalkVerified, true);
    assert.equal(value.receipt.productTermCrosswalk
      .enumeratedProductTermReferenceCrosswalkVerified, true);
    assert.equal(value.productTermReferenceSource.referencedHashCount, 80);
    assert.deepEqual(value.receipt.productTermCrosswalk.exactReferenceClasses, [
      "OBLIGOR_DUTY",
      "PROMISED_OUTCOME",
      "PROOF_ACCESS_POLICY",
      "REMEDY_TERMS",
      "RESOURCE_OWNER",
    ]);
    assert.equal(value.receipt.sourcePins.independentPinProvenanceEvidence, null);
    assert.equal(value.receipt.sourcePins
      .independentPinProvenanceEstablished, false);
    assert.equal(value.receipt.replayCoverage
      .networkDelegationCrosswalkComplete, false);
    assert.equal(value.receipt.replayCoverage
      .productTermSourceCoverageComplete, false);
    assert.equal(value.receipt.replayCoverage.sourceReplayVerified, false);
    assert.equal(value.receipt.enabledCapabilities, 0);
    assert.equal(value.receipt.provenAuthorityCapabilities, 0);
    assert.equal(value.receipt.enabledCapabilitiesSubsetOfProvenAuthority, true);
    assert.equal(value.receipt.consequenceReachEnabled, 0);
    assert.equal(value.receipt.decisionState, "HOLD");
    assert.equal(value.receipt.authority, "NONE");
    assert.equal(value.receipt.actionReady, false);
    assert.equal(value.receipt.executable, false);
    assert.equal(value.receipt.moneyMovementEnabled, false);
    assert.equal(value.receipt.guaranteeEstablished, false);
    assert.equal(value.receipt.settlementEnabled, false);
    assert.equal(checked.ok, true);
    assert.equal(checked.referenceCrosswalksVerified, true);
    assert.equal(checked.independentPinProvenanceEstablished, false);
    assert.equal(checked.sourceReplayVerified, false);
    assert.deepEqual(checked.boundary,
      AUTONOMOUS_WORK_ORDER_SOURCE_REPLAY_CLOSURE_BOUNDARY);
  });

test("canonical crosswalk sources verify without laundering caller pins as independent",
  (t) => {
    const value = closureFixture(t);
    const delegation =
      verifyAutonomousWorkOrderDelegationLaneCrosswalkSource(
        value.delegationCrosswalkSource, {
          expectedSourceHash: value.delegationCrosswalkSource.sourceHash,
        });
    const terms = verifyAutonomousWorkOrderProductTermReferenceSource(
      value.productTermReferenceSource, {
        expectedSourceHash: value.productTermReferenceSource.sourceHash,
      });
    assert.equal(delegation.ok, true);
    assert.equal(delegation.callerCanonicalSourceDerivationVerified, true);
    assert.equal(delegation.exactReferenceCrosswalkSourceVerified, false);
    assert.equal(delegation.exactSourceBytesReplayed, false);
    assert.equal(delegation.independentSourceOriginEstablished, false);
    assert.equal(delegation.independentPinProvenanceEstablished, false);
    assert.equal(terms.ok, true);
    assert.equal(terms.callerCanonicalSourceDerivationVerified, true);
    assert.equal(terms.exactReferenceCrosswalkSourceVerified, false);
    assert.equal(terms.referencedHashCount, 80);
    assert.equal(terms.exactSourceBytesReplayed, false);
    assert.equal(terms.independentSourceOriginEstablished, false);
    assert.equal(terms.independentPinProvenanceEstablished, false);
  });

test("caller-positive independent-pin provenance is structurally forbidden", (t) => {
  const value = closureFixture(t);
  const attacked = structuredClone(value.input);
  attacked.independentPinProvenance = {
    externallyPinned: true,
    independentWitnessEstablished: true,
  };
  assert.throws(
    () => createAutonomousWorkOrderSourceReplayClosureReceipt(
      attacked, value.context),
    /CALLER_INDEPENDENT_PIN_PROVENANCE_FORBIDDEN/u,
  );
});

test("a rehashed caller source cannot swap the actor delegation edge", (t) => {
  const value = closureFixture(t);
  const sourceInput = structuredClone(delegationSourceInput(value.base));
  sourceInput.actorDelegationEdge.delegationEdgeHash
    = stage5Hash("stage1-closure:swapped-edge");
  const attackedSource
    = createAutonomousWorkOrderDelegationLaneCrosswalkSource(sourceInput);
  const attackedInput = structuredClone(value.input);
  attackedInput.delegationCrosswalkSource = attackedSource;
  const attackedContext = {
    ...value.context,
    expectedDelegationCrosswalkSourceHash: attackedSource.sourceHash,
  };
  assert.throws(
    () => createAutonomousWorkOrderSourceReplayClosureReceipt(
      attackedInput, attackedContext),
    /ACTOR_EDGE_DELEGATION_LANE_EXACT_CROSSWALK_INVALID/u,
  );
});

test("a rehashed caller source cannot swap the lane delegation envelope", (t) => {
  const value = closureFixture(t);
  const sourceInput = structuredClone(delegationSourceInput(value.base));
  sourceInput.laneProjection.delegationEnvelopeHash
    = stage5Hash("stage1-closure:swapped-envelope");
  const attackedSource
    = createAutonomousWorkOrderDelegationLaneCrosswalkSource(sourceInput);
  const attackedInput = structuredClone(value.input);
  attackedInput.delegationCrosswalkSource = attackedSource;
  const attackedContext = {
    ...value.context,
    expectedDelegationCrosswalkSourceHash: attackedSource.sourceHash,
  };
  assert.throws(
    () => createAutonomousWorkOrderSourceReplayClosureReceipt(
      attackedInput, attackedContext),
    /ACTOR_EDGE_DELEGATION_LANE_EXACT_CROSSWALK_INVALID/u,
  );
});

test("a rehashed caller source cannot substitute any product-term reference", (t) => {
  const value = closureFixture(t);
  const sourceInput = structuredClone(productTermSourceInput(value.base));
  sourceInput.promisedOutcome.acceptanceCriteriaHash
    = stage5Hash("stage1-closure:swapped-acceptance-criteria");
  const attackedSource
    = createAutonomousWorkOrderProductTermReferenceSource(sourceInput);
  const attackedInput = structuredClone(value.input);
  attackedInput.productTermReferenceSource = attackedSource;
  const attackedContext = {
    ...value.context,
    expectedProductTermReferenceSourceHash: attackedSource.sourceHash,
  };
  assert.throws(
    () => createAutonomousWorkOrderSourceReplayClosureReceipt(
      attackedInput, attackedContext),
    /PRODUCT_TERM_REFERENCE_CROSSWALK_INVALID/u,
  );
});

test("node-contract and predecessor pin contexts must remain exact", (t) => {
  const value = closureFixture(t);
  const attacked = structuredClone(value.input);
  attacked.networkNodeContract.pins.laneTrust[0].expectedBundleHash
    = stage5Hash("stage1-closure:replacement-bundle-pin");
  assert.throws(
    () => createAutonomousWorkOrderSourceReplayClosureReceipt(
      attacked, value.context),
    /PREDECESSOR_REPLAY_FAILED:.*LANE_BUNDLE_EXTERNAL_HASH_PIN_MISSING/u,
  );
});

test("tampering, accessors, and post-construction mutation fail closed", (t) => {
  const value = closureFixture(t);
  assert.equal(Object.isFrozen(value.receipt), true);
  assert.equal(Object.isFrozen(value.receipt.delegationCrosswalk), true);
  assert.throws(() => {
    value.receipt.authority = "FULL";
  }, TypeError);

  const attackedRecord = structuredClone(value.receipt);
  attackedRecord.sourcePins.independentPinProvenanceEstablished = true;
  const checked = verifyAutonomousWorkOrderSourceReplayClosureReceipt(
    attackedRecord, {
      input: value.input,
      context: value.context,
      expectedClosureReceiptHash: attackedRecord.closureReceiptHash,
    });
  assert.equal(checked.ok, false);
  assert.equal(checked.sourceReplayVerified, false);
  assert.equal(checked.authority, "NONE");
  assert.equal(checked.actionReady, false);

  const poisoned = structuredClone(value.input);
  Object.defineProperty(poisoned, "independentPinProvenance", {
    enumerable: true,
    get() {
      throw new Error("must not execute");
    },
  });
  assert.throws(
    () => createAutonomousWorkOrderSourceReplayClosureReceipt(
      poisoned, value.context),
    /ACCESSOR_FORBIDDEN/u,
  );
});
