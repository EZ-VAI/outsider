/*
 * HOLD-only composition between an action-admission request and a durable
 * Reality obligation.
 *
 * This module deliberately has no admission, execution, authority, closure,
 * or live-action branch.  A successful result means only that two independently
 * replayed local structures name the same subject and that the admission's
 * responsibility commitment was content-addressed to the exact obligation
 * genesis/state pair inspected by this verifier.
 */

import { createHash } from "node:crypto";

import { canonicalizeStrict } from "./canonical.js";
import {
  ACTION_ADMISSION_NO_AUTHORITY,
  verifyActionAdmissionRequest,
} from "./outsider-action-admission.js";
import { verifyRealityObligationStore } from "./outsider-reality-obligation-store.js";

export const ACTION_OBLIGATION_HOLD_COMPOSITION_SCHEMAS = Object.freeze({
  responsibilityBinding: "outsider/action-obligation-responsibility-binding/v1",
  verification: "outsider/action-obligation-hold-composition-verification/v1",
});

const HASH = /^sha256:[a-f0-9]{64}$/u;

function fail(code) {
  throw new TypeError(`ACTION_OBLIGATION_HOLD_COMPOSITION_${code}`);
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function exactObject(value, keys, code) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail(`${code}_PLAIN_DATA_OBJECT_REQUIRED`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    fail(`${code}_PLAIN_DATA_OBJECT_REQUIRED`);
  }
  const actual = Reflect.ownKeys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length
    || actual.some((key, index) => key !== expected[index])) {
    fail(`${code}_FIELDS_INVALID`);
  }
  canonicalizeStrict(value);
  return value;
}

function hash(value, code) {
  if (typeof value !== "string" || !HASH.test(value)) fail(`${code}_INVALID`);
  return value;
}

function digest(domain, value) {
  return `sha256:${createHash("sha256")
    .update(`${domain}\0${canonicalizeStrict(value)}`).digest("hex")}`;
}

function same(left, right) {
  return canonicalizeStrict(left) === canonicalizeStrict(right);
}

function subset(candidate, ceiling) {
  const allowed = new Set(ceiling);
  return candidate.every((item) => allowed.has(item));
}

/**
 * Derive the only responsibility reference accepted by the composition
 * verifier.  This is a content address, not evidence, authority, or a closure
 * receipt.  Any genesis or state change produces a different reference.
 */
export function deriveActionObligationResponsibilityRefHash(input = {}) {
  exactObject(input, ["genesisHash", "stateHash"], "RESPONSIBILITY_REF_INPUT");
  const binding = {
    schema: ACTION_OBLIGATION_HOLD_COMPOSITION_SCHEMAS.responsibilityBinding,
    genesisHash: hash(input.genesisHash, "GENESIS_HASH"),
    stateHash: hash(input.stateHash, "STATE_HASH"),
  };
  return digest(ACTION_OBLIGATION_HOLD_COMPOSITION_SCHEMAS.responsibilityBinding,
    binding);
}

function noAuthorityResult(error) {
  const result = {
    schema: ACTION_OBLIGATION_HOLD_COMPOSITION_SCHEMAS.verification,
    ok: false,
    structuralCompositionVerified: false,
    referenceIntegrityVerified: false,
    verificationLevel: "INVALID",
    decisionState: "HOLD",
    admitted: false,
    actionReady: false,
    executable: false,
    executionToken: null,
    authorityEstablished: false,
    liveActionConnected: false,
    authority: ACTION_ADMISSION_NO_AUTHORITY,
  };
  if (error !== undefined) result.error = error;
  return deepFreeze(result);
}

