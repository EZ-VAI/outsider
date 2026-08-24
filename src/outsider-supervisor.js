/*
 * The streaming supervision session — engineering module 1 (streaming) wired to
 * module 2 (claim ledger), producing a running assessment and a decision.
 *
 * IT IS A WIDENING, NOT A NEW PRODUCT
 * ===================================
 * Nothing here re-implements measurement or intervention from scratch. It feeds
 * the GROWING PREFIX of the run to the existing world-aware measurement
 * (measureExecutionTrace), keeps the existing pathology flags, adds the claim
 * ledger's said-vs-did mismatches, and turns the union into a decision. The
 * growing prefix is re-scored at every step (a prefix / process-scoring shape).
 * (No separate research path runs here — the scoring is the rules + measurement
 * in this Stage 0.5 runtime.)
 *
 * THE ONE RULE FOR INTERRUPTING A HUMAN
 * =====================================
 * The supervisor acts autonomously whenever it has a CONFIDENT corrective, using
 * the operator's declared engineering understanding (the contract + rules). It
 * interrupts the human in exactly ONE case: when it detects that something is
 * wrong but is NOT confident how to correct it. A low-confidence autonomous
 * action is the dangerous one, so low confidence — not the mere existence of a
 * problem — is what escalates. Confidence gates WHO acts, never WHETHER to act.
 *
 * This module produces the DECISION and, when an actuator (engineering module 3)
 * is wired in, hands each decision to it to be carried out. It also exposes
 * authorize(), the PRE-EXECUTION gate that stops an irreversible step BEFORE it
 * runs — the post-hoc gate in decide() cannot, because by then the step already
 * happened. Without an actuator the behaviour is exactly as before: `decision`
 * is emitted and the caller carries it out. The differential test-validity check
 * (engineering module 4) is exposed as assessTest().
 */

import { sha256 } from "./canonical.js";
import { makeExecutionTrace, makeStep, WORLD_KINDS } from "./outsider-execution-trace.js";
import { verbOf } from "./outsider-feed-adapter.js";
import { measureExecutionTrace } from "./outsider-process.js";
import { makeClaimLedger } from "./outsider-claim-ledger.js";
import { analyzeTestStatically, assessTestValidity } from "./outsider-shallow-test.js";
import { captureExperience } from "./outsider-experience.js";

/* the operator's declared engineering understanding — the contract this run is
 * judged against, and the autonomy budget the supervisor is allowed to spend */
const DEFAULT_CONTRACT = {
  requireTestBeforeDone: true,      // "done" is not accepted until a real test passed
  maxCostUsd: null,                 // hard resource ceiling, if the operator sets one
  maxSteps: null,
  autonomousConfidenceThreshold: 0.8,   // ≥ this ⇒ act autonomously; below ⇒ escalate
  blockIrreversibleUntilContractMet: true,
};

