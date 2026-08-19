/*
 * THE DIFFERENTIATOR — what Outsider sees that the host's permission system
 * structurally cannot.
 *
 * WHAT WAS WRONG
 * ==============
 * The hook shipped exactly two behaviours: block destructive commands, and warn
 * before committing on a red test. Claude Code and Codex BOTH ship destructive-
 * command confirmation out of the box. So the flagship demo — "watch it stop
 * `rm -rf`" — was a demonstration of redundancy. Installing a supervisor to
 * duplicate a feature the host already gives you for free is precisely the
 * category of waste this project exists to price.
 *
 * The whole time, the machinery for the non-redundant part was already running
 * and its output was being DROPPED on the floor:
 *
 *     for (const s of steps) session.ingest(s);      // ← returns saidVsDid
 *                                                    //   nobody read it
 *
 * A permission system is per-call and stateless. It sees one command and asks
 * "is this dangerous?". It cannot see:
 *
 *   · the agent SAID the tests pass while the trace says they failed
 *   · the same file opened nine times
 *   · the same command re-issued five times with nothing changed between
 *   · a failing test re-run with no edit in between — pure spend, zero progress
 *   · a submit with no test ever executed in the whole run
 *
 * None of those are dangerous. All of them are expensive, and every one is only
 * visible to something holding the whole trajectory. That is the product.
 *
 * WHY THESE FIVE AND NOT MORE
 * ===========================
 * Everything here is computable from what a PreToolUse payload already carries:
 * the proposed call plus the reconstructed prior steps. Detectors needing input
 * we would have to invent are deliberately excluded, and named at the bottom of
 * this file rather than half-built — a detector wired to a guess is worse than
 * an absent one, because it produces confident output nobody can audit.
 */

import { assessTokenWaste } from "./outsider-token-waste.js";

/* said-vs-did carries its own confidence from the claim ledger (0.55–0.95) */
const SAID_VS_DID_FLOOR = 0.8;

/*
 * The cheapest honest summary of a finding: what it is, what it cost, and what
 * the agent should do instead. No scores in the agent-facing text — a number
 * without its derivation is noise in a model's context window.
 */
/*
 * `evidence` carries the detector's own particulars — the repeated action, the
 * re-read file, the count. They were being dropped here, so the compliance layer
 * downstream had no way to state what "doing it" would look like: 20 of a real
 * session's 22 interventions came out UNMEASURABLE for want of a field that
 * already existed one module up. A finding that cannot say what it wants is a
 * finding whose effect can never be measured.
 */
function finding(kind, detail, corrective, confidence, evidence = null) {
  return evidence ? { kind, detail, corrective, confidence, ...evidence }
    : { kind, detail, corrective, confidence };
}

/*
 * assessHookWaste — the differentiating pass.
 *
 * `mismatches` is what session.ingest() returned and the hook used to discard.
 * `steps` is the reconstructed trajectory. Nothing else is required, and nothing
 * else is consulted: no disk, no network, no model.
 */
export function assessHookWaste({ steps = [], mismatches = [], proposed = null } = {}) {
  const findings = [];

  /*
   * 1) SAID-VS-DID — the highest-confidence signal in the system (0.95 for
   *    "claims pass but the test failed") and the one no host will ever compute,
   *    because no host reads the agent's prose back against its own trace.
   */
  for (const m of mismatches) {
    if (!m || (m.confidence ?? 0) < SAID_VS_DID_FLOOR) continue;
    /* the no-cost-claims-at-hook-time rule applies to EVERY channel, not just
       the waste pass — otherwise the rule is a preference, not an invariant */
    if (/cost|peer|budget/i.test(m.signal ?? "")) continue;
    findings.push(finding(m.signal ?? "said-vs-did",
      m.detail ?? m.reason ?? "the agent's report does not match its trace",
      m.corrective ?? "re-state what actually happened, citing the step that shows it",
      m.confidence ?? 0.9));
  }

  /*
   * 2) TOKEN WASTE — loops and re-reads. Reshaped to the subject envelope
   *    assessTokenWaste expects. The cost-residual leg needs a peer baseline
   *    that no hook payload has, so it simply never emits here; that is the
   *    detector being honest, not being broken.
   */
  let waste = { signals: [], facts: {} };
  try { waste = assessTokenWaste({ trace: { steps } }); } catch { /* never let the differentiator break the gate */ }

  for (const s of waste.signals ?? []) {
    /*
     * Cost signals need a per-task peer baseline that no hook payload carries.
     * Skipped rather than estimated: a fabricated denominator would produce a
     * confident-looking "you are 3× over" that nobody could check.
     */
    if (/cost/.test(s.signal)) continue;
    if (!KEPT.has(s.signal)) continue;
    /*
     * Use the detector's OWN corrective, not a canned line. It names the actual
     * file and the actual count — "you re-read /src/app.js 5×" — and a generic
     * "avoid redundant reads" would strip exactly the grounding that makes a
     * model able to act on it.
     */
    findings.push(finding(s.signal.replace(/^tokenwaste-/, ""),
      s.observed ?? "a waste pattern was detected in this run",
      s.corrective, s.confidence ?? 0.7,
      /* the particulars live on the detector's own evidence list */
      { action: s.evidence?.[0]?.action ?? null, file: s.evidence?.[0]?.file ?? null,
        count: s.evidence?.[0]?.count ?? null }));
  }

  /*
   * 3) NEVER RAN A TEST — checked only at the moment of submit, where it is
   *    actionable. The 22,871-run corpus behind this puts the failure rate of a
   *    run that submits without ever testing far above base; the number lives in
   *    v49-agent-pathology.js and is cited, not re-derived here.
   */
  if (proposed?.isSubmit && steps.length > 2 && !steps.some((s) => s.isTest)) {
    findings.push(finding("never-ran-a-test",
      `about to submit after ${steps.length} steps with no test executed at any point in this run`,
      "run the project's test command once before finishing; a run that submits without ever testing "
      + "fails far more often than one that does",
      0.85));
  }

  findings.sort((a, b) => b.confidence - a.confidence);
  return { findings, worst: findings[0] ?? null, checked: CHECKS, notChecked: NOT_CHECKED };
}

/*
 * An allow-list, not a deny-list. A new signal appearing upstream must be read
 * and deliberately admitted before it reaches a user's context window — silently
 * forwarding whatever the detector grows next is how a supervisor starts making
 * claims nobody has checked.
 */
const KEPT = new Set([
  "tokenwaste-no-progress-test-loop",
  "tokenwaste-repeated-action",
  "tokenwaste-redundant-reread",
]);

/*
 * Disclosed, because a supervisor that lists what it caught without listing what
 * it never looks at is describing its own blind spot as clean ground.
 */
const CHECKS = [
  "said-vs-did (claims pass / claims tested / claims done, against the trace)",
  "no-progress test loops",
  "repeated identical commands",
  "redundant file re-reads",
  "submit with no test ever run",
];

const NOT_CHECKED = [
  "token/dollar cost vs peers — no per-task peer baseline exists at hook time; every cost signal is switched OFF rather than estimated",
  "architecture drift — needs a whole-repo import graph plus a human-authored layer spec; belongs at commit/CI, not per tool call",
  "code complexity and duplication — needs the delivered file set; one file per call would distort the density it is scored on",
  "requirement coverage — needs a model decomposition of the task, which is a network call inside a blocking hook",
];

export { CHECKS as HOOK_WASTE_CHECKS, NOT_CHECKED as HOOK_WASTE_NOT_CHECKED };
