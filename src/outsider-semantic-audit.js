import { runFreshJsonCommand } from "./outsider-json-command.js";

const AUDIT_SHAPE = `只输出以下 JSON，不得混用 passed/errors/insufficient 旧字段：
{
  "decision": "pass"|"reject"|"insufficient",
  "blockingErrors": ["仅列出足以否决提案的事实错误、合同矛盾或计划缺陷"],
  "notes": ["不影响本次裁决的提醒、边界或改进建议"],
  "verifiedFacts": ["已经重新计算或由证据直接支持的事实"],
  "insufficientReason": "只有 decision=insufficient 时写明缺少什么；否则必须为 null"
}

三种 decision 严格互斥：
- pass：blockingErrors=[] 且 insufficientReason=null；notes 可以非空，但 notes 绝不阻断放行；
- reject：blockingErrors 至少一条且 insufficientReason=null；
- insufficient：blockingErrors=[] 且 insufficientReason 是非空字符串。
不要为了记录非致命备注而 reject，也不要把备注塞进 blockingErrors。`;

export const CORRECTION_AUDIT_PROMPT = `你是结构化纠正提案的独立事实审计员。你没有参与工作，也不是提出纠正的监工。

proposedCorrection 是唯一可能被送给 worker、并驱动后续 effect 检查的 authority-bearing projection。监工的其余散文、
acceptanceRisk、旁枝计数和修辞没有进入该对象，因此不属于你的裁决对象。逐项验证：
1. defect.claims 中每个具体数字、集合、时间窗口、命令结果和因果说法能否从 objectiveEvidence 重新推出；
2. 反例必须逐步重算，不能相信提案自己的“手工验算”；
3. repairInstructions 与 expectedActions 是否忠于冻结合同，不能扩大、缩小或把 uncertainties 改成排除项；
4. repairInstructions 是否真的能消除 defect.claims 指出的反例；expectedActions 必须属于 edit/delete/read/probeArtifact/runRef/
   probeRequest/protectedPathsUnchanged/semanticReverify/ensureTask/spawnTeammate 的闭集。若冻结合同规定 actor、owner、
   shared task、依赖或具名 teammate，必须逐项验证这些身份字段；不得把 teammate 的切片授权给 main/lead 代写，
   也不得把“先建图再启动成员”降格为没有控制力的 repairInstructions 散文。probeArtifact 只能是系统临时目录中的非交付文件；
   runRef 只能引用 frozenAcceptance，probeRequest 只能描述
   案例和断言，不能携带 controller 要执行的 command、argv 或 source；
5. protectedPaths 的路径和 sha256 必须逐项对应 objectiveEvidence.frozenAcceptanceDefinition.protectedPaths
   这一 controller 在 t=0 冻结的 hash-only 完整控制边界；不要从 files 的正文子集猜测或补造路径。
   protectedPathsTruncated=true 时不得给纠正授权；任何 edit/delete 都不能指向受保护路径；
6. objectiveEvidence 中与上述字段无关的旧提案、审计历史或散文即使有错，也不能成为拒绝本提案的理由。

当前 proposedCorrection 正是待授权的候选纠正：你的 decision=pass 会使 controller 随后把这个 exact authority hash
封装为 OUTSIDER_INTERVENTION。objectiveEvidence 中不存在更早的 OUTSIDER_INTERVENTION 是正常的，不能据此要求
“先有一次干预才能授权本次干预”，也不能因此删除当前提案中消除已证实缺陷所必需的 edit/delete。只审当前候选
是否由当前快照、精确 preSha256、受保护路径边界和冻结合同支持。

时间权威规则：objectiveEvidence.currentSourceEvidence、diff.after 与
workspaceEvidence.canonicalArtifact 是 controller 在当前暂停边界重新取得的当前工件快照，时间上晚于 trajectory。
若 proposedCorrection.expectedActions 中 edit/delete 的 preSha256 与 currentSourceEvidence 的同路径 sha256 一致，且
canonicalArtifact.snapshotFingerprint 与 diff.afterFingerprint 一致，那么更早的 Read/命令看到不同字节只说明历史状态不同，
不是当前状态矛盾；“谁在何时改了它”未知只能写 notes，不能 decision=insufficient。只有当前 controller-owned
快照彼此不一致、edit preSha256 不匹配当前源码、或受保护文件哈希不一致，才构成 blocker/insufficient。

authority-bearing 字段中任何事实算错、合同解释自相矛盾、或计划不足以排除反例，都必须 decision=reject。
看不出来就 decision=insufficient；不得因为另一位模型很自信而放行。

${AUDIT_SHAPE}`;

