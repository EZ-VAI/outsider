import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { canonicalizeStrict } from "../src/canonical.js";
import {
  OUTSIDER_ONE_USE_COMMITMENTS_V1_BOUNDARY,
  OUTSIDER_ONE_USE_COMMITMENTS_V1_SCHEMAS,
  acceptStandingCapacityGrantV1,
  createExternalCapacityReceiptReferenceV1,
  createExternalCapacityReservationReceiptBindingV1,
  createOwnerOneUseMandateV1,
  createProviderOneUseAcceptanceV1,
  createStandingCapacityGrantInvitationV1,
  revokeStandingCapacityGrantV1,
  verifyOneUseCommitmentsV1,
  verifyOneUseCommitmentReferencesV1,
  verifyStandingCapacityGrantV1,
  verifyStandingCapacityGrantReferenceV1,
} from "../src/outsider-one-use-commitments-v1.js";

function h(label) {
  return `sha256:${createHash("sha256").update(label, "utf8").digest("hex")}`;
}

const COMMERCIAL_TERM = Object.freeze({
  quoteRefHash: h("quote"),
  currency: "USD",
  amountMinor: "12500",
});

function ownerInput(overrides = {}) {
  return {
    tenderHash: h("tender"),
    scopeHash: h("scope"),
    ownerPrincipalRefHash: h("owner"),
    delegationEnvelopeHash: h("delegation"),
    evidencePlanHash: h("evidence"),
    remedyPlanHash: h("remedy"),
    commercialTerm: { ...COMMERCIAL_TERM },
    issuedAt: "2026-09-02T00:00:00.000Z",
    expiresAt: "2026-09-02T01:00:00.000Z",
    oneUseNonceHash: h("owner-nonce"),
    response: "ACCEPT",
    signatureRefHash: h("owner-signature"),
    ...overrides,
  };
}

function providerInput(overrides = {}) {
  return {
    tenderHash: h("tender"),
    scopeHash: h("scope"),
    providerRefHash: h("provider"),
    evidencePlanHash: h("evidence"),
    remedyPlanHash: h("remedy"),
    commercialTerm: { ...COMMERCIAL_TERM },
    acceptedAt: "2026-09-02T00:01:00.000Z",
    expiresAt: "2026-09-02T01:00:00.000Z",
    oneUseNonceHash: h("provider-nonce"),
    response: "ACCEPT",
    signatureRefHash: h("provider-signature"),
    ...overrides,
  };
}

function pair(overrides = {}) {
  const ownerMandate = overrides.ownerMandate
    ?? createOwnerOneUseMandateV1(ownerInput(overrides.ownerInput));
  const providerAcceptance = overrides.providerAcceptance
    ?? createProviderOneUseAcceptanceV1(providerInput(overrides.providerInput));
  return { ownerMandate, providerAcceptance };
}

function verifyInput(overrides = {}) {
  const records = pair(overrides);
  return {
    expectedTenderHash: h("tender"),
    ownerMandate: records.ownerMandate,
    providerAcceptance: records.providerAcceptance,
    capacityReservationReceipt: null,
    observedAt: "2026-09-02T00:02:00.000Z",
    consumedNonceHashes: [],
    ...overrides.verify,
  };
}

function invitationInput(overrides = {}) {
  const provider = createProviderOneUseAcceptanceV1(providerInput());
  return {
    sourceTenderHash: h("tender"),
    sourceProviderAcceptanceHash: provider.providerAcceptanceHash,
    inviterRefHash: h("network-inviter"),
    providerRefHash: h("provider"),
    scopeHash: h("standing-scope"),
    capacityTermsHash: h("capacity-terms"),
    safetyEnvelopeHash: h("safety-envelope"),
    evidencePlanHash: h("standing-evidence"),
    remedyPlanHash: h("standing-remedy"),
    validFrom: "2026-09-02T01:00:00.000Z",
    validUntil: "2026-10-02T01:00:00.000Z",
    issuedAt: "2026-09-02T00:10:00.000Z",
    expiresAt: "2026-09-02T02:00:00.000Z",
    invitationNonceHash: h("invitation-nonce"),
    ...overrides,
  };
}

