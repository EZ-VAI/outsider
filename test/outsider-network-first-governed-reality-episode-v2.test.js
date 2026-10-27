import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import test from "node:test";

import {
  OUTSIDER_FIRST_GOVERNED_REALITY_EPISODE_V2_BOUNDARY,
  OUTSIDER_FIRST_GOVERNED_REALITY_EPISODE_V2_SCHEMAS,
  createOutsiderFirstGovernedRealityEpisodeCertificateV2,
  verifyOutsiderFirstGovernedRealityEpisodeCertificateV2,
} from "../src/outsider-network-first-governed-reality-episode-v2.js";
import {
  createFirstGovernedRealityEpisodeV2Fixture,
} from "./helpers/outsider-network-first-governed-reality-episode-v2-fixture.js";

function createCertificate(fixture) {
  return createOutsiderFirstGovernedRealityEpisodeCertificateV2(
    fixture.input, fixture.context);
}

function verifyCertificate(certificate, fixture, input = fixture.input) {
  return verifyOutsiderFirstGovernedRealityEpisodeCertificateV2(certificate, {
    input,
    expectedCertificateHash: certificate.certificateHash,
    ...fixture.context,
  });
}

test("v2 boundary separates pre-action declarations from outcome registers",
  () => {
    const boundary = OUTSIDER_FIRST_GOVERNED_REALITY_EPISODE_V2_BOUNDARY;
    assert.equal(boundary.affectedPartyRolesSeparated, true);
    assert.equal(
      boundary.laterObligationGenesisBindsPreActionDeclarationRootOnly, true);
    assert.equal(
      boundary.outcomeAffectedPartyRegisterIsLaterObservationCrosswalkOnly, true);
    assert.equal(boundary.outcomeAffectedPartyRegisterRewritesObligationGenesis,
      false);
    assert.equal(boundary.strictRegistrationGenesisExecutionOrderRequired, true);
    assert.equal(boundary.executionWithinProspectivePlannedWindowRequired, true);
    assert.equal(boundary.locallyReplayedTemporalOrderIsExternalTimingTruth, false);
    assert.equal(boundary.externalTimingTruthEstablished, false);
    assert.equal(boundary.sameEpisodeAttemptPathIsPartySetContinuityProof, false);
    assert.equal(boundary.sameAffectedPartySetEstablished, false);
    assert.equal(boundary.affectedPartyContinuityEstablished, false);
    assert.equal(
      boundary.outcomeRegisterSupersetOfPreActionDeclarationEstablished, false);
    assert.equal(boundary.affectedPartyCompletenessEstablished, false);
    assert.equal(boundary.affectedPartyStandingEstablished, false);
    assert.equal(boundary.independentOutcomeTruthEstablished, false);
    assert.equal(boundary.obligationClosureEstablished, false);
    assert.equal(boundary.authority, "NONE");
  });

