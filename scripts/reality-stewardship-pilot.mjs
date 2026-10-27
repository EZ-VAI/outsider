#!/usr/bin/env node

import { createHash } from "node:crypto";
import { open } from "node:fs/promises";
import { resolve } from "node:path";

import { canonicalizeStrict } from "../src/canonical.js";
import {
  assessRealityStewardship,
  buildConsequenceState,
  createConsequenceReport,
  createRealityBoundary,
  createRealityBudgetCommitment,
  createRealityExecutionReceipt,
  createStewardshipClaim,
  describeStewardshipGap,
} from "../src/outsider-reality-stewardship.js";

const pilotTokens = process.argv.slice(2);
if (pilotTokens.includes("--help") || pilotTokens.includes("-h")) {
  process.stdout.write("Usage: node scripts/reality-stewardship-pilot.mjs [--out <new-report.json>]\n");
  process.exit(0);
}
if (pilotTokens.length > 2 || (pilotTokens.length > 0 && pilotTokens[0] !== "--out")
  || (pilotTokens[0] === "--out" && (!pilotTokens[1] || pilotTokens[1].startsWith("--")))) {
  process.stderr.write("REALITY_STEWARDSHIP_PILOT_ARGUMENT_INVALID\n");
  process.exit(1);
}
const pilotOutput = pilotTokens[0] === "--out" ? pilotTokens[1] : null;

const h = (value) => `sha256:${createHash("sha256").update(String(value)).digest("hex")}`;
const at = (seconds) => new Date(Date.parse("2026-08-21T00:00:00.000Z")
  + seconds * 1_000).toISOString();

const partyA = h("pilot-affected-party-a");
const partyB = h("pilot-affected-party-b");
const boundary = createRealityBoundary({
  boundaryId: "stewardship-conformance-world",
  worldHash: h("pilot-world"), policyHash: h("pilot-policy"),
  resourceOwnerRootHash: h("pilot-owner"),
  affectedPartyRootHashes: [partyA, partyB],
  constraints: [
    { channelId: "consent", kind: "HARD_PROHIBITION", unit: "violations", cap: 0,
      aggregation: "CUMULATIVE_MAX", nonCompensable: true,
      affectedPartyRootHashes: [partyA] },
    { channelId: "shared-load", kind: "CUMULATIVE_CAP", unit: "impact-points", cap: 10,
      aggregation: "CUMULATIVE_MAX", nonCompensable: true,
      affectedPartyRootHashes: [partyA, partyB] },
  ],
  observationHorizons: [
    { horizonId: "immediate", closesAfterMs: 0, mandatory: true },
    { horizonId: "delayed", closesAfterMs: 1_000, mandatory: true },
  ],
  challengePolicyHash: h("pilot-challenge-policy"),
  recoveryStandardHash: h("pilot-recovery-standard"),
  validFrom: at(0), validUntil: at(100),
});

function claim(name, load) {
  return createStewardshipClaim({
    boundary, claimIdHash: h(name), wayHash: h("pilot-way"),
    claimantRootHash: h("pilot-claimant"), standingEvidenceHashes: [h("pilot-standing")],
    purpose: "WORK", operationHashes: [h("pilot-operation")],
    representedPartyRootHashes: [partyA, partyB],
    requestedExternalities: [
      { channelId: "consent", amount: 0 }, { channelId: "shared-load", amount: load },
    ],
    alternativesConsideredHashes: [h("pilot-simulation-alternative")],
    optionPreservationEvidenceHashes: [h("pilot-option-preservation")],
    recoveryPlanHash: h("pilot-recovery"),
    responsibilityRootHashes: [h("pilot-principal"), h("pilot-provider")],
    requestedAt: at(1), expiresAt: at(90),
  });
}

const first = claim("pilot-first", 6);
const firstAssessment = assessRealityStewardship({ boundary, claim: first, now: at(2) });
const firstCommitment = createRealityBudgetCommitment({
  boundary, claim: first,
  channelAmounts: [
    { channelId: "consent", amount: 0 }, { channelId: "shared-load", amount: 6 },
  ],
  commitmentEvidenceHash: h("pilot-first-use"), committedAt: at(3),
});
const second = claim("pilot-second", 5);
const cumulativeRefusal = assessRealityStewardship({
  boundary, claim: second,
  priorCommitmentEntries: [{ commitment: firstCommitment, claim: first }], now: at(4),
});

