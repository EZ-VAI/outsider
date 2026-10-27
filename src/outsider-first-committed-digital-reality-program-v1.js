/*
 * The first production milestone is intentionally a small outcome exercising
 * the full general path: two independent execution routes, an independently
 * reserved observer, a dependency graph, failover, and lifecycle cleanup.
 * Nothing in the OutcomeProgram compiler is specific to publishing a page.
 */

import { compileOutcomeProgramV1 }
  from "./outsider-outcome-program-v1.js";

export function createFirstCommittedDigitalRealityProgramV1(input) {
  const observationWindowMs = input.observationWindowMs ?? 600_000;
  return compileOutcomeProgramV1({
    programId: input.programId,
    orderId: input.orderId,
    createdAt: input.createdAt,
    formationDeadline: input.formationDeadline,
    completionDeadline: input.completionDeadline,
    tenderHash: input.tenderHash ?? null,
    outcome: {
      statement: input.statement
        ?? "Publish the exact artifact over public HTTPS, obtain exact-range provider-reported zero downtime for the committed interval, and independently re-observe the exact result at the horizon.",
      acceptance: [
        {
          criterionId: "public_https_status",
          comparator: "EQUALS",
          subject: "independently observed HTTPS status",
          expected: 200,
        },
        {
          criterionId: "artifact_body_hash",
          comparator: "MATCHES_HASH",
          subject: "independently observed response body",
          expected: input.artifactHash,
        },
        {
          criterionId: "availability_window",
          comparator: "PROVIDER_REPORTED_ZERO_DOWNTIME_FOR_MS",
          subject: "reserved longitudinal witness exact-range statistics for the accepted public route, corroborated by an independent exact-response observation at the horizon",
          expected: observationWindowMs,
        },
      ],
      budget: {
        currency: input.currency ?? "USD",
        maximumAmountMinor: input.maximumAmountMinor ?? "0",
      },
    },
    requirements: [
      {
        requirementId: "primary_publication",
        role: "PRIMARY",
        capability: "PUBLIC_HTTPS_ARTIFACT_PUBLICATION",
        constraints: {
          artifactHash: input.artifactHash,
          maximumAmountMinor: input.maximumAmountMinor ?? "0",
          distinctFailureDomainFrom: "recovery_publication",
        },
        minimumReservationMs: observationWindowMs,
        dependsOnRequirementIds: [],
      },
      {
        requirementId: "recovery_publication",
        role: "RECOVERY",
        capability: "PUBLIC_HTTPS_ARTIFACT_PUBLICATION",
        constraints: {
          artifactHash: input.artifactHash,
          maximumAmountMinor: input.maximumAmountMinor ?? "0",
          distinctFailureDomainFrom: "primary_publication",
        },
        minimumReservationMs: observationWindowMs,
        dependsOnRequirementIds: [],
      },
      {
        requirementId: "independent_http_witness",
        role: "INDEPENDENT_WITNESS",
        capability: "PUBLIC_HTTPS_LONGITUDINAL_EXACT_RESPONSE_OBSERVATION",
        constraints: {
          expectedStatus: 200,
          expectedBodyHash: input.artifactHash,
          observationWindowMs,
          evidenceMode:
            "RESERVED_WITNESS_EXACT_RANGE_ZERO_DOWNTIME_PLUS_INDEPENDENT_HORIZON_EXACT_RESPONSE",
          longitudinalStatsOperation:
            "PROVIDER_GET_EXACT_RANGE_UPTIME_STATS",
          exactEndpointOperation: "INDEPENDENT_HTTP_EXACT_RESPONSE_AT_HORIZON",
          providerReportedAvailabilityOnly: true,
          continuousAvailabilityClaimed: false,
          observeAllReservedRoutes: true,
          cannotShareOperatorWith: [
            "primary_publication",
            "recovery_publication",
          ],
        },
        minimumReservationMs: observationWindowMs,
        dependsOnRequirementIds: [
          "primary_publication",
          "recovery_publication",
        ],
      },
    ],
    nodes: [
      {
        nodeId: "publish_result",
        kind: "EFFECT",
        dependsOn: [],
        primaryRequirementId: "primary_publication",
        recoveryRequirementId: "recovery_publication",
        witnessRequirementId: "independent_http_witness",
        input: { artifactHash: input.artifactHash },
        acceptance: ["public_https_status", "artifact_body_hash"],
      },
      {
        nodeId: "sustain_and_observe",
        kind: "OBSERVATION",
        dependsOn: ["publish_result"],
        primaryRequirementId: "primary_publication",
        recoveryRequirementId: "recovery_publication",
        witnessRequirementId: "independent_http_witness",
        input: { observationWindowMs },
        acceptance: ["availability_window"],
      },
      {
        nodeId: "close_episode",
        kind: "CHECKPOINT",
        dependsOn: ["sustain_and_observe"],
        primaryRequirementId: null,
        recoveryRequirementId: null,
        witnessRequirementId: "independent_http_witness",
        input: { requireAllAcceptanceCriteria: true },
        acceptance: [
          "public_https_status",
          "artifact_body_hash",
          "availability_window",
        ],
      },
    ],
    obligations: [
      {
        obligationId: "remove_primary_artifact",
        trigger: "ALWAYS",
        targetRequirementId: "primary_publication",
        nodeId: "publish_result",
        action: "REMOVE_EPHEMERAL_ARTIFACT",
        input: {},
        deadline: input.cleanupDeadline,
      },
      {
        obligationId: "remove_recovery_artifact",
        trigger: "ALWAYS",
        targetRequirementId: "recovery_publication",
        nodeId: "publish_result",
        action: "REMOVE_EPHEMERAL_ARTIFACT",
        input: {},
        deadline: input.cleanupDeadline,
      },
      {
        obligationId: "release_witness_reservation",
        trigger: "ALWAYS",
        targetRequirementId: "independent_http_witness",
        nodeId: null,
        action: "RELEASE_OBSERVATION_CAPACITY",
        input: {},
        deadline: input.cleanupDeadline,
      },
    ],
    zeroInternalOps: {
      staffTouchLimit: 0,
      humanQueueFallback: false,
    },
  });
}
