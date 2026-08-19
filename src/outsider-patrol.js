/*
 * 巡检 —— 监工在车间里走，不是在装货口等。
 *
 * WHY THIS EXISTS, IN THE OPERATOR'S OWN WORDS
 * ============================================
 * "如果我一觉醒来，我发现 agent 做错了，我还需要你一个 outsider 来提醒我？
 *  我作为用户，自己看一遍发现不对，我直接发条信息说再做一遍就行了。"
 *
 * He is right, and this repo's own traffic proves it. Replaying a real 878-step
 * session through the shipped engine, the interventions split:
 *
 *     出厂那一刻说的   28 次   72%
 *     干活途中说的     11 次   28%
 *       └ of which: 4 charter nags, 3 destructive denies (the host's own
 *         permission dialog already does those), 3 said-vs-did, and exactly
 *         ONE genuinely-Outsider, genuinely-mid-work intervention in 878 steps.
 *
 * A supervisor whose weight sits at the shipping dock is an auditor, and an
 * auditor is replaceable by the operator typing "自审一遍" in the morning — for
 * free. The 对照 is real (it reads the RECORD, where a self-audit reads the
 * agent's own contaminated memory) but that difference only pays if it happens
 * DURING the night, repeatedly. At the end it buys nothing he cannot do himself.
 *
 * THE MEASUREMENT ERROR UNDERNEATH IT
 * ===================================
 * Six rounds of numbers — 0.25% interrupts, 3.00% warns, 125/125, 679/679 — and
 * not one of them is a LEAD TIME. The entire value of this product is how early
 * it speaks: catching drift at hour 10 is worth zero (the operator catches it
 * free), catching it at hour 1 is worth nine hours. Rates were the wrong
 * instrument all along. `patrolLead` below exists to produce the right one.
 *
 * WHY A DIFFERENT SET OF GAPS THAN 出厂验收
 * =========================================
 * The delivery checks are delivery-specific: "the green light happened before
 * the last edit" is a defect at the shipping dock and completely normal
 * mid-work. So a patrol cannot reuse them. It needs signals that are only
 * visible on the STRATEGIC window — the timescale the operator's diseases
 * actually live on (架构一点一点做偏, 无关紧要的分支, 屎山), and the one where
 * the earlier control-arm work found headroom at all (50–120 steps, not 5).
 *
 * CALIBRATED BEFORE IT WAS WIRED, on the same real session:
 *
 *     离上一次绿灯的距离   中位 6 步 · p90 25 · p99 47 · 最长 54
 *     判据「离绿灯 ≥ N 步」  N=5 → 60.5% 的步 · N=20 → 15.0% · N=50 → 0.6%
 *
 * N=5 and N=20 are wallpaper. N=50 fires on 0.6% of steps on a HEALTHY night,
 * which is the budget a supervisor gets to spend. That is why the threshold is
 * 50 and not a round number someone liked.
 */

export const PATROL_SINCE_GREEN = 50; /* calibrated: 0.6% of steps on a clean run */
export const PATROL_MIN_UNVERIFIED = 2;

/*
 * The strategic view of the run so far. Everything here is a fact about the
 * WORKER that the worker has no access to — the same rule the evidence packet
 * follows, because a patrol that reports the agent's own beliefs back to it is
 * the banner on the factory wall the operator already rejected.
 */
export function patrolFacts(steps = []) {
  let lastGreen = -1, lastTest = -1;
  const unverified = new Set();
  for (let i = 0; i < steps.length; i += 1) {
    const s = steps[i];
    if (s.isEdit && s.file) unverified.add(s.file);
    if (s.isTest && s.exit != null) {
      lastTest = i;
      /* ONLY A GREEN CLEARS IT. A red run is not verification — it is the
         opposite — and treating "we ran something" as progress is exactly how a
         run convinces itself it is fine while nothing has been confirmed. */
      if (s.exit === 0) { lastGreen = i; unverified.clear(); }
    }
  }
  const n = steps.length;
  return {
    steps: n,
    sinceGreen: lastGreen < 0 ? n : n - lastGreen,
    everGreen: lastGreen >= 0,
    sinceTest: lastTest < 0 ? n : n - lastTest,
    unverifiedFiles: [...unverified],
  };
}

