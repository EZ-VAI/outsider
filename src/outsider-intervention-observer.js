export function escalation(open, judged) {
  if (!open || judged?.verdict !== "unmet") return null;   /* unknown 永不升级 */
  const next = (open.attempt ?? 1) + 1;
  if (next > MAX_ATTEMPT) {
    return { done: true, attempt: open.attempt ?? 1, enforce: false, kind: open.kind, next: null,
      note: `outsider：同一条我已经跟了 ${MAX_ATTEMPT} 轮，不再跟了。`
        + `「${open.expect}」始终没有出现 —— 这一条记在这次交付上，它没有消失。` };
  }
  return {
    done: false, attempt: next, kind: open.kind,
    /* 第二轮开始，这条判据从提醒升级成拒绝 —— 但只对同一 kind 的动作 */
    enforce: next >= 2,
    /*
     * ── 下一轮必须被写回，否则它只活在这一次 hook 调用的内存里 ────────────
     * The first version computed attempt 2, immediately wrote the state to
     * RESOLVED, and then refused to register anything new because this call had
     * already settled. So attempt 2 never survived to the next process, attempt
     * 3 was unreachable, and MAX_ATTEMPT was a policy that existed only in the
     * comment. The next state is returned here so the caller persists it.
     */
    next: { ...open, state: "ESCALATED", attempt: next, enforce: next >= 2, anchorUid: null },
    note: [
      `outsider：${judged.steps} 步之前我说过「${open.expect}」，到现在没有出现。`,
      "",
      "先别继续往前做。按顺序回答两个问题，再动手：",
      "  1. 上一条为什么没做？是我说错了、还是它在你的计划里被排到后面去了？",
      "  2. 如果是我说错了，说清楚哪里错了 —— 我就撤回。",
      next >= 2 ? `\n在「${open.expect}」出现之前，同一类的动作我会拦下来。` : "",
    ].filter(Boolean).join("\n"),
  };
}

/*
 * 干预观察器 —— 说完之后，回来看轨迹里有没有出现约定的那个动作。
 *
 * 这个文件叫这个名字，是因为这就是它做的事。
 * =========================================
 * 上一版叫 outsider-control.js，头部画着
 *     RUNNING → PAUSE_REQUESTED → QUIESCED → CORRECTING → RESOLVED / ESCALATE
 * 而实现里只有 CORRECTING 和 RESOLVED —— 另外三个状态只存在于注释。一个外部审查
 * 搜了整个实现，指出这是「注释里的架构已经完成，运行时只有外壳」，也就是这个产品
 * 存在的理由本身：法拉利外壳配拖拉机发动机。
 *
 * 名字改回它实际做的事，而且在它变成别的东西之前不会改回去。**一个诚实的名字是
 * 最便宜的架构约束**：叫观察器，就不会有人以为闭环已经合上了。
 *
 * 它做什么：每一条干预在说出口的同一刻登记一条可证伪的期望，之后对着轨迹判它有
 * 没有出现。它不做什么：不重新诊断、不改计划、不重新分配任务。`unmet` 时它会
 * 提高剂量并要求重新诊断，但做出新计划的仍然是 agent，不是它。
 *
 * met ≠ 有效
 * =========
 * 本仓库的 outsider-compliance.js 早就写清楚过：合规和效果是两个问题，听话但没
 * 效果同样是失败。这里的谓词大多是机械动作（有没有一次编辑、有没有一次绿灯），
 * 所以 `met` 只能证明「后续轨迹里出现了约定的那个动作」，不能证明根因被修了、
 * 架构回正了、或者操作方要的东西真的做到了。每一处都按这个强度陈述。
 */

export const OBSERVER_DIR = ".outsider/observer";
export const LEDGER_PATH = ".outsider/interventions.jsonl";

