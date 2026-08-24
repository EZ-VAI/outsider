/*
 * 宿主能力表 —— 每一格都必须有一个测试撑着。
 *
 * 这张表存在的原因是我犯过的一个错：我在一份 Claude Code 日志上量出「518/518
 * 事件 id 唯一」，然后把它当成产品级结论写进了汇报。Codex 的解析器根本不带
 * call_id，所以那条路径上每一个锚点都是 null、每一次判决都是 unknown、观察器
 * 静默地没有运行。一张跨宿主的表把一条能跑的路径说成了四条。
 *
 * 现在能力不是我说了算：test/outsider-host-conformance.test.js 用每个宿主真实
 * 形状的日志去证明这里的每一格，对不上就红。要新增一个宿主，先让那个测试过。
 */
export const SUPPORT = {
  "claude-code": {
    uid: true,              /* 每次工具调用都有唯一 id，可以锚定时间线 */
    contextToModel: true,   /* additionalContext 实测进入模型上下文 */
    denyReason: true,
    stopHook: true,         /* Stop / SubagentStop 可以拒绝收工 */
    updatedInput: true,
  },
  codex: {
    /*
     * Legacy rollout-parser capability table only. call_id survives the parser,
     * so uid is true. These false treatment booleans do not describe the direct
     * attached-control runtime, whose evidence is assessed separately.
     */
    uid: true,
    contextToModel: false,
    denyReason: true,
    stopHook: false,
    updatedInput: false,
  },
  codebuddy: { uid: false, contextToModel: false, denyReason: true, stopHook: false, updatedInput: false },
  trae: { uid: false, contextToModel: false, denyReason: false, stopHook: false, updatedInput: false },
};

/* Discovery metadata only; never consumed as treatment or delivery proof. */
export const ENGINE_CAPABILITY_CANDIDATES = Object.freeze({
  codex: Object.freeze({ contextToModel: true, stopHook: true, updatedInput: true }),
});

export function supports(host, cap) {
  return Boolean(SUPPORT[host]?.[cap]);
}

/*
 * 观察器需要一个能锚定时间线的唯一事件身份。没有它，`sinceAnchor` 永远走
 * anchorLost 分支，一切都是 unknown —— 而 unknown 按设计不计分、不升级、不拒绝。
 * 所以在这些宿主上，观察器应当明确关闭并说出来，而不是每一轮静静地产出 CENSORED。
 */
export function observerUsable(host) {
  return supports(host, "uid");
}
