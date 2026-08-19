/*
 * 合规率 —— 工人到底听不听监工的话。
 *
 * THE ONE NUMBER THAT CAN INVALIDATE EVERYTHING ELSE
 * ==================================================
 * Every other measurement in this repo describes the supervisor: how rarely it
 * interrupts (0.37%), how fast it answers (163ms), how much of the floor it can
 * see (was 61%, now all of it). None of them touch the question the whole
 * product rests on — after the foreman speaks, does the worker do it?
 *
 * If that number is zero, a perfect detector, a perfectly grounded correction
 * and a perfectly quiet gate are all worth nothing. The foreman is shouting at a
 * floor that cannot hear him. So it gets measured before anything is claimed,
 * and it gets measured in a way that cannot flatter itself.
 *
 * WHY THE FIRST ATTEMPT RETURNED 2 SAMPLES
 * ========================================
 * The natural experiment already in every transcript — "the agent piped the
 * traceback away" vs "the agent could see it" — yielded 2 usable pairs on a real
 * 800-step session, because 94.3% of failing tests named no source file at all.
 * The instrument's own power analysis wants ≥30. So the control arm cannot be
 * recovered from history alone; it has to be COLLECTED.
 *
 * THREE ARMS, AND THE CHEAPEST ONE NEEDS NO PERMISSION TO INTERRUPT
 * ================================================================
 *   shadow      compute everything, say NOTHING, record what would have been
 *               said and what the agent then did on its own. This is the
 *               control arm, and it carries literally zero risk of the failure
 *               that killed the first install — it cannot deny anything. It is
 *               the version to hand to someone who has never met this product.
 *
 *   experiment  deterministic alternation: speak on half the qualifying moments,
 *               stay silent on the other half, assigned by a hash of the moment
 *               so the split is reproducible and cannot drift with mood or phase
 *               (which is exactly the weakness of the piped-vs-visible arm).
 *               Both arms in one session, one user, no coordination.
 *
 *   live        speak every time. Intervention arm only, compared against the
 *               pooled control from the other two.
 *
 * Destructive refusals are NEVER part of the experiment. Withholding a `rm -rf`
 * block to collect a data point would be running an experiment with someone
 * else's disk, and no number is worth that.
 *
 * COMPLIANCE AND EFFECT ARE DIFFERENT QUESTIONS, KEPT APART ON PURPOSE
 * ===================================================================
 * Compliance: did the agent do the mechanical thing asked (edit that file, run
 * that command, not submit)? Effect: did the run get better? A high compliance
 * with no effect is a real and important outcome — it means the corrections are
 * obeyed and useless — and collapsing the two into one "it works" number is how
 * that finding would be hidden.
 */

export const SHADOW_PATH = ".outsider/shadow.jsonl";

/* stable, dependency-free, and NOT Math.random(): the arm has to be recomputable
   from the record months later, or the experiment cannot be audited */
export function armOf(key, arms = 2) {
  let h = 2166136261;
  const s = String(key ?? "");
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0) % arms;
}

/*
 * WHAT WOULD COUNT AS DOING IT — pinned per intervention kind, mechanically, in
 * advance. A compliance number computed against a definition invented after
 * seeing the data is not a measurement.
 */
