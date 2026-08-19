/*
 * `outsider wrap` — zero-integration supervision.
 *
 * THE ONBOARDING PROBLEM THIS SOLVES
 * ==================================
 * Asking a non-coder to emit an event stream, export a framework log, or add an
 * in-loop hook is too much. Almost none of them will do any of it. So this makes
 * the whole thing ONE terminal command: the user prepends `outsider wrap --` to
 * whatever they already run.
 *
 *     outsider wrap -- aider --message "fix the timeout bug"
 *     outsider wrap -- python my_agent.py
 *     outsider wrap -- claude "make the tests pass"
 *
 * Outsider spawns the agent as a child, tees its terminal output straight
 * through (so the user still sees their agent exactly as before), and in
 * parallel PARSES that output into supervision events — a test that ran and
 * whether it passed, a file that was edited, a claim of "all tests pass" — and
 * supervises live. No log format, no export, no code.
 *
 * WHAT WRAP GIVES, HONESTLY
 * =========================
 * Eyes and memory, for free: real-time DETECTION, an in-flight WARNING the
 * moment the agent contradicts itself, and the captured Experience that trains
 * the behavior model. The HANDS — actually injecting a correction back, or hard-
 * gating an irreversible step — need either an agent that reads stdin or the
 * in-loop hook. Wrap never pretends it stopped something it only warned about.
 *
 * PARSING IS BEST-EFFORT, BIASED TO SILENCE
 * =========================================
 * Terminal output is noisy, so the parser is conservative: it only emits an
 * event when it is fairly sure, and it only treats a line as a success CLAIM on
 * strong completion phrasing. A miss is a false negative (we stay quiet); we do
 * not manufacture a false accusation from an ambiguous log line.
 */

import { spawn as realSpawn } from "node:child_process";
import { createInterface } from "node:readline";
import { createSupervisionSession } from "./outsider-supervisor.js";
import { makeQueueActuator } from "./outsider-actuator.js";
import { proposeContract, applyConfirmation } from "./outsider-contract.js";
import { fitBehaviorModel, predictBehavior } from "./outsider-experience.js";

