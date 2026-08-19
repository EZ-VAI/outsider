/*
 * 出厂验收 —— 监工在下班前验收，不合格打回去重做。工人不走，产线不停。
 *
 * WHY EVERYTHING BEFORE THIS MISSED THE PROMISE
 * =============================================
 * The operator's ask, in his words: Outsider "确保……完整的交付出一个没有以上问题
 * 的 work output" — a GUARANTEED CLEAN DELIVERABLE, unattended, overnight.
 *
 * Every layer built so far nudges DURING the work: the loop stop, the ratchet,
 * the waste signals, the restored work order. Not one of them ever looks at the
 * thing being delivered. And the disease he described most vividly — 法拉利外壳
 * 配拖拉机发动机 — is invisible during the work by construction: every
 * requirement was touched, every step looked reasonable, and the shell is
 * beautiful. It is only visible AT DELIVERY, against the original ask.
 *
 * A factory with a foreman walking the floor and no final inspection ships
 * exactly that part.
 *
 * WHY IT IS NOT A BANNER
 * ======================
 * The operator killed the obvious alternative himself: a northstar.md, or a
 * periodic "remember the goal" injection, is a banner on the factory wall. The
 * worker reads it with the same judgement that is already contaminated — if it
 * could see it had drifted, it would not have drifted. A banner cannot catch
 * token waste, shallow work, or piled-up patches, because the worker does not
 * believe it is doing any of them.
 *
 * The supervisor's leverage is different in kind: IT HOLDS EVIDENCE THE WORKER
 * CANNOT SEE. The raw trajectory, the token ledger, the real exit codes, the
 * actual diff. Not a better opinion — facts about the worker that the worker has
 * no access to. So an inspection here never asks "do you think you're done"; it
 * states the gap between what was claimed and what the evidence shows.
 *
 * WHAT REPLACES "STOP"
 * ====================
 * A failed inspection must NOT end the run. "叫停就走人，那流水线不全面瘫痪了" —
 * so a failure returns a REWORK ORDER: the specific gap, the evidence for it, and
 * what to do next. The night ends when the inspection passes, not when the agent
 * decides it is finished.
 *
 * THE JUDGE IS PLUGGABLE, AND THE LOCAL ONE IS DELIBERATELY NARROW
 * ===============================================================
 * Three of the checks below are mechanical facts the worker cannot self-report:
 * the acceptance command's real result, whether the run ever tested, whether the
 * claimed work left any trace. The fourth — is this substance or is it a shell —
 * is semantic, and the local judge does not pretend to answer it. It says so, in
 * `notChecked`, and an optional external judge can be handed the same evidence
 * packet later. A gap this layer cannot see is reported as unseen, never as
 * absent.
 */

export const ACCEPTANCE_PATH = ".outsider/acceptance.json";

/* the moment the worker says the part is finished */
export function isDeliveryMoment(proposed, steps = []) {
  if (!proposed) return false;
  if (proposed.isSubmit) return true;
  /* a completion claim in the agent's own words, already parsed upstream */
  const last = steps[steps.length - 1];
  return Boolean(last?.report?.claimsDone);
}

const isTestFile = (f) => /(^|[/\\])(?:tests?|specs?)[/\\]|[._-](?:test|spec)\.\w+$|(?:^|[/\\])(?:test|spec)_/i
  .test(String(f ?? ""));

/*
 * 证据包 —— what the inspection is allowed to reason from. Assembled from things
 * the worker cannot edit: the operator's own turns, the run's own trajectory,
 * the host's own token ledger.
 *
 * Structural only. No source text leaves this object, because it is also the
 * thing an external judge would be handed, and the moment that judge exists the
 * packet becomes the privacy boundary.
 */
