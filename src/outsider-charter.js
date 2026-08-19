/*
 * SESSION CHARTER — the strategic half of supervision.
 *
 * 打地鼠 catches an agent stuck on one error for twenty minutes. It cannot catch
 * the thing that actually ruins an overnight run: the architecture bending a
 * degree at a time, a branch that made sense at 1am and owns the whole session by
 * 4am, the original brief decaying out of the context window while every
 * individual step still looks reasonable. Nothing in this system represented the
 * goal, so nothing could notice work drifting away from it.
 *
 * THE MOVE: Outsider does not need to UNDERSTAND the objective. It needs the agent
 * to COMMIT to one, and then reconciles the trajectory against that commitment.
 *
 * This is not a new mechanism. The highest-confidence signal in the whole product
 * (0.95) is "the agent said the tests pass, the trace says they were red" — a
 * said-vs-did reconciliation. The charter runs the same machine on a different
 * claim: not "did the tests pass" but "are you still doing what you said you were
 * doing". Deterministic, local, no model, no semantics.
 *
 * HOW IT ARRIVES: the agent writes `.outsider/charter.json`. That Write is a tool
 * call, so the declaration comes in through the channel the hook already watches —
 * no new plumbing, and the commitment is a file the operator can read.
 *
 * WHAT IT MUST NEVER DO: deny for its own absence. A supervisor that refuses to
 * let work start until it is satisfied with the paperwork is a worse obstacle than
 * the drift it prevents. No charter ⇒ tactical supervision only, and SAY SO.
 */

export const CHARTER_PATH = ".outsider/charter.json";

/* ------------------------------------------------------------------ *
 * parsing and quality
 * ------------------------------------------------------------------ */

const RUNNER = /^\s*(?:\S*(?:npm|yarn|pnpm|bun|deno|node|python3?|pytest|tox|go|cargo|make|mvn|gradle|dotnet|swift|bash|sh|rake|composer|just|task)\b|\.\/)/i;

/*
 * Commands that cannot go red. Only the literal, obvious ones are listed, and
 * that limit is DISCLOSED rather than papered over: whether an arbitrary command
 * really checks anything is undecidable, so this catches the shapes an agent
 * reaches for first, not every possible no-op.
 */
