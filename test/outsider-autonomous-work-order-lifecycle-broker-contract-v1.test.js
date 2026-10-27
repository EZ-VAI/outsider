import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  AUTONOMOUS_WORK_ORDER_LIFECYCLE_BROKER_CONTRACT_V1_BOUNDARY,
  AUTONOMOUS_WORK_ORDER_LIFECYCLE_BROKER_CONTRACT_V1_LIMITS,
  AUTONOMOUS_WORK_ORDER_LIFECYCLE_BROKER_CONTRACT_V1_PRODUCTION_HOLD_CODE,
  AUTONOMOUS_WORK_ORDER_LIFECYCLE_BROKER_CONTRACT_V1_SCHEMAS,
  AUTONOMOUS_WORK_ORDER_LIFECYCLE_BROKER_DRAIN_BARRIER_REQUIREMENTS_V1,
  AUTONOMOUS_WORK_ORDER_LIFECYCLE_BROKER_DUAL_JOURNAL_V1,
  AUTONOMOUS_WORK_ORDER_LIFECYCLE_BROKER_JOURNAL_EVENTS_V1,
  AUTONOMOUS_WORK_ORDER_LIFECYCLE_BROKER_LEASE_KINDS_V1,
  AUTONOMOUS_WORK_ORDER_LIFECYCLE_BROKER_OS_REQUIREMENTS_V1,
  AUTONOMOUS_WORK_ORDER_LIFECYCLE_BROKER_PROTOCOL_V1,
  AUTONOMOUS_WORK_ORDER_LIFECYCLE_BROKER_PROVISIONING_REQUIREMENTS_V1,
  AUTONOMOUS_WORK_ORDER_LIFECYCLE_BROKER_RAW_LEAF_TABLE_V1,
  AUTONOMOUS_WORK_ORDER_LIFECYCLE_BROKER_RAW_ROLES_V1,
  AUTONOMOUS_WORK_ORDER_LIFECYCLE_BROKER_RAW_SUBJECT_KINDS_V1,
  AUTONOMOUS_WORK_ORDER_LIFECYCLE_BROKER_READ_ONLY_RPC_OPERATIONS_V1,
  AUTONOMOUS_WORK_ORDER_LIFECYCLE_BROKER_RECOVERY_TABLE_V1,
  AUTONOMOUS_WORK_ORDER_LIFECYCLE_BROKER_REGISTERED_RAW_OPERATIONS_V1,
  AUTONOMOUS_WORK_ORDER_LIFECYCLE_BROKER_REQUIRED_STATES_V1,
  AUTONOMOUS_WORK_ORDER_LIFECYCLE_BROKER_RPC_OPERATIONS_V1,
  AUTONOMOUS_WORK_ORDER_LIFECYCLE_BROKER_STATE_EVENTS_V1,
  AUTONOMOUS_WORK_ORDER_LIFECYCLE_BROKER_ZERO_LEASE_REQUIREMENTS_V1,
  classifyAutonomousWorkOrderLifecycleBrokerCommitUnknownV1,
  classifyAutonomousWorkOrderLifecycleBrokerIdempotencyV1,
  classifyAutonomousWorkOrderLifecycleBrokerRawPrefixRecoveryV1,
  createAutonomousWorkOrderLifecycleBrokerDescendantCensusModelV1,
  createAutonomousWorkOrderLifecycleBrokerDrainBarrierModelV1,
  createAutonomousWorkOrderLifecycleBrokerPurgeIntentBindingModelV1,
  createAutonomousWorkOrderLifecycleBrokerRegisteredRawOperationModelV1,
  createAutonomousWorkOrderLifecycleBrokerRpcRequestModelV1,
  createAutonomousWorkOrderLifecycleBrokerStateEventV1,
  createAutonomousWorkOrderLifecycleBrokerStateModelV1,
  createAutonomousWorkOrderLifecycleBrokerZeroLeaseProofModelV1,
  invokeAutonomousWorkOrderLifecycleProductionBrokerV1,
  reduceAutonomousWorkOrderLifecycleBrokerStateModelV1,
} from "../src/outsider-autonomous-work-order-lifecycle-broker-contract-v1.js";
import * as lifecycleRegistryV3 from
  "../src/outsider-autonomous-work-order-github-discovery-lifecycle-registry-v3.js";

const HASH_A = `sha256:${"a".repeat(64)}`;
const HASH_B = `sha256:${"b".repeat(64)}`;
const HASH_C = `sha256:${"c".repeat(64)}`;
const HASH_D = `sha256:${"d".repeat(64)}`;
const HASH_E = `sha256:${"e".repeat(64)}`;
const HASH_F = `sha256:${"f".repeat(64)}`;
const CAPTURE_ID = "snapshot_11111111111111111111111111111111";
const OPERATION_ID = "op_11111111111111111111111111111111";
const OTHER_OPERATION_ID = "op_22222222222222222222222222222222";
const BARRIER_ID = "barrier_11111111111111111111111111111111";

function rpcInput(overrides = {}) {
  return {
    operation: "RUN_REGISTERED_RAW_OPERATION",
    requestId: OPERATION_ID,
    expectedGateJournalHeadHash: HASH_A,
    expectedLifecycleRegistryHeadHash: HASH_B,
    expectedCaptureBindingHash: HASH_C,
    expectedRawPlanHash: HASH_D,
    declaredBodyHash: HASH_E,
    declaredRequestHash: HASH_F,
    ...overrides,
  };
}

function barrierInput(overrides = {}) {
  return {
    barrierId: BARRIER_ID,
    captureBindingHash: HASH_A,
    rawPlanHash: HASH_B,
    expectedEligibilityEntryHash: HASH_C,
    expectedDescendantCensusHash: HASH_D,
    ...overrides,
  };
}

function zeroLeaseInput(overrides = {}) {
  return {
    captureId: CAPTURE_ID,
    barrierEntryHash: HASH_A,
    activeLeaseIds: [],
    activeLeaseSetHash: HASH_B,
    activeLeaseCount: 0,
    lastLeaseTransitionSequence: 3,
    rawLeafFdCount: 0,
    trustedWorkerSetEmpty: true,
    rawFdExportEverAllowed: false,
    callerDeclarationUsed: true,
    ...overrides,
  };
}

function stateEvent(type, options = {}) {
  return createAutonomousWorkOrderLifecycleBrokerStateEventV1({
    type,
    ordinal: options.ordinal ?? null,
    barrier: options.barrier ?? null,
    zeroLeaseProof: options.zeroLeaseProof ?? null,
  });
}

function reduce(state, type, options) {
  return reduceAutonomousWorkOrderLifecycleBrokerStateModelV1(
    state,
    stateEvent(type, options),
  );
}

function registeredState() {
  return reduce(
    createAutonomousWorkOrderLifecycleBrokerStateModelV1(),
    "CAPTURE_GATE_BOUND",
  );
}

function stateThroughIntent() {
  let state = registeredState();
  state = reduce(state, "DRAIN_BARRIER_STRUCTURAL_DECLARATION_ACCEPTED", {
    barrier: createAutonomousWorkOrderLifecycleBrokerDrainBarrierModelV1(
      barrierInput(),
    ),
  });
  state = reduce(state, "ZERO_LEASES_STRUCTURAL_DECLARATION_ACCEPTED", {
    zeroLeaseProof:
      createAutonomousWorkOrderLifecycleBrokerZeroLeaseProofModelV1(
        zeroLeaseInput(),
      ),
  });
  state = reduce(state,
    "PURGE_ELIGIBILITY_STRUCTURAL_DECLARATION_ACCEPTED");
  state = reduce(state,
    "DESCENDANT_CENSUS_STRUCTURAL_DECLARATION_ACCEPTED");
  return reduce(state,
    "V3_PURGE_INTENT_STRUCTURAL_DECLARATION_ACCEPTED");
}

function rawRecoveryInput(committedPrefix) {
  const externalRows = [];
  const localRows = [];
  for (let index = 0; index < 5; index += 1) {
    externalRows[index] = index < committedPrefix
      ? "COMMITTED" : "NOT_STARTED";
    localRows[index] = index < committedPrefix
      ? "ABSENT" : "EXACT_PRESENT";
  }
  return { externalRows, localRows };
}

