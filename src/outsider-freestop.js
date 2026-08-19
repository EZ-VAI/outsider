/*
 * 代价为零的实时拒绝 —— REAL-TIME ENFORCEMENT THAT COSTS NOTHING.
 *
 * THE OPERATOR, THREE TIMES, AND I DRIFTED BACK THREE TIMES
 * ========================================================
 * "收工拒绝跟用户早上起来发一句『自审，查出问题后去改』，没有任何区别。干预必须
 *  发生在干活实时，贵是问题，那我们就想办法解决。"
 *
 * He is right and the drift was mine: the delivery moment and the Stop hook are
 * cheap to enforce, so I kept moving the product there, and every time I did I
 * rebuilt something he can already do himself for free in the morning.
 *
 * SO SOLVE THE EXPENSE INSTEAD.
 *
 * A real-time refusal costs (probability we are wrong) × (value of the action we
 * interrupted). Nothing can drive the first term to zero. But the SECOND term is
 * zero for an entire class of actions — the ones that cannot produce information
 * the run does not already have:
 *
 *   · re-reading a file already read, with no edit to it since
 *   · re-running a command already run, with no edit since
 *   · re-running a FAILED test with no edit since — the canonical 打地鼠 move
 *
 * Refusing one of these takes nothing away, because whatever it would have
 * returned is already in the record. This is not a judgement call about whether
 * the agent is doing well. It is arithmetic.
 *
 * THE CONDITION THAT MAKES IT HONEST
 * ==================================
 * A refusal only qualifies if WE CAN HAND THE ANSWER BACK. If the prior
 * observation was not captured, the action is not provably worthless — it might
 * genuinely be the cheapest way for the run to learn something — and we allow
 * it. That single rule is what separates "this costs nothing" from "I decided
 * you did not need it".
 *
 * So every refusal here carries the result the agent was about to spend a step
 * re-fetching. 叫停 + 把答案给他 —— and the line keeps moving, because the
 * information it was reaching for arrives in the same breath as the refusal.
 *
 * WHY A SKILL CANNOT DO THIS
 * ==========================
 * Not because a skill could not contain the rule. Because a skill's output is a
 * suggestion the agent weighs with the judgement that is already drifting, while
 * this one makes the wasted call NOT HAPPEN. And because the answer handed back
 * is read out of the raw record — including observations the agent's own context
 * has since compacted away.
 */

const MIN_OBS = 12;          /* below this there is nothing worth handing back */
const MAX_OBS = 1600;        /* what rides back with the refusal */

const norm = (s) => String(s ?? "").replace(/\s+/g, " ").trim();

/* the last step that matches, plus whether anything was edited since */
function lastMatch(steps, pred) {
  for (let i = steps.length - 1; i >= 0; i -= 1) {
    if (pred(steps[i])) return { step: steps[i], index: i };
  }
  return null;
}
/*
 * ── 证明制，不是排除制 ────────────────────────────────────────────────────
 *
 * THE FIRST VERSION ASKED "was there an isEdit step since?" and it was wrong on
 * 24 of the 31 refusals it produced on a real log. Agents edit through the SHELL
 * constantly — `python3 - <<'PY' … open(p,"w") … PY`, `sed -i`, `cat > file` —
 * and none of that carries an `isEdit` flag. So "nothing changed" was false
 * exactly when it mattered, and the refusal took away a genuinely new result.
 *
 * The claim being made here is unusually strong — THIS ACTION CANNOT PRODUCE NEW
 * INFORMATION — so it must be established positively. Only steps that can be
 * POSITIVELY IDENTIFIED as read-only count as "nothing happened". Anything this
 * function does not recognise is treated as a possible mutation, and the refusal
 * is withheld.
 *
 * Fail closed, and accept that this fires far less often. A refusal that is free
 * 76% of the time is not a free refusal; it is an ordinary interruption with a
 * confident story attached.
 */
const READ_ONLY_SHELL = new RegExp("^(?:ls|ll|cat|bat|head|tail|wc|pwd|echo|printf|date|env|"
  + "which|whereis|type|file|stat|du|df|tree|find|grep|rg|ag|ack|fgrep|egrep|"
  + "git\\s+(?:status|diff|log|show|branch|remote|rev-parse|ls-files|blame)|"
  + "npm\\s+(?:ls|list|view|outdated)|node\\s+--version|python3?\\s+--version|"
  + "jq|column|sort|uniq|cut|nl|basename|dirname|realpath|readlink|sleep|true|false)\\b");

function provablyReadOnly(s) {
  if (!s) return false;
  if (s.isEdit) return false;
  /* a Read/Glob/Grep tool call is read-only by construction */
  if (s.actionKind === "tool-call" && !s.isEdit) return true;
  const cmd = String(s.cmd ?? s.action ?? "");
  if (!cmd) return false;
  /* any redirection, heredoc, or in-place flag and we cannot claim anything */
  if (/[>]|<<|\btee\b|\bsed\b[^|]*-i|\bmv\b|\bcp\b|\brm\b|\bmkdir\b|\btouch\b|\bpatch\b|\bgit\s+(?:apply|checkout|reset|stash|commit|add)\b/.test(cmd)) return false;
  /* every segment must be individually recognisable as read-only */
  return cmd.split(/&&|\|\||;|\|/).every((seg) => READ_ONLY_SHELL.test(seg.trim()));
}

/*
 * `nothingHappenedSince` — true only when EVERY step after `i` is provably
 * read-only. One unrecognised step and the answer is no.
 */
