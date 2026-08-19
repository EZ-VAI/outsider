/*
 * Token inefficiency — the agent gets there (or doesn't) but burns far more than
 * it should on the way. Unlike the code-quality pathologies, this one lives in the
 * TRACE, and most of it is deterministically detectable from the step sequence:
 * an agent that runs the same failing test five times without editing anything in
 * between, re-reads the same file ten times, or repeats an identical command is
 * wasting budget in a way you can SEE, not guess.
 *
 * The core detects, with located evidence over the real steps:
 *   - no-progress test loops : consecutive test runs with no edit between them
 *   - repeated identical actions : the same command issued again and again
 *   - redundant re-reads : the same file read far more than a human would
 *   - cost residual : spend well above a peer baseline for the same claim (optional,
 *                     only when a baseline is supplied — no baseline, no claim)
 *
 * Every finding names the wasted steps; the "wasted fraction" is the score. This is
 * measurement, priced for all Worlds — exactly the universal axis the trace makes.
 */

/*
 * A read is a read whether it arrives as a shell command or as a native tool
 * call. This regex listed only the SHELL spellings, so on Claude Code — where
 * the action string is `Read(/path/to/file.js)` — the redundant-re-read signal
 * could NEVER fire. The single most token-expensive habit an agent has, opening
 * the same file over and over, was invisible on the surface most people use.
 * And nothing failed: the detector just returned nothing, forever, which reads
 * exactly like "no waste found".
 */
const READ_RE = /\b(cat|less|head|tail|read_file|readFile|open|view|Read|View|Grep|Glob|NotebookRead)\b/i;
const norm = (a) => String(a || "").trim().replace(/\s+/g, " ").slice(0, 160);
/* `TaskUpdate()`, `Foo( )` — a call whose display string has no arguments tells
   you which tool ran and nothing else. It cannot witness that two calls matched. */
const EMPTY_CALL = /^\s*[\w.$]+\(\s*\)\s*$/;
const fileOf = (a) => { const m = String(a || "").match(/[\w./\-]+\.\w{1,5}\b/); return m ? m[0] : null; };

/*
 * assessTokenWaste(subject) — subject.trace.steps drives it. Optional
 * subject.baseline = { costUsd | steps } for the same claim enables the residual
 * signal; without it that signal is simply not emitted (honest).
 */
