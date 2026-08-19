/*
 * 打地鼠 —— whack-a-mole detection, and the only signal that earns a STOP.
 *
 * WHAT I HAD WRONG
 * ================
 * The four pathologies were wired as four independent advisory findings, each
 * riding additionalContext, none of them ever changing what the agent does. That
 * treats them as four products. They are four faces of one thing, and the thing
 * has a shape:
 *
 *   the same error keeps coming back · the agent keeps editing · the edits are
 *   NOT on the failing path · the code only grows
 *
 * That is 打地鼠. Token waste (the repeated cycles), 屎山 (code piled on to cover
 * a symptom), 架构偏离 (edits spreading into files the failure never mentions)
 * and 犯蠢 (never addressing the root cause) are not four detections here. They
 * are one detection, and separately none of them is strong enough to justify
 * stopping anybody.
 *
 * WHY THIS ONE MAY STOP THE AGENT WHEN THE OTHERS MAY NOT
 * ======================================================
 * "This function is complex" is a fact about one edit and the operator may
 * legitimately want it. "You have failed the same error four times, edited seven
 * files, and not one of them is on the failing path" is a runaway loop, and every
 * further step spends money to make the codebase worse. Letting that continue is
 * precisely the harm this product exists to price. A supervisor that watches it
 * happen and files an advisory note is a spectator.
 *
 * Denying is not a claim of authority. `authority: none` constrains what Outsider
 * may AUTHORIZE; the gate has always been allowed to REFUSE — it already denies
 * destructive and deploy actions. This adds one more refusal, on evidence.
 *
 * THE RULE THAT KEEPS A DENY FROM BEING A WALL
 * ============================================
 * Every deny states the exact way out, and the way out RESETS the counter:
 * touch a file that is actually on the failing path, or state the root cause.
 * A block the agent cannot satisfy does not correct a trajectory, it ends the
 * session — and then the user uninstalls, having learned that supervision means
 * being unable to work.
 */

import { parseTraceback, filesIn, localizeFailure } from "./outsider-grounding.js";

export const DEFAULT_LOOP_POLICY = Object.freeze({
  /* attempts at the SAME error before each rung. The agent gets real room to
     work: two honest failed attempts at a hard bug is normal engineering. */
  nudgeAt: 2,
  stopAt: 3,
  escalateAt: 4,
  /*
   * TWO independent ways to qualify as spraying, either is enough:
   *
   *   offPathRatio — the edits missed the traceback entirely
   *   spreadRatio  — each new attempt drags in a file never touched before
   *
   * The first version required only offPath, and measured 0.33 on a textbook
   * whack-a-mole fixture: the agent WAS editing a file named in the traceback,
   * just never the one the error came from. "Did you touch any file in the
   * stack" is too weak a bar — a handler that appears in every trace passes it
   * forever. Widening the blast radius is the behaviour that actually separates
   * "piling code on to cover it" from "hammering the right file on a hard bug",
   * and the second of those must never be stopped.
   */
  offPathRatio: 0.5,
  spreadRatio: 0.5,
  /*
   * Regardless of technique: after this many attempts at one error, handing back
   * to the human is the correct move even if every edit was perfectly aimed.
   */
  handBackAt: 6,
});

/* an error's identity across attempts: type + the failing source file + the
   shape of the message with numbers and paths normalised out, so "expected 5 got
   3" and "expected 5 got 4" are the same mole */
