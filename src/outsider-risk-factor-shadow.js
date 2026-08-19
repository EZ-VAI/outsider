/*
 * Stage 0.5 -> frozen 36-factor risk vocabulary, in SHADOW mode only.
 *
 * The production risk schema lives in the historical Outsiderf research tree.
 * Stage 0.5 does not observe most of its authority, loss, severity, rollback, or
 * external-cohort fields.  This adapter therefore maps only facts that a sealed
 * supervised-experience/v2 record actually establishes and marks every other
 * factor unavailable.  It never imputes, prices, grants authority, or promotes
 * a model.
 */

import { createHash } from "node:crypto";
import { canonicalizeStrict } from "./canonical.js";
import { verifySupervisedExperienceV2 } from "./outsider-supervised-experience.js";

export const OUTSIDERF_RISK_SCHEMA_SNAPSHOT = Object.freeze({
  schemaId: "outsider_postgres_obligation_risk_factors_v1",
  schemaVersion: 1,
  schemaHash: "sha256:930172d45fd647a9c27de386b64cf29bd4b66bc0043ab122c8811f9d030ebbed",
  factorCount: 36,
});

export const RISK_FACTOR_IDS_V1 = Object.freeze([
  "semantic_closure_state", "ambiguity_marker_count", "constraint_density_ratio",
  "obligation_novelty_class", "change_surface_area_count", "dependency_depth",
  "statefulness_class", "temporal_sensitivity_class", "privilege_level",
  "resource_scope_breadth_count", "blast_radius_class", "reversibility_class",
  "executor_identity_stability", "model_runtime_change_count", "isolation_strength",
  "permission_alignment_ratio", "plan_mutation_rate", "contradiction_rate",
  "self_correction_latency_events", "verification_evasion_signal_count",
  "public_world_pass_ratio", "hidden_world_pass_ratio", "rollback_restoration_ratio",
  "evidence_coverage_ratio", "delegation_depth", "authority_contraction_ratio",
  "responsibility_acceptance_ratio", "unassigned_exposure_ratio",
  "telemetry_completeness_ratio", "randomized_probe_failure_ratio",
  "prompt_injection_exposure_count", "introspection_opacity_class",
  "outcome_cohort_maturity_count", "observed_incident_rate",
  "dependency_concentration_index", "correlated_failure_exposure_count",
]);

export const CRITICAL_RISK_FACTOR_IDS_V1 = Object.freeze([
  "semantic_closure_state", "privilege_level", "resource_scope_breadth_count",
  "blast_radius_class", "reversibility_class", "executor_identity_stability",
  "isolation_strength", "permission_alignment_ratio",
  "verification_evasion_signal_count", "public_world_pass_ratio",
  "hidden_world_pass_ratio", "rollback_restoration_ratio", "evidence_coverage_ratio",
  "authority_contraction_ratio", "responsibility_acceptance_ratio",
  "unassigned_exposure_ratio", "telemetry_completeness_ratio",
  "randomized_probe_failure_ratio", "dependency_concentration_index",
]);

const digest = (value) => `sha256:${createHash("sha256")
  .update(typeof value === "string" ? value : canonicalizeStrict(value)).digest("hex")}`;
const validHash = (value) => /^sha256:[a-f0-9]{64}$/.test(String(value ?? ""));
const groupKeyHash = (record) => digest(record.attestationCompatibility.groupKey);

function missing(factorId, now) {
  return { factorId, status: "missing", value: null, measurementQuality: "unavailable",
    sourceArtifactHashes: [], sourceKind: "not_observed_by_stage05", observedAt: now };
}

function measured(factorId, value, record, now, { status = "derived", sourceKind } = {}) {
  return { factorId, status, value, measurementQuality: "verified",
    sourceArtifactHashes: [record.recordHash, record.source.manifestHash].sort(),
    sourceKind, observedAt: now };
}

function closureObservation(record, now) {
  const label = record.learningLabels;
  if (label.deliveryResolved === true) {
    /* Observation-only Stage 0.5 closes the executable delivery contract, but
       does not establish that owner standing/authority/external liability is
       closed.  Hence partially_closed, never closed. */
    return measured("semantic_closure_state", "partially_closed", record, now,
      { sourceKind: "sealed_delivery_contract_only" });
  }
  if (["CONSERVATIVE_STOP", "CONTAINED_REJECTED", "UNFINALIZED"]
    .includes(record.terminal?.terminalClass)) {
    return measured("semantic_closure_state", "open", record, now,
      { sourceKind: "sealed_non_delivery_terminal" });
  }
  return missing("semantic_closure_state", now);
}