function requireNoObligationAuthority(snapshot) {
  if (snapshot.verification.sourceReplayComplete !== true
    || snapshot.verification.immutableEventChainConsistent !== true
    || snapshot.verification.testFixtureLedger !== false
    || snapshot.verification.externalClosureVerified !== false
    || snapshot.verification.productionClosureEstablished !== false
    || snapshot.verification.liveActionConnected !== false
    || snapshot.verification.actionReady !== false
    || snapshot.state.productionClosureEstablished !== false
    || snapshot.state.liveActionConnected !== false
    || snapshot.state.causalExperienceUnits !== 0
    || snapshot.state.obligationOutstanding !== true
    || snapshot.state.workflowOpen !== true
    || snapshot.state.status !== "PRECOMMITTED"
    || snapshot.revision !== 0
    || snapshot.state.revision !== 0
    || snapshot.state.lastEventHash !== snapshot.genesis.genesisHash
    || snapshot.state.genesisHash !== snapshot.genesis.genesisHash
    || snapshot.state.lastOccurredAt !== snapshot.genesis.createdAt) {
    fail("PRODUCTION_PRECOMMITTED_NO_AUTHORITY_OBLIGATION_REQUIRED");
  }
  const stateAuthority = snapshot.state.authority;
  const verificationAuthority = snapshot.verification.authority;
  for (const value of [stateAuthority.actionReady,
    stateAuthority.executionAuthorityEstablished,
    stateAuthority.obligationClosureAuthorityEstablished,
    stateAuthority.externalProviderAuthorityEstablished,
    stateAuthority.institutionalAuthorityEstablished,
    stateAuthority.callerAssertionsAcceptedAsAuthority,
    stateAuthority.callbackVerificationAccepted,
    verificationAuthority.actionReady,
    verificationAuthority.executionAuthorityEstablished,
    verificationAuthority.obligationClosureAuthorityEstablished,
    verificationAuthority.externalProviderAuthorityEstablished,
    verificationAuthority.institutionalAuthorityEstablished,
    verificationAuthority.callerAssertionsAcceptedAsAuthority,
    verificationAuthority.callbackVerificationAccepted]) {
    if (value !== false) fail("OBLIGATION_AUTHORITY_ESCALATION");
  }
}

function requireSameSubject(admission, obligation) {
  const admissionSubject = {
    claimHash: admission.bindings.claimWayWorld.claimHash,
    wayHash: admission.bindings.claimWayWorld.wayHash,
    worldHash: admission.bindings.claimWayWorld.worldHash,
    episodeHash: admission.bindings.run.episodeHash,
    attemptHash: admission.bindings.run.attemptHash,
    censusHash: admission.bindings.run.censusHash,
  };
  const obligationSubject = {
    claimHash: obligation.genesis.bindings.claimHash,
    wayHash: obligation.genesis.bindings.wayHash,
    worldHash: obligation.genesis.bindings.worldHash,
    episodeHash: obligation.genesis.bindings.episodeHash,
    attemptHash: obligation.genesis.bindings.attemptHash,
    censusHash: obligation.genesis.bindings.censusRegistrationHash,
  };
  if (!same(admissionSubject, obligationSubject)) fail("SUBJECT_BINDING_MISMATCH");
  return admissionSubject;
}

/**
 * Verify an exact, source-replayed, HOLD-only composition.
 *
 * `ok: true` is structural integrity only.  Both success and every failure
 * return HOLD with actionReady/executable/authorityEstablished=false.
 */