export function evidencePacket({ operatorTurns = [], steps = [], charter = null,
  usage = null, boundaries = [] } = {}) {
  const edits = steps.filter((s) => s.isEdit);
  const tests = steps.filter((s) => s.isTest && s.exit != null);
  const lastTest = tests[tests.length - 1] ?? null;
  const touched = [...new Set(edits.map((s) => s.file).filter(Boolean))];

  return {
    /* what was asked, verbatim, by the person — not the agent's restatement */
    asked: operatorTurns.slice(-4).map((t) => String(t.text ?? "").replace(/\s+/g, " ").slice(0, 600)),
    charter: charter ? { objective: charter.objective ?? null,
      acceptance: charter.acceptance ?? null, scope: charter.scope ?? null } : null,
    /* what actually happened */
    steps: steps.length,
    edits: edits.length,
    filesTouched: touched.slice(0, 40),
    sourceFilesTouched: touched.filter((f) => !isTestFile(f)).length,
    testFilesTouched: touched.filter(isTestFile).length,
    tests: tests.length,
    lastTest: lastTest ? { action: String(lastTest.action ?? "").slice(0, 200),
      exit: lastTest.exit,
      /* LOCAL ONLY — the same rule the trajectory follows: the runner's text
         never leaves the machine, but it must reach the worker */
      observation: String(lastTest.observation ?? "").slice(-600) } : null,
    greenAtEnd: Boolean(lastTest && lastTest.exit === 0
      && steps.lastIndexOf(lastTest) > steps.findLastIndex((s) => s.isEdit)),
    /* what it cost — a fact the worker has no access to */
    tokens: usage ? { generated: usage.out ?? null, cacheRead: usage.cacheRead ?? null } : null,
    compactions: boundaries.length,
  };
}

/*
 * The local judge. Every finding is a fact the worker could not have checked
 * about itself, stated as a gap between the claim and the evidence.
 */
export function inspectLocally(packet) {
  const gaps = [];
  const checked = [
    "验收命令最后一次真实退出码（不是 agent 的复述）",
    "这一轮到底有没有跑过测试",
    "声称完成之后，源文件有没有实际改动",
    "改动是否只落在测试文件上",
  ];
  const notChecked = [
    "做得深不深 —— 表面 requirements 都碰到了、内里是不是拖拉机发动机，"
    + "本层看不出来。这是语义判断，需要一次干净上下文的外部检验，此处不假装。",
    "架构是否偏离了最初的意图 —— 只有本轮引入的结构性变化能数，意图不能。",
  ];

  if (!packet.tests) {
    gaps.push({ kind: "never-ran-a-test", severity: "block",
      says: "这份交付被声明完成", shows: `整轮 ${packet.steps} 步里一次测试都没跑过`,
      rework: "先跑一次项目的测试命令，把结果贴出来，再谈完成。" });
  } else if (packet.lastTest && packet.lastTest.exit !== 0) {
    /*
     * CARRY THE REAL OUTPUT. A rework order that says "it is red" is a category;
     * one that quotes the runner's own words is a lead. The flagship case this
     * product was built around is exactly this moment, and what made it work was
     * never the wording — it was that the failing text reached the model.
     */
    const tail = String(packet.lastTest.observation ?? "").replace(/\s+/g, " ").trim().slice(0, 300);
    gaps.push({ kind: "red-at-delivery", severity: "block",
      says: "这份交付被声明完成",
      shows: `最后一次测试是红的（${packet.lastTest.action}，exit ${packet.lastTest.exit}）`
        + (tail ? `\n  运行器原话：${tail}` : ""),
      rework: "把这个失败修到绿，再交付。失败的原文在上面，没有的话故障单里有。" });
  } else if (!packet.greenAtEnd) {
    gaps.push({ kind: "stale-green", severity: "block",
      says: "测试是绿的",
      shows: "最后一次绿灯发生在最后一次编辑之前 —— 改完之后没有再验证过",
      rework: "重跑一次测试。绿灯必须在最后一次改动之后。" });
  }

  if (packet.edits === 0) {
    gaps.push({ kind: "nothing-changed", severity: "block",
      says: "工作已完成", shows: "这一轮没有任何文件被改动",
      rework: "如果确实无需改动，说明理由；否则这份交付是空的。" });
  } else if (packet.sourceFilesTouched === 0 && packet.testFilesTouched > 0) {
    gaps.push({ kind: "tests-only", severity: "block",
      says: "功能已实现",
      shows: `只有 ${packet.testFilesTouched} 个测试文件被改，源文件一个都没动`,
      rework: "让测试通过的办法不是改测试。回到源文件。" });
  }

  return { gaps, checked, notChecked, passed: gaps.filter((g) => g.severity === "block").length === 0 };
}

