/*
 * Immediate intervention via native agent hooks — 即刻干预.
 *
 * Detection alone is not enough; the operator wants Outsider to STOP or CORRECT
 * the agent the moment it goes wrong, before the harm lands. Modern coding-agent
 * CLIs give the exact seam: a PreToolUse hook that runs BEFORE a tool call
 * executes and can DENY it (with a reason the agent sees) or ALLOW it while
 * injecting a correction into the agent's context.
 *
 *   - Claude Code : PreToolUse hook. Output
 *       {hookSpecificOutput:{permissionDecision:"deny"|"allow", permissionDecisionReason, additionalContext}}
 *     covers ALL tools. `additionalContext` is injected into the model's context.
 *   - Codex CLI   : ~/.codex/hooks.json PreToolUse. Only "deny" is honoured, and it
 *     intercepts the SHELL tool only — where deploy/rm/db live.
 *   - CodeBuddy   : Claude-Code-style hooks.
 *
 * This module is the tool-agnostic DECISION plus a translator to each tool's
 * native hook output. The decision reuses the supervisor's own gate (authorize)
 * and reads the run so far with the STRUCTURED session reader
 * (outsider-session-adapters), so it knows precisely whether a test has passed —
 * the same policy fired one tool-call earlier: before the action, not after.
 */

import { createSupervisionSession } from "./outsider-supervisor.js";
import {
  classifyToolCall, trajectoryFromTranscript, eventsFromTranscriptLine, scopeTrajectory,
  trajectoryFromSession, ownChain, originOf, segmentsOf, createdInRun, wasCreatedInRun,
} from "./outsider-session-adapters.js";
import { sessionTraceFromSteps, fleetSummary } from "./outsider-execution-trace.js";
import { measureTraceStage05 } from "./outsider-process.js";
import { interveneSync } from "./outsider-intervention.js";
import { assessHookWaste } from "./outsider-hook-waste.js";
import { assessWhackAMole, loopCorrective } from "./outsider-loop.js";
import { readCharter, assessCharterDrift, charterRequest, CHARTER_PATH } from "./outsider-charter.js";
import { blindFailure, readFaultCard, failureKey, FAULTCARD_PATH, FAULTCARD_RUNNER } from "./outsider-faultcard.js";
import { parseTraceback } from "./outsider-grounding.js";
import { assessContextLoss, assessRealignment } from "./outsider-mandate.js";
import { assessDelivery, judgeDelivery } from "./outsider-acceptance.js";
import { assessRatchet, ratchetNote } from "./outsider-ratchet.js";
import { assessPatrol } from "./outsider-patrol.js";
import { proposeRewrite } from "./outsider-rewrite.js";
import { assessFreeStop } from "./outsider-freestop.js";
import { injectMandate } from "./outsider-mandate-inject.js";
import { openCorrection, judgeOpen, ledgerLine, hashText, statePath, escalation,
  LEDGER_PATH } from "./outsider-intervention-observer.js";
import { observerUsable, supports } from "./outsider-host-support.js";
import { readContract, CONTRACT_GUARD } from "./outsider-work-contract.js";
import { askSupervisor, supervisorPacket, correctionFrom } from "./outsider-supervisor-session.js";
import { readRunState, emit } from "./outsider-run.js";
import { requestProbe, readProbe, ARCHDRIFT_RUNNER } from "./outsider-probe.js";
import { armOf, complianceProbe, shadowRecord, SHADOW_PATH } from "./outsider-compliance.js";

/* every rm target provably made by this run — see the gate's note */
function undoesOwnWork(action, steps, cwd = null) {
  try {
    const cmd = String(action ?? "");
    if (!/(?:^|[;&|]\s*)(?:sudo\s+)?rm\s/i.test(cmd)) return false;
    const made = createdInRun(steps, { cwd });
    if (!made.size) return false;
    let sawRm = false;
    for (const seg of segmentsOf(cmd)) {
      if (!/^\s*(?:sudo\s+)?rm\s/i.test(seg)) continue;
      sawRm = true;
      const targets = (seg.match(/^\s*(?:sudo\s+)?rm\s+([\s\S]*)$/i)?.[1] ?? "")
        .split(/\s+/).filter((t) => t && !t.startsWith("-"));
      if (!targets.length || !targets.every((t) => wasCreatedInRun(t, made, { cwd }))) return false;
    }
    return sawRm;
  } catch { return false; }
}
import { readFileSync, writeFileSync, mkdirSync, appendFileSync } from "node:fs";
import { spawn, execSync } from "node:child_process";

const isTestFile = (f) => /(^|[/\\])(?:tests?|specs?)[/\\]|[._-](?:test|spec)\.\w+$|(?:^|[/\\])(?:test|spec)_/i.test(String(f));

/*
 * ── THE ACCEPTANCE COMMAND IS NOT A SUPERVISED WORKER ───────────────────────
 *
 * The controller hands its own private RPC channel to every process it starts:
 * OUTSIDER_CONTROLLER_SOCKET plus the token that authenticates against it. That
 * is right for the worker — it is how a hook reaches its controller. It is
 * exactly wrong for the operator's frozen acceptance command, which the
 * controller runs SYNCHRONOUSLY, from inside the very request the socket serves.
 *
 * Leaked, it produced a real red on this repository's own suite. `npm test`
 * spawns bin/outsider-hook.mjs; the hook saw an inherited CONTROLLER_SOCKET,
 * skipped attached mode, and dialled back into the controller that was blocked
 * in spawnSync waiting for that same npm test. Each such hook burned its whole
 * budget (RPC_TIMEOUT:11000, measured twice at 11.07s per test) and the suite
 * eventually died on the 600s acceptance timeout — a false red, produced by the
 * supervisor, against a tree that passes. The same edge closes a second door: a
 * nested Claude started by an acceptance command can no longer authenticate to
 * its parent's control channel and speak as that run.
 *
 * Strip only the channel — never the operator's own configuration, and never
 * anything the command legitimately needs to run the way it runs in a shell.
 */
export function unsupervisedCommandEnvironment(base = process.env) {
  const environment = { ...base };
  for (const name of [
    "OUTSIDER_CONTROLLER_SOCKET",
    "OUTSIDER_CONTROLLER_TOKEN",
    "OUTSIDER_ATTACHED_SOCKET",
    "OUTSIDER_ATTACHED_TOKEN",
    "OUTSIDER_ATTACHED_TOKEN_FILE",
    "OUTSIDER_RUN",
    "OUTSIDER_RUN_ID",
    "OUTSIDER_BUDGET_MS",
  ]) delete environment[name];
  return environment;
}

/*
 * WALK TO THE MACHINE — detached, bounded, and only when blind.
 *
 * A "pending" card is written SYNCHRONOUSLY before the child starts, so the next
 * few hook calls (which happen in milliseconds, while the test is still running)
 * do not each spawn their own test run. Without it a single blind failure would
 * fan out into a dozen concurrent suites, which is the waste this product exists
 * to price, produced by the thing meant to detect it.
 */
function requestFaultCard({ cwd, key, cmd, spawnFn = spawn, writeFn = null }) {
  const dir = `${String(cwd).replace(/\/+$/, "")}/.outsider`;
  const out = `${dir}/faultcard.json`;
  try {
    if (writeFn) writeFn(out, JSON.stringify({ key, at: Date.now(), cmd, pending: true }));
    else { mkdirSync(dir, { recursive: true }); writeFileSync(out, JSON.stringify({ key, at: Date.now(), cmd, pending: true })); }
    const child = spawnFn(process.execPath, ["-e", FAULTCARD_RUNNER, cwd, key, cmd, out],
      { cwd, detached: true, stdio: "ignore" });
    child.unref?.();
    return true;
  } catch { return false; }
}

/*
 * 什么时候把监工叫过来 —— 用【现有的】检测器，一个新的都不加。
 * 检测器从此只负责「这里值得看一眼」，看什么、怎么办由独立会话决定。
 */
function pendingTrigger(steps, proposed, { delivery, mismatches } = {}) {
  if (delivery && !delivery.passed) return `delivery:${delivery.result.gaps[0]?.kind ?? "gap"}`;
  if (proposed?.isSubmit) return "submit";
  if ((mismatches ?? []).length) return `said-vs-did:${mismatches[0].signal}`;
  try {
    const pa = assessPatrol(steps, { proposed });
    if (pa.detected) return `patrol:${pa.kind}`;
  } catch { /* */ }
  try {
    const a = assessWhackAMole({ steps });
    if (a?.detected && a.rung !== "nudge") return "whack-a-mole";
  } catch { /* */ }
  return null;
}

/* one place that writes observer state, so the two call sites cannot drift */
function writeState(cwd, p, body, writeFileFn) {
  if (writeFileFn) { writeFileFn(p, body); return; }
  mkdirSync(p.replace(/[/][^/]*$/, ""), { recursive: true });
  writeFileSync(p, body);
}
function appendLedger(cwd, line, writeFileFn) {
  const p = `${String(cwd).replace(/\/+$/, "")}/${LEDGER_PATH}`;
  if (writeFileFn) { writeFileFn(p, line); return; }
  mkdirSync(`${String(cwd).replace(/\/+$/, "")}/.outsider`, { recursive: true });
  appendFileSync(p, line);
}

/* re-exported so existing importers (tests, CLI) keep one import site */
export { classifyToolCall, trajectoryFromTranscript, eventsFromTranscriptLine };

/*
 * decideToolCall — the tool-agnostic verdict for a proposed tool call given the
 * trajectory so far. Reuses the supervisor's authorize() gate; adds a pre-emptive
 * warning when the agent is about to finish/commit on a red (or absent) test.
 * Returns { verdict: "deny"|"warn"|"allow", reason, corrective, proposed }.
 */
/*
 * decideToolCall — the exported verdict. The body below is unchanged decision
 * logic; this wrapper is only the join to the protocol ladder.
 *
 * WHY THE RECORD IS MINTED HERE AND ONLY ON AN INTERVENTION
 * ========================================================
 * A ProcessCard on every tool call would put v49 in the hot path for the ~98.5%
 * of calls that are waved through, to describe a run nobody questioned. The rule
 * that costs nothing and loses nothing is: EVERY TIME THE FOREMAN SPEAKS, THE
 * LADDER GETS A RECORD. A Stage 0.5 card is exactly the atom `attestStage1`
 * consumes, so an intervention is now attestable instead of evaporating into a
 * stderr line — which is what "this is one product, not two" has to mean
 * concretely.
 *
 * `authority: "none"` rides along unchanged. Minting a card grants nothing.
 */
/*
 * DID THE SENTENCE ACTUALLY REACH THE MODEL. Measured, not assumed: on this
 * machine's codex-cli, `allow` + `additionalContext` runs the command and the
 * model never sees the context — it is not even in the session JSONL. So on
 * Codex a warn is delivered to the OPERATOR and to nobody else, and pooling
 * those rows with Claude Code's would compute a treatment effect for a treatment
 * that was never administered.
 */
function payloadCarries(agent, d) {
  /*
   * ── 送达与否，从真实 adapter 的输出算，不从 verdict 推 ──────────────────
   *
   * This returned `true` for every deny on the reasoning that a refusal reason
   * reaches both hosts. But this same file records the measured fact that on
   * codex-cli the guidance never reaches the MODEL — the deny reason goes to CLI
   * stderr, and `additionalContext` is not in the model's context nor even in
   * the session JSONL. An agent that never saw the correction cannot be counted
   * as a treated subject, whatever the verdict was.
   *
   * So: render the payload the host will actually get, and ask whether the
   * corrective text is inside it. One source of truth, and it moves whenever the
   * adapters move.
   */
  try {
    const fmt = OUTPUT_BY_AGENT[agent] ?? toClaudeCodeHookOutput;
    const out = fmt(d, {}) ?? {};
    if (out._outsiderUndeliverable) return false;
    /*
     * Compare the TEXT the host will carry, not the JSON encoding of it —
     * JSON.stringify turns a newline into the two characters \ and n, so a probe
     * spanning a line break never matched and every delivery read as undelivered.
     */
    const flat = (v) => (typeof v === "string" ? [v]
      : v && typeof v === "object" ? Object.values(v).flatMap(flat) : []);
    const ws = (t) => String(t).replace(/\s+/g, " ").trim();
    const carried = ws(flat(out.hookSpecificOutput ?? out).join(" "));
    const text = ws(d.corrective ?? d.reason ?? "");
    if (!text) return false;
    /* a probe from the middle — heads get re-worded or prefixed by wrappers */
    const probe = text.slice(Math.floor(text.length / 3), Math.floor(text.length / 3) + 24);
    return probe.length > 4 ? carried.includes(probe) : carried.includes(text.slice(0, 20));
  } catch { return false; }
}

