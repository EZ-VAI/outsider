/*
 * Experience capture + the behavior-prediction model — engineering module 5.
 *
 * WHY THIS IS THE POINT, NOT A BY-PRODUCT
 * =======================================
 * Supervising a run fixes THIS run. But every supervised run is also a labeled
 * trajectory: this Way, on this kind of Claim, in this World, SAID x and actually
 * DID y, and the supervisor decided z. Nobody else has this data, because nobody
 * else was in the loop watching an autonomous agent for hours. Captured, it is
 * the private Experience corpus the North Star's Experience economy runs on, and
 * the training signal for our OWN model of how a given machine behaves — the
 * thing the operator asked for: "受监督下的机器行为也应该形成我们自己的行为预测模型".
 *
 * TWO HONEST PIECES (no overclaiming)
 * ===================================
 * 1. CREDIBILITY (fitBehaviorModel / makeRunningBehaviorModel): a per-executor
 *    per-behavior rate with Bühlmann-Straub shrinkage. This is a classical (1960s)
 *    actuarial estimator, correctly implemented and appropriate for sparse
 *    per-Way data — NOT a "trained model" and NOT frontier. It keys on executor
 *    identity and counts labels; it is described as exactly that.
 *
 * 2. A REAL TRAINED MODEL (trainBehaviorModel, this file, over outsider-model.js):
 *    logistic regression fit by gradient descent over the FEATURES the record
 *    captures (steps, cost, cost-vs-peer, claim flags) AND the World's
 *    reversible/externality — with a held-out split for honest metrics. It USES
 *    the features (the audit's "ignores features" fix) and improves with data (a
 *    real learning curve). The same machinery is validated on REAL labels by
 *    scripts/outsider-train-model.mjs (SWE-bench matrix).
 *
 * No LLM, no GPU, local-first. The frontier CM-1/CM-2 research models are a
 * SEPARATE track and are NOT called from here — this file no longer pretends they
 * are; the prefix-conditional (mid-run) prediction is their future job.
 */

import { featurizeRecord, RECORD_FEATURE_NAMES } from "./outsider-features.js";
import { supervisedExperienceModelInput } from "./outsider-supervised-experience.js";
import {
  mulberry32, fitStandardizer, applyStandardizer, trainLogistic,
  auc as aucOf, logloss as loglossOf, serializeModel, predictFromRaw,
} from "./outsider-model.js";

/* the behaviors we predict, each a Bernoulli label on a completed run */
export const BEHAVIOR_SIGNALS = Object.freeze([
  "fakedSuccess",       // claimed pass/done, but a said-vs-did signal contradicted it
  "neededCorrection",   // the supervisor had to auto-correct at least once
  "escalated",          // the supervisor had to interrupt a human at least once
  "gatedIrreversible",  // an irreversible step was blocked before the contract was met
]);

/* the said-vs-did signals that mean a success claim was hollow */
import { trajectoryFromSteps } from "./outsider-feed-adapter.js";

const FAKE_FAMILY = new Set([
  "claims-pass-but-test-failed", "claims-done-but-no-change",
  "claims-tested-but-no-test-ran", "shallow-test-does-not-discriminate",
]);

const r4 = (x) => (x == null ? null : Number(Number(x).toFixed(4)));

/*
 * captureExperience — turn a session.state() snapshot into one labeled record.
 * Pure: give it the state (and optionally peers for cost-vs-peer), get a record.
 */