/*
 * 返工单 —— what goes back to the worker. Never "stop"; always "here is the gap,
 * here is the evidence, here is the next move."
 */
export function reworkOrder(result, packet) {
  if (!result || result.passed) return null;
  const lines = [
    "【出厂验收未通过】这一轮还不能算交付完成。以下每一条都是证据，不是意见：",
    "",
  ];
  for (const g of result.gaps) {
    lines.push(`· 你的说法：${g.says}`);
    lines.push(`  证据显示：${g.shows}`);
    lines.push(`  下一步：${g.rework}`);
    lines.push("");
  }
  if (packet.asked?.length) {
    lines.push("操作方最初的原话（逐字，不是我的转述）：");
    for (const a of packet.asked.slice(-2)) lines.push(`  「${a.slice(0, 300)}」`);
    lines.push("");
  }
  /*
   * WHAT THE NIGHT HAS COST SO FAR — a fact the worker has no access to, and the
   * headline number of the operator's complaint (消耗非常多 tokens).
   *
   * It rides on the rework order specifically, not on a clean delivery: this is
   * the moment the run is about to get LONGER, and the only honest way to send
   * an agent back is to let it see the meter. Measured on a real 1187-step
   * session, a single step costs ~515k tokens once the context is re-read, so
   * "one more lap" is never free and the number says so.
   *
   * Deliberately NOT dressed up as a budget or a limit. Outsider prices; it does
   * not ration. The operator decides what a night is worth.
   */
  if (packet.tokens && (packet.tokens.generated || packet.tokens.cacheRead)) {
    const g = Number(packet.tokens.generated ?? 0);
    const cr = Number(packet.tokens.cacheRead ?? 0);
    const perStep = packet.steps ? Math.round((g + cr) / packet.steps) : null;
    lines.push(`这一轮到这里为止：${packet.steps} 步，生成 ${g.toLocaleString()} token，`
      + `重读上下文 ${cr.toLocaleString()} token`
      + (perStep ? `（平均每多跑一步约 ${perStep.toLocaleString()}）` : "")
      + (packet.compactions ? `，被压缩过 ${packet.compactions} 次` : "") + "。");
    lines.push("");
  }
  lines.push("继续做，不要停。改完之后再声明完成，我会再验一次。");
  if (result.notChecked?.length) {
    lines.push("");
    lines.push(`（本层没检查的：${result.notChecked[0].slice(0, 80)}…）`);
  }
  return lines.join("\n");
}

/*
 * The whole layer, in one call. Returns null when this is not a delivery moment
 * — the common case, and deliberately not an object, so a caller cannot render
 * an inspection that never happened.
 */
export function assessDelivery({ proposed, steps = [], operatorTurns = [],
  charter = null, usage = null, boundaries = [], judge = inspectLocally } = {}) {
  if (!isDeliveryMoment(proposed, steps)) return null;
  const packet = evidencePacket({ operatorTurns, steps, charter, usage, boundaries });
  let result = null;
  try { result = judge(packet); } catch { result = inspectLocally(packet); }
  if (!result || result.passed) {
    return { packet, result, passed: true, order: null };
  }
  return { packet, result, passed: false, order: reworkOrder(result, packet) };
}