export function complianceProbe(decision) {
  if (!decision || decision.verdict === "allow") return null;
  const d = decision;

  /* 1. the loop / fault card names a file: comply = the next edit lands on it */
  const target = d.loop?.escape?.[0] ?? d.loop?.failingFiles?.[0] ?? null;
  if (target) {
    return { kind: "edit-the-named-file", expect: { file: String(target) },
      window: 6, reason: String(d.reason ?? "").slice(0, 160) };
  }
  /* 2. about to finish on a red or absent test: comply = do not submit next;
        run the test or edit first */
  if (/submit|finish|commit/i.test(String(d.reason ?? "")) || d.proposed?.isSubmit) {
    return { kind: "do-not-submit-yet", expect: { notSubmit: true }, window: 4,
      reason: String(d.reason ?? "").slice(0, 160) };
  }
  /*
   * 3. a charter request asks for a CHARTER, not for a test run.
   *
   * Scoring "did a test run" against "declare what you are doing" measured the
   * wrong thing, and for three rounds it was the ONLY sample the experiment had —
   * one row, graded against a predicate that had nothing to do with the ask.
   */
  if (/还没有 charter|no charter|charter-missing/i.test(String(d.reason ?? ""))) {
    return { kind: "declare-a-charter", expect: { charter: true }, window: 12,
      reason: String(d.reason ?? "").slice(0, 160) };
  }
  /* an acceptance finding really does want the acceptance command run */
  if (d.drift || /acceptance/i.test(String(d.reason ?? ""))) {
    return { kind: "run-the-acceptance", expect: { runsTest: true }, window: 8,
      reason: String(d.reason ?? "").slice(0, 160) };
  }
  /*
   * 3·5. THE WASTE SIGNALS — each one asks for something specific, and each of
   * those asks is falsifiable.
   *
   * These were ALL landing in the unmeasurable bucket: 20 of a real session's 22
   * interventions, three rounds running, which made the compliance experiment
   * yield 2 samples and no more. The predicates below existed as English in the
   * corrective all along ("stop repeating `X`", "run the tests once") — they
   * simply had never been written down as something a machine could check.
   *
   * Every one can come out FALSE, which is the bar the `chose-another-path`
   * predicate failed: an agent that keeps re-issuing the same command, never
   * runs a test, or submits anyway all score as non-compliance.
   */
  const w = d.waste?.findings?.[0] ?? null;
  if (w?.kind === "repeated-action" && w.action) {
    return { kind: "stop-repeating", expect: { action: String(w.action) }, window: 5,
      reason: String(d.reason ?? "").slice(0, 160) };
  }
  if (w?.kind === "no-progress-test-loop" && w.action) {
    /* the correction is "edit before re-running", so an edit is the compliance */
    return { kind: "edit-before-rerun", expect: { action: String(w.action) }, window: 4,
      reason: String(d.reason ?? "").slice(0, 160) };
  }
  if (w?.kind === "redundant-reread" && w.file) {
    return { kind: "stop-rereading", expect: { file: String(w.file) }, window: 5,
      reason: String(d.reason ?? "").slice(0, 160) };
  }
  if (w?.kind === "never-ran-a-test") {
    return { kind: "run-a-test", expect: { runsTest: true }, window: 5,
      reason: String(d.reason ?? "").slice(0, 160) };
  }
  if (w?.kind === "claims-done-but-no-change" || /said-vs-did|claims-done/i.test(String(w?.kind ?? ""))) {
    return { kind: "back-it-up", expect: { editOrTest: true }, window: 5,
      reason: String(d.reason ?? "").slice(0, 160) };
  }
  /* the loop's early rung names a file even when there is no escape route yet */
  const failing = d.loop?.failingFiles?.[0] ?? null;
  if (failing) {
    return { kind: "edit-the-named-file", expect: { file: String(failing) }, window: 6,
      reason: String(d.reason ?? "").slice(0, 160) };
  }
  /*
   * 4. NOTHING MECHANICALLY CHECKABLE — and that is now said, not scored.
   *
   * This used to return a `chose-another-path` probe: "comply = the agent's next
   * action has a different signature". Two independent rounds on a stranger's
   * 9-day log scored it 20/20 and 20/20, which reads like "the agent always
   * complies" and is actually "the predicate is almost always true". An agent
   * doing literally anything next satisfies it.
   *
   * The tempting conclusion was that these interventions are useless because the
   * agent self-corrects. The measurement does not support that — it does not
   * support anything, because a predicate that cannot come out false cannot
   * discriminate. Scoring it inflated the compliance denominator with 20 rows
   * that carry no information, and those 20 were about to be used to justify
   * removing a signal.
   *
   * So: no probe. The moment is still counted and reported as UNMEASURABLE,
   * which is the true state of it. Inventing a better predicate for these is
   * real work and it has not been done.
   */
  return null;
}

const norm = (a) => String(a ?? "").replace(/\s+/g, " ").trim();

const sameFile = (a, b) => {
  const x = String(a).replace(/\\/g, "/"), y = String(b).replace(/\\/g, "/");
  return x === y || x.endsWith(`/${y}`) || y.endsWith(`/${x}`);
};

/*
 * scoreProbe — did it happen, inside the window?
 *
 * Returns "complied" | "did-not" | "unknown". UNKNOWN IS A REAL ANSWER and is
 * never folded into either of the others: a run that simply ended after the
 * intervention tells us nothing, and counting silence as non-compliance would
 * bias the number down exactly where the sample is thinnest.
 */