export function captureExperience(state, { peers = {} } = {}) {
  const auto = state.autoCorrections ?? [];
  const esc = state.escalations ?? [];
  const openMM = state.openMismatches ?? [];
  const gates = state.gates ?? [];
  const claims = state.claims ?? {};

  const signalsSeen = new Set([
    ...auto.map((a) => a.basedOn).filter(Boolean),
    ...openMM.map((m) => m.signal).filter(Boolean),
  ]);

  const labels = {
    fakedSuccess: [...signalsSeen].some((s) => FAKE_FAMILY.has(s)),
    neededCorrection: auto.length > 0,
    escalated: esc.length > 0,
    gatedIrreversible: gates.length > 0,
  };

  const cost = state.resources?.costUsd ?? null;
  return {
    schema: "outsider/experience/v1",
    executor: state.executor ?? null,
    world: state.world ?? null,
    claim: state.claim ?? null,
    features: {
      nSteps: state.steps ?? 0,
      claimedPass: !!claims.claimsPasses,
      claimedDone: !!claims.claimsDone,
      ranTestClaim: !!claims.ranTest,
      costUsd: cost,
      costVsPeer: (cost != null && peers.peerCostMedianUsd)
        ? Number((cost / peers.peerCostMedianUsd).toFixed(2)) : null,
    },
    labels,
    signalsSeen: [...signalsSeen],
    /*
     * trajectory (additive, v1-compatible): the run's SHAPE, so a captured
     * Experience can later feed the flywheel WITHOUT re-parsing logs. Derived
     * from the supervisor's step detail when available; absent otherwise —
     * never fabricated.
     */
    trajectory: Array.isArray(state.stepsDetail) && state.stepsDetail.length
      ? trajectoryFromSteps(state.stepsDetail) : null,
    trajectoryChecks: Array.isArray(state.trajectoryChecks) && state.trajectoryChecks.length
      ? state.trajectoryChecks : null,
    stateHash: state.stateHash ?? null,
  };
}

/*
 * makeExperienceLog — the durable, serializable corpus. Local-first: toJSON()
 * writes to disk between sessions, the seed restores it.
 */
export function makeExperienceLog(seed = []) {
  const records = Array.isArray(seed) ? seed.slice() : [];
  return {
    add(record) { records.push(record); return records.length; },
    addMany(rs) { for (const r of rs) records.push(r); return records.length; },
    records: () => records.slice(),
    size: () => records.length,
    toJSON: () => records.slice(),
  };
}

function recordsOf(logOrArray) {
  const records = logOrArray && typeof logOrArray.records === "function"
    ? logOrArray.records() : Array.isArray(logOrArray) ? logOrArray : [];
  return records.map((record) => record?.schema === "outsider/supervised-experience/v2"
    ? supervisedExperienceModelInput(record) : record);
}

/*
 * estimateK — the Bühlmann-Straub credibility constant K = σ² / τ² for a
 * Bernoulli behavior, by method of moments across executors. Small K ⇒ own
 * history earns credibility fast; large K ⇒ shrink hard toward the population.
 *
 * Guards, in the honest direction:
 *  - fewer than 2 executors with data ⇒ cannot estimate spread ⇒ a MODERATE
 *    default (do not pretend to know the executor differs from the population).
 *  - estimated between-executor variance ≤ 0 ⇒ evidence says executors do NOT
 *    differ ⇒ shrink HARD toward the population.
 */
function estimateK(perExecutor, pPop, defaultK) {
  const cells = Object.values(perExecutor).filter((c) => c.n > 0);
  if (cells.length < 2 || pPop <= 0 || pPop >= 1) return defaultK;
  const rates = cells.map((c) => c.k / c.n);
  const meanRate = rates.reduce((a, b) => a + b, 0) / rates.length;
  const totalVar = rates.reduce((a, r) => a + (r - meanRate) ** 2, 0) / (rates.length - 1);
  const withinComp = cells.reduce((a, c) => a + (pPop * (1 - pPop)) / c.n, 0) / cells.length;
  const tau2 = totalVar - withinComp;
  if (!(tau2 > 0)) return 1e4;                 // no real between-executor spread ⇒ shrink hard
  const sigma2 = pPop * (1 - pPop);
  return Math.max(0.5, Math.min(sigma2 / tau2, 1e6));
}

/*
 * fitBehaviorModel — count per executor, pool for a population base rate, and
 * fit K per behavior (classical credibility, not "training"). `priorRates[signal]
 * = { rate, strength }` OPTIONALLY seeds the population with a pseudo-count; when
 * no caller passes it (the current default everywhere), the population cold-starts
 * from the observed labels. No hidden "validated corpus" prior is wired in.
 */
