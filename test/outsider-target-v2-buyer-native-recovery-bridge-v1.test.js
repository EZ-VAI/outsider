import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { bridgeTargetV2ToBuyerNativeRecoveryV1 } from
  "../scripts/outsider-target-v2-buyer-native-recovery-bridge-v1.mjs";

const projection = JSON.parse(readFileSync(new URL(
  "../.outsider/private/target-exact-spec-eta-live-v2-20260905-d22b2e1b4d86607aeaf9cb0ce2caa01f/route-evidence.public-projection.v2.json",
  import.meta.url)));

test("real Target v2 maps exact/partial/structured/unreserved into hard rejection", () => {
  const { evidence, decision, validUntil } = bridgeTargetV2ToBuyerNativeRecoveryV1(projection);
  assert.equal(evidence.schema, "outsider/buyer-native-route-evidence/v1");
  assert.equal(evidence.validUntil, validUntil);
  assert.deepEqual(Object.fromEntries(Object.entries(evidence.facts)
    .map(([name, fact]) => [name, fact.status])), {
    specification: "MATCH", allInPrice: "PARTIAL", eta: "STRUCTURED",
    capacity: "UNRESERVED" });
  assert.equal(decision.admittedCandidateCount, 0);
  const assessment = decision.assessments[0];
  assert.equal(assessment.gates.frozenSpecificationSatisfied, true);
  assert.equal(assessment.gates.structuredEtaWithinDeadline, true);
  assert.equal(assessment.gates.completeAllInPriceWithinBudget, false);
  assert.equal(assessment.gates.ownerLifecycleCapacityCurrentAndCoveringOutcome, false);
  assert.deepEqual(assessment.gapCodes, ["ALL_IN_PRICE_INCOMPLETE",
    "CAPACITY_LIFECYCLE_REFERENCE_MISSING", "CAPACITY_NOT_RESERVED",
    "CAPACITY_OWNER_LIFECYCLE_SOURCE_REPLAY_REQUIRED"]);
  assert.equal(assessment.admissionDecision, "REJECTED_FROM_RECOVERY_PORTFOLIO");
  assert.equal(assessment.outcomeCommitIssued, false);
});