/* which registered expectation, if any, this decision is making */
function correctionKindOf(d) {
  if (!d || d.verdict === "allow") {
    /* an allow can still carry a correction — the loop's "take this edit" is one */
    if (!d?.loop) return null;
  }
  if (d.freeStop?.kind) return d.freeStop.kind;
  if (d.delivery?.result?.gaps?.length) return d.delivery.result.gaps[0].kind;
  if (d.patrol?.kind) return d.patrol.kind;
  if (d.loop) return "whack-a-mole";
  if (/又说了一遍|重复对齐/.test(String(d.reason ?? ""))) return "realignment";
  return null;
}

export function decideToolCall(opts = {}) {
  const ctx = {};
  const d0 = decideToolCallInner({ ...opts, _ctx: ctx });
  /*
   * ── THE COMPLIANCE LEDGER ────────────────────────────────────────────────
   * ALWAYS RECORD; the mode only decides whether to SPEAK. That is what makes
   * one machine produce both arms: a shadow install contributes controls, a live
   * install contributes interventions, and they are scored by the same code
   * against a definition pinned before the data existed.
   *
   * A destructive refusal is never withheld and never assigned an arm —
   * withholding an `rm -rf` block to collect a data point would be running an
   * experiment on someone else's disk.
   */
  const d = applyComplianceMode(d0, opts, ctx);
  /* controller 拥有这个 worker 时,沉默必须拼成 allow —— 见 toClaudeCodeHookOutput */
  if (ctx.unattended) d._unattended = true;
  /*
   * ── 说出口的同时，登记一条可证伪的期望 ──────────────────────────────────
   *
   * Written AT THE MOMENT WE SPEAK, never afterwards. A supervisor that decides
   * later what it had meant is grading its own homework, and the whole case for
   * this product rests on judging claims against a record that was fixed before
   * the outcome was known. The same rule has to bind us.
   */
  if (ctx.settled) { d.settled = ctx.settled; if (ctx.settled.note) d.settledNote = ctx.settled.note; }
  /*
   * ESCALATION USES WHAT ALREADY EXISTS — no new detector. An unmet correction
   * raises its own dose: attempt 2 turns the same predicate from a sentence into
   * a refusal, attempt 3 stops and records. Re-diagnosis is asked OF THE AGENT;
   * this layer cannot make a new plan and does not pretend to.
   */
  const kind = correctionKindOf(d);
  /*
   * ── PENDING 就闭嘴 ──────────────────────────────────────────────────────
   * The observer's own comment said "pending — say nothing new" and the code
   * only declined to overwrite the state file; every detector still ran and the
   * same warn went out again, every call, for the whole window. That is how a
   * warning becomes wallpaper — the exact failure this repo has already paid for
   * once with the level-based complexity check.
   */
  if (ctx.pendingOpen && kind && kind === ctx.pendingOpen.kind && d.verdict === "warn") {
    d.verdict = "allow";
    d.suppressed = { kind, reason: "同一条判据仍在观察窗口内，不重复说" };
    delete d.corrective;
  }
  /*
   * ── 升级只能落在同一条判据、同一类动作上 ───────────────────────────────
   * The first version enforced on `escalate.enforce && verdict === "warn"`, with
   * no check that the CURRENT finding was the one that went unmet. So an unmet
   * `stale-green` could turn an unrelated redundant-reread warning into a
   * refusal — not "this predicate escalates" but "the last failure adds time to
   * whatever comes next".
   */
  if (ctx.escalate) {
    d.escalate = ctx.escalate;
    d.settledNote = ctx.escalate.note;
    const sameKind = kind && kind === ctx.escalate.kind;
    if (ctx.escalate.enforce && sameKind && d.verdict === "warn" && !d.proposed?.isEdit) {
      d.verdict = "deny";
      d.reason = `上一条纠正没有兑现（第 ${ctx.escalate.attempt} 轮）：${String(d.reason ?? "").slice(0, 80)}`;
    }
  }
  /* 观察器在这个宿主上跑不起来时，连登记都不要做 —— 留一堆永远无法结算的卡片
     等于假装它在工作 */
  if (kind && opts.cwd && opts.control !== false && !ctx.observerOff
      && !ctx.settled?.verdict && !d.suppressed) {
    try {
      const last = ctx.lastUid ?? null;
      const spoke = d.verdict !== "allow" || Boolean(d.corrective);
      const open = openCorrection({ kind, anchorUid: last,
        attempt: ctx.escalate?.attempt ?? 1,
        sessionId: ctx.sessionId, origin: ctx.fleet?.origin ?? "main",
        paths: d.loop?.escape ?? d.patrol?.facts?.unverifiedFiles ?? [],
        signature: d.freeStop ? (d.proposed?.cmd ?? d.proposed?.file) : null });
      if (open) {
        /* WHICH ARM THIS ROW BELONGS TO, decided here and never inferred later */
        open.spoke = spoke && !d._outsiderSilenced;
        open.arm = d._shadow?.arm ?? (d._outsiderSilenced ? "control" : "treatment");
        /*
         * ── 这个字段叫它真正证明的那件事 ────────────────────────────────
         * 它叫 `delivered` 的时候，读的人会以为模型收到了。它证明的只是
         * 渲染出来的 payload 里带着这句话。Codex 的 deny reason 到的是终端，
         * 文字确实在 permissionDecisionReason 里 —— 于是它会被记成
         * delivered=true，再一次污染 treatment effect。
         *
         * 没有任何本地手段能证明模型收到了。所以：能证明的那件事照实命名，
         * 证明不了的那件事显式留空，谁要算疗效谁自己面对这个空。
         */
        open.payloadCarried = open.spoke ? payloadCarries(opts.agent ?? "claude-code", d) : false;
        open.contextReachesModel = supports(opts.agent ?? "claude-code", "contextToModel");
        open.deliveredToModel = null;   /* 本地无法证明 —— 不猜 */
        open.correctiveHash = hashText(d.corrective ?? d.reason ?? "");
        const p = ctx.statePath ?? null;
        if (p) {
          const body = JSON.stringify(open);
          if (opts.writeFileFn) opts.writeFileFn(p, body);
          else { mkdirSync(p.replace(/[/][^/]*$/, ""), { recursive: true }); writeFileSync(p, body); }
          d.opened = open;
        }
      }
    } catch { /* registration is best effort; it never changes a verdict */ }
  }
  /* a bench that failed must reach the operator whether or not the fleet view
     was assembled — the note is about THIS decision, not about the fleet */
  if (ctx.deliveryNote) d.deliveryNote = ctx.deliveryNote;
  if (!ctx.fleet) return d;
  const out = { ...d, fleet: ctx.fleet };
  if (ctx.contextLoss) out.contextLoss = ctx.contextLoss;
  if (ctx.archNote) out.archNote = ctx.archNote;
  if (ctx.deliveryNote) out.deliveryNote = ctx.deliveryNote;
  if (d.verdict === "allow") return out;
  try {
    const trace = sessionTraceFromSteps({
      steps: ctx.fleetSteps, executor: opts.executor, world: opts.world,
      claim: ctx.claim ?? null, usageByOrigin: ctx.usageByOrigin,
    });
    out._outsiderCard = measureTraceStage05({ trace });
  } catch { /* the record is best effort; it must never change a verdict */ }
  return out;
}

