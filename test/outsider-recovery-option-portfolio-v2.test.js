import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { prepareOutcomeOsV1 } from "../src/outsider-three-layer-outcome-product-contract-v1.js";
import { prepareRecoveryOptionPortfolioV2, verifyRecoveryOptionPortfolioV2 }
  from "../src/outsider-recovery-option-portfolio-v2.js";
const h = value => `sha256:${createHash("sha256").update(value).digest("hex")}`;
const outcomeOs = prepareOutcomeOsV1({ requestIdHash: h("request"), outcomeProgramHash: null,
  outcomeDefinitionHash: h("outcome"), acceptancePredicateHash: h("acceptance"),
  formationDeadline: "2026-09-04T15:30:00.000Z", completionDeadline: "2026-09-05T15:00:00.000Z",
  maximumLossConstraintHash: h("loss"), typedGraphRefs: {
    principalEpochRefHash: h("principal"), accountableDeploymentRefHash: h("deployment"),
    runtimeRefHash: h("runtime"), embodimentRefHash: null, delegationRefHash: h("delegation"),
    episodeRefHash: h("episode"), attemptRefHash: h("attempt") } });
function option(role, label, domains, evidence = h(`evidence:${label}`), mechanism = "ROUTE_SUBSTITUTION") {
  return { optionRefHash: h(`option:${label}`), role, recoveryMechanismKind: mechanism,
    latestSafeExerciseAt: "2026-09-05T12:00:00.000Z",
    exerciseAuthorityRefHash: h(`authority:${label}`),
    exerciseInstructionRefHash: h(`exercise:${label}`), cancellationRefHash: h(`cancel:${label}`),
    exclusiveExerciseSemantics: "SINGLE_WRITER_PRIMARY_XOR_RECOVERY",
    failureDomainRefHashes: domains.map(h), failureDomainEvidenceRefHash: evidence };
}
function portfolio(primary, recoveries, observedAt = "2026-09-04T16:00:00.000Z") {
  return prepareRecoveryOptionPortfolioV2({ outcomeOs, observedAt,
    primaryOption: primary, recoveryOptions: recoveries });
}
test("distinct typed failure domains are eligible only for external replay, never held", () => {
  const value = portfolio(option("PRIMARY", "p", ["cloud-a", "pay-a"]),
    [option("RECOVERY", "r", ["cloud-b", "pay-b"], h("e:r"), "STATE_ROLLBACK")]);
  assert.equal(value.failureDomainRelationship, "PROVEN_DISTINCT");
  assert.equal(value.failureDomainPromotionEligible, true);
  assert.equal(value.recoveryOptionHeld, false);
  assert.equal(value.recoverableActive, false);
  assert.equal(value.layerTwoPromotionPermitted, false);
  assert.equal(value.authority, "NONE");
  assert.equal(verifyRecoveryOptionPortfolioV2(value).artifactHash, value.artifactHash);
});
test("shared domains block failure-domain promotion", () => {
  const value = portfolio(option("PRIMARY", "p", ["shared-api"]),
    [option("RECOVERY", "r", ["shared-api"], h("e:r"), "COMPENSATING_ACTION")]);
  assert.equal(value.failureDomainRelationship, "KNOWN_SHARED");
  assert.equal(value.failureDomainPromotionEligible, false);
  assert(value.gapCodes.includes("PRIMARY_RECOVERY_FAILURE_DOMAIN_SHARED"));
});
test("missing failure-domain evidence is UNKNOWN and cannot promote", () => {
  const value = portfolio(option("PRIMARY", "p", ["a"]),
    [option("RECOVERY", "r", ["b"], null)]);
  assert.equal(value.failureDomainRelationship, "UNKNOWN");
  assert.equal(value.failureDomainPromotionEligible, false);
  assert.equal(value.outcomeTruthEstablished, false);
  assert.equal(value.outcomeCommitIssued, false);
});
test("expired exercise window blocks an otherwise distinct portfolio", () => {
  const value = portfolio(option("PRIMARY", "p", ["a"]),
    [option("RECOVERY", "r", ["b"])], "2026-09-05T12:00:00.000Z");
  assert.equal(value.exerciseWindowOpen, false);
  assert.equal(value.failureDomainPromotionEligible, false);
});