/*
 * ── unmet 之后加什么剂量 ────────────────────────────────────────────────
 *
 * "12 步之前我说过 X，到现在没有发生" and nothing else is not an escalation; it
 * is the same sentence a second time, which is how a warning becomes wallpaper.
 *
 * This raises the DOSE using mechanisms that already exist — no new detector,
 * which is the rule for this round:
 *
 *   attempt 1  说一句（warn）
 *   attempt 2  要求先诊断再动手，并且把同一条判据升级成拒绝：下一次触发这条
 *              判据的动作会被 deny，理由就是这条没兑现的纠正
 *   attempt 3  停止升级，记在案上，放行 —— 一个能把运行永久钉住的监工比漏掉
 *              一个缺陷更坏，这条规矩在这个仓库里已经付过三次学费
 *
 * 重新诊断由 agent 做，不是由这里做。它没有能力做出新计划，也不假装有。
 */
export const MAX_ATTEMPT = 3;

export const OBSERVE_STEPS = 12;

/*
 * ── 可证伪的期望 ──────────────────────────────────────────────────────────
 *
 * One predicate per kind of intervention, each stated so that it CANNOT be
 * satisfied by the agent merely saying something. Every one of them is checked
 * against the trajectory, not against the agent's report — that asymmetry is the
 * whole product, and it applies to judging our own corrections too.
 */
export const EXPECTATIONS = {
  /* 出厂验收：改完之后要有一次绿灯落在最后一次编辑之后 */
  "stale-green": { need: "green-after-edit",
    say: "重跑测试，并且绿灯要落在最后一次改动之后" },
  "red-at-delivery": { need: "green-after-edit", say: "把失败修到绿" },
  "never-ran-a-test": { need: "test-ran", say: "跑一次测试" },
  "nothing-changed": { need: "any-edit", say: "做出实质改动" },
  "tests-only": { need: "source-edit", say: "回到源文件，不要靠改测试" },
  /* 打地鼠：下一次编辑要落在出错的那条路径上 */
  "whack-a-mole": { need: "edit-on-path", say: "改到失败真正来自的那个文件" },
  /* 巡检：把铺开的那一段验证掉 */
  "long-way-from-green": { need: "green-after-edit", say: "挑一块验证掉，先绿一次" },
  /* 零代价拒绝：不要再发同一条 */
  "rerun-without-edit": { need: "any-edit", say: "改一处再跑" },
  "repeat-unchanged": { need: "any-edit", say: "改一处，或换一条命令" },
  "reread-unchanged": { need: "no-repeat", say: "用已经读到的内容往下走" },
  /* 重复对齐：操作方说了两遍，接下来必须有实质动作 */
  realignment: { need: "source-edit", say: "对着原话逐条补上没做到的" },
};

/*
 * `expectationMet` — checked on the raw trajectory, never on anything the agent
 * says about itself.
 */
export function expectationMet(need, since = [], ctx = {}) {
  const edits = since.filter((s) => s.isEdit);
  const isTestFile = (f) => /(^|[/\\])(?:tests?|specs?)[/\\]|[._-](?:test|spec)\.\w+$/i.test(String(f ?? ""));
  switch (need) {
    case "any-edit": return edits.length > 0;
    case "source-edit": return edits.some((s) => s.file && !isTestFile(s.file));
    case "test-ran": return since.some((s) => s.isTest && s.exit != null);
    case "green-after-edit": {
      const lastEdit = since.findLastIndex((s) => s.isEdit);
      const green = since.findLastIndex((s) => s.isTest && s.exit === 0);
      return green >= 0 && green > lastEdit;
    }
    case "edit-on-path": {
      const want = (ctx.paths ?? []).map(String);
      if (!want.length) return edits.length > 0;
      return edits.some((s) => want.some((p) => String(s.file ?? "").includes(p)));
    }
    case "no-repeat": {
      const sig = String(ctx.signature ?? "");
      if (!sig) return true;
      return !since.some((s) => String(s.cmd ?? s.action ?? "").includes(sig)
        || String(s.file ?? "") === sig);
    }
    default: return false;
  }
}