function decideToolCallInner({
  toolName, toolInput = {}, transcriptPath = null, priorSteps = null, _ctx = null,
  contract = {}, executor, world, agent = "claude-code",
  cwd = null, window = 120,
  /* the floor, not the machine. Opt-out because a host whose subagent logs live
     somewhere else entirely should degrade to today's behaviour, not to a wrong
     one. `OUTSIDER_FLEET=0` also turns the Stage 0.5 record off. */
  fleet = process.env.OUTSIDER_FLEET !== "0",
  /* injectable so tests never touch the disk; the hook reads one small file */
  readFileFn = (p) => readFileSync(p, "utf8"),
  writeFileFn = null, spawnFn = spawn,
  /* re-running the agent's own test command is opt-out, not opt-in: without it
     the supervisor is blind on 96% of real failures. `OUTSIDER_FAULTCARD=0` for
     a suite whose tests are not safe to run twice. */
  faultCards = process.env.OUTSIDER_FAULTCARD !== "0",
  /* the architecture bench. Off the line by necessity — 2886ms on a real
     426-file repo against a 161ms hook. `OUTSIDER_ARCHBENCH=0` to disable. */
  archBench = process.env.OUTSIDER_ARCHBENCH !== "0",
  /* the final inspection. On by default: it is the only layer that looks at the
     deliverable rather than at the process. `OUTSIDER_ACCEPT=0` to disable. */
  deliveryCheck = process.env.OUTSIDER_ACCEPT !== "0",
  /*
   * THE ONLY THING IN OUTSIDER THAT CAN LEAVE THE MACHINE, AND IT IS OFF.
   * No vendor, no model, no endpoint is hardcoded anywhere: the operator names
   * their own command (`OUTSIDER_JUDGE="claude -p"`), their credentials, their
   * choice. Unset — the default — and nothing is ever called.
   */
  judgeCmd = process.env.OUTSIDER_JUDGE || null,
  /* 巡检 —— the strategic-window walk. On by default: without it this product is
     an end-of-run auditor, which the operator can replace with one sentence.
     `OUTSIDER_PATROL=0` to disable. */
  patrol = process.env.OUTSIDER_PATROL !== "0",
  /* 改写 —— the only intervention here that is not text. `OUTSIDER_REWRITE=0`
     to disable; dropping it returns exactly today's behaviour, by design. */
  rewrite = process.env.OUTSIDER_REWRITE !== "0",
  /* 代价为零的实时拒绝。`OUTSIDER_FREESTOP=0` to disable. */
  freeStop = process.env.OUTSIDER_FREESTOP !== "0",
  /* 控制状态机：结算上一条纠正、登记下一条。`OUTSIDER_CONTROL=0` to disable. */
  control = process.env.OUTSIDER_CONTROL !== "0",
  /*
   * controlled 模式由磁盘上的 run.json 决定,不由环境变量猜。没有它就是
   * observer-only —— 而且 run.json 里那个 mode 字段会明写出来。
   */
  controlled = null,
} = {}) {
  /* SCOPE FIRST. A session is not a task: without a recency and a same-repo
     bound this reconstructs every step the operator has taken today, then
     grounds its corrections in whichever of them parsed. `cwd` comes straight
     off the hook payload — both hosts have been sending it all along. */
  /* controller 的存在与否是磁盘上的事实 */
  const _run = controlled === null && cwd ? readRunState(cwd, { readFile: readFileFn }) : null;
  const _controlled = controlled ?? (_run?.mode === "controlled" && _run.supervisorCmd
    ? { supervisorCmd: _run.supervisorCmd } : null);
  controlled = _controlled;
  if (_ctx && (_run?.mode === "controlled" || process.env.OUTSIDER_RUN === "1")) _ctx.unattended = true;

  const usageByOrigin = fleet && !priorSteps ? {} : null;
  const raw = priorSteps ?? (fleet
    ? trajectoryFromSession(transcriptPath, agent, { window, usageByOrigin })
    : trajectoryFromTranscript(transcriptPath, agent));
  /*
   * TWO VIEWS OF THE SAME FLOOR, AND THE LINE BETWEEN THEM IS THE POINT.
   *
   * `fleetSteps` is everything: the parent transcript plus every subagent log
   * beside it. On this repo's own session that is 205 steps where a single
   * transcript showed 44 — the supervisor had been judging a run while seeing
   * roughly half of it.
   *
   * `steps` stays the OWN CHAIN — the agent whose tool call we were actually
   * invoked for. Every detector with real-traffic calibration keeps exactly the
   * input it was calibrated on, so widening the eyes cannot invent an
   * interruption yesterday's 0.29% never saw. A worker is judged on his own
   * work; the rest of the floor is context.
   *
   * The fleet view is therefore DISCLOSURE AND MEASUREMENT ONLY in this version:
   * it reaches the operator's note and the Stage 0.5 record, and it changes no
   * verdict. Authority over it has to be earned on real multi-agent traffic
   * first — pointing an uncalibrated detector at a live gate is the exact move
   * that made the previous install unusable.
   */
  const origin = priorSteps ? "main" : originOf(transcriptPath);
  const fleetSteps = scopeTrajectory(raw, { cwd, window: window * 2 });
  /*
   * NO FALL-BACK TO THE FLEET WHEN THE OWN CHAIN IS EMPTY. The first draft did
   * exactly that, and the regression wall caught it on the first run: four red
   * runs inside one subagent, and the MAIN agent's next edit was denied for a
   * loop it had no part in. An empty own chain is not missing information — it
   * is the finding that this worker has done nothing yet, and the honest verdict
   * on nothing is nothing.
   *
   * Untagged steps (every existing caller passing `priorSteps`) default to
   * "main" upstream, so this is byte-for-byte today's input for them.
   */
  const own = ownChain(raw, origin);
  const steps = scopeTrajectory(own, { cwd, window });
  if (_ctx && fleet) {
    _ctx.fleetSteps = fleetSteps;
    _ctx.usageByOrigin = usageByOrigin;
    _ctx.fleet = fleetSummary(fleetSteps, { usageByOrigin });
    /*
     * THE WORK ORDER, HANDED BACK. The host records when it wiped the agent's
     * window; the supervisor reads from disk and still holds what the operator
     * said before that. Restoring the operator's own text is the one guidance
     * this layer can give without pretending to out-think the model — it is not
     * our opinion, it is their instruction.
     *
     * If the compaction happened outside the read window it is silently absent,
     * which is correct rather than merely acceptable: the disclosure only fires
     * for a RECENT wipe, and a recent wipe is inside the tail by construction.
     */
    const acc = usageByOrigin?.[origin];
    if (acc?.boundaries?.length) {
      try {
        const cl = assessContextLoss({ turns: acc.operator ?? [],
          boundaries: acc.boundaries, steps });
        if (cl.detected) _ctx.contextLoss = cl.findings[0];
      } catch { /* never break the gate */ }
    }
    _ctx.fleet.origin = origin;
    /* the honest denominator: what this decision was actually computed on */
    _ctx.fleet.judgedSteps = steps.length;
  }
  const session = createSupervisionSession({
    executor: executor ?? { id: "hooked-agent", kind: "coding-agent" },
    /* DEFAULT to a real workstation (non-reversible), NOT a sandbox — so an
       unrecognized, not-provably-safe command is gated, not waved through. The
       operator opts into relaxation with world { kind: "sandbox" }. */
    world: world ?? { kind: "workstation" }, contract,
  });
  /*
   * ingest() RETURNS the said-vs-did mismatches it just found. This loop used to
   * discard them — `for (const s of steps) session.ingest(s);` — which meant the
   * single highest-confidence signal in the whole system (0.95: "the agent says
   * the tests pass, the trace says they failed") was computed on every hook
   * invocation and thrown away. What survived was a destructive-command blocker,
   * which is a feature both hosts already ship. Keeping the result is the
   * difference between this being a product and being a redundant one.
   */
  const mismatches = [];
  for (const s of steps) {
    const r = session.ingest(s);
    for (const m of r?.saidVsDid ?? []) mismatches.push(m);
  }

  const proposed = classifyToolCall(toolName, toolInput);

  /*
   * 1) THE GATE — destructive ⇒ deny (human); deploy-before-green ⇒ deny.
   *
   * `unknown` used to ⇒ ask. That was wrong, and it is the failure that killed a
   * real session: unknown means "I cannot PROVE this is safe", which is not the
   * same claim as "this is dangerous". Both hosts already ship a permission
   * system that asks the human about commands it does not recognise. Raising a
   * second prompt in front of the first one duplicates a feature the host gives
   * away — precisely the category of waste this project exists to price — and in
   * an unattended session (Cowork, CI, any headless agent) there is nobody there
   * to clear it, so every `ask` lands as a `deny` with better manners.
   *
   * Measured on a 91-command corpus of ordinary traffic: `ask`-on-unknown turned
   * 42.6% of the calls the operator wanted into interruptions.
   *
   * So: DEFER. Say nothing, let the host's own permission system decide. Outsider
   * only ever stops what it can prove is destructive, or a deploy on a red test.
   * The unknown command still flows through the differentiator channels below —
   * a said-vs-did mismatch is worth reporting whatever tier the command is.
   */
  /*
   * ── 0) 先结算上一条纠正 ─────────────────────────────────────────────────
   *
   * Before saying anything new, find out what happened to what was already said.
   * Every layer in this file used to end at "spoke"; none of them ever came back
   * to look, which is why the one number that decides whether any of this works
   * — does an intervention change behaviour — sat at n=0 for seven rounds while
   * I answered with more detectors.
   *
   * The judgement is made against the trajectory, never against anything the
   * agent reports. That asymmetry is the product, and it applies to grading our
   * own corrections too.
   */
  let settled = null, escalate = null, pendingOpen = null;
  const sessionId = transcriptPath
    ? `${hashText(String(transcriptPath))}-${String(transcriptPath).split(/[/\\]/).pop().replace(/\.jsonl?$/, "").slice(0, 12)}`
    : "nosession";
  const statePathFor = cwd ? statePath(cwd, { sessionId, origin }) : null;
  /*
   * 没有唯一事件身份 = 观察器没有锚点 = 每一轮都是 unknown。那不是「有 bug」，
   * 是根本没在运行。明确关掉并在 stderr 上说，而不是静静地产出 CENSORED。
   */
  const observerOn = control && observerUsable(agent);
  if (control && !observerOn && _ctx) _ctx.observerOff = agent;
  if (observerOn && statePathFor) {
    try {
      const open = JSON.parse(readFileFn(statePathFor));
      const r = judgeOpen(open, steps);
      if (r && r.verdict === "pending") {
        /* PENDING 就闭嘴：同一条判据在窗口内不再说第二遍 */
        settled = r; pendingOpen = open;
      } else if (r && r.verdict === "unknown") {
        /* 看不见。不计分、不升级、不拒绝，也不重复登记 —— 静静关掉。 */
        settled = r;
        try { writeState(cwd, statePathFor, JSON.stringify({ state: "CENSORED" }), writeFileFn); } catch { /* */ }
      } else if (r) {
        settled = r;
        escalate = escalation(open, r);
        const line = `${ledgerLine(r, { at: Date.now(), sessionId, origin,
          spoke: open.spoke ?? null, payloadCarried: open.payloadCarried ?? null,
          contextReachesModel: open.contextReachesModel ?? null, deliveredToModel: null,
          arm: open.arm ?? null,
          correctiveHash: open.correctiveHash ?? null })}\n`;
        try {
          /*
           * ESCALATION HAS TO SURVIVE THIS PROCESS. The first version computed
           * attempt 2 and then wrote RESOLVED, so the next hook call found
           * nothing and started again at attempt 1 — MAX_ATTEMPT was a policy
           * that existed only in the comment.
           */
          const nextState = escalate && !escalate.done && escalate.next
            ? { ...escalate.next, anchorUid: steps.length ? steps[steps.length - 1].uid ?? null : null }
            : { state: "RESOLVED" };
          writeState(cwd, statePathFor, JSON.stringify(nextState), writeFileFn);
          appendLedger(cwd, line, writeFileFn);
        } catch { /* the ledger is best effort */ }
      }
    } catch { /* no open correction for this agent */ }
  }
  if (_ctx) { _ctx.settled = settled; _ctx.escalate = escalate; _ctx.sessionId = sessionId;
    _ctx.statePath = statePathFor; _ctx.pendingOpen = pendingOpen;
    _ctx.lastUid = steps.length ? steps[steps.length - 1].uid ?? null : null; }

  /*
   * ── 出厂验收，算在闸门之前 ─────────────────────────────────────────────
   * A delivery moment that also happens to be a deploy gets DENIED by the gate
   * below — correctly, because pushing on a red test is irreversible for
   * somebody else. But a bare "denied" at that moment is exactly 叫停就走人.
   * The inspection runs first so its rework order can ride on whatever verdict
   * follows: the refusal keeps its authority, and the worker still gets told
   * what the gap is and what to do about it.
   */
  let delivery = null;
  if (deliveryCheck) {
    try {
      delivery = assessDelivery({ proposed, steps,
        operatorTurns: usageByOrigin?.[origin]?.operator ?? [],
        usage: usageByOrigin?.[origin]?.usage ?? null,
        boundaries: usageByOrigin?.[origin]?.boundaries ?? [] });
    } catch { delivery = null; }
    /*
     * ── 外部检验，只在这一个点上，且只有操作方点名了命令才会发生 ──────────
     *
     * The one disease the local inspection declares it cannot see — 表面
     * requirements 都做了、内里是拖拉机发动机 — is semantic, and no count of
     * commands reaches it. The cure is not a cleverer local judge; it is an
     * UNCONTAMINATED one: the same model with none of this run's context, no
     * sunk cost, no self-serving compressed memory. What it cannot see is
     * exactly what made the worker ill.
     *
     * It stays OFF unless `OUTSIDER_JUDGE` names a command, because a
     * supervisor that phones out by default is not a supervisor. Once per
     * delivery, not per incident — the operator's objection to per-problem
     * calls was correct, and this is the one moment worth paying for.
     */
    if (delivery && judgeCmd) {
      try {
        delivery = judgeDelivery({ delivery, cwd, cmd: judgeCmd,
          readFile: readFileFn,
          writeFile: writeFileFn ?? ((p, b) => {
            mkdirSync(`${String(cwd).replace(/\/+$/, "")}/.outsider`, { recursive: true });
            writeFileSync(p, b);
          }),
          readProbe, requestProbe, spawnFn });
      } catch { /* the bench never breaks the gate */ }
      /*
       * A DEAD JUDGE SAYS SO — the same rule the architecture bench had to learn
       * the hard way, and it matters more here. The operator turned this on
       * precisely to catch 拖拉机发动机; if the command silently never ran, the
       * night's guarantee is void and nobody knows it. An unreachable judge
       * never blocks a delivery, but it is never invisible either.
       */
      if (_ctx && delivery?.external?.state === "failed") {
        _ctx.deliveryNote = `外部检验没跑成：${String(delivery.external.why ?? "原因不明").slice(0, 200)}`
          + " —— 「做得深不深」这一项本次没有检查。本地那几项照常验过了；"
          + "OUTSIDER_JUDGE 是你自己设的命令，可以先在终端里单独跑一次看看。";
      }
    }
  }
  const failedDelivery = delivery && !delivery.passed ? delivery : null;

  const auth = session.authorize(proposed);
  if (auth.allow === false && auth.risk !== "unknown") {
    /*
     * ── DELETING WHAT THIS RUN ITSELF MADE ────────────────────────────────
     *
     * The single largest remaining class of false blocks on real traffic: an
     * agent removes an artifact it generated earlier in the same session and
     * then regenerates it. `rm -f fixtures/v41-cm1/*.pt && npm run v39:seal`.
     *
     * A host's permission dialog cannot know this — it sees one command with no
     * history. The supervisor has the run. That asymmetry is the whole reason
     * this product is not a duplicate of the confirmation prompt, and it is a
     * far better justification than reading a script's NAME and guessing what it
     * regenerates, which is the shape of the `mkdir` hole from the last round.
     *
     * Bounded hard: only `rm`, only when EVERY target was created by this run,
     * and never for the paths that can never be rebuilt (`~/.ssh`, `.git`, …) —
     * `wasCreatedInRun` refuses those outright, so an agent cannot manufacture
     * permission by touching a secret first.
     */
    /*
     * Evidence of creation comes from the UNSCOPED own chain, not from `steps`.
     * `scopeTrajectory` drops steps whose paths fall outside the cwd — which is
     * right for grounding a correction and exactly wrong here: `cp
     * /tmp/sem-validate.mjs ./sem-validate.mjs` was being filtered out, so the
     * one step proving the file was created never reached the check. The scope
     * filter and the creation ledger answer different questions.
     */
    const undo = auth.risk === "destructive" && !proposed.isEdit
      && undoesOwnWork(proposed.cmd ?? proposed.action, own.length ? own : steps, cwd);
    if (!undo) {
      return { verdict: "deny", proposed, risk: auth.risk,
        reason: failedDelivery
          ? `${auth.decision.reason}（并且出厂验收未通过：${failedDelivery.result.gaps.map((g) => g.kind).join(", ")}）`
          : auth.decision.reason,
        /* the refusal keeps its authority; the rework order rides along so the
           line does not stop dead */
        corrective: failedDelivery ? failedDelivery.order : auth.decision.corrective,
        ...(failedDelivery ? { delivery: failedDelivery } : {}) };
    }
  }

  /*
   * 1·5) THE LOOP — the only signal in the system that may STOP an agent, and the
   *      only place this product stops being a detector and starts being a
   *      supervisor.
   *
   *      It acts ABOVE every per-step finding: a complexity note delivered in the
   *      middle of a whack-a-mole loop is noise, because the edit should not be
   *      happening at all.
   *
   *      Refusing is not authority. `authority: none` constrains what Outsider may
   *      AUTHORIZE. The gate has always been allowed to REFUSE — it already refuses
   *      destructive actions. This is one more refusal, on measured evidence:
   *      ≥3 attempts at the SAME error, with the edits landing off the failing path
   *      or the blast radius widening every round.
   */
  /*
   * 1·4) THE FAULT CARD. Measured on real traffic: in 26 of 27 failing test steps
   *      the traceback named no source file, because the agent's own command had
   *      piped the output through grep before it reached us. The supervisor was
   *      reading the report the worker chose to hand in.
   *
   *      When blind, ask for the whole ticket: re-run the command the agent JUST
   *      RAN, minus the output filter. Nothing guessed, nothing written, and only
   *      when the agent's own output was not enough.
   */
  let enriched = steps, faultNote = null;
  if (faultCards && cwd) {          // no cwd ⇒ no machine to walk to
    try {
      const blind = blindFailure(steps, { parseTraceback, isTestFile });
      if (blind) {
        const card = readFaultCard({ cwd, key: blind.key, readFile: readFileFn, now: Date.now() });
        if (card?.observation) {
          /*
           * The card is keyed on the COMMAND, so it explains every blind failure
           * of that command in this window, not only the newest one. Enriching
           * just the last step would leave the loop detector with a single
           * legible cycle forever — it needs two of the same signature — so a
           * session whose agent always pipes could never surface a mole at all.
           *
           * This is an INFERENCE and it is labelled as one: the run we observed
           * may not be byte-identical to the earlier ones, and the corrective
           * says the failure identity came from our own re-run rather than from
           * that attempt's own output. An inferred fact the reader can see is
           * inference is honest; an inferred fact presented as observed is not.
           */
          let n = 0;
          enriched = steps.map((x) => {
            if (!(x.isTest && x.exit != null && x.exit !== 0)) return x;
            if (failureKey(x) !== card.key) return x;
            if (parseTraceback(x.observation ?? "").frames.some((f) => f.file && !isTestFile(f.file))) return x;
            n += 1;
            return { ...x, observation: card.observation, observationFrom: "faultcard" };
          });
          faultNote = `fault card: 这条命令的输出被管道丢掉了，已自行重跑 \`${blind.cmd}\` 取回完整故障单`
            + `（补全了 ${n} 次失败的输出，属于推断，不是那几次自己的输出）`;
        } else if (!card) {
          const ok = requestFaultCard({ cwd, key: blind.key, cmd: blind.cmd, spawnFn, writeFn: writeFileFn });
          faultNote = ok
            ? `fault card: 这次红测的输出被管道丢掉了，已在后台重跑 \`${blind.cmd}\`，下一步就有完整故障单`
            : null;
        }
      }
    } catch { /* never break the gate */ }
  }

  let loop = { detected: false, rung: "none" };
  try { loop = assessWhackAMole({ steps: enriched }); } catch { /* never break the gate */ }

  /*
   * STOP THE EDITS, NOT THE DIAGNOSIS.
   *
   * The reference wiring also fired on every shell command. Replayed on a real
   * session that meant one loop episode delivered the same paragraph on nine
   * consecutive calls — including the `npm test` and `grep` calls the agent needs
   * in order to DO what the correction just asked. Repeating a correction the
   * agent is already acting on is how a correction becomes wallpaper, and denying
   * the diagnosis is how a stop becomes a wall.
   *
   * The edit is the act the loop is made of, so the edit is what we speak to.
   */
  const caps = capsFor(agent);
  /*
   * THE RATCHET, READ ONLY INSIDE A CHAIN THE FOREMAN HAS ALREADY STOPPED.
   *
   * Level-based complexity failed calibration outright (82.6–92.0% of real files
   * — V73), so this never asks "is this code complex". It asks what has been
   * happening to the PART across this repair: a worker adding a new part is
   * fine, a worker welding another bracket on at every re-fix of the same fault
   * is repairing a machine into scrap. Because it only speaks where the loop
   * already speaks, it cannot add an interruption of its own — it adds a
   * sentence to one the operator was going to get anyway.
   */
  let ratchet = null;
  if (loop.detected) {
    try {
      const lastRed = steps.findLastIndex((s) => s.isTest && s.exit != null && s.exit !== 0);
      const since = lastRed >= 0 ? steps.slice(lastRed) : steps;
      ratchet = assessRatchet({
        attemptEdits: since.filter((s) => s.isEdit),
        proposed: Number.isFinite(proposed.cx) ? proposed : null,
      });
    } catch { /* never break the gate */ }
  }
  const withNote = (d) => {
    let out = faultNote ? { ...d, _outsiderFaultCard: faultNote } : d;
    if (ratchet) {
      out = { ...out, ratchet,
        corrective: `${out.corrective ?? ""}${ratchetNote(ratchet)}`.trim() || undefined };
    }
    return out;
  };
  if (loop.detected && (proposed.isEdit || proposed.isSubmit)) {
    const corrective = loopCorrective(loop, { agent });
    /*
     * NO CONTEXT CHANNEL ⇒ NO GUIDANCE-DEPENDENT REFUSAL.
     *
     * On Codex the correction cannot reach the model at all — measured, not
     * assumed. A stop whose way out is undeliverable is a wall with a reason
     * written on the far side of it. The operator still hears about it on
     * stderr; the agent is not blocked on an instruction it cannot receive.
     */
    if (!caps.context) {
      return { verdict: "allow", proposed, risk: proposed.risk, loop,
        _outsiderUndeliverable: `打地鼠 attempt ${loop.attempts}: ${String(loop.signature).slice(0, 60)} `
          + `— 本宿主没有上下文通道，这条纠正到不了模型，只报给你` };
    }
    /*
     * A STOP WITHOUT A NAMED WAY OUT IS A WALL — and this is where the previous
     * install died, so it gets a hard rule rather than a comment.
     *
     * The stop is only legitimate because the agent can clear it by editing the
     * file the failure actually comes from. When the traceback names no source
     * file outside what it already edited, `escape` is EMPTY: there is no edit
     * the agent could make that would lift the block, so every attempt is denied
     * and the session ends. Measured on real logs, `escape` was empty in 9 of 13
     * failing cycles — mostly because the agent's own command pipes the traceback
     * through grep, so the diagnostics never reached us.
     *
     * With no way out to name, the honest act is to advise, not to refuse.
     */
    const wayOut = loop.escape.length > 0;
    /*
     * THE WAY OUT MUST BE WALKABLE — the single worst defect of this session,
     * found by self-audit after the night simulation had already "passed".
     *
     * The stop tells the agent, by name: "then edit /repo/src/pool.js — the file
     * the failure actually comes from". Then the next branch denied EVERY edit,
     * including that one. The agent could not comply with the instruction it had
     * just been given; every attempt came back refused. That is precisely the
     * wall that ended the previous installation, rebuilt with better prose.
     *
     * The night simulation missed it because I only ever simulated the agent
     * editing some OTHER file. It never tried to obey.
     *
     * An edit that lands on the failing path is the escape. It is allowed, at
     * every rung, always — that is what makes the refusal legitimate rather than
     * a wall with an explanation attached.
     */
    const sameFile = (a, b) => {
      const x = String(a).replace(/\\/g, "/"), y = String(b).replace(/\\/g, "/");
      return x === y || x.endsWith(`/${y}`) || y.endsWith(`/${x}`);
    };
    const onFailingPath = proposed.file
      && [...(loop.escape ?? []), ...(loop.failingFiles ?? [])].some((f) => sameFile(proposed.file, f));
    if (onFailingPath) {
      return withNote({ verdict: "allow", proposed, risk: proposed.risk, loop,
        reason: "edit lands on the failing path — this is the way out, taken" });
    }

    if (loop.rung === "stop" && wayOut) {
      return withNote({ verdict: "deny", proposed, risk: proposed.risk, loop,
        reason: `whack-a-mole: attempt ${loop.attempts} at the same failure, `
          + `${Math.round(loop.offPathRatio * 100)}% of attempts off the failing path`,
        corrective });
    }
    if (loop.rung === "escalate") {
      /*
       * DENY, NOT ASK — a deliberate divergence.
       *
       * `ask` raises a permission prompt: at 3am, unattended, that is a session
       * frozen until a human clicks something, which is the exact failure this
       * product exists to remove. `deny` blocks the EDIT while leaving the agent
       * free to do what the escalate text asks — write up what failed, what it
       * tried, and what it believes the root cause is. The operator wakes up to a
       * report instead of a modal.
       */
      return withNote({ verdict: "deny", proposed, risk: proposed.risk, loop,
        reason: `whack-a-mole: ${loop.attempts} attempts, root cause never addressed `
          + `— stop and report to your user`,
        corrective });
    }
    /*
     * ONCE PER ATTEMPT, not once per edit.
     *
     * A refusal has to be repeated — an unenforced deny is not a deny. Advice
     * does not: after the first edit of an attempt, the agent is DOING the thing
     * the advice asked for, and repeating the paragraph while it works is how the
     * channel becomes wallpaper. Replayed on a real session, one loop episode
     * delivered the same correction on nine consecutive edits.
     *
     * "The first edit of this attempt" is derivable with no state: no edit has
     * landed since the last test ran.
     */
    const lastTestIdx = steps.findLastIndex((s) => s.isTest && s.exit != null);
    const editsThisAttempt = steps.slice(lastTestIdx + 1).filter((s) => s.isEdit).length;
    if (editsThisAttempt > 0) return withNote({ verdict: "allow", proposed, risk: proposed.risk, loop });

    /* nudge, or a stop we are not entitled to enforce: guidance, no interruption */
    return withNote({ verdict: "warn", proposed, risk: proposed.risk, loop,
      reason: `whack-a-mole forming: attempt ${loop.attempts} at the same failure`
        + (loop.rung === "stop" && !wayOut ? " (advisory only — the traceback names no source file to aim at)" : ""),
      corrective });
  }

  /*
   * 1·7) THE CHARTER — the strategic half.
   *
   *      The loop above catches an agent stuck on one error for twenty minutes.
   *      It cannot catch what actually ruins an overnight run: the architecture
   *      bending a degree at a time, a branch that made sense at 1am owning the
   *      whole session by 4am, the brief decaying out of the window while every
   *      individual step still looks reasonable.
   *
   *      Outsider does not judge whether the work is good. It reconciles the
   *      trajectory against what the AGENT ITSELF committed to — which is the
   *      same said-vs-did machine that carries the highest confidence in the
   *      product, pointed at a different claim.
   */
  let charter = { ok: false, charter: null, problems: [] };
  try { charter = readCharter({ cwd, steps, readFile: readFileFn }); } catch { /* never break the gate */ }

  if (proposed.isEdit && !proposed.charterBody) {
    /*
     * ASK ONCE, on the first edit of the run, and never in that form again.
     * A request repeated every call is wallpaper, and this is the channel we
     * need the agent to still be reading an hour from now. Absence NEVER denies:
     * a supervisor that refuses to let work begin until it likes the paperwork
     * is a worse obstacle than the drift it prevents.
     */
    /*
     * NOT on the first edit. A two-edit typo fix does not need a charter, and
     * asking for one is the noisy-supervisor failure in its purest form: pure
     * overhead on the sessions that were never going to drift. Three edits in,
     * this is a real task — and still early enough that a charter declared now
     * is a baseline for the eight hours that follow.
     */
    const priorEdits = steps.filter((s) => s.isEdit).length;
    if (priorEdits === 3 && (!charter.charter || !charter.ok) && capsFor(agent).context) {
      return { verdict: "warn", proposed, risk: proposed.risk,
        reason: charter.charter ? "charter 不合格" : "本次运行还没有 charter",
        corrective: charterRequest(charter.charter ? charter.problems : null) };
    }
  }

  let drift = { detected: false, findings: [], notChecked: [] };
  try {
    drift = assessCharterDrift({ charter: charter.ok ? charter.charter : null, steps, proposed });
  } catch { /* never break the gate */ }

  if (drift.detected) {
    const worst = drift.findings[0];
    /*
     * ACCEPTANCE AT THE FINISH LINE MAY REFUSE. Every other charter finding
     * advises.
     *
     * "You are editing outside your scope" is a fact we cannot grade — the agent
     * may have an excellent reason, and refusing on our reading of its plan is
     * exactly the opinion-as-authority this project forbids. It advises.
     *
     * "You are declaring this done, and the acceptance command YOU named has
     * never run / is red" is different in kind. We are not applying our standard;
     * we are holding the agent to the one it wrote down. And the way out is
     * plainly available: run it, make it green, or revise the charter if the
     * command itself was wrong.
     */
    const isAcceptance = worst.kind.startsWith("acceptance-");
    if (!caps.context) {
      /* same rule as the loop: the way out ("run it, or revise the charter")
         cannot reach the model on this host, so it is reported to the operator
         instead of enforced against an agent that cannot hear it */
      return { verdict: "allow", proposed, risk: proposed.risk, drift,
        _outsiderUndeliverable: `charter: ${worst.kind} — 本宿主没有上下文通道，这条到不了模型，只报给你` };
    }
    if (isAcceptance && proposed.isSubmit) {
      return { verdict: "deny", proposed, risk: proposed.risk, drift,
        reason: `charter: ${worst.kind} — ${worst.detail}`,
        corrective: `${worst.corrective}\n\n出路：跑一次让它变绿；或者这条命令本身写错了，就改 `
          + `${CHARTER_PATH} 并说明。两条都行，悄悄收尾不行。` };
    }
    return { verdict: "warn", proposed, risk: proposed.risk, drift,
      reason: `charter: ${worst.kind} — ${worst.detail}`, corrective: worst.corrective };
  }

  /*
   * 2) THE DIFFERENTIATOR — said-vs-did and waste. Placed ABOVE the red-test
   *    warn deliberately: a said-vs-did mismatch is a statement about something
   *    that has ALREADY happened and carries higher confidence (0.95) than a
   *    prediction about what is about to. Reporting the weaker signal first
   *    would bury the stronger one under it.
   *
   *    These never deny. Nothing here is dangerous — it is expensive, and spend
   *    is the operator's call, not ours. They ride the context channel, where a
   *    model can act on them without a human being interrupted.
   */
  /*
   * ── 1·75 代价为零的实时拒绝 ─────────────────────────────────────────────
   *
   * The one place a refusal can be spent freely DURING the work. Everything else
   * in this file trades a false positive against an interrupted night; here the
   * interrupted action could not have produced information the run does not
   * already hold, and the refusal hands that information back in the same
   * breath. Cost of being wrong about the value of the action: zero, by
   * arithmetic rather than by judgement.
   *
   * This is the answer to 干预必须发生在干活实时，贵是问题，那我们就想办法解决 —
   * not a cheaper moment to enforce at, but a class of enforcement that is free
   * at the expensive moment.
   */
  if (freeStop) {
    try {
      const fs = assessFreeStop({ proposed, steps, toolName });
      if (fs) {
        return { verdict: "deny", proposed, risk: proposed.risk,
          reason: `${fs.kind}：${fs.why}`, corrective: fs.corrective, freeStop: fs };
      }
    } catch { /* never break the gate */ }
  }

  /*
   * ── 1·8 THE ARCHITECTURE BENCH ──────────────────────────────────────────
   * Calibrated first (1 signal across 426 real files), benched second (2886ms).
   * Both numbers were required: a rare finding still cannot ride the hot path,
   * and a cheap check that fires on everything is not made safe by being cheap.
   *
   * The key is a coarse edit-count bucket, so one inspection covers a stretch of
   * work rather than one per edit — the throttle is the key itself, which needs
   * no extra state to hold.
   */
  let archNote = null;
  if (archBench && cwd) {
    try {
      const nEdits = steps.filter((s) => s.isEdit).length;
      const key = `arch:${Math.floor(nEdits / 10)}`;
      const card = readProbe({ cwd, name: "archcard", key, readFile: readFileFn, now: Date.now() });
      if (card && !card.pending && card.error) {
        /*
         * A DEAD BENCH SAYS SO. The first real packaging test shipped a bundle
         * missing the module the child loads; the child wrote its error into the
         * card and the operator was told nothing — the inspection simply never
         * happened, invisibly, forever. A supervisor that cannot be seen failing
         * is worse than no supervisor, and that sentence has now been earned
         * three times in this repo.
         */
        archNote = `架构质检台没跑起来：${String(card.error).slice(0, 160)} —— 这一项本次运行没有检查`;
      } else if (card && !card.pending && (card.introducedSignals ?? []).length) {
        /*
         * ONLY WHAT THIS RUN INTRODUCED.
         *
         * The level version reported the repo's pre-existing cycles on every
         * sweep — true, unhelpful, and identical every time, which is how a
         * signal becomes wallpaper. The operator's complaint was 架构一点一点
         * 做偏: a process, so the measurement is a delta. Inherited cycles are
         * not this run's doing and are never reported as such.
         */
        const s0 = card.introducedSignals[0];
        archNote = `架构：本次运行新引入了 —— ${s0.observed}`
          + (card.resolved?.length ? `（同时解掉了 ${card.resolved.length} 处旧的）` : "")
          + (card.truncated ? `（只扫了 ${card.nFiles} 个文件就停了，不是全量）` : "");
      } else if (card && !card.pending && card.firstSweep) {
        /* the baseline sweep says so rather than silently reporting nothing */
        archNote = null;
      } else if (!card && proposed.isEdit && /[.](?:js|mjs|cjs|ts|tsx|jsx)$/.test(proposed.file ?? "")) {
        requestProbe({ cwd, name: "archcard", key, runner: ARCHDRIFT_RUNNER,
          args: [new URL("./outsider-archdrift.js", import.meta.url).href, "src"],
          spawnFn, writeFn: writeFileFn });
      }
    } catch { /* the bench is best effort; it never breaks the gate */ }
  }
  if (archNote && _ctx) _ctx.archNote = archNote;

  /*
   * ── 1·9 出厂验收 ────────────────────────────────────────────────────────
   * The worker says the part is finished. This is the one moment where the
   * deliverable itself can be inspected — and the one disease the operator
   * described most vividly (法拉利外壳配拖拉机发动机) is invisible at every
   * other moment, because during the work every requirement was touched and
   * every step looked reasonable.
   *
   * It NEVER stops the run. A failed inspection returns a rework order — the
   * gap, the evidence for it, the next move — because "叫停就走人" is the thing
   * that paralyses the line. The night ends when the inspection passes, not when
   * the agent decides it is done.
   */
  if (failedDelivery) {
    const delivery = failedDelivery;
    const kinds = delivery.result.gaps.map((g) => g.kind).join(", ");
    /*
     * ── A FAILED INSPECTION HAS TO BITE ON THE ACT THAT SHIPS ────────────────
     *
     * Found the same way as the hold, one layer up: the external judge correctly
     * reported 滑动窗口没有任何对应的改动 — the tractor engine, caught — and the
     * `git push` ran anyway, because a failed delivery was a `warn` and a warn on
     * this host is allow + context. The inspection worked and the part shipped.
     *
     * A push is irreversible for other people, so this is 叫停 + 指导 —— the
     * refusal carries the rework order, which is the whole difference from
     * 叫停就走人. Nothing else is blocked: at a 声明完成 moment the tool call in
     * front of us is unrelated, and the words are the intervention.
     *
     * AND THE LINE IS IRREVERSIBILITY, NOT "IT LOOKS LIKE FINISHING". The first
     * cut keyed on `isSubmit`, which put `git commit -m 'fix pool timeout'` on
     * the deny side and cost 2.4% false interruptions on the 125-command corpus
     * — caught by the corpus, not by reading. A local commit is amendable,
     * resettable, and nobody else can see it; refusing one buys nothing and
     * spends the budget this product lives on. `risk === "deploy"` is the tier
     * that already means "this one is not yours to take back".
     *
     * AND IT LETS GO. An agent that cannot close the gap would otherwise retry
     * the push all night against a verdict that cannot change without an edit —
     * the exact overnight waste this product exists to price, produced by the
     * thing meant to prevent it. Two refusals per delivery state; the third says
     * out loud that it is no longer blocking, and the gap stands on the record.
     * The counter is the trajectory itself, so it needs no state to go stale.
     */
    if (proposed.isSubmit && proposed.risk === "deploy") {
      const lastEdit = steps.findLastIndex((s) => s.isEdit);
      const retries = steps.filter((s, i) => i > lastEdit && s.isSubmit).length;
      if (retries < 2) {
        return { verdict: "deny", proposed, risk: proposed.risk,
          reason: `出厂验收未通过：${kinds} —— 这一步会把它交出去，先补上`,
          corrective: delivery.order, delivery };
      }
      return { verdict: "warn", proposed, risk: proposed.risk,
        reason: `出厂验收未通过：${kinds}（已经拦过 ${retries} 次，这一次不再拦）`,
        corrective: `${delivery.order}\n\n（我已经在同一份交付上拦了 ${retries} 次，`
          + `再拦下去只是空转。这一次放行，但上面的差距没有消失，它记在这份交付上。）`,
        delivery };
    }
    return { verdict: "warn", proposed, risk: proposed.risk,
      reason: `出厂验收未通过：${kinds}`,
      corrective: delivery.order, delivery };
  }
  /*
   * A HELD DELIVERY. Local checks passed and the external inspector has not
   * answered yet. Every other bench in this product informs the NEXT edit, which
   * has not happened — so arriving a call late is free. This one decides whether
   * the night ends, and a verdict that arrives after the agent has stopped is a
   * verdict nobody reads.
   *
   * So the run is held for one more call rather than allowed through. Held, not
   * stopped: the worker is told what is happening, that it is bounded, and what
   * to do with the interval.
   */
  if (delivery && delivery.hold) {
    /*
     * AND THE HOLD HAS TO BITE ON THE IRREVERSIBLE ONE.
     *
     * Caught by running the shipped binary end to end rather than the module: a
     * held delivery came back as `warn`, which on this host is allow + context —
     * so the push RAN, and the inspector's verdict arrived after the thing it was
     * inspecting had already left the building. An inspection that concludes
     * after shipping is a report, not an inspection.
     *
     * So a submit is refused for the couple of calls the walk takes, and nothing
     * else is: at a 声明完成 moment the proposed call is some unrelated tool, and
     * blocking it would punish the wrong action. `deny` here does NOT wake the
     * operator — the reason goes to the model, which retries, and that retry is
     * the next call that collects the verdict. Bounded by the same two tries.
     */
    if (proposed.isSubmit && proposed.risk === "deploy") {
      return { verdict: "deny", proposed, risk: proposed.risk,
        reason: "出厂验收还没做完：外部检验员正在看这份交付，几十秒。别收工，等一下重试这一步",
        corrective: delivery.hold, delivery };
    }
    return { verdict: "warn", proposed, risk: proposed.risk,
      reason: "出厂验收：外部检验还没回来，先别收工",
      corrective: delivery.hold, delivery };
  }

  /*
   * ── 1·95 巡检：监工在车间里走 ──────────────────────────────────────────
   *
   * Placed AFTER the delivery inspection and BEFORE the waste layer on purpose:
   * at a delivery moment the delivery gaps are the sharper statement, and
   * everywhere else this is the only layer that looks at the strategic window.
   *
   * The operator's charge against the previous build: 72% of everything it said
   * happened at the shipping dock, and a shipping-dock auditor is replaceable by
   * him typing 自审一遍 in the morning, for free. This is the answer — the same
   * kind of evidence, said while there is still a night left to spend.
   *
   * Never denies. Nothing here is dangerous; it is a distance, and distance is
   * the operator's call. It rides the guidance channel where a model can act on
   * it without waking anybody.
   */
  if (patrol) {
    try {
      const pa = assessPatrol(steps, { proposed });
      if (pa.detected) {
        return { verdict: "warn", proposed, risk: proposed.risk,
          reason: `巡检：${pa.kind} —— ${pa.observed}`,
          corrective: pa.corrective, patrol: pa };
      }
    } catch { /* 巡检 never breaks the gate */ }
  }

  /*
   * ── 2·0 在工具边界暂停，交给独立监工 ────────────────────────────────────
   *
   * This is the whole point of the round, and it is deliberately NOT a detector.
   * Everything above already decided that something is wrong; this decides who
   * gets to say what to do about it — and the answer is a session that has never
   * seen this run and cannot read the worker's account of itself.
   *
   * The pause is this function not returning yet. The host is blocked on our
   * answer, no tool has executed, nothing is half-written. That is the safe
   * boundary, and holding it costs a run that nobody is watching nothing at all.
   *
   * Only in `controlled` mode, only with a sealed contract, and never on a call
   * that is already being refused for danger — a destructive command does not
   * become a question for a supervisor.
   */
  if (controlled && cwd && !proposed.isEdit) {
    const trigger = pendingTrigger(steps, proposed, { delivery, mismatches });
    if (trigger) {
      const { contract, reason } = readContract(cwd, { readFile: readFileFn });
      if (!contract) {
        /* 合同没了或者被改过 —— 这一轮没有标准，明说，不假装 */
        emit(cwd, { type: "supervisor_skipped", why: reason });
      } else {
        emit(cwd, { type: "paused_at_tool_boundary", trigger,
          action: String(proposed.action ?? "").slice(0, 160) });
        const packet = supervisorPacket({ contract, steps,
          lastTest: [...steps].reverse().find((x) => x.isTest && x.exit != null) ?? null });
        emit(cwd, { type: "evidence_sent", bytes: JSON.stringify(packet).length,
          containsWorkerNarration: false, fields: Object.keys(packet) });
        const r = askSupervisor({ cmd: controlled.supervisorCmd, packet });
        if (!r.ok) {
          emit(cwd, { type: "supervisor_failed", error: r.error });
        } else if (r.verdict.insufficient) {
          emit(cwd, { type: "supervisor_insufficient", missing: String(r.verdict.insufficient).slice(0, 200) });
        } else if (r.verdict.onTrack) {
          emit(cwd, { type: "supervisor_verdict", onTrack: true });
        } else {
          const correction = correctionFrom(r.verdict, contract);
          emit(cwd, { type: "supervisor_verdict", onTrack: false,
            drift: String(r.verdict.drift ?? "").slice(0, 300),
            planSteps: (r.verdict.plan ?? []).length });
          emit(cwd, { type: "correction_delivered", channel: "PreToolUse.deny",
            bytes: correction.length, trigger });
          return { verdict: "deny", proposed, risk: proposed.risk,
            reason: `独立监工：这条轨迹偏离了冻结的原话（${trigger}）`,
            corrective: correction, supervised: { trigger, drift: r.verdict.drift } };
        }
      }
    }
  }

  const waste = assessHookWaste({ steps, mismatches, proposed });
  if (waste.worst) {
    const extra = waste.findings.length > 1 ? ` (+${waste.findings.length - 1} more this run)` : "";
    return { verdict: "warn", proposed, risk: proposed.risk,
      reason: `${waste.worst.kind}: ${waste.worst.detail}${extra}`,
      corrective: waste.worst.corrective,
      waste: { findings: waste.findings, checked: waste.checked, notChecked: waste.notChecked } };
  }

  /* 3) PRE-EMPTIVE WARN — about to finish/commit while the acceptance test is not
        currently green (fail-closed: an unknown test result does not count) */
  if (proposed.isSubmit) {
    const lastTestIdx = steps.findLastIndex((s) => s.isTest && s.exit != null);
    const lastEditIdx = steps.findLastIndex((s) => s.isEdit);
    const currentGreen = lastTestIdx >= 0 && steps[lastTestIdx].exit === 0 && lastTestIdx > lastEditIdx;
    if (!currentGreen) {
      /* GROUNDED corrective (layer B): if the run carries a parseable failure,
         send back THIS run's real error + localization (T2/T3), not the canned
         nudge. interveneSync is local, no-LLM, and self-verified; it falls back to
         the template only when there is nothing real to ground on. */
      const iv = interveneSync({ steps }, {
        corrective: "run the test suite and make it pass on the current code before "
          + "committing/finishing; do not report success on a red or unknown test" });
      return { verdict: "warn", proposed, risk: proposed.risk,
        reason: "about to finish/commit but the tests are not currently green "
          + "(no pass after the last edit, or the last test failed / was unreadable)",
        corrective: iv.message,
        intervention: { tier: iv.tier, reasoner: iv.reasoner, grounded: !iv.fallback } };
    }
  }

  /*
   * ── 最后一件事：把动作改对，而不是评论它 ────────────────────────────────
   * Placed at the very end, on the ALLOW path, because a rewrite is not a
   * judgement about the run — it is a repair of one command, and it must not
   * compete with anything that had something to say. It rides on calls nobody
   * questioned, which is exactly where a verification command lives.
   */
  if (rewrite) {
    try {
      /*
       * ── 上下文分叉的那一瞬间 ────────────────────────────────────────────
       * 27% of a real night ran inside subagents — contexts that had never seen
       * the operator's words, working from the parent's paraphrase of a memory
       * the parent had already compacted. Refusing the delegation gets nothing
       * done and text into the parent never travels. The prompt itself is the
       * only surface that reaches where the damage occurs.
       */
      const mi = injectMandate({ toolName, toolInput,
        operatorTurns: usageByOrigin?.[origin]?.operator ?? [],
        gaps: (delivery && !delivery.passed
          ? delivery.result.gaps.map((g) => `${g.says} —— 证据显示：${g.shows}`) : []) });
      if (mi) return { verdict: "allow", proposed, risk: proposed.risk, rewrite: mi };

      const rw = proposeRewrite({ toolName, toolInput, proposed });
      if (rw) return { verdict: "allow", proposed, risk: proposed.risk, rewrite: rw };
    } catch { /* a rewrite that throws must never change a verdict */ }
  }

  return { verdict: "allow", proposed, risk: proposed.risk };
}

