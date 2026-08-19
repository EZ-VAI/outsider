/*
 * Featurization — turn a run (a matrix cell, or a supervised Experience record)
 * into the numeric feature vector the model learns over. This is where the
 * ontology becomes numbers the model actually USES:
 *
 *   Way (executor)  -> wayRate         : the executor's credibility-shrunk success rate
 *   Claim (task)    -> claimDifficulty : the task's credibility-shrunk success rate
 *   Resource        -> logCost, logApiCalls, costResidual (spend vs the task's median)
 *
 * All rates are computed ONLY from the training split and shrunk toward the global
 * rate (Bühlmann pseudo-count) so a Way/Claim seen a few times is not over-trusted
 * and, crucially, no test label leaks into a feature.
 */

import { WORLD_KINDS } from "./outsider-execution-trace.js";

export const FEATURE_NAMES = ["wayRate", "claimDifficulty", "logCost", "logApiCalls", "costResidual"];

const median = (a) => {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/*
 * buildContext — fit the featurization stats on TRAIN cells only.
 * cell = { systemIndex, instanceIndex, resolved, costUsd, apiCalls }.
 * `shrink` is the Bühlmann pseudo-count (credibility toward the global rate).
 */
export function buildContext(trainCells, { shrink = 5 } = {}) {
  const globalRate = trainCells.length
    ? trainCells.reduce((a, c) => a + (c.resolved ? 1 : 0), 0) / trainCells.length : 0;
  const wayAgg = new Map(), claimAgg = new Map(), claimCosts = new Map();
  const bump = (m, k, hit) => { const c = m.get(k) ?? { k: 0, n: 0 }; c.k += hit ? 1 : 0; c.n += 1; m.set(k, c); };
  for (const c of trainCells) {
    bump(wayAgg, c.systemIndex, c.resolved);
    bump(claimAgg, c.instanceIndex, c.resolved);
    const arr = claimCosts.get(c.instanceIndex) ?? [];
    arr.push(Math.max(0, c.costUsd ?? 0));
    claimCosts.set(c.instanceIndex, arr);
  }
  const wayRate = new Map(), claimRate = new Map(), claimMedianCost = new Map();
  for (const [s, { k, n }] of wayAgg) wayRate.set(s, (k + shrink * globalRate) / (n + shrink));
  for (const [i, { k, n }] of claimAgg) claimRate.set(i, (k + shrink * globalRate) / (n + shrink));
  for (const [i, costs] of claimCosts) claimMedianCost.set(i, median(costs));
  return { globalRate, wayRate, claimRate, claimMedianCost };
}

export function featurize(cell, ctx) {
  const wr = ctx.wayRate.get(cell.systemIndex) ?? ctx.globalRate;
  const cd = ctx.claimRate.get(cell.instanceIndex) ?? ctx.globalRate;
  const cost = Math.max(0, cell.costUsd ?? 0);
  const logCost = Math.log1p(cost);
  const logApi = Math.log1p(Math.max(0, cell.apiCalls ?? 0));
  const medCost = ctx.claimMedianCost.get(cell.instanceIndex);
  const costResidual = logCost - Math.log1p(medCost != null ? medCost : cost);
  return [wr, cd, logCost, logApi, costResidual];
}

/* the two obvious baselines any real model must beat */
export function baselineGlobal(cell, ctx) { return ctx.globalRate; }
export function baselineClaim(cell, ctx) { return ctx.claimRate.get(cell.instanceIndex) ?? ctx.globalRate; }

/*
 * featurizeRecord — the PRODUCT path: turn a supervised Experience record into a
 * feature vector the behavior model trains on. Uses the trajectory features it
 * captured (steps, cost, cost-vs-peer, the agent's own claim flags) AND the two
 * clearing-relevant World properties (reversible, externality) — i.e. it USES the
 * features and CONDITIONS on the World, the two things the old count-only "model"
 * did not do.
 */
export const RECORD_FEATURE_NAMES = [
  "logSteps", "logCost", "costVsPeer", "claimedPass", "claimedDone",
  "ranTestClaim", "worldIrreversible", "worldExternality",
];
export function featurizeRecord(record) {
  const f = record.features ?? {};
  const w = record.world ?? {};
  /* resolve World properties from an explicit object OR a bare worldKind (as in
     redacted telemetry) */
  const wk = w.kind ?? record.worldKind ?? "unknown";
  const props = WORLD_KINDS[wk] ?? WORLD_KINDS.unknown;
  const reversible = w.reversible ?? props.reversible;
  const externality = w.externality ?? props.externality;
  return [
    Math.log1p(Math.max(0, f.nSteps ?? 0)),
    Math.log1p(Math.max(0, f.costUsd ?? 0)),
    Number.isFinite(f.costVsPeer) ? f.costVsPeer : 1,
    f.claimedPass ? 1 : 0,
    f.claimedDone ? 1 : 0,
    f.ranTestClaim ? 1 : 0,
    reversible === false ? 1 : 0,
    externality === true ? 1 : 0,
  ];
}