const norm = (s) => String(s ?? "").replace(/\s+/g, " ").trim();

/*
 * `openCorrection` — the record an intervention leaves behind so that a LATER
 * hook call can judge it. Written the moment we speak, never later: a supervisor
 * that decides after the fact what it had meant is grading its own homework.
 */
export function openCorrection({ kind, anchorUid = null, paths = [], signature = null,
  attempt = 1, sessionId = null, origin = null, id = null } = {}) {
  const exp = EXPECTATIONS[kind];
  if (!exp) return null;
  return {
    state: "CORRECTING",
    id: id ?? `${kind}:${anchorUid ?? "0"}:${attempt}`,
    kind,
    attempt,
    sessionId, origin,
    need: exp.need,
    expect: exp.say,
    ctx: { paths: paths.slice(0, 6), signature: signature ? norm(signature).slice(0, 200) : null },
    /*
     * ── 锚点是一个步骤签名，不是一个下标 ──────────────────────────────────
     *
     * The first version stored `steps.length` and treated it as a monotonic
     * clock. The hook judges a SLIDING WINDOW of the last ~120 steps, so on any
     * run longer than the window that number stops advancing: `steps.slice(120)`
     * is forever `[]` and `steps.length < deadline` is forever true. An external
     * reviewer ran it and got `pending, observed 0` three times in a row.
     *
     * Which means the feature failed completely in EXACTLY the scenario it was
     * built for — a long unattended run — and passed every short test.
     *
     * A signature survives the window. If it is still visible, everything after
     * it is the observation. If it has scrolled out, then by definition every
     * step now visible happened after it, and the whole window is the
     * observation. Either way the count is real and the deadline is measured in
     * observed steps, not in absolute indices.
     */
    /*
     * 锚点是宿主给的唯一事件 id，不是内容签名。签名回答「两个动作是不是同一种」，
     * uid 回答「是哪一次、在什么位置」—— 只有后者能锚定时间线上的一个点。实测
     * 518 步里签名只有 510 个不同，碰撞的正是反复跑的那几条命令。
     */
    anchorUid: anchorUid ? String(anchorUid) : null,
    observe: OBSERVE_STEPS,
  };
}

/* what happened AFTER the correction — window-independent by construction */
export function sinceAnchor(open, steps = []) {
  if (!open?.anchorUid) return { since: steps, anchorLost: true };
  const i = steps.findIndex((s) => String(s?.uid ?? "") === open.anchorUid);
  /*
   * ANCHOR LOST IS NOT "NOT MET" — IT IS "COULD NOT OBSERVE".
   *
   * If the anchor has scrolled out of the window, the compliance may have
   * scrolled out with it. The first version admitted this in a comment and then
   * returned `unmet` anyway, which fed escalation, which turned the next warning
   * into a refusal. So the agent was PUNISHED on evidence the code itself had
   * just declared inconclusive. Dropping the row from the statistics afterwards
   * does not undo that.
   *
   * Censored data gets its own verdict, and that verdict does nothing: no score,
   * no escalation, no refusal.
   */
  return i < 0 ? { since: steps, anchorLost: true } : { since: steps.slice(i + 1), anchorLost: false };
}

/*
 * `judgeOpen` — the step every layer in this repo was missing. Returns what
 * happened to a correction that is already out there.
 *
 *   met      — the trajectory contains the mechanical action that was asked for.
 *              NOT proof that the root cause was fixed, that the architecture
 *              came back, or that the operator's ask was actually met. This repo
 *              already wrote the distinction down once, in outsider-compliance.js:
 *              compliance and effect are different questions, and obeying without
 *              effect is also failure. `met` is compliance only.
 *   pending  — still inside the observation window; say nothing new.
 *   unmet    — the window closed and the action never appeared. A finding about
 *              the CORRECTION, not about the agent: our sentence did not land.
 */