function standingRecords() {
  const invitation = createStandingCapacityGrantInvitationV1(invitationInput());
  const capacityGrant = acceptStandingCapacityGrantV1({
    invitation,
    acceptedAt: "2026-09-02T00:20:00.000Z",
    grantNonceHash: h("grant-nonce"),
    response: "ACCEPT",
    signatureRefHash: h("grant-signature"),
  });
  return { invitation, capacityGrant };
}

test("one-use records are canonical, immutable, and insulated from input mutation", () => {
  const input = ownerInput();
  const record = createOwnerOneUseMandateV1(input);
  const before = canonicalizeStrict(record);

  input.commercialTerm.amountMinor = "999999";
  input.response = "DECLINE";

  assert.equal(canonicalizeStrict(record), before);
  assert.equal(record.schema,
    OUTSIDER_ONE_USE_COMMITMENTS_V1_SCHEMAS.ownerMandate);
  assert.equal(record.commercialTerm.amountMinor, "12500");
  assert.equal(record.commercialTerm.source,
    "CALLER_SUPPLIED_QUOTED_COMMERCIAL_TERM");
  assert.equal(record.commercialTerm.amountOrPriceVerified, false);
  assert.equal(record.commercialTerm.priceAuthorityEstablished, false);
  assert.ok(Object.isFrozen(record));
  assert.ok(Object.isFrozen(record.commercialTerm));
  assert.match(record.ownerMandateHash, /^sha256:[a-f0-9]{64}$/u);
  assert.throws(() => { record.response = "DECLINE"; }, TypeError);
});

test("silence, non-affirmative responses, malformed amounts, and extra fields fail", () => {
  assert.throws(
    () => createOwnerOneUseMandateV1(ownerInput({ response: "" })),
    /EXPLICIT_ACCEPT_REQUIRED/u,
  );
  assert.throws(
    () => createProviderOneUseAcceptanceV1(providerInput({ response: "DECLINE" })),
    /EXPLICIT_ACCEPT_REQUIRED/u,
  );
  assert.throws(
    () => createProviderOneUseAcceptanceV1(providerInput({
      commercialTerm: { ...COMMERCIAL_TERM, amountMinor: "12.50" },
    })),
    /AMOUNT_MINOR_INVALID/u,
  );
  assert.throws(
    () => createOwnerOneUseMandateV1({ ...ownerInput(), silentDefault: true }),
    /FIELDS_INVALID/u,
  );
});

test("explicit acceptances never establish external capacity", () => {
  const verification = verifyOneUseCommitmentsV1(verifyInput());

  assert.equal(verification.ok, true);
  assert.equal(verification.explicitOwnerAcceptanceVerified, true);
  assert.equal(verification.explicitProviderAcceptanceVerified, true);
  assert.equal(verification.capacityReserved, false);
  assert.equal(verification.externalCapacityReceiptSupplied, false);
  assert.equal(verification.capacityReceiptReferenceStructurallyPresent, false);
  assert.equal(verification.externalCapacityEstablished, false);
  assert.equal(verification.formationState,
    "ONE_USE_BINDINGS_VERIFIED_CAPACITY_UNRESERVED_HOLD");
  assert.equal(verification.providerStandingEstablished, false);
  assert.equal(verification.oneUseAcceptanceCreatesStandingCapacity, false);
  assert.equal(verification.pricingAuthorityEstablished, false);
  assert.equal(verification.authority, "NONE");
  assert.equal(verification.actionReady, false);
  assert.equal(verification.executable, false);
  assert.ok(Object.isFrozen(verification));
});