export function errorSignature(observation) {
  const tb = parseTraceback(observation || "");
  const file = (tb.frames.find((f) => f.file && !/test|spec/i.test(f.file)) ?? tb.frames[0])?.file ?? "";
  const msg = String(tb.errorMessage || "")
    .replace(/\d+/g, "#")
    .replace(/["'`][^"'`]*["'`]/g, "S")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
  if (!tb.errorType && !msg && !file) return null;
  return `${tb.errorType || "?"}|${file}|${msg}`;
}

/*
 * cyclesOf — split a trajectory into [edits…, failing test] rounds. A round with
 * no edit before it is not an attempt, it is a re-run, and that is the existing
 * no-progress-loop signal rather than this one.
 */
export function cyclesOf(steps = []) {
  const cycles = [];
  let pending = [];
  for (const s of steps) {
    if (s.isEdit) { pending.push(s); continue; }
    if (s.isTest && s.exit != null) {
      if (s.exit !== 0) {
        cycles.push({ edits: pending, test: s, sig: errorSignature(s.observation) });
      }
      pending = [];
    }
  }
  return cycles;
}

/*
 * assessWhackAMole — one verdict over the whole trajectory.
 *
 * Returns { detected, attempts, signature, offPathRatio, editedFiles,
 *           failingFiles, rung, evidence[] }.
 * `rung` is "none" | "nudge" | "stop" | "escalate" and is what the hook acts on.
 */
export function assessWhackAMole({ steps = [], policy = DEFAULT_LOOP_POLICY } = {}) {
  const p = { ...DEFAULT_LOOP_POLICY, ...policy };
  /*
   * GREEN CLEARS THE MOLE — and this was broken in the case that matters most.
   *
   * cyclesOf() only records FAILING rounds, so `cycles[last]` stayed the last
   * failure forever. Running the real scenario end to end: the agent finally
   * edited the right file, the suite went green — and the detector still
   * returned rung=escalate, i.e. STOP AND REPORT TO YOUR USER, to an agent that
   * had just fixed the bug.
   *
   * That is the exact failure the escape hatch exists to prevent, sitting in the
   * detector itself. Every fixture I wrote ended on a red test, so no fixture
   * could ever have caught it; it took running a suite that actually went green.
   * A supervisor whose block does not lift when the problem is solved is not
   * strict, it is broken, and it teaches the user that compliance changes nothing.
   */
  const lastTest = steps.findLastIndex((s) => s.isTest && s.exit != null);
  if (lastTest >= 0 && steps[lastTest].exit === 0) {
    return { detected: false, rung: "none", attempts: 0,
      reason: "the most recent test run passed — whatever the history, there is no mole right now" };
  }
  const cycles = cyclesOf(steps);
  if (cycles.length < 2) return { detected: false, rung: "none", attempts: cycles.length, reason: "fewer than two failed attempts" };

  /*
   * The mole is the error the run is failing on RIGHT NOW — the signature of the
   * most recent failing cycle — and the attempt count is how many times that same
   * error has come back.
   *
   * The first version took the LARGEST group over the whole history, which meant
   * a loop the agent had already escaped kept firing: it edited the right file,
   * got a different error, made real progress, and was still denied because four
   * older cycles shared a signature that no longer described anything. A loop is
   * only a loop while it is still happening. Changing the error IS the progress,
   * and the detector has to be able to see progress or it becomes a ratchet.
   */
  const last = cycles[cycles.length - 1];
  const sig = last?.sig ?? null;
  if (!sig) return { detected: false, rung: "none", attempts: 0, reason: "the current failure has no parseable signature" };
  const group = cycles.filter((c) => c.sig === sig);
  if (group.length < 2) return { detected: false, rung: "none", attempts: group.length,
    reason: "the current error has not recurred — the previous failure was different, which is progress" };

  let offPath = 0, widened = 0;
  const editedAll = new Set(), failingAll = new Set();
  /*
   * WHAT COUNTS AS "ALREADY TRIED" — and it is not the same set as "edited".
   *
   * `escape` names a file the failure points at that the agent has not tried
   * yet. The first cycle's edits happened BEFORE this error ever appeared, so
   * they cannot be attempts to fix it. Counting them cost the escape hatch in
   * the exact case it exists for: simulating a night, the agent had touched
   * pool.js at 1am for an unrelated reason, and at 2:30 — three attempts into a
   * loop whose traceback pointed squarely at pool.js — `escape` came back empty
   * and the stop had to be downgraded to advice. The one file worth naming was
   * excluded by history.
   */
  const tried = new Set();
  const evidence = [];
  /*
   * ONE ATTEMPT'S EDITS, NOT THE WHOLE SESSION'S.
   *
   * cyclesOf() accumulates edits until it meets a test, so the FIRST cycle
   * absorbs every edit made since the session began. Simulating a night caught
   * what that costs: the agent had touched pool.js at 1am for an unrelated
   * reason, so at 2:30 — three attempts into a loop whose traceback pointed
   * squarely at pool.js — `escape` was empty, because pool.js counted as
   * already-tried. The one file worth naming was excluded by history.
   *
   * An attempt is the edits immediately before its test, not everything that
   * ever preceded it.
   */
  const ATTEMPT_EDITS = 5;
  group.forEach((c, i) => {
    const edited = [];
    for (const e of c.edits.slice(-ATTEMPT_EDITS)) edited.push(...filesIn(e.action));
    /* did THIS attempt drag in a file no earlier attempt had touched? The first
       attempt is excluded: every file is new on the first try, and counting it
       would make a two-attempt loop look like spraying by construction. */
    const isNew = i > 0 && edited.some((f) => !editedAll.has(f));
    if (isNew) widened += 1;
    for (const f of edited) { editedAll.add(f); if (i > 0) tried.add(f); }
    const tb = parseTraceback(c.test.observation || "");
    const tbFiles = [...new Set(tb.frames.map((f) => f.file))];
    for (const f of tbFiles) failingAll.add(f);
    const loc = localizeFailure(tbFiles, edited);
    if (!loc.onFailingPath) offPath += 1;
    evidence.push({ test: c.test.action, edited, onFailingPath: loc.onFailingPath,
      broughtInNewFile: isNew, unaddressed: loc.unaddressed });
  });
  const attempts = group.length;
  const ratio = attempts ? offPath / attempts : 0;
  const spread = attempts > 1 ? widened / (attempts - 1) : 0;

  const spraying = ratio >= p.offPathRatio || spread >= p.spreadRatio;
  /*
   * COMPLIANCE LIFTS THE BLOCK, IMMEDIATELY — and the ratio alone will not do it.
   *
   * Every stop this module issues says, verbatim: "This block lifts as soon as an
   * edit lands on the failing path." It did not. `offPathRatio` is computed over
   * the whole group, so an agent that took the instruction and edited exactly the
   * file it was pointed at still scored 3-of-4 off-path, still read as spraying,
   * and was denied again. The one round where the agent did the right thing was
   * outvoted by the three where it had not yet been told.
   *
   * A supervisor that keeps refusing after the agent complies teaches the agent
   * that complying changes nothing — which is the same lesson as a wall, learned
   * more expensively. The most recent attempt is the only one that can answer
   * "are you still spraying"; the earlier ones already got their nudge.
   */
  const lastAttemptOnPath = evidence.length > 0 && evidence[evidence.length - 1].onFailingPath === true;

  let rung = "none";
  if (attempts >= p.handBackAt) {
    /* enough is enough, however well aimed */
    rung = "escalate";
  } else if (spraying && !lastAttemptOnPath) {
    if (attempts >= p.escalateAt) rung = "escalate";
    else if (attempts >= p.stopAt) rung = "stop";
    else if (attempts >= p.nudgeAt) rung = "nudge";
  } else if (spraying && lastAttemptOnPath && attempts >= p.nudgeAt) {
    /* aimed correctly and still red: a hard bug, not a loop. Keep the guidance,
       drop the refusal — hammering the right file must never be stopped. */
    rung = "nudge";
  }

  return {
    detected: rung !== "none",
    rung, attempts, signature: sig,
    offPathRatio: Number(ratio.toFixed(2)),
    spreadRatio: Number(spread.toFixed(2)),
    spraying,
    editedFiles: [...editedAll],
    failingFiles: [...failingAll],
    /*
     * The way out, stated every time it is used — a deny without one is a wall.
     *
     * TEST FILES ARE EXCLUDED, and that is not a filter, it is a safety rule.
     * `escape` is rendered to the agent as "the failure is in: X — go edit X".
     * For an assertion mismatch the traceback names only the TEST file (the
     * assert did not throw inside the source), so the unfiltered version told a
     * cornered agent to go edit the failing test. That is the single most
     * destructive thing a supervisor could say: it is exactly the 屎山 move —
     * make the red go away by breaking the check — and it would have been said
     * with authority, at the moment the agent was most desperate for a way out.
     * Found by running a real failing suite, never by a fixture.
     *
     * When nothing but test files remain, the honest output is EMPTY, and the
     * corrective says it has no file to offer rather than inventing one.
     */
    escape: [...failingAll].filter((f) => !tried.has(f) && !/(^|[/\\])(?:tests?|specs?)[/\\]|[._-](?:test|spec)\.\w+$|(?:^|[/\\])(?:test|spec)_/i.test(f)),
    evidence,
    policy: p,
  };
}

/*
 * loopCorrective — the text the agent sees. Different at every rung, because a
 * nudge that reads like a stop trains the agent to ignore stops.
 */
export function loopCorrective(a, { agent = "claude-code" } = {}) {
  /* no source file to name is a real and common state — an assertion mismatch
     names only the test. Say so; do not fill the gap with the test file. */
  const noTarget = "(the traceback names no SOURCE file outside your edits — it points only at the "
    + "test. Do NOT edit the test to make it pass: find which function it calls and read that.)";
  const unaddressed = a.escape.length ? a.escape.join(", ") : noTarget;
  const touched = a.editedFiles.slice(0, 6).join(", ") + (a.editedFiles.length > 6 ? ` (+${a.editedFiles.length - 6})` : "");
  const why = a.spreadRatio >= 0.5 && a.offPathRatio < 0.5
    ? `其中 ${Math.round(a.spreadRatio * 100)}% 的尝试拉进了之前没碰过的新文件 —— `
      + "错误没变，波及面在变大"
    : `其中 ${Math.round(a.offPathRatio * 100)}% 的尝试改的是 traceback 根本没提到的文件`;
  const head = `outsider: 同一个失败，这已经是第 ${a.attempts} 次了`
    + `（${a.signature.split("|")[0]} 在 ${a.signature.split("|")[1] || "?"}），而且${why}。`;

  if (a.rung === "nudge") {
    return [head, "",
      `  你改的是：${touched}`,
      `  失败在：${unaddressed}`,
      "",
      "下一次动手之前，先把根因说出来一句话。如果这句话跟 "
      + `${unaddressed} 无关，那你在补症状不是修病因。`
      + "靠加代码盖住一个失败，就是屎山的长法 —— 而这一轮正在被这一点衡量。",
    ].join("\n");
  }
  if (a.rung === "stop") {
    return [head, "",
      "  这一次编辑我没有放行。",
      "",
      `  你改的是：${touched}`,
      `  失败在：${unaddressed}`,
      "",
      "先别再写代码了。按顺序做这三件事：",
      "  1. 用一句话说清根因 —— 说机制，不要说现象",
      "  2. 说出你要「删掉」或「简化」掉什么来消除它，而不是要「加」什么",
      `  3. 然后去改 ${unaddressed} —— 失败真正来自的那个文件`,
      "",
      "只要有一次编辑落在出错的那条路径上，这个拦截立刻解除。它不是一堵墙，是让你瞄准。",
    ].join("\n");
  }
  /*
   * ── 升级级：不是叫醒操作方，是把这一件放下、继续别的 ──────────────────
   *
   * This rung used to say "STOP AND REPORT TO YOUR USER … ask them how to
   * proceed." At 3am there is nobody to ask, so it ended the night — the exact
   * 叫停就走人 the operator's spec rules out: 流水线全面瘫痪，任务没人做了.
   *
   * A foreman who finds a part he cannot fix does not shut the plant down. He
   * tags it, sets it aside, and keeps the line moving. So: stop guessing on THIS
   * failure (continuing is measurable waste), write down what is known so the
   * morning starts from evidence instead of from nothing, and go do the rest of
   * the work. Handing it back happens at delivery, in the report — not by waking
   * someone up at 3am.
   */
  return [head, "",
    `  ${a.attempts} 次尝试，动过 ${a.editedFiles.length} 个文件，根因始终没被碰到。`,
    "",
    "这一条先放下，别再猜了 —— 再猜下去只是在花钱把代码弄得更糟。",
    "",
    "现在做这两件事，然后继续干别的：",
    "  1. 在产出里留一段记录：这个失败是什么、你试过什么、每次为什么没成、"
    + "你认为根因最可能在哪。写给早上来看的人，让他从证据开始，不是从零开始。",
    "  2. 把这一项标成「未解决」，然后去做这次任务里剩下的部分。",
    "",
    "不要停在这里等人。一件卡住不等于整晚停工 —— 交付的时候我会把这一条一起交上去。",
  ].join("\n");
}
