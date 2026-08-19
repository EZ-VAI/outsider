/*
 * THE OPERATOR'S OWN WORDS, AND THE MOMENT THE AGENT LOSES THEM.
 *
 * "遗忘工程核心" — forgetting what the job was — has been the weakest signal in
 * this product, and the code said so out loud: `assessCharterDrift` lists
 * "objective 的语义 —— 是否还在做同一件事，本层不做语义判断" under `notChecked`.
 *
 * ── THE HYPOTHESIS THAT FAILED, KEPT BECAUSE IT COST REAL DATA TO KILL ──────
 *
 * The cheap idea: the transcript holds the operator's own turns, which the agent
 * cannot edit or forget. Extract the NAMES in them (paths, identifiers,
 * backticked spans — Latin tokens survive a Chinese sentence), and report when
 * recent work stops touching anything the operator ever named. No model, no
 * semantics, and anchored on the operator rather than on a self-reported
 * charter. Measured on a real 803-step session:
 *
 *     rolling stretch, all steps      fired on 49.8% of decision points
 *     rolling stretch, edits only     fired on 73–76%
 *     since the last naming turn      fired on 87.8–92.6%
 *
 * Unusable at every threshold, and the reason is visible in the data rather
 * than in the tuning: REAL OPERATORS DO NOT NAME FILES. The two most recent
 * instructions in that session named zero paths between them — they were prose
 * about intent. The only turn rich in names was the machine-written compaction
 * summary, which is not the operator at all. Lexical overlap with operator
 * speech is not a drift measure, and no threshold rescues it.
 *
 * So the semantic half of "still doing the same thing" stays unclaimed here. It
 * needs judgement this layer refuses to fake locally, and inventing a number for
 * it would be worse than the gap.
 *
 * ── WHAT IS LEFT, AND IT IS NOT A CONSOLATION PRIZE ────────────────────────
 *
 * There is one kind of forgetting that is mechanical, structural, and needs no
 * semantics at all: THE HOST TELLS US WHEN IT WIPED THE AGENT'S CONTEXT.
 * `isCompactSummary` on a user-lane message, and `compact_boundary` events —
 * this repo's own session records one.
 *
 * After a boundary, the operator's earlier instructions are provably not in the
 * agent's window. The supervisor reads the transcript from DISK, so it still has
 * them, word for word. That asymmetry is the whole intervention: the foreman is
 * not judging whether the worker remembers, he is handing back the work order
 * the worker's notes no longer contain.
 *
 * It is also the one place where "tell the worker what to do" costs nothing and
 * risks nothing: the content handed back is the operator's own text, not our
 * opinion about it.
 */

/* the operator's turn, distinguished from everything else the host writes into
   the `user` lane: tool results, system reminders, slash-command echoes — and
   the compaction summary, which wears `type:"user"` but was written by a model.
   Counting that summary as operator speech is what made the killed hypothesis
   above look, for one measurement, like it had an anchor. */
const NOISE = /^\s*(?:<system-reminder>|<local-command|<command-(?:name|message|args)>|<user-prompt-submit-hook>|Caveat:|This session is being continued from a previous conversation)/;

/* one line in, one operator turn or null — so the trajectory reader can collect
   these inside the single pass it already makes, instead of re-reading and
   re-parsing a multi-megabyte transcript for them */
export function operatorTurnFromLine(raw) {
  let d = raw;
  if (typeof raw === "string") {
    if (!raw.includes('"user"')) return null;           // cheap pre-filter
    try { d = JSON.parse(raw); } catch { return null; }
  }
  if (!d || d.type !== "user") return null;
  if (d.isCompactSummary) return null;                  // a model wrote this, not the human
  const c = d.message?.content ?? d.content;
  let text = "";
  if (typeof c === "string") text = c;
  else if (Array.isArray(c)) {
    /* a turn carrying a tool_result is the HOST talking back, not the human */
    if (c.some((b) => b && typeof b === "object" && b.type === "tool_result")) return null;
    text = c.filter((b) => b && b.type === "text").map((b) => b.text ?? "").join("\n");
  }
  text = String(text ?? "").trim();
  if (!text || NOISE.test(text)) return null;
  return { ts: Date.parse(d.timestamp ?? "") || null, text: text.slice(0, 8000) };
}

export function operatorTurns(lines = []) {
  const out = [];
  for (const raw of lines) {
    const t = operatorTurnFromLine(raw);
    if (t) out.push(t);
  }
  return out;
}

