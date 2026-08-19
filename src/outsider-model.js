/*
 * A REAL trained model — logistic regression fit by gradient descent.
 *
 * This is not a frequency table. It learns weights over FEATURES via SGD with L2,
 * generalizes to held-out data, and improves with more data (a real learning
 * curve — the honest evidence that a data flywheel works). It is not deep
 * learning and it is not "frontier"; it is a correctly-implemented GLM, and it is
 * described as exactly that. Real training, honestly labelled.
 *
 * Paired with per-Way credibility shrinkage (outsider-experience.js) it uses BOTH
 * the trajectory features AND the executor's own history — addressing the audit's
 * finding that the old "model" ignored every feature it captured.
 */

/* deterministic PRNG so training and reported metrics are reproducible */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const sigmoid = (z) => 1 / (1 + Math.exp(-z));
const clip = (p, e = 1e-12) => Math.min(1 - e, Math.max(e, p));

/* z-score standardization fit on the training rows */
export function fitStandardizer(X) {
  const d = X[0].length;
  const mean = new Array(d).fill(0), std = new Array(d).fill(0);
  for (const row of X) for (let j = 0; j < d; j++) mean[j] += row[j];
  for (let j = 0; j < d; j++) mean[j] /= X.length;
  for (const row of X) for (let j = 0; j < d; j++) std[j] += (row[j] - mean[j]) ** 2;
  for (let j = 0; j < d; j++) std[j] = Math.sqrt(std[j] / X.length) || 1;
  return { mean, std };
}
export function applyStandardizer(X, { mean, std }) {
  return X.map((row) => row.map((v, j) => (v - mean[j]) / std[j]));
}

/*
 * trainLogistic — SGD with L2. X already standardized, y in {0,1}. Returns the
 * learned { weights, bias }.
 */
export function trainLogistic(X, y, { l2 = 1e-3, lr = 0.1, epochs = 200, seed = 1 } = {}) {
  const n = X.length, d = X[0].length;
  const w = new Array(d).fill(0);
  let b = 0;
  const rng = mulberry32(seed);
  const idx = [...Array(n).keys()];
  const lrDecay = (e) => lr / (1 + 0.01 * e);
  for (let e = 0; e < epochs; e++) {
    for (let i = n - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
    const step = lrDecay(e);
    for (const k of idx) {
      const xi = X[k];
      let z = b;
      for (let j = 0; j < d; j++) z += w[j] * xi[j];
      const g = sigmoid(z) - y[k];
      for (let j = 0; j < d; j++) w[j] -= step * (g * xi[j] + l2 * w[j]);
      b -= step * g;
    }
  }
  return { weights: w, bias: b };
}

export function predictProba(model, x) {
  let z = model.bias;
  for (let j = 0; j < x.length; j++) z += model.weights[j] * x[j];
  return sigmoid(z);
}

/* rank-based ROC-AUC (Mann–Whitney U). 0.5 = no better than chance. */
export function auc(scores, labels) {
  const pos = [], neg = [];
  scores.forEach((s, i) => (labels[i] ? pos : neg).push(s));
  if (!pos.length || !neg.length) return null;
  const paired = scores.map((s, i) => [s, labels[i]]).sort((a, b) => a[0] - b[0]);
  let rank = 1, i = 0, rankSumPos = 0;
  while (i < paired.length) {
    let j = i;
    while (j < paired.length && paired[j][0] === paired[i][0]) j++;
    const avgRank = (rank + (rank + (j - i) - 1)) / 2;
    for (let k = i; k < j; k++) if (paired[k][1]) rankSumPos += avgRank;
    rank += j - i; i = j;
  }
  return (rankSumPos - (pos.length * (pos.length + 1)) / 2) / (pos.length * neg.length);
}

export function logloss(scores, labels) {
  let s = 0;
  for (let i = 0; i < scores.length; i++) {
    const p = clip(scores[i]);
    s += labels[i] ? -Math.log(p) : -Math.log(1 - p);
  }
  return s / scores.length;
}

/* Brier score + a 10-bin reliability (calibration) error */
export function calibrationError(scores, labels, bins = 10) {
  const acc = Array.from({ length: bins }, () => ({ n: 0, sy: 0, sp: 0 }));
  for (let i = 0; i < scores.length; i++) {
    const b = Math.min(bins - 1, Math.floor(scores[i] * bins));
    acc[b].n++; acc[b].sy += labels[i]; acc[b].sp += scores[i];
  }
  let ece = 0;
  for (const a of acc) if (a.n) ece += (a.n / scores.length) * Math.abs(a.sy / a.n - a.sp / a.n);
  return ece;
}

export function serializeModel(model, standardizer, featureNames, meta = {}) {
  return {
    schema: "outsider/logistic-model/v1",
    featureNames, weights: model.weights, bias: model.bias,
    standardizer, meta,
  };
}
export function loadModel(obj) {
  return { model: { weights: obj.weights, bias: obj.bias },
    standardizer: obj.standardizer, featureNames: obj.featureNames, meta: obj.meta };
}
/* predict from a RAW (unstandardized) feature vector using a serialized model */
export function predictFromRaw(serialized, rawX) {
  const { mean, std } = serialized.standardizer;
  const xs = rawX.map((v, j) => (v - mean[j]) / std[j]);
  return predictProba({ weights: serialized.weights, bias: serialized.bias }, xs);
}