/* ------------------------------------------------------------------ *
 * 外部检验 —— 同一个模型，全新的上下文，只给证据
 * ------------------------------------------------------------------ *
 * The one disease the local judge declares it cannot see — 表面 requirements 都
 * 做了，内里是拖拉机发动机 — is semantic. No count of commands or branches
 * reaches it.
 *
 * The answer is not a smarter judge. It is an UNCONTAMINATED one. The operator's
 * own diagnosis: the agent is not stupid, it is trapped in its own context. So
 * the inspector is the same model with none of that context — no three hours of
 * sunk cost, no "I have been doing it this way", no compressed self-serving
 * memory. It sees the operator's original words, what actually changed, and the
 * real exit code. What it cannot see is exactly what made the worker ill.
 *
 * FOUR RULES, EACH LOAD-BEARING
 * =============================
 * 1. OFF BY DEFAULT, AND THE OPERATOR NAMES THE COMMAND. Nothing here hardcodes
 *    a vendor or a model. `OUTSIDER_JUDGE="claude -p"` — their command, their
 *    credentials, their choice. A supervisor that phones home by default is not
 *    a supervisor.
 * 2. ONCE PER DELIVERY, NOT PER INCIDENT. The operator's objection to per-problem
 *    calls was correct. Measured on this session: ~5k in / 500 out against 1.1M
 *    generated is ~0.5%, and only at the moment it decides whether a night's work
 *    ships.
 * 3. STRUCTURAL PACKET ONLY. The same object the local judge reads: paths, counts,
 *    exit codes, the operator's own words. No source, no diffs, no traceback
 *    bodies. It is inspectable before it is ever sent — see the preview tool.
 * 4. OFF THE HOT PATH. A model call is seconds; the hook's budget is
 *    milliseconds. It goes to the bench like every other slow inspection.
 */

export const JUDGE_PROMPT = `你是一个从未参与这项工作的检验员。下面是一份交付的证据包：
操作方最初的要求（逐字）、这一轮实际改了什么、以及验收命令的真实结果。

只回答一个问题：**这份交付真的做到了要求的东西，还是只做到了字面？**

判据：
- 要求里的每一项，是被真正实现了，还是只被"碰到"了（加了个空函数、改了个测试、写了个 TODO）？
- 有没有把要求理解成了最省事的那个读法？
- 如果这是一个法拉利的外壳配拖拉机的发动机，指出发动机在哪。

只输出 JSON，不要别的：
{"passed": true|false, "gaps": [{"says":"它声称什么","shows":"证据显示什么","rework":"下一步该做什么"}]}

三种结论，选一种，别混：
· 看得出来、而且做到了 → {"passed": true, "gaps": []}
· 看得出来、没做到     → {"passed": false, "gaps": [...]}
· 看不出来             → {"passed": false, "gaps": [], "insufficient": "缺什么"}
「看不出来」不是「没问题」，也不是「有问题」—— 它是第三种，会被记成「本次没有检查」，
不会算成你指出的缺陷。所以不用担心冤枉一份正确的交付：说不知道就写 insufficient。`;

/*
 * 出境前的删减 —— WHAT THE PACKET LOSES ON ITS WAY OUT.
 *
 * FOUND BY RUNNING THE PREVIEW, WHICH IS THE ENTIRE REASON THE PREVIEW EXISTS.
 * The packet is shared by two readers with opposite rules. The LOCAL judge is
 * allowed everything, and needs it: the flagship intervention in this product
 * works precisely because the runner's failing text reaches the model. The
 * EXTERNAL judge is the one thing in Outsider that leaves the machine, and rule
 * 3 says structural only — no source, no diffs, no traceback bodies.
 *
 * One object served both, so `lastTest.observation` (the runner's raw stdout)
 * and `lastTest.action` (the full command — on this repo's own session, a
 * heredoc containing an entire test file) were about to be piped out. The file
 * asserted the opposite two comments above the leak. A boundary stated in a
 * comment is not a boundary; this function is.
 *
 * What still crosses, deliberately: the operator's own words and the paths.
 * Without the ask there is no way to judge whether the ask was met — that IS the
 * inspection. The operator opts into that by naming the command, and sees this
 * exact text in the preview before anything is ever sent.
 */