function descendantRow(sequence, digit = String(sequence), overrides = {}) {
  return {
    sequence,
    descendantId: `desc_${digit.repeat(32)}`,
    descendantType: "PRIVATE_GITHUB_DISCOVERY_SNAPSHOT_BUNDLE",
    terminalState: "SEALED",
    subjectHash: HASH_A,
    creationReceiptHash: HASH_B,
    contentHash: HASH_C,
    producerReceiptHash: HASH_D,
    ...overrides,
  };
}

test("schemas, journals, and RPC operations form one closed structural contract",
  () => {
    assert.deepEqual(AUTONOMOUS_WORK_ORDER_LIFECYCLE_BROKER_CONTRACT_V1_SCHEMAS,
      {
        rpcRequest:
          "outsider/autonomous-work-order-lifecycle-broker-rpc-request/v1",
        rpcResponse:
          "outsider/autonomous-work-order-lifecycle-broker-rpc-response/v1",
        provisioning:
          "outsider/autonomous-work-order-lifecycle-broker-provisioning/v1",
        stateModel:
          "outsider/autonomous-work-order-lifecycle-broker-state-model/v1",
        stateEvent:
          "outsider/autonomous-work-order-lifecycle-broker-state-event/v1",
        barrier:
          "outsider/autonomous-work-order-lifecycle-drain-barrier/v1",
        zeroLeaseProof:
          "outsider/autonomous-work-order-lifecycle-zero-lease-proof/v1",
        registeredRawOperation:
          "outsider/autonomous-work-order-lifecycle-registered-raw-operation/v1",
        rawOperationJournalEntry:
          "outsider/autonomous-work-order-lifecycle-raw-operation-journal-entry/v1",
        descendantCensus:
          "outsider/autonomous-work-order-lifecycle-descendant-census/v1",
        purgeIntent:
          "outsider/autonomous-work-order-github-discovery-purge-intent/v3",
        purgeIntentBinding:
          "outsider/autonomous-work-order-lifecycle-purge-intent-binding/v1",
        deleteOperation:
          "outsider/autonomous-work-order-github-discovery-delete-operation/v1",
        executionReceipt:
          "outsider/autonomous-work-order-github-discovery-purge-execution-receipt/v1",
      });
    assert.deepEqual(AUTONOMOUS_WORK_ORDER_LIFECYCLE_BROKER_RPC_OPERATIONS_V1,
      [
        "CAPABILITIES",
        "INSPECT_CAPTURE_LIFECYCLE",
        "INSPECT_OPERATION",
        "REGISTER_CAPTURE",
        "RUN_REGISTERED_RAW_OPERATION",
        "RESERVE_DESCENDANT",
        "SEAL_DESCENDANT",
        "ABORT_DESCENDANT",
        "PREPARE_PURGE_DRAIN",
        "CERTIFY_ZERO",
        "RECORD_ELIGIBILITY",
        "SEAL_CENSUS",
        "COMMIT_PURGE_INTENT_AFTER_DRAIN",
        "RESUME_EXACT_PURGE",
      ]);
    assert.equal(AUTONOMOUS_WORK_ORDER_LIFECYCLE_BROKER_RPC_OPERATIONS_V1.length,
      14);
    assert.deepEqual(
      AUTONOMOUS_WORK_ORDER_LIFECYCLE_BROKER_READ_ONLY_RPC_OPERATIONS_V1,
      ["CAPABILITIES", "INSPECT_CAPTURE_LIFECYCLE", "INSPECT_OPERATION"],
    );
    assert.deepEqual(
      AUTONOMOUS_WORK_ORDER_LIFECYCLE_BROKER_REGISTERED_RAW_OPERATIONS_V1,
      [
        "ACQUISITION_STRUCTURAL_REPLAY",
        "NETWORK_SAFE_PROJECTION_DERIVATION",
        "PRIVATE_BUNDLE_STRUCTURAL_VERIFICATION",
      ]);
    assert.deepEqual(
      AUTONOMOUS_WORK_ORDER_LIFECYCLE_BROKER_JOURNAL_EVENTS_V1,
      [
        "GENESIS",
        "CAPTURE_GATE_BOUND",
        "LEASE_GRANTED",
        "LEASE_RELEASED",
        "DRAIN_BARRIER",
        "ZERO_LEASES_PROOF",
        "V3_PURGE_INTENT_BOUND",
        "PURGE_RECEIPT_BOUND",
      ]);
    assert.deepEqual(
      AUTONOMOUS_WORK_ORDER_LIFECYCLE_BROKER_DUAL_JOURNAL_V1
        .rawOperationJournal.exactEntryFields,
      [
        "schema",
        "journalVersion",
        "sequence",
        "previousEntryHash",
        "requestId",
        "requestHash",
        "eventKind",
        "captureDirectoryId",
        "expectedLifecycleRegistryHeadHash",
        "payload",
        "entryHash",
      ]);
    assert.equal(
      AUTONOMOUS_WORK_ORDER_LIFECYCLE_BROKER_DUAL_JOURNAL_V1
        .exactCrossJournalCasImplemented,
      false,
    );
    assert.equal(
      AUTONOMOUS_WORK_ORDER_LIFECYCLE_BROKER_DUAL_JOURNAL_V1
        .callerHeadsAreConcurrencyTokensOnly,
      true,
    );
    assert.equal(
      AUTONOMOUS_WORK_ORDER_LIFECYCLE_BROKER_DUAL_JOURNAL_V1
        .callerHeadsAreIndependentProvenance,
      false,
    );
    assert.deepEqual(AUTONOMOUS_WORK_ORDER_LIFECYCLE_BROKER_REQUIRED_STATES_V1,
      [
        "REGISTER_CAPTURE_BEFORE_CAPTURE_DIRECTORY_OR_FIRST_GET",
        "DRAIN_BARRIER_DURABLE",
        "ZERO_DURABLE_LEASES_VERIFIED",
        "PURGE_ELIGIBILITY_FROM_VERIFIED_CONTROL_SOURCE",
        "PURGE_INTENT_DURABLE",
        "FINITE_DESCENDANT_CASCADE_DURABLE",
        "EXACT_NONRECURSIVE_DELETE",
        "PURGE_RECEIPT_DURABLE",
      ]);
    assert.deepEqual(AUTONOMOUS_WORK_ORDER_LIFECYCLE_BROKER_STATE_EVENTS_V1,
      [
        "CAPTURE_GATE_BOUND",
        "LEASE_GRANTED",
        "LEASE_RELEASED",
        "DRAIN_BARRIER_STRUCTURAL_DECLARATION_ACCEPTED",
        "ZERO_LEASES_STRUCTURAL_DECLARATION_ACCEPTED",
        "PURGE_ELIGIBILITY_STRUCTURAL_DECLARATION_ACCEPTED",
        "DESCENDANT_CENSUS_STRUCTURAL_DECLARATION_ACCEPTED",
        "V3_PURGE_INTENT_STRUCTURAL_DECLARATION_ACCEPTED",
        "DESCENDANT_CASCADE_STRUCTURAL_DECLARATION_ACCEPTED",
        "RAW_PREFIX_ADVANCE_STRUCTURAL_DECLARATION_ACCEPTED",
        "RAW_ABSENCE_STRUCTURAL_DECLARATION_ACCEPTED",
        "PURGE_RECEIPT_STRUCTURAL_DECLARATION_ACCEPTED_NO_AUTHORITY",
      ]);
  });