test("an external receipt remains a structural reference, never actual capacity", () => {
  const records = pair();
  const receipt = createExternalCapacityReservationReceiptBindingV1({
    tenderHash: h("tender"),
    scopeHash: h("scope"),
    providerAcceptanceHash: records.providerAcceptance.providerAcceptanceHash,
    commercialTermHash:
      records.providerAcceptance.commercialTerm.commercialTermHash,
    externalSystemRefHash: h("external-system"),
    externalReservationRefHash: h("external-reservation"),
    externalReceiptArtifactHash: h("external-receipt-artifact"),
    issuedAt: "2026-09-02T00:01:30.000Z",
    reservedFrom: "2026-09-02T00:01:00.000Z",
    reservedUntil: "2026-09-03T00:30:00.000Z",
    status: "RESERVED",
    signatureRefHash: h("reservation-signature"),
  });
  const verification = verifyOneUseCommitmentsV1({
    ...verifyInput({
      ownerMandate: records.ownerMandate,
      providerAcceptance: records.providerAcceptance,
    }),
    capacityReservationReceipt: receipt,
  });

  assert.equal(verification.ok, true);
  assert.equal(verification.capacityReceiptReferenceStructurallyPresent, true);
  assert.equal(verification.capacityReservationWindowReferenceCurrent, true);
  assert.equal(verification.externalCapacityReceiptStructurallyVerified, true);
  assert.equal(verification.capacityReserved, false);
  assert.equal(verification.externalCapacityEstablished, false);
  assert.equal(verification.capacityReservationBasis,
    "NONE_STRUCTURAL_EXTERNAL_RECEIPT_REFERENCE_IS_NOT_CAPACITY_TRUTH");
  assert.equal(verification.externalCapacityReceiptAuthenticityEstablished, false);
  assert.equal(verification.signatureCryptographicallyVerified, false);
  assert.equal(verification.legalIdentityEstablished, false);
  assert.equal(verification.authorityEstablished, false);
  assert.equal(verification.actionReady, false);
});

test("a future reservation window reference is not current and fails closed", () => {
  const records = pair();
  const receipt = createExternalCapacityReservationReceiptBindingV1({
    tenderHash: h("tender"),
    scopeHash: h("scope"),
    providerAcceptanceHash: records.providerAcceptance.providerAcceptanceHash,
    commercialTermHash:
      records.providerAcceptance.commercialTerm.commercialTermHash,
    externalSystemRefHash: h("future-external-system"),
    externalReservationRefHash: h("future-external-reservation"),
    externalReceiptArtifactHash: h("future-external-receipt-artifact"),
    issuedAt: "2026-09-02T00:01:30.000Z",
    reservedFrom: "2026-09-02T00:30:00.000Z",
    reservedUntil: "2026-09-03T00:30:00.000Z",
    status: "RESERVED",
    signatureRefHash: null,
  });
  const verification = verifyOneUseCommitmentsV1({
    ...verifyInput({
      ownerMandate: records.ownerMandate,
      providerAcceptance: records.providerAcceptance,
    }),
    capacityReservationReceipt: receipt,
  });

  assert.equal(verification.ok, false);
  assert.equal(verification.capacityReceiptReferenceStructurallyPresent, false);
  assert.equal(verification.capacityReservationWindowReferenceCurrent, false);
  assert.equal(verification.capacityReserved, false);
  assert.equal(verification.externalCapacityEstablished, false);
  assert.match(verification.error, /CAPACITY_RESERVATION_WINDOW_NOT_YET_CURRENT/u);
});

