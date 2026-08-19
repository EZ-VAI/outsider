/*
 * THE RATCHET — 每修一次，这台机器就重一点。
 *
 * WHY THIS IS NOT A COMPLEXITY CHECK
 * ==================================
 * The level-based version was calibrated on 19.5万 lines of real code and
 * failed the wiring bar outright: it fires on 82.6%–92.0% of files, because
 * "cyclomatic > 10" is a style threshold, not a defect. Wiring that would make
 * Outsider a linter with a stop sign — the thing this project was told not to
 * build. (V73 has the numbers.)
 *
 * The operator's actual complaint was never "the code is complex". It was
 * "打地鼠方式解决 errors" — a PROCESS, in which each repair leaves the part
 * heavier than it was. On the factory floor the difference is obvious and it is
 * the whole design here:
 *
 *   a worker adding a new part          → the machine gets bigger. Fine.
 *   a worker adding weight EVERY TIME    → the third repair of the same fault
 *   he re-fixes the same fault             each welds another bracket on. That
 *                                          is a machine being repaired into
 *                                          scrap, and it is what the foreman
 *                                          exists to catch.
 *
 * So the ratchet is NOT an independent detector with its own firing rate. It
 * rides on the whack-a-mole assessment, which already has real-traffic
 * calibration (fires once in a 500-call session, a true positive). The loop
 * decides WHETHER we are in a repair chain; the ratchet only says what has been
 * happening to the part inside it. Its base rate is therefore bounded by a
 * detector that has already been measured, which is the only honest way to add
 * a signal to a live gate on this much evidence.
 *
 * MEASURED, on 100 real Edit calls from a live session:
 *
 *     one edit          p50 +1   p75  +6   p90 +10   p95 +15   max +45
 *     three in a row    p50 +7   p75 +15   p90 +24   p95 +48   max +67
 *
 * so the thresholds below sit at roughly the 90th percentile of real editing,
 * and the whole rule (perEdit ≥ 8 twice, chain ≥ 25) selects 3.1% of three-edit
 * windows — BEFORE the loop gate, which is itself a once-per-session event. The
 * largest single deltas in that sample were new features, not repairs, which is
 * exactly why this must never fire outside a repair chain.
 */

/*
 * A branch-token count, not an AST walk. The AST version costs ~350ms on 25
 * files; this runs on every parsed edit in the hot path, so it has to be one
 * linear scan. It counts the same thing cyclomatic complexity counts — the
 * number of ways through — and for a DELTA between two versions of the same
 * fragment, the constant offset cancels.
 *
 * Strings and comments are stripped first: a `||` inside a message string is
 * not a branch, and this repo has already been bitten three times by reading
 * data as code.
 */
const STRIP = /\/\*[\s\S]*?\*\/|\/\/[^\n]*|(['"`])(?:\\.|(?!\1)[\s\S])*?\1/g;
/*
 * `??` and `?.` are branches — each is a conditional evaluation — but each must
 * count ONCE. The first version had no `\?\?` alternative, so the single-`?`
 * rule matched both characters of `??` separately and every nullish coalesce
 * inflated the delta by one. A miscount here does not fail loudly; it just
 * makes every edit look heavier than it is, which for a threshold signal is the
 * worst kind of wrong.
 */
const BRANCH = /\b(?:if|else\s+if|for|while|case|catch)\b|&&|\|\||\?\?|\?\.|(?<![=!<>?])\?(?!\.|\?)/g;

export function branchCount(text) {
  const s = String(text ?? "").replace(STRIP, " ");
  const m = s.match(BRANCH);
  return m ? m.length : 0;
}

/* how much heavier this edit leaves the part */
export function deltaOf(oldText, newText) {
  return branchCount(newText) - branchCount(oldText);
}

export const DEFAULT_RATCHET_POLICY = Object.freeze({
  /* p90 of a single real edit is +10, so +8 is "this one added branching",
     not merely "this one is big". The bar that matters is the SUM across the
     repair chain — one heavy edit is a fix, several in a row is a ratchet. */
  perEdit: 8,
  chainTotal: 25,
  minEdits: 2,
});

/*
 * assessRatchet — only meaningful inside a repair chain.
 *
 * `attemptEdits` are the edits made since the failure being repaired first went
 * red, newest last, each carrying the `cx` delta recorded when it was parsed.
 * `proposed` is the edit about to happen, whose delta we can compute exactly
 * because the host hands us both sides of it.
 *
 * Returns null when there is nothing to say — the common case, and deliberately
 * not a "no finding" object, so a caller cannot accidentally render it.
 */
export function assessRatchet({ attemptEdits = [], proposed = null, policy = {} } = {}) {
  const p = { ...DEFAULT_RATCHET_POLICY, ...policy };
  const deltas = attemptEdits
    .map((s) => (Number.isFinite(s?.cx) ? s.cx : null))
    .filter((d) => d != null);
  const pending = proposed && Number.isFinite(proposed.cx) ? proposed.cx : null;
  const all = pending != null ? [...deltas, pending] : deltas;
  if (all.length < p.minEdits) return null;

  const total = all.reduce((n, d) => n + d, 0);
  const heavy = all.filter((d) => d >= p.perEdit).length;
  if (total < p.chainTotal || heavy < 2) return null;

  return {
    kind: "complexity-ratchet",
    severity: "evidence",              // never a verdict of its own — see header
    total,
    heavy,
    edits: all.length,
    observed: `同一个错误的这轮修复里，${all.length} 次编辑净增了 ${total} 个分支`
      + `（其中 ${heavy} 次单独就 ≥${p.perEdit}）`,
    reads: "不是「这段代码复杂」——那条已经被真实代码证伪了。是「同一处越修越重」："
      + "每补一次就多一条分支，这正是打地鼠留下的痕迹",
  };
}

/* one line for the foreman to say, appended to the loop's own corrective */
export function ratchetNote(r) {
  if (!r) return "";
  return `\n· 而且这一轮修下来净增了 ${r.total} 个分支 —— 这台机器每修一次就重一点，`
    + `再补一个分支只会更难修。先把已有的分支收回去，再谈下一处。`;
}