test("the RPC surface exposes no generic raw, path, fd, buffer, stream, or stale-lease override",
  () => {
    const operations = AUTONOMOUS_WORK_ORDER_LIFECYCLE_BROKER_RPC_OPERATIONS_V1;
    for (const forbidden of [
      "READ_RAW", "WRITE_RAW", "OPEN_PATH", "READ_PATH", "DELETE_PATH",
      "RETURN_FD", "RETURN_BUFFER", "OPEN_STREAM", "RESOLVE_STALE_LEASE",
      "REAP_LEASE", "EXPIRE_LEASE",
    ]) {
      assert.equal(operations.includes(forbidden), false);
    }
    assert.equal(operations.filter((operation) =>
      operation === "RUN_REGISTERED_RAW_OPERATION").length, 1);
    assert.deepEqual(AUTONOMOUS_WORK_ORDER_LIFECYCLE_BROKER_RAW_SUBJECT_KINDS_V1,
      ["ACQUISITION_CAPTURE", "REGISTERED_DESCENDANT"]);
    assert.deepEqual(AUTONOMOUS_WORK_ORDER_LIFECYCLE_BROKER_RAW_ROLES_V1,
      [
        "ISSUE_BEFORE", "COMMENTS_SCAN_A", "ISSUE_MID", "COMMENTS_SCAN_B",
        "ISSUE_AFTER",
      ]);
    assert.deepEqual(AUTONOMOUS_WORK_ORDER_LIFECYCLE_BROKER_RAW_LEAF_TABLE_V1,
      [
        { ordinal: 1, role: "ISSUE_BEFORE", leaf: "issue-before.json" },
        { ordinal: 2, role: "COMMENTS_SCAN_A", leaf: "comments-scan-a.json" },
        { ordinal: 3, role: "ISSUE_MID", leaf: "issue-mid.json" },
        { ordinal: 4, role: "COMMENTS_SCAN_B", leaf: "comments-scan-b.json" },
        { ordinal: 5, role: "ISSUE_AFTER", leaf: "issue-after.json" },
      ]);
    assert.deepEqual(AUTONOMOUS_WORK_ORDER_LIFECYCLE_BROKER_LEASE_KINDS_V1,
      ["RAW_READ", "RAW_WRITE", "DERIVE", "PUBLISH", "DESCENDANT_WRITE"]);
    assert.equal(AUTONOMOUS_WORK_ORDER_LIFECYCLE_BROKER_PROTOCOL_V1
      .callerPathAccepted, false);
    assert.equal(AUTONOMOUS_WORK_ORDER_LIFECYCLE_BROKER_PROTOCOL_V1
      .callerLeafNameAccepted, false);
    assert.equal(AUTONOMOUS_WORK_ORDER_LIFECYCLE_BROKER_PROTOCOL_V1
      .callerRawBytesAccepted, false);
    assert.equal(AUTONOMOUS_WORK_ORDER_LIFECYCLE_BROKER_PROTOCOL_V1
      .fileDescriptorAccepted, false);
    assert.equal(AUTONOMOUS_WORK_ORDER_LIFECYCLE_BROKER_PROTOCOL_V1
      .fileDescriptorReturned, false);
    assert.equal(AUTONOMOUS_WORK_ORDER_LIFECYCLE_BROKER_PROTOCOL_V1
      .descriptorTransferAllowed, false);
    assert.equal(AUTONOMOUS_WORK_ORDER_LIFECYCLE_BROKER_OS_REQUIREMENTS_V1.common
      .staleLeaseAutomaticResolutionAllowed, false);
    assert.equal(AUTONOMOUS_WORK_ORDER_LIFECYCLE_BROKER_ZERO_LEASE_REQUIREMENTS_V1
      .staleLeaseAutomaticResolutionAllowed, false);
  });

test("mutating RPCs require both structural CAS heads while read-only RPCs may use neither",
  () => {
    const mutating =
      createAutonomousWorkOrderLifecycleBrokerRpcRequestModelV1(rpcInput());
    assert.equal(mutating.readOnlyOperation, false);
    assert.equal(mutating.dualJournalCasRequired, true);
    assert.equal(mutating.dualJournalCasFieldsStructurallyPresent, true);
    assert.equal(mutating.callerHeadHashesRecomputed, false);
    assert.equal(mutating.externalDurabilityEstablished, false);

    const readOnly =
      createAutonomousWorkOrderLifecycleBrokerRpcRequestModelV1(rpcInput({
        operation: "CAPABILITIES",
        expectedGateJournalHeadHash: null,
        expectedLifecycleRegistryHeadHash: null,
      }));
    assert.equal(readOnly.readOnlyOperation, true);
    assert.equal(readOnly.dualJournalCasRequired, false);
    assert.equal(readOnly.dualJournalCasFieldsStructurallyPresent, false);
    assert.throws(() =>
      createAutonomousWorkOrderLifecycleBrokerRpcRequestModelV1(rpcInput({
        expectedGateJournalHeadHash: null,
        expectedLifecycleRegistryHeadHash: null,
      })), /RPC_REQUEST_MUTATING_DUAL_JOURNAL_CAS_REQUIRED/u);
    assert.throws(() =>
      createAutonomousWorkOrderLifecycleBrokerRpcRequestModelV1(rpcInput({
        expectedGateJournalHeadHash: null,
      })), /RPC_REQUEST_DUAL_JOURNAL_CAS_PAIR_REQUIRED/u);
  });

test("registered raw operation models never return a raw capability",
  () => {
    const acquisition =
      createAutonomousWorkOrderLifecycleBrokerRegisteredRawOperationModelV1({
        operationKind: "ACQUISITION_STRUCTURAL_REPLAY",
        subjectKind: "ACQUISITION_CAPTURE",
        descendantId: null,
        expectedDescendantReceiptHash: null,
      });
    assert.equal(acquisition.rawBytesReturned, false);
    assert.equal(acquisition.rawPathReturned, false);
    assert.equal(acquisition.rawDescriptorReturned, false);
    assert.equal(acquisition.rawStreamReturned, false);
    assert.equal(acquisition.internalBufferClearanceEstablished, false);
    assert.equal(acquisition.executionAuthorized, false);
    assert.equal(acquisition.decisionState, "HOLD");
    assert.equal(acquisition.authority, "NONE");

    const descendant =
      createAutonomousWorkOrderLifecycleBrokerRegisteredRawOperationModelV1({
        operationKind: "PRIVATE_BUNDLE_STRUCTURAL_VERIFICATION",
        subjectKind: "REGISTERED_DESCENDANT",
        descendantId: "desc_22222222222222222222222222222222",
        expectedDescendantReceiptHash: HASH_A,
      });
    assert.equal(descendant.descendantId,
      "desc_22222222222222222222222222222222");
    assert.equal(descendant.expectedDescendantReceiptHash, HASH_A);
    assert.throws(() =>
      createAutonomousWorkOrderLifecycleBrokerRegisteredRawOperationModelV1({
        operationKind: "READ_RAW",
        subjectKind: "ACQUISITION_CAPTURE",
        descendantId: null,
        expectedDescendantReceiptHash: null,
      }), /REGISTERED_RAW_OPERATION_KIND_INVALID/u);
  });

test("the sole production invocation is zero-argument fixed HOLD and touches no caller",
  () => {
    assert.equal(invokeAutonomousWorkOrderLifecycleProductionBrokerV1.length, 0);
    let touches = 0;
    const target = {};
    Object.defineProperty(target, "payload", {
      configurable: true,
      enumerable: true,
      get() { touches += 1; throw new Error("must not read accessor"); },
    });
    const proxy = new Proxy(target, {
      get() { touches += 1; throw new Error("must not get proxy"); },
      getOwnPropertyDescriptor() {
        touches += 1;
        throw new Error("must not inspect proxy descriptor");
      },
      getPrototypeOf() {
        touches += 1;
        throw new Error("must not inspect proxy prototype");
      },
      ownKeys() { touches += 1; throw new Error("must not enumerate proxy"); },
    });
    assert.throws(
      () => invokeAutonomousWorkOrderLifecycleProductionBrokerV1(proxy),
      (error) => error instanceof TypeError
        && error.message
          === AUTONOMOUS_WORK_ORDER_LIFECYCLE_BROKER_CONTRACT_V1_PRODUCTION_HOLD_CODE,
    );
    assert.equal(touches, 0);
    assert.throws(
      () => invokeAutonomousWorkOrderLifecycleProductionBrokerV1(target),
      (error) => error instanceof TypeError
        && error.message
          === AUTONOMOUS_WORK_ORDER_LIFECYCLE_BROKER_CONTRACT_V1_PRODUCTION_HOLD_CODE,
    );
    assert.equal(touches, 0);
  });