test("tender, scope, evidence, remedy, term, expiry, and nonce replay fail closed", async (t) => {
  const cases = [
    ["tender mismatch", verifyInput({
      providerInput: { tenderHash: h("another-tender") },
    })],
    ["scope mismatch", verifyInput({
      providerInput: { scopeHash: h("larger-scope") },
    })],
    ["evidence mismatch", verifyInput({
      providerInput: { evidencePlanHash: h("different-evidence") },
    })],
    ["remedy mismatch", verifyInput({
      providerInput: { remedyPlanHash: h("different-remedy") },
    })],
    ["term mismatch", verifyInput({
      providerInput: {
        commercialTerm: { ...COMMERCIAL_TERM, amountMinor: "12501" },
      },
    })],
    ["expired", verifyInput({ verify: {
      observedAt: "2026-09-02T01:00:00.000Z",
    } })],
    ["owner nonce consumed", verifyInput({ verify: {
      consumedNonceHashes: [h("owner-nonce")],
    } })],
    ["nonces reused across records", verifyInput({
      providerInput: { oneUseNonceHash: h("owner-nonce") },
    })],
  ];

  for (const [name, input] of cases) {
    await t.test(name, () => {
      const verification = verifyOneUseCommitmentsV1(input);
      assert.equal(verification.ok, false);
      assert.equal(verification.formationState, "REJECTED_FAIL_CLOSED");
      assert.equal(verification.capacityReserved, false);
      assert.equal(verification.authority, "NONE");
      assert.equal(verification.actionReady, false);
      assert.match(verification.error, /^OUTSIDER_ONE_USE_COMMITMENTS_V1_/u);
    });
  }
});

test("missing owner or provider never becomes acceptance", () => {
  const records = pair();
  const missingOwner = verifyOneUseCommitmentsV1({
    ...verifyInput({ providerAcceptance: records.providerAcceptance }),
    ownerMandate: null,
  });
  const missingProvider = verifyOneUseCommitmentsV1({
    ...verifyInput({ ownerMandate: records.ownerMandate }),
    providerAcceptance: null,
  });
  assert.equal(missingOwner.ok, false);
  assert.equal(missingOwner.explicitOwnerAcceptanceVerified, false);
  assert.equal(missingProvider.ok, false);
  assert.equal(missingProvider.explicitProviderAcceptanceVerified, false);
});

test("invitation alone never auto-enrolls a completed provider", () => {
  const invitation = createStandingCapacityGrantInvitationV1(invitationInput());
  const verification = verifyStandingCapacityGrantV1({
    expectedScopeHash: h("standing-scope"),
    invitation,
    capacityGrant: null,
    revocation: null,
    observedAt: "2026-09-02T00:20:00.000Z",
  });

  assert.equal(invitation.status, "INVITED_AWAITING_EXPLICIT_PROVIDER_OPT_IN");
  assert.equal(invitation.completionAutoEnrollmentAllowed, false);
  assert.equal(invitation.standingCapacityGranted, false);
  assert.equal(verification.ok, true);
  assert.equal(verification.separateExplicitOptInVerified, false);
  assert.equal(verification.completionAutoEnrollmentUsed, false);
  assert.equal(verification.standingGrantReferenceStructurallyActive, false);
  assert.equal(verification.trustedLifecycleHeadVerified, false);
  assert.equal(verification.standingCapacityActive, false);
  assert.equal(verification.standingCapacityState,
    "INVITED_AWAITING_SEPARATE_EXPLICIT_OPT_IN");
});

test("a separate explicit grant is scope-bound, revocable, and not a reservation", () => {
  const { invitation, capacityGrant } = standingRecords();
  const active = verifyStandingCapacityGrantV1({
    expectedScopeHash: h("standing-scope"),
    invitation,
    capacityGrant,
    revocation: null,
    observedAt: "2026-09-02T01:30:00.000Z",
  });

  assert.equal(active.ok, true);
  assert.equal(active.separateExplicitOptInVerified, true);
  assert.equal(active.scopeBoundedToInvitation, true);
  assert.equal(active.safetyEnvelopeBoundedToInvitation, true);
  assert.equal(active.standingGrantReferenceStructurallyActive, true);
  assert.equal(active.standingCapacityEstablished, false);
  assert.equal(active.standingCapacityActive, false);
  assert.equal(active.trustedLifecycleHeadVerified, false);
  assert.equal(active.capacityReservedForAnyTender, false);
  assert.equal(active.authorityEstablished, false);
  assert.equal(active.actionReady, false);

  const revocation = revokeStandingCapacityGrantV1({
    invitation,
    capacityGrant,
    revokedAt: "2026-09-02T01:45:00.000Z",
    reasonCode: "PROVIDER_REQUEST",
    revocationNonceHash: h("revocation-nonce"),
    response: "REVOKE",
    signatureRefHash: h("revocation-signature"),
  });
  const revoked = verifyStandingCapacityGrantV1({
    expectedScopeHash: h("standing-scope"),
    invitation,
    capacityGrant,
    revocation,
    observedAt: "2026-09-02T01:46:00.000Z",
  });
  assert.equal(revoked.ok, true);
  assert.equal(revoked.standingGrantReferenceStructurallyActive, false);
  assert.equal(revoked.standingCapacityActive, false);
  assert.equal(revoked.standingCapacityState, "REVOKED");
  assert.ok(Object.isFrozen(revocation));
});