/*
 * WHAT EACH HOST CAN ACTUALLY DELIVER — measured, not assumed.
 *
 * From a hook-by-hook probe of codex-cli 0.145.0 (see V69):
 *
 *   {}                                        → runs, no effect
 *   hookSpecificOutput + deny                 → BLOCKED. reason → CLI stderr
 *   hookSpecificOutput + allow + context      → runs, and the model NEVER SEES
 *                                               the context. Not in the session
 *                                               JSONL either.
 *   hookSpecificOutput + ask                  → runs. No approval prompt.
 *   hookSpecificOutput + defer                → not in the schema enum; ignored
 *   bare permissionDecision (no envelope)     → runs
 *   timeout / non-zero exit / truncated JSON  → runs (fail-open)
 *
 * So on Codex the ONLY thing that reaches anybody is a hard deny, and the only
 * eye it reaches is the operator's terminal.
 *
 * That is not a small compatibility note, it decides what this product may do on
 * that host. Every refusal Outsider issues is legitimate only because the agent
 * is told, in the same breath, exactly how to clear it. If the way out cannot be
 * delivered, the refusal is a wall — and a wall is what ended the last install.
 *
 * Therefore on a host without a context channel: keep refusing what is provably
 * destructive (that way out is "a human confirms", which belongs to the operator
 * and reaches them on stderr), and DO NOT issue the guidance-dependent refusals —
 * the loop stop, the charter deny. They would be walls by construction.
 *
 * The degradation is disclosed on stderr rather than pretended away. A supervisor
 * that cannot be seen failing is worse than no supervisor.
 */