test("barrier and zero-lease proof remain structural, exact, and non-authorizing",
  () => {
    const barrier =
      createAutonomousWorkOrderLifecycleBrokerDrainBarrierModelV1(
        barrierInput(),
      );
    assert.deepEqual(barrier, {
      schema: AUTONOMOUS_WORK_ORDER_LIFECYCLE_BROKER_CONTRACT_V1_SCHEMAS.barrier,
      structuralModelOnly: true,
      barrierId: BARRIER_ID,
      captureBindingHash: HASH_A,
      rawPlanHash: HASH_B,
      expectedEligibilityEntryHash: HASH_C,
      expectedDescendantCensusHash: HASH_D,
      readerAdmissionClosed: true,
      isPurgeIntent: false,
      deletionAuthorityEstablished: false,
      pidIsLivenessAuthority: false,
      localClockIsLivenessAuthority: false,
      durableZeroLeaseProofEstablished: false,
      externalDurabilityEstablished: false,
    });
    assert.equal(AUTONOMOUS_WORK_ORDER_LIFECYCLE_BROKER_DRAIN_BARRIER_REQUIREMENTS_V1
      .reversibleInProtocolV1, false);
    assert.equal(AUTONOMOUS_WORK_ORDER_LIFECYCLE_BROKER_DRAIN_BARRIER_REQUIREMENTS_V1
      .structuralDeclarationIsDurableBarrier, false);

    const proof =
      createAutonomousWorkOrderLifecycleBrokerZeroLeaseProofModelV1(
        zeroLeaseInput(),
      );
    assert.deepEqual(proof.activeLeaseIds, []);
    assert.equal(Object.isFrozen(proof.activeLeaseIds), true);
    assert.equal(proof.activeLeaseCount, 0);
    assert.equal(proof.rawLeafFdCount, 0);
    assert.equal(proof.trustedWorkerSetEmpty, true);
    assert.equal(proof.rawFdExportEverAllowed, false);
    assert.equal(proof.callerDeclarationUsed, true);
    assert.equal(proof.activeLeaseSetHashRecomputed, false);
    assert.equal(proof.activeLeaseSetHashBindingEstablished, false);
    assert.equal(proof.durableZeroLeaseProofEstablished, false);
    assert.equal(proof.externalDurabilityEstablished, false);
    assert.equal(proof.permitsDelete, false);
    assert.throws(() =>
      createAutonomousWorkOrderLifecycleBrokerZeroLeaseProofModelV1(
        zeroLeaseInput({ activeLeaseCount: 1 }),
      ), /ZERO_LEASE_INPUT_NOT_ZERO/u);
    assert.throws(() =>
      createAutonomousWorkOrderLifecycleBrokerZeroLeaseProofModelV1(
        zeroLeaseInput({
          activeLeaseIds: ["lease_11111111111111111111111111111111"],
        }),
      ), /ACTIVE_LEASE_IDS_LENGTH_INVALID/u);
  });

test("active leases drain through a barrier before zero proof and intent",
  () => {
    let state = registeredState();
    state = reduce(state, "LEASE_GRANTED");
    state = reduce(state, "LEASE_GRANTED");
    assert.equal(state.substate, "REGISTERED_OPEN");
    assert.equal(state.activeLeaseCount, 2);

    state = reduce(state,
      "DRAIN_BARRIER_STRUCTURAL_DECLARATION_ACCEPTED", {
      barrier: createAutonomousWorkOrderLifecycleBrokerDrainBarrierModelV1(
        barrierInput(),
      ),
    });
    assert.equal(state.substate,
      "DRAIN_BARRIER_STRUCTURAL_DECLARATION_ACCEPTED");
    assert.equal(state.activeLeaseCount, 2);
    assert.throws(() => reduce(state, "LEASE_GRANTED"),
      /STATE_TRANSITION_LEASE_GRANT_HOLD/u);
    assert.throws(() => reduce(state,
      "ZERO_LEASES_STRUCTURAL_DECLARATION_ACCEPTED", {
      zeroLeaseProof:
        createAutonomousWorkOrderLifecycleBrokerZeroLeaseProofModelV1(
          zeroLeaseInput(),
        ),
    }), /STATE_TRANSITION_HOLD/u);

    state = reduce(state, "LEASE_RELEASED");
    assert.equal(state.activeLeaseCount, 1);
    state = reduce(state, "LEASE_RELEASED");
    assert.equal(state.activeLeaseCount, 0);
    state = reduce(state,
      "ZERO_LEASES_STRUCTURAL_DECLARATION_ACCEPTED", {
      zeroLeaseProof:
        createAutonomousWorkOrderLifecycleBrokerZeroLeaseProofModelV1(
          zeroLeaseInput(),
        ),
    });
    assert.equal(state.substate,
      "ZERO_LEASES_STRUCTURAL_DECLARATION_ACCEPTED");
    state = reduce(state,
      "PURGE_ELIGIBILITY_STRUCTURAL_DECLARATION_ACCEPTED");
    state = reduce(state,
      "DESCENDANT_CENSUS_STRUCTURAL_DECLARATION_ACCEPTED");
    state = reduce(state,
      "V3_PURGE_INTENT_STRUCTURAL_DECLARATION_ACCEPTED");
    assert.equal(state.substate,
      "PURGE_INTENT_STRUCTURAL_DECLARATION_ACCEPTED_RAW_FORBIDDEN");
    assert.equal(state.postIntentRawForbidden, true);
    assert.equal(state.simulatedOrderingState, true);
    assert.equal(state.orderingOnlyNoCrossEvidenceBinding, true);
    assert.equal(state.crossEventEvidenceBindingEstablished, false);
    assert.equal(state.durableZeroLeaseProofEstablished, false);
  });

test("the pure reducer accepts only the complete monotonic structural sequence",
  () => {
    let state = stateThroughIntent();
    state = reduce(state,
      "DESCENDANT_CASCADE_STRUCTURAL_DECLARATION_ACCEPTED");
    for (let ordinal = 1; ordinal <= 5; ordinal += 1) {
      state = reduce(state,
        "RAW_PREFIX_ADVANCE_STRUCTURAL_DECLARATION_ACCEPTED", { ordinal });
      assert.equal(state.substate,
        `RAW_PREFIX_${ordinal}_STRUCTURAL_DECLARATION_ACCEPTED`);
      assert.equal(state.committedRawPrefix, ordinal);
      assert.equal(state.postIntentRawForbidden, true);
    }
    state = reduce(state,
      "RAW_ABSENCE_STRUCTURAL_DECLARATION_ACCEPTED");
    assert.equal(state.substate,
      "RAW_ABSENCE_STRUCTURAL_DECLARATION_ACCEPTED");
    state = reduce(state,
      "PURGE_RECEIPT_STRUCTURAL_DECLARATION_ACCEPTED_NO_AUTHORITY");
    assert.equal(state.substate,
      "PURGE_RECEIPT_STRUCTURAL_DECLARATION_ACCEPTED_NO_AUTHORITY");
    assert.equal(state.externalDurabilityEstablished, false);
    assert.equal(state.executionAuthorized, false);
    assert.equal(state.simulatedOrderingState, true);
    assert.equal(state.orderingOnlyNoCrossEvidenceBinding, true);
    assert.equal(state.crossEventEvidenceBindingEstablished, false);
    assert.equal(state.lifecycleChainCompletionEstablished, false);
    assert.throws(() => reduce(state,
      "PURGE_RECEIPT_STRUCTURAL_DECLARATION_ACCEPTED_NO_AUTHORITY"),
      /STATE_TRANSITION_HOLD/u);
  });

test("skip, backtrack, premature intent, and post-intent reader paths HOLD",
  () => {
    const initial = createAutonomousWorkOrderLifecycleBrokerStateModelV1();
    assert.throws(() => reduce(initial, "LEASE_GRANTED"),
      /STATE_TRANSITION_LEASE_GRANT_HOLD/u);
    assert.throws(() => reduce(initial,
      "V3_PURGE_INTENT_STRUCTURAL_DECLARATION_ACCEPTED"),
      /STATE_TRANSITION_HOLD/u);

    const open = registeredState();
    assert.throws(() => reduce(open,
      "ZERO_LEASES_STRUCTURAL_DECLARATION_ACCEPTED", {
      zeroLeaseProof:
        createAutonomousWorkOrderLifecycleBrokerZeroLeaseProofModelV1(
          zeroLeaseInput(),
        ),
    }), /STATE_TRANSITION_HOLD/u);
    assert.throws(() => reduce(open,
      "V3_PURGE_INTENT_STRUCTURAL_DECLARATION_ACCEPTED"),
      /STATE_TRANSITION_HOLD/u);
    assert.throws(() => reduce(open,
      "RAW_PREFIX_ADVANCE_STRUCTURAL_DECLARATION_ACCEPTED", { ordinal: 1 }),
      /STATE_TRANSITION_HOLD/u);

    const intent = stateThroughIntent();
    assert.throws(() => reduce(intent, "LEASE_GRANTED"),
      /STATE_TRANSITION_LEASE_GRANT_HOLD/u);
    assert.throws(() => reduce(intent,
      "DESCENDANT_CENSUS_STRUCTURAL_DECLARATION_ACCEPTED"),
      /STATE_TRANSITION_HOLD/u);
    let cascade = reduce(intent,
      "DESCENDANT_CASCADE_STRUCTURAL_DECLARATION_ACCEPTED");
    assert.throws(() => reduce(cascade,
      "RAW_PREFIX_ADVANCE_STRUCTURAL_DECLARATION_ACCEPTED", { ordinal: 2 }),
      /STATE_TRANSITION_HOLD/u);
    cascade = reduce(cascade,
      "RAW_PREFIX_ADVANCE_STRUCTURAL_DECLARATION_ACCEPTED", { ordinal: 1 });
    assert.throws(() => reduce(cascade,
      "RAW_PREFIX_ADVANCE_STRUCTURAL_DECLARATION_ACCEPTED", { ordinal: 1 }),
      /STATE_TRANSITION_HOLD/u);
  });