export const OUTCOME_APPROVAL_AUDIT_PROMPT = `你是最终 PASS 判决的独立反方审计员。你没有参与实现，也不是给出 PASS 的验收员。

在 PASS 获得释放 worker 的权力之前，逐项验证：
1. proposedVerdict 的证据是否能从冻结合同、源码和真实验收结果推出；
2. 它是否把 successCriteria/architecturalConstraints 中的要求偷偷说成“未定义”或“已排除”；
3. 它声称尝试的反例是否算对，最终源码能否通过该反例；
4. 只要存在一个未排除的反例或合同内部矛盾未被保守处理，就必须 decision=reject；证据不足则必须 decision=insufficient。

测试绿和算法有名字都不是放行理由。重新做计算，不得复述 proposedVerdict 作为证据。

${AUDIT_SHAPE}`;

export const CLEARANCE_AUDIT_PROMPT = `你是 onTrack=true 放行提案的独立反方审计员。放行意味着当前 trigger 会被静默压下，
所以提出 onTrack 的监工不能独自给自己授权。

逐项验证：
1. objectiveEvidence 中是否存在与放行直接矛盾的红灯、失败断言、语义缺口、文件冲突或未完成依赖；
2. proposedClearance 是否内部自洽。onTrack=true 必须 drift 为空、plan 为空；如果仍需要具体修复步骤，它就不是可静默放行；
3. 在 Stop/交付边界，冻结验收 exit!=0 或 semanticOutcome.passed=false 时，除非证据证明该失败与合同无关，
   onTrack=true 不能获得压下纠正的权力；
4. 重新核对冻结合同和源码，不得把“worker 大致在正确方向”偷换成“无需干预”。

如果 objectiveEvidence.decisionScope.kind=intermediate-team-task-delivery，放行的含义只是允许当前 owner 的这个
任务切片完成，不是宣告整项工作完成。此时兄弟任务、blocked integration 和最终 npm test 尚未由 lead 执行，
本身都不是反对本切片放行的 blockingError。必须审计 decisionScope.actorEvidence 是否证明：同一绑定身份确实改动了
该任务的文件、执行了成功的相关检查、没有越界触碰，并且 delegatedTask 的切片要求已经满足。若这些成立，
proposedClearance 的 plan/expectedNextActions 为空，即可 pass；不得用“全局尚未完成”制造团队完成死锁。
这个 hook 发生在宿主提交 TaskUpdate(status=completed) 的中间：decisionScope.gatePhase=before-host-task-update-commit
且 completionIntent.recorded=true 时，taskStatus 仍是 in_progress/awaiting-verification 正是事务预期，不能把“尚未 committed”
本身当作 blockingError，也不能要求 worker 再调用一次 TaskUpdate。当前 gate 通过后，controller 仍只在同一 toolUseId 的
成功 PostToolUse 到达时才持久化 completed；若 Post 失败，完成不会成立。只有 completion intent 缺失/歧义、身份或代际不匹配，
或切片 effect/check/scope 本身未满足，才应拒绝。

如果 objectiveEvidence.activeEvaluatorShift 存在，它是 controller 从已封印事件顺序和预注册动作表推导的当前时态：
- phase=in-progress 时，只审当前 proposedStep 是否等于 expectedNextStep。futureStepsAreNotCurrentOmissions=true
  明确表示剩余步骤尚在未来，不能把它们当成当前遗漏，也不能要求本次 PreToolUse 已经完成整个班次；
- phase=awaiting-stop-verification 时，才要求 allExpectedCompleted=true，且 completedSteps 与 expectedSteps 完整同序；
- proposedMatchesNext=true 且没有独立红灯时，不能仅因未来动作尚未发生而 insufficient/reject。
controllerProcessEvidence 中较早班次的 trajectory 不得被误认成当前 active shift 已经执行完毕。

decision=pass 只表示可以安全地保持沉默。任何矛盾或未解释的红灯都必须 reject；证据不足必须 insufficient。

${AUDIT_SHAPE}`;