const editedSince = (steps, i, file = null) => {
  const after = steps.slice(i + 1);
  if (file && after.some((s) => s.isEdit && s.file === file)) return true;
  return !after.every(provablyReadOnly);
};

/*
 * `assessFreeStop` — returns a refusal ONLY when the proposed call cannot
 * produce information the run does not already hold, AND we can return that
 * information. Null in every other case, which is almost every case.
 */
/*
 * A TOOL IS A READ ONLY IF IT SAYS SO BY NAME.
 *
 * The reread rule first keyed on "the proposed call has a `file`", and on a real
 * log that refused `mcp__memory__memory_str_replace(/areas/outsider.md)` and
 * `mcp__memory__memory_append(…)` — WRITES, silently dropped on the grounds that
 * the file had already been read. An MCP tool carries a path exactly like a
 * reader does; there is nothing in the shape to tell them apart.
 *
 * Same fail-closed rule as the history side: name the readers, refuse to guess
 * about anything else. An unknown tool is never a read.
 */
const READER_TOOLS = /^(?:Read|NotebookRead|Glob|Grep|View|ReadFile)$/;

export function assessFreeStop({ proposed, steps = [], toolName = null } = {}) {
  if (!proposed || !steps.length) return null;
  if (proposed.isEdit) return null;                 /* never stand in front of work */
  if (proposed.risk === "destructive") return null; /* the gate owns that, not this */

  /* ── 1) 重跑一个中间没改过代码的失败测试 —— 打地鼠最纯粹的一步 ───────── */
  if (proposed.isTest && proposed.cmd) {
    /*
     * THE SAME COMMAND, CHARACTER FOR CHARACTER — not merely "another test".
     *
     * `isTest` is a loose classifier by design, and it has to be: it decides
     * whether a run has verified anything. But loose is fatal here. On a real
     * log it marked `python3 - <<'PY' p='test/outsider-hook-scope.test.js' …`
     * — a script that EDITS a test file — as a test run, and the refusal then
     * compared an edit against the previous suite failure and withheld it. 19
     * wrong refusals came from that one gap.
     *
     * The claim is "re-running THIS will return what it just returned", so the
     * only defensible predicate is identity of the command itself.
     */
    const sig = norm(proposed.cmd);
    const prev = lastMatch(steps, (s) => s.isTest && s.exit != null
      && norm(s.cmd ?? s.action) === sig);
    if (prev && prev.step.exit !== 0 && !editedSince(steps, prev.index)) {
      const obs = norm(prev.step.observation);
      if (obs.length >= MIN_OBS) {
        return {
          kind: "rerun-without-edit",
          why: `上一次测试失败之后，你没有改过任何代码 —— 这一次会得到一模一样的结果`,
          answer: obs.slice(-MAX_OBS),
          corrective: [
            `outsider：这一步我没让它跑，因为**它不会带来任何新信息**。`,
            `上一次 \`${norm(prev.step.action).slice(0, 90)}\` 失败之后，轨迹里没有任何编辑。`,
            "重跑不会让它变绿。",
            "",
            "上一次的失败原文在这里，你不用再花一步去取：",
            "",
            obs.slice(-MAX_OBS),
            "",
            "读完它，改一处，再跑。**改完立刻就能跑，我不拦。**",
          ].join("\n"),
        };
      }
    }
  }

  /* ── 2) 重读一个已经读过、之后没被改过的文件 ───────────────────────── */
  if (proposed.file && !proposed.isTest && READER_TOOLS.test(String(toolName ?? ""))) {
    const prev = lastMatch(steps, (s) => !s.isEdit && s.file === proposed.file
      && norm(s.observation).length >= MIN_OBS);
    if (prev && !editedSince(steps, prev.index, proposed.file)) {
      const obs = norm(prev.step.observation);
      return {
        kind: "reread-unchanged",
        why: `${proposed.file} 你已经读过，而且之后没有被改动过`,
        answer: obs.slice(0, MAX_OBS),
        corrective: [
          `outsider：这一步我没让它跑 —— \`${proposed.file}\` 你在这一轮里读过，`,
          "之后它没有被改动，所以内容一个字都没变。",
          "",
          "上一次读到的内容在这里：",
          "",
          obs.slice(0, MAX_OBS),
          "",
          "直接用它往下走。**要是你怀疑它变了，改一次或换个读法，我不拦。**",
        ].join("\n"),
      };
    }
  }

  /* ── 3) 第三次发同一条命令，中间没有任何编辑 ───────────────────────── */
  if (proposed.actionKind === "shell" && proposed.cmd) {
    const sig = norm(proposed.cmd);
    const same = steps.filter((s) => norm(s.cmd ?? s.action) === sig);
    if (same.length >= 2) {
      const prev = lastMatch(steps, (s) => norm(s.cmd ?? s.action) === sig);
      if (prev && !editedSince(steps, prev.index)) {
        const obs = norm(prev.step.observation);
        if (obs.length >= MIN_OBS) {
          return {
            kind: "repeat-unchanged",
            why: `这条命令已经跑过 ${same.length} 次，中间没有任何编辑`,
            answer: obs.slice(-MAX_OBS),
            corrective: [
              `outsider：这一步我没让它跑 —— 同一条命令这一轮已经跑了 ${same.length} 次，`,
              "而且中间没有任何编辑，所以结果不会变。",
              "",
              "上一次的输出在这里：",
              "",
              obs.slice(-MAX_OBS),
              "",
              "**改一处，或者换一条不一样的命令，我立刻放行。**",
            ].join("\n"),
          };
        }
      }
    }
  }

  return null;
}