test("advanced reducer tuples are simulated ordering only and reject unreachable state",
  () => {
    const orderingEvent = stateEvent(
      "PURGE_ELIGIBILITY_STRUCTURAL_DECLARATION_ACCEPTED",
    );
    assert.equal(orderingEvent.structuralOrderingOnly, true);
    assert.equal(orderingEvent.crossEventEvidenceBindingEstablished, false);
    assert.equal(orderingEvent.durableZeroLeaseProofEstablished, false);

    const open = registeredState();
    assert.equal(open.simulatedOrderingState, true);
    assert.equal(open.orderingOnlyNoCrossEvidenceBinding, true);
    assert.equal(open.crossEventEvidenceBindingEstablished, false);
    const forgedPrefix = {
      ...open,
      substate: "RAW_PREFIX_4_STRUCTURAL_DECLARATION_ACCEPTED",
      committedRawPrefix: 0,
      postIntentRawForbidden: true,
    };
    assert.throws(() =>
      reduceAutonomousWorkOrderLifecycleBrokerStateModelV1(
        forgedPrefix,
        stateEvent("RAW_PREFIX_ADVANCE_STRUCTURAL_DECLARATION_ACCEPTED", {
          ordinal: 5,
        }),
      ), /STATE_MODEL_REACHABILITY_INVARIANT_HOLD/u);

    const intent = stateThroughIntent();
    const forgedLease = { ...intent, activeLeaseCount: 1 };
    assert.throws(() =>
      reduceAutonomousWorkOrderLifecycleBrokerStateModelV1(
        forgedLease,
        stateEvent("DESCENDANT_CASCADE_STRUCTURAL_DECLARATION_ACCEPTED"),
      ), /STATE_MODEL_REACHABILITY_INVARIANT_HOLD/u);
    const forgedRawAllowed = { ...intent, postIntentRawForbidden: false };
    assert.throws(() =>
      reduceAutonomousWorkOrderLifecycleBrokerStateModelV1(
        forgedRawAllowed,
        stateEvent("DESCENDANT_CASCADE_STRUCTURAL_DECLARATION_ACCEPTED"),
      ), /STATE_MODEL_REACHABILITY_INVARIANT_HOLD/u);
  });

test("raw recovery recognizes every exact 0-5 prefix",
  () => {
    assert.equal(AUTONOMOUS_WORK_ORDER_LIFECYCLE_BROKER_RECOVERY_TABLE_V1.length,
      6);
    for (let prefix = 0; prefix <= 5; prefix += 1) {
      const row = AUTONOMOUS_WORK_ORDER_LIFECYCLE_BROKER_RECOVERY_TABLE_V1[
        prefix];
      assert.equal(row.committedPrefix, prefix);
      assert.deepEqual(row.absentOrdinals,
        Array.from({ length: prefix }, (_, index) => index + 1));
      assert.deepEqual(row.exactPresentOrdinals,
        Array.from({ length: 5 - prefix }, (_, index) => prefix + index + 1));
      assert.equal(row.nextOrdinal, prefix === 5 ? null : prefix + 1);

      const classified =
        classifyAutonomousWorkOrderLifecycleBrokerRawPrefixRecoveryV1(
          rawRecoveryInput(prefix),
        );
      assert.equal(classified.committedPrefix, prefix);
      assert.equal(classified.postIntentRawForbidden, true);
      assert.equal(classified.structuralModelOnly, true);
      assert.equal(classified.classificationIsExecutionAuthority, false);
      assert.equal(classified.observationsIndependentlyVerified, false);
      assert.equal(classified.permitsIo, false);
      assert.equal(classified.permitsDelete, false);
      assert.equal(classified.classification, prefix === 5
        ? "RAW_ABSENCE_VERIFICATION_REQUIRED" : "PREPARE_NEXT_ORDINAL");
      assert.equal(classified.nextOrdinal, prefix === 5 ? null : prefix + 1);
    }
  });

test("raw recovery holds on divergence, I/O unknown, and directory leaves",
  () => {
    let result =
      classifyAutonomousWorkOrderLifecycleBrokerRawPrefixRecoveryV1({
        externalRows: [
          "COMMITTED", "NOT_STARTED", "NOT_STARTED", "NOT_STARTED",
          "NOT_STARTED",
        ],
        localRows: [
          "EXACT_PRESENT", "EXACT_PRESENT", "EXACT_PRESENT", "EXACT_PRESENT",
          "EXACT_PRESENT",
        ],
      });
    assert.equal(result.classification, "FILESYSTEM_ROLLBACK_HOLD");

    result = classifyAutonomousWorkOrderLifecycleBrokerRawPrefixRecoveryV1({
      externalRows: [
        "NOT_STARTED", "COMMITTED", "NOT_STARTED", "NOT_STARTED",
        "NOT_STARTED",
      ],
      localRows: [
        "EXACT_PRESENT", "ABSENT", "EXACT_PRESENT", "EXACT_PRESENT",
        "EXACT_PRESENT",
      ],
    });
    assert.equal(result.classification, "NON_PREFIX_DIVERGENCE_HOLD");

    result = classifyAutonomousWorkOrderLifecycleBrokerRawPrefixRecoveryV1({
      externalRows: [
        "PREPARED", "NOT_STARTED", "NOT_STARTED", "NOT_STARTED",
        "NOT_STARTED",
      ],
      localRows: [
        "DIVERGED", "EXACT_PRESENT", "EXACT_PRESENT", "EXACT_PRESENT",
        "EXACT_PRESENT",
      ],
    });
    assert.equal(result.classification, "IDENTITY_DIVERGED_HOLD");

    result = classifyAutonomousWorkOrderLifecycleBrokerRawPrefixRecoveryV1({
      externalRows: [
        "PREPARED", "NOT_STARTED", "NOT_STARTED", "NOT_STARTED",
        "NOT_STARTED",
      ],
      localRows: [
        "IO_UNKNOWN", "EXACT_PRESENT", "EXACT_PRESENT", "EXACT_PRESENT",
        "EXACT_PRESENT",
      ],
    });
    assert.equal(result.classification, "LOCAL_COMMIT_UNKNOWN");
    assert.equal(result.nextOrdinal, 1);

    result = classifyAutonomousWorkOrderLifecycleBrokerRawPrefixRecoveryV1({
      externalRows: [
        "NOT_STARTED", "NOT_STARTED", "NOT_STARTED", "NOT_STARTED",
        "NOT_STARTED",
      ],
      localRows: [
        "EXACT_PRESENT", "DIRECTORY", "EXACT_PRESENT", "EXACT_PRESENT",
        "EXACT_PRESENT",
      ],
    });
    assert.equal(result.classification,
      "DIRECTORY_TARGET_NONRECURSIVE_HOLD");
    assert.equal(result.recursiveDeleteForbidden, true);
    assert.equal(result.nextOrdinal, null);
    assert.equal(result.postIntentRawForbidden, true);
  });

test("prepared raw commits recover structurally without blind execution",
  () => {
    const exact =
      classifyAutonomousWorkOrderLifecycleBrokerRawPrefixRecoveryV1({
        externalRows: [
          "COMMITTED", "PREPARED", "NOT_STARTED", "NOT_STARTED",
          "NOT_STARTED",
        ],
        localRows: [
          "ABSENT", "EXACT_PRESENT", "EXACT_PRESENT", "EXACT_PRESENT",
          "EXACT_PRESENT",
        ],
      });
    assert.equal(exact.classification, "RETRY_EXACT_PREPARED_DELETE");
    assert.equal(exact.committedPrefix, 1);
    assert.equal(exact.preparedOrdinal, 2);
    assert.equal(exact.nextOrdinal, 2);

    const absent =
      classifyAutonomousWorkOrderLifecycleBrokerRawPrefixRecoveryV1({
        externalRows: [
          "COMMITTED", "PREPARED", "NOT_STARTED", "NOT_STARTED",
          "NOT_STARTED",
        ],
        localRows: [
          "ABSENT", "ABSENT", "EXACT_PRESENT", "EXACT_PRESENT",
          "EXACT_PRESENT",
        ],
      });
    assert.equal(absent.classification, "RECOVER_PREPARED_AS_COMMITTED");
    assert.equal(absent.postIntentRawForbidden, true);
  });