export const AGENT_CAPABILITIES = Object.freeze({
  "claude-code": { context: true, ask: true, defer: true },
  codex: { context: false, ask: false, defer: false },
  /* NOT verified against a real CodeBuddy build — it presents a Claude-Code-style
     surface and is assumed to behave like one until somebody measures it. */
  codebuddy: { context: true, ask: true, defer: true, unverified: true },
  trae: { context: false, ask: false, defer: false },
});

export const capsFor = (agent) => AGENT_CAPABILITIES[agent] ?? AGENT_CAPABILITIES["claude-code"];

/* ---- translate the verdict to each tool's native hook output ---- */

/*
 * mode: "live" (speak always) | "shadow" (never speak) | "experiment" (speak on
 * half the qualifying moments, split by a hash of the moment so it is
 * reproducible and cannot drift with the agent's phase).
 */
export function complianceMode(env = process.env) {
  if (env.OUTSIDER_SHADOW === "1") return "shadow";
  if (env.OUTSIDER_EXPERIMENT === "1") return "experiment";
  return "live";
}

function applyComplianceMode(d, opts, ctx) {
  const mode = opts.complianceMode ?? complianceMode();
  const probe = complianceProbe(d);
  /* an irreversible refusal is outside the experiment, always */
  const exempt = d.verdict === "deny" && d.proposed?.irreversible;
  let spoke = true;
  if (!exempt && d.verdict !== "allow") {
    if (mode === "shadow") spoke = false;
    else if (mode === "experiment") spoke = armOf(d.proposed?.sig ?? d.reason ?? "") === 0;
  }
  const out = { ...d, _complianceMode: mode, _spoke: spoke };
  /*
   * THE LEDGER RECORDS EVERY TIME THE FOREMAN SPOKE, INCLUDING THE MOMENTS THAT
   * CANNOT BE SCORED. `kind: null` means "no mechanically checkable expectation"
   * — the scorer skips those rows, but they stay in the record, because a ledger
   * that silently omits what it cannot grade is a ledger with a flattering hole
   * in it. The count of ungradable interventions is itself a finding.
   */
  if (d.verdict !== "allow") {
    out._shadow = shadowRecord({ decision: d, probe,
      arm: exempt ? "exempt" : mode, spoke, origin: ctx?.fleet?.origin ?? "main" });
  }
  /* silenced: the operator still gets the line on stderr, the agent gets nothing.
     A supervisor running an experiment must never be invisible to its owner. */
  if (!spoke) {
    return { ...out, verdict: "allow",
      _outsiderSilenced: `【影子/实验臂】本来会说：${String(d.reason ?? "").slice(0, 120)}` };
  }
  return out;
}