function correctionLatency(record, now) {
  const chain = record.causalChains?.find((item) => item.sealedComplete === true);
  if (!chain) return missing("self_correction_latency_events", now);
  const pause = chain.events?.find((event) => event.type === "boundary_paused")?.seq;
  const effect = chain.events?.find((event) => event.type === "effect_observed")?.seq;
  if (!Number.isSafeInteger(pause) || !Number.isSafeInteger(effect) || effect < pause) {
    return missing("self_correction_latency_events", now);
  }
  return measured("self_correction_latency_events", effect - pause, record, now,
    { sourceKind: "sealed_audited_intervention_event_distance" });
}

function telemetryCompleteness(record, now) {
  const pre = Number(record.hostCapacity?.toolBoundaries?.pre);
  const post = Number(record.hostCapacity?.toolBoundaries?.post);
  if (!Number.isSafeInteger(pre) || pre < 0 || !Number.isSafeInteger(post) || post < 0) {
    return missing("telemetry_completeness_ratio", now);
  }
  const ratio = Math.max(pre, post) === 0 ? 1 : Math.min(pre, post) / Math.max(pre, post);
  return measured("telemetry_completeness_ratio", ratio, record, now,
    { sourceKind: "sealed_stage05_pre_post_boundary_pairing" });
}

function vectorFor(record, cohortSize, now) {
  const byId = new Map([
    ["semantic_closure_state", closureObservation(record, now)],
    ["executor_identity_stability", measured("executor_identity_stability", "versioned",
      record, now, { sourceKind: "sealed_package_controller_and_way_hashes" })],
    ["self_correction_latency_events", correctionLatency(record, now)],
    ["telemetry_completeness_ratio", telemetryCompleteness(record, now)],
    ["outcome_cohort_maturity_count", measured("outcome_cohort_maturity_count", cohortSize,
      record, now, { sourceKind: "content_addressed_exact_group_count" })],
  ]);
  return RISK_FACTOR_IDS_V1.map((factorId) => byId.get(factorId) ?? missing(factorId, now));
}

function rate(rows, predicate) {
  return rows.length === 0 ? null : rows.filter(predicate).length / rows.length;
}