test("idempotency is operation-id exact and commit-unknown never blind-retries",
  () => {
    const base = {
      storedOperationId: OPERATION_ID,
      storedRequestHash: HASH_A,
      storedCommitState: "COMMITTED",
      candidateOperationId: OPERATION_ID,
      candidateRequestHash: HASH_A,
    };
    assert.equal(classifyAutonomousWorkOrderLifecycleBrokerIdempotencyV1({
      ...base,
      storedOperationId: null,
      storedRequestHash: null,
      storedCommitState: null,
    }).classification, "NEW_OPERATION_ID");
    assert.equal(classifyAutonomousWorkOrderLifecycleBrokerIdempotencyV1(base)
      .classification, "REPLAY_COMMITTED");
    assert.equal(classifyAutonomousWorkOrderLifecycleBrokerIdempotencyV1({
      ...base, storedCommitState: "REJECTED",
    }).classification, "REPLAY_REJECTED");
    assert.equal(classifyAutonomousWorkOrderLifecycleBrokerIdempotencyV1({
      ...base, storedCommitState: "PENDING",
    }).classification, "PENDING_HOLD");
    const unknown =
      classifyAutonomousWorkOrderLifecycleBrokerIdempotencyV1({
        ...base, storedCommitState: "COMMIT_UNKNOWN",
      });
    assert.equal(unknown.classification,
      "RECOVER_SAME_OPERATION_ID_REQUIRED");
    assert.equal(unknown.retryAllowedOnlyWithSameOperationId, true);
    assert.equal(unknown.recoveryRequired, true);
    assert.equal(unknown.classificationIsExecutionAuthority, false);
    assert.equal(unknown.permitsIo, false);
    assert.equal(unknown.permitsDelete, false);
    assert.equal(classifyAutonomousWorkOrderLifecycleBrokerIdempotencyV1({
      ...base, candidateRequestHash: HASH_B,
    }).classification, "OPERATION_ID_REUSE_HOLD");
    assert.equal(classifyAutonomousWorkOrderLifecycleBrokerIdempotencyV1({
      ...base, candidateOperationId: OTHER_OPERATION_ID,
    }).classification, "NEW_OPERATION_ID");

    const committed =
      classifyAutonomousWorkOrderLifecycleBrokerCommitUnknownV1({
        phase: "PURGE_INTENT",
        externalObservation: "COMMITTED",
        localObservation: "RECEIPT_EXACT",
      });
    assert.equal(committed.classification, "RECOVER_COMMITTED");
    assert.equal(committed.blindRetryAllowed, false);
    assert.equal(committed.classificationIsExecutionAuthority, false);
    assert.equal(committed.observationsIndependentlyVerified, false);
    assert.equal(committed.durableZeroLeaseProofEstablished, false);
    assert.equal(committed.permitsIo, false);
    assert.equal(committed.permitsDelete, false);
    const replay = classifyAutonomousWorkOrderLifecycleBrokerCommitUnknownV1({
      phase: "LEASE_GRANT",
      externalObservation: "NOT_FOUND",
      localObservation: "NONE",
    });
    assert.equal(replay.classification, "REPLAY_SAME_OPERATION_ID_ONLY");
    assert.equal(replay.sameOperationIdMayBeReplayed, true);
    const divergence =
      classifyAutonomousWorkOrderLifecycleBrokerCommitUnknownV1({
        phase: "RAW_DELETE",
        externalObservation: "NOT_FOUND",
        localObservation: "EXACT_PRESENT",
      });
    assert.equal(divergence.classification,
      "LOCAL_EXTERNAL_DIVERGENCE_HOLD");
    assert.equal(divergence.blindRetryAllowed, false);
    assert.equal(divergence.structuralModelOnly, true);
    assert.equal(divergence.classificationIsExecutionAuthority, false);

    const unsafeLocal =
      classifyAutonomousWorkOrderLifecycleBrokerCommitUnknownV1({
        phase: "PURGE_INTENT",
        externalObservation: "COMMITTED",
        localObservation: "IO_UNKNOWN",
      });
    assert.equal(unsafeLocal.classification,
      "LOCAL_OBSERVATION_UNSAFE_HOLD");
    assert.equal(unsafeLocal.recoveryRequired, true);
    assert.equal(unsafeLocal.permitsIo, false);
  });

test("descendant census rejects gaps, duplicate IDs, overflow, and terminal mismatch",
  () => {
    const valid =
      createAutonomousWorkOrderLifecycleBrokerDescendantCensusModelV1({
        captureId: CAPTURE_ID,
        highWatermark: 2,
        rows: [
          descendantRow(1, "1"),
          descendantRow(2, "2", {
            terminalState: "ABORTED",
            contentHash: null,
          }),
        ],
      });
    assert.equal(valid.rowCount, 2);
    assert.equal(valid.continuousSequenceStructurallyVerified, true);
    assert.equal(valid.uniqueDescendantIdsStructurallyVerified, true);
    assert.equal(valid.allRowsTerminalStructurallyVerified, true);
    assert.equal(valid.censusHashComputed, false);
    assert.equal(valid.producerRegistrationCompletenessEstablished, false);
    assert.equal(valid.globalDescendantCensusCompletenessEstablished, false);
    assert.equal(valid.externalDurabilityEstablished, false);
    assert.equal(valid.permitsPurgeIntent, false);

    assert.throws(() =>
      createAutonomousWorkOrderLifecycleBrokerDescendantCensusModelV1({
        captureId: CAPTURE_ID,
        highWatermark: 2,
        rows: [descendantRow(1, "1"), descendantRow(3, "3")],
      }), /DESCENDANT_SEQUENCE_GAP/u);
    assert.throws(() =>
      createAutonomousWorkOrderLifecycleBrokerDescendantCensusModelV1({
        captureId: CAPTURE_ID,
        highWatermark: 2,
        rows: [descendantRow(1, "1"), descendantRow(2, "1")],
      }), /DESCENDANT_ID_DUPLICATE/u);

    const oversizedRows = [];
    oversizedRows.length =
      AUTONOMOUS_WORK_ORDER_LIFECYCLE_BROKER_CONTRACT_V1_LIMITS
        .maximumDescendants + 1;
    assert.throws(() =>
      createAutonomousWorkOrderLifecycleBrokerDescendantCensusModelV1({
        captureId: CAPTURE_ID,
        highWatermark:
          AUTONOMOUS_WORK_ORDER_LIFECYCLE_BROKER_CONTRACT_V1_LIMITS
            .maximumDescendants,
        rows: oversizedRows,
      }), /DESCENDANT_ROWS_LENGTH_INVALID/u);
    assert.throws(() =>
      createAutonomousWorkOrderLifecycleBrokerDescendantCensusModelV1({
        captureId: CAPTURE_ID,
        highWatermark: 1,
        rows: [descendantRow(1, "1", { contentHash: null })],
      }), /DESCENDANT_CONTENT_TERMINAL_MISMATCH/u);
    assert.throws(() =>
      createAutonomousWorkOrderLifecycleBrokerDescendantCensusModelV1({
        captureId: CAPTURE_ID,
        highWatermark: 1,
        rows: [descendantRow(1, "1", {
          terminalState: "ABORTED",
          contentHash: HASH_E,
        })],
      }), /DESCENDANT_CONTENT_TERMINAL_MISMATCH/u);
  });