export function scoreProbe(probe, following = []) {
  if (!probe) return "unknown";
  const win = following.slice(0, probe.window);
  if (!win.length) return "unknown";

  if (probe.kind === "edit-the-named-file") {
    const edits = win.filter((s) => s.isEdit);
    if (!edits.length) return "unknown";
    return edits.some((s) => s.file && sameFile(s.file, probe.expect.file)) ? "complied" : "did-not";
  }
  if (probe.kind === "do-not-submit-yet") {
    const submitted = win.some((s) => s.isSubmit);
    if (submitted) return "did-not";
    return win.some((s) => s.isTest || s.isEdit) ? "complied" : "unknown";
  }
  if (probe.kind === "run-the-acceptance") {
    return win.some((s) => s.isTest) ? "complied" : "did-not";
  }
  if (probe.kind === "stop-repeating") {
    /* falsifiable in the only way that matters: it can keep doing it */
    return win.some((s) => norm(s.action) === norm(probe.expect.action)) ? "did-not" : "complied";
  }
  if (probe.kind === "edit-before-rerun") {
    const reran = win.findIndex((s) => norm(s.action) === norm(probe.expect.action));
    const edited = win.findIndex((s) => s.isEdit);
    if (edited < 0 && reran < 0) return "unknown";
    if (edited < 0) return "did-not";
    return reran < 0 || edited < reran ? "complied" : "did-not";
  }
  if (probe.kind === "stop-rereading") {
    return win.some((s) => s.file && sameFile(s.file, probe.expect.file)
      && !s.isEdit) ? "did-not" : "complied";
  }
  if (probe.kind === "run-a-test") {
    if (win.some((s) => s.isTest)) return "complied";
    return win.some((s) => s.isSubmit) ? "did-not" : "unknown";
  }
  if (probe.kind === "back-it-up") {
    /*
     * TIGHTENED, because its placebo floor was 77.6% — "did the agent do
     * anything at all in the next five steps" is true almost always, and a
     * predicate that cannot fail cannot measure. The claim was "this is done";
     * the only thing that backs that up is a CHANGE. A test run does not: an
     * agent that re-runs the suite and submits anyway has not backed anything up.
     */
    if (win.some((s) => s.isEdit)) return "complied";
    return win.some((s) => s.isSubmit || s.isTest) ? "did-not" : "unknown";
  }
  if (probe.kind === "declare-a-charter") {
    if (win.some((s) => s.charterBody || /charter\.json/.test(String(s.file ?? "")))) return "complied";
    return "did-not";
  }
  if (probe.kind === "chose-another-path") {
    if (!probe.expect.differentSig) return "unknown";
    return win.some((s) => s.sig && s.sig !== probe.expect.differentSig) ? "complied" : "did-not";
  }
  return "unknown";
}

/*
 * shadowRecord — one line of the ledger. Deliberately structural: file paths and
 * signatures, no source text, no traceback bodies. This file is the thing a
 * volunteer would be asked to send back, so it has to be readable by them in
 * ten seconds and contain nothing they would mind sending.
 */
export function shadowRecord({ decision, probe, arm, spoke, ts = null, origin = "main" }) {
  return {
    v: 1, ts, arm, spoke, origin,
    verdict: decision?.verdict ?? null,
    kind: probe?.kind ?? null,
    expect: probe?.expect ?? null,
    window: probe?.window ?? null,
    weak: probe?.weak ?? false,
    tool: decision?.proposed?.toolName ?? null,
    sig: decision?.proposed?.sig ?? null,
    file: decision?.proposed?.file ?? null,
    risk: decision?.proposed?.risk ?? null,
    loopAttempts: decision?.loop?.attempts ?? null,
    ratchet: decision?.ratchet?.total ?? null,
  };
}

/*
 * 安慰剂基线 —— THE FLOOR IS NOT ZERO, AND IT IS NOT THE SAME FOR EVERY PREDICATE.
 *
 * An external reviewer was asked to doubt a 14/14 result and did the one thing
 * that settles it: he applied the SAME predicate to randomly chosen moments in
 * the same log.
 *
 *     stop-repeating   触发时刻 51.0% 会重复   随机时刻 81.4% 不会重复
 *     back-it-up       随机时刻 77.6% 已经满足
 *
 * So `stop-repeating` 14/14 has to beat 81.4%, not 0 — and at n=14 against that
 * base rate, fourteen straight successes happen by luck about 6% of the time.
 * `back-it-up` 4/4 against 77.6% has a p of roughly 0.36: it says nothing at all.
 *
 * TWO CONSEQUENCES, BOTH OF WHICH CHANGE THE PLAN
 * ==============================================
 * 1. Every compliance figure is meaningless without its own placebo beside it.
 *    A reader shown "100%" with no floor will compare it to zero. That is not a
 *    presentational nicety — it is the difference between a result and a number.
 * 2. The sample size follows from the placebo, not from a constant. Detecting a
 *    10-point lift over a 15% floor needs a few dozen; over an 81% floor it needs
 *    several hundred. The "30 per arm" figure in this file was written before
 *    anyone knew the floors, and for the high-floor predicates it is far too
 *    small.
 *
 * The same reviewer drew the right conclusion from his own number: collecting an
 * intervention arm now would spend a real user's session on predicates whose
 * ceiling is already known to be low. Tighten the predicates first.
 */
