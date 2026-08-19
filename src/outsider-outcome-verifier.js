import { runFreshJsonCommand } from "./outsider-json-command.js";
import {
  compactTrajectory, currentSourceEvidence, frozenAcceptanceEvidence,
} from "./outsider-supervisor-session.js";

export const OUTCOME_PROMPT = `你是最终交付的独立验收员。你没有参与实现，也看不到 worker 的自述、计划或自我评价。

判断最终产物是否实质满足冻结的操作方原话和语义合同。测试通过只是证据之一，不得因为绿灯自动 passed；尤其检查 forbiddenShortcuts 和 architecturalConstraints，防止法拉利外壳里装拖拉机发动机。

只输出 JSON：
{
  "passed": true|false,
  "gaps": ["没有满足的语义或架构要求；passed=true 时必须为空"],
  "evidence": ["支持判断的具体 diff/验收事实"],
  "insufficient": "证据不足时写缺什么，并把 passed 设为 false；证据够时省略"
}

不得用 worker 的说法作证。看不出来就是 insufficient，不得 fail-open。
diff 只说明“相对开工时改了什么”，不是完成的必要条件。如果 evaluationPhase="baseline"，或 baselineAcceptance.passed=true 且 diff.changed=0，应直接判断当前源码证据是否已经满足合同；不得仅凭“没有编辑”判失败，也不得要求 worker 制造无意义改动来证明工作量。
一种实现是公认算法、不是硬编码，仍不等于满足本合同。若冻结验收定义或语义合同规定了命名机制/精确不变量，
必须检查源码能否在可见测试之外违反该不变量；未经操作方允许，近似算法不能冒充精确保证。passed=true 前至少尝试构造一个
未出现在可见断言里的反例，并用 currentSourceEvidence 推演；若无法排除反例，写 insufficient，不得凭算法名称放行。
uncertainties 只表示开工时没有额外授权，绝不是自动排除项。它不能覆盖 frozenOperatorWords、successCriteria 或
architecturalConstraints；只有操作方原话或 scope.out 明确排除的场景才能从保证中去掉。若一个 PASS 必须把合同要求的
场景重新称为“未定义”才能成立，应判 false 或 insufficient。
如果合同包含顺序或过程要求（例如“先运行三次测试再修改”），必须只依据 executionEvidence 中有时间顺序的工具动作判定；不得因为最终代码正确就忽略过程要求，也不得在 executionEvidence 已经给出动作时声称没有证据。
contentRef="currentSourceEvidence" 表示该冻结文件的正文与同 path、同 sha256 的当前源码逐字相同；afterRef 使用同一规则表示 diff.after。它们是内容寻址去重，不是缺失证据。只有 path/hash 对不上时才可判正文不足。
如果 packet 含 controllerProcessEvidence，它是 controller/evaluator 自己落盘的有序过程事实，可用于判断某段空闲是否由外部调度、某个班次是否已派发；不得仅凭两个工具调用的时间间隔反推 worker 在轮询。不得要求当前中间 Stop 提供合同明确交给 post-run certifier 的未来时长或未来 checkpoint 证据。
其中 team_identity_bound、team_task_created、task_graph_updated、confirmed_file_touch、teammate_verification_confirmed、team_task_completed 和 multi_agent_integration_verified 是控制器从宿主事件绑定得到的团队过程事实。若这些字段已明确 actor、task、文件和顺序，不得把 teammate 的动作改判成 main 的动作，也不得声称共享任务图没有证据。
其中 type=active_evaluator_shift_state 是 controller 从事件顺序与预注册动作表推导的当前时态：
phase=in-progress 时未来步骤不是当前遗漏；phase=awaiting-stop-verification 时才要求 expectedSteps 与
completedSteps 完整同序、allExpectedCompleted=true。`;

export function validOutcomeVerdict(value) {
  if (!value || typeof value !== "object" || typeof value.passed !== "boolean") return false;
  if (!Array.isArray(value.gaps) || !Array.isArray(value.evidence)) return false;
  if (value.insufficient && value.passed) return false;
  if (value.passed && value.gaps.length) return false;
  return true;
}

function withoutNullish(record) {
  return Object.fromEntries(Object.entries(record ?? {})
    .filter(([, value]) => value !== null && value !== undefined));
}

/**
 * The semantic verifier needs complete meaning, not repeated bytes.  A real
 * Agent Team run showed the same source/test bodies three times (current
 * source, frozen acceptance and diff) and padded every controller event with
 * dozens of null fields.  That pushed an otherwise valid integration verdict
 * over the evaluator's per-process budget.
 *
 * This projection is content-addressed rather than lossy:
 * - a frozen body is replaced only when currentSourceEvidence contains the
 *   exact same path and sha;
 * - a diff after-body is replaced only when the exact afterSha is present;
 * - ordered actions, exits and observation hashes remain, while successful
 *   native Read/Edit bodies already represented by current source are omitted;
 * - test output and every failed-command tail remain visible.
 */