/* the operator's own instructions, quoted back verbatim after a context wipe */
function restoreNote(decision) {
  const cl = decision?.contextLoss;
  if (!cl?.restore?.length) return null;
  return `\n\n📋 outsider: ${cl.observed}。以下是操作方的原话，逐字交还（不是我的转述）：\n`
    + cl.restore.map((q, i) => `  ${i + 1}. ${q}`).join("\n");
}

export function toClaudeCodeHookOutput(decision) {
  /*
   * ── 升级的那两个问题必须进入最终 payload ───────────────────────────────
   * `settledNote` was only spliced into the plain-allow branch, so exactly when
   * a correction escalated INTO a deny, the agent saw "上一条没兑现" and never
   * saw 为什么没做 / 是不是我错了 / 怎么撤回. The demand for re-diagnosis lived
   * in the observer and never reached the execution channel.
   */
  const withEscalation = (text) => {
    const note = decision.escalate?.note ?? (decision.settled?.verdict === "unmet" ? decision.settledNote : null);
    return note ? `${text ?? ""}\n\n${note}`.trim() : (text ?? undefined);
  };
  if (decision.verdict === "deny") {
    return { hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny",
      permissionDecisionReason: `outsider: ${decision.reason}`,
      additionalContext: withEscalation(decision.corrective) } };
  }
  if (decision.verdict === "ask") {
    return { hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "ask",
      permissionDecisionReason: `outsider: ${decision.reason}`,
      additionalContext: decision.corrective ?? undefined } };
  }
  if (decision.verdict === "warn") {
    return { hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "allow",
      additionalContext: withEscalation(`⚠︎ outsider: ${decision.corrective}${restoreNote(decision) ?? ""}`) } };
  }
  /*
   * ALLOW + the restored work order. This is the only place the guidance channel
   * is used on a call nobody questioned, and it earns that because the payload is
   * not a judgement — it is the operator's own words, handed back at the one
   * moment the host has told us the agent can no longer see them. Measured on a
   * real session: 2.97% of decision points.
   */
  const restore = restoreNote(decision);
  /*
   * AN ALLOW CAN STILL CARRY A SENTENCE, and it has to, or a whole class of
   * guidance evaporates. The loop's "this edit lands on the failing path — take
   * it" is deliberately an ALLOW; the ratchet's "and it is getting heavier every
   * pass" belongs on exactly that call. Returning a bare `defer` there would
   * have thrown the foreman's only words away while the gate looked correct.
   *
   * Bounded by construction: a corrective on an allow exists only inside a
   * detected repair chain, which is a once-per-session event.
   */
  /*
   * THE REWRITE RIDES OUT ON THE ALLOW. `updatedInput` is merged over the
   * original tool_input by the host; paired with an explicit `allow` so the
   * edited command is not sent back through a permission prompt the operator
   * would have to answer at 3am.
   */
  if (decision.rewrite) {
    return { hookSpecificOutput: { hookEventName: "PreToolUse",
      permissionDecision: "allow",
      permissionDecisionReason: `outsider: ${decision.rewrite.kind}`,
      updatedInput: decision.rewrite.updatedInput,
      additionalContext: decision.rewrite.note } };
  }
  const carried = decision.verdict === "allow" && decision.corrective
    ? `outsider: ${decision.corrective}` : "";
  /* the bench's finding — including "the bench did not run", which the first
     real packaging test proved could otherwise be invisible forever */
  const bench = decision.archNote ? `\n\n🔧 outsider: ${decision.archNote}` : "";
  const judge = decision.deliveryNote ? `\n\n🔧 outsider: ${decision.deliveryNote}` : "";
  /*
   * A CORRECTION THAT DID NOT LAND IS SAID OUT LOUD; ONE THAT LANDED IS NOT.
   *
   * "上一条生效了" changes nothing about what the agent does next, so by this
   * file's own rule it does not get to spend a sentence — it goes to the ledger,
   * which is where it is worth something. "N 步之前我说过 X，到现在没有发生" is
   * different: it re-states an ask that evidently did not land, and it names the
   * possibility that the fault is ours rather than the agent's.
   */
  const unmet = decision.settled?.verdict === "unmet" && decision.settledNote
    ? `\n\n🔧 outsider: ${decision.settledNote}` : "";
  const extra = `${carried}${bench}${judge}${unmet}${restore ?? ""}`.trim();
  if (extra) {
    return { hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "allow",
      additionalContext: extra } };
  }
  /*
   * ── DEFER 在无人值守的运行里是致命的 ────────────────────────────────────
   *
   * `defer` was chosen deliberately: say nothing, let the host's own permission
   * system decide. That is right in an interactive session. In a headless run it
   * is fatal, because the host's permission system has NOBODY TO ASK — the
   * worker stops with `stop_reason: "tool_deferred"` on the very first tool
   * call, and the night ends before any work happens.
   *
   * Found by running the vertical slice: the worker exited 0, produced nothing,
   * and every event after 合同冻结 was missing. Not a subtle bug — the product's
   * default answer halted the exact scenario it exists for.
   *
   * Same disease as "must be confirmed by a human" two rounds ago: a polite
   * non-answer that stops the line. When the controller owns the worker, or the
   * host tells us it is headless, silence has to be spelled `allow`.
   */
  const unattended = decision._unattended ?? process.env.OUTSIDER_RUN === "1";
  return { hookSpecificOutput: { hookEventName: "PreToolUse",
    permissionDecision: unattended ? "allow" : "defer" } };
}