/*
 * compactionBoundaries — the host's own record of wiping the window. Two shapes
 * are emitted and either one is proof, so both are read and de-duplicated by
 * timestamp; a host that emits neither simply yields none, and this layer then
 * says nothing rather than guessing from transcript length.
 */
export function boundaryFromLine(raw) {
  let d = raw;
  if (typeof raw === "string") {
    /* cheap pre-filter: parsing every line of a multi-megabyte transcript to
       find two events is the quadratic habit this repo already paid for once.
       CASE-INSENSITIVE, because the two shapes disagree: the event type is
       `compact_boundary` but the flag is `isCompactSummary`. A lowercase-only
       filter silently dropped the flag shape, and the only reason the real
       transcript still matched is that its prose happened to contain the word —
       i.e. it worked by luck on the one file it was tested against. */
    if (!/compact/i.test(raw)) return null;
    try { d = JSON.parse(raw); } catch { return null; }
  }
  if (!d) return null;
  const isBoundary = d.isCompactSummary === true
    || d.type === "compact_boundary" || d.subtype === "compact_boundary";
  if (!isBoundary) return null;
  return { ts: Date.parse(d.timestamp ?? "") || null };
}

/* fold a boundary into a list, collapsing the two shapes one compaction emits */
export function pushBoundary(out, b) {
  if (!b) return out;
  const ts = b.ts;
  const near = ts != null && out.some((x) => x.ts != null && Math.abs(x.ts - ts) <= 5000);
  if (!near) out.push({ ts });
  return out;
}

export function compactionBoundaries(lines = []) {
  const out = [];
  for (const raw of lines) {
    const b = boundaryFromLine(raw);
    if (!b) continue;
    const ts = b.ts;
    /*
     * ONE COMPACTION EMITS BOTH SHAPES, MILLISECONDS APART. On this session the
     * boundary event landed at …53.544Z and the summary message at …53.545Z, and
     * naive de-duplication by exact timestamp reported "compacted 2 times" for a
     * run that was compacted once. Inflating the operator's own damage report is
     * the fastest way to make it worthless, so events inside a few seconds of
     * each other are one event.
     */
    const near = ts != null && out.some((x) => x.ts != null && Math.abs(x.ts - ts) <= 5000);
    if (near) continue;
    out.push({ ts });
  }
  return out;
}

/* names the operator wrote — kept because it is a sound primitive even though
   the drift measure built on it failed; the fault card and the disclosure both
   use it to decide which operator turns are worth quoting back */