export function placeboRate(kind, expectOf, steps = [], { samples = 400, window = 5 } = {}) {
  const probe = (i) => ({ kind, expect: expectOf(steps[i]), window });
  let pass = 0, n = 0;
  /* deterministic stride rather than random sampling: the figure has to be
     recomputable from the same log months later, like the arm assignment */
  const stride = Math.max(1, Math.floor(steps.length / samples));
  for (let i = 0; i < steps.length - window; i += stride) {
    const e = expectOf(steps[i]);
    if (!e) continue;
    const score = scoreProbe(probe(i), steps.slice(i + 1));
    if (score === "unknown") continue;
    n += 1;
    if (score === "complied") pass += 1;
  }
  return n ? { rate: pass / n, n } : { rate: null, n: 0 };
}

/*
 * How many paired observations it takes to see a `lift` over a floor of `p0`,
 * at the usual 5%/80% conventions. Written as a function rather than a constant
 * because the honest answer depends on a number we only learn per predicate.
 */
export function headroom(p0) {
  /*
   * THE CONSTRAINT IS NOT SAMPLE SIZE, IT IS ROOM.
   *
   * At a floor of 81.4% the largest lift that can exist is 18.6 points, so
   * "detect +15" is very nearly "detect perfect compliance". No amount of data
   * fixes that — a predicate that is already true 4 times in 5 by accident
   * cannot show much of an effect even if the intervention works perfectly.
   *
   * This is why the reviewer's conclusion was right: tighten the predicate
   * before spending a real session collecting against it.
   */
  return p0 == null ? null : Number((1 - p0).toFixed(3));
}

export function samplesNeeded(p0, lift = 0.15) {
  if (p0 == null) return null;
  const p1 = Math.min(0.999, p0 + lift);
  const pbar = (p0 + p1) / 2;
  const num = 1.96 * Math.sqrt(2 * pbar * (1 - pbar)) + 0.84 * Math.sqrt(p0 * (1 - p0) + p1 * (1 - p1));
  return Math.ceil((num * num) / ((p1 - p0) ** 2));
}

/*
 * The bar, stated before any data exists so it cannot be moved afterwards.
 *
 * 30 pairs per arm is this instrument's own published power floor; below it the
 * difference interval crosses zero by construction and the number should be read
 * for direction only — or not at all.
 */
export const COMPLIANCE_BAR = Object.freeze({
  minPerArm: 30,
  /* what would count as the product working: the spoken arm complies materially
     more often than the silent one. Stated as a direction and a floor, not as a
     hoped-for value. */
  meaningfulLift: 0.15,
});

export function summarise(records = [], scores = []) {
  const byArm = new Map();
  records.forEach((r, i) => {
    const key = r.spoke ? "spoken" : "silent";
    if (!byArm.has(key)) byArm.set(key, { arm: key, n: 0, complied: 0, didNot: 0, unknown: 0 });
    const a = byArm.get(key);
    const s = scores[i];
    if (s === "complied") { a.n += 1; a.complied += 1; }
    else if (s === "did-not") { a.n += 1; a.didNot += 1; }
    else a.unknown += 1;
  });
  const out = [...byArm.values()].map((a) => ({ ...a,
    rate: a.n ? Number((a.complied / a.n).toFixed(3)) : null }));
  const spoken = out.find((a) => a.arm === "spoken");
  const silent = out.find((a) => a.arm === "silent");
  const lift = (spoken?.rate != null && silent?.rate != null)
    ? Number((spoken.rate - silent.rate).toFixed(3)) : null;
  const powered = Boolean(spoken && silent
    && spoken.n >= COMPLIANCE_BAR.minPerArm && silent.n >= COMPLIANCE_BAR.minPerArm);
  return { arms: out, lift, powered,
    verdict: !powered ? "样本不足 —— 只读方向，不读大小"
      : lift >= COMPLIANCE_BAR.meaningfulLift ? "说了比不说明显更被照做"
        : lift > 0 ? "有差，但小于事先定下的门槛" : "说了没有让它更照做" };
}