test("RPC projection ignores 100k unknown fields and rejects proxies/accessors without traps",
  () => {
    const narrow = createAutonomousWorkOrderLifecycleBrokerRpcRequestModelV1(
      rpcInput(),
    );
    const wide = rpcInput();
    for (let index = 0; index < 100_000; index += 1) {
      wide[`ignored_${index}`] = index;
    }
    let unknownGetterTouches = 0;
    Object.defineProperty(wide, "ignored_accessor", {
      configurable: true,
      enumerable: true,
      get() {
        unknownGetterTouches += 1;
        throw new Error("unknown accessor must not be read");
      },
    });
    const projected =
      createAutonomousWorkOrderLifecycleBrokerRpcRequestModelV1(wide);
    assert.deepEqual(projected, narrow);
    assert.equal(unknownGetterTouches, 0);

    let proxyTouches = 0;
    const handler = {
      get() { proxyTouches += 1; throw new Error("proxy get"); },
      getOwnPropertyDescriptor() {
        proxyTouches += 1;
        throw new Error("proxy descriptor");
      },
      getPrototypeOf() {
        proxyTouches += 1;
        throw new Error("proxy prototype");
      },
      ownKeys() { proxyTouches += 1; throw new Error("proxy ownKeys"); },
    };
    assert.throws(() =>
      createAutonomousWorkOrderLifecycleBrokerRpcRequestModelV1(
        new Proxy({}, handler),
      ), /RPC_REQUEST_RECORD_INVALID/u);
    assert.equal(proxyTouches, 0);

    assert.throws(() =>
      createAutonomousWorkOrderLifecycleBrokerRpcRequestModelV1(rpcInput({
        operation: new Proxy({}, handler),
      })), /RPC_OPERATION_INVALID/u);
    assert.equal(proxyTouches, 0);

    let requiredGetterTouches = 0;
    const accessor = rpcInput();
    Object.defineProperty(accessor, "operation", {
      configurable: true,
      enumerable: true,
      get() {
        requiredGetterTouches += 1;
        throw new Error("required accessor must not execute");
      },
    });
    assert.throws(() =>
      createAutonomousWorkOrderLifecycleBrokerRpcRequestModelV1(accessor),
    /RPC_REQUEST_OPERATION_FIELD_INVALID/u);
    assert.equal(requiredGetterTouches, 0);
  });

test("post-import primordial poisoning does not touch RegExp/String or inherited setters",
  () => {
    const regexpDescriptor = Object.getOwnPropertyDescriptor(
      RegExp.prototype, "exec");
    const objectDescriptor = Object.getOwnPropertyDescriptor(
      Object.prototype, "structuralModelOnly");
    const arrayDescriptor = Object.getOwnPropertyDescriptor(
      Array.prototype, "0");
    const stringDescriptor = Object.getOwnPropertyDescriptor(
      String.prototype, "toUpperCase");
    const touches = { regexp: 0, string: 0, object: 0, array: 0 };
    const censusInput = {
      captureId: CAPTURE_ID,
      highWatermark: 1,
      rows: [descendantRow(1, "1")],
    };
    let result;
    let typedError;
    const missingRpcField = rpcInput();
    Reflect.deleteProperty(missingRpcField, "operation");
    try {
      Object.defineProperty(RegExp.prototype, "exec", {
        ...regexpDescriptor,
        value() {
          touches.regexp += 1;
          throw new Error("poisoned RegExp.exec");
        },
      });
      Object.defineProperty(Object.prototype, "structuralModelOnly", {
        configurable: true,
        set() {
          touches.object += 1;
          throw new Error("poisoned Object.prototype setter");
        },
      });
      Object.defineProperty(Array.prototype, "0", {
        configurable: true,
        set() {
          touches.array += 1;
          throw new Error("poisoned Array.prototype[0] setter");
        },
      });
      Object.defineProperty(String.prototype, "toUpperCase", {
        ...stringDescriptor,
        value() {
          touches.string += 1;
          throw new Error("poisoned String.toUpperCase");
        },
      });
      result =
        createAutonomousWorkOrderLifecycleBrokerDescendantCensusModelV1(
          censusInput,
        );
      try {
        createAutonomousWorkOrderLifecycleBrokerRpcRequestModelV1(
          missingRpcField,
        );
      } catch (error) {
        typedError = error;
      }
    } finally {
      Object.defineProperty(RegExp.prototype, "exec", regexpDescriptor);
      Object.defineProperty(String.prototype, "toUpperCase", stringDescriptor);
      if (objectDescriptor === undefined) {
        Reflect.deleteProperty(Object.prototype, "structuralModelOnly");
      } else {
        Object.defineProperty(Object.prototype, "structuralModelOnly",
          objectDescriptor);
      }
      if (arrayDescriptor === undefined) {
        Reflect.deleteProperty(Array.prototype, "0");
      } else {
        Object.defineProperty(Array.prototype, "0", arrayDescriptor);
      }
    }
    assert.equal(result.rowCount, 1);
    assert.equal(typedError instanceof TypeError, true);
    assert.match(typedError.message, /RPC_REQUEST_OPERATION_FIELD_INVALID/u);
    assert.deepEqual(touches,
      { regexp: 0, string: 0, object: 0, array: 0 });
  });

test("structural models never convert caller hashes or declarations into authority",
  () => {
    const request = createAutonomousWorkOrderLifecycleBrokerRpcRequestModelV1(
      rpcInput(),
    );
    assert.equal(request.callerBodyInspected, false);
    assert.equal(request.callerHashesRecomputed, false);
    assert.equal(request.externalDurabilityEstablished, false);
    assert.equal(request.executionAuthorized, false);

    const binding =
      createAutonomousWorkOrderLifecycleBrokerPurgeIntentBindingModelV1({
        purgeId: "purge_11111111111111111111111111111111",
        captureId: CAPTURE_ID,
        rootCapabilityId: "BROKER_ROOT_V1",
        brokerBuildHash: HASH_A,
        rawPlanProfileHash: HASH_B,
        barrierReceiptHash: HASH_C,
        zeroLeaseReceiptHash: HASH_D,
        eligibilityReceiptHash: HASH_E,
        censusManifestHash: HASH_F,
        previousExternalHead: HASH_A,
        declaredIntentHash: HASH_B,
      });
    assert.equal(binding.declaredHashesRecomputed, false);
    assert.equal(binding.durableZeroLeaseProofEstablished, false);
    assert.equal(binding.issuerSignatureVerified, false);
    assert.equal(binding.currentExternalHeadVerified, false);
    assert.equal(binding.externalDurabilityEstablished, false);
    assert.equal(binding.permitsDelete, false);
  });