const NO_OP = /^\s*(?:(?:ba|z|da)?sh\s+-c\s+['"]?\s*(?:true|:|exit\s+0)\s*['"]?|true|:|exit\s+0|echo\b[^|;&]*$|node\s+-e\s+['"]?\s*(?:0|''|""|)\s*['"]?)\s*$/i;

/*
 * A charter the agent can satisfy without changing anything is not a commitment,
 * it is a formality. Three fields carry the weight, and each has a shape test:
 *
 *   acceptance — must be a COMMAND, not prose. "all tests pass and the code is
 *                clean" cannot be reconciled against a trajectory; `npm test` can.
 *                This is the field an agent will most want to keep vague.
 *   scope      — must be concrete paths. "the backend" is not checkable.
 *   objective  — one sentence. Not checked semantically (see NOT_CHECKED).
 */
export function validateCharter(c) {
  const problems = [];
  if (!c || typeof c !== "object") return { ok: false, problems: ["没有 charter"] };
  const objective = String(c.objective ?? "").trim();
  const acceptance = String(c.acceptance ?? "").trim();
  const scope = Array.isArray(c.scope) ? c.scope.filter((s) => typeof s === "string" && s.trim()) : [];
  const outOfScope = Array.isArray(c.outOfScope) ? c.outOfScope.filter((s) => typeof s === "string" && s.trim()) : [];

  if (!objective) problems.push("objective 为空");
  else if (objective.length > 400) problems.push("objective 太长 —— 一句话，不是一段");

  if (!acceptance) problems.push("acceptance 为空");
  else if (!RUNNER.test(acceptance)) {
    problems.push(`acceptance 不是一条可执行命令: ${JSON.stringify(acceptance.slice(0, 60))}`
      + " —— 散文无法和轨迹对账，命令可以");
  } else if (/\band\b|、|，|；/.test(acceptance)) {
    problems.push("acceptance 像是把几件事塞进了一句话 —— 一条命令，它自己去串联");
  }

  /*
   * THE CHARTER IS SELF-REPORTED, so it is also the obvious way to escape being
   * held to anything. Found by auditing my own layer, not by using it:
   *
   *   scope: ["**"]          — nothing is ever out of scope, drift cannot fire
   *   acceptance: "sh -c true" — trivially green, the check checks nothing
   *
   * Neither needs an adversarial agent. A model asked to declare scope before it
   * knows what it will touch may reasonably write `**`, and that single line
   * silently disables the entire strategic layer.
   *
   * A scope that excludes nothing is not a scope. A command that cannot fail is
   * not an acceptance test.
   */
  if (!scope.length) problems.push("scope 为空 —— 至少给一个具体路径或 glob");
  else {
    const vague = scope.filter((s) => !/[/.*]/.test(s));
    if (vague.length) problems.push(`scope 里这些不是路径: ${vague.slice(0, 3).join(", ")}`);
    const universal = scope.filter((s) => /^[./]*(?:\*\*?(?:\/\*+)*|\/)$/.test(String(s).trim()));
    if (universal.length) {
      problems.push(`scope 里 ${universal.join(", ")} 匹配一切 —— 一个排除不了任何东西的 scope 不是 scope，`
        + "写下你真正打算改的目录");
    }
  }
  if (acceptance && NO_OP.test(acceptance)) {
    problems.push(`acceptance \`${acceptance}\` 不可能失败 —— 一条不会红的命令不是验收标准`);
  }
  return { ok: problems.length === 0, problems, charter: { objective, acceptance, scope, outOfScope } };
}

/* the latest charter this session declared, from disk or from the trajectory */
export function readCharter({ cwd = null, steps = [], readFile = null } = {}) {
  /* disk first: it survives the trajectory window, and the operator can read it */
  if (cwd && readFile) {
    try {
      const raw = readFile(`${String(cwd).replace(/\/+$/, "")}/${CHARTER_PATH}`);
      /* bounded: this is read on EVERY hook call, and an unbounded JSON.parse in
         the hot path is how a 250ms budget becomes a host timeout */
      if (raw && String(raw).length > 64 * 1024) {
        return { source: "disk", ok: false, charter: null,
          problems: [`${CHARTER_PATH} 超过 64KB —— charter 是一句承诺，不是一份文档`] };
      }
      if (raw) return { source: "disk", ...validateCharter(JSON.parse(raw)) };
    } catch { /* absent or unreadable — fall through */ }
  }
  /* else the Write that declared it, most recent wins (an explicit revision) */
  let found = null, revisions = 0;
  for (const s of steps) {
    if (!s?.charterBody) continue;
    revisions += 1;
    try { found = JSON.parse(s.charterBody); } catch { /* malformed declaration */ }
  }
  if (found) return { source: "trajectory", revisions, ...validateCharter(found) };
  return { source: null, ok: false, problems: ["没有 charter"], charter: null };
}

/* ------------------------------------------------------------------ *
 * scope matching
 * ------------------------------------------------------------------ */

/*
 * Scope matching — and a warning from having got it wrong once. This function
 * decides whether an edit counts as drift, so a bug here does not produce a
 * slightly-off number, it produces a supervisor that tells a correctly-working
 * agent it has wandered off.
 *
 * The first version anchored a trailing-slash directory as `.../src/(/|$)`,
 * which matches nothing real: with `scope: ["/repo/src/"]` EVERY edit read as
 * out of scope, and a clean overnight run drew a drift warning at 4am. Found by
 * simulating a whole night end to end, never by a unit test — the unit test used
 * the one pattern spelling that happened to work.
 */
const normPath = (p) => String(p ?? "").replace(/\\/g, "/").replace(/^\.\//, "");

/* `**` crosses segments, `*` does not. Replaced in ONE pass: the two-step
   version used a placeholder character, and the placeholder it used ended up as
   a literal NUL byte in the source, which makes grep skip the entire file. */
function globToRe(g) {
  const esc = normPath(g).replace(/[.+^${}()|[\]\\]/g, "\\$&");
  const body = esc.replace(/\*\*|\*/g, (m) => (m === "**" ? ".*" : "[^/]*"));
  return new RegExp(`^${body}$`, "i");
}

export function inScope(file, scope = []) {
  if (!file) return true;                       // nothing to judge
  const f = normPath(file);
  return scope.some((raw) => {
    const g = normPath(raw);
    if (!g) return false;
    /* a directory covers everything under it, spelled with or without the
       trailing slash, because both are what people actually write */
    if (!/[*?]/.test(g)) {
      const dir = g.endsWith("/") ? g : `${g}/`;
      if (f === g || f.startsWith(dir)) return true;
      /* a RELATIVE pattern has to match an absolute path, because the agent
         writes `test/` and the host reports `/repo/test/a.test.js`. Anchored at
         a segment boundary so `/repo/src/` never matches `/repo/srcx/a.js`. */
      if (!g.startsWith("/")) {
        if (f.includes(`/${dir}`)) return true;
        if (f.endsWith(`/${g}`)) return true;
      }
    }
    if (globToRe(g).test(f)) return true;
    /* a relative pattern must still match an absolute path: `src/*.js` covers
       `/repo/src/pool.js`, which is how an agent will spell its own scope */
    return globToRe(`**/${g.replace(/^\/+/, "")}`).test(f);
  });
}

/* ------------------------------------------------------------------ *
 * reconciliation
 * ------------------------------------------------------------------ */

const DEFAULTS = Object.freeze({
  /* how many recent edits to judge — one task's worth, not one night's */
  window: 20,
  /* sustained wandering, not a one-off: this many of the window outside scope … */
  outOfScopeCount: 5,
  /* … AND still outside right now. Coming back into scope clears it, in the same
     way a green test clears the mole: a drift that has been corrected is not a
     drift that is happening. */
  consecutiveNow: 3,
});

/*
 * assessCharterDrift — has the run wandered off what it committed to?
 *
 * Returns { detected, findings[], checked[], notChecked[] }.
 *
 * Every finding is reconciliation against something the AGENT said, which is why
 * this signal is allowed to speak firmly: it enforces the agent's own commitment,
 * not our opinion of its work.
 */
export function assessCharterDrift({ charter = null, steps = [], proposed = null, policy = {} } = {}) {
  const p = { ...DEFAULTS, ...policy };
  const findings = [];
  const checked = [];
  const notChecked = [
    "objective 的语义 —— 是否还在做同一件事，本层不做语义判断，只对账可数的承诺",
    "scope 之外的编辑是否合理 —— 只报告漂移，不判断对错",
    "acceptance 是否真的在检查什么 —— 一条命令会不会永远为真是不可判定的，只拒绝了明显的空转",
    "charter 本身是 agent 自报的 —— 它约束的是 agent 对自己的承诺，不是被独立验证过的事实",
  ];

  if (!charter) {
    return { detected: false, findings: [], checked: [],
      notChecked: ["整个 charter 层 —— 本次运行没有声明 charter，战略层监督不可用", ...notChecked] };
  }

  /* ---- 1. SCOPE DRIFT — the operationalisation of 架构做偏 / 长无关分支 ---- */
  if (charter.scope?.length) {
    checked.push("scope 漂移");
    /* the charter file itself is never out of scope: declaring and revising it
       is the mechanism, and counting it as drift would penalise the one act this
       layer is asking for */
    const isCharterFile = (f) => /(^|[/\\])\.outsider[/\\]charter\.json$/.test(String(f));
    const edits = steps.filter((s) => s.isEdit && s.file && !isCharterFile(s.file));
    const recent = edits.slice(-p.window);
    const outside = recent.filter((s) => !inScope(s.file, charter.scope));
    const tail = edits.slice(-p.consecutiveNow);
    const stillOutside = tail.length >= p.consecutiveNow
      && tail.every((s) => !inScope(s.file, charter.scope));
    if (outside.length >= p.outOfScopeCount && stillOutside) {
      const files = [...new Set(outside.map((s) => s.file))];
      findings.push({
        kind: "scope-drift",
        confidence: 0.85,
        /* SELF_REPORTED_NEVER_TRAINS: the charter is the agent's own word. It is
           strong enough to hold the agent to, and must never be recorded as a
           verified fact about the run. */
        provenance: "self-reported",
        detail: `最近 ${recent.length} 次编辑里有 ${outside.length} 次落在你声明的 scope 之外，`
          + `而且最近 ${p.consecutiveNow} 次全在外面`,
        files: files.slice(0, 8),
        corrective: [
          `outsider: 你在 charter 里声明的 scope 是 ${charter.scope.join(", ")}。`,
          `最近 ${recent.length} 次编辑有 ${outside.length} 次不在里面，最近 ${p.consecutiveNow} 次全都不在：`,
          `  ${files.slice(0, 6).join(", ")}`,
          "",
          "二选一，现在就选：",
          `  1. 回到 scope 里 —— 如果这些编辑是为了 "${String(charter.objective).slice(0, 90)}" 的旁支，先停下，`,
          "     把它记下来，做完主线再回来",
          `  2. 改 charter —— 如果 scope 真的该扩大，把 ${CHARTER_PATH} 改掉并说明为什么`,
          "",
          "第 2 条是完全正当的，一个长任务的 scope 本来就会变。不正当的是不声明地漂出去：",
          "修订过的约束不是被遗忘的约束，悄悄扩大的 scope 是。",
        ].join("\n"),
      });
    }
  }

  /* ---- 2. ACCEPTANCE — 糊弄 的可数形态 ---- */
  if (charter.acceptance) {
    checked.push("acceptance 是否真的跑过并且是绿的");
    const norm = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
    const acc = norm(charter.acceptance);
    /* the declared command, or something that clearly contains it */
    const runs = steps.filter((s) => s.actionKind === "shell" && norm(s.action).includes(acc));
    const readable = runs.filter((s) => s.exit != null);
    const finishing = proposed?.isSubmit === true;
    if (finishing) {
      if (!runs.length) {
        findings.push({ kind: "acceptance-never-ran", provenance: "self-reported", confidence: 0.9,
          detail: `你声明的验收命令 \`${acc}\` 整场一次都没跑过`,
          corrective: `outsider: 你在 charter 里把 \`${acc}\` 定为验收标准，这次运行从没执行过它。`
            + `\n收尾之前跑一次。做完了表层要求而没跑过自己定的验收，就是糊弄的定义。` });
      } else if (!readable.length) {
        findings.push({ kind: "acceptance-unreadable", provenance: "self-reported", confidence: 0.7,
          detail: `\`${acc}\` 跑过 ${runs.length} 次，但一次结果都读不出来`,
          corrective: `outsider: \`${acc}\` 跑过，但输出里读不出结果 —— 多半是被管道过滤掉了。`
            + `\n收尾前不带管道地跑一次，让结果可读。读不出的测试不算跑过。` });
      } else if (readable[readable.length - 1].exit !== 0) {
        findings.push({ kind: "acceptance-red", provenance: "self-reported", confidence: 0.95,
          detail: `\`${acc}\` 最后一次是红的`,
          corrective: `outsider: 你自己定的验收命令 \`${acc}\` 最后一次运行是失败的。`
            + `\n这不是我的标准，是你在 charter 里写下的那条。` });
      } else {
        /*
         * A PASS THAT PREDATES THE LAST EDIT IS STALE — the same "one test
         * disarms the gate" defect the supervisor already fixed for its own
         * green check, reappearing here because this layer was written later.
         * Simulating a night caught it: acceptance went green at 04:00, the
         * agent edited again at 06:00, and declared done.
         */
        const lastAccIdx = steps.lastIndexOf(readable[readable.length - 1]);
        const lastEditIdx = steps.findLastIndex((s) => s.isEdit);
        if (lastEditIdx > lastAccIdx) {
          findings.push({ kind: "acceptance-stale", provenance: "self-reported", confidence: 0.85,
            detail: `\`${acc}\` 上次是绿的，但那之后又改了代码`,
            corrective: `outsider: \`${acc}\` 上一次是绿的，但在那之后你又编辑了代码。`
              + `\n那次绿是对旧代码的。收尾前在当前代码上重跑一次。` });
        }
      }
    }
  }

  return { detected: findings.length > 0, findings, checked, notChecked };
}

/* ------------------------------------------------------------------ *
 * asking for one
 * ------------------------------------------------------------------ */

/*
 * Asked ONCE, before the first edit, and never again in that form. A request
 * repeated on every call is wallpaper, and the agent learns to scroll past the
 * channel we need it to read.
 */
export function charterRequest(problems = null) {
  const head = problems?.length
    ? [`outsider: ${CHARTER_PATH} 有这些问题，改掉再继续：`, ...problems.map((p) => `  · ${p}`), ""]
    : ["outsider: 这次运行还没有 charter。在第一次改代码之前，写一个。", ""];
  return [
    ...head,
    `写 ${CHARTER_PATH}：`,
    "```json",
    "{",
    '  "objective":  "一句话说清这次要交付什么",',
    '  "acceptance": "一条可执行命令，跑绿了就算做完（例：npm test）",',
    '  "scope":      ["你打算改的文件或目录，具体到路径"],',
    '  "outOfScope": ["明确不碰的东西（可选）"]',
    "}",
    "```",
    "",
    "为什么要这个：几小时之后，你和我都需要一个东西来回答\"现在做的事还是不是当初那件事\"。",
    "acceptance 必须是命令而不是描述 —— 描述没法和轨迹对账。scope 必须是路径而不是模块名。",
    "写完就继续干活，不用等我。scope 后面要改就改，明说就行。",
  ].join("\n");
}