export function fitBehaviorModel(logOrArray, { priorRates = {}, defaultK = 8, keyBy, signals: signalList = BEHAVIOR_SIGNALS } = {}) {
  const records = recordsOf(logOrArray);
  const key = keyBy ?? ((rec) => rec.executor?.id ?? "unknown");

  const signals = {};
  for (const signal of signalList) {
    const perExecutor = {};
    let pooledK = 0, pooledN = 0;
    for (const rec of records) {
      const id = key(rec);
      const cell = perExecutor[id] ?? (perExecutor[id] = { k: 0, n: 0 });
      const hit = rec.labels?.[signal] ? 1 : 0;
      cell.k += hit; cell.n += 1;
      pooledK += hit; pooledN += 1;
    }
    const prior = priorRates[signal];
    const priorStrength = prior?.strength ?? 0;
    const pPop = (pooledN + priorStrength) > 0
      ? (pooledK + (prior?.rate ?? 0) * priorStrength) / (pooledN + priorStrength)
      : (prior?.rate ?? 0);
    const K = estimateK(perExecutor, pPop, defaultK);
    signals[signal] = { pPop, K, perExecutor, nExecutors: Object.keys(perExecutor).length, nRecords: pooledN };
  }

  return { schema: "outsider/behavior-model/v1", nRecords: records.length, signals };
}

/*
 * predictBehavior — the forecast for one executor. For each behavior: the
 * credibility Z = n / (n + K), the blended rate Z·own + (1−Z)·population, and an
 * honest label for which side the estimate is leaning on.
 */
export function predictBehavior(model, { executor, world = null } = {}) {
  const execId = executor?.id ?? null;
  const forecasts = Object.entries(model.signals ?? {}).map(([signal, m]) => {
    const cell = m.perExecutor[execId] ?? { k: 0, n: 0 };
    const own = cell.n > 0 ? cell.k / cell.n : null;
    const Z = cell.n / (cell.n + m.K);
    const pHat = own == null ? m.pPop : Z * own + (1 - Z) * m.pPop;
    return {
      signal,
      pHat: r4(pHat),
      credibility: r4(Z),
      own: own == null ? null : r4(own),
      ownN: cell.n,
      population: r4(m.pPop),
      basis: Z >= 0.5 ? "own supervised history dominates"
        : cell.n === 0 ? "no own history — population base rate"
        : "leaning on the population (little own history)",
    };
  });
  return {
    schema: "outsider/behavior-forecast/v1",
    executor: { id: execId, kind: executor?.kind ?? "unknown" },
    world: world ? { kind: world.kind } : null,
    forecasts,
    disclaimer: "credibility-shrunk forecast from supervised history; not a verdict. "
      + "A high rate is a measured tendency of this Way, not a prediction that THIS "
      + "run will fail.",
  };
}

/*
 * makeRunningBehaviorModel — the fast incremental CREDIBILITY updater (this is
 * counting, not "training"). It keeps running per-executor k/n sufficient
 * statistics, updates them in O(batch), and recomputes pPop/K on demand
 * (O(#executors)) — so the per-Way rate stays current as telemetry streams in.
 * The REAL model training over features is trainBehaviorModel (SGD logistic);
 * the flywheel runs both. keyBy lets the backend key by a PRIVACY-HASHED id.
 */
export function makeRunningBehaviorModel({ priorRates = {}, defaultK = 8, keyBy } = {}) {
  const key = keyBy ?? ((rec) => rec.executorHash ?? rec.executor?.id ?? "unknown");
  const sig = {};
  for (const s of BEHAVIOR_SIGNALS) sig[s] = { perExecutor: {}, pooledK: 0, pooledN: 0 };
  let n = 0;

  function ingest(recs) {
    for (const source of (Array.isArray(recs) ? recs : [recs])) {
      const rec = source?.schema === "outsider/supervised-experience/v2"
        ? supervisedExperienceModelInput(source) : source;
      const id = key(rec);
      n += 1;
      for (const s of BEHAVIOR_SIGNALS) {
        const cell = sig[s].perExecutor[id] ?? (sig[s].perExecutor[id] = { k: 0, n: 0 });
        const hit = rec.labels?.[s] ? 1 : 0;
        cell.k += hit; cell.n += 1;
        sig[s].pooledK += hit; sig[s].pooledN += 1;
      }
    }
    return n;
  }

  function model() {
    const signals = {};
    for (const s of BEHAVIOR_SIGNALS) {
      const { perExecutor, pooledK, pooledN } = sig[s];
      const prior = priorRates[s];
      const ps = prior?.strength ?? 0;
      const pPop = (pooledN + ps) > 0
        ? (pooledK + (prior?.rate ?? 0) * ps) / (pooledN + ps)
        : (prior?.rate ?? 0);
      const K = estimateK(perExecutor, pPop, defaultK);
      signals[s] = { pPop, K, perExecutor,
        nExecutors: Object.keys(perExecutor).length, nRecords: pooledN };
    }
    return { schema: "outsider/behavior-model/v1", nRecords: n, signals };
  }

  return {
    ingest,
    predict: (sel) => predictBehavior(model(), sel),
    snapshot: model,
    size: () => n,
  };
}