test("production source is capability-free and contains no I/O or deletion calls",
  () => {
    const source = readFileSync(new URL(
      "../src/outsider-autonomous-work-order-lifecycle-broker-contract-v1.js",
      import.meta.url), "utf8");
    assert.doesNotMatch(source,
      /from\s+["']node:(?:fs|fs\/promises|path|os|child_process|net|tls|http|https|dgram|cluster|worker_threads)["']/u);
    assert.doesNotMatch(source,
      /\b(?:require|import)\s*\(\s*["']node:/u);
    assert.doesNotMatch(source, /\bprocess\s*\./u);
    assert.doesNotMatch(source, /\b(?:fetch|WebSocket)\s*\(/u);
    assert.doesNotMatch(source,
      /\b(?:open|openSync|readFile|readFileSync|writeFile|writeFileSync|mkdir|mkdirSync|rename|renameSync|link|linkSync|symlink|symlinkSync|unlink|unlinkSync|unlinkat|rm|rmSync|rmdir|rmdirSync|spawn|exec|fork|connect|listen)\s*\(/u);
    assert.doesNotMatch(source, /\b(?:fs|path|os)\s*\./u);
    assert.doesNotMatch(source, /\bdelete\s+(?:[A-Za-z_$]|\[|\()/u);
  });

test("v3 and every legacy acquisition, publication, verification, and purge gate remain closed",
  () => {
    const v3Names = [
      "createAutonomousWorkOrderGithubDiscoveryLifecycleSyntheticHarnessV3",
      "initializeAutonomousWorkOrderGithubDiscoveryLifecycleRegistryV3",
      "inspectAutonomousWorkOrderGithubDiscoveryLifecycleRegistryV3",
      "registerAutonomousWorkOrderGithubDiscoveryCaptureV3",
      "registerAutonomousWorkOrderGithubDiscoveryDescendantV3",
      "sealAutonomousWorkOrderGithubDiscoveryDescendantCensusV3",
      "recordAutonomousWorkOrderGithubDiscoveryPurgeEligibilityV3",
      "beginAutonomousWorkOrderGithubDiscoveryPurgeV3",
      "readAutonomousWorkOrderGithubDiscoveryRegisteredRawFileV3",
      "resumeAutonomousWorkOrderGithubDiscoveryPurgeV3",
    ];
    for (const name of v3Names) {
      assert.equal(typeof lifecycleRegistryV3[name], "function");
      assert.equal(lifecycleRegistryV3[name].length, 0);
      assert.throws(() => lifecycleRegistryV3[name](),
        /LIFECYCLE_REGISTRY_V3_AUDITED_DRAFT_NOT_INTEGRATED_HOLD/u);
    }
    const v3Boundary =
      lifecycleRegistryV3
        .AUTONOMOUS_WORK_ORDER_GITHUB_DISCOVERY_LIFECYCLE_REGISTRY_V3_BOUNDARY;
    assert.equal(v3Boundary.productionEntryPointsFixedHold, true);
    assert.equal(v3Boundary.localFilesystemCapabilityPresent, false);
    assert.equal(v3Boundary.productionLocalDeleteEnabled, false);
    assert.equal(v3Boundary.stage1EngineeringGatePassed, false);
    assert.equal(v3Boundary.stage2Permitted, false);

    const acquisition = readFileSync(new URL(
      "../scripts/acquire-autonomous-work-order-github-discovery-snapshot.mjs",
      import.meta.url), "utf8");
    const purge = readFileSync(new URL(
      "../scripts/purge-autonomous-work-order-github-discovery-snapshot.mjs",
      import.meta.url), "utf8");
    const snapshot = readFileSync(new URL(
      "../src/outsider-autonomous-work-order-github-discovery-snapshot.js",
      import.meta.url), "utf8");
    assert.match(acquisition, /const LIVE_ACQUISITION_ENABLED = false;/u);
    assert.match(acquisition,
      /fail\("PURGE_LIFECYCLE_NOT_INTEGRATED_FAIL_CLOSED"\);/u);
    assert.match(purge, /const PURGE_LIFECYCLE_INTEGRATED = false;/u);
    assert.match(purge,
      /fail\("PURGE_LIFECYCLE_NOT_INTEGRATED_FAIL_CLOSED"\);/u);
    assert.ok((snapshot.match(
      /fail\("PURGE_LIFECYCLE_NOT_INTEGRATED_FAIL_CLOSED"\);/gu) ?? [])
      .length >= 4);
    assert.match(snapshot,
      /fail\("NETWORK_SAFE_PROJECTION_NOT_INTEGRATED_FAIL_CLOSED"\);/u);
  });

test("all production, external, durability, delete, Stage 1/2, action, and economic gates stay false",
  () => {
    const boundary =
      AUTONOMOUS_WORK_ORDER_LIFECYCLE_BROKER_CONTRACT_V1_BOUNDARY;
    assert.equal(boundary.status, "AUDITED_DRAFT_NOT_INTEGRATED");
    assert.equal(boundary.decisionState, "HOLD");
    assert.equal(boundary.authority, "NONE");
    assert.equal(boundary.consequenceReach, "NONE");
    assert.equal(boundary.networkConsequenceReach, "NONE");
    assert.equal(boundary.productionEntryPointCount, 1);
    assert.equal(boundary.productionEntryPointZeroArgument, true);
    assert.equal(boundary.productionEntryPointFixedTypedHold, true);
    assert.equal(boundary.productionEntryPointInspectsInput, false);

    const falseFields = [
      "actionReady",
      "executable",
      "filesystemImportPresent",
      "pathImportPresent",
      "operatingSystemImportPresent",
      "processImportPresent",
      "networkImportPresent",
      "nativeAddonImportPresent",
      "transportCapabilityPresent",
      "signatureCapabilityPresent",
      "filesystemCapabilityPresent",
      "deletionCapabilityPresent",
      "recursiveDeleteCapabilityPresent",
      "callerPathAccepted",
      "callerLeafNameAccepted",
      "callerRawBytesAccepted",
      "rawDescriptorAccepted",
      "rawDescriptorReturned",
      "descriptorTransferAllowed",
      "productionBrokerImplemented",
      "productionBrokerProvisioned",
      "dedicatedOsIdentityProvisioned",
      "trustedRootProvisioned",
      "stableAncestorHandleEstablished",
      "nofollowRelativeLeafOperationEstablished",
      "sameUserRaceExclusionEstablished",
      "exactNonrecursiveDeleteIntegrated",
      "automaticLocalDeleteEnabled",
      "sharedExternalLifecycleHeadEstablished",
      "dualJournalCasVerificationIntegrated",
      "registryHeadIsIndependentExternalWitness",
      "ownerRollbackResistanceEstablished",
      "externalDurabilityEstablished",
      "externalSignatureVerified",
      "nonEquivocationEstablished",
      "captureRegistrationIntegrated",
      "captureRegistrationBeforeFirstGetEstablished",
      "runRegisteredRawOperationIntegrated",
      "rawFdExportEverAllowed",
      "staleLeaseAutomaticResolutionAllowed",
      "drainBarrierIntegrated",
      "drainBarrierIsDeleteAuthorization",
      "zeroDurableLeasesEstablished",
      "durableZeroLeaseProofEstablished",
      "crossEventEvidenceBindingEstablished",
      "lifecycleChainCompletionEstablished",
      "stateReceiptSuccessEstablished",
      "classificationIsExecutionAuthority",
      "observationsIndependentlyVerified",
      "verifiedPurgeEligibilityIntegrated",
      "purgeIntentIntegrated",
      "tombstoneCascadeIntegrated",
      "crashResumeIntegrated",
      "incompleteRawCensusIntegrated",
      "globalDescendantCensusCompletenessEstablished",
      "producerRegistrationCompletenessEstablished",
      "currentGithubAcquisitionIntegrated",
      "currentGithubPublicationIntegrated",
      "currentDisputeReviewSourceBundleIntegrated",
      "currentProductionConsumersUseSameExternalHead",
      "existingAcquisitionAndPublicationKillGatesLifted",
      "secureEraseEstablished",
      "physicalMediaErasureEstablished",
      "backupOrRemoteCopyDeletionEstablished",
      "rightsClearanceEstablished",
      "privacyClearanceEstablished",
      "sourceReplayVerified",
      "directParticipantConfirmationEstablished",
      "networkOrderEstablished",
      "rightsPrivacyAdjudicationEstablished",
      "independentOutcomeEstablished",
      "outcomeTruthEstablished",
      "causalAttributionEstablished",
      "recoveryEstablished",
      "closureEstablished",
      "outsiderCanOverrideNativeSafetyVeto",
      "stage1EngineeringGateSatisfied",
      "stage1ExternalFactGateSatisfied",
      "stage1EngineeringGatePassed",
      "stage1ExternalFactGatePassed",
      "stage1Complete",
      "stage2Permitted",
      "actionAuthorized",
      "automaticTraining",
      "productionTrainingAuthorized",
      "actorCredit",
      "pricingAuthorized",
      "guaranteeEstablished",
      "insuranceEstablished",
      "settlementAuthorized",
      "custodyEstablished",
      "fundsVerified",
      "platformAdvanceEnabled",
      "moneyMovementEnabled",
    ];
    for (const field of falseFields) assert.equal(boundary[field], false, field);
    for (const field of [
      "enabledConsequenceUnits",
      "actionAdmissions",
      "actionUnits",
      "trainingRows",
      "causalExperienceUnits",
      "CEU",
      "pricingUnits",
      "guaranteeUnits",
      "insuranceUnits",
      "settlementUnits",
      "custodyUnits",
      "moneyMovementUnits",
    ]) assert.equal(boundary[field], 0, field);
    assert.equal(boundary.nativeSafetyUnconditionalVetoPreserved, true);
    assert.equal(boundary.outsiderCanOverrideNativeSafetyVeto, false);

    assert.equal(AUTONOMOUS_WORK_ORDER_LIFECYCLE_BROKER_PROVISIONING_REQUIREMENTS_V1
      .productionProvisioningPerformed, false);
    assert.equal(AUTONOMOUS_WORK_ORDER_LIFECYCLE_BROKER_PROVISIONING_REQUIREMENTS_V1
      .workspaceOwnedRawRootAllowed, false);
    assert.equal(AUTONOMOUS_WORK_ORDER_LIFECYCLE_BROKER_OS_REQUIREMENTS_V1.common
      .recursiveDeleteAllowed, false);
    assert.equal(AUTONOMOUS_WORK_ORDER_LIFECYCLE_BROKER_OS_REQUIREMENTS_V1.common
      .directoryDeleteAllowed, false);
  });