/*
 * CODEX — and a correction to two things this file previously asserted.
 *
 * WRONG #1 (fatal, silent): the output was emitted BARE —
 *     { permissionDecision: "deny", permissionDecisionReason: "…" }
 * Codex reads the SAME envelope Claude Code does:
 *     { hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision, … } }
 * A bare object parses fine and decides nothing. So the one thing the product
 * exists to do — stop `rm -rf` before it runs — did not happen on Codex, while
 * the CLI printed a confident-looking deny to anyone who tested it by hand. A
 * supervisor that cannot be seen failing is worse than no supervisor.
 *
 * WRONG #2 (mine, one round old): "Codex has no context-injection channel, so a
 * warn must either evaporate or be escalated to a hard deny." False. Codex's
 * PreToolUse supports `additionalContext` — "added as extra developer context" —
 * exactly like Claude Code. I built `--strict` on a premise I had not checked,
 * and its default-on setting turned every advisory into a wall. The grounded
 * correction now rides the channel that was there the whole time.
 *
 * What Codex genuinely does NOT support: `permissionDecision: "ask"` is "parsed
 * but not supported yet". So an `ask` (an action Outsider cannot prove safe)
 * cannot become a real human escalation here. It degrades to allow + a context
 * note telling the model to ask its user — and the degradation is DISCLOSED
 * rather than presented as an escalation that happened.
 *
 * `--strict` survives with an honest, narrower meaning: turn advisories into
 * hard blocks. That is a real operator preference. It is no longer the default,
 * because the reason it was the default was not true.
 */
const PRE = (o) => ({ hookSpecificOutput: { hookEventName: "PreToolUse", ...o } });

export function toCodexHookOutput(decision, { strict = false } = {}) {
  const ctx = decision.corrective ?? undefined;
  if (decision.verdict === "deny") {
    return PRE({ permissionDecision: "deny",
      permissionDecisionReason: `outsider: ${decision.reason}. ${decision.corrective ?? ""}`.trim() });
  }
  if (decision.verdict === "ask") {
    if (strict) {
      return { ...PRE({ permissionDecision: "deny",
        permissionDecisionReason: `outsider: ${decision.reason}. ${decision.corrective ?? ""}`.trim() }),
        _outsiderEscalated: "ask→deny (strict): Codex parses but does not honour permissionDecision:\"ask\"" };
    }
    return { ...PRE({ permissionDecision: "allow",
      additionalContext: `⚠︎ outsider: ${decision.reason}. ${ctx ?? ""} Ask your user to confirm before proceeding.`.trim() }),
      _outsiderDegraded: `ask→allow+context: Codex does not honour "ask"; the escalation reached the model as context, not as a prompt to the human` };
  }
  if (decision.verdict === "warn") {
    if (strict) {
      return { ...PRE({ permissionDecision: "deny",
        permissionDecisionReason: `outsider: ${decision.corrective ?? decision.reason}`.trim() }),
        _outsiderEscalated: "warn→deny (strict): operator chose hard blocks over advisories" };
    }
    /*
     * MEASURED, AND IT CHANGES THE MEANING OF THIS BRANCH: on codex-cli 0.145.0,
     * `allow` + `additionalContext` runs the command and the model never sees the
     * context — it is not injected, and it does not appear in the session JSONL.
     * The advisory is emitted anyway (a future build may honour it) but the
     * operator is told, every time, that it did not land. Previously this branch
     * silently produced nothing and read like a delivered warning.
     */
    return { ...PRE({ permissionDecision: "allow",
      additionalContext: `⚠︎ outsider: ${decision.corrective ?? decision.reason}` }),
      _outsiderUndeliverable: "additionalContext 在本机 Codex 上不进模型（实测）—— 这条提醒只有你看得到" };
  }
  /* NOT `defer`: it is absent from Codex's permissionDecision enum, and an
     unrecognised value makes the whole item be ignored. Empty is the honest
     no-opinion on this host. */
  return {};
}

/* CodeBuddy presents a Claude-Code-style hook surface; default to that shape. */
export function toCodeBuddyHookOutput(decision) {
  return toClaudeCodeHookOutput(decision);
}

const OUTPUT_BY_AGENT = {
  "claude-code": toClaudeCodeHookOutput,
  codex: toCodexHookOutput,
  codebuddy: toCodeBuddyHookOutput,
};

/* the operator's strict switch, honoured wherever the hook output is built */
export function hookOutputFor(agent, decision, opts = {}) {
  const fn = OUTPUT_BY_AGENT[agent] ?? toClaudeCodeHookOutput;
  return fn(decision, opts);
}

/*
 * handleHookInvocation — the entry `outsider hook <agent>` calls: take the hook's
 * stdin JSON, decide (reading the transcript with the agent's structured parser),
 * and return { decision, output } where output is the native JSON to print.
 */
/*
 * ── 收工那一刻 —— THE ONE HOOK THAT IS NOT A REMINDER ─────────────────────
 *
 * The operator: "所以其实 outsider 还是只起到一个提醒的作用，没有办法真的把手
 * 伸进 agent 的工作里。"
 *
 * True of what was built, and false of what the host offers. Everything so far
 * lived on PreToolUse, whose entire vocabulary is (a) refuse this call and
 * (b) add text. But PreToolUse has a hole that is fatal to this product's actual
 * promise: IT ONLY FIRES IF THE AGENT MAKES ANOTHER TOOL CALL. An agent that
 * decides it is finished and simply stops was never seen by Outsider at all —
 * the delivery inspection, the whole 出厂验收 layer, could be skipped by doing
 * nothing.
 *
 * The Stop hook closes it, and it is a different kind of power:
 *
 *     { "decision": "block", "reason": "…" }
 *
 * `block` REFUSES TO LET THE RUN END and sends the model back to work with the
 * reason. That is not a banner and not a nudge — it is the literal mechanism for
 * the sentence this product has been claiming since the beginning: 这一夜不是在
 * agent 觉得做完时结束，是在验收通过时结束.
 *
 * BOUNDED BY THE HOST AND BY US. Claude Code caps consecutive blocks at 8; we
 * stop far short of that, because a supervisor that can pin a run open forever
 * is a worse failure than one that misses a defect. `stop_hook_active` says a
 * block is already in flight — when it is set we approve, so a parent and a
 * subagent can never hold each other open.
 *
 * WHAT IT STILL CANNOT DO, stated plainly rather than papered over: no hook can
 * roll back work already done, inject a subagent, or edit the agent's plan.
 * The full vocabulary is refuse-a-call, rewrite-a-call's input, replace a tool
 * result, refuse-to-finish, and add text. Outsider now uses the strongest of
 * those at the one moment that decides whether the night was worth anything.
 */
export const STOPGATE_CARD = "stopgate";
const STOPGATE_MAX_BLOCKS = 3;

