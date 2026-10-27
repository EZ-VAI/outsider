/*
 * Physical simulation cohort -> global run census bridge.
 *
 * Registration deliberately accepts a frozen manifest and no trace payload.
 * Every manifest slot becomes its own outer census intake before a caller can
 * use the returned enrollment in the later report join. The bridge stores only
 * commitments and census registrations; source traces and projections never
 * enter its artifacts.
 */

import { createHash } from "node:crypto";
import { canonicalizeStrict } from "./canonical.js";
import {
  createCensusAnchorCommitment,
  defaultAnchorPolicy,
  registerCensusIntake,
  verifyCensusExternalAnchorBundle,
  verifyCensusRegistration,
  verifyRunCensus,
} from "./outsider-run-census.js";
import {
  verifyPhysicalSimulationCohortManifest,
  verifyPhysicalSimulationCohortReport,
} from "./outsider-physical-simulation-cohort.js";

export const PHYSICAL_COHORT_CENSUS_SCHEMAS = Object.freeze({
  selection: "outsider/physical-cohort-census-selection/v1",
  registration: "outsider/physical-cohort-census-registration/v1",
  enrollment: "outsider/physical-cohort-census-enrollment/v1",
  joinRow: "outsider/physical-cohort-census-join-row/v1",
  join: "outsider/physical-cohort-census-join/v1",
});

const EXPECTED_SLOT_COUNT = 20;
const HOST_CLASS = "outsider-physical-simulation-cohort";
const HASH = /^sha256:[a-f0-9]{64}$/u;

function fail(code) {
  throw new TypeError(`PHYSICAL_COHORT_CENSUS_${code}`);
}

function plain(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value, expected) {
  return plain(value)
    && Object.keys(value).sort().join("\0") === [...expected].sort().join("\0");
}