export function assessTokenWaste(subject, _ctx = {}) {
  const steps = (subject && subject.trace && subject.trace.steps) || [];
  const n = steps.length;
  const wasted = new Set();          // indices judged wasted
  const findings = [];

  /*
   * 1) no-progress test loops — and this signal is only true in the PRESENT tense.
   *
   * The first version scanned the whole history and reported every pair it ever
   * found. Replayed against a real 201-step session it fired at step 109 and then
   * on 100% of the 93 steps after it, INCLUDING after the suite had gone green.
   * A warning that never lifts is not a warning, it is a background colour: the
   * operator stops reading it, and the signals that are real go with it.
   *
   * Two rules, both already written down in outsider-loop.js and never applied
   * here:
   *   GREEN CLEARS IT. "the most recent test run passed — whatever the history,
   *   there is no loop right now."
   *   A LOOP IS ONLY A LOOP WHILE IT IS HAPPENING. Report the tail, not the
   *   archive.
   *
   * And one more the real session taught, which is about WHAT counts as a re-run.
   * The flagged pairs on the real trajectory were:
   *     npm test … | grep -E "^# (tests|pass|fail)|^not ok"
   *     npm test … | grep -A 18 "not ok 260"
   * Two runs of a red suite with no edit between them — and the correct move.
   * The engineer saw a failure COUNT and re-ran to read WHICH test and WHY.
   * Narrowing, adding -v, grepping the detail: that is diagnosis, and it is the
   * step that precedes every good fix.
   *
   * A no-progress loop is re-issuing the IDENTICAL invocation and expecting a
   * different answer. Keyed on the step's identity, so a changed command breaks
   * the chain.
   */
  const sameRun = (a, b) => (a.sig && b.sig ? a.sig === b.sig : norm(a.action) === norm(b.action));
  const lastReadable = steps.findLastIndex((s) => s.isTest && s.exit != null);
  if (lastReadable >= 0 && steps[lastReadable].exit !== 0) {
    /* walk back over consecutive IDENTICAL red runs with no edit between them */
    const chain = [lastReadable];
    let k = lastReadable - 1, editSince = false;
    while (k >= 0) {
      const s = steps[k];
      if (s.isEdit) { editSince = true; break; }
      if (s.isTest && s.exit != null) {
        if (s.exit !== 0 && sameRun(s, steps[lastReadable])) { chain.push(k); k -= 1; continue; }
        break;                       // a green, or a DIFFERENT invocation, ends the chain
      }
      k -= 1;
    }
    if (!editSince && chain.length >= 2) {
      for (const i of chain.slice(0, -1)) wasted.add(i);
      findings.push({ kind: "no-progress-test-loop", index: lastReadable,
        action: norm(steps[lastReadable].action), count: chain.length,
        detail: `the identical test command re-run ${chain.length}× with no edit in between — still red` });
    }
  }

  /*
   * 2) repeated identical actions — keyed on the step's IDENTITY, not on the
   *    string we happen to display.
   *
   *    Measured on a real 462-call session, keying on the display string fired
   *    on 38.9% of all calls. 154 of the 180 findings were a refactor editing
   *    one file several times (`Edit(/src/x.js)` is byte-identical every time,
   *    because the display string carries no content) or repeated `TaskUpdate()`
   *    calls, which carry no argument at all. Both are ordinary work, and a
   *    supervisor that warns about ordinary work every other call is noise the
   *    operator learns to scroll past — which costs the signals that are real.
   *
   *    `sig` is derived from the whole tool input (see classifyToolCall), so two
   *    edits with different content, or two reads of different ranges, are two
   *    different actions. Steps with no identity are SKIPPED rather than
   *    assumed identical: not knowing whether two things are the same is not
   *    evidence that they are.
   */
  /*
   * AN EDIT RESETS THE COUNT, and that is the whole difference between a loop and
   * a verification cycle.
   *
   * Keying on identity killed the false positives; it did not make the signal
   * present-tense. Replayed on a real session it first fired at step 71 and then
   * on 100% of the 157 steps after it — an archive, not a warning. And what it
   * archived was `node scripts/outsider-gate-corpus.mjs` run three times over
   * several hours: a check command re-run after each change, which is what a
   * check command is FOR. Running the same command again after editing is the
   * correct loop. Running it again having changed nothing is the wasteful one.
   *
   * So: count occurrences since the last edit, and clear on every edit. The
   * signal now says "you have issued this exact command N times without changing
   * anything in between", which is both true and actionable, and it goes quiet
   * the moment the agent does something.
   */
  const sinceEdit = new Map();
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i];
    if (s.isEdit) { sinceEdit.clear(); continue; }   // an edit's identity is its content, and it resets
    const k = s.sig ?? (s.actionKind === "shell" || !s.actionKind ? norm(s.action) : null);
    if (!k) continue;
    /* the EMPTY_CALL guard is for steps with NO identity — `TaskUpdate()` as a
       display string witnesses nothing. When a real sig is present the payload
       has already been hashed, so an argument-free display string is only a
       display problem and must not suppress a true repeat. */
    if (!s.sig && EMPTY_CALL.test(s.action ?? "")) continue;
    (sinceEdit.get(k) || sinceEdit.set(k, []).get(k)).push(i);
  }
  /* report from the FINAL state, not from an accumulator — a run that was escaped
     is not a run that is happening. My first version of this fix kept a historical
     map alongside, which reintroduced the archive it was written to remove. */
  for (const [key, idxs] of [...sinceEdit].filter(([, v]) => v.length >= 3)) {
    idxs.slice(1).forEach((i) => wasted.add(i));
    findings.push({ kind: "repeated-action", index: idxs[1], action: norm(steps[idxs[0]].action),
      count: idxs.length, detail: `the identical command issued ${idxs.length}× with no edit in between`, key });
  }

  /*
   * 3) redundant re-reads — the same BYTES fetched again, not the same file
   *    name appearing again. Reading lines 1-200 and then lines 900-1100 of a
   *    2000-line file is how you read a large file, not waste. Keyed on sig so
   *    the range is part of the identity; reported by file so the message still
   *    names something the operator recognises.
   */
  /*
   *    AND AN EDIT RESETS IT, for the third time in this file. Re-reading a file
   *    you just changed is how you check your work. The version without the reset
   *    fired on 22 of 309 calls in a real session — 7% — because four identical
   *    reads anywhere in the history kept the finding alive to the end of the
   *    night. Every waste signal here now obeys the same rule: count since the
   *    last edit, report from the final state, go quiet when the agent acts.
   */
  const reads = new Map();
  steps.forEach((s, i) => {
    if (s.isEdit) { reads.clear(); return; }
    if (!READ_RE.test(s.action)) return;
    const k = s.sig ?? fileOf(s.action);
    if (!k) return;
    (reads.get(k) || reads.set(k, []).get(k)).push(i);
  });
  for (const [, idxs] of reads) {
    if (idxs.length >= 4) {
      idxs.slice(2).forEach((i) => wasted.add(i));
      const file = steps[idxs[0]].file ?? fileOf(steps[idxs[0]].action) ?? "the same file";
      findings.push({ kind: "redundant-reread", index: idxs[0], file, count: idxs.length,
        detail: `${file} read ${idxs.length}× with identical arguments` });
    }
  }

  // 4) cost residual vs a supplied peer baseline (only if given)
  let residual = null;
  const cost = subject?.trace?.resources?.costUsd ?? null;
  const base = subject?.baseline?.costUsd ?? null;
  if (cost != null && base != null && base > 0) {
    residual = cost / base;
    if (residual >= 1.5) findings.push({ kind: "cost-over-peer", index: null, ratio: +residual.toFixed(2),
      detail: `spent ${residual.toFixed(1)}× the peer baseline for this claim` });
  }

  const wastedFraction = n ? wasted.size / n : 0;
  const signals = [];
  const byKind = {};
  for (const f of findings) (byKind[f.kind] = byKind[f.kind] || []).push(f);
  for (const [kind, list] of Object.entries(byKind)) {
    signals.push({
      signal: `tokenwaste-${kind}`, confidence: confOf(kind),
      said: "the work was done efficiently",
      observed: describe(kind, list, n),
      corrective: correctiveFor(kind, list),
      evidence: list.slice(0, 8), basis: "trace-sequence",
    });
  }

  // score: wasted step fraction, amplified by an over-peer cost ratio if present
  let score = Math.min(1, wastedFraction * 1.8);
  if (residual != null) score = Math.min(1, score + Math.min(0.4, (residual - 1) * 0.2));
  score = Math.max(0, +score.toFixed(3));
  return { score, signals,
    facts: { steps: n, wastedSteps: wasted.size, wastedFraction: +wastedFraction.toFixed(3),
      costResidual: residual, findings: findings.length } };
}

