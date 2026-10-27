/*
 * Outsider stage-readiness gap ledger.
 *
 * This module is an audit and sequencing surface.  It deliberately cannot
 * manufacture external evidence, institutional independence, legal standing,
 * capital, custody, adjudication or payment authority from caller booleans.
 *
 * Generic callers may register a hash-only external submission.  Registration
 * never changes a gap from BLOCKED_EXTERNAL.  A future external verifier must
 * be a source-aware, policy-pinned adapter with its own implementation and
 * tests; there is intentionally no generic `trusted: true` escape hatch here.
 */

import { createHash } from "node:crypto";
import { canonicalizeStrict } from "./canonical.js";
import {
  describeStage2ProgressProjectionBoundary,
} from "./outsider-stage2-progress-boundary.js";

export const READINESS_GAP_SCHEMAS = Object.freeze({
  ledger: "outsider/readiness-gap-ledger/v2",
  externalSubmission: "outsider/readiness-external-submission/v1",
  stage3Candidate: "outsider/stage3-guarantee-bridge-candidate/v1",
  stage4Candidate: "outsider/stage4-settlement-bridge-candidate/v1",
});

export const GAP_CATEGORIES = Object.freeze([
  "INTERNAL_ENGINEERING",
  "EXTERNAL_PLATFORM_CAPABILITY",
  "EXTERNAL_EVIDENCE",
  "EXTERNAL_INSTITUTION_AUTHORITY",
]);

export const GAP_STATUSES = Object.freeze([
  "SATISFIED_INTERNAL",
  "OPEN_INTERNAL",
  "BLOCKED_EXTERNAL",
]);

export const STAGES = Object.freeze([
  Object.freeze({ id: 0.5, key: "MEASURE" }),
  Object.freeze({ id: 1, key: "ATTEST" }),
  Object.freeze({ id: 1.5, key: "CURATE" }),
  Object.freeze({ id: 2, key: "PRICE" }),
  Object.freeze({ id: 3, key: "GUARANTEE" }),
  Object.freeze({ id: 4, key: "SETTLE" }),
]);

const HASH = /^sha256:[a-f0-9]{64}$/;
const TOKEN = /^[A-Za-z0-9][A-Za-z0-9._:+/-]{0,159}$/;
const CATEGORY = new Set(GAP_CATEGORIES);
const STATUS = new Set(GAP_STATUSES);
const STAGE = new Map(STAGES.map((stage) => [stage.key, stage]));

function fail(code) { throw new Error(code); }