const execution = createRealityExecutionReceipt({
  boundary, claim: first, ownerGateReceiptHash: h("pilot-owner-gate-reference"),
  executionEvidenceHash: h("pilot-execution"), providerRootHash: h("pilot-provider"),
  responsibilityRootHashes: [...first.responsibilityRootHashes], executedAt: at(10),
});
const partyReports = (label, disposition = "OBSERVED") =>
  boundary.affectedPartyRootHashes.map((affectedPartyRootHash, index) => ({
    affectedPartyRootHash,
    reportHash: h(`${label}-${index}`),
    disposition,
  }));
const impactRows = (label, amounts = {}) => boundary.constraints.map(({ channelId }) => ({
  channelId,
  amount: amounts[channelId] ?? 0,
  measurementEvidenceHash: h(`${label}-${channelId}`),
}));
const immediate = createConsequenceReport({
  boundary, claim: first, execution, horizonId: "immediate", outcome: "SUCCESS",
  impactMeasurements: impactRows("pilot-immediate-impact"),
  affectedPartyReports: partyReports("pilot-immediate-party", "NO_REPORTED_IMPACT"),
  measurementEvidenceHashes: [h("pilot-immediate-result")], observedAt: at(10),
});
const immediateSuccessStillOpen = buildConsequenceState({
  boundary, claim: first, execution, reports: [immediate], now: at(10.5),
});
const delayed = createConsequenceReport({
  boundary, claim: first, execution, horizonId: "delayed", outcome: "PARTIAL",
  impactMeasurements: impactRows("pilot-delayed-impact", { "shared-load": 2 }),
  affectedPartyReports: partyReports("pilot-delayed-party"), recoveryStatus: "PENDING",
  recoveryStandardHash: boundary.recoveryStandardHash,
  measurementEvidenceHashes: [h("pilot-delayed-result")], observedAt: at(12),
});
const recoveryDue = buildConsequenceState({
  boundary, claim: first, execution, reports: [immediate, delayed], now: at(12),
});

const body = {
  schema: "outsider/reality-stewardship-pilot/v1",
  evidenceClass: "SYNTHETIC_PROTOCOL_CONFORMANCE",
  gapMap: describeStewardshipGap(),
  boundaryHash: boundary.boundaryHash,
  firstAssessment: {
    decision: firstAssessment.decision,
    executionAuthorized: firstAssessment.executionAuthorized,
    measurementTruthExternallyVerified: firstAssessment.measurementTruthExternallyVerified,
    affectedPartyReportsExternallyVerified:
      firstAssessment.affectedPartyReportsExternallyVerified,
    assessmentHash: firstAssessment.assessmentHash,
  },
  cumulativeRefusal: {
    decision: cumulativeRefusal.decision,
    assessmentHash: cumulativeRefusal.assessmentHash,
  },
  immediateSuccessStillOpen: {
    status: immediateSuccessStillOpen.status,
    obligationOpen: immediateSuccessStillOpen.obligationOpen,
    measurementTruthExternallyVerified:
      immediateSuccessStillOpen.measurementTruthExternallyVerified,
    affectedPartyReportsExternallyVerified:
      immediateSuccessStillOpen.affectedPartyReportsExternallyVerified,
    stateHash: immediateSuccessStillOpen.stateHash,
  },
  recoveryDue: {
    status: recoveryDue.status,
    obligationOpen: recoveryDue.obligationOpen,
    measurementTruthExternallyVerified: recoveryDue.measurementTruthExternallyVerified,
    affectedPartyReportsExternallyVerified:
      recoveryDue.affectedPartyReportsExternallyVerified,
    stateHash: recoveryDue.stateHash,
  },
  authority: "none",
  causalExperienceUnits: 0,
  financialEffect: "none",
};
const report = { ...body, reportHash: h(canonicalizeStrict(body)) };
const json = `${JSON.stringify(report, null, 2)}\n`;
if (pilotOutput) {
  const handle = await open(resolve(pilotOutput), "wx", 0o600);
  try { await handle.writeFile(json, "utf8"); } finally { await handle.close(); }
} else {
  process.stdout.write(json);
}
