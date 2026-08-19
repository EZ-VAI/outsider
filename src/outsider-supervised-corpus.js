import { supervisedExperienceDigest, verifySupervisedExperienceV2 } from "./outsider-supervised-experience.js";

const countBy = (values) => Object.fromEntries([...new Set(values)].sort()
  .map((value) => [value, values.filter((candidate) => candidate === value).length]));

function dependencyRoots(record) {
  const group = record?.attestationCompatibility?.groupKey ?? {};
  return [...new Set([
    group.controllerImplementationHash,
    group.wayHash,
    group.claimRefHash,
    group.worldRefHash,
    group.authorityRefHash,
  ].filter(Boolean))].sort();
}

function componentCount(records) {
  const parent = records.map((_, index) => index);
  const find = (x) => parent[x] === x ? x : (parent[x] = find(parent[x]));
  const join = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent[rb] = ra; };
  const seen = new Map();
  records.forEach((record, index) => {
    for (const root of dependencyRoots(record)) {
      if (seen.has(root)) join(index, seen.get(root));
      else seen.set(root, index);
    }
  });
  return new Set(records.map((_, index) => find(index))).size;
}

export function summarizeSupervisedExperience(records = []) {
  const unique = new Map();
  const refused = [];
  let duplicates = 0;
  for (const record of records) {
    const checked = verifySupervisedExperienceV2(record);
    if (!checked.ok) {
      refused.push({ candidateHash: supervisedExperienceDigest(record), reason: checked.error });
      continue;
    }
    if (unique.has(record.recordHash)) { duplicates++; continue; }
    unique.set(record.recordHash, record);
  }
  const accepted = [...unique.values()];
  const components = componentCount(accepted);
  const treatment = accepted.filter((record) =>
    record.learningLabels?.eligibleForCorrectionEffectLearning === true
    && record.learningLabels?.outsiderCausalContribution === true
    && record.causalChains?.some((chain) => chain.sealedComplete === true));
  const localEvaluation = accepted.filter((record) =>
    Array.isArray(record.evaluationContext?.gatesObserved)
    && record.evaluationContext.gatesObserved.length > 0);
  const groupHashes = accepted.map((record) =>
    supervisedExperienceDigest(record.attestationCompatibility.groupKey));
  const riskClasses = accepted.flatMap((record) =>
    (record.riskEvents ?? []).map((risk) => risk.riskClass));
  return {
    schema: "outsider/supervised-corpus-report/v1",
    authority: {
      mode: "OBSERVATION_ONLY",
      establishesIndependentProductionReliability: false,
      establishesLossOrLiability: false,
      admissibleForPricing: false,
    },
    counts: {
      candidates: records.length,
      verifiedUnique: accepted.length,
      exactDuplicatesCollapsed: duplicates,
      refused: refused.length,
      distinctGroupKeys: new Set(groupHashes).size,
      dependencyComponents: components,
      structuralIndependentUpperBound: components,
      correctionMechanismLearningEligible: treatment.length,
      localEvaluationRecords: localEvaluation.length,
      productionReliabilityEligible: 0,
      lossSeverityEligible: 0,
      pricingEligible: 0,
    },
    distributions: {
      productVersion: countBy(accepted.map((record) =>
        String(record.attestationCompatibility.groupKey.productVersion ?? "missing"))),
      terminalClass: countBy(accepted.map((record) =>
        String(record.terminal?.terminalClass ?? "missing"))),
      causalAttributionClass: countBy(accepted.map((record) =>
        String(record.learningLabels?.causalAttributionClass ?? "missing"))),
      gatesObserved: countBy(accepted.flatMap((record) =>
        record.evaluationContext?.gatesObserved ?? [])),
      riskClass: countBy(riskClasses),
    },
    learningAdmission: {
      correctionMechanism: {
        eligibleRecordHashes: treatment.map((record) => record.recordHash).sort(),
        scope: "LOCAL_L1_MECHANISM_LEARNING_ONLY",
        warning: "eligibility is a causal-label integrity gate, not an independence or external-validity claim",
      },
      productionReliability: { eligibleRecordHashes: [], reason: "no unrelated-operator field evidence" },
      lossSeverity: { eligibleRecordHashes: [], reason: "risk events explicitly establish neither loss nor liability" },
      pricing: { eligibleRecordHashes: [], reason: "no admissible L3/L4 loss-bearing evidence" },
    },
    refused,
    recordHashes: accepted.map((record) => record.recordHash).sort(),
  };
}