const PATHISH = /(?:[\w@.-]+\/)+[\w@.-]+|[\w-]+\.(?:js|mjs|cjs|ts|tsx|jsx|py|go|rs|rb|java|c|h|cpp|json|yml|yaml|toml|md|sh)\b/gi;
const IDENTISH = /\b(?:[a-z][a-z0-9]*(?:[A-Z][a-z0-9]*)+|[a-z][a-z0-9]*(?:_[a-z0-9]+)+|[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+)\b/g;
const BACKTICKED = /`([^`\n]{2,80})`/g;
const TOO_COMMON = new Set(["index.js", "package.json", "readme.md", "test.js", "main.js",
  "node_modules", "src", "test", "tests", "lib", "dist", "build"]);

export function namesIn(text) {
  const s = String(text ?? "");
  const out = new Set();
  const add = (x) => {
    const v = String(x).trim().toLowerCase().replace(/^[./]+/, "").replace(/[.,;:!?)\]]+$/, "");
    if (v.length < 3 || v.length > 120) return;
    if (TOO_COMMON.has(v)) return;
    out.add(v);
  };
  for (const m of s.matchAll(BACKTICKED)) {
    const inner = m[1];
    for (const mm of inner.matchAll(PATHISH)) add(mm[0]);
    for (const mm of inner.matchAll(IDENTISH)) add(mm[0]);
    if (!/\s/.test(inner)) add(inner);
  }
  for (const m of s.matchAll(PATHISH)) add(m[0]);
  for (const m of s.matchAll(IDENTISH)) add(m[0]);
  return out;
}

export const DEFAULT_MANDATE_POLICY = Object.freeze({
  /* how many operator turns to hand back, newest first. The point is to restore
     the work order, not to refill the window we just observed being emptied. */
  quoteTurns: 3,
  quoteChars: 400,
  /* hand the work order back RIGHT AFTER the wipe, then stop. Measured over a
     real session: attached to the whole 120-step window it would ride along on
     13.6% of decision points, which is how a true statement becomes wallpaper.
     The moment it is worth anything is the moment the window was emptied. */
  freshSteps: 25,
});

/*
 * assessContextLoss — the operator said this, and the agent can no longer see it.
 *
 * ADVISORY, ALWAYS. It never denies: losing context is the host's doing, not a
 * fault of the agent, and there is no way out for the agent to "comply" with.
 * The only correct action is to hand the words back.
 *
 * Present-tense, like everything else here: it speaks only about boundaries that
 * fall inside the supervised window. Once the run has moved a full window past
 * the last compaction, the agent has demonstrably been working coherently
 * without it and the reminder becomes wallpaper.
 */
export function assessContextLoss({ turns = [], boundaries = [], steps = [], policy = {} } = {}) {
  const p = { ...DEFAULT_MANDATE_POLICY, ...policy };
  const checked = ["宿主是否记录过上下文压缩（isCompactSummary / compact_boundary）",
    "压缩点之前操作方说过的原话是否还在窗口里"];
  const notChecked = [
    "agent 是否真的忘了 —— 本层只知道窗口被清过，不知道它记得多少",
    "还在不在做同一件事 —— 词面对账已被真实数据证伪（49.8%–92.6% 误报，见本文件头），语义判断本层不做",
    "压缩之后的工作对不对 —— 只交还原话，不评价",
  ];

  if (!boundaries.length) {
    return { detected: false, findings: [], checked, notChecked, boundaries: 0 };
  }
  const last = boundaries[boundaries.length - 1];
  /* only while it is still inside the window we are judging */
  const stepsSince = last?.ts ? steps.filter((s) => s.ts && s.ts > last.ts).length : steps.length;
  if (stepsSince >= p.freshSteps) {
    /* the run has already worked coherently for longer than the reminder is
       worth; from here it is noise, not a work order */
    return { detected: false, findings: [], checked, notChecked,
      boundaries: boundaries.length, stepsSince };
  }

  const lost = turns.filter((t) => t.ts && last?.ts && t.ts < last.ts);
  if (!lost.length) {
    return { detected: false, findings: [], checked, notChecked, boundaries: boundaries.length };
  }
  const quoted = lost.slice(-p.quoteTurns).map((t) => t.text.replace(/\s+/g, " ").slice(0, p.quoteChars));

  return {
    detected: true,
    boundaries: boundaries.length,
    findings: [{
      kind: "context-compacted",
      severity: "advisory",
      provenance: "host-reported",
      observed: `本次运行的上下文被压缩过 ${boundaries.length} 次，最近一次之前操作方说过的 `
        + `${lost.length} 段原话已经不在 agent 的窗口里`,
      reads: "这是「遗忘工程核心」里可以数出来的那一半：不是判断它记不记得，"
        + "而是宿主明确记录过窗口被清空，而监工是从磁盘读的，原话还在手上",
      restore: quoted,
    }],
    checked, notChecked,
  };
}

/* ------------------------------------------------------------------ *
 * 重复对齐 —— 唯一一个不是我定的标准
 * ------------------------------------------------------------------ *
 * The operator asked the question that broke the previous round open:
 * "你为什么如此确定这是健康的夜晚？基于谁的标准？"
 *
 * It was my standard, and it was circular. The patrol threshold was calibrated
 * ON this session, and then this session's conformance to it was offered as
 * evidence the session was healthy. Instrument and specimen were the same
 * object. Worse, the session in question was my own work, so I had graded myself
 * with a rubric I wrote.
 *
 * There IS an external standard in the log, and it belongs to the operator:
 * DID HE HAVE TO SAY IT AGAIN. Measured on that same session — 42 operator
 * turns, and the SAME specification re-sent three times at 88%, 90% and 90%
 * similarity. By his standard that night had heavy drift. By mine it was
 * "healthy", because my instrument measured distance-to-a-green-test and the
 * tests were green the whole time. THE WORK WAS WELL-VERIFIED AND WRONG.
 *
 * That is precisely 遗忘工程核心 and 糊弄, and no amount of test hygiene sees it.
 *
 * WHY THIS IS NOT THE FALSIFIED LEXICAL HYPOTHESIS
 * ================================================
 * An earlier round tested "does the agent stop touching the files the operator
 * named" and killed it with numbers (49.8% / 73–76% / 87.8–92.6%): real
 * operators do not name files. This measures something different and does not
 * look at content at all — character 3-grams between two OPERATOR turns. It asks
 * "has he said this before", never "is the agent doing what he said". No
 * vocabulary, no paths, no keywords. It works on any language.
 *
 * AND THE WORKER STRUCTURALLY CANNOT SEE IT. By the time the spec arrives the
 * third time, the first two are behind a compaction boundary. Only something
 * reading the raw log knows he is repeating himself. That is the whole thesis of
 * this product in one signal: a fact about the worker, held by someone else.
 */
/*
 * SWEPT, NOT TUNED. On the real 42-turn session, minChars ∈ {20,30,40,50,60} ×
 * sim ∈ {0.35,0.5} returns the IDENTICAL three hits (#16→#32, #16→#35, #16→#39)
 * — the same specification re-sent three times. Nothing in that grid produces a
 * false positive on the short "继续做。继续推" / "继续自审" turns either, because
 * two different ways of saying "keep going" share almost no trigrams.
 *
 * A judgement that is the same everywhere in the grid is a property of the
 * signal, not of the numbers. 60 was my first guess and it silently dropped a
 * realistic 57-character requirement; 30 keeps it, and 0.5 buys margin on the
 * axis that could actually produce a false positive.
 */
const REALIGN_MIN_CHARS = 30;
const REALIGN_SIM = 0.5;

const trigrams = (s) => {
  const g = new Set();
  const t = String(s ?? "").replace(/\s+/g, " ").trim();
  for (let i = 0; i + 3 <= t.length; i += 1) g.add(t.slice(i, i + 3));
  return g;
};
const jaccard = (a, b) => {
  let n = 0;
  for (const x of a) if (b.has(x)) n += 1;
  return n / (a.size + b.size - n || 1);
};

export function assessRealignment(turns = [], { sim = REALIGN_SIM,
  minChars = REALIGN_MIN_CHARS } = {}) {
  const texts = turns.map((t) => String(t?.text ?? t ?? "").replace(/\s+/g, " ").trim());
  const grams = texts.map(trigrams);
  const repeats = [];
  for (let i = 1; i < texts.length; i += 1) {
    if (texts[i].length < minChars) continue;
    for (let j = 0; j < i; j += 1) {
      if (texts[j].length < minChars) continue;
      const s = jaccard(grams[i], grams[j]);
      if (s >= sim) { repeats.push({ at: i, earlier: j, similarity: Number(s.toFixed(3)) }); break; }
    }
  }
  if (!repeats.length) return { detected: false, repeats: [] };

  const last = repeats[repeats.length - 1];
  const gap = last.at - last.earlier;
  return {
    detected: true, repeats,
    observed: `操作方把同一段话又说了一遍（第 ${last.earlier + 1} 次说过，第 ${last.at + 1} 次重说，`
      + `相似度 ${Math.round(last.similarity * 100)}%，中间隔了 ${gap} 次发言）`
      + (repeats.length > 1 ? `。整轮里这样的重复共 ${repeats.length} 次。` : "。"),
    /* his words, both times, verbatim — never my summary of them */
    restore: [texts[last.earlier].slice(0, 1200), texts[last.at].slice(0, 1200)],
    corrective: [
      "outsider：**操作方刚刚把他已经说过的话又说了一遍。**",
      "",
      `  ${repeats.length > 1 ? `这一轮第 ${repeats.length} 次` : "第 1 次"}，`
      + `上一次是在 ${gap} 次发言之前。`,
      "",
      "这不是一条意见，是一条证据：**一个人不会重复一段他认为你已经做到的要求。**",
      "他在重新对齐你，说明这中间的工作偏离了他要的东西 —— 而你多半看不到这一点，",
      "因为更早的那一次已经被压缩出你的窗口了。",
      "",
      "在写下一行代码之前，先做这一件事：",
      "  1. 把下面两段原话逐条拆成条目（是「条目」，不是「你的理解」）；",
      "  2. 对每一条，指出你这一轮里【具体哪一步】做到了它，或者承认没做到；",
      "  3. 没做到的那几条，就是接下来要做的全部内容 —— 别的先放着。",
      "",
      "他的原话，两次，逐字：",
    ].join("\n"),
  };
}