export function judgeOpen(open, steps = []) {
  if (!open || (open.state !== "CORRECTING" && open.state !== "ESCALATED")) return null;
  const { since, anchorLost } = sinceAnchor(open, steps);
  const base = { kind: open.kind, id: open.id, attempt: open.attempt ?? 1,
    steps: since.length, anchorLost };
  if (expectationMet(open.need, since, open.ctx)) {
    return { ...base, verdict: "met",
      note: `outsider：上一条纠正后，约定的动作出现了 —— ${open.expect}（${since.length} 步内）` };
  }
  if (anchorLost) {
    /* 看不见 ≠ 没发生。不计分、不升级、不拒绝。 */
    return { ...base, verdict: "unknown",
      note: null };
  }
  if (since.length < (open.observe ?? OBSERVE_STEPS)) return { ...base, verdict: "pending", note: null };
  return { ...base, verdict: "unmet",
    note: `outsider：${since.length} 步之前我说过「${open.expect}」，到现在没有出现。` };
}

/*
 * 台账的一行 —— 而这一行必须能区分「说了」「说了但没送达」「静默对照」。
 *
 * The first version wrote {kind, verdict, steps, at} and I claimed the treatment
 * arm would grow by itself. It could not: a silenced intervention (shadow mode /
 * control arm) still registered an expectation and still landed in the same
 * file, with no field telling the two apart. And on Codex the guidance channel
 * is measurably undeliverable — the model never sees `additionalContext` — so
 * "spoke" and "reached the agent" are also different facts.
 *
 * Three states, not two:
 *   spoke=true  delivered=true   干预臂
 *   spoke=true  delivered=false  说了但没送达 —— 既不是干预也不是对照，单独一格
 *   spoke=false                  静默对照臂
 *
 * Plus the correction's hash, so two different sentences for the same kind are
 * never pooled, and `anchorLost`, so unobservable rows can be dropped.
 */
export function ledgerLine(result, extra = {}) {
  return JSON.stringify({
    id: result.id ?? null,
    kind: result.kind,
    attempt: result.attempt ?? 1,
    verdict: result.verdict,
    steps: result.steps,
    anchorLost: Boolean(result.anchorLost),
    spoke: extra.spoke ?? null,
    /*
     * 三个不同的事实，不能压成一个 `delivered`：
     *   payloadCarried      —— 渲染出的 payload 里带着这句话（本地可证）
     *   contextReachesModel —— 这个宿主的指导通道进不进模型（实测得来的常量）
     *   deliveredToModel    —— 模型到底收到没有（本地【无法】证明，永远留空）
     * 算 treatment effect 的人必须自己面对最后那个空，而不是拿前两个冒充它。
     */
    payloadCarried: extra.payloadCarried ?? null,
    contextReachesModel: extra.contextReachesModel ?? null,
    deliveredToModel: extra.deliveredToModel ?? null,
    arm: extra.arm ?? null,
    sessionId: extra.sessionId ?? null,
    origin: extra.origin ?? null,
    correctiveHash: extra.correctiveHash ?? null,
    at: extra.at ?? null,
  });
}

/* a stable short hash so two different sentences are never pooled as one */
export function hashText(t) {
  let h = 2166136261;
  const s = String(t ?? "");
  for (let i = 0; i < s.length; i += 1) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36);
}

/*
 * 每个 agent 一份状态 —— parent 和 subagent 不能互相覆盖。
 *
 * Everything wrote `.outsider/control.json`. A parent registers an expectation,
 * a subagent's next hook call overwrites it, and a third agent settles it
 * against its own trajectory. The file claimed to own a task tree; it owned one
 * mutable global.
 */
export function statePath(cwd, { sessionId = null, origin = "main" } = {}) {
  const safe = (x) => String(x ?? "").replace(/[^A-Za-z0-9_.-]/g, "_").slice(0, 64) || "unknown";
  return `${String(cwd).replace(/\/+$/, "")}/.outsider/observer/${safe(sessionId)}.${safe(origin)}.json`;
}