function deepFreeze(value) {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function digest(domain, value) {
  return `sha256:${createHash("sha256")
    .update(`outsider:physical-cohort-census:${domain}:v1\0`)
    .update(canonicalizeStrict(value)).digest("hex")}`;
}

function requireHash(value, code) {
  const normalized = String(value ?? "").toLowerCase();
  if (typeof value !== "string" || value !== normalized || !HASH.test(normalized)) {
    fail(`${code}_INVALID`);
  }
  return normalized;
}

function verifiedManifest(manifest) {
  const checked = verifyPhysicalSimulationCohortManifest(manifest);
  if (!checked.ok || checked.slotCount !== EXPECTED_SLOT_COUNT
    || !Array.isArray(manifest?.slots) || manifest.slots.length !== EXPECTED_SLOT_COUNT) {
    fail(`MANIFEST_INVALID:${checked.error ?? "EXACT_20_SLOTS_REQUIRED"}`);
  }
  return checked;
}

function selectionBody(manifest, slot) {
  return {
    schema: PHYSICAL_COHORT_CENSUS_SCHEMAS.selection,
    manifestHash: manifest.manifestHash,
    slotId: slot.slotId,
    slotOrdinal: slot.ordinal,
  };
}

export function physicalCohortCensusSelection(manifest, slot) {
  verifiedManifest(manifest);
  if (!manifest.slots.some((candidate) => candidate.slotId === slot?.slotId
    && candidate.ordinal === slot?.ordinal)) fail("SLOT_OUTSIDE_MANIFEST");
  const body = selectionBody(manifest, slot);
  return deepFreeze({ ...body, selectionCommitment: digest("selection", body) });
}

function intakeAsk(selection) {
  return canonicalizeStrict({
    schema: "outsider/physical-cohort-census-intake-goal/v1",
    manifestHash: selection.manifestHash,
    slotId: selection.slotId,
    slotOrdinal: selection.slotOrdinal,
    selectionCommitment: selection.selectionCommitment,
  });
}

function intakeRunId(selection) {
  return `physical-cohort-${selection.selectionCommitment.slice("sha256:".length)}`;
}

const REGISTRATION_FIELDS = Object.freeze([
  "schema", "ledgerId", "stateRootCommitment", "runOrdinal", "startEntrySeq",
  "startEntryHash", "runCommitment", "goalCommitment", "hostClass",
  "contractBinding", "trustBoundary", "registrationHash",
]);

function registrationSnapshot(registration) {
  const snapshot = Object.fromEntries(REGISTRATION_FIELDS
    .map((field) => [field, registration?.[field]]));
  if (!exactKeys(snapshot, REGISTRATION_FIELDS)
    || snapshot.schema !== "outsider/run-census-registration/v2"
    || snapshot.contractBinding !== null || snapshot.hostClass !== HOST_CLASS
    || !Number.isSafeInteger(snapshot.runOrdinal) || snapshot.runOrdinal < 1
    || !Number.isSafeInteger(snapshot.startEntrySeq) || snapshot.startEntrySeq < 1) {
    fail("REGISTRATION_SHAPE_INVALID");
  }
  for (const field of ["stateRootCommitment", "startEntryHash", "runCommitment",
    "goalCommitment", "registrationHash"]) requireHash(snapshot[field], field.toUpperCase());
  return snapshot;
}

function enrollmentPolicy() {
  return {
    expectedFrozenSlots: EXPECTED_SLOT_COUNT,
    oneOuterCensusIntakePerSlot: true,
    registrationInputAcceptsTracePayload: false,
    registrationPrecedesReportJoinByProtocol: true,
    parseRejectedSlotsRemainInDenominator: true,
    missingSlotsRemainInDenominator: true,
    openAndAbandonedCensusRunsRemainInDenominator: true,
    additionsReplacementsAndDuplicatesAllowed: false,
    disclosure: "COMMITMENT_ONLY_NO_TRACE_SOURCE_OR_PROJECTION",
  };
}

function enrollmentAuthority() {
  return {
    coverageScope: "EXACT_FROZEN_PHYSICAL_SIMULATION_MANIFEST_ONLY",
    completeRelativeToFrozenManifest: true,
    independentExternalPreselectionEstablished: false,
    externalTemporalOrderEstablished: false,
    globalCensusCompletenessEstablished: false,
    sourceExecutionObserved: false,
    physicalExecutionAuthorized: false,
    commandsExecuted: false,
    devicesAccessed: false,
    networkAccessed: false,
  };
}

function exactAnchor(stateRoot, prefixEntryCount) {
  return createCensusAnchorCommitment({ stateRoot, prefixEntryCount,
    policy: defaultAnchorPolicy() });
}

function enrollmentRow(manifest, slot, registration) {
  const selection = physicalCohortCensusSelection(manifest, slot);
  return {
    schema: PHYSICAL_COHORT_CENSUS_SCHEMAS.registration,
    manifestHash: manifest.manifestHash,
    slotId: slot.slotId,
    slotOrdinal: slot.ordinal,
    selectionCommitment: selection.selectionCommitment,
    censusRegistration: registrationSnapshot(registration),
  };
}

/**
 * Register all 20 frozen slots before any trace parsing. This function has no
 * trace/report parameter, so a parse rejection cannot prevent an intake from
 * first entering the real outer census. Exact replays are idempotent.
 */
export function registerPhysicalCohortCensus({ stateRoot, manifest } = {}) {
  if (typeof stateRoot !== "string" || stateRoot.length === 0) fail("STATE_ROOT_REQUIRED");
  verifiedManifest(manifest);

  const registrations = manifest.slots.map((slot) => {
    const selection = physicalCohortCensusSelection(manifest, slot);
    const registration = registerCensusIntake({
      stateRoot,
      runId: intakeRunId(selection),
      ask: intakeAsk(selection),
      host: HOST_CLASS,
    });
    return enrollmentRow(manifest, slot, registration);
  });

  const ordinals = registrations.map((row) => row.censusRegistration.runOrdinal);
  const startEntrySeqs = registrations.map((row) => row.censusRegistration.startEntrySeq);
  if (new Set(ordinals).size !== EXPECTED_SLOT_COUNT
    || new Set(startEntrySeqs).size !== EXPECTED_SLOT_COUNT
    || ordinals.some((ordinal, index) => index > 0 && ordinal !== ordinals[0] + index)) {
    fail("NON_CONTIGUOUS_OR_INTERLEAVED_OUTER_INTAKES");
  }
  const startAnchor = exactAnchor(stateRoot, startEntrySeqs[0] - 1);
  const endAnchor = exactAnchor(stateRoot, startEntrySeqs.at(-1));
  if (startAnchor.startedCount !== ordinals[0] - 1
    || endAnchor.startedCount !== ordinals.at(-1)
    || endAnchor.startedCount - startAnchor.startedCount !== EXPECTED_SLOT_COUNT) {
    fail("CENSUS_BOUNDARY_DOES_NOT_BIND_EXACT_20_INTAKES");
  }

  const body = {
    schema: PHYSICAL_COHORT_CENSUS_SCHEMAS.enrollment,
    manifestHash: manifest.manifestHash,
    ledgerId: registrations[0].censusRegistration.ledgerId,
    stateRootCommitment: registrations[0].censusRegistration.stateRootCommitment,
    startAnchor,
    endAnchor,
    registrations,
    policy: enrollmentPolicy(),
    authority: enrollmentAuthority(),
  };
  return deepFreeze({ ...body, enrollmentHash: digest("enrollment", body) });
}

function optionalIndependentAnchor(stateRoot, enrollment, independentAnchor) {
  if (independentAnchor == null) {
    return {
      verificationDecisionAccepted: false,
      builtInCryptographicVerification: false,
      cryptographicArtifactVerified: false,
      operatorRelationshipClaimed: null,
      operatorIndependenceEstablished: false,
      externalPreselectionEstablished: false,
      assurance: "NO_INDEPENDENT_EXTERNAL_ANCHOR_SUPPLIED",
      providerId: null,
      bundleHash: null,
      externalTemporalOrderRelativeToTraceEstablished: false,
    };
  }
  if (!plain(independentAnchor) || !plain(independentAnchor.bundle)
    || !plain(independentAnchor.trustPolicy)
    || !HASH.test(String(independentAnchor.trustedPolicyHash ?? ""))) {
    fail("INDEPENDENT_ANCHOR_INPUT_INVALID");
  }
  const checked = verifyCensusExternalAnchorBundle({
    stateRoot,
    bundle: independentAnchor.bundle,
    policy: independentAnchor.policy ?? defaultAnchorPolicy(),
    trustPolicy: independentAnchor.trustPolicy,
    trustedPolicyHash: independentAnchor.trustedPolicyHash,
    opensslPath: independentAnchor.opensslPath,
    scittVerifier: independentAnchor.scittVerifier,
  });
  if (!checked.ok || canonicalizeStrict(independentAnchor.bundle.commitment)
      !== canonicalizeStrict(enrollment.endAnchor)) {
    fail(`INDEPENDENT_ANCHOR_NOT_VERIFIED_FOR_ENROLLMENT:${checked.error ?? "PREFIX_MISMATCH"}`);
  }
  return {
    verificationDecisionAccepted:
      checked.verificationDecisionAccepted === true,
    builtInCryptographicVerification:
      checked.builtInCryptographicVerification === true,
    cryptographicArtifactVerified:
      checked.cryptographicArtifactVerified === true,
    operatorRelationshipClaimed:
      checked.operatorRelationshipClaimed ?? null,
    operatorIndependenceEstablished: false,
    externalPreselectionEstablished: false,
    assurance: checked.assurance,
    providerId: checked.providerId,
    bundleHash: checked.bundleHash,
    externalTemporalOrderRelativeToTraceEstablished: false,
  };
}

function enrollmentVerification({ stateRoot, manifest, enrollment,
  independentAnchor = null }) {
  verifiedManifest(manifest);
  if (!exactKeys(enrollment, ["schema", "manifestHash", "ledgerId",
    "stateRootCommitment", "startAnchor", "endAnchor", "registrations", "policy",
    "authority", "enrollmentHash"])) fail("ENROLLMENT_SHAPE_INVALID");
  const { enrollmentHash, ...body } = enrollment;
  if (enrollment.schema !== PHYSICAL_COHORT_CENSUS_SCHEMAS.enrollment
    || requireHash(enrollmentHash, "ENROLLMENT_HASH") !== digest("enrollment", body)
    || enrollment.manifestHash !== manifest.manifestHash
    || canonicalizeStrict(enrollment.policy) !== canonicalizeStrict(enrollmentPolicy())
    || canonicalizeStrict(enrollment.authority) !== canonicalizeStrict(enrollmentAuthority())
    || !Array.isArray(enrollment.registrations)
    || enrollment.registrations.length !== EXPECTED_SLOT_COUNT) {
    fail("ENROLLMENT_INVALID");
  }

  const census = verifyRunCensus(stateRoot);
  if (!census.ok) fail(`RUN_CENSUS_INVALID:${census.error}`);
  if (enrollment.ledgerId !== census.ledgerId
    || enrollment.stateRootCommitment !== census.stateRootCommitment) {
    fail("ENROLLMENT_LEDGER_BINDING_MISMATCH");
  }
  const startAnchor = exactAnchor(stateRoot, enrollment.startAnchor?.entryCount);
  const endAnchor = exactAnchor(stateRoot, enrollment.endAnchor?.entryCount);
  if (canonicalizeStrict(startAnchor) !== canonicalizeStrict(enrollment.startAnchor)
    || canonicalizeStrict(endAnchor) !== canonicalizeStrict(enrollment.endAnchor)) {
    fail("ENROLLMENT_ANCHOR_MISMATCH");
  }

  const slotIds = new Set();
  const registrationHashes = new Set();
  const ordinals = [];
  enrollment.registrations.forEach((row, index) => {
    const slot = manifest.slots[index];
    if (!exactKeys(row, ["schema", "manifestHash", "slotId", "slotOrdinal",
      "selectionCommitment", "censusRegistration"])
      || row.schema !== PHYSICAL_COHORT_CENSUS_SCHEMAS.registration
      || row.manifestHash !== manifest.manifestHash || row.slotId !== slot.slotId
      || row.slotOrdinal !== slot.ordinal || slotIds.has(row.slotId)) {
      fail("ENROLLMENT_SLOT_SET_INVALID");
    }
    slotIds.add(row.slotId);
    const selection = physicalCohortCensusSelection(manifest, slot);
    if (row.selectionCommitment !== selection.selectionCommitment) {
      fail("ENROLLMENT_SELECTION_COMMITMENT_MISMATCH");
    }
    const registration = registrationSnapshot(row.censusRegistration);
    if (registrationHashes.has(registration.registrationHash)) {
      fail("ENROLLMENT_REGISTRATION_DUPLICATE");
    }
    registrationHashes.add(registration.registrationHash);
    const checked = verifyCensusRegistration({
      stateRoot,
      registration,
      runId: intakeRunId(selection),
      ask: intakeAsk(selection),
      host: HOST_CLASS,
    });
    if (!checked.ok) fail(`ENROLLMENT_REGISTRATION_INVALID:${checked.error}`);
    ordinals.push(registration.runOrdinal);
  });
  if (ordinals.some((ordinal, index) => ordinal !== ordinals[0] + index)
    || enrollment.startAnchor.startedCount !== ordinals[0] - 1
    || enrollment.endAnchor.startedCount !== ordinals.at(-1)
    || enrollment.endAnchor.startedCount - enrollment.startAnchor.startedCount
      !== EXPECTED_SLOT_COUNT) {
    fail("ENROLLMENT_ORDINAL_BOUNDARY_MISMATCH");
  }
  return {
    enrollmentHash,
    census,
    independentAnchor: optionalIndependentAnchor(stateRoot, enrollment, independentAnchor),
  };
}

export function verifyPhysicalCohortCensusEnrollment(options = {}) {
  try {
    const checked = enrollmentVerification(options);
    return {
      ok: true,
      enrollmentHash: checked.enrollmentHash,
      manifestHash: options.enrollment.manifestHash,
      registeredSlots: EXPECTED_SLOT_COUNT,
      censusStartedCountAtEndBoundary: options.enrollment.endAnchor.startedCount,
      completeRelativeToFrozenManifest: true,
      externalAnchorVerificationDecisionAccepted:
        checked.independentAnchor.verificationDecisionAccepted,
      externalAnchorBuiltInCryptographicVerification:
        checked.independentAnchor.builtInCryptographicVerification,
      externalAnchorCryptographicArtifactVerified:
        checked.independentAnchor.cryptographicArtifactVerified,
      externalAnchorOperatorRelationshipClaimed:
        checked.independentAnchor.operatorRelationshipClaimed,
      externalAnchorOperatorIndependenceEstablished: false,
      externalPreselectionEstablished:
        checked.independentAnchor.externalPreselectionEstablished,
      externalAnchorAssurance: checked.independentAnchor.assurance,
      externalTemporalOrderRelativeToTraceEstablished: false,
      globalCensusCompletenessEstablished: false,
      rawTracePayloadStored: false,
    };
  } catch (error) {
    return { ok: false, error: String(error?.message ?? error) };
  }
}

function joinPolicy() {
  return {
    expectedRows: EXPECTED_SLOT_COUNT,
    joinSource: "VERIFIED_GLOBAL_RUN_CENSUS_AND_CANONICALLY_REPLAYED_COHORT_REPORT",
    reportRejectedAndMissingRowsRetained: true,
    censusOpenAndAbandonedRowsRetained: true,
    reportOutcomeCannotCreateSafeCensusTerminal: true,
    disclosure: "COMMITMENT_ONLY_NO_TRACE_SOURCE_OR_PROJECTION",
  };
}

function count(rows, predicate) {
  return rows.filter(predicate).length;
}

/**
 * Join a canonically replayed cohort report to the current census state. This
 * is read-only: it cannot turn a benchmark PASS into a SAFE census terminal.
 */
export function createPhysicalCohortCensusJoin({ stateRoot, manifest, enrollment,
  report, observations, independentAnchor = null } = {}) {
  const enrollmentChecked = enrollmentVerification({ stateRoot, manifest, enrollment,
    independentAnchor });
  const reportChecked = verifyPhysicalSimulationCohortReport(report,
    { manifest, observations });
  if (!reportChecked.ok || reportChecked.slotCount !== EXPECTED_SLOT_COUNT
    || report.manifestHash !== manifest.manifestHash) {
    fail(`REPORT_INVALID:${reportChecked.error ?? "EXACT_20_RESULTS_REQUIRED"}`);
  }
  const censusByCommitment = new Map(enrollmentChecked.census.runs
    .map((run) => [run.runCommitment, run]));
  const resultBySlot = new Map(report.results.map((result) => [result.slotId, result]));
  if (resultBySlot.size !== EXPECTED_SLOT_COUNT) fail("REPORT_SLOT_SET_INVALID");

  const rows = enrollment.registrations.map((registered) => {
    const result = resultBySlot.get(registered.slotId);
    const censusRun = censusByCommitment.get(registered.censusRegistration.runCommitment);
    if (!result || !censusRun
      || censusRun.runOrdinal !== registered.censusRegistration.runOrdinal) {
      fail("REPORT_CENSUS_JOIN_INCOMPLETE");
    }
    const terminal = censusRun.terminal;
    const resultCommitment = digest("cohort-result", result);
    const row = {
      schema: PHYSICAL_COHORT_CENSUS_SCHEMAS.joinRow,
      manifestHash: manifest.manifestHash,
      slotId: registered.slotId,
      slotOrdinal: registered.slotOrdinal,
      selectionCommitment: registered.selectionCommitment,
      censusOrdinal: censusRun.runOrdinal,
      censusRegistrationHash: registered.censusRegistration.registrationHash,
      reportDisposition: result.disposition,
      reportResultCommitment: resultCommitment,
      traceTerminalReason: result.terminalReason,
      censusTerminalStatus: terminal?.terminalStatus ?? "OPEN",
      censusTerminalEntryHash: terminal?.terminalEntryHash ?? null,
      censusTerminalEvidenceCommitment: terminal?.evidenceCommitment ?? null,
    };
    return { ...row, joinRowHash: digest("join-row", row) };
  });

  const summary = {
    frozenDenominatorSlots: EXPECTED_SLOT_COUNT,
    joinedRows: rows.length,
    reportAccepted: count(rows, (row) => row.reportDisposition === "ACCEPTED"),
    reportRejected: count(rows, (row) => row.reportDisposition === "REJECTED"),
    reportMissing: count(rows, (row) => row.reportDisposition === "MISSING"),
    censusOpen: count(rows, (row) => row.censusTerminalStatus === "OPEN"),
    censusAbandoned: count(rows, (row) => row.censusTerminalStatus === "ABANDONED"),
    censusBlocked: count(rows, (row) => row.censusTerminalStatus === "BLOCKED"),
    censusUnfinalized: count(rows, (row) => row.censusTerminalStatus === "UNFINALIZED"),
    censusSafe: count(rows, (row) => row.censusTerminalStatus === "SAFE"),
    omittedFrozenSlots: EXPECTED_SLOT_COUNT - rows.length,
  };
  const body = {
    schema: PHYSICAL_COHORT_CENSUS_SCHEMAS.join,
    manifestHash: manifest.manifestHash,
    enrollmentHash: enrollment.enrollmentHash,
    reportHash: report.reportHash,
    censusHeadEntryHash: enrollmentChecked.census.headEntryHash,
    rows,
    summary,
    policy: joinPolicy(),
    authority: {
      completeRelativeToFrozenManifest: rows.length === EXPECTED_SLOT_COUNT,
      externalAnchorVerificationDecisionAccepted:
        enrollmentChecked.independentAnchor.verificationDecisionAccepted,
      externalAnchorBuiltInCryptographicVerification:
        enrollmentChecked.independentAnchor.builtInCryptographicVerification,
      externalAnchorCryptographicArtifactVerified:
        enrollmentChecked.independentAnchor.cryptographicArtifactVerified,
      externalAnchorOperatorRelationshipClaimed:
        enrollmentChecked.independentAnchor.operatorRelationshipClaimed,
      externalAnchorOperatorIndependenceEstablished: false,
      independentExternalPreselectionEstablished:
        false,
      externalAnchorAssurance: enrollmentChecked.independentAnchor.assurance,
      externalTemporalOrderRelativeToTraceEstablished: false,
      globalCensusCompletenessEstablished: false,
      physicalSafetyEstablished: false,
      successClaimAuthorized: false,
      censusMutationPerformed: false,
      rawTracePayloadStored: false,
    },
  };
  return deepFreeze({ ...body, joinHash: digest("join", body) });
}

export function verifyPhysicalCohortCensusJoin(join, options = {}) {
  try {
    const replayed = createPhysicalCohortCensusJoin(options);
    if (canonicalizeStrict(replayed) !== canonicalizeStrict(join)) {
      fail("JOIN_CANONICAL_REPLAY_MISMATCH");
    }
    return {
      ok: true,
      joinHash: join.joinHash,
      joinedRows: EXPECTED_SLOT_COUNT,
      omittedFrozenSlots: 0,
      externalPreselectionEstablished:
        false,
      externalAnchorVerificationDecisionAccepted:
        join.authority.externalAnchorVerificationDecisionAccepted,
      externalAnchorBuiltInCryptographicVerification:
        join.authority.externalAnchorBuiltInCryptographicVerification,
      externalAnchorCryptographicArtifactVerified:
        join.authority.externalAnchorCryptographicArtifactVerified,
      externalAnchorOperatorRelationshipClaimed:
        join.authority.externalAnchorOperatorRelationshipClaimed,
      externalAnchorOperatorIndependenceEstablished: false,
      globalCensusCompletenessEstablished: false,
      physicalSafetyEstablished: false,
      rawTracePayloadStored: false,
    };
  } catch (error) {
    return { ok: false, error: String(error?.message ?? error) };
  }
}