function confOf(kind) {
  return { "no-progress-test-loop": 0.85, "repeated-action": 0.8, "redundant-reread": 0.7, "cost-over-peer": 0.75 }[kind] || 0.65;
}
function describe(kind, list, n) {
  if (kind === "cost-over-peer") return list[0].detail;
  const steps = list.reduce((s, f) => s + (f.count ? f.count - 1 : 1), 0);
  return `${list.length} ${kind} pattern(s) wasting ~${steps} of ${n} steps`;
}
function correctiveFor(kind, list) {
  return {
    "no-progress-test-loop": "你又重跑了一遍测试，中间没有改任何代码 —— 重跑不会让它变绿。先把失败读完，改一处再跑。",
    "repeated-action": `\`${list[0].action}\` 你已经跑了 ${list[0].count} 次，结果是一样的 —— 用上一次的结果往下推，别再发一遍。`,
    "redundant-reread": `${list[0].file} 你读了 ${list[0].count} 遍 —— 它已经在你的上下文里了，直接用，别再读。`,
    "cost-over-peer": "这个任务的花费明显高于同类 —— 高出去的部分就在上面这些循环里。",
  }[kind] || kind;
}

/* verifiable probe: assert the wasted-step fraction is under a bound */
export function tokenWasteProbes(subject) {
  return [{
    kind: "trace", text: "wasted-step fraction under 15%",
    check: () => { const r = assessTokenWaste(subject); return { passed: r.facts.wastedFraction <= 0.15, detail: `${(r.facts.wastedFraction * 100).toFixed(0)}% wasted` }; },
  }];
}

export const tokenWastePathology = {
  name: "token-inefficiency", dimension: "token",
  standard: "no no-progress loops, repeated commands, or redundant re-reads; spend near peer",
  assess: assessTokenWaste, probes: tokenWasteProbes,
};