test("standing acceptance and revocation reject silence, expansion, and tampering", () => {
  const { invitation, capacityGrant } = standingRecords();
  assert.throws(() => acceptStandingCapacityGrantV1({
    invitation,
    acceptedAt: "2026-09-02T00:20:00.000Z",
    grantNonceHash: h("another-grant-nonce"),
    response: "",
    signatureRefHash: null,
  }), /EXPLICIT_ACCEPT_REQUIRED/u);
  assert.throws(() => revokeStandingCapacityGrantV1({
    invitation,
    capacityGrant,
    revokedAt: "2026-09-02T01:45:00.000Z",
    reasonCode: "PROVIDER_REQUEST",
    revocationNonceHash: h("revocation-nonce"),
    response: "",
    signatureRefHash: null,
  }), /EXPLICIT_REVOKE_REQUIRED/u);

  const expanded = structuredClone(capacityGrant);
  expanded.scopeHash = h("expanded-scope");
  const verification = verifyStandingCapacityGrantV1({
    expectedScopeHash: h("standing-scope"),
    invitation,
    capacityGrant: expanded,
    revocation: null,
    observedAt: "2026-09-02T01:30:00.000Z",
  });
  assert.equal(verification.ok, false);
  assert.equal(verification.standingCapacityActive, false);
  assert.equal(verification.standingCapacityState, "REJECTED_FAIL_CLOSED");
});

test("the fixed boundary refuses authority, auto-enrollment, and signature overclaim", () => {
  assert.equal(createExternalCapacityReceiptReferenceV1,
    createExternalCapacityReservationReceiptBindingV1);
  assert.equal(verifyOneUseCommitmentReferencesV1, verifyOneUseCommitmentsV1);
  assert.equal(verifyStandingCapacityGrantReferenceV1,
    verifyStandingCapacityGrantV1);
  assert.equal(OUTSIDER_ONE_USE_COMMITMENTS_V1_BOUNDARY.priceAuthorityEstablished,
    false);
  assert.equal(OUTSIDER_ONE_USE_COMMITMENTS_V1_BOUNDARY.autoEnrollmentAllowed,
    false);
  assert.equal(
    OUTSIDER_ONE_USE_COMMITMENTS_V1_BOUNDARY.signatureOrHashMintsAuthority,
    false,
  );
  assert.equal(
    OUTSIDER_ONE_USE_COMMITMENTS_V1_BOUNDARY.providerAcceptanceAloneReservesCapacity,
    false,
  );
  assert.equal(
    OUTSIDER_ONE_USE_COMMITMENTS_V1_BOUNDARY
      .capacityReceiptReferenceEstablishesActualCapacity,
    false,
  );
  assert.equal(
    OUTSIDER_ONE_USE_COMMITMENTS_V1_BOUNDARY
      .standingGrantReferenceEstablishesActualStandingCapacity,
    false,
  );
  assert.equal(OUTSIDER_ONE_USE_COMMITMENTS_V1_BOUNDARY.authority, "NONE");
  assert.ok(Object.isFrozen(OUTSIDER_ONE_USE_COMMITMENTS_V1_BOUNDARY));
});
