/*
 * 上下文分叉的那一瞬间 —— 真的上手改，而不是拦。
 *
 * WHERE 遗忘工程核心 ACTUALLY HAPPENS
 * ==================================
 * Measured on a real session: 943 steps on the main chain, 352 in subagents —
 * 27% of the night ran inside a context that HAD NEVER SEEN THE OPERATOR'S
 * WORDS. A child gets exactly one mandate: the prompt its parent wrote. And the
 * parent writes that prompt with the judgement that has already drifted, from a
 * memory that has already been compacted. The operator's requirement reaches the
 * child, if at all, as the parent's third-hand paraphrase.
 *
 * That is 遗忘工程核心 in its most literal form, and it happens 46 times in one
 * night on this log — every Task call is one.
 *
 * WHY THIS IS THE PLACE THE HANDS GO IN
 * =====================================
 * A refusal here is useless: refusing to let the agent delegate does not get the
 * work done. Text into the PARENT is useless: the parent has already written the
 * prompt, and the child will never see the parent's context. The only
 * intervention that reaches the place the damage occurs is EDITING THE PROMPT
 * ITSELF, in the moment between composition and dispatch. `updatedInput` does
 * exactly that.
 *
 * No interruption, no lost turn, no judgement about whether the delegation is a
 * good idea. The work proceeds — under the operator's own words instead of a
 * paraphrase of them.
 *
 * A SKILL STRUCTURALLY CANNOT DO THIS. A skill loaded in the parent is text in
 * the parent's context; it does not travel into a child's prompt unless the
 * parent chooses to copy it, using the judgement that is the problem. And the
 * operator's verbatim turns are read out of the RAW LOG — including turns that
 * are already behind a compaction boundary and therefore no longer available to
 * the parent at any price.
 *
 * WHAT IS INJECTED, AND WHAT IS DELIBERATELY NOT
 * ==============================================
 * Verbatim operator turns, and unresolved gaps. Nothing else. No summary — a
 * summary is precisely the artefact being routed around, and mine is not better
 * than the parent's. No instructions about how to work; the child's task is the
 * parent's business. The injection answers exactly one question the child could
 * not otherwise answer: 这件事最初是谁要的、原话是什么。
 *
 * FAIL-SAFE, LIKE EVERY REWRITE HERE: if the host drops `updatedInput`, the
 * child runs on the parent's prompt — today's behaviour, exactly.
 */

const MAX_TURN = 700;
const MAX_TOTAL = 2000;

/* the tools that fork a context; anything else is not a delegation */
const FORK_TOOLS = /^(?:Task|Agent|SubAgent|dispatch_agent)$/i;

const norm = (s) => String(s ?? "").replace(/\s+/g, " ").trim();

/*
 * `mandateBlock` — the operator's own words, and what is still open, formatted
 * for a reader that has no other context at all.
 */
export function mandateBlock({ operatorTurns = [], gaps = [] } = {}) {
  const turns = operatorTurns
    .map((t) => norm(t?.text ?? t))
    .filter((t) => t.length >= 25)
    .slice(-3);
  if (!turns.length && !gaps.length) return null;

  const L = ["", "─────── outsider：以下是这项工作的来源，不是你父 agent 的转述 ───────"];
  if (turns.length) {
    L.push("");
    L.push("操作方的原话（逐字。派你来的那个 agent 手里多半只剩它自己的复述，");
    L.push("更早的几段已经被压缩出它的窗口了）：");
    let budget = MAX_TOTAL;
    for (const t of turns) {
      const s = t.slice(0, MAX_TURN);
      if (budget - s.length < 0) break;
      budget -= s.length;
      L.push(`  「${s}」`);
    }
  }
  if (gaps.length) {
    L.push("");
    L.push("这一轮到现在还没合上的差距（证据，不是意见）：");
    for (const g of gaps.slice(0, 4)) L.push(`  · ${norm(g).slice(0, 200)}`);
  }
  L.push("");
  L.push("如果你被派的任务和上面这些对不上，先说出来，不要照着做完。");
  L.push("──────────────────────────────────────────────────────────────");
  L.push("");
  return L.join("\n");
}

/*
 * `injectMandate` — returns an updatedInput for a fork, or null.
 *
 * The block goes BEFORE the parent's prompt. A child reads its instruction top
 * down and the last thing it sees weighs most; putting the mandate first and the
 * concrete task second keeps the parent's task as the operative instruction
 * while the mandate is the frame it is judged against. Appending instead would
 * quietly reprioritise the whole delegation, which is not this layer's call.
 */
export function injectMandate({ toolName, toolInput = {}, operatorTurns = [],
  gaps = [] } = {}) {
  if (!FORK_TOOLS.test(String(toolName ?? ""))) return null;
  const prompt = toolInput?.prompt;
  if (typeof prompt !== "string") return null;
  /*
   * SUBSTANCE, NOT CHARACTERS. A 40-character threshold skipped
   * 「看一下 src/limiter.js 里有没有真的实现滑动窗口，把结论返回给我」— a real
   * delegation — while passing an equally long English string that says nothing.
   * A CJK character carries several times an ASCII character's information, and
   * this product is bilingual by construction; counting characters is the same
   * ASCII assumption that has cost this repo twice already.
   *
   * The threshold exists only to skip degenerate prompts ("读一下 README"), never
   * to judge how important a task is. When in doubt it injects: the cost of a
   * needless mandate block is ~300 tokens in a child; the cost of a missing one
   * is a whole subagent working from a paraphrase.
   */
  const weight = [...prompt].reduce((n, ch) =>
    n + (/[　-鿿豈-﫿＀-￯]/.test(ch) ? 2.5 : 1), 0);
  if (weight < 60) return null;
  /* already carries it — never stack the same block twice on a retry */
  if (/outsider：以下是这项工作的来源/.test(prompt)) return null;

  const block = mandateBlock({ operatorTurns, gaps });
  if (!block) return null;

  return {
    kind: "mandate-injected",
    updatedInput: { ...toolInput, prompt: block + prompt },
    note: "outsider 在这次派生的 prompt 前面加了操作方的原话（逐字）"
      + "—— 子 agent 的上下文是全新的，它本来只能拿到你的转述。你的任务描述一个字没动。",
  };
}