const stringArrayErrors = (value, field) => {
  if (!Array.isArray(value?.[field])) return [`${field} must be an array of strings`];
  if (value[field].some((item) => typeof item !== "string" || !item.trim())) {
    return [`${field} must contain only non-empty strings`];
  }
  return [];
};

/** Exact reasons are part of the control protocol: a schema retry must know
 * whether it confused notes with blockers, emitted two decisions at once, or
 * simply omitted a field.  A boolean validator erased that information. */
export function semanticAuditSchemaViolations(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return ["audit response must be a JSON object"];
  }
  if (Object.hasOwn(value, "decision")) {
    const errors = [];
    const mixedLegacy = ["passed", "errors", "insufficient"].filter((field) => Object.hasOwn(value, field));
    if (mixedLegacy.length) {
      errors.push(`decision protocol cannot mix legacy fields: ${mixedLegacy.join(", ")}`);
    }
    if (!["pass", "reject", "insufficient"].includes(value.decision)) {
      errors.push('decision must be exactly "pass", "reject", or "insufficient"');
    }
    errors.push(...stringArrayErrors(value, "blockingErrors"));
    errors.push(...stringArrayErrors(value, "notes"));
    errors.push(...stringArrayErrors(value, "verifiedFacts"));
    const blockers = Array.isArray(value.blockingErrors) ? value.blockingErrors : [];
    const insufficient = value.insufficientReason;
    if (!Object.hasOwn(value, "insufficientReason")) {
      errors.push("insufficientReason must be present (null unless decision=insufficient)");
    }
    if (value.decision === "pass") {
      if (blockers.length) errors.push("decision=pass requires blockingErrors=[]; put non-blocking remarks in notes");
      if (insufficient !== null) {
        errors.push("decision=pass requires insufficientReason=null");
      }
    } else if (value.decision === "reject") {
      if (!blockers.length) errors.push("decision=reject requires at least one blockingErrors entry");
      if (insufficient !== null) {
        errors.push("decision=reject requires insufficientReason=null; use decision=insufficient when evidence is missing");
      }
    } else if (value.decision === "insufficient") {
      if (blockers.length) errors.push("decision=insufficient requires blockingErrors=[]; unverified suspicions are not factual errors");
      if (typeof insufficient !== "string" || !insufficient.trim()) {
        errors.push("decision=insufficient requires a non-empty insufficientReason");
      }
    }
    return errors;
  }

  /* Compatibility adapter for stored tests and callers from releases <=1.3.9.
     New model prompts never request this shape.  Ambiguous legacy verdicts are
     rejected instead of guessing which field had authority. */
  const errors = [];
  if (typeof value.passed !== "boolean") errors.push("passed must be boolean (legacy shape) or decision must be present");
  errors.push(...stringArrayErrors(value, "errors"));
  errors.push(...stringArrayErrors(value, "verifiedFacts"));
  if (value.notes != null) errors.push(...stringArrayErrors(value, "notes"));
  const blockers = Array.isArray(value.errors) ? value.errors : [];
  const insufficient = typeof value.insufficient === "string" && value.insufficient.trim();
  if (value.passed === true && blockers.length) {
    errors.push("passed=true cannot contain errors; move non-blocking remarks to notes");
  }
  if (value.passed === true && insufficient) errors.push("passed=true cannot also be insufficient");
  if (value.passed === false && blockers.length && insufficient) {
    errors.push("legacy response cannot be both reject and insufficient");
  }
  if (value.passed === false && !blockers.length && !insufficient) {
    errors.push("passed=false requires errors or insufficient");
  }
  return errors;
}

export function validSemanticAudit(value) {
  return semanticAuditSchemaViolations(value).length === 0;
}