export function compactOutcomePacket(packet) {
  const current = Array.isArray(packet?.currentSourceEvidence)
    ? packet.currentSourceEvidence : [];
  const currentByPath = new Map(current.map((entry) => [entry?.path, entry]));
  const frozen = packet?.frozenAcceptanceDefinition ?? null;
  const compactFrozen = frozen ? {
    ...frozen,
    files: (frozen.files ?? []).map((file) => {
      const matching = currentByPath.get(file?.path);
      if (file?.content == null || !matching || matching.sha256 !== file.sha256
        || matching.content !== file.content) return withoutNullish(file);
      const { content: _content, ...rest } = file;
      return withoutNullish({ ...rest,
        contentRef: "currentSourceEvidence", contentSha256: file.sha256 });
    }),
  } : null;
  const compactDiff = packet?.diff ? {
    ...packet.diff,
    changes: (packet.diff.changes ?? []).map((change) => {
      const matching = currentByPath.get(change?.path);
      const exactAfter = change?.after != null && matching
        && matching.sha256 === change.afterSha && matching.content === change.after;
      const { after: _after, ...withoutAfter } = change;
      return withoutNullish(exactAfter ? {
        ...withoutAfter,
        afterRef: "currentSourceEvidence",
      } : change);
    }),
  } : packet?.diff;
  const compactExecution = (packet?.executionEvidence ?? []).map((step) => {
    const sourceCarriesBody = Boolean(step?.file && currentByPath.has(step.file));
    const keepTail = step?.isTest === true || (step?.exit != null && step.exit !== 0)
      || (!sourceCarriesBody && step?.isRead !== true && step?.isEdit !== true);
    const projected = { ...step };
    if (!keepTail) delete projected.observationTail;
    return withoutNullish(projected);
  });
  const compactController = (packet?.controllerProcessEvidence ?? [])
    .map((event) => withoutNullish(event));
  return {
    ...packet,
    executionEvidence: compactExecution,
    controllerProcessEvidence: compactController,
    frozenAcceptanceDefinition: compactFrozen,
    diff: compactDiff,
  };
}

export function outcomePacket({ contract, baseline, current, diff, acceptance,
  baselineAcceptance = null, phase = "stop", executionSteps = [], controllerProcessEvidence = [] }) {
  const frozenDefinition = frozenAcceptanceEvidence(baseline, contract,
    { currentSnapshot: current });
  const acceptanceDefinitionChanges = frozenDefinition.files.map((file) => ({
    path: file.path,
    baselineSha: file.sha256,
    currentSha: file.currentSha256,
    status: !current?.files?.[file.path] ? "deleted"
      : current.files[file.path].sha === file.sha256 ? "unchanged" : "modified",
  })).filter((entry) => entry.status !== "unchanged");
  return compactOutcomePacket({
    frozenOperatorWords: contract?.ask ?? null,
    semanticContract: contract?.semantic ?? null,
    acceptance: {
      command: acceptance?.command ?? contract?.acceptance ?? null,
      ran: Boolean(acceptance?.ran),
      passed: acceptance?.passed ?? null,
      exit: acceptance?.exit ?? null,
      output: String(acceptance?.output ?? "").slice(-6000),
    },
    baselineAcceptance: baselineAcceptance ? {
      command: baselineAcceptance.command ?? contract?.acceptance ?? null,
      ran: Boolean(baselineAcceptance.ran),
      passed: baselineAcceptance.passed ?? null,
      exit: baselineAcceptance.exit ?? null,
      output: String(baselineAcceptance.output ?? baselineAcceptance.outputTail ?? "").slice(-3000),
    } : null,
    evaluationPhase: phase,
    executionEvidence: compactTrajectory(executionSteps, { maxSteps: 220 }),
    controllerProcessEvidence: Array.isArray(controllerProcessEvidence)
      ? controllerProcessEvidence.slice(-120) : [],
    frozenAcceptanceDefinition: frozenDefinition,
    acceptanceDefinitionChanges,
    baselineFingerprint: baseline?.fingerprint ?? null,
    finalFingerprint: current?.fingerprint ?? null,
    diff,
    currentSourceEvidence: currentSourceEvidence(current, contract),
  });
}

export function verifyOutcome({ cmd, contract, baseline, current, diff, acceptance,
  baselineAcceptance = null, phase = "stop", executionSteps = [],
  controllerProcessEvidence = [],
  validationFeedback = null,
  execute = runFreshJsonCommand } = {}) {
  const packet = outcomePacket({ contract, baseline, current, diff, acceptance,
    baselineAcceptance, phase, executionSteps, controllerProcessEvidence });
  const feedback = validationFeedback
    ? `\n────── 上一次响应的 schema 错误（必须逐条修正） ──────\n${String(validationFeedback).slice(0, 4000)}\n`
    : "";
  const input = `${OUTCOME_PROMPT}\n\n────── 冻结合同与客观证据 ──────\n${JSON.stringify(packet, null, 2)}\n${feedback}`;
  const result = execute({ cmd, input, validate: validOutcomeVerdict });
  if (!result?.ok) return { ok: false, error: result?.error ?? "OUTCOME_VERIFIER_FAILED",
    failure: result?.failure ?? null, packet };
  const verdict = result.value ?? result.verdict;
  if (!validOutcomeVerdict(verdict)) return { ok: false, error: "INVALID_OUTCOME_VERDICT", packet };
  return { ok: true, verdict, packet,
    packetBytes: Buffer.byteLength(JSON.stringify(packet)), rawBytes: result.rawBytes ?? null };
}