export function createSupervisionSession({
  executor, world, claim = null, contract = {}, peers = {}, actuator = null,
  calibration = null,
  /*
   * SEAM 2 — the measured early-warning capability, live in the loop. When a
   * routerSignal (outsider-router-signal.js) is supplied, the session scores the
   * run's SHAPE every `routerEvery` steps, mid-flight, from nothing but the verb
   * sequence so far. Advisory only, authority none: the score reaches the ingest
   * result, the state snapshot, and the captured Experience — it never gates,
   * corrects, or escalates by itself, because a comparative score with no
   * calibrated meaning must inform the reader, not impersonate a decision.
   */
  routerSignal = null, routerEvery = 5,
} = {}) {
  if (!executor?.id) throw new Error("SUPERVISE_NO_EXECUTOR");
  const cfg = { ...DEFAULT_CONTRACT, ...contract };
  /* calibrated confidences (measured from outcomes) override the heuristic priors
     when a calibration map { signal: confidence } is supplied — this is the fix
     for "hand-assigned magic numbers decide human-vs-autonomous". */
  const applyCalibration = (mismatches) => {
    if (calibration) {
      for (const mm of mismatches) {
        if (calibration[mm.signal] != null) mm.confidence = calibration[mm.signal];
      }
    }
    return mismatches;
  };
  const ledger = makeClaimLedger();
  const steps = [];
  const runVerbs = [];
  const trajectoryChecks = [];
  let bestShape = null;
  const escalations = [];
  const autoCorrections = [];
  const gates = [];
  let stepIndex = 0;

  function currentTrace() {
    return makeExecutionTrace({
      executor, world: world ?? { kind: "sandbox" }, claim,
      steps, resources: sumResources(steps), outcome: null,
      extractorId: "supervisor/1.0",
    });
  }

  /*
   * decide — the confidence-gated policy. Union the structural said-vs-did
   * mismatches with the universal pathology flags, then:
   *   - a mismatch/flag whose corrective confidence ≥ threshold ⇒ AUTONOMOUS
   *   - a real concern below threshold ⇒ ESCALATE (the only human interruption)
   *   - an irreversible step reached before the contract is met ⇒ GATE
   *   - otherwise ⇒ CONTINUE
   */
  /*
   * gradeMismatches — the heart of the one-interruption rule, factored out so the
   * streaming decision (decide) and the test-validity assessment (assessTest)
   * grade the SAME way. A mismatch/flag at or above the confidence threshold is a
   * corrective we trust ⇒ autonomous auto-correct. Otherwise the softest real
   * concern is returned for the caller to escalate. Returns an auto-correct
   * decision, or { soft }, or null when there is nothing.
   */
  function gradeMismatches(mismatches) {
    const confident = mismatches.filter((mm) => mm.confidence >= cfg.autonomousConfidenceThreshold);
    if (confident.length) {
      const top = confident.slice().sort((a, b) => b.confidence - a.confidence)[0];
      return { action: "auto-correct", confidence: top.confidence,
        basedOn: top.signal, said: top.said, observed: top.observed,
        corrective: top.corrective,
        note: "a confident corrective — handled autonomously per the operator's "
          + "rules; the human is not interrupted" };
    }
    const soft = mismatches.find((mm) => mm.confidence < cfg.autonomousConfidenceThreshold);
    return soft ? { soft } : null;
  }

  function decide(trace, card, mismatches) {
    const budgetBreached = [];
    if (cfg.maxCostUsd != null && (trace.resources?.costUsd ?? 0) > cfg.maxCostUsd) {
      budgetBreached.push(`cost ${trace.resources.costUsd} over ceiling ${cfg.maxCostUsd}`);
    }
    if (cfg.maxSteps != null && trace.nSteps > cfg.maxSteps) {
      budgetBreached.push(`${trace.nSteps} steps over ceiling ${cfg.maxSteps}`);
    }

    /* irreversible reached without a passed test, if the contract demands it.
     * This is the POST-HOC detector: the step is already in the trace. The TRUE
     * gate runs before execution in authorize(); this remains as defence in depth
     * for a caller that executed an irreversible step without authorizing it. */
    const lastStep = steps[steps.length - 1];
    if (cfg.blockIrreversibleUntilContractMet && lastStep?.irreversible) {
      const testedOk = steps.some((s) => s.isTest && s.exit === 0);
      if (cfg.requireTestBeforeDone && !testedOk) {
        return { action: "gate", confidence: 0.99,
          reason: "an irreversible step was reached before any test passed",
          corrective: "先别做这一步不可逆的动作，等验收测试在当前代码上变绿。"
            + "（原文：block this irreversible action until the acceptance test "
            + "passes", target: lastStep };
      }
    }

    /* confident structural correctives ⇒ autonomous */
    const graded = gradeMismatches(mismatches);
    if (graded && graded.action === "auto-correct") return graded;

    /* a real concern we are NOT confident how to correct ⇒ escalate */
    const softMismatch = graded?.soft;
    if (budgetBreached.length || softMismatch) {
      return { action: "escalate", confidence: softMismatch?.confidence ?? 0.5,
        reason: budgetBreached.length ? budgetBreached.join("; ")
          : `a possible '${softMismatch.signal}' the supervisor cannot confidently correct`,
        note: "the one allowed interruption: something looks wrong but the right "
          + "correction is uncertain, so a human is asked rather than a low-"
          + "confidence autonomous action taken" };
    }

    return { action: "continue", confidence: 1 - (card.flags.length ? 0.1 : 0),
      note: "no confident-enough problem; the run proceeds unsupervised-in-effect" };
  }

  function snapshot() {
    const trace = currentTrace();
    return {
      schema: "outsider/supervision-state/v1",
      executor, world: world ?? { kind: "sandbox" }, claim,
      steps: stepIndex,
      claims: ledger.claims(),
      openMismatches: ledger.reconcileAgainst(trace),
      autoCorrections, escalations, gates,
      actuations: actuator ? actuator.effects() : [],
      unenforced: actuator ? actuator.unenforced() : [],
      resources: trace.resources,
      stateHash: sha256({ executor, steps: stepIndex, autoCorrections, escalations, gates }),
      contract: cfg,
      note: actuator
        ? "authority: none. Decisions are carried out by the wired actuator "
          + "(engineering module 3); any decided-but-not-enforced safety action "
          + "is listed under `unenforced`."
        : "authority: none. No actuator wired: decisions are emitted for the "
          + "caller to carry out. authorize() still gates irreversible steps.",
    };
  }

  return {
    /*
     * authorize — the PRE-EXECUTION gate (engineering module 3's hard edge). The
     * agent loop calls this BEFORE running a step that might be irreversible. This
     * is the only point at which an irreversible action can actually be stopped;
     * decide()'s gate is a post-hoc detector for a step that already ran. Returns
     * { allow }, and when it blocks, a gate `decision` (also actuated if an
     * actuator is wired). Reversibility is resolved from the World when the
     * proposed step does not state it — a non-reversible World defaults its steps
     * to irreversible (fail safe).
     */
    authorize(proposedStep = {}) {
      const w = world ?? { kind: "sandbox" };
      const worldProps = WORLD_KINDS[w.kind] ?? WORLD_KINDS.unknown;
      const worldReversible = w.reversible ?? worldProps.reversible;
      const isSandbox = w.kind === "sandbox" && worldReversible !== false;

      /* CONTRACT MET = the acceptance test is CURRENTLY green: the last test ran
         AFTER the last edit and passed. A single early pass followed by more edits
         is STALE and does NOT count — that was the "one test disarms the gate" bug. */
      const lastTestIdx = steps.findLastIndex((s) => s.isTest && s.exit != null);
      const lastEditIdx = steps.findLastIndex((s) => s.isEdit);
      const currentGreen = lastTestIdx >= 0 && steps[lastTestIdx].exit === 0 && lastTestIdx > lastEditIdx;
      const contractMet = !cfg.requireTestBeforeDone || currentGreen;

      /* risk tier: the classifier's tier if present; else the explicit irreversible
         flag; else the World (non-reversible ⇒ treat as deploy — the real fail-safe) */
      let risk = proposedStep.risk;
      if (risk == null) {
        if (proposedStep.irreversible === true) risk = "deploy";
        else if (proposedStep.irreversible === false) risk = isSandbox ? "safe" : "unknown";
        else risk = worldReversible === false ? "deploy" : "safe";
      }

      const gate = (reason, corrective) => {
        const decision = { action: "gate", confidence: 0.99, risk, reason, corrective,
          target: proposedStep.action ?? null };
        gates.push({ phase: "authorize", ...decision });
        const actuation = actuator ? actuator.actuate(decision, { phase: "authorize" }) : null;
        return { allow: false, block: true, risk, decision, actuation };
      };

      /*
       * ── 叫停之后必须有下一步 ────────────────────────────────────────────
       * This said "must be confirmed by a human", which is the one thing the
       * operator's spec forbids: 我不想每小时被叫醒两次点确认. At 3am there is
       * nobody to confirm, so that sentence ends the night — 叫停就走人, the
       * production line halts, and the task nobody is doing is the operator's.
       *
       * A refusal has to carry a way forward that does NOT require waking
       * anyone: the reversible form of the same intent. 叫停 + 指导 + 告诉他
       * 怎么做. Only if there is genuinely no reversible route does it become
       * the operator's call, and then it says so in one line and tells the
       * worker to keep going on everything else.
       */
      if (risk === "destructive") {
        return gate("提出了一个不可逆的破坏性动作",
          "这一步我不放行 —— 它删掉的东西没有回头路，而现在多半没人在旁边。\n"
          + "不要停在这里等人，换一个可逆的做法继续：\n"
          + "  · 要清空/重来 → 先 `mv` 到一个临时目录，跑通了再删；\n"
          + "  · 不确定会删到什么 → 先用 `ls` / `--dry-run` / `git status` 看清楚；\n"
          + "  · 只是要重新生成 → 直接重新生成覆盖，不必先删。\n"
          + "如果这一步真的非做不可、也真的没有可逆的替代，那它是操作方的决定："
          + "把原因写下来留在产出里，然后继续做别的，不要卡在这一步。");
      }
      if (risk === "deploy") {
        if (cfg.blockIrreversibleUntilContractMet && !contractMet) {
          return gate("测试当前不是绿的，却要做一次不可逆的发布/部署",
            "先别发。这一步对别人不可逆，而当前代码上的测试没有通过（或者最后一次绿灯在你最后一次改动之前）。\n"
            + "下一步：在改完之后重跑一次测试，绿了再发。别改测试来让它绿。");
        }
        return { allow: true, risk, note: "irreversible, but the acceptance test is currently green" };
      }
      if (risk === "unknown") {
        if (isSandbox) return { allow: true, risk, note: "unrecognized command, but this is a throwaway sandbox" };
        return gate("这条命令无法判定是否安全，而且不在沙箱里",
          "我读不出这条命令会做什么，所以不敢替你放行。\n"
          + "下一步：把它拆成能看清楚的几步，或者先在临时目录里跑一遍看结果；"
          + "确实是安全的例行动作就照常做，不用停下来等人。");
      }
      return { allow: true, risk };   // safe / build
    },

    /*
     * ingest one supervision event: the step the agent just took plus the
     * agent's own report/thought for it (where the claims live), and optionally
     * `testSource` (the text of a test the agent wrote/ran) for a cheap static
     * shallowness check inline. Returns the assessment + decision for the run SO
     * FAR, and — when an actuator is wired — the actuation record.
     */
    ingest(event = {}) {
      const step = makeStep({
        action: event.action ?? "", actionKind: event.actionKind ?? "shell",
        observation: event.observation ?? "", exit: event.exit ?? null,
        irreversible: event.irreversible ?? false,
        isTest: event.isTest, isEdit: event.isEdit, isSubmit: event.isSubmit,
      });
      steps.push(step);
      stepIndex += 1;
      runVerbs.push(verbOf(event.action));
      if (event.report) ledger.addReport(event.report);

      let trajectoryAdvisory = null;
      if (routerSignal && stepIndex % routerEvery === 0) {
        const score = routerSignal.scorePartial(runVerbs, stepIndex);
        bestShape = bestShape == null ? score : Math.max(bestShape, score);
        trajectoryAdvisory = {
          atStep: stepIndex, score: r4(score), bestSoFar: r4(bestShape),
          declineFromBest: r4(bestShape - score),
          percentileAmongResolved: routerSignal.referencePercentile
            ? routerSignal.referencePercentile(score, stepIndex) : null,
          basis: "comparative shape score (advisory, authority none — it informs, it does not decide)",
        };
        trajectoryChecks.push(trajectoryAdvisory);
      }

      const trace = currentTrace();
      const card = measureExecutionTrace(trace, peers);
      const mismatches = ledger.reconcileAgainst(trace);

      /* module 4, cheap path: if the agent handed us a test source, fold its
         STATIC shallowness flags into the same decision. The rigorous
         differential check (execution) is the async assessTest() below. */
      if (event.testSource) {
        for (const f of analyzeTestStatically(event.testSource).flags) {
          mismatches.push({ ...f, said: "the test is meaningful" });
        }
      }

      applyCalibration(mismatches);
      const decision = decide(trace, card, mismatches);

      if (decision.action === "auto-correct") autoCorrections.push({ stepIndex, ...decision });
      if (decision.action === "escalate") escalations.push({ stepIndex, ...decision });
      if (decision.action === "gate") gates.push({ stepIndex, ...decision });
      const actuation = actuator ? actuator.actuate(decision, { stepIndex }) : null;

      return {
        stepIndex,
        prefixFlags: card.flags.map((f) => f.signal),
        saidVsDid: mismatches,
        trajectoryAdvisory,
        decision,
        actuation,
      };
    },

    /*
     * assessTest — engineering module 4's rigorous path. Call it when a runnable
     * broken baseline is reachable (typically at submit time): it runs the static
     * + DIFFERENTIAL test-validity assessment (does the test still pass on
     * known-broken code?), grades the result through the SAME one-interruption
     * rule, records + actuates the decision, and returns both card and decision.
     */
    async assessTest({ testSource = "", differential = null } = {}) {
      const card = await assessTestValidity({ testSource, differential });
      const flags = applyCalibration(card.flags.map((f) => ({ ...f, said: "the test is meaningful and passing" })));
      const graded = gradeMismatches(flags);
      let decision;
      if (graded && graded.action === "auto-correct") {
        decision = graded;
      } else if (graded?.soft) {
        const soft = graded.soft;
        decision = { action: "escalate", confidence: soft.confidence,
          reason: `a possible '${soft.signal}' the supervisor cannot confidently correct`,
          note: "the one allowed interruption" };
      } else {
        decision = { action: "continue", confidence: 1,
          note: "no shallow-test pattern found (not proof the test is deep)" };
      }
      if (decision.action === "auto-correct") autoCorrections.push({ phase: "assessTest", ...decision });
      if (decision.action === "escalate") escalations.push({ phase: "assessTest", ...decision });
      const actuation = actuator ? actuator.actuate(decision, { phase: "assessTest" }) : null;
      return { card, decision, actuation };
    },

    /* the running summary — what a dashboard or the end-of-run report reads */
    state() { return snapshot(); },

    /*
     * experience — engineering module 5's capture point. Emit this run as one
     * labeled Experience record (Way × Claim × World × what-actually-happened),
     * to append to the durable log the behavior model is fit on. This is where a
     * supervised run stops being ephemeral and becomes training signal we own.
     */
    experience(opts = {}) {
      return captureExperience({ ...snapshot(), stepsDetail: steps, trajectoryChecks },
        { peers: opts.peers ?? peers });
    },
  };
}

function r4(x) { return x == null ? null : Math.round(x * 10000) / 10000; }

function sumResources(steps) {
  const cost = steps.reduce((a, s) => a + (s.resourceUnits ?? 0), 0);
  return { costUsd: cost || null, apiCalls: steps.length, tokens: null,
    wallSeconds: null, energyJoules: null };
}