export function normalizeSemanticAudit(value) {
  if (!validSemanticAudit(value)) return null;
  if (Object.hasOwn(value, "decision")) {
    const insufficient = value.decision === "insufficient"
      ? value.insufficientReason.trim() : null;
    return {
      decision: value.decision,
      passed: value.decision === "pass",
      errors: [...value.blockingErrors],
      blockingErrors: [...value.blockingErrors],
      notes: [...value.notes],
      verifiedFacts: [...value.verifiedFacts],
      insufficient,
      insufficientReason: insufficient,
    };
  }
  const decision = value.passed ? "pass" : value.insufficient ? "insufficient" : "reject";
  const insufficient = decision === "insufficient" ? value.insufficient.trim() : null;
  return {
    decision,
    passed: decision === "pass",
    errors: [...value.errors],
    blockingErrors: [...value.errors],
    notes: Array.isArray(value.notes) ? [...value.notes] : [],
    verifiedFacts: [...value.verifiedFacts],
    insufficient,
    insufficientReason: insufficient,
  };
}

function runAudit({ cmd, prompt, packet, validationFeedback = null,
  execute = runFreshJsonCommand }) {
  const feedback = validationFeedback
    ? `\n────── 上一次响应的 schema 错误（必须逐条修正） ──────\n${String(validationFeedback).slice(0, 4000)}\n`
    : "";
  const input = `${prompt}\n\n────── 待审计材料 ──────\n${JSON.stringify(packet, null, 2)}\n${feedback}`;
  const result = execute({ cmd, input, validate: validSemanticAudit,
    describeValidationErrors: semanticAuditSchemaViolations });
  if (!result?.ok) return { ok: false, error: result?.error ?? "SEMANTIC_AUDIT_FAILED",
    failure: result?.failure ?? null, retryInput: result?.retryInput ?? null, packet };
  const rawVerdict = result.value ?? result.verdict;
  const verdict = normalizeSemanticAudit(rawVerdict);
  if (!verdict) {
    const schemaViolations = semanticAuditSchemaViolations(rawVerdict);
    const retryInstruction = [
      "The previous audit JSON violated the required schema:",
      ...schemaViolations.map((item) => `- ${item}`),
    ].join("\n");
    return {
      ok: false,
      error: `INVALID_SEMANTIC_AUDIT:${schemaViolations.join("; ").slice(0, 1200)}`,
      failure: { kind: "schema-invalid", retryable: true, schemaViolations,
        retryInstruction },
      retryInput: `${input}\n\n────── SCHEMA REPAIR REQUIRED ──────\n${retryInstruction}\n`,
      packet,
    };
  }
  return { ok: true, verdict, packet,
    packetBytes: Buffer.byteLength(JSON.stringify(packet)), rawBytes: result.rawBytes ?? null };
}

export function auditCorrectionProposal({ cmd, contract, evidence, proposal,
  validationFeedback = null, execute = runFreshJsonCommand } = {}) {
  return runAudit({ cmd, prompt: CORRECTION_AUDIT_PROMPT, execute, validationFeedback, packet: {
    frozenOperatorWords: contract?.ask ?? null,
    semanticContract: contract?.semantic ?? null,
    objectiveEvidence: evidence ?? null,
    proposedCorrection: proposal ?? null,
  } });
}

export function auditOutcomeApproval({ cmd, outcomePacket, proposedVerdict,
  validationFeedback = null, execute = runFreshJsonCommand } = {}) {
  return runAudit({ cmd, prompt: OUTCOME_APPROVAL_AUDIT_PROMPT, execute, validationFeedback, packet: {
    frozenOutcomeEvidence: outcomePacket ?? null,
    proposedVerdict: proposedVerdict ?? null,
  } });
}

export function auditSupervisorClearance({ cmd, contract, evidence, proposal,
  validationFeedback = null, execute = runFreshJsonCommand } = {}) {
  return runAudit({ cmd, prompt: CLEARANCE_AUDIT_PROMPT, execute, validationFeedback, packet: {
    frozenOperatorWords: contract?.ask ?? null,
    semanticContract: contract?.semantic ?? null,
    objectiveEvidence: evidence ?? null,
    proposedClearance: proposal ?? null,
  } });
}