/*
 * 收工检查表 —— 把每一条建议变成条件。
 *
 * THE ASYMMETRY THAT WAS SITTING THERE UNUSED
 * ===========================================
 * Measured on a real 916-step session: of everything Outsider said, 8% rode on
 * a refusal and 93% rode on an allow. A sentence that can be freely ignored is a
 * skill, whatever its content — that is the whole of the operator's charge, and
 * the content was never the problem.
 *
 * But refusing DURING the work is expensive: it interrupts a person's night to
 * correct something that is wrong rather than dangerous, and that budget is
 * rightly tiny (0.23%). Refusing AT THE STOP costs one turn — the agent was
 * ending anyway. Same sentence, hundredfold cheaper enforcement.
 *
 * So the architecture is two channels with different prices:
 *   干活途中  → 建议。可以被忽略，而且那是对的：打断的代价太高。
 *   收工那一刻 → 条件。不满足就不放走。代价只有一个回合。
 *
 * Everything the run left unresolved is re-asked here, as a checklist, at the
 * one moment where asking is nearly free. 这一夜不是在 agent 觉得做完时结束，
 * 是在检查表过了才结束。
 *
 * AND IT LETS GO. The host caps consecutive blocks at 8; this stops at 3 on the
 * SAME set of findings, because an agent that cannot close a gap would otherwise
 * spend the rest of the night discovering that. The third refusal says out loud
 * that it is the last one and the gap stands on the record.
 */
export function stopGateFindings({ steps = [], operatorTurns = [], usage = null,
  boundaries = [] } = {}) {
  const out = [];
  /* 1. 操作方说了两遍 —— 唯一一条不是我定的标准，排在最前 */
  try {
    const re = assessRealignment(operatorTurns);
    if (re.detected) {
      out.push({ kind: "realignment", weight: 0,
        line: re.observed,
        detail: `${re.corrective}\n\n  ①「${re.restore[0]}」\n\n  ②「${re.restore[1]}」` });
    }
  } catch { /* never pin a run open on a throw */ }

  /* 2. 出厂验收 —— 交付物本身 */
  try {
    const d = assessDelivery({ proposed: { isSubmit: true }, steps,
      operatorTurns, usage, boundaries });
    if (d && !d.passed) {
      for (const g of d.result.gaps) {
        out.push({ kind: g.kind, weight: 1,
          line: `${g.says} —— 但证据显示：${g.shows}`, detail: `下一步：${g.rework}` });
      }
    }
  } catch { /* … */ }

  /* 3. 巡检 —— 一段没有任何验证的工作，收工时仍然没有验证 */
  try {
    const pa = assessPatrol(steps, { proposed: null });
    if (pa.detected) {
      out.push({ kind: pa.kind, weight: 2, line: pa.observed,
        detail: "下一步：给这些改动跑一次测试。收工前至少要有一次绿灯落在它们之后。" });
    }
  } catch { /* … */ }

  /* 4. 打地鼠 —— 同一个失败反复打，到收工都没解决 */
  try {
    const a = assessWhackAMole({ steps });
    if (a?.detected) {
      out.push({ kind: "whack-a-mole", weight: 3,
        line: `同一个失败被打了 ${a.attempts} 次，根因始终没被碰到`,
        detail: "下一步：用一句话说清根因；说不清就把它写进产出，标成未解决，别当作已完成。" });
    }
  } catch { /* … */ }

  return out.sort((x, y) => x.weight - y.weight);
}

export function handleStopHook({ input = {}, agent = "claude-code",
  readFileFn = (p) => readFileSync(p, "utf8"), writeFileFn = null } = {}) {
  const approve = { decision: "approve" };
  /* the host is already holding this run open on somebody's behalf — never stack */
  if (input.stop_hook_active || input.stopHookActive) return approve;

  const transcriptPath = input.transcript_path ?? input.transcriptPath ?? null;
  const cwd = input.cwd ?? input.workingDirectory ?? input.working_directory ?? null;
  if (!transcriptPath) return approve;

  try {
    const usageByOrigin = {};
    const raw = trajectoryFromSession(transcriptPath, agent, { window: 240, usageByOrigin });
    const origin = originOf(transcriptPath);
    const steps = ownChain(scopeTrajectory(raw, { cwd, window: 480 }), origin);
    if (!steps.length) return approve;
    const acc = usageByOrigin?.[origin] ?? {};

    /*
     * ── 收工那一刻，controller 自己跑一遍冻结的验收命令 ────────────────────
     *
     * 这是无头运行里最可靠的一个时刻，也是唯一一个「worker 认为自己做完了」的
     * 时刻。它说什么在这里没有任何权重：命令是合同里冻结的那一条，由我们跑，
     * 退出码是我们看到的。这就是「不给自己判卷」的具体含义。
     *
     * 红了就叫独立监工 —— 一个没参与过这项工作、看不到 worker 任何自述的全新
     * 会话 —— 由它诊断并给出纠正计划，然后 block 把 worker 送回去继续做。
     */
    const runState = readRunState(cwd, { readFile: readFileFn });
    if (runState?.mode === "controlled" && runState.supervisorCmd) {
      const { contract } = readContract(cwd, { readFile: readFileFn });
      if (contract?.acceptance) {
        let exit = 0, out = "";
        try { out = execSync(contract.acceptance, { cwd, encoding: "utf8", timeout: 600000,
          stdio: ["ignore", "pipe", "pipe"], env: unsupervisedCommandEnvironment(process.env) }); }
        catch (e) { exit = e?.status ?? 1; out = String(e?.stdout ?? e?.message ?? ""); }
        emit(cwd, { type: "independent_acceptance_at_stop", command: contract.acceptance, exit });
        if (exit !== 0) {
          emit(cwd, { type: "paused_at_stop", why: "冻结的验收命令是红的" });
          const packet = supervisorPacket({ contract, steps,
            lastTest: { exit, observation: out.slice(-2000) } });
          emit(cwd, { type: "evidence_sent", bytes: JSON.stringify(packet).length,
            containsWorkerNarration: false, fields: Object.keys(packet) });
          const r = askSupervisor({ cmd: runState.supervisorCmd, packet });
          if (!r.ok) emit(cwd, { type: "supervisor_failed", error: r.error });
          else {
            emit(cwd, { type: "supervisor_verdict", onTrack: Boolean(r.verdict.onTrack),
              drift: String(r.verdict.drift ?? "").slice(0, 300),
              planSteps: (r.verdict.plan ?? []).length });
            const correction = correctionFrom(r.verdict, contract)
              ?? `【独立验收】冻结的验收命令 \`${contract.acceptance}\` 退出码 ${exit}。\n`
                 + `运行器原话：\n${out.slice(-1200)}\n\n继续做，不要停。`;
            emit(cwd, { type: "correction_delivered", channel: "Stop.block", bytes: correction.length });
            return { decision: "block", reason: correction,
              systemMessage: `outsider: 独立验收未通过（${contract.acceptance} exit ${exit}）—— 已打回` };
          }
        }
      }
    }

    const findings = stopGateFindings({ steps, operatorTurns: acc.operator ?? [],
      usage: acc.usage ?? null, boundaries: acc.boundaries ?? [] });
    if (!findings.length) return approve;

    /*
     * THE SAME CHECKLIST, TWICE, IS A CONVERSATION. THREE TIMES IS A WALL.
     * Keyed on the findings themselves, so closing one gap and opening another
     * gets a fresh budget while spinning on an unchangeable one does not.
     */
    const key = `stop:${findings.map((f) => f.kind).join(",")}`;
    let blocks = 0;
    if (cwd) {
      const card = readProbe({ cwd, name: STOPGATE_CARD, key, readFile: readFileFn,
        now: Date.now(), maxAgeMs: 12 * 3600 * 1000, pendingTtlMs: Number.MAX_SAFE_INTEGER });
      blocks = Number(card?.blocks ?? 0) || 0;
    }
    const last = blocks + 1 >= STOPGATE_MAX_BLOCKS;
    if (blocks >= STOPGATE_MAX_BLOCKS) return approve;
    if (cwd) {
      try {
        const at = `${String(cwd).replace(/\/+$/, "")}/.outsider/${STOPGATE_CARD}.json`;
        const body = JSON.stringify({ key, at: Date.now(), blocks: blocks + 1 });
        if (writeFileFn) writeFileFn(at, body);
        else { mkdirSync(`${String(cwd).replace(/\/+$/, "")}/.outsider`, { recursive: true }); writeFileSync(at, body); }
      } catch { /* the counter is best effort; the host's own cap still bounds us */ }
    }

    const lines = ["【收工检查表】这一夜还不能算结束。以下每一条都是证据，不是意见：", ""];
    for (const f of findings) {
      lines.push(`· ${f.line}`);
      for (const d of String(f.detail).split("\n")) lines.push(`  ${d}`);
      lines.push("");
    }
    /*
     * HIS WORDS, VERBATIM, ALWAYS. The checklist format dropped them on the
     * first cut and the regression wall caught it. Every gap above is a
     * statement about a deliverable, and a deliverable has no meaning except
     * against what was asked — restated by me it is my summary, which is exactly
     * the contaminated artefact the whole product exists to route around.
     */
    const asked = (acc.operator ?? []).slice(-3)
      .map((t) => String(t.text ?? "").replace(/\s+/g, " ").trim())
      .filter((t) => t.length > 20);
    if (asked.length) {
      lines.push("操作方的原话（逐字，不是我的转述）：");
      for (const a of asked) lines.push(`  「${a.slice(0, 400)}」`);
      lines.push("");
    }
    lines.push(last
      ? "这是我在同一份清单上第 3 次拦你，也是最后一次 —— 再拦下去只是空转。"
        + "下一次你说收工我就放行，但上面的差距没有消失，它记在这份交付上。"
      : "把上面的每一条处理掉，再说收工。处理不了的，写进产出里标成未解决 —— "
        + "那也算处理。继续做，不要停。");

    return { decision: "block", reason: lines.join("\n"),
      systemMessage: `outsider: 收工检查表 ${findings.length} 条未过（${findings.map((f) => f.kind).join(", ")}）` };
  } catch { /* a supervisor that throws must never pin a run open */ }
  return approve;
}

export function handleHookInvocation({ agent = "claude-code", input = {}, contract = {}, executor, world, strict = false } = {}) {
  /* Stop / SubagentStop arrive on the same entry point and carry no tool */
  const ev = String(input.hook_event_name ?? input.hookEventName ?? "");
  if (ev === "Stop" || ev === "SubagentStop") {
    const out = handleStopHook({ input, agent });
    return { decision: { verdict: out.decision === "block" ? "warn" : "allow",
      reason: out.systemMessage ?? null, corrective: out.reason ?? null }, output: out };
  }
  const toolName = input.tool_name ?? input.toolName ?? "";
  const toolInput = input.tool_input ?? input.toolInput ?? {};
  const transcriptPath = input.transcript_path ?? input.transcriptPath ?? null;
  const cwd = input.cwd ?? input.workingDirectory ?? input.working_directory ?? null;
  const decision = decideToolCall({ toolName, toolInput, transcriptPath, contract, executor, world, agent, cwd });
  /*
   * APPEND-ONLY, ONE LINE, STRUCTURAL ONLY. The ledger is what a volunteer sends
   * back, so it holds file paths and signatures — never source text, never a
   * traceback body. Appending cannot corrupt what is already there, which
   * matters because this file is the only artefact of the experiment.
   */
  if (decision?._shadow && cwd) {
    try {
      const dir = `${String(cwd).replace(/\/+$/, "")}/.outsider`;
      mkdirSync(dir, { recursive: true });
      appendFileSync(`${String(cwd).replace(/\/+$/, "")}/${SHADOW_PATH}`,
        JSON.stringify({ ...decision._shadow, ts: Date.now() }) + "\n");
    } catch { /* the ledger is best effort; it never changes a verdict */ }
  }
  const fmt = OUTPUT_BY_AGENT[agent] ?? toClaudeCodeHookOutput;
  return { decision, output: fmt(decision, { strict }) };
}
