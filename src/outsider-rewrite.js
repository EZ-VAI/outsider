/*
 * 把手伸进动作里 —— THE FIRST INTERVENTION THAT IS NOT TEXT.
 *
 * WHY THE PREVIOUS SEVEN LAYERS WERE REPLACEABLE
 * ==============================================
 * The operator, after reading the feature list: "这听起来像一个 skill 就能解决
 * 的事情。" Measured on a real 916-step session with a structural criterion —
 * is the evidence inside the agent's own context, and does the action need a
 * capability a skill lacks — the answer was 93% YES, a skill could have said the
 * same thing. The 7% that could not were destructive refusals, which the host's
 * own permission dialog already covers.
 *
 * The reason is one sentence: EVERYTHING OUTSIDER PRODUCED WAS TEXT, AND TEXT IS
 * ALSO ALL A SKILL PRODUCES. Two things that emit the same kind of object into
 * the same context window are substitutes, however good the reasoning behind one
 * of them. The comparison does not collapse until the intervention becomes an
 * ACTION ON THE WORK — and PreToolUse can do that, via `updatedInput`, which
 * this repo had never used.
 *
 * THE DEFECT IT FIXES IS MECHANICAL, SILENT, AND EVERYWHERE
 * ========================================================
 * In bash a pipeline's exit status is the LAST command's:
 *
 *     $ false | tail -1 ; echo $?
 *     0
 *
 * So `npm test 2>&1 | tail -20` reports SUCCESS whatever the suite did. Measured
 * on that same session: 197 test/verification commands, 146 of them (74.1%)
 * piped. Of the 87 runs recorded as GREEN, 78 — ninety percent — got that green
 * from `tail` or `grep`, not from the test.
 *
 * That number indicts this product before it indicts the agent. `stale-green`,
 * `red-at-delivery`, `greenAtEnd`, the whole 出厂验收 layer, every compliance
 * number involving a test outcome — all of them read a channel that returns
 * "pass" unconditionally. The supervisor was measuring a lie and reporting it as
 * evidence.
 *
 * A skill cannot fix this. It can ask the agent to remember `pipefail`, and the
 * agent will forget, because remembering is exactly the faculty already
 * compromised. Nothing inside the context window can repair a fact about the
 * command that was already composed. Something OUTSIDE it, standing between the
 * decision and the execution, can — by editing the command.
 *
 * THE FAIL-SAFE RULE, AND IT IS ABSOLUTE
 * ======================================
 * A rewrite may only be used where BEING IGNORED IS HARMLESS. Hosts differ, and
 * a host that honours `permissionDecision: "allow"` while dropping `updatedInput`
 * would run the ORIGINAL command. So a rewrite must never be the thing that
 * makes a dangerous command safe — `rm -rf x` is never rewritten into `mv x`,
 * because the failure mode of that being ignored is the deletion it was meant to
 * prevent. Destructive commands keep their refusal.
 *
 * Everything here satisfies the rule by construction: drop the rewrite and you
 * get exactly today's behaviour.
 *
 * WHY THE REWRITE IS EVIDENCE-BEARING
 * ===================================
 * A text reminder has no clean mechanical counterfactual: an agent that follows
 * it may have done so anyway. A rewrite records both the proposed command and
 * the command actually executed, making this bounded intervention directly
 * inspectable without claiming that it establishes the final task outcome.
 */

/* a pipeline whose exit status will come from the filter, not from the work */
const PIPED = /\|\s*(?:tail|head|grep|rg|sed|awk|wc|jq|cut|sort|uniq|tee|python3?\b)/;
/* already correct — never touch a command that is already doing the right thing */
const HAS_PIPEFAIL = /\bpipefail\b/;
/* shells where `set -o pipefail` is not available or not meaningful */
const NOT_BASH = /^\s*(?:fish|csh|tcsh)\b/;

export function needsPipefail(cmd) {
  const c = String(cmd ?? "");
  if (!c || c.length > 4000) return false;
  if (!PIPED.test(c)) return false;
  if (HAS_PIPEFAIL.test(c)) return false;
  if (NOT_BASH.test(c)) return false;
  /*
   * ONLY WHERE AN EXIT CODE IS LOAD-BEARING. Widening this to every pipeline
   * would change the observable result of ordinary exploration — `grep foo x |
   * head` legitimately exits non-zero when nothing matches, and turning that
   * into a failure would make the supervisor the source of red herrings. The
   * whole value is in verification commands, where a false green is the defect.
   */
  return true;
}

/*
 * `set -o pipefail;` as a PREFIX, not a rewrite of the command body.
 *
 * Deliberately the least invasive edit that exists: the agent's command survives
 * character for character, the output volume it chose is unchanged, and the only
 * difference is that a failure inside the pipeline now surfaces as a failure.
 * Rewriting the body — dropping the filter, widening the tail, splicing in a tee
 * — was the first design and it was wrong: a malformed rewrite breaks the run's
 * test command, which is a far worse outcome than the blindness it cures.
 */
export function pipefailRewrite(cmd) {
  return `set -o pipefail; ${String(cmd)}`;
}

/*
 * The whole decision, for one proposed shell call. Returns null when there is
 * nothing to do — the overwhelmingly common case.
 */
export function proposeRewrite({ toolName, toolInput = {}, proposed = null } = {}) {
  const cmd = toolInput?.command;
  if (typeof cmd !== "string" || !cmd) return null;
  if (!/^(?:Bash|Shell|shell|run_terminal_cmd)$/i.test(String(toolName ?? ""))) return null;
  /* verification commands only — see needsPipefail */
  if (!proposed?.isTest) return null;
  if (!needsPipefail(cmd)) return null;

  return {
    kind: "pipefail",
    from: cmd,
    to: pipefailRewrite(cmd),
    updatedInput: { ...toolInput, command: pipefailRewrite(cmd) },
    /*
     * SAID OUT LOUD, EVERY TIME. A supervisor that edits the work silently is a
     * supervisor nobody can audit, and this one edits the exact command whose
     * result everything else is judged on. The agent is told what changed and
     * why, in one line, so the change is never a surprise in the transcript.
     */
    note: "outsider 给这条验收命令加了 `set -o pipefail` —— 你把它接进了管道，"
      + "而 bash 里管道的退出码是最后一个命令的（`false | tail -1` 的 $? 是 0）。"
      + "不加这一句，这条命令无论测试成败都会报成功。命令本身一个字没动。",
  };
}
