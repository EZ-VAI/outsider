/*
 * Stage 1.5 prospective physical protocol — deterministic simulation conformance.
 *
 * This module proves that the evidence protocol can close. It does NOT prove a
 * robot acted in the world. Synthetic and historical sources are structurally
 * classified here and can never mint a causal experience unit (CEU). There is
 * intentionally no public builder or verifier path for REAL_PROSPECTIVE_DEVICE;
 * that path needs an externally pinned device/acquisition trust policy.
 */

import {
  createHash, createPrivateKey, createPublicKey, sign as cryptoSign,
  verify as cryptoVerify,
} from "node:crypto";
import { canonicalizeStrict } from "./canonical.js";
import { verifyCurateEpisode } from "./outsider-curate-core.js";

export const PHYSICAL_SOURCE_CLASSES = Object.freeze({
  real: "REAL_PROSPECTIVE_DEVICE",
  synthetic: "SYNTHETIC_CONFORMANCE",
  historical: "HISTORICAL_OBSERVATION",
  unverified: "UNVERIFIED_SOURCE",
});

export const PROSPECTIVE_SIMULATION_SCHEMAS = Object.freeze({
  source: "outsider/deterministic-physical-conformance-simulator/v1",
  preregistration: "outsider/prospective-simulation-preregistration/v1",
  schedulerManifest: "outsider/prospective-simulation-scheduler-manifest/v1",
  executionLedger: "outsider/prospective-simulation-execution-ledger/v1",
  adjudication: "outsider/prospective-simulation-adjudication/v1",
  ceuDecision: "outsider/prospective-simulation-ceu-decision/v1",
  learningReceipt: "outsider/prospective-simulation-learning-receipt/v1",
  report: "outsider/prospective-simulation-pilot-report/v1",
});

const HASH = /^sha256:[a-f0-9]{64}$/;
const TOKEN = /^[A-Za-z0-9][A-Za-z0-9._:+/-]{0,127}$/;
const SIGNATURE_KEYS = ["algorithm", "role", "keyId", "publicKeyPem", "value"];
const ARTIFACT_DOMAINS = Object.freeze({
  preregistration: "outsider/prospective-simulation-preregistration/v1",
  schedulerManifest: "outsider/prospective-simulation-scheduler-manifest/v1",
  executionLedger: "outsider/prospective-simulation-execution-ledger/v1",
  adjudication: "outsider/prospective-simulation-adjudication/v1",
  ceuDecision: "outsider/prospective-simulation-ceu-decision/v1",
  learningReceipt: "outsider/prospective-simulation-learning-receipt/v1",
  report: "outsider/prospective-simulation-pilot-report/v1",
  signature: "outsider/prospective-simulation-signature/v1",
  policy: "outsider/prospective-simulation-policy/v1",
  population: "outsider/prospective-simulation-population/v1",
  assignmentSeed: "outsider/prospective-simulation-assignment-seed/v1",
  simulatorSeed: "outsider/prospective-simulation-simulator-seed/v1",
  assignment: "outsider/prospective-simulation-assignment/v1",
  execution: "outsider/prospective-simulation-execution/v1",
  outcome: "outsider/prospective-simulation-outcome/v1",
  stepSet: "outsider/prospective-simulation-step-set/v1",
  ceuCandidate: "outsider/prospective-simulation-ceu-candidate/v1",
});

const FIXED_MISSING_REQUIREMENTS = Object.freeze([
  "EXTERNALLY_PINNED_DEVICE_ACQUISITION_ROOT",
  "REAL_DEVICE_EXECUTION_ATTESTATION",
  "EXTERNAL_PRECOMMITTED_RANDOMNESS_BEACON",
  "ORGANIZATIONAL_ROLE_INDEPENDENCE",
  "INDEPENDENT_OUTCOME_SENSING",
  "REAL_WORLD_COST_BEARER_AND_CONSEQUENCE",
  "EXTERNALLY_ADJUDICATED_LOSS_AND_EXPOSURE_ROWS",
  "EXTERNAL_TIMESTAMP_OR_APPEND_ONLY_PREREGISTRY",
  "PROSPECTIVE_POWER_AND_MINIMUM_INDEPENDENT_DOMAINS_REVIEW",
  "GLOBAL_CEU_DUPLICATE_CREDIT_LEDGER",
]);

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