export function redactForJudge(packet) {
  if (!packet) return packet;
  const out = { ...packet };
  if (packet.lastTest) {
    out.lastTest = {
      /* the command's HEAD only: enough to name the acceptance command, never
         enough to carry a heredoc body or an inlined script */
      command: String(packet.lastTest.action ?? "").split("\n")[0].trim().slice(0, 120),
      exit: packet.lastTest.exit,
      /* the runner's own text stays home. The external judge is asked whether
         the work is deep, not to debug a failure — and a traceback body is
         exactly the payload rule 3 exists to keep on the machine. */
      output: "（运行器原文不出境；本地那一层看得到）",
    };
  }
  return out;
}

/*
 * THE EXACT BYTES. One function, used by the runner and by the preview tool, so
 * "here is what would be sent" cannot drift from what is sent. A preview built
 * from a second code path is a promise, not a guarantee.
 */
export function judgeStdin(packet) {
  return `${JUDGE_PROMPT}\n\n────── 证据包 ──────\n`
    + `${JSON.stringify(redactForJudge(packet), null, 2)}\n`;
}

/* what would be sent, so it can be read before anything is ever sent */
export function judgePayload(packet) {
  return { prompt: JUDGE_PROMPT, evidence: packet, stdin: judgeStdin(packet) };
}

/*
 * The card's key. A verdict describes ONE state of the deliverable; the moment
 * the run edits again or the suite flips colour it describes something else, and
 * a card that outlived its state is worse than no card. Cheap and structural on
 * purpose — the packet's own contents are the state.
 */
export function judgeKey(packet) {
  if (!packet) return "judge:0";
  let h = 2166136261;
  const s = `${packet.steps}|${packet.edits}|${packet.tests}|${packet.lastTest?.exit ?? "x"}`
    + `|${packet.greenAtEnd}|${(packet.filesTouched ?? []).join(",")}`;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i); h = Math.imul(h, 16777619);
  }
  return `judge:${(h >>> 0).toString(36)}`;
}

/*
 * The child that walks over. Kept as a string for the same reason the fault
 * card's is: the shipped bundle carries no extra entry point, and the operator
 * can read exactly what will run on their machine.
 */
export const JUDGE_RUNNER = `
const { execSync } = require("node:child_process");
const { writeFileSync, mkdirSync, readFileSync } = require("node:fs");
const [cwd, key, outPath, cmd, packetPath] = process.argv.slice(-5);
let verdict = null, error = null;
try {
  const payload = readFileSync(packetPath, "utf8");
  const out = execSync(cmd, { cwd, input: payload, encoding: "utf8",
    timeout: 180000, maxBuffer: 2 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] });
  /*
   * THE MODEL WILL NOT ALWAYS RETURN BARE JSON, and a supervisor that treats
   * "wrapped in a code fence" as "unreachable judge" throws away the answer it
   * paid for. Strip fences, then try the widest object, then narrow: the first
   * candidate that parses AND carries a \`passed\` field wins.
   */
  const text = String(out).replace(/\`\`\`(?:json)?/g, " ");
  const starts = []; for (let i = 0; i < text.length; i += 1) if (text[i] === "{") starts.push(i);
  const ends = []; for (let i = text.length - 1; i >= 0; i -= 1) if (text[i] === "}") ends.push(i);
  outer: for (const s of starts.slice(0, 40)) {
    for (const e of ends.slice(0, 40)) {
      if (e <= s) continue;
      try {
        const v = JSON.parse(text.slice(s, e + 1));
        if (v && typeof v === "object" && "passed" in v) { verdict = v; break outer; }
      } catch (err) { /* try the next pair */ }
    }
  }
  if (!verdict) error = "检验员没有返回可解析的 JSON（前 200 字：" + text.trim().slice(0, 200) + "）";
} catch (e) { error = String((e && e.message) || e).slice(0, 300); }
try {
  mkdirSync(cwd + "/.outsider", { recursive: true });
  /* AN UNREACHABLE JUDGE NEVER BLOCKS A DELIVERY. It reports that it could not
     look, which the reader can tell apart from "it looked and found nothing". */
  writeFileSync(outPath, JSON.stringify({ key, at: Date.now(), verdict, error }));
} catch (e) { /* best effort */ }
`;