function plain(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function exactKeys(value, keys) {
  return plain(value)
    && Object.keys(value).sort().join("\0") === [...keys].sort().join("\0");
}

function token(value, code) {
  if (typeof value !== "string" || !TOKEN.test(value)) fail(code);
  return value;
}

function hash(value, code) {
  if (typeof value !== "string" || !HASH.test(value)) fail(code);
  return value;
}

function iso(value, code) {
  if (typeof value !== "string" || value.length > 40 || !Number.isFinite(Date.parse(value))) {
    fail(code);
  }
  const normalized = new Date(value).toISOString();
  if (normalized !== value) fail(code);
  return normalized;
}

function digest(domain, value) {
  return `sha256:${createHash("sha256")
    .update(`${domain}\0${canonicalizeStrict(value)}`).digest("hex")}`;
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function clone(value) { return JSON.parse(JSON.stringify(value)); }

function internal(stage, gapId, title, status, closureEvidence, dependsOn = []) {
  return {
    gapId, stage, category: "INTERNAL_ENGINEERING",
    closureScope: "LOCAL_CLOSABLE",
    status,
    title,
    closureEvidence,
    acceptedClosureInterface: "REPOSITORY_IMPLEMENTATION_PLUS_SOURCE_AWARE_TEST",
    genericCallerBooleanAccepted: false,
    dependsOn,
  };
}

function external(stage, category, gapId, title, requiredArtifact, verifierId,
  dependsOn = []) {
  return {
    gapId, stage, category,
    closureScope: "EXTERNAL_BLOCKED",
    status: "BLOCKED_EXTERNAL",
    title,
    closureEvidence: requiredArtifact,
    acceptedClosureInterface: `REGISTERED_SOURCE_AWARE_VERIFIER_ONLY:${verifierId}`,
    genericCallerBooleanAccepted: false,
    dependsOn,
  };
}

/*
 * Snapshot of the current 2026-08-22 evidence tree.  "SATISFIED_INTERNAL"
 * means only that the named local mechanism and its verifier exist.
 * It never means production-ready, externally true or authoritative.
 */
const GAP_DEFINITIONS = Object.freeze([
  internal("MEASURE", "S05_CLAUDE_COWORK_CONTROLLED_LOOP",
    "Claude Code/Cowork attached control, sealed evidence and fail-closed recovery",
    "SATISFIED_INTERNAL",
    "src/outsider-kernel-controller.js + Stage 0.5 release/conformance suites"),
  internal("MEASURE", "S05_CODEX_CONTROL_READINESS_AND_RECEIPT_FRONTIER",
    "Codex hook readiness, production receipt emission and source-bound lifecycle verifier",
    "SATISFIED_INTERNAL",
    "src/outsider-codex-control-evidence.js plus the attached receipt emitter and zero-model tests"),
  internal("MEASURE", "S05_PROVIDER_NEUTRAL_RUNTIME_COVERAGE",
    "Provider-neutral capability classification, evidence adaptation and fail-visible unsupported routing",
    "SATISFIED_INTERNAL",
    "src/outsider-worker-adapter.js plus Claude/Codex/DeepSeek provider replays"),
  internal("MEASURE", "S05_CONSENTED_CONTRIBUTION_PIPELINE",
    "Explicit per-run privacy projection, signed receipt, revocation and quarantine intake",
    "SATISFIED_INTERNAL",
    "src/outsider-experience-contribution.js and its source-replay tests"),
  external("MEASURE", "EXTERNAL_EVIDENCE", "S05_CURRENT_ARTIFACT_R1_R5_CONFORMANCE",
    "Fresh R1-R5 evidence for one immutable current package",
    "preregistered current-package R1-R5 artifact set", "stage05-current-release-conformance"),
  external("MEASURE", "EXTERNAL_EVIDENCE", "S05_EXTERNAL_USER_REPOSITORIES_AND_SECOND_MACHINES",
    "Runs on unrelated repositories and machines",
    "signed run/evidence sets from unrelated operators and a second machine",
    "stage05-external-operator-replay"),
  external("MEASURE", "EXTERNAL_EVIDENCE", "S05_CORRECTION_EFFECT_AND_FALSE_INTERRUPTION_RATES",
    "Measured compliance/effect and clean-run interruption rates outside founder fixtures",
    "preregistered intervention/control observations with independent outcomes",
    "stage05-field-effect-study"),
  external("MEASURE", "EXTERNAL_PLATFORM_CAPABILITY",
    "S05_CODEX_NATIVE_ITEM_BINDING_AND_CORRECTION_DELIVERY",
    "Codex exposes an authenticated exact item binding and a verifiable correction-delivery channel",
    "vendor-host lifecycle frames binding one hook receipt to one native item and model-visible correction",
    "codex-native-control-capability"),
  external("MEASURE", "EXTERNAL_PLATFORM_CAPABILITY",
    "S05_OTHER_WORKER_NATIVE_CONTROL_SURFACES",
    "Each additional AI worker exposes an authenticated pre-action gate and lifecycle/outcome surface",
    "provider-specific authenticated controller envelopes and native lifecycle receipts",
    "worker-native-control-capability"),

  internal("ATTEST", "S1_ATTEST_V2_D1_D2_SOURCE_REPLAY",
    "ATTEST v2 exact run verification, D1 disclosure and D2 grouping",
    "SATISFIED_INTERNAL",
    "src/outsider-stage05-evidence.js plus exact source replay"),
  internal("ATTEST", "S1_DURABLE_CORPUS_REGISTRY",
    "Append-only signed corpus registry with source-aware verification",
    "SATISFIED_INTERNAL",
    "src/outsider-corpus-registry.js and source-bound intake verifiers"),
  internal("ATTEST", "S1_LIFECYCLE_PROVIDER_INTERFACE_AND_LOCAL_POLICY",
    "Revocation, timestamp, membership, retention and key-rotation provider interface",
    "SATISFIED_INTERNAL",
    "src/outsider-stage1-lifecycle-frontier.js and provider failure/replay tests"),
  internal("ATTEST", "S1_SEALED_SOURCE_REVERIFY_AT_INTAKE",
    "Reverification of the original sealed Stage 0.5 run at central intake",
    "SATISFIED_INTERNAL",
    "operator-side exact replay receipt bound to the sealed run; no external trust implied"),
  external("ATTEST", "EXTERNAL_EVIDENCE", "S1_REAL_CONTRIBUTED_RUNS",
    "Non-fixture consented user contributions in the live registry",
    "signed retained contribution records and gateway receipts", "stage1-live-contribution-replay",
    ["S05_CONSENTED_CONTRIBUTION_PIPELINE"]),
  external("ATTEST", "EXTERNAL_EVIDENCE", "S1_THIRD_PARTY_CHAIN_VERIFICATION",
    "A third party independently verifies the exact submitted chain",
    "external verifier receipt over an ATTEST/corpus root", "stage1-third-party-verifier"),
  external("ATTEST", "EXTERNAL_INSTITUTION_AUTHORITY",
    "S1_EXTERNALLY_GOVERNED_TRUST_TIME_RIGHTS_REGISTRY",
    "Externally governed signer, timestamp, rights and revocation policy",
    "governance policy, membership proof, key history and rights basis",
    "stage1-governed-trust-registry"),

  internal("CURATE", "S15_HISTORICAL_SOURCE_ADAPTERS",
    "Pinned public agent/robot source replay and descriptive quarantine",
    "SATISFIED_INTERNAL",
    "12,370 full-source identities plus a separate 272-row metadata-only quarantine"),
  internal("CURATE", "S15_SYNTHETIC_PROSPECTIVE_PROTOCOL",
    "Prospective preregistration/assignment/execution/adjudication protocol conformance",
    "SATISFIED_INTERNAL",
    "src/outsider-prospective-physical-simulation.js; CEU remains zero"),
  internal("CURATE", "S15_DEVICE_STREAM_AND_PHYSICS_FRONTIER",
    "Format-neutral device-stream contract and DROID retrospective adapter frontier",
    "SATISFIED_INTERNAL",
    "v1 DoD: format-neutral contract plus DROID retrospective full-source adapter conformance; concrete ROSBAG2/MCAP parsers are explicitly unimplemented future adapters outside this satisfied scope"),
  internal("CURATE", "S15_LEARNING_REUSE_ENFORCEMENT",
    "Local model-update candidate ingress enforcing rights, validity domain and reuse externality",
    "SATISFIED_INTERNAL",
    "src/outsider-ceu-reuse-frontier.js; it emits a candidate decision and performs no training"),
  internal("CURATE", "S15_GLOBAL_CEU_DEDUP_LEDGER",
    "Local signed causal-experience-unit duplicate-credit and reuse ledger",
    "SATISFIED_INTERNAL",
    "src/outsider-ceu-reuse-frontier.js with identity/semantic/correlation dedup and conflict tests"),
  internal("CURATE", "S15_CAUSAL_JUDGE_SURVIVAL_INSTRUMENT",
    "Preregistered, correlation-safe survival instrument for semantic causal hypotheses",
    "SATISFIED_INTERNAL",
    "src/outsider-causal-judge-survival.js; the formal pilot has zero authoritative measured denominator"),
  external("CURATE", "EXTERNAL_EVIDENCE", "S15_REAL_PROSPECTIVE_DEVICE_CONTROLS",
    "Prospective control/intervention executions on a real device",
    "preregistered assignments, real executions and control outcomes", "stage15-real-device-causal-replay",
    ["S15_DEVICE_STREAM_AND_PHYSICS_FRONTIER"]),
  external("CURATE", "EXTERNAL_EVIDENCE",
    "S15_INDEPENDENT_OUTCOME_SENSING_AND_PLATFORM_PARAMETERS",
    "Independently sensed outcomes and engineer-reviewed platform bounds",
    "sensor-root receipts and signed platform parameter review", "stage15-independent-sensing"),
  external("CURATE", "EXTERNAL_EVIDENCE", "S15_DATASET_AND_EXPERIENCE_RIGHTS_EVIDENCE",
    "Verified rights to create, use and reuse the exact experience",
    "source/object/subject-specific rights and attribution evidence", "stage15-rights-evidence"),
  external("CURATE", "EXTERNAL_INSTITUTION_AUTHORITY", "S15_DEVICE_ACQUISITION_ROOT",
    "Externally administered device/acquisition identity root",
    "hardware/workload identity, key history and acquisition policy", "stage15-device-trust-root"),
  external("CURATE", "EXTERNAL_INSTITUTION_AUTHORITY",
    "S15_OWNER_AFFECTED_PARTY_EXPERIMENT_GOVERNANCE",
    "Resource-owner adoption and affected-party/experiment oversight",
    "owner gate policy, standing register, consent/representation and challenge process",
    "stage15-experiment-governance"),
  external("CURATE", "EXTERNAL_INSTITUTION_AUTHORITY", "S15_RIGHTS_REUSE_GOVERNANCE",
    "Institution capable of enforcing experience reuse and revocation",
    "adopted model-update policy and externally governed rights/revocation registry",
    "stage15-reuse-governance"),
  external("CURATE", "EXTERNAL_EVIDENCE", "S15_REAL_CAUSAL_JUDGE_SURVIVAL_EVIDENCE",
    "Prospective, independently adjudicated survival observations for preregistered causal hypotheses",
    "complete planned tests, randomized/control assignments, device executions and independent outcomes",
    "stage15-causal-judge-survival-replay",
    ["S15_CAUSAL_JUDGE_SURVIVAL_INSTRUMENT"]),

  internal("PRICE", "S2_LOSS_EXPOSURE_QUARANTINE",
    "Signed complete-window loss/exposure intake with fraud/adjudication gates",
    "SATISFIED_INTERNAL",
    "src/outsider-loss-exposure-evidence.js; all current trust entries remain conformance-only"),
  internal("PRICE", "S2_SOURCE_BOUND_FACTOR_SHADOW",
    "Source-bound mechanism dictionary and retrospective proxy predictive shadow",
    "SATISFIED_INTERNAL",
    "six-source empirical factor/taxonomy ledger plus actuarial/factor shadows; proxy outcomes only and PRICE=false"),
  internal("PRICE", "S2_RMA_SOURCE_DOMAIN_HISTORICAL_LOSS_COST_PROTOTYPE",
    "Pinned RMA source-domain historical loss-cost indication with no target quote",
    "SATISFIED_INTERNAL",
    "src/outsider-stage2-rma-shadow-pricing.js final-v2; publisher-recorded indemnity is nonzero while targetQuotedPrice=null and pricePermission=false"),
  internal("PRICE", "S2_UNIFIED_TYPED_PRICING_PROGRESS_PROJECTION",
    "Typed source-domain progress projection separated from target premium, quote and permission",
    "SATISFIED_INTERNAL",
    "src/outsider-stage2-progress-projection.js; references real-loss/CAS diagnostics without numeric pooling and is not a Stage3 quote input",
    ["S2_RMA_SOURCE_DOMAIN_HISTORICAL_LOSS_COST_PROTOTYPE"]),
  internal("PRICE", "S2_PREACTION_RISK_INSTRUMENT",
    "Versioned pre-action factor policy, temporal validation and explicit missing masks",
    "SATISFIED_INTERNAL",
    "src/outsider-stage2-quote-frontier.js; current real observations remain missing"),
  internal("PRICE", "S2_FREQUENCY_SEVERITY_MODEL",
    "Frequency/severity/censoring admission and fail-closed abstention model interface",
    "SATISFIED_INTERNAL",
    "Stage2 quote frontier plus loss/exposure and actuarial shadow model gates"),
  internal("PRICE", "S2_PORTFOLIO_DEPENDENCE_AND_DRIFT",
    "Dependence, accumulation, drift and holdout admission interface",
    "SATISFIED_INTERNAL",
    "Stage2 quote frontier binds disclosed dependence roots and abstains without validation"),
  internal("PRICE", "S2_EXACT_CROSS_STAGE_PRICE_BRIDGE",
    "Legacy exact ATTEST/CURATE/stewardship/loss/model non-binding target quote frontier",
    "SATISFIED_INTERNAL",
    "historical diagnostic source-replayed quote candidate with model card, validity domain and fixed ABSTAIN authority; not the typed current Stage2 progress projection",
    ["S1_ATTEST_V2_D1_D2_SOURCE_REPLAY", "S2_LOSS_EXPOSURE_QUARANTINE"]),
  external("PRICE", "EXTERNAL_EVIDENCE", "S2_COMPLETE_ZERO_LOSS_EXPOSURE_WINDOWS",
    "Prospective complete exposure denominators including zero-loss windows",
    "partner population manifests and closed exposure windows", "stage2-exposure-window-replay"),
  external("PRICE", "EXTERNAL_EVIDENCE", "S2_ADJUDICATED_ECONOMIC_LOSS_SEVERITY",
    "Observed monetary severity with fraud review and closed appeal",
    "claim/accounting/invoice/ledger evidence and independent adjudication",
    "stage2-economic-loss-replay"),
  external("PRICE", "EXTERNAL_EVIDENCE", "S2_EXTERNAL_HOLDOUT_AND_CORRELATION_VALIDATION",
    "Temporal/customer/operator holdout and independent dependence validation",
    "frozen external evaluation and correlation study", "stage2-external-model-validation"),
  external("PRICE", "EXTERNAL_EVIDENCE", "S2_PROSPECTIVE_PREACTION_FACTOR_STREAM",
    "Complete prospectively timestamped factors observed before consequential execution",
    "source-replayed pre-action factor snapshots with missingness and execution bindings",
    "stage2-preaction-factor-replay",
    ["S2_PREACTION_RISK_INSTRUMENT"]),
  external("PRICE", "EXTERNAL_INSTITUTION_AUTHORITY", "S2_INDEPENDENT_ACTUARIAL_REVIEW",
    "Qualified actuary reviews model, tails, capital and wording in writing",
    "signed review tied to exact implementation/model/data versions", "stage2-actuarial-review"),
  external("PRICE", "EXTERNAL_INSTITUTION_AUTHORITY", "S2_EXTERNAL_ADJUDICATION_FRAUD_TRUST",
    "Externally governed adjudication and fraud-review institutions",
    "institutional identities, conflict policy, revocation and appeal governance",
    "stage2-adjudication-governance"),
  external("PRICE", "EXTERNAL_INSTITUTION_AUTHORITY", "S2_LEGAL_PRODUCT_CLASSIFICATION",
    "Jurisdiction-specific classification of quote, warranty, guarantee and insurance boundaries",
    "counsel memorandum bound to exact product and jurisdiction", "stage2-legal-classification"),

  internal("GUARANTEE", "S3_GUARANTEE_CANDIDATE_BRIDGE",
    "Fail-closed hash-bound candidate bridge that can only HOLD",
    "SATISFIED_INTERNAL",
    "buildStage3GuaranteeBridgeCandidate in this module; never binding"),
  internal("GUARANTEE", "S3_SOURCE_REPLAYED_BINDING_GATE",
    "Source-replay every Stage 1/2/stewardship input before external binding review",
    "SATISFIED_INTERNAL",
    "registered source-aware verifiers; no arbitrary pricing or provenance objects",
    ["S2_EXACT_CROSS_STAGE_PRICE_BRIDGE"]),
  internal("GUARANTEE", "S3_LOCAL_ATOMIC_REFERENCE_REQUEST_LEDGER",
    "Atomic local reference-request accounting, aggregate limits, expiry, revocation and rotation",
    "SATISFIED_INTERNAL",
    "src/outsider-stage3-guarantee-gate.js; no reserve or custody is established"),
  internal("GUARANTEE", "S3_LOCAL_ONE_USE_BEFORE_STATE_CAPABILITY_FRONTIER",
    "One-use, expiring, before-state-bound local capability presentation frontier",
    "SATISFIED_INTERNAL",
    "src/outsider-stage3-guarantee-gate.js; owner adoption and resource writes remain false"),
  internal("GUARANTEE", "S3_LOCAL_NONWAIVABLE_RECOVERY_CONTINUITY_INVARIANTS",
    "Local responsibility and recovery continuity across coverage, provider and diet changes",
    "SATISFIED_INTERNAL",
    "Stage3 gate plus Reality/Stage34 invariants; no legal right or executable remedy is created"),
  external("GUARANTEE", "EXTERNAL_EVIDENCE", "S3_REAL_FUNDED_SHADOW_PILOT",
    "One exact externally contracted and funded pilot",
    "contract, reserve/custody acknowledgement and exact pilot evidence", "stage3-funded-pilot-replay"),
  external("GUARANTEE", "EXTERNAL_EVIDENCE", "S3_GATE_BYPASS_REVOCATION_FAILURE_EVIDENCE",
    "Live evidence that bypass, revocation and fail-closed paths work",
    "preregistered owner-gate conformance and failure-injection receipts", "stage3-owner-gate-conformance"),
  external("GUARANTEE", "EXTERNAL_INSTITUTION_AUTHORITY", "S3_STANDING_ISSUER_AND_LEGAL_AUTHORITY",
    "A real issuer with jurisdiction-specific standing and authority",
    "verified entity, licence/contract authority, jurisdiction and key governance", "stage3-issuer-standing"),
  external("GUARANTEE", "EXTERNAL_INSTITUTION_AUTHORITY", "S3_RESOURCE_OWNER_ADOPTION",
    "The real resource owner adopts Outsider as an enforcement precondition",
    "owner policy and credential topology proving alternative ordinary writes are removed",
    "stage3-owner-adoption"),
  external("GUARANTEE", "EXTERNAL_INSTITUTION_AUTHORITY", "S3_CAPITAL_CUSTODY_POLICY_COUNTERPARTIES",
    "Capital provider, custodian, issuer and beneficiary are real counterparties",
    "binding policy, funded reserve, custody, limits and role-governance evidence",
    "stage3-capital-custody"),
  external("GUARANTEE", "EXTERNAL_INSTITUTION_AUTHORITY", "S3_AFFECTED_PARTY_STANDING_POLICY_TERMS",
    "Affected-party standing, exclusions, challenge and recovery terms are adopted",
    "signed policy wording and standing/challenge/recovery governance", "stage3-policy-standing"),

  internal("SETTLE", "S4_SETTLEMENT_CANDIDATE_BRIDGE",
    "Fail-closed settlement candidate that never moves funds or closes reality",
    "SATISFIED_INTERNAL",
    "buildStage4SettlementBridgeCandidate in this module; permanent HOLD boundary"),
  internal("SETTLE", "S4_CLAIM_REPLAY_DEDUP_IDEMPOTENCY",
    "Source-replayed claim identity, coverage trigger, deduplication and idempotency",
    "SATISFIED_INTERNAL",
    "append-only claims ledger preventing replay of evidence or instructions"),
  internal("SETTLE", "S4_APPEAL_REOPENING_STATE_MACHINE",
    "Adjudication, fraud, appeal, amendment and reopening lifecycle",
    "SATISFIED_INTERNAL",
    "policy-bound state machine preserving original and corrected outcomes"),
  internal("SETTLE", "S4_PAYMENT_RESTORATION_SEPARATION",
    "Payment, technical recovery, restoration and obligation closure remain separate",
    "SATISFIED_INTERNAL",
    "distinct records and gates; payment can never set restoration/closure true"),
  internal("SETTLE", "S4_LOCAL_RESERVE_ACCOUNTING_AND_RECEIPT_FRONTIER",
    "Atomic local aggregate accounting, one-use nonce and configured-signature receipt frontier",
    "SATISFIED_INTERNAL",
    "src/outsider-stage4-claims-lifecycle-frontier.js; no capital, custody or payment is established"),
  internal("SETTLE", "S4_DELAYED_CONSEQUENCE_RECOVERY_BINDING",
    "Delayed horizons, affected-party reports, recovery and systemic obligations bind settlement",
    "SATISFIED_INTERNAL",
    "exact Reality Stewardship consequence state and externally reopenable closure path"),
  external("SETTLE", "EXTERNAL_EVIDENCE", "S4_REAL_EXECUTION_LOSS_CLAIM",
    "One real covered execution and loss claim",
    "execution receipt, trigger evidence, economic fact and stable claim identity", "stage4-claim-replay"),
  external("SETTLE", "EXTERNAL_EVIDENCE", "S4_FINAL_ADJUDICATION_APPEAL_EVIDENCE",
    "Independent adjudication with fraud review and appeal finality",
    "adjudication record, conflict checks, fraud review and appeal disposition",
    "stage4-adjudication-replay"),
  external("SETTLE", "EXTERNAL_EVIDENCE", "S4_PAYMENT_AND_RECOVERY_EVIDENCE",
    "Custodian payment acknowledgement and independently checked recovery",
    "payment receipt plus separate World restoration evidence", "stage4-payment-recovery-replay"),
  external("SETTLE", "EXTERNAL_EVIDENCE", "S4_LONGITUDINAL_CONSEQUENCE_MATURITY",
    "All mandatory delayed consequence horizons mature without hidden closure",
    "longitudinal reports for every channel and affected-party root", "stage4-longitudinal-replay"),
  external("SETTLE", "EXTERNAL_INSTITUTION_AUTHORITY", "S4_INDEPENDENT_CLAIMS_ADJUDICATOR",
    "Independent claims/adjudication institution",
    "institutional governance, conflicts, authority, key history and appeal policy",
    "stage4-claims-institution"),
  external("SETTLE", "EXTERNAL_INSTITUTION_AUTHORITY", "S4_CUSTODIAN_PAYMENT_RAIL",
    "Authorized custodian/payment rail executes only valid one-use instructions",
    "custody agreement, payment authority and idempotent acknowledgement policy",
    "stage4-custodian-authority"),
  external("SETTLE", "EXTERNAL_INSTITUTION_AUTHORITY", "S4_CLOSURE_REOPENING_AUTHORITY",
    "Institution with authority to close and later reopen the obligation",
    "closure standard, monitoring duty, reopening triggers and responsibility continuity",
    "stage4-closure-authority"),
  external("SETTLE", "EXTERNAL_INSTITUTION_AUTHORITY", "S4_AFFECTED_PARTY_CHALLENGE_INSTITUTION",
    "Affected parties have an operative challenge, appeal and representation path",
    "standing process, notice, response times and enforceable remedies",
    "stage4-affected-party-institution"),
]);

export const CLOSURE_PLAN = deepFreeze([
  { wave: 1, key: "FREEZE_INTERFACES_AND_KEEP_AUTHORITY_FALSE",
    gapIds: ["S2_EXACT_CROSS_STAGE_PRICE_BRIDGE",
      "S2_UNIFIED_TYPED_PRICING_PROGRESS_PROJECTION", "S3_SOURCE_REPLAYED_BINDING_GATE",
      "S4_CLAIM_REPLAY_DEDUP_IDEMPOTENCY", "S4_PAYMENT_RESTORATION_SEPARATION"],
    exit: "All candidate bridges source-bind exact upstream artifacts and still emit HOLD." },
  { wave: 2, key: "CREATE_LIVE_EXTERNAL_EVIDENCE_FLOW",
    gapIds: ["S05_EXTERNAL_USER_REPOSITORIES_AND_SECOND_MACHINES", "S1_REAL_CONTRIBUTED_RUNS",
      "S15_REAL_PROSPECTIVE_DEVICE_CONTROLS",
      "S15_INDEPENDENT_OUTCOME_SENSING_AND_PLATFORM_PARAMETERS"],
    exit: "At least one unrelated agent cohort and one real-device prospective stream replay exactly." },
  { wave: 3, key: "BUILD_ADMISSIBLE_LOSS_AND_MODEL_EVIDENCE",
    gapIds: ["S2_COMPLETE_ZERO_LOSS_EXPOSURE_WINDOWS", "S2_ADJUDICATED_ECONOMIC_LOSS_SEVERITY",
      "S2_PROSPECTIVE_PREACTION_FACTOR_STREAM", "S2_EXTERNAL_HOLDOUT_AND_CORRELATION_VALIDATION"],
    exit: "Complete denominators, adjudicated severity and frozen external holdouts exist." },
  { wave: 4, key: "OBTAIN_REVIEW_AND_REAL_COUNTERPARTIES",
    gapIds: ["S2_INDEPENDENT_ACTUARIAL_REVIEW", "S2_LEGAL_PRODUCT_CLASSIFICATION",
      "S3_STANDING_ISSUER_AND_LEGAL_AUTHORITY", "S3_RESOURCE_OWNER_ADOPTION",
      "S3_CAPITAL_CUSTODY_POLICY_COUNTERPARTIES", "S3_AFFECTED_PARTY_STANDING_POLICY_TERMS"],
    exit: "Counsel, actuary, issuer, owner, custodian and affected-party process bind one exact policy." },
  { wave: 5, key: "RUN_ONE_FUNDED_GUARANTEE_PILOT",
    gapIds: ["S3_CAPITAL_CUSTODY_POLICY_COUNTERPARTIES", "S3_RESOURCE_OWNER_ADOPTION",
      "S3_AFFECTED_PARTY_STANDING_POLICY_TERMS", "S3_REAL_FUNDED_SHADOW_PILOT",
      "S3_GATE_BYPASS_REVOCATION_FAILURE_EVIDENCE"],
    exit: "One external contract and owner gate complete without Outsider claiming issuer authority." },
  { wave: 6, key: "SETTLE_ONE_REAL_CLAIM_WITHOUT_CLOSING_REALITY",
    gapIds: ["S4_CUSTODIAN_PAYMENT_RAIL", "S4_CLOSURE_REOPENING_AUTHORITY",
      "S4_AFFECTED_PARTY_CHALLENGE_INSTITUTION", "S4_REAL_EXECUTION_LOSS_CLAIM",
      "S4_FINAL_ADJUDICATION_APPEAL_EVIDENCE", "S4_PAYMENT_AND_RECOVERY_EVIDENCE",
      "S4_LONGITUDINAL_CONSEQUENCE_MATURITY"],
    exit: "One idempotent payment instruction is externally executed while restoration and delayed obligations remain separately governed." },
]);

export const STAGE3_GUARANTEE_BRIDGE_DOD = deepFreeze([
  "Exact Stage 1 record, Claim, Way, World and Policy are source-replayed, not supplied as labels.",
  "The Stage 2 quote binds admissible exposure/loss evidence, model card, validity domain and independent review.",
  "The Reality Stewardship envelope has an externally complete owner ledger, standing process and non-waivable constraints.",
  "A real issuer's jurisdiction, authority, policy wording and key governance are externally verified.",
  "Capital is atomically reserved under aggregate limits and acknowledged by an authorized custodian.",
  "The resource owner adopts a before-state-bound, expiring, revocable one-use gate as the actual write path.",
  "Responsibility and recovery survive provider replacement, coverage dispute, diet breach and institutional dissolution.",
  "Bypass, revocation, concurrency and fail-closed behavior pass a preregistered live conformance run.",
  "Outsider emits an eligibility/reference artifact only; the external contract creates the guarantee.",
]);

export const STAGE4_SETTLEMENT_BRIDGE_DOD = deepFreeze([
  "An externally binding Stage 3 contract reference exists; a local candidate or BINDING_ELIGIBLE label is insufficient.",
  "Execution, covered trigger, economic fact and claim identity are source-replayed and globally deduplicated.",
  "Coverage period, exclusions, deductible, per-claim and aggregate limits, reserve and remaining balance are checked atomically.",
  "Adjudicator independence is an external governance fact, not key or string inequality; fraud and conflicts are resolved.",
  "Notice, challenge and appeal windows are complete for every standing-bearing affected party.",
  "Payment, technical recovery, World restoration and obligation closure are four separate states.",
  "Each settlement instruction has a one-use nonce and requires a source-replayed custodian acknowledgement.",
  "Delayed/systemic consequence horizons remain open and can reopen the obligation after payment.",
  "Outsider never holds funds, moves money or declares external closure.",
]);

function normalizeSubmission(value) {
  if (!exactKeys(value, ["schema", "gapId", "artifactHash", "sourceKind", "submittedAt"])) {
    fail("READINESS_EXTERNAL_SUBMISSION_SCHEMA_INVALID");
  }
  if (value.schema !== READINESS_GAP_SCHEMAS.externalSubmission) {
    fail("READINESS_EXTERNAL_SUBMISSION_SCHEMA_INVALID");
  }
  return {
    schema: value.schema,
    gapId: token(value.gapId, "READINESS_EXTERNAL_SUBMISSION_GAP_INVALID"),
    artifactHash: hash(value.artifactHash, "READINESS_EXTERNAL_SUBMISSION_HASH_INVALID"),
    sourceKind: token(value.sourceKind, "READINESS_EXTERNAL_SUBMISSION_SOURCE_INVALID"),
    submittedAt: iso(value.submittedAt, "READINESS_EXTERNAL_SUBMISSION_TIME_INVALID"),
    disposition: "SUBMITTED_UNVERIFIED",
    closureCredit: false,
  };
}

function stageSummary(gaps, stage) {
  const selected = gaps.filter((gap) => gap.stage === stage.key);
  const byCategory = Object.fromEntries(GAP_CATEGORIES.map((category) => {
    const rows = selected.filter((gap) => gap.category === category);
    return [category, {
      total: rows.length,
      satisfiedInternal: rows.filter((gap) => gap.status === "SATISFIED_INTERNAL").length,
      openInternal: rows.filter((gap) => gap.status === "OPEN_INTERNAL").length,
      blockedExternal: rows.filter((gap) => gap.status === "BLOCKED_EXTERNAL").length,
    }];
  }));
  const claimCeilings = {
    MEASURE: "PUBLIC_BETA_CLAUDE_CODE_COWORK_ONLY",
    ATTEST: "LOCAL_SIGNED_AND_SOURCE_REPLAYED_EVIDENCE_NO_EXTERNAL_TRUST",
    CURATE: "EMPIRICAL_DESCRIPTIVE_EVIDENCE_PLUS_SYNTHETIC_PROTOCOL_CONFORMANCE_NO_CEU",
    PRICE: "NONZERO_SOURCE_DOMAIN_HISTORICAL_LOSS_COST_TARGET_PREMIUM_AND_QUOTE_NULL",
    GUARANTEE: "CANDIDATE_BRIDGE_ONLY_NO_BINDING_GUARANTEE",
    SETTLE: "CANDIDATE_BRIDGE_ONLY_NO_SETTLEMENT",
  };
  return {
    id: stage.id,
    key: stage.key,
    claimCeiling: claimCeilings[stage.key],
    byCategory,
    internalEngineeringComplete: byCategory.INTERNAL_ENGINEERING.openInternal === 0,
    externalPlatformCapabilityComplete: false,
    externalEvidenceComplete: false,
    externalInstitutionAuthorityComplete: false,
    productionReady: false,
    authority: "none",
  };
}

export function createReadinessGapLedger({
  asOf = "2026-08-22T09:00:00.000Z",
  externalSubmissions = [],
} = {}) {
  const normalizedAsOf = iso(asOf, "READINESS_AS_OF_INVALID");
  if (!Array.isArray(externalSubmissions)) fail("READINESS_EXTERNAL_SUBMISSIONS_INVALID");
  const submissions = externalSubmissions.map(normalizeSubmission);
  const definitionIds = new Set(GAP_DEFINITIONS.map((gap) => gap.gapId));
  if (definitionIds.size !== GAP_DEFINITIONS.length) fail("READINESS_DUPLICATE_GAP_ID");
  for (const gap of GAP_DEFINITIONS) {
    if (!STAGE.has(gap.stage) || !CATEGORY.has(gap.category) || !STATUS.has(gap.status)) {
      fail("READINESS_GAP_DEFINITION_INVALID");
    }
    if (gap.dependsOn.some((id) => !definitionIds.has(id))) fail("READINESS_DEPENDENCY_UNKNOWN");
  }
  const seenSubmissions = new Set();
  for (const submission of submissions) {
    const gap = GAP_DEFINITIONS.find((item) => item.gapId === submission.gapId);
    if (!gap) fail("READINESS_EXTERNAL_SUBMISSION_GAP_UNKNOWN");
    if (gap.category === "INTERNAL_ENGINEERING") {
      fail("READINESS_EXTERNAL_SUBMISSION_CANNOT_CLOSE_INTERNAL_GAP");
    }
    const identity = `${submission.gapId}\0${submission.artifactHash}`;
    if (seenSubmissions.has(identity)) fail("READINESS_EXTERNAL_SUBMISSION_DUPLICATE");
    seenSubmissions.add(identity);
  }
  const gaps = GAP_DEFINITIONS.map((definition) => ({
    ...clone(definition),
    submissions: submissions.filter((submission) => submission.gapId === definition.gapId),
  }));
  const body = {
    schema: READINESS_GAP_SCHEMAS.ledger,
    schemaVersion: "2.0.0",
    snapshot: "OUTSIDER_EMPIRICAL_EVIDENCE_TREE_2026-08-22",
    asOf: normalizedAsOf,
    authority: {
      mode: "none",
      permitsExecution: false,
      permitsPrice: false,
      permitsGuarantee: false,
      permitsSettlement: false,
      movesFunds: false,
      closesObligation: false,
    },
    genericExternalClosureAccepted: false,
    stages: STAGES.map((stage) => stageSummary(gaps, stage)),
    gaps,
    closurePlan: clone(CLOSURE_PLAN),
  };
  return deepFreeze({ ...body, ledgerHash: digest(READINESS_GAP_SCHEMAS.ledger, body) });
}

export function verifyReadinessGapLedger(ledger) {
  try {
    if (!plain(ledger) || ledger.schema !== READINESS_GAP_SCHEMAS.ledger
      || ledger.schemaVersion !== "2.0.0" || !HASH.test(ledger.ledgerHash ?? "")
      || ledger.genericExternalClosureAccepted !== false) {
      fail("READINESS_LEDGER_SCHEMA_INVALID");
    }
    const submissions = [];
    for (const gap of ledger.gaps ?? []) {
      if (gap.category !== "INTERNAL_ENGINEERING") {
        for (const submitted of gap.submissions ?? []) {
          if (submitted.disposition !== "SUBMITTED_UNVERIFIED"
            || submitted.closureCredit !== false) fail("READINESS_EXTERNAL_CREDIT_FORGED");
          const { disposition, closureCredit, ...raw } = submitted;
          submissions.push(raw);
        }
      } else if ((gap.submissions ?? []).length !== 0) {
        fail("READINESS_INTERNAL_GAP_HAS_EXTERNAL_SUBMISSION");
      }
      if (gap.category !== "INTERNAL_ENGINEERING"
        && (gap.status !== "BLOCKED_EXTERNAL" || gap.closureScope !== "EXTERNAL_BLOCKED")) {
        fail("READINESS_EXTERNAL_GAP_SELF_PROMOTED");
      }
      if (gap.genericCallerBooleanAccepted !== false) fail("READINESS_BOOLEAN_ESCAPE_FORGED");
    }
    const rebuilt = createReadinessGapLedger({ asOf: ledger.asOf, externalSubmissions: submissions });
    if (canonicalizeStrict(rebuilt) !== canonicalizeStrict(ledger)) {
      fail("READINESS_LEDGER_REPLAY_MISMATCH");
    }
    return {
      ok: true,
      verificationLevel: "LOCAL_SPEC_REPLAY",
      externalPlatformCapabilityVerified: false,
      externalEvidenceVerified: false,
      externalInstitutionAuthorityVerified: false,
      sourceArtifactsReverified: false,
      ledgerHash: ledger.ledgerHash,
    };
  } catch (error) {
    return { ok: false, error: error?.message ?? String(error),
      externalPlatformCapabilityVerified: false,
      externalEvidenceVerified: false, externalInstitutionAuthorityVerified: false };
  }
}

function knownSubmissionHashes(ledger) {
  return new Set(ledger.gaps.flatMap((gap) => gap.submissions.map((item) => item.artifactHash)));
}

function hashList(values, code, allowed = null) {
  if (!Array.isArray(values) || values.length > 128) fail(code);
  const unique = [...new Set(values.map((value) => hash(value, code)))].sort();
  if (unique.length !== values.length) fail(`${code}_DUPLICATE`);
  if (allowed && unique.some((value) => !allowed.has(value))) fail(`${code}_NOT_REGISTERED`);
  return unique;
}

function openGapIds(ledger, stageKeys) {
  const keys = new Set(stageKeys);
  return ledger.gaps.filter((gap) => keys.has(gap.stage) && gap.status !== "SATISFIED_INTERNAL")
    .map((gap) => gap.gapId).sort();
}

export function buildStage3GuaranteeBridgeCandidate(input) {
  const keys = ["ledger", "stage1RecordHash", "curateCheckpointHash", "priceResearchHash",
    "stewardshipEnvelopeHash", "claimHash", "wayHash", "worldHash", "policyHash",
    "externalSubmissionHashes"];
  if (!exactKeys(input, keys)) fail("STAGE3_BRIDGE_INPUT_SCHEMA_INVALID");
  const ledgerCheck = verifyReadinessGapLedger(input.ledger);
  if (!ledgerCheck.ok) fail(`STAGE3_BRIDGE_LEDGER_INVALID:${ledgerCheck.error}`);
  const curateCheckpointHash = input.curateCheckpointHash === null ? null
    : hash(input.curateCheckpointHash, "STAGE3_CURATE_HASH_INVALID");
  const submissions = hashList(input.externalSubmissionHashes,
    "STAGE3_EXTERNAL_SUBMISSION_INVALID", knownSubmissionHashes(input.ledger));
  const body = {
    schema: READINESS_GAP_SCHEMAS.stage3Candidate,
    schemaVersion: "1.0.0",
    ledgerHash: input.ledger.ledgerHash,
    bindings: {
      stage1RecordHash: hash(input.stage1RecordHash, "STAGE3_STAGE1_HASH_INVALID"),
      curateCheckpointHash,
      priceResearchHash: hash(input.priceResearchHash, "STAGE3_PRICE_HASH_INVALID"),
      stewardshipEnvelopeHash: hash(input.stewardshipEnvelopeHash,
        "STAGE3_STEWARDSHIP_HASH_INVALID"),
      claimHash: hash(input.claimHash, "STAGE3_CLAIM_HASH_INVALID"),
      wayHash: hash(input.wayHash, "STAGE3_WAY_HASH_INVALID"),
      worldHash: hash(input.worldHash, "STAGE3_WORLD_HASH_INVALID"),
      policyHash: hash(input.policyHash, "STAGE3_POLICY_HASH_INVALID"),
    },
    externalSubmissionHashes: submissions,
    externalSubmissionDisposition: "REGISTERED_UNVERIFIED_NO_CLOSURE_CREDIT",
    localGraphComplete: true,
    sourceArtifactsReverified: false,
    externalPlatformCapabilityVerified: false,
    externalEvidenceVerified: false,
    externalInstitutionAuthorityVerified: false,
    missingGapIds: openGapIds(input.ledger,
      ["MEASURE", "ATTEST", "CURATE", "PRICE", "GUARANTEE"]),
    definitionOfDone: clone(STAGE3_GUARANTEE_BRIDGE_DOD),
    decision: "HOLD_EXTERNAL_ISSUER_OWNER_CAPITAL_AND_EVIDENCE",
    authority: {
      mode: "none", bindingGuarantee: false, grantsCoverage: false,
      grantsExecution: false, movesFunds: false,
    },
  };
  return deepFreeze({ ...body,
    candidateHash: digest(READINESS_GAP_SCHEMAS.stage3Candidate, body) });
}

export function verifyStage3GuaranteeBridgeCandidate(candidate) {
  try {
    if (!plain(candidate) || candidate.schema !== READINESS_GAP_SCHEMAS.stage3Candidate
      || candidate.schemaVersion !== "1.0.0" || !HASH.test(candidate.candidateHash ?? "")) {
      fail("STAGE3_BRIDGE_CANDIDATE_SCHEMA_INVALID");
    }
    const { candidateHash, ...body } = candidate;
    if (candidateHash !== digest(READINESS_GAP_SCHEMAS.stage3Candidate, body)) {
      fail("STAGE3_BRIDGE_CANDIDATE_HASH_INVALID");
    }
    if (candidate.decision !== "HOLD_EXTERNAL_ISSUER_OWNER_CAPITAL_AND_EVIDENCE"
      || candidate.sourceArtifactsReverified !== false
      || candidate.externalPlatformCapabilityVerified !== false
      || candidate.externalEvidenceVerified !== false
      || candidate.externalInstitutionAuthorityVerified !== false
      || candidate.authority?.mode !== "none"
      || candidate.authority?.bindingGuarantee !== false
      || candidate.authority?.grantsCoverage !== false
      || candidate.authority?.grantsExecution !== false
      || candidate.authority?.movesFunds !== false) {
      fail("STAGE3_BRIDGE_AUTHORITY_FORGED");
    }
    return { ok: true, verificationLevel: "SELF_CHECK_ONLY",
      bindingGuarantee: false, externalEvidenceVerified: false,
      externalPlatformCapabilityVerified: false,
      externalInstitutionAuthorityVerified: false, candidateHash };
  } catch (error) {
    return { ok: false, error: error?.message ?? String(error), bindingGuarantee: false };
  }
}

export function buildStage4SettlementBridgeCandidate(input) {
  const keys = ["ledger", "stage3Candidate", "executionReceiptHash", "claimEvidenceHash",
    "consequenceStateHash", "recoveryStateHash", "externalSubmissionHashes"];
  if (!exactKeys(input, keys)) fail("STAGE4_BRIDGE_INPUT_SCHEMA_INVALID");
  const ledgerCheck = verifyReadinessGapLedger(input.ledger);
  if (!ledgerCheck.ok) fail(`STAGE4_BRIDGE_LEDGER_INVALID:${ledgerCheck.error}`);
  const stage3Check = verifyStage3GuaranteeBridgeCandidate(input.stage3Candidate);
  if (!stage3Check.ok) fail(`STAGE4_STAGE3_CANDIDATE_INVALID:${stage3Check.error}`);
  if (input.stage3Candidate.ledgerHash !== input.ledger.ledgerHash) {
    fail("STAGE4_LEDGER_BINDING_MISMATCH");
  }
  const submissions = hashList(input.externalSubmissionHashes,
    "STAGE4_EXTERNAL_SUBMISSION_INVALID", knownSubmissionHashes(input.ledger));
  const body = {
    schema: READINESS_GAP_SCHEMAS.stage4Candidate,
    schemaVersion: "1.0.0",
    ledgerHash: input.ledger.ledgerHash,
    bindings: {
      stage3CandidateHash: input.stage3Candidate.candidateHash,
      executionReceiptHash: hash(input.executionReceiptHash,
        "STAGE4_EXECUTION_RECEIPT_HASH_INVALID"),
      claimEvidenceHash: hash(input.claimEvidenceHash, "STAGE4_CLAIM_EVIDENCE_HASH_INVALID"),
      consequenceStateHash: hash(input.consequenceStateHash,
        "STAGE4_CONSEQUENCE_STATE_HASH_INVALID"),
      recoveryStateHash: hash(input.recoveryStateHash, "STAGE4_RECOVERY_STATE_HASH_INVALID"),
    },
    externalSubmissionHashes: submissions,
    externalSubmissionDisposition: "REGISTERED_UNVERIFIED_NO_CLOSURE_CREDIT",
    sourceArtifactsReverified: false,
    externalPlatformCapabilityVerified: false,
    externalEvidenceVerified: false,
    externalInstitutionAuthorityVerified: false,
    appealFinalityVerified: false,
    recoveryExternallyVerified: false,
    restorationEstablished: false,
    obligationOpen: true,
    reopenable: true,
    missingGapIds: openGapIds(input.ledger, ["GUARANTEE", "SETTLE"]),
    definitionOfDone: clone(STAGE4_SETTLEMENT_BRIDGE_DOD),
    decision: "HOLD_EXTERNAL_BINDING_ADJUDICATION_CUSTODY_AND_CONSEQUENCES",
    authority: {
      mode: "none", settlementInstructionEligible: false,
      movesFunds: false, closesObligation: false,
    },
  };
  return deepFreeze({ ...body,
    candidateHash: digest(READINESS_GAP_SCHEMAS.stage4Candidate, body) });
}

export function verifyStage4SettlementBridgeCandidate(candidate) {
  try {
    if (!plain(candidate) || candidate.schema !== READINESS_GAP_SCHEMAS.stage4Candidate
      || candidate.schemaVersion !== "1.0.0" || !HASH.test(candidate.candidateHash ?? "")) {
      fail("STAGE4_BRIDGE_CANDIDATE_SCHEMA_INVALID");
    }
    const { candidateHash, ...body } = candidate;
    if (candidateHash !== digest(READINESS_GAP_SCHEMAS.stage4Candidate, body)) {
      fail("STAGE4_BRIDGE_CANDIDATE_HASH_INVALID");
    }
    if (candidate.decision
        !== "HOLD_EXTERNAL_BINDING_ADJUDICATION_CUSTODY_AND_CONSEQUENCES"
      || candidate.sourceArtifactsReverified !== false
      || candidate.externalPlatformCapabilityVerified !== false
      || candidate.externalEvidenceVerified !== false
      || candidate.externalInstitutionAuthorityVerified !== false
      || candidate.appealFinalityVerified !== false
      || candidate.recoveryExternallyVerified !== false
      || candidate.restorationEstablished !== false
      || candidate.obligationOpen !== true || candidate.reopenable !== true
      || candidate.authority?.mode !== "none"
      || candidate.authority?.settlementInstructionEligible !== false
      || candidate.authority?.movesFunds !== false
      || candidate.authority?.closesObligation !== false) {
      fail("STAGE4_BRIDGE_AUTHORITY_FORGED");
    }
    return { ok: true, verificationLevel: "SELF_CHECK_ONLY",
      settlementInstructionEligible: false, movesFunds: false,
      closesObligation: false, candidateHash };
  } catch (error) {
    return { ok: false, error: error?.message ?? String(error),
      settlementInstructionEligible: false, movesFunds: false };
  }
}

export function describeReadinessGapLedger() {
  return deepFreeze({
    schema: "outsider/readiness-gap-ledger-description/v2",
    stageOrder: clone(STAGES),
    categories: clone(GAP_CATEGORIES),
    rule: "INTERNAL_ENGINEERING may close through repository implementation and source-aware tests. "
      + "EXTERNAL_PLATFORM_CAPABILITY, EXTERNAL_EVIDENCE and "
      + "EXTERNAL_INSTITUTION_AUTHORITY remain BLOCKED_EXTERNAL "
      + "until a named source-aware, policy-pinned verifier exists; generic caller booleans and "
      + "hash-only submissions receive zero closure credit.",
    stage2PricingProgress: describeStage2ProgressProjectionBoundary(),
    stage3DefinitionOfDone: clone(STAGE3_GUARANTEE_BRIDGE_DOD),
    stage4DefinitionOfDone: clone(STAGE4_SETTLEMENT_BRIDGE_DOD),
  });
}