/* ---- heuristics (conservative on purpose) ---- */
const TEST_INVOKE = /(?:^|[$>#]\s*)(pytest|py\.test|tox|npm (?:run )?test|yarn test|pnpm test|go test|cargo test|jest|vitest|mocha|rspec|phpunit|python -m unittest|node --test|bun test|deno test|dotnet test|swift test|mvn test)\b/i;
/*
 * `node --test` — BOTH dialects. This was the single most consequential blind
 * spot in the product, and it was invisible because nothing errored.
 *
 * Neither the TAP reporter (`# fail 1`, `not ok 3 - …`) nor the spec reporter
 * (`ℹ fail 1`, `✖ failing test`) matched anything below, so on any Node project
 * every test step came back `exit: null` — "ran a test, result unknown". From
 * there the whole chain is dead: cyclesOf() only records rounds with a readable
 * exit, so it returned zero rounds; assessWhackAMole needs two rounds, so 打地鼠
 * — the one signal allowed to STOP an agent — could never fire. Measured on a
 * real 509-step session in this very repository: 25 test steps, 0 readable, 0
 * cycles, monitor silent from start to finish. It did not fail. It reported a
 * clean run, forever.
 *
 * This is self-correction #26 (READ_RE) repeating with a different regex: a
 * detector that cannot fire on the surface people actually use, failing quietly.
 * The dialect fix WAS made once — `VERSION.json` says "measure now parses BOTH
 * node:test dialects" — but it landed in scripts/outsider-measure-all.mjs and
 * never here, and this is the parser the supervisor runs on. One product, two
 * parsers, one of them fixed.
 */
const TEST_FAIL = [
  /\b([1-9]\d*)\s+failed\b/i,                 // "1 failed", "3 failed"
  /\b([1-9]\d*)\s+errors?\b/i,                 // "1 error" (pytest collection/import error)
  /\bTests?:.*?\b([1-9]\d*)\s+failed/i,        // jest summary
  /^\s*FAILED\b/i,                             // pytest/unittest result token
  /^\s*(?:FAIL|ERROR)\b/,                      // go / jest / pytest error
  /^FAILED\s*\(/,                              // unittest "FAILED (failures=…)"
  /^\s*(?:#|ℹ)\s*fail\s+([1-9]\d*)\b/i,        // node:test — TAP "# fail 2" / spec "ℹ fail 2"
  /^\s*not ok\b/i,                             // node:test TAP, per-case failure
  /^\s*✖\s/,                                   // node:test spec, per-case failure
];
const TEST_PASS = [
  /\b(\d+)\s+passed\b/i,                       // "5 passed" (guard: no 'failed' on line)
  /\ball tests?\s+passed\b/i,
  /^\s*OK\s*$/,                                // unittest success
  /^\s*PASS\b/,                                // go / jest
  /^\s*(?:#|ℹ)\s*fail\s+0\b/i,                 // node:test — zero failures IS the pass line
  /^\s*ok\s+\S+\s+[\d.]+m?s\b/i,               // go test package pass: "ok  pkg  0.3s"
];
const EDIT_LINE = [
  /\b(edited|editing|wrote|writing|created|creating|applied edit to|patching|modified)\b.*?([\w./-]+\.(?:py|js|ts|tsx|go|rs|java|rb|c|cpp|h|json|ya?ml|md))/i,
  /^\+\+\+\s+b\/(\S+)/,                        // unified diff header
  /^\s*modified:\s+\S+/i,                      // git status
];
const SUBMIT_LINE = /\b(submitted|submitting|opened a pull request|pull request (?:created|opened)|pushed to (?:main|master)|committed and pushed)\b/i;
/* future / intent phrasing — a line that is a PLAN, not a completion claim */
const INTENT = /\b(will|going to|gonna|need to|needs to|make sure|ensure|should|let me|let's|i'?ll|i'?m going|trying to|try to|attempt|plan to|planning|want to|hope to|about to|next|then)\b/i;
/* only STRONG completion phrasing counts as a success claim */
const COMPLETION_CLAIM = [
  /\ball tests?\s+(?:now\s+)?(?:pass|passing|passed|green)\b/i,
  /\btests?\s+(?:are|now)\s+(?:passing|green)\b/i,
  /\b(?:the\s+)?(?:bug|issue|error|failure)\s+(?:is|was)\s+(?:now\s+)?fixed\b/i,
  /\bI(?:'ve| have)?\s+fixed\b/i,
  /\btask\s+(?:is\s+)?(?:complete|completed|done|finished)\b/i,
  /\beverything\s+(?:works|passes|is working|is green)\b/i,
  /\bsuccessfully\s+(?:fixed|implemented|completed|resolved)\b/i,
  /^\s*(?:all\s+)?done[.!]?\s*$/i,
];

function anyHit(res, s) { return res.some((re) => re.test(s)); }

/*
 * parseLine — a terminal line → a supervision event, or null when nothing is
 * confidently detected. Emits an event only when at least one signal fires.
 */
export function parseLine(rawLine) {
  const line = String(rawLine || "");
  if (!line.trim()) return null;

  let isTest = false, exit = null, isEdit = false, isSubmit = false, report = null;

  // test results first (structural, high precision)
  const failHit = TEST_FAIL.find((re) => re.test(line));
  const hasPassNum = /\b\d+\s+passed\b/i.test(line);
  /* `# fail 0` / `ℹ fail 0` is a PASS line that contains the word "fail"; both
     the fail branch and the pass branch's `!/failed/` guard have to know that,
     or a green node:test run reads as unknown and the gate never opens. */
  const zeroFail = /\b0\s+failed\b/i.test(line) || /^\s*(?:#|ℹ)\s*fail\s+0\b/i.test(line);
  if (failHit && !zeroFail) { isTest = true; exit = 1; }
  else if (anyHit(TEST_PASS, line) && !/\bfailed\b/i.test(line)
           && (hasPassNum || zeroFail || /\bOK\b|\bPASS\b|^\s*ok\s|all tests/i.test(line))) {
    isTest = true; exit = 0;
  } else if (TEST_INVOKE.test(line)) { isTest = true; exit = null; }   // ran a test, result unknown

  if (anyHit(EDIT_LINE, line)) isEdit = true;
  if (SUBMIT_LINE.test(line)) isSubmit = true;
  /* a success claim, but only when it is not phrased as a plan/intent */
  if (anyHit(COMPLETION_CLAIM, line) && !INTENT.test(line)) report = line.trim().slice(0, 300);

  if (!isTest && !isEdit && !isSubmit && report == null) return null;
  return { action: line.trim().slice(0, 200), isTest, exit, isEdit, isSubmit, ...(report ? { report } : {}) };
}

/*
 * superviseLineStream — the testable core: feed terminal lines, get nudges. Each
 * line is passed through (the user still sees their agent), then parsed and, if
 * it is an event, supervised.
 */
export function superviseLineStream(lines, { session, onNudge, onPassthrough } = {}) {
  for (const line of lines) {
    if (onPassthrough) onPassthrough(line);
    const ev = parseLine(line);
    if (!ev) continue;
    const r = session.ingest(ev);
    if (r.decision.action !== "continue" && onNudge) onNudge(r, line);
  }
}

/* the inline nudge, styled so it stands out from the agent's own output */
export function wrapNudgeLine(r) {
  const d = r.decision;
  const tag = { "auto-correct": "⚙︎ outsider", gate: "⛔ outsider", escalate: "🙋 outsider" }[d.action] ?? "outsider";
  const msg = d.corrective ?? d.reason ?? d.note ?? "";
  return `  ⟵ ${tag}: ${msg}`;
}

/*
 * wrapCommand — spawn the agent, supervise its output live, capture Experience
 * on exit. `spawn` and `out` are injectable for tests. Resolves to
 * { state, record, code }.
 */
/*
 * correctionText — the exact string sent back to the agent. Prefers the grounded
 * correction (cites this run's real error) when the intervention layer produced
 * one; falls back to the decision's own reason. Prefixed so an agent's log shows
 * WHERE the instruction came from.
 */
export function correctionText(decision) {
  /* the supervisor puts the grounded instruction in `corrective` as a STRING
     (see decide(): "do not report success; the last test run failed…"). Earlier
     drafts of this reached for `.corrective.message` and got undefined — the
     correction would have been sent as a generic fallback, throwing away the
     one thing that makes it grounded. Accept both shapes. */
  const c = decision.corrective;
  const body = (typeof c === "string" && c)
    || c?.message
    || decision.correction?.message
    || decision.reason
    || "the supervisor flagged a said-vs-did mismatch; re-verify before continuing";
  return `[outsider] ${body}`;
}

export function wrapCommand({
  command, args = [], cwd, prompt = "", executor, world,
  existingExperience = [], spawn = realSpawn, out = process.stdout, onRecord,
  /*
   * THE HANDS — off by default (detection is always safe; acting on someone
   * else's process is not). `intervene:true` writes grounded corrections back
   * to the agent's stdin, so a nudge the supervisor decided actually REACHES
   * the agent instead of only reaching the human reading the terminal. This is
   * the "last inch" that made a wrapped run monitor-only: the engine always
   * decided, the decision just had nowhere to go on this path.
   *
   * `killOnGate:true` is the hard stop: when the gate blocks an IRREVERSIBLE
   * action, the child is terminated rather than merely warned. Default false
   * because killing another team's process is a policy choice only they can make.
   * Fail-closed within its own scope: if the stdin write throws, the correction
   * is reported UNDELIVERED, never silently assumed applied.
   */
  intervene = false, killOnGate = false,
} = {}) {
  const exec = executor ?? { id: command ? `wrapped:${command}` : "wrapped-agent", kind: "coding-agent" };
  const w = world ?? { kind: "sandbox" };
  const forecast = predictBehavior(fitBehaviorModel(existingExperience), { executor: exec });
  const proposal = proposeContract({ prompt, world: w, executor: exec, behaviorForecast: forecast });
  const { contract } = applyConfirmation(proposal, {});
  const session = createSupervisionSession({ executor: exec, world: w, contract, actuator: makeQueueActuator() });

  const write = (s) => out.write(`${s}\n`);
  write(`🔭 outsider 正在监督:${[command, ...args].join(" ")}`);
  const fake = forecast.forecasts.find((f) => f.signal === "fakedSuccess");
  if (fake && fake.ownN > 0) {
    write(`   (这个 agent 过去 ${fake.ownN} 次里约 ${Math.round((fake.pHat ?? 0) * 100)}% 假装完成过——已相应收紧)`);
  }

  return new Promise((resolve, reject) => {
    let child;
    try { child = spawn(command, args, { cwd, env: process.env }); }
    catch (e) { return reject(e); }

    const acted = { corrections: 0, correctionsUndelivered: 0, gatesKilled: 0 };
    const canWriteStdin = () => intervene && child.stdin && child.stdin.writable;

    const handleLine = (line) => {
      write(line);                                  // pass the agent's output through
      const ev = parseLine(line);
      if (!ev) return;
      const r = session.ingest(ev);
      if (r.decision.action === "continue") return;
      write(wrapNudgeLine(r));

      /* THE HAND, correction path: send the grounded nudge to the agent itself */
      if ((r.decision.action === "auto-correct" || r.decision.action === "escalate") && intervene) {
        const msg = correctionText(r.decision);
        if (canWriteStdin()) {
          try { child.stdin.write(msg + "\n"); acted.corrections++; write(`   ↩︎ 已回注 agent stdin`); }
          catch { acted.correctionsUndelivered++; write(`   ⚠ 回注失败(stdin 不可写)——纠正未送达`); }
        } else { acted.correctionsUndelivered++; write(`   ⚠ 未开启 --intervene 或 agent 不读 stdin——纠正未送达`); }
      }

      /* THE HAND, gate path: an irreversible action, physically stopped */
      if (r.decision.action === "gate" && killOnGate && r.decision.risk === "irreversible") {
        try { child.kill("SIGTERM"); acted.gatesKilled++; write(`   ⛔ 已终止子进程(不可逆动作被硬拦)`); }
        catch { write(`   ⚠ 终止失败`); }
      }
    };

    if (child.stdout) createInterface({ input: child.stdout }).on("line", handleLine);
    if (child.stderr) createInterface({ input: child.stderr }).on("line", handleLine);

    const finish = (code) => {
      const state = session.state();
      const record = session.experience();
      if (onRecord) { try { onRecord(record); } catch { /* ignore */ } }
      write(`\n收工:看了 ${state.steps} 步,决定纠正 ${state.autoCorrections.length}、`
        + `拦截 ${state.gates.length}、升级 ${state.escalations.length}。`);
      if (intervene || killOnGate) {
        write(`   手已接:回注 agent ${acted.corrections} 次`
          + (acted.correctionsUndelivered ? `(${acted.correctionsUndelivered} 次未送达)` : "")
          + (killOnGate ? `、硬拦不可逆步 ${acted.gatesKilled} 次` : "") + "。");
      } else if (state.autoCorrections.length || state.gates.length) {
        write("   注意:这次是纯检测模式。加 intervene:true 让纠正回注 agent stdin,");
        write("   加 killOnGate:true 让不可逆动作被物理终止。");
      }
      resolve({ state, record, code, acted });
    };
    child.on("close", (code) => finish(code));
    child.on("error", reject);
  });
}