/*
 * 巡检的判断 —— and the throttle is a DELTA, not a clock.
 *
 * THE FIRST VERSION USED A CADENCE (speak at 50, 75, 100 …) AND THE REGRESSION
 * WALL KILLED IT. The hook judges a WINDOWED own chain, so `sinceGreen`
 * saturates at the window length; once saturated it never again lands on an
 * exact multiple, and the patrol goes permanently silent — in precisely the
 * longest, worst run, which is the only case it exists for. A throttle that
 * fails silently in the bad case is worse than no throttle.
 *
 * So it speaks when THE BLAST RADIUS GROWS: the proposed edit lands on a file
 * that is not already in the unverified set, while the run is past the strategic
 * threshold. That is self-limiting by construction (at most once per file), it
 * needs no state that can go stale, and it says the true thing — 波及面又大了一
 * 个，而你到现在还没有任何证据。 A run that keeps re-editing the same handful of
 * files is not spreading, and hears it once.
 */
export function assessPatrol(steps = [], {
  proposed = null,
  sinceGreen = PATROL_SINCE_GREEN, minUnverified = PATROL_MIN_UNVERIFIED } = {}) {
  const f = patrolFacts(steps);
  if (f.sinceGreen < sinceGreen) return { detected: false, facts: f };
  if (f.unverifiedFiles.length < minUnverified) return { detected: false, facts: f };
  /*
   * With no proposed call (offline analysis, `patrolLead`) the delta cannot be
   * evaluated, so the threshold alone decides — that is the measurement path,
   * not the speaking path.
   */
  if (proposed) {
    if (!proposed.isEdit || !proposed.file) return { detected: false, facts: f };
    if (f.unverifiedFiles.includes(proposed.file)) return { detected: false, facts: f };
  }

  const files = f.unverifiedFiles.slice(0, 8).join("、")
    + (f.unverifiedFiles.length > 8 ? ` 等 ${f.unverifiedFiles.length} 个` : "");
  const observed = f.everGreen
    ? `连续 ${f.sinceGreen} 步没有一次绿灯，这段里改过的 ${f.unverifiedFiles.length} 个文件`
      + "一个都还没有被验证过"
    : `这一轮跑了 ${f.steps} 步，从头到尾没有出现过一次绿灯，`
      + `已经改了 ${f.unverifiedFiles.length} 个文件`;

  return {
    detected: true, facts: f, kind: "long-way-from-green",
    observed,
    corrective: [
      `outsider·巡检：${observed}`
        + (proposed ? `，而这一步又要动一个新的（${proposed.file}）。` : "。"),
      "",
      `  还没被验证的：${files}`,
      "",
      "这不是说你做错了 —— 是说【现在没有任何证据说你做对了】，而波及面还在扩大。",
      "越往后走，一次改错的代价越大：要么后面的每一步都建在它上面，要么最后一起返工。",
      "",
      "现在做一件事就够了：**挑一块能立刻验证的，跑一次测试，把它变绿。**",
      "如果这些改动暂时验证不了，说明这一段的范围铺得太宽了 —— 把它收回到能验证的最小一块，",
      "先绿一次，再往外扩。不要停，也不要接着往前铺。",
    ].join("\n"),
  };
}

/*
 * 提前量 —— the number this product should have been reporting all along.
 *
 * Given a run and the step at which something was finally caught (a delivery
 * failure, a red suite, an operator's morning complaint), how many steps EARLIER
 * would the patrol have spoken? That difference, times the price of a step, is
 * the whole case for a supervisor over a self-audit.
 */
export function patrolLead(steps = [], caughtAt = null, opts = {}) {
  const end = caughtAt == null ? steps.length : caughtAt;
  for (let i = 1; i <= end; i += 1) {
    const a = assessPatrol(steps.slice(0, i), opts);
    if (a.detected) return { spokeAt: i, caughtAt: end, leadSteps: end - i, observed: a.observed };
  }
  return { spokeAt: null, caughtAt: end, leadSteps: 0, observed: null };
}