test("v2 replays distinct role roots on one episode attempt path without continuity",
  (t) => {
    const fixture = createFirstGovernedRealityEpisodeV2Fixture(t);
    const beforeMembers = readdirSync(fixture.base.directory).sort();
    const certificate = createCertificate(fixture);
    const checked = verifyCertificate(certificate, fixture);

    assert.equal(certificate.schema,
      OUTSIDER_FIRST_GOVERNED_REALITY_EPISODE_V2_SCHEMAS.certificate);
    assert.equal(checked.ok, true, checked.error);
    const roles = certificate.affectedPartyRoleCrosswalk;
    assert.notEqual(roles.preActionAffectedPartyDeclarationRootHash,
      roles.outcomeAffectedPartyRegisterRootHash);
    assert.equal(roles.preActionAffectedPartyDeclarationRootHash,
      fixture.preActionAffectedPartyDeclaration.affectedPartyRootHash);
    assert.equal(roles.preActionAffectedPartyDeclarationRootHash,
      fixture.later.genesis.bindings.affectedPartyRootHash);
    assert.equal(roles.outcomeAffectedPartyRegisterRootHash,
      fixture.outcomeAffectedPartyRegister.affectedPartyRootHash);
    assert.equal(roles.outcomeAffectedPartyRegisterRootHash,
      fixture.v2Payload.affectedPartyRegisterRootHash);
    assert.equal(roles.preActionAffectedPartyCensusRoleHash,
      fixture.common.registrationHash);
    assert.equal(roles.outcomeAffectedPartyCensusRoleHash,
      fixture.foundation.censusProjection.projectionHash);
    assert.equal(roles.sameEpisodeHash, true);
    assert.equal(roles.sameAttemptHash, true);
    assert.equal(roles.sameGovernedRealityPath, true);
    assert.equal(roles.obligationGenesisContinuesToBindPreActionDeclarationRoot,
      true);
    assert.equal(roles.outcomeRegisterUsedAsLaterObservationCrosswalkOnly, true);
    assert.equal(roles.outcomeRegisterRewroteObligationGenesis, false);
    assert.equal(roles.sameCensusRoleEstablished, false);
    assert.equal(roles.sameAffectedPartySetEstablished, false);
    assert.equal(roles.affectedPartyContinuityEstablished, false);
    assert.equal(roles.outcomeRegisterSupersetOfPreActionDeclarationEstablished,
      false);
    assert.equal(roles.preActionAffectedPartyCompletenessEstablished, false);
    assert.equal(roles.outcomeAffectedPartyCompletenessEstablished, false);
    assert.equal(roles.affectedPartyStandingEstablished, false);
    const temporal = certificate.preActionTemporalCrosswalk;
    assert.equal(temporal.registeredAt, "2026-08-27T00:00:00.000Z");
    assert.equal(temporal.obligationGenesisCreatedAt,
      "2026-08-28T00:00:00.000Z");
    assert.equal(temporal.executedAt, "2026-08-28T00:00:00.001Z");
    assert.equal(temporal.registrationReferenceBoundToGenesis, true);
    assert.equal(temporal.registrationStrictlyPrecedesObligationGenesis, true);
    assert.equal(temporal.obligationGenesisStrictlyPrecedesExecution, true);
    assert.equal(temporal.executionWithinProspectivePlannedWindow, true);
    assert.equal(temporal.localCanonicalTemporalOrderReplayed, true);
    assert.equal(temporal.externalTimingTruthEstablished, false);
    assert.equal(certificate.structuralResult.independentOutcomeTruthEstablished,
      false);
    assert.equal(certificate.structuralResult.obligationClosureEstablished, false);
    assert.equal(certificate.authority, "NONE");
    assert.equal(certificate.actionReady, false);
    assert.equal(certificate.trainingRows, 0);
    assert.equal(certificate.causalExperienceUnits, 0);
    assert.equal(checked.preActionAffectedPartyDeclarationRootHash,
      roles.preActionAffectedPartyDeclarationRootHash);
    assert.equal(checked.outcomeAffectedPartyRegisterRootHash,
      roles.outcomeAffectedPartyRegisterRootHash);
    assert.equal(checked.sameAffectedPartySetEstablished, false);
    assert.equal(checked.affectedPartyContinuityEstablished, false);
    assert.equal(checked.outcomeRegisterSupersetOfPreActionDeclarationEstablished,
      false);
    assert.equal(checked.localCanonicalTemporalOrderVerified, true);
    assert.equal(checked.externalTimingTruthEstablished, false);
    assert.deepEqual(readdirSync(fixture.base.directory).sort(), beforeMembers,
      "certificate creation and verification must remain read-only");
  });

for (const [label, executionAt] of [
  ["equal-time", "2026-08-28T00:00:00.000Z"],
  ["post-action genesis", "2026-08-27T23:59:59.999Z"],
]) {
  test(`v2 rejects ${label} obligation-genesis/execution ordering`, (t) => {
    const fixture = createFirstGovernedRealityEpisodeV2Fixture(t, { executionAt });
    assert.throws(() => createCertificate(fixture),
      /PRE_ACTION_REGISTRATION_GENESIS_EXECUTION_STRICT_ORDER_INVALID/u);
    const checked = verifyOutsiderFirstGovernedRealityEpisodeCertificateV2({}, {});
    assert.equal(checked.localCanonicalTemporalOrderVerified, false);
    assert.equal(checked.externalTimingTruthEstablished, false);
    assert.equal(checked.independentOutcomeTruthEstablished, false);
    assert.equal(checked.authority, "NONE");
  });
}

test("v2 rejects an outcome register placed in the pre-action declaration role",
  (t) => {
    const fixture = createFirstGovernedRealityEpisodeV2Fixture(t);
    const certificate = createCertificate(fixture);
    const swapped = {
      ...fixture.input,
      preActionAffectedPartyDeclaration:
        fixture.input.outcomeAffectedPartyRegister,
    };
    const checked = verifyCertificate(certificate, fixture, swapped);
    assert.equal(checked.ok, false);
    assert.match(checked.error,
      /PRE_ACTION_AFFECTED_PARTY_DECLARATION_SUBJECT_CROSSWALK_INVALID/u);
    assert.equal(checked.sameAffectedPartySetEstablished, false);
    assert.equal(checked.independentOutcomeTruthEstablished, false);
    assert.equal(checked.obligationClosureEstablished, false);
    assert.equal(checked.authority, "NONE");
  });

test("v2 rejects a pre-action declaration placed in the outcome register role",
  (t) => {
    const fixture = createFirstGovernedRealityEpisodeV2Fixture(t);
    const certificate = createCertificate(fixture);
    const swapped = {
      ...fixture.input,
      outcomeAffectedPartyRegister:
        fixture.input.preActionAffectedPartyDeclaration,
    };
    const checked = verifyCertificate(certificate, fixture, swapped);
    assert.equal(checked.ok, false);
    assert.match(checked.error,
      /OUTCOME_AFFECTED_PARTY_REGISTER_REPLAY_INVALID/u);
    assert.equal(checked.affectedPartyContinuityEstablished, false);
    assert.equal(checked.independentOutcomeTruthEstablished, false);
    assert.equal(checked.obligationClosureEstablished, false);
    assert.equal(checked.authority, "NONE");
  });