function digest(domain, value) {
  return `sha256:${createHash("sha256")
    .update(`${domain}\0${canonicalizeStrict(value)}`).digest("hex")}`;
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function boundedToken(value, code) {
  if (typeof value !== "string" || !TOKEN.test(value)) fail(code);
  return value;
}

function canonicalTime(value, code) {
  const input = value instanceof Date ? value.toISOString() : value;
  if (typeof input !== "string" || input.length > 40 || !Number.isFinite(Date.parse(input))) {
    fail(code);
  }
  const normalized = new Date(input).toISOString();
  if (normalized !== input) fail(code);
  return normalized;
}

function secret(value, code) {
  if (typeof value !== "string" || value.length < 16 || value.length > 256) fail(code);
  return value;
}

function keyId(publicKeyPem) {
  try {
    if (typeof publicKeyPem !== "string" || publicKeyPem.length > 512) fail("KEY_INVALID");
    const key = createPublicKey(publicKeyPem);
    if (key.asymmetricKeyType !== "ed25519") fail("KEY_NOT_ED25519");
    const der = key.export({ type: "spki", format: "der" });
    return `sha256:${createHash("sha256").update(der).digest("hex")}`;
  } catch { fail("PROSPECTIVE_SIMULATION_PUBLIC_KEY_INVALID"); }
}

function signaturePayload(role, artifactHash) {
  return canonicalizeStrict({ schema: ARTIFACT_DOMAINS.signature, role, artifactHash });
}

function signArtifact(role, artifactHash, privateKeyPem) {
  const privateKey = createPrivateKey(privateKeyPem);
  if (privateKey.asymmetricKeyType !== "ed25519") fail("PROSPECTIVE_SIMULATION_KEY_NOT_ED25519");
  const publicKey = createPublicKey(privateKey);
  const publicKeyPem = publicKey.export({ type: "spki", format: "pem" }).toString();
  return deepFreeze({
    algorithm: "Ed25519",
    role,
    keyId: keyId(publicKeyPem),
    publicKeyPem,
    value: cryptoSign(null, Buffer.from(signaturePayload(role, artifactHash)), privateKey)
      .toString("base64"),
  });
}

function verifySignature(signature, role, artifactHash) {
  try {
    return exactKeys(signature, SIGNATURE_KEYS)
      && signature.algorithm === "Ed25519"
      && signature.role === role
      && signature.keyId === keyId(signature.publicKeyPem)
      && typeof signature.value === "string"
      && Buffer.from(signature.value, "base64").length === 64
      && cryptoVerify(null, Buffer.from(signaturePayload(role, artifactHash)),
        createPublicKey(signature.publicKeyPem), Buffer.from(signature.value, "base64"));
  } catch { return false; }
}

function sealSigned(body, field, role, privateKeyPem) {
  const artifactHash = digest(ARTIFACT_DOMAINS[field], body);
  return deepFreeze({ ...body, [field === "schedulerManifest" ? "manifestHash"
    : field === "executionLedger" ? "ledgerHash"
      : field === "preregistration" ? "preregistrationHash"
        : `${field}Hash`]: artifactHash,
  signature: signArtifact(role, artifactHash, privateKeyPem) });
}

function verifySigned(record, { schema, field, hashField, role, keys }) {
  if (!exactKeys(record, [...keys, hashField, "signature"])
    || record.schema !== schema || record.schemaVersion !== "1.0.0"
    || !HASH.test(record[hashField] ?? "")
    || !verifySignature(record.signature, role, record[hashField])) return false;
  const body = Object.fromEntries(keys.map((key) => [key, record[key]]));
  return record[hashField] === digest(ARTIFACT_DOMAINS[field], body);
}

function authorityBoundary() {
  return {
    authority: "none",
    automaticTraining: false,
    establishesRealDeviceAction: false,
    establishesLossLiabilityOrIndependence: false,
    permits: { PRICE: false, GUARANTEE: false, SETTLE: false },
  };
}

function validAuthorityBoundary(value) {
  return exactKeys(value, ["authority", "automaticTraining", "establishesRealDeviceAction",
    "establishesLossLiabilityOrIndependence", "permits"])
    && value.authority === "none" && value.automaticTraining === false
    && value.establishesRealDeviceAction === false
    && value.establishesLossLiabilityOrIndependence === false
    && exactKeys(value.permits, ["PRICE", "GUARANTEE", "SETTLE"])
    && Object.values(value.permits).every((item) => item === false);
}

function simulationSourceEvidence() {
  return {
    schema: PROSPECTIVE_SIMULATION_SCHEMAS.source,
    simulatorId: "outsider-linear-position-conformance",
    simulatorVersion: "1.0.0",
    simulatorImplementationHash: digest("outsider/simulator-implementation/v1", {
      recurrence: "x[t+1]=x[t]+action[t]+disturbance[t]",
      action: "clamp(-gain*x[t],-0.25,0.25)",
      disturbance: "sha256-derived-integer/10000",
    }),
    environmentSpecificationHash: digest("outsider/simulator-environment/v1", {
      state: "scalar-position", units: "normalized", hardware: false,
    }),
    externalDeviceAttestation: null,
    externalAcquisitionRoot: null,
  };
}

function validSimulationSource(value) {
  return exactKeys(value, ["schema", "simulatorId", "simulatorVersion",
    "simulatorImplementationHash", "environmentSpecificationHash",
    "externalDeviceAttestation", "externalAcquisitionRoot"])
    && value.schema === PROSPECTIVE_SIMULATION_SCHEMAS.source
    && value.simulatorId === "outsider-linear-position-conformance"
    && value.simulatorVersion === "1.0.0"
    && HASH.test(value.simulatorImplementationHash ?? "")
    && HASH.test(value.environmentSpecificationHash ?? "")
    && value.externalDeviceAttestation === null && value.externalAcquisitionRoot === null
    && canonicalizeStrict(value) === canonicalizeStrict(simulationSourceEvidence());
}

/** Source class is derived from artifact structure; caller labels are ignored. */
export function classifyPhysicalEvidence(value) {
  if (validSimulationSource(value)) return PHYSICAL_SOURCE_CLASSES.synthetic;
  if (value?.schema === "outsider/curate-episode/v1"
    && verifyCurateEpisode(value).ok
    && value.provenance.class === "historical-public-dataset") {
    return PHYSICAL_SOURCE_CLASSES.historical;
  }
  /* REAL is intentionally unreachable until an external trust-policy verifier exists. */
  return PHYSICAL_SOURCE_CLASSES.unverified;
}

function policyBody({ plannedUnitCount, horizonSteps, stepMs }) {
  return {
    arms: {
      control: { id: "CONTROL", controllerGain: 0.35 },
      intervention: { id: "INTERVENTION", controllerGain: 0.65 },
    },
    allocation: {
      method: "precommitted-sha256-balanced-1:1",
      propensityByArm: { CONTROL: 0.5, INTERVENTION: 0.5 },
      plannedUnitCount,
    },
    window: { horizonSteps, stepMs, requireCompleteWindow: true },
    primaryOutcome: {
      id: "terminal-absolute-position-error",
      aggregation: "per-assigned-unit-intention-to-treat",
      threshold: 0.2,
      event: "terminalAbsoluteError<=threshold",
      lowerIsBetter: true,
    },
    stoppingPolicy: {
      mode: "FIXED_N_NO_EARLY_STOPPING",
      attrition: "NO_POST_ASSIGNMENT_EXCLUSION_MISSING_EXECUTION_FAILS_CLOSURE",
    },
  };
}

function population(experimentId, plannedUnitCount, sourceEvidence = simulationSourceEvidence()) {
  const correlationRoot = digest("outsider/prospective-simulation-correlation-root/v1", {
    sourceClass: PHYSICAL_SOURCE_CLASSES.synthetic,
    simulatorImplementationHash: sourceEvidence.simulatorImplementationHash,
    environmentSpecificationHash: sourceEvidence.environmentSpecificationHash,
  });
  const units = Array.from({ length: plannedUnitCount }, (_, index) => ({
    ordinal: index,
    unitIdHash: digest("outsider/prospective-simulation-unit/v1",
      { experimentId, ordinal: index }),
    episodeIdHash: digest("outsider/prospective-simulation-episode/v1",
      { experimentId, ordinal: index }),
    correlationRoot,
  }));
  return { units, populationCommitment: digest(ARTIFACT_DOMAINS.population, units) };
}

function confounderRegister() {
  return [
    { id: "initial-position", timing: "PRE_ASSIGNMENT", handling: "SIMULATOR_SEED_BOUND" },
    { id: "disturbance-sequence", timing: "PRE_ASSIGNMENT", handling: "SIMULATOR_SEED_BOUND" },
    { id: "shared-simulator", timing: "DESIGN", handling: "CORRELATION_ROOT_PRESERVED" },
  ];
}

function costBearer() {
  return { kind: "SIMULATION_OPERATOR", consequenceClass: "COMPUTE_ONLY",
    realWorldLossObserved: false };
}

function applicabilityBounds() {
  return {
    included: ["deterministic scalar-state simulator", "fixed horizon", "two fixed gains"],
    excluded: ["real robots", "hardware faults", "human contact", "liability",
      "financial loss", "deployment authorization"],
    unknownOutsideBounds: true,
  };
}

function preregistrationClaimBoundary() {
  return {
    protocolConformanceMayBeEstablished: true,
    realDeviceActionEstablished: false,
    organizationalIndependenceEstablished: false,
    independentOutcomeSensingEstablished: false,
    realWorldCausalEffectEstablished: false,
  };
}

const PREREG_KEYS = ["schema", "schemaVersion", "experimentId", "preregisteredAt",
  "sourceEvidence", "sourceClass", "researcherOrganizationHash", "policy", "policyHash",
  "assignmentSeedCommitment", "simulatorSeedCommitment", "population",
  "populationCommitment", "confounderRegister", "costBearer", "applicabilityBounds",
  "claimBoundary", "authority"];

export function createSimulationPreregistration({
  experimentId = "outsider-synthetic-physical-pilot-v1",
  preregisteredAt,
  plannedUnitCount = 12,
  horizonSteps = 8,
  stepMs = 100,
  assignmentSeed,
  simulatorSeed,
  researcherOrganizationHash,
  researcherPrivateKeyPem,
} = {}) {
  boundedToken(experimentId, "PROSPECTIVE_SIMULATION_EXPERIMENT_ID_INVALID");
  if (!Number.isSafeInteger(plannedUnitCount) || plannedUnitCount < 4
    || plannedUnitCount > 100 || plannedUnitCount % 2 !== 0) {
    fail("PROSPECTIVE_SIMULATION_UNIT_COUNT_INVALID");
  }
  if (!Number.isSafeInteger(horizonSteps) || horizonSteps < 3 || horizonSteps > 100
    || !Number.isSafeInteger(stepMs) || stepMs < 1 || stepMs > 60_000) {
    fail("PROSPECTIVE_SIMULATION_WINDOW_INVALID");
  }
  secret(assignmentSeed, "PROSPECTIVE_SIMULATION_ASSIGNMENT_SEED_INVALID");
  secret(simulatorSeed, "PROSPECTIVE_SIMULATION_SIMULATOR_SEED_INVALID");
  if (!HASH.test(researcherOrganizationHash ?? "")) {
    fail("PROSPECTIVE_SIMULATION_RESEARCHER_ORGANIZATION_INVALID");
  }
  const sourceEvidence = simulationSourceEvidence();
  const policy = policyBody({ plannedUnitCount, horizonSteps, stepMs });
  const enrolled = population(experimentId, plannedUnitCount, sourceEvidence);
  const body = {
    schema: PROSPECTIVE_SIMULATION_SCHEMAS.preregistration,
    schemaVersion: "1.0.0",
    experimentId,
    preregisteredAt: canonicalTime(preregisteredAt,
      "PROSPECTIVE_SIMULATION_PREREGISTRATION_TIME_INVALID"),
    sourceEvidence,
    sourceClass: classifyPhysicalEvidence(sourceEvidence),
    researcherOrganizationHash,
    policy,
    policyHash: digest(ARTIFACT_DOMAINS.policy, policy),
    assignmentSeedCommitment: digest(ARTIFACT_DOMAINS.assignmentSeed, assignmentSeed),
    simulatorSeedCommitment: digest(ARTIFACT_DOMAINS.simulatorSeed, simulatorSeed),
    population: enrolled.units,
    populationCommitment: enrolled.populationCommitment,
    confounderRegister: confounderRegister(),
    costBearer: costBearer(),
    applicabilityBounds: applicabilityBounds(),
    claimBoundary: preregistrationClaimBoundary(),
    authority: authorityBoundary(),
  };
  return sealSigned(body, "preregistration", "researcher", researcherPrivateKeyPem);
}

export function verifySimulationPreregistration(record) {
  try {
    if (!verifySigned(record, { schema: PROSPECTIVE_SIMULATION_SCHEMAS.preregistration,
      field: "preregistration", hashField: "preregistrationHash", role: "researcher",
      keys: PREREG_KEYS })) fail("PROSPECTIVE_SIMULATION_PREREGISTRATION_INVALID");
    const planned = record?.population?.length;
    const horizonSteps = record?.policy?.window?.horizonSteps;
    const stepMs = record?.policy?.window?.stepMs;
    if (!Number.isSafeInteger(planned) || planned < 4 || planned > 100 || planned % 2 !== 0
      || !Number.isSafeInteger(horizonSteps) || horizonSteps < 3 || horizonSteps > 100
      || !Number.isSafeInteger(stepMs) || stepMs < 1 || stepMs > 60_000
      || !validSimulationSource(record.sourceEvidence)
      || classifyPhysicalEvidence(record.sourceEvidence) !== PHYSICAL_SOURCE_CLASSES.synthetic
      || record.sourceClass !== PHYSICAL_SOURCE_CLASSES.synthetic
      || !HASH.test(record.researcherOrganizationHash ?? "")
      || !HASH.test(record.assignmentSeedCommitment ?? "")
      || !HASH.test(record.simulatorSeedCommitment ?? "")
      || canonicalizeStrict(record.policy) !== canonicalizeStrict(policyBody({
        plannedUnitCount: planned, horizonSteps, stepMs,
      }))
      || record.policyHash !== digest(ARTIFACT_DOMAINS.policy, record.policy)
      || !Array.isArray(record.population) || record.population.length < 4
      || record.population.length % 2 !== 0
      || canonicalizeStrict(record.population)
        !== canonicalizeStrict(population(record.experimentId, planned,
          record.sourceEvidence).units)
      || record.populationCommitment !== digest(ARTIFACT_DOMAINS.population, record.population)
      || record.policy?.allocation?.plannedUnitCount !== record.population.length
      || new Set(record.population.map((item) => item.unitIdHash)).size !== record.population.length
      || new Set(record.population.map((item) => item.episodeIdHash)).size !== record.population.length
      || record.population.some((item, index) => !exactKeys(item,
        ["ordinal", "unitIdHash", "episodeIdHash", "correlationRoot"])
        || item.ordinal !== index || !HASH.test(item.unitIdHash ?? "")
        || !HASH.test(item.episodeIdHash ?? "") || !HASH.test(item.correlationRoot ?? ""))
      || canonicalizeStrict(record.confounderRegister)
        !== canonicalizeStrict(confounderRegister())
      || canonicalizeStrict(record.costBearer) !== canonicalizeStrict(costBearer())
      || canonicalizeStrict(record.applicabilityBounds)
        !== canonicalizeStrict(applicabilityBounds())
      || canonicalizeStrict(record.claimBoundary)
        !== canonicalizeStrict(preregistrationClaimBoundary())
      || !validAuthorityBoundary(record.authority)) {
      fail("PROSPECTIVE_SIMULATION_PREREGISTRATION_BOUNDARY_INVALID");
    }
    canonicalTime(record.preregisteredAt,
      "PROSPECTIVE_SIMULATION_PREREGISTRATION_TIME_INVALID");
    return Object.freeze({ ok: true, preregistrationHash: record.preregistrationHash,
      sourceClass: PHYSICAL_SOURCE_CLASSES.synthetic });
  } catch (error) { return Object.freeze({ ok: false, error: error.message }); }
}

const MANIFEST_KEYS = ["schema", "schemaVersion", "experimentId", "preregistrationHash",
  "policyHash", "populationCommitment", "assignmentSeedReveal", "assignmentAlgorithm",
  "issuedAt", "assignments", "authority"];

function assignmentBody({ preregistration, unit, arm, issuedAt, assignmentSeed }) {
  return {
    experimentId: preregistration.experimentId,
    preregistrationHash: preregistration.preregistrationHash,
    policyHash: preregistration.policyHash,
    populationCommitment: preregistration.populationCommitment,
    ordinal: unit.ordinal,
    unitIdHash: unit.unitIdHash,
    episodeIdHash: unit.episodeIdHash,
    correlationRoot: unit.correlationRoot,
    arm,
    propensity: 0.5,
    nonce: digest("outsider/prospective-simulation-assignment-nonce/v1",
      { assignmentSeed, unitIdHash: unit.unitIdHash }),
    issuedAt,
  };
}

export function createSignedSimulationSchedule(preregistration, {
  assignmentSeed, issuedAt, schedulerPrivateKeyPem,
} = {}) {
  const checked = verifySimulationPreregistration(preregistration);
  if (!checked.ok) fail(`PROSPECTIVE_SIMULATION_SCHEDULE_PREREG_INVALID:${checked.error}`);
  secret(assignmentSeed, "PROSPECTIVE_SIMULATION_ASSIGNMENT_SEED_INVALID");
  if (digest(ARTIFACT_DOMAINS.assignmentSeed, assignmentSeed)
    !== preregistration.assignmentSeedCommitment) {
    fail("PROSPECTIVE_SIMULATION_ASSIGNMENT_SEED_COMMITMENT_MISMATCH");
  }
  const at = canonicalTime(issuedAt, "PROSPECTIVE_SIMULATION_SCHEDULE_TIME_INVALID");
  if (Date.parse(at) <= Date.parse(preregistration.preregisteredAt)) {
    fail("PROSPECTIVE_SIMULATION_SCHEDULE_NOT_AFTER_PREREGISTRATION");
  }
  const ranked = preregistration.population.map((unit) => ({ unit,
    rank: digest("outsider/prospective-simulation-assignment-rank/v1",
      { assignmentSeed, unitIdHash: unit.unitIdHash }) }))
    .sort((a, b) => a.rank.localeCompare(b.rank));
  const intervention = new Set(ranked.slice(0, ranked.length / 2)
    .map((item) => item.unit.unitIdHash));
  const assignments = preregistration.population.map((unit) => {
    const body = assignmentBody({ preregistration, unit,
      arm: intervention.has(unit.unitIdHash) ? "INTERVENTION" : "CONTROL",
      issuedAt: at, assignmentSeed });
    return { ...body, assignmentHash: digest(ARTIFACT_DOMAINS.assignment, body) };
  });
  const body = {
    schema: PROSPECTIVE_SIMULATION_SCHEMAS.schedulerManifest,
    schemaVersion: "1.0.0",
    experimentId: preregistration.experimentId,
    preregistrationHash: preregistration.preregistrationHash,
    policyHash: preregistration.policyHash,
    populationCommitment: preregistration.populationCommitment,
    assignmentSeedReveal: assignmentSeed,
    assignmentAlgorithm: "precommitted-sha256-balanced-1:1",
    issuedAt: at,
    assignments,
    authority: authorityBoundary(),
  };
  return sealSigned(body, "schedulerManifest", "scheduler", schedulerPrivateKeyPem);
}

export function verifySimulationSchedule(manifest, { preregistration } = {}) {
  try {
    const preregCheck = verifySimulationPreregistration(preregistration);
    if (!preregCheck.ok) fail(`PROSPECTIVE_SIMULATION_SCHEDULE_PREREG_INVALID:${preregCheck.error}`);
    if (!verifySigned(manifest, { schema: PROSPECTIVE_SIMULATION_SCHEMAS.schedulerManifest,
      field: "schedulerManifest", hashField: "manifestHash", role: "scheduler",
      keys: MANIFEST_KEYS })) fail("PROSPECTIVE_SIMULATION_SCHEDULE_INVALID");
    const issuedAt = canonicalTime(manifest.issuedAt,
      "PROSPECTIVE_SIMULATION_SCHEDULE_TIME_INVALID");
    if (Date.parse(issuedAt) <= Date.parse(preregistration.preregisteredAt)) {
      fail("PROSPECTIVE_SIMULATION_SCHEDULE_NOT_AFTER_PREREGISTRATION");
    }
    const expected = createScheduleWithoutSignature(preregistration,
      manifest.assignmentSeedReveal, manifest.issuedAt);
    const comparable = Object.fromEntries(MANIFEST_KEYS.map((key) => [key, manifest[key]]));
    if (canonicalizeStrict(comparable) !== canonicalizeStrict(expected)
      || manifest.signature.keyId === preregistration.signature.keyId
      || !validAuthorityBoundary(manifest.authority)) {
      fail("PROSPECTIVE_SIMULATION_SCHEDULE_DERIVATION_INVALID");
    }
    return Object.freeze({ ok: true, manifestHash: manifest.manifestHash,
      assignmentCount: manifest.assignments.length });
  } catch (error) { return Object.freeze({ ok: false, error: error.message }); }
}

function createScheduleWithoutSignature(preregistration, assignmentSeed, issuedAt) {
  if (digest(ARTIFACT_DOMAINS.assignmentSeed, assignmentSeed)
    !== preregistration.assignmentSeedCommitment) fail("ASSIGNMENT_SEED_MISMATCH");
  const ranked = preregistration.population.map((unit) => ({ unit,
    rank: digest("outsider/prospective-simulation-assignment-rank/v1",
      { assignmentSeed, unitIdHash: unit.unitIdHash }) }))
    .sort((a, b) => a.rank.localeCompare(b.rank));
  const intervention = new Set(ranked.slice(0, ranked.length / 2)
    .map((item) => item.unit.unitIdHash));
  const assignments = preregistration.population.map((unit) => {
    const body = assignmentBody({ preregistration, unit,
      arm: intervention.has(unit.unitIdHash) ? "INTERVENTION" : "CONTROL",
      issuedAt, assignmentSeed });
    return { ...body, assignmentHash: digest(ARTIFACT_DOMAINS.assignment, body) };
  });
  return {
    schema: PROSPECTIVE_SIMULATION_SCHEMAS.schedulerManifest,
    schemaVersion: "1.0.0", experimentId: preregistration.experimentId,
    preregistrationHash: preregistration.preregistrationHash,
    policyHash: preregistration.policyHash,
    populationCommitment: preregistration.populationCommitment,
    assignmentSeedReveal: assignmentSeed,
    assignmentAlgorithm: "precommitted-sha256-balanced-1:1",
    issuedAt, assignments, authority: authorityBoundary(),
  };
}

function clamp(value, low, high) { return Math.min(high, Math.max(low, value)); }
function round(value) {
  const result = Math.round((value + Number.EPSILON) * 1e9) / 1e9;
  return Object.is(result, -0) ? 0 : result;
}
function seededValue(seed, label, scale) {
  const bytes = createHash("sha256").update(`${seed}\0${label}`).digest();
  const raw = bytes.readUInt32BE(0) / 0xffffffff;
  return round((raw * 2 - 1) * scale);
}

const LEDGER_KEYS = ["schema", "schemaVersion", "experimentId", "preregistrationHash",
  "policyHash", "schedulerManifestHash", "sourceEvidence", "sourceClass",
  "syntheticDeviceIdHash", "simulatorSeedReveal", "startedAt", "executions", "outcomes",
  "executionChainHead", "authority"];

function simulateAssignment(preregistration, assignment, simulatorSeed, baseTimeMs, ordinal) {
  const policy = preregistration.policy;
  const gain = assignment.arm === "INTERVENTION"
    ? policy.arms.intervention.controllerGain : policy.arms.control.controllerGain;
  let state = seededValue(simulatorSeed, `initial:${assignment.unitIdHash}`, 1);
  const steps = [];
  for (let index = 0; index < policy.window.horizonSteps; index += 1) {
    const stateBefore = state;
    const disturbance = seededValue(simulatorSeed,
      `disturbance:${assignment.unitIdHash}:${index}`, 0.04);
    const action = round(clamp(-gain * stateBefore, -0.25, 0.25));
    state = round(stateBefore + action + disturbance);
    steps.push({ sequence: index + 1, monotonicTick: index,
      stateBefore, disturbance, action, stateAfter: state });
  }
  const startedAt = new Date(baseTimeMs + ordinal * 10_000).toISOString();
  const finishedAt = new Date(Date.parse(startedAt)
    + policy.window.horizonSteps * policy.window.stepMs).toISOString();
  const executionBody = {
    sequence: ordinal + 1,
    assignmentHash: assignment.assignmentHash,
    experimentId: assignment.experimentId,
    policyHash: assignment.policyHash,
    unitIdHash: assignment.unitIdHash,
    episodeIdHash: assignment.episodeIdHash,
    correlationRoot: assignment.correlationRoot,
    arm: assignment.arm,
    propensity: assignment.propensity,
    syntheticDeviceIdHash: digest("outsider/synthetic-device/v1",
      { simulator: preregistration.sourceEvidence.simulatorImplementationHash }),
    startedAt,
    finishedAt,
    monotonicStartTick: 0,
    monotonicEndTick: policy.window.horizonSteps,
    stepSetHash: digest(ARTIFACT_DOMAINS.stepSet, steps),
    steps,
  };
  const execution = { ...executionBody,
    executionHash: digest(ARTIFACT_DOMAINS.execution, executionBody) };
  const terminalAbsoluteError = round(Math.abs(state));
  const outcomeBody = {
    assignmentHash: assignment.assignmentHash,
    executionHash: execution.executionHash,
    episodeIdHash: assignment.episodeIdHash,
    outcomeSpecHash: digest("outsider/prospective-simulation-outcome-spec/v1",
      policy.primaryOutcome),
    recordedBy: "EXECUTOR",
    independentOutcomeSensing: false,
    terminalAbsoluteError,
    threshold: policy.primaryOutcome.threshold,
    eventObserved: terminalAbsoluteError <= policy.primaryOutcome.threshold,
  };
  return { execution, outcome: { ...outcomeBody,
    outcomeHash: digest(ARTIFACT_DOMAINS.outcome, outcomeBody) } };
}

export function executeSimulationTrial(preregistration, manifest, {
  simulatorSeed, startedAt, executorPrivateKeyPem,
} = {}) {
  const scheduleCheck = verifySimulationSchedule(manifest, { preregistration });
  if (!scheduleCheck.ok) fail(`PROSPECTIVE_SIMULATION_EXECUTION_SCHEDULE_INVALID:${scheduleCheck.error}`);
  secret(simulatorSeed, "PROSPECTIVE_SIMULATION_SIMULATOR_SEED_INVALID");
  if (digest(ARTIFACT_DOMAINS.simulatorSeed, simulatorSeed)
    !== preregistration.simulatorSeedCommitment) fail("PROSPECTIVE_SIMULATION_SEED_MISMATCH");
  const start = canonicalTime(startedAt, "PROSPECTIVE_SIMULATION_EXECUTION_TIME_INVALID");
  if (Date.parse(start) <= Date.parse(manifest.issuedAt)) {
    fail("PROSPECTIVE_SIMULATION_EXECUTION_NOT_AFTER_ASSIGNMENT");
  }
  const results = manifest.assignments.map((assignment, index) => (
    simulateAssignment(preregistration, assignment, simulatorSeed, Date.parse(start), index)
  ));
  const executions = results.map((item) => item.execution);
  const outcomes = results.map((item) => item.outcome);
  const body = {
    schema: PROSPECTIVE_SIMULATION_SCHEMAS.executionLedger,
    schemaVersion: "1.0.0",
    experimentId: preregistration.experimentId,
    preregistrationHash: preregistration.preregistrationHash,
    policyHash: preregistration.policyHash,
    schedulerManifestHash: manifest.manifestHash,
    sourceEvidence: preregistration.sourceEvidence,
    sourceClass: classifyPhysicalEvidence(preregistration.sourceEvidence),
    syntheticDeviceIdHash: executions[0].syntheticDeviceIdHash,
    simulatorSeedReveal: simulatorSeed,
    startedAt: start,
    executions,
    outcomes,
    executionChainHead: digest("outsider/prospective-simulation-execution-chain/v1",
      executions.map((item) => item.executionHash)),
    authority: authorityBoundary(),
  };
  return sealSigned(body, "executionLedger", "executor", executorPrivateKeyPem);
}

export function verifySimulationExecution(ledger, { preregistration, manifest } = {}) {
  try {
    const scheduleCheck = verifySimulationSchedule(manifest, { preregistration });
    if (!scheduleCheck.ok) fail(`PROSPECTIVE_SIMULATION_EXECUTION_SCHEDULE_INVALID:${scheduleCheck.error}`);
    if (!verifySigned(ledger, { schema: PROSPECTIVE_SIMULATION_SCHEMAS.executionLedger,
      field: "executionLedger", hashField: "ledgerHash", role: "executor",
      keys: LEDGER_KEYS })) fail("PROSPECTIVE_SIMULATION_EXECUTION_INVALID");
    const startedAt = canonicalTime(ledger.startedAt,
      "PROSPECTIVE_SIMULATION_EXECUTION_TIME_INVALID");
    if (Date.parse(startedAt) <= Date.parse(manifest.issuedAt)) {
      fail("PROSPECTIVE_SIMULATION_EXECUTION_NOT_AFTER_ASSIGNMENT");
    }
    if (ledger.signature.keyId === preregistration.signature.keyId
      || ledger.signature.keyId === manifest.signature.keyId
      || classifyPhysicalEvidence(ledger.sourceEvidence) !== PHYSICAL_SOURCE_CLASSES.synthetic
      || ledger.sourceClass !== PHYSICAL_SOURCE_CLASSES.synthetic
      || ledger.schedulerManifestHash !== manifest.manifestHash
      || ledger.simulatorSeedReveal == null
      || digest(ARTIFACT_DOMAINS.simulatorSeed, ledger.simulatorSeedReveal)
        !== preregistration.simulatorSeedCommitment
      || !validAuthorityBoundary(ledger.authority)) {
      fail("PROSPECTIVE_SIMULATION_EXECUTION_BOUNDARY_INVALID");
    }
    const expected = manifest.assignments.map((assignment, index) => (
      simulateAssignment(preregistration, assignment, ledger.simulatorSeedReveal,
        Date.parse(ledger.startedAt), index)
    ));
    if (canonicalizeStrict(ledger.executions)
      !== canonicalizeStrict(expected.map((item) => item.execution))
      || canonicalizeStrict(ledger.outcomes)
        !== canonicalizeStrict(expected.map((item) => item.outcome))
      || ledger.executionChainHead !== digest("outsider/prospective-simulation-execution-chain/v1",
        ledger.executions.map((item) => item.executionHash))) {
      fail("PROSPECTIVE_SIMULATION_EXECUTION_REPLAY_MISMATCH");
    }
    const unitIds = ledger.executions.map((item) => item.unitIdHash);
    const episodeIds = ledger.executions.map((item) => item.episodeIdHash);
    const assignmentHashes = ledger.executions.map((item) => item.assignmentHash);
    if (new Set(unitIds).size !== unitIds.length || new Set(episodeIds).size !== episodeIds.length
      || new Set(assignmentHashes).size !== assignmentHashes.length
      || ledger.executions.length !== preregistration.population.length
      || ledger.outcomes.length !== ledger.executions.length
      || ledger.executions.some((execution, index) => execution.sequence !== index + 1
        || execution.steps.length !== preregistration.policy.window.horizonSteps
        || execution.monotonicStartTick !== 0
        || execution.monotonicEndTick !== preregistration.policy.window.horizonSteps
        || Date.parse(execution.finishedAt) <= Date.parse(execution.startedAt)
        || ledger.outcomes[index].executionHash !== execution.executionHash)) {
      fail("PROSPECTIVE_SIMULATION_EXECUTION_CLOSURE_INVALID");
    }
    return Object.freeze({ ok: true, ledgerHash: ledger.ledgerHash,
      executionCount: ledger.executions.length, completeWindow: true });
  } catch (error) { return Object.freeze({ ok: false, error: error.message }); }
}

const ADJUDICATION_KEYS = ["schema", "schemaVersion", "experimentId",
  "preregistrationHash", "schedulerManifestHash", "executionLedgerHash", "outcomeSpecHash",
  "adjudicatedAt", "roleSeparation", "sourceAssessment", "closure", "armResults",
  "contrast", "applicabilityBounds", "claimBoundary", "authority"];

function armResult(arm, manifest, ledger) {
  const assignmentSet = new Set(manifest.assignments.filter((item) => item.arm === arm)
    .map((item) => item.assignmentHash));
  const rows = ledger.outcomes.filter((item) => assignmentSet.has(item.assignmentHash));
  return {
    arm,
    assigned: assignmentSet.size,
    analyzedIntentionToTreat: rows.length,
    eventCount: rows.filter((item) => item.eventObserved).length,
    eventRate: rows.filter((item) => item.eventObserved).length / rows.length,
    meanTerminalAbsoluteError: round(rows.reduce((sum, item) => (
      sum + item.terminalAbsoluteError), 0) / rows.length),
  };
}

export function adjudicateSimulationTrial(preregistration, manifest, ledger, {
  adjudicatedAt, adjudicatorPrivateKeyPem,
} = {}) {
  const executionCheck = verifySimulationExecution(ledger, { preregistration, manifest });
  if (!executionCheck.ok) fail(`PROSPECTIVE_SIMULATION_ADJUDICATION_SOURCE_INVALID:${executionCheck.error}`);
  const at = canonicalTime(adjudicatedAt, "PROSPECTIVE_SIMULATION_ADJUDICATION_TIME_INVALID");
  const latest = Math.max(...ledger.executions.map((item) => Date.parse(item.finishedAt)));
  if (Date.parse(at) <= latest) fail("PROSPECTIVE_SIMULATION_ADJUDICATION_PRECEDES_EXECUTION");
  const control = armResult("CONTROL", manifest, ledger);
  const intervention = armResult("INTERVENTION", manifest, ledger);
  const body = {
    schema: PROSPECTIVE_SIMULATION_SCHEMAS.adjudication,
    schemaVersion: "1.0.0",
    experimentId: preregistration.experimentId,
    preregistrationHash: preregistration.preregistrationHash,
    schedulerManifestHash: manifest.manifestHash,
    executionLedgerHash: ledger.ledgerHash,
    outcomeSpecHash: digest("outsider/prospective-simulation-outcome-spec/v1",
      preregistration.policy.primaryOutcome),
    adjudicatedAt: at,
    roleSeparation: {
      cryptographicKeysDistinct: true,
      organizationalIndependenceEstablished: false,
      outcomeSensing: "EXECUTOR_RECORDED_NOT_INDEPENDENTLY_SENSED",
    },
    sourceAssessment: {
      recomputedSourceClass: classifyPhysicalEvidence(ledger.sourceEvidence),
      trustedExternalDeviceChainVerified: false,
      realProspectiveExecutions: 0,
      protocolConformance: true,
    },
    closure: {
      preregistered: true,
      enrollmentPopulationCommitted: true,
      assignmentSeedPrecommitted: true,
      assignmentAuditable: true,
      fixedStoppingAndAttritionPolicy: true,
      controlPresent: control.assigned > 0,
      interventionPresent: intervention.assigned > 0,
      completeExecutionWindow: executionCheck.completeWindow,
      confounderRegisterPresent: preregistration.confounderRegister.length > 0,
      duplicateAssignments: 0,
      duplicateOutcomes: 0,
      duplicateEpisodes: 0,
    },
    armResults: [control, intervention],
    contrast: {
      metric: preregistration.policy.primaryOutcome.id,
      eventRateDifferenceInterventionMinusControl: round(intervention.eventRate - control.eventRate),
      meanErrorDifferenceInterventionMinusControl: round(
        intervention.meanTerminalAbsoluteError - control.meanTerminalAbsoluteError),
      interpretation: "DETERMINISTIC_SIMULATION_ONLY_NO_REAL_WORLD_EFFECT_CLAIM",
    },
    applicabilityBounds: preregistration.applicabilityBounds,
    claimBoundary: {
      establishesProtocolConformance: true,
      establishesRealDeviceAction: false,
      establishesExternalValidity: false,
      establishesLossOrLiability: false,
    },
    authority: authorityBoundary(),
  };
  const record = sealSigned(body, "adjudication", "adjudicator", adjudicatorPrivateKeyPem);
  const ids = [preregistration.signature.keyId, manifest.signature.keyId,
    ledger.signature.keyId, record.signature.keyId];
  if (new Set(ids).size !== ids.length) fail("PROSPECTIVE_SIMULATION_ROLE_KEY_REUSE");
  return record;
}

export function verifySimulationAdjudication(record, { preregistration, manifest, ledger } = {}) {
  try {
    const executionCheck = verifySimulationExecution(ledger, { preregistration, manifest });
    if (!executionCheck.ok) fail(`PROSPECTIVE_SIMULATION_ADJUDICATION_SOURCE_INVALID:${executionCheck.error}`);
    if (!verifySigned(record, { schema: PROSPECTIVE_SIMULATION_SCHEMAS.adjudication,
      field: "adjudication", hashField: "adjudicationHash", role: "adjudicator",
      keys: ADJUDICATION_KEYS })) fail("PROSPECTIVE_SIMULATION_ADJUDICATION_INVALID");
    const adjudicatedAt = canonicalTime(record.adjudicatedAt,
      "PROSPECTIVE_SIMULATION_ADJUDICATION_TIME_INVALID");
    const latest = Math.max(...ledger.executions.map((item) => Date.parse(item.finishedAt)));
    if (Date.parse(adjudicatedAt) <= latest) {
      fail("PROSPECTIVE_SIMULATION_ADJUDICATION_PRECEDES_EXECUTION");
    }
    const ids = [preregistration.signature.keyId, manifest.signature.keyId,
      ledger.signature.keyId, record.signature.keyId];
    if (new Set(ids).size !== ids.length) fail("PROSPECTIVE_SIMULATION_ROLE_KEY_REUSE");
    const rebuilt = adjudicationBodyForVerification(preregistration, manifest, ledger,
      record.adjudicatedAt);
    const actual = Object.fromEntries(ADJUDICATION_KEYS.map((key) => [key, record[key]]));
    if (canonicalizeStrict(actual) !== canonicalizeStrict(rebuilt)
      || record.sourceAssessment.recomputedSourceClass !== PHYSICAL_SOURCE_CLASSES.synthetic
      || record.sourceAssessment.realProspectiveExecutions !== 0
      || record.claimBoundary.establishesRealDeviceAction !== false
      || !validAuthorityBoundary(record.authority)) {
      fail("PROSPECTIVE_SIMULATION_ADJUDICATION_DERIVATION_INVALID");
    }
    return Object.freeze({ ok: true, adjudicationHash: record.adjudicationHash,
      sourceClass: PHYSICAL_SOURCE_CLASSES.synthetic, protocolConformance: true });
  } catch (error) { return Object.freeze({ ok: false, error: error.message }); }
}

function adjudicationBodyForVerification(preregistration, manifest, ledger, adjudicatedAt) {
  const control = armResult("CONTROL", manifest, ledger);
  const intervention = armResult("INTERVENTION", manifest, ledger);
  return {
    schema: PROSPECTIVE_SIMULATION_SCHEMAS.adjudication, schemaVersion: "1.0.0",
    experimentId: preregistration.experimentId,
    preregistrationHash: preregistration.preregistrationHash,
    schedulerManifestHash: manifest.manifestHash,
    executionLedgerHash: ledger.ledgerHash,
    outcomeSpecHash: digest("outsider/prospective-simulation-outcome-spec/v1",
      preregistration.policy.primaryOutcome), adjudicatedAt,
    roleSeparation: { cryptographicKeysDistinct: true,
      organizationalIndependenceEstablished: false,
      outcomeSensing: "EXECUTOR_RECORDED_NOT_INDEPENDENTLY_SENSED" },
    sourceAssessment: { recomputedSourceClass: PHYSICAL_SOURCE_CLASSES.synthetic,
      trustedExternalDeviceChainVerified: false, realProspectiveExecutions: 0,
      protocolConformance: true },
    closure: { preregistered: true, enrollmentPopulationCommitted: true,
      assignmentSeedPrecommitted: true, assignmentAuditable: true,
      fixedStoppingAndAttritionPolicy: true, controlPresent: control.assigned > 0,
      interventionPresent: intervention.assigned > 0,
      completeExecutionWindow: true, confounderRegisterPresent: true,
      duplicateAssignments: 0, duplicateOutcomes: 0, duplicateEpisodes: 0 },
    armResults: [control, intervention],
    contrast: { metric: preregistration.policy.primaryOutcome.id,
      eventRateDifferenceInterventionMinusControl: round(intervention.eventRate - control.eventRate),
      meanErrorDifferenceInterventionMinusControl: round(
        intervention.meanTerminalAbsoluteError - control.meanTerminalAbsoluteError),
      interpretation: "DETERMINISTIC_SIMULATION_ONLY_NO_REAL_WORLD_EFFECT_CLAIM" },
    applicabilityBounds: preregistration.applicabilityBounds,
    claimBoundary: { establishesProtocolConformance: true,
      establishesRealDeviceAction: false, establishesExternalValidity: false,
      establishesLossOrLiability: false }, authority: authorityBoundary(),
  };
}

const CEU_KEYS = ["schema", "schemaVersion", "experimentId", "adjudicationHash",
  "sourceAssessment", "eligibilityGates", "decision", "candidates", "counts",
  "missingRequirements", "applicabilityBounds", "authority"];

export function evaluateSimulationCeuMint(preregistration, manifest, ledger, adjudication) {
  const checked = verifySimulationAdjudication(adjudication,
    { preregistration, manifest, ledger });
  if (!checked.ok) fail(`PROSPECTIVE_SIMULATION_CEU_SOURCE_INVALID:${checked.error}`);
  const candidates = ledger.executions.map((execution, index) => ({
    candidateHash: digest(ARTIFACT_DOMAINS.ceuCandidate, {
      experimentId: preregistration.experimentId,
      assignmentHash: execution.assignmentHash,
      executionHash: execution.executionHash,
      outcomeHash: ledger.outcomes[index].outcomeHash,
      adjudicationHash: adjudication.adjudicationHash,
    }),
    assignmentHash: execution.assignmentHash,
    executionHash: execution.executionHash,
    outcomeHash: ledger.outcomes[index].outcomeHash,
    unitIdHash: execution.unitIdHash,
    episodeIdHash: execution.episodeIdHash,
    correlationRoot: execution.correlationRoot,
    admitted: false,
    refusalCode: "SOURCE_CLASS_NOT_REAL_PROSPECTIVE_DEVICE",
  }));
  const body = {
    schema: PROSPECTIVE_SIMULATION_SCHEMAS.ceuDecision,
    schemaVersion: "1.0.0",
    experimentId: preregistration.experimentId,
    adjudicationHash: adjudication.adjudicationHash,
    sourceAssessment: {
      recomputedSourceClass: classifyPhysicalEvidence(ledger.sourceEvidence),
      realSourceVerificationImplemented: false,
      trustedExternalDeviceChainVerified: false,
    },
    eligibilityGates: {
      closedArtifactChain: true,
      controlAndRandomAssignment: true,
      confounderRegister: true,
      preregisteredPopulationAndOutcome: true,
      completeWindow: true,
      costBearerExplicit: true,
      applicabilityBoundsExplicit: true,
      cryptographicRoleSeparation: true,
      organizationalRoleIndependence: false,
      independentOutcomeSensing: false,
      realProspectiveDeviceSource: false,
      externalTrustPolicyVerified: false,
    },
    decision: "REFUSE_SIMULATION_CEU_MINT",
    candidates,
    counts: {
      protocolConformanceUnits: candidates.length,
      causalExperienceUnits: 0,
      realProspectiveExecutions: 0,
      independentPhysicalDomains: 0,
    },
    missingRequirements: [...FIXED_MISSING_REQUIREMENTS],
    applicabilityBounds: preregistration.applicabilityBounds,
    authority: authorityBoundary(),
  };
  return deepFreeze({ ...body, ceuDecisionHash: digest(ARTIFACT_DOMAINS.ceuDecision, body) });
}

export function verifySimulationCeuDecision(record, {
  preregistration, manifest, ledger, adjudication,
} = {}) {
  try {
    if (!exactKeys(record, [...CEU_KEYS, "ceuDecisionHash"])
      || record.schema !== PROSPECTIVE_SIMULATION_SCHEMAS.ceuDecision
      || record.schemaVersion !== "1.0.0") fail("PROSPECTIVE_SIMULATION_CEU_INVALID");
    const rebuilt = evaluateSimulationCeuMint(preregistration, manifest, ledger, adjudication);
    if (canonicalizeStrict(record) !== canonicalizeStrict(rebuilt)
      || record.sourceAssessment.recomputedSourceClass !== PHYSICAL_SOURCE_CLASSES.synthetic
      || record.counts.causalExperienceUnits !== 0
      || record.counts.realProspectiveExecutions !== 0
      || record.decision !== "REFUSE_SIMULATION_CEU_MINT"
      || record.candidates.some((item) => item.admitted !== false)
      || !validAuthorityBoundary(record.authority)) fail("PROSPECTIVE_SIMULATION_CEU_ESCALATION");
    return Object.freeze({ ok: true, ceuDecisionHash: record.ceuDecisionHash,
      causalExperienceUnits: 0, protocolConformanceUnits: record.counts.protocolConformanceUnits });
  } catch (error) { return Object.freeze({ ok: false, error: error.message }); }
}

const LEARNING_KEYS = ["schema", "schemaVersion", "experimentId", "ceuDecisionHash",
  "adjudicationHash", "consumption", "modelEffect", "claimBoundary", "authority"];

export function buildSimulationLearningReceipt(preregistration, manifest, ledger,
  adjudication, ceuDecision) {
  const checked = verifySimulationCeuDecision(ceuDecision,
    { preregistration, manifest, ledger, adjudication });
  if (!checked.ok) fail(`PROSPECTIVE_SIMULATION_LEARNING_SOURCE_INVALID:${checked.error}`);
  const body = {
    schema: PROSPECTIVE_SIMULATION_SCHEMAS.learningReceipt,
    schemaVersion: "1.0.0",
    experimentId: preregistration.experimentId,
    ceuDecisionHash: ceuDecision.ceuDecisionHash,
    adjudicationHash: adjudication.adjudicationHash,
    consumption: {
      mode: "PROTOCOL_CONFORMANCE_RESEARCH_ONLY",
      protocolConformanceUnitsObserved: ceuDecision.counts.protocolConformanceUnits,
      causalExperienceUnitsConsumed: 0,
      realProspectiveExecutionsConsumed: 0,
      correlationRoots: [...new Set(ceuDecision.candidates
        .map((item) => item.correlationRoot))].sort(),
      independentDomainsClaimed: 0,
    },
    modelEffect: {
      automaticTraining: false,
      productionModelUpdated: false,
      pricingModelUpdated: false,
      simulationProtocolFixtureEligible: true,
      decision: "HOLD_REAL_WORLD_LEARNING_LOOP",
    },
    claimBoundary: {
      demonstratesSecondLoopInterface: true,
      demonstratesRealWorldExperienceLearning: false,
      permitsCausalPromotion: false,
    },
    authority: authorityBoundary(),
  };
  return deepFreeze({ ...body,
    learningReceiptHash: digest(ARTIFACT_DOMAINS.learningReceipt, body) });
}

export function verifySimulationLearningReceipt(record, {
  preregistration, manifest, ledger, adjudication, ceuDecision,
} = {}) {
  try {
    if (!exactKeys(record, [...LEARNING_KEYS, "learningReceiptHash"])
      || record.schema !== PROSPECTIVE_SIMULATION_SCHEMAS.learningReceipt
      || record.schemaVersion !== "1.0.0") fail("PROSPECTIVE_SIMULATION_LEARNING_INVALID");
    const rebuilt = buildSimulationLearningReceipt(preregistration, manifest, ledger,
      adjudication, ceuDecision);
    if (canonicalizeStrict(record) !== canonicalizeStrict(rebuilt)
      || record.consumption.causalExperienceUnitsConsumed !== 0
      || record.consumption.realProspectiveExecutionsConsumed !== 0
      || record.modelEffect.automaticTraining !== false
      || record.modelEffect.productionModelUpdated !== false
      || record.modelEffect.pricingModelUpdated !== false
      || !validAuthorityBoundary(record.authority)) {
      fail("PROSPECTIVE_SIMULATION_LEARNING_ESCALATION");
    }
    return Object.freeze({ ok: true, learningReceiptHash: record.learningReceiptHash,
      causalExperienceUnitsConsumed: 0 });
  } catch (error) { return Object.freeze({ ok: false, error: error.message }); }
}

export function buildProspectiveSimulationPilot({ preregistration, manifest, ledger,
  adjudication, ceuDecision, learningReceipt }) {
  const learningCheck = verifySimulationLearningReceipt(learningReceipt,
    { preregistration, manifest, ledger, adjudication, ceuDecision });
  if (!learningCheck.ok) fail(`PROSPECTIVE_SIMULATION_REPORT_SOURCE_INVALID:${learningCheck.error}`);
  const body = {
    schema: PROSPECTIVE_SIMULATION_SCHEMAS.report,
    schemaVersion: "1.0.0",
    artifactHashes: {
      preregistrationHash: preregistration.preregistrationHash,
      schedulerManifestHash: manifest.manifestHash,
      executionLedgerHash: ledger.ledgerHash,
      adjudicationHash: adjudication.adjudicationHash,
      ceuDecisionHash: ceuDecision.ceuDecisionHash,
      learningReceiptHash: learningReceipt.learningReceiptHash,
    },
    result: {
      sourceClass: PHYSICAL_SOURCE_CLASSES.synthetic,
      protocolConformance: true,
      realRobotEvidence: false,
      causalExperienceUnits: 0,
      realProspectiveExecutions: 0,
      automaticTraining: false,
      nextGate: "EXTERNALLY_TRUSTED_PROSPECTIVE_DEVICE_PILOT",
    },
    missingRequirements: [...FIXED_MISSING_REQUIREMENTS],
    authority: authorityBoundary(),
  };
  return deepFreeze({ ...body, reportHash: digest(ARTIFACT_DOMAINS.report, body) });
}

export function verifyProspectiveSimulationPilot(report, sources) {
  try {
    const rebuilt = buildProspectiveSimulationPilot(sources);
    if (canonicalizeStrict(report) !== canonicalizeStrict(rebuilt)
      || report.result.sourceClass !== PHYSICAL_SOURCE_CLASSES.synthetic
      || report.result.realRobotEvidence !== false
      || report.result.causalExperienceUnits !== 0
      || report.result.realProspectiveExecutions !== 0
      || report.result.automaticTraining !== false
      || !validAuthorityBoundary(report.authority)) fail("PROSPECTIVE_SIMULATION_REPORT_INVALID");
    return Object.freeze({ ok: true, reportHash: report.reportHash,
      protocolConformance: true, causalExperienceUnits: 0, realRobotEvidence: false });
  } catch (error) { return Object.freeze({ ok: false, error: error.message }); }
}