/*
 * Fold an external verdict into a local result. The external judge can only ADD
 * gaps, never clear one: a local finding is a mechanical fact (the suite is red,
 * nothing changed) and no opinion overrides a fact.
 */
export function mergeVerdict(local, external) {
  if (!external || external.error || !external.verdict) {
    return { ...local,
      notChecked: [...(local.notChecked ?? []),
        external?.error
          ? `外部检验没跑成：${String(external.error).slice(0, 120)} —— 这一项本次没有检查`
          : "外部检验未启用 —— 「做得深不深」本次没有检查"] };
  }
  const v = external.verdict;
  const extra = Array.isArray(v.gaps) ? v.gaps.map((g) => ({
    kind: "shallow-work", severity: "block", says: String(g.says ?? "").slice(0, 200),
    shows: String(g.shows ?? "").slice(0, 400), rework: String(g.rework ?? "").slice(0, 400),
    source: "external-judge" })) : [];
  const gaps = [...local.gaps, ...extra];
  /*
   * ── 「看不出来」不是「没问题」 ──────────────────────────────────────────
   *
   * An external reviewer read the judge prompt and found it instructing the
   * inspector to return `passed: true` when the evidence was insufficient. So
   * the one check that exists specifically for 法拉利外壳配拖拉机发动机 failed
   * OPEN: hand it a thin packet and it certifies the delivery. The whole layer
   * was written around the principle that a gap it cannot see is reported as
   * unseen and never as absent — and then the prompt said the opposite.
   *
   * Fixed in the prompt, and enforced here too, because a prompt is a request
   * and this is a rule: an inspector that says it could not tell has NOT passed
   * the delivery. `checked` also loses the claim, since nothing was checked.
   */
  const blind = Boolean(v.insufficient);
  return { ...local, gaps,
    passed: !blind && gaps.filter((g) => g.severity === "block").length === 0,
    checked: blind ? (local.checked ?? [])
      : [...(local.checked ?? []), "做得深不深（外部检验员，干净上下文）"],
    notChecked: blind
      ? [...(local.notChecked ?? []), `外部检验员说证据不够，无法判断：${String(v.insufficient).slice(0, 160)}`]
      : (local.notChecked ?? []).filter((x) => !/做得深不深/.test(x)) };
}

/* ------------------------------------------------------------------ *
 * 把外部检验接到质检台上
 * ------------------------------------------------------------------ *
 * A model call takes seconds; the hook's budget is milliseconds. So the judge
 * goes to the same bench as the architecture sweep: a detached child does the
 * work, drops a keyed card, and a LATER hook call reads it.
 *
 * But a delivery is the one moment where "read it later" is not free. Every
 * other bench informs the NEXT edit, which has not happened yet. This one
 * decides whether the night ends. So when the local inspection passes and the
 * verdict is not back, the delivery is HELD — not denied, not stopped: the
 * worker is told the inspector is walking over and to keep going for one more
 * call. 叫停就走人 is exactly what this must not do.
 *
 * AND THE HOLD MUST TERMINATE. A judge command that hangs, dies, or is
 * misconfigured would otherwise hold a correct delivery forever — a supervisor
 * that can deadlock a night is worse than no supervisor. Two attempts, then the
 * layer declares it could not look and gets out of the way. "Could not look" is
 * reported as such, never as "looked and found nothing".
 */
export const JUDGE_CARD = "judgecard";
export const JUDGE_PACKET_FILE = ".outsider/judge-packet.txt";
export const JUDGE_MAX_TRIES = 2;
/* the child's own execSync timeout is 180s; the card must outlive it */
export const JUDGE_PENDING_TTL_MS = 240 * 1000;