/*
 * trainBehaviorModel — the PRODUCT's REAL training path. Fit a logistic
 * regression (SGD+L2) over the FEATURES of accumulated Experience records to
 * predict a behavior label, with a held-out split for honest metrics. This is
 * real supervised learning over the operator's own data — the same machinery the
 * SWE-bench training script validates on real labels — not a frequency count.
 * Returns { trained:false, reason } until there is enough labeled, two-class data.
 */
export function trainBehaviorModel(records, {
  signal = "fakedSuccess", testFrac = 0.25, minRecords = 40,
  l2 = 1e-3, lr = 0.2, epochs = 150, seed = 13,
} = {}) {
  const rows = recordsOf(records)
    .filter((r) => r?.labels && r.labels[signal] != null);
  if (rows.length < minRecords) {
    return { trained: false, reason: `need ≥${minRecords} labeled records, have ${rows.length}` };
  }
  const y = rows.map((r) => (r.labels[signal] ? 1 : 0));
  const pos = y.reduce((a, b) => a + b, 0);
  if (pos === 0 || pos === y.length) return { trained: false, reason: `only one class present for '${signal}'` };

  const rng = mulberry32(seed);
  const order = rows.map((_, i) => [rng(), i]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
  const nTest = Math.max(1, Math.floor(rows.length * testFrac));
  const testIdx = order.slice(0, nTest), trainIdx = order.slice(nTest);
  const Xall = rows.map(featurizeRecord);

  const Xtr = trainIdx.map((i) => Xall[i]), ytr = trainIdx.map((i) => y[i]);
  const std = fitStandardizer(Xtr);
  const model = trainLogistic(applyStandardizer(Xtr, std), ytr, { l2, lr, epochs, seed });
  const serialized = serializeModel(model, std, RECORD_FEATURE_NAMES, { signal, nTrain: trainIdx.length });

  const scores = testIdx.map((i) => predictFromRaw(serialized, Xall[i]));
  const yte = testIdx.map((i) => y[i]);
  const metrics = { auc: aucOf(scores, yte), logloss: loglossOf(scores, yte), nTest: testIdx.length };
  serialized.meta.test = metrics;
  return { trained: true, model: serialized, metrics, n: rows.length };
}

/* predict a behavior probability for ONE record from a trained model */
export function modelForecast(serialized, record) {
  const normalized = record?.schema === "outsider/supervised-experience/v2"
    ? supervisedExperienceModelInput(record) : record;
  return predictFromRaw(serialized, featurizeRecord(normalized));
}

/*
 * contractPriorFromForecast — close the loop. When the model says an executor
 * fakes success often enough, and there is enough history to believe it, the
 * next run's proposed contract should tighten. This is what "supervised behavior
 * forms our own model" pays out as: the model feeds the next supervision.
 */
export function contractPriorFromForecast(forecast) {
  const fake = forecast?.forecasts?.find((f) => f.signal === "fakedSuccess");
  const recommendations = [];
  if (fake && fake.pHat >= 0.25 && fake.credibility >= 0.3) {
    recommendations.push({
      field: "requireTestBeforeDone", value: true,
      reason: `this executor faked success in ${Math.round(fake.pHat * 100)}% of its `
        + `supervised runs (credibility ${fake.credibility}, n=${fake.ownN}); keep the `
        + "test gate on",
    });
    recommendations.push({
      field: "recommendDifferentialTest", value: true,
      reason: "a high faked-success history warrants the rigorous differential "
        + "shallow-test check at submit time",
    });
  }
  return {
    recommendations,
    note: recommendations.length
      ? "the behavior model recommends a stricter contract for this executor"
      : "no behavior-based tightening recommended",
  };
}