export function buildRiskFactorShadowMeasurement(records, { now = Date.now() } = {}) {
  if (!Array.isArray(records)) throw new Error("RISK_FACTOR_SHADOW_RECORDS_REQUIRED");
  if (!Number.isFinite(now)) throw new Error("RISK_FACTOR_SHADOW_TIME_INVALID");
  const accepted = [];
  const refused = [];
  const seen = new Set();
  for (const record of records) {
    const checked = verifySupervisedExperienceV2(record);
    if (!checked.ok) {
      refused.push({ recordHash: validHash(record?.recordHash) ? record.recordHash : null,
        reason: checked.error });
      continue;
    }
    if (seen.has(record.recordHash)) {
      refused.push({ recordHash: record.recordHash, reason: "DUPLICATE_RECORD_HASH" });
      continue;
    }
    seen.add(record.recordHash);
    accepted.push(record);
  }
  accepted.sort((a, b) => a.recordHash.localeCompare(b.recordHash));
  const groups = new Map();
  for (const record of accepted) {
    const hash = groupKeyHash(record);
    if (!groups.has(hash)) groups.set(hash, []);
    groups.get(hash).push(record);
  }
  const measurements = accepted.map((record) => {
    const groupHash = groupKeyHash(record);
    const vector = vectorFor(record, groups.get(groupHash).length, now);
    const missingIds = vector.filter((item) => item.status === "missing")
      .map((item) => item.factorId);
    return {
      recordHash: record.recordHash,
      sourceManifestHash: record.source.manifestHash,
      correlationGroupHash: groupHash,
      productVersion: record.attestationCompatibility.groupKey.productVersion,
      terminalClass: record.terminal.terminalClass,
      learningLabels: structuredClone(record.learningLabels),
      factors: vector,
      coverage: {
        measured: vector.length - missingIds.length,
        missing: missingIds.length,
        completenessRatio: (vector.length - missingIds.length) / vector.length,
        criticalMissing: CRITICAL_RISK_FACTOR_IDS_V1.filter((id) => missingIds.includes(id)),
      },
    };
  });
  const cohorts = [...groups.entries()].sort(([a], [b]) => a.localeCompare(b))
    .map(([hash, rows]) => ({
      correlationGroupHash: hash,
      nRuns: rows.length,
      /* These are supervised engineering outcomes, never incident/loss rates. */
      deliveryResolvedRate: rate(rows, (r) => r.learningLabels.deliveryResolved === true),
      outsiderCausalContributionRate: rate(rows,
        (r) => r.learningLabels.outsiderCausalContribution === true),
      correctionEffectEligibleRate: rate(rows,
        (r) => r.learningLabels.eligibleForCorrectionEffectLearning === true),
    }));
  const criticalMissing = [...new Set(measurements.flatMap((item) => item.coverage.criticalMissing))]
    .sort();
  const body = {
    schema: "outsider/risk-factor-shadow-measurement/v1",
    schemaVersion: 1,
    generatedAt: now,
    factorSchema: OUTSIDERF_RISK_SCHEMA_SNAPSHOT,
    boundary: {
      mode: "SHADOW_MEASUREMENT_ONLY",
      productionEligible: false,
      decision: "ABSTAIN_NO_ADMISSIBLE_L3_L4",
      noImputation: true,
      establishesIncidentLossSeverityFraudOrLiability: false,
      grantsExecutionAuthority: false,
      financialEffect: "none",
      price: null, coverage: null, capital: null,
    },
    corpus: {
      supplied: records.length,
      accepted: accepted.length,
      refused: refused.length,
      uniqueCorrelationGroups: groups.size,
      independentDomainCount: 0,
      evidenceLevel: "L1_LOCAL_VERIFIED_ENGINEERING",
    },
    factorCoverage: {
      total: RISK_FACTOR_IDS_V1.length,
      measuredFactorIds: [...new Set(measurements.flatMap((item) => item.factors
        .filter((factor) => factor.status !== "missing").map((factor) => factor.factorId)))].sort(),
      criticalMissing,
      productionHeadCanRun: false,
    },
    cohorts,
    measurements,
    refused,
  };
  return { ...body, reportHash: digest(body) };
}

export function verifyRiskFactorShadowMeasurement(report) {
  try {
    if (report?.schema !== "outsider/risk-factor-shadow-measurement/v1"
      || report.schemaVersion !== 1) throw new Error("RISK_FACTOR_SHADOW_SCHEMA_INVALID");
    const { reportHash, ...body } = report;
    if (reportHash !== digest(body)) throw new Error("RISK_FACTOR_SHADOW_HASH_INVALID");
    if (body.factorSchema?.schemaHash !== OUTSIDERF_RISK_SCHEMA_SNAPSHOT.schemaHash
      || body.factorSchema.factorCount !== 36) throw new Error("RISK_FACTOR_SCHEMA_MISMATCH");
    if (body.boundary?.productionEligible !== false
      || body.boundary?.grantsExecutionAuthority !== false
      || body.boundary?.financialEffect !== "none"
      || body.boundary?.price !== null || body.boundary?.coverage !== null
      || body.boundary?.capital !== null) throw new Error("RISK_FACTOR_SHADOW_BOUNDARY_CHANGED");
    if (body.factorCoverage?.productionHeadCanRun !== false
      || !Array.isArray(body.factorCoverage?.criticalMissing)
      || body.factorCoverage.criticalMissing.length === 0) {
      throw new Error("RISK_FACTOR_SHADOW_MISSINGNESS_INVALID");
    }
    for (const measurement of body.measurements ?? []) {
      if (!Array.isArray(measurement.factors) || measurement.factors.length !== 36
        || new Set(measurement.factors.map((item) => item.factorId)).size !== 36) {
        throw new Error("RISK_FACTOR_VECTOR_INVALID");
      }
      for (const factor of measurement.factors) {
        if (!RISK_FACTOR_IDS_V1.includes(factor.factorId)) throw new Error("RISK_FACTOR_UNKNOWN");
        if (factor.status === "missing" && (factor.value !== null
          || factor.measurementQuality !== "unavailable"
          || factor.sourceArtifactHashes.length !== 0)) {
          throw new Error("RISK_FACTOR_MISSINGNESS_IMPUTED");
        }
      }
    }
    return { ok: true, reportHash };
  } catch (error) {
    return { ok: false, error: String(error?.message ?? error) };
  }
}