export function verifyActionObligationHoldComposition(input = {}) {
  try {
    exactObject(input, ["admissionRequest", "admissionSource",
      "expectedAdmissionRequestHash", "obligationDirectory",
      "expectedObligationGenesisHash", "expectedObligationStateHash"],
    "VERIFY_INPUT");
    if (typeof input.obligationDirectory !== "string" || input.obligationDirectory === "") {
      fail("OBLIGATION_DIRECTORY_REQUIRED");
    }

    const expectedAdmissionRequestHash = hash(input.expectedAdmissionRequestHash,
      "EXPECTED_ADMISSION_REQUEST_HASH");
    const expectedObligationGenesisHash = hash(input.expectedObligationGenesisHash,
      "EXPECTED_OBLIGATION_GENESIS_HASH");
    const expectedObligationStateHash = hash(input.expectedObligationStateHash,
      "EXPECTED_OBLIGATION_STATE_HASH");

    const admissionVerification = verifyActionAdmissionRequest(input.admissionRequest, {
      source: input.admissionSource,
      expectedAdmissionRequestHash,
    });
    if (!admissionVerification.ok) {
      fail(`ADMISSION_SOURCE_REPLAY_FAILED:${admissionVerification.error ?? "INVALID"}`);
    }
    if (input.admissionRequest.structuralChecksSatisfied !== true) {
      fail("ADMISSION_RADIUS_OR_COMMITMENT_COVERAGE_GAP");
    }

    const obligation = verifyRealityObligationStore(input.obligationDirectory);
    requireNoObligationAuthority(obligation);
    if (obligation.genesis.genesisHash !== expectedObligationGenesisHash) {
      fail("EXPECTED_OBLIGATION_GENESIS_HASH_MISMATCH");
    }
    if (obligation.stateHash !== expectedObligationStateHash) {
      fail("EXPECTED_OBLIGATION_STATE_HASH_MISMATCH");
    }

    const subjectBindings = requireSameSubject(input.admissionRequest, obligation);
    const requiredResponsibilityRefHash = deriveActionObligationResponsibilityRefHash({
      genesisHash: obligation.genesis.genesisHash,
      stateHash: obligation.stateHash,
    });
    const responsibilityCommitment = input.admissionSource?.responsibility?.commitment;
    if (responsibilityCommitment?.commitmentRefHash !== requiredResponsibilityRefHash) {
      fail("RESPONSIBILITY_COMMITMENT_OBLIGATION_BINDING_MISMATCH");
    }
    if (input.admissionRequest.responsibilityCommitmentHash
      !== responsibilityCommitment.responsibilityCommitmentHash) {
      fail("RESPONSIBILITY_COMMITMENT_HASH_MISMATCH");
    }
    const obligationHorizonCommitmentHashes = obligation.genesis.mandatoryHorizons
      .map(({ horizonCommitmentHash }) => horizonCommitmentHash);
    if (!subset(input.admissionRequest.consequenceEnvelope.affectedChannelHashes,
      obligation.genesis.consequenceChannelHashes)) {
      fail("CONSEQUENCE_CHANNEL_NOT_PRECOMMITTED_BY_OBLIGATION");
    }
    if (!subset(input.admissionRequest.consequenceEnvelope.horizonHashes,
      obligationHorizonCommitmentHashes)) {
      fail("CONSEQUENCE_HORIZON_NOT_PRECOMMITTED_BY_OBLIGATION");
    }
    if (Date.parse(input.admissionRequest.bindings.validity.evaluatedAt)
      < Date.parse(obligation.genesis.createdAt)) {
      fail("ADMISSION_EVALUATED_BEFORE_OBLIGATION_PRECOMMITMENT");
    }

    return deepFreeze({
      schema: ACTION_OBLIGATION_HOLD_COMPOSITION_SCHEMAS.verification,
      ok: false,
      structuralCompositionVerified: false,
      referenceIntegrityVerified: true,
      verificationLevel:
        "OPAQUE_REFERENCE_INTEGRITY_ONLY_RESPONSIBILITY_SEMANTICS_UNRESOLVED",
      subjectBindings,
      admission: {
        admissionRequestHash: input.admissionRequest.admissionRequestHash,
        responsibilityCommitmentHash:
          input.admissionRequest.responsibilityCommitmentHash,
        evaluatedAt: input.admissionRequest.bindings.validity.evaluatedAt,
        decisionState: "HOLD",
      },
      obligation: {
        obligationId: obligation.genesis.obligationId,
        genesisHash: obligation.genesis.genesisHash,
        stateHash: obligation.stateHash,
        revision: obligation.revision,
        status: obligation.state.status,
        responsibilityRefHash: requiredResponsibilityRefHash,
        obligationOutstanding: true,
      },
      checks: {
        admissionSourceReplayComplete: true,
        admissionStructuralChecksSatisfied: true,
        obligationSourceReplayComplete: true,
        productionObligationLedger: true,
        obligationPrecommitted: true,
        exactClaimWayWorldEpisodeAttemptCensus: true,
        responsibilityCommitmentOpaqueGenesisStateReferenceBound: true,
        affectedPartyRootSourceReplayed: false,
        responsibilityGraphSourceReplayed: false,
        consequenceChannelsBoundToObligationGenesis: true,
        mandatoryHorizonProjectionBound: true,
        consequenceEnvelopeSourceProjectedFromEffect: false,
        obligationAuthorityAbsent: true,
      },
      productionBlockers: [
        "AFFECTED_PARTY_ROOT_NOT_SOURCE_REPLAYED",
        "RESPONSIBILITY_GRAPH_NOT_SOURCE_REPLAYED",
        "CONSEQUENCE_ENVELOPE_NOT_SOURCE_PROJECTED_FROM_EFFECT",
        "EXTERNAL_AUTHORITY_VERIFIER_NOT_INTEGRATED",
        "OWNER_ADOPTION_AND_REVOCATION_NOT_SOURCE_REPLAYED_BY_THIS_COMPOSITION",
        "NO_RUNTIME_OR_LIVE_ACTION_BRIDGE_BY_DESIGN",
      ],
      decisionState: "HOLD",
      admitted: false,
      actionReady: false,
      executable: false,
      executionToken: null,
      authorityEstablished: false,
      liveActionConnected: false,
      authority: ACTION_ADMISSION_NO_AUTHORITY,
    });
  } catch (error) {
    return noAuthorityResult(error instanceof Error ? error.message : String(error));
  }
}