export function judgeDelivery({ delivery, cwd, cmd, readFile, readProbe, requestProbe,
  writeFile, spawnFn, now = Date.now } = {}) {
  if (!delivery) return delivery;
  /*
   * `why` is carried on `external`, not recovered by grepping `notChecked`. The
   * first version did the latter and matched the LOCAL line about 语义判断 —
   * which also contains the words 外部检验 — so a broken judge reported the
   * local disclaimer as its own error message. A reason that has to be parsed
   * back out of prose is a reason that will eventually be parsed back wrong.
   */
  const off = (why) => ({ ...delivery,
    result: mergeVerdict(delivery.result, why ? { error: why } : null),
    external: { state: why ? "failed" : "off", why: why ?? null } });
  if (!cwd || !cmd || !readFile || !readProbe || !requestProbe || !spawnFn) return off(null);

  const key = judgeKey(delivery.packet);
  const at = now();
  const card = readProbe({ cwd, name: JUDGE_CARD, key, readFile,
    now: at, pendingTtlMs: JUDGE_PENDING_TTL_MS });
  /* the same card ignoring the pending clock, purely to recover the try count */
  const raw = readProbe({ cwd, name: JUDGE_CARD, key, readFile,
    now: at, pendingTtlMs: Number.MAX_SAFE_INTEGER });
  const tries = Number(raw?.tries ?? 0) || 0;

  if (card && !card.pending) {
    const result = mergeVerdict(delivery.result, card);
    return { ...delivery, result, passed: result.passed,
      order: result.passed ? null : reworkOrder(result, delivery.packet),
      external: { state: card.error ? "failed" : "verdict",
        why: card.error ?? null, tries } };
  }
  if (card && card.pending) return held(delivery, tries, "在跑");
  if (tries >= JUDGE_MAX_TRIES) {
    return off(`外部检验连续 ${tries} 次没有返回结果 —— 这一项本次没有检查`);
  }

  /*
   * Hand the child a FILE, not an argv string. The packet carries the operator's
   * own words; putting those on a command line puts them in every `ps` on the
   * machine and through a shell's quoting rules on the way.
   */
  let sent = false;
  try {
    const p = `${String(cwd).replace(/\/+$/, "")}/${JUDGE_PACKET_FILE}`;
    writeFile(p, judgeStdin(delivery.packet));
    sent = requestProbe({ cwd, name: JUDGE_CARD, key, runner: JUDGE_RUNNER,
      args: [String(cmd), p], meta: { tries: tries + 1 }, spawnFn, now });
  } catch { sent = false; }
  if (!sent) return off("外部检验没能启动 —— 这一项本次没有检查");
  return held(delivery, tries + 1, "刚被叫过来");
}

function held(delivery, tries, phase) {
  /*
   * A HOLD IS NOT A FAILURE, AND IT MUST BE SPENDABLE. The worker is told what
   * is happening, that it is bounded, and what to do with the interval — an
   * agent handed "wait" with nothing to do burns the wait on inventing work.
   */
  const hold = [
    `【出厂验收·外部检验${phase === "在跑" ? "进行中" : "已发出"}】本地那几项已经过了，`
      + `但"做得深不深"要一次干净上下文的检验员来看，它${phase}（一次调用，通常几十秒）。`,
    "",
    "别收工。下一次工具调用时我会把它的结论给你：",
    "· 通过 → 这份交付就算完成，我不会再拦。",
    "· 不通过 → 你会拿到具体的差距和下一步。",
    "",
    "这段时间可以做的：把这一轮改动的地方对着操作方最初的要求自己再走一遍，"
      + "尤其是那些「改完就没再验证过」的地方。",
    `（最多等 ${JUDGE_MAX_TRIES} 次；检验员叫不动的话我会说出来，不会把你卡在这里。）`,
  ].join("\n");
  return { ...delivery, passed: delivery.passed, hold,
    external: { state: "pending", tries } };
}
