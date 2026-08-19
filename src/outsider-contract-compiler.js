import { runFreshJsonCommand } from "./outsider-json-command.js";
import { frozenAcceptanceEvidence } from "./outsider-supervisor-session.js";

export const CONTRACT_COMPILER_PROMPT = `你是工作的合同工程师，不是执行这项工作的 worker。

在 worker 启动之前，把操作方原话编译成一份不可由 worker 修改的语义合同。不要增加产品范围；要把原话中隐含但对正确交付必要的机制、约束和反作弊条件说清楚。

只输出 JSON：
{
  "objective": "这项工作最终要产生的能力或结果，不是表面动作",
  "successCriteria": ["可独立判断真假的结果"],
  "architecturalConstraints": ["实现不能破坏的机制/边界"],
  "forbiddenShortcuts": ["会字面满足但实质失败的做法"],
  "scope": {"in": ["范围内"], "out": ["明确不做"]},
  "uncertainties": ["原话没有决定、不能擅自假设的事"]
}

规则：
- successCriteria 至少一条，并且不能只是“改了文件”或“测试绿了”。
- forbiddenShortcuts 要针对法拉利外壳/拖拉机发动机式的假完成。
- frozenAcceptanceDefinition 是开工前封存的可执行标准。测试名称、断言和注释如果规定了一个命名机制或精确不变量，
  必须原样进入合同；不得放宽成“类似算法也可以”，也不得用只通过可见例子的近似机制替代，除非操作方明确允许近似。
- 每条机制性成功标准都要考虑至少一个未出现在可见断言里的反例形状；合同必须能区分“真实满足不变量”和“只碰巧通过示例”。
- 不知道的放 uncertainties，不要偷偷扩张范围。uncertainties 不是 scope.out，也不能推翻 objective 或
  successCriteria；若一种实现只有增加未获操作方授权的前提才正确（例如假设输入单调），应把该前提列为风险，
  不能用“行为未定义”替它自动缩小合同。
- 不读取 worker 的计划、解释或自我评价；它此刻还不存在。`;

export const CONTRACT_AUDITOR_PROMPT = `你是语义合同草案的独立反方审计员。你没有参与合同编译，也不能修改操作方原话。

这份草案一旦通过，会成为后续诊断、纠正和最终 PASS 的共同判据，所以必须在 worker 启动前验证：
1. proposedSemanticContract 是否保留 operatorWords 的量词、时间范围、主体、边界和全局/局部语义；不得把“任意”缩成
   “当前/本次”，不得把最终集合的不变量偷换成单次调用的局部判据，也不得反向扩张范围；
2. successCriteria、architecturalConstraints、forbiddenShortcuts 和 scope 是否彼此一致，并且不与
   frozenAcceptanceDefinition、baselineAcceptance 的可执行事实矛盾；
3. uncertainties 只能保存真正未定义的边界，不能用来撤销 operatorWords 已经明确的要求；
4. 至少重写一条草案的关键判据为逻辑含义，并尝试构造一个“满足草案但违反操作方原话或冻结验收”的反例。

只输出 JSON：
{
  "passed": true|false,
  "errors": ["草案窄化、扩张、内部矛盾或与冻结验收冲突之处"],
  "verifiedFacts": ["从原话和冻结证据独立推出的事实"],
  "insufficient": "证据不足时写缺什么并令 passed=false；足够时省略"
}

只要存在未解决的语义窄化、扩张、矛盾或证据不足，就必须 passed=false。测试绿不能替合同草案授权。`;

function acceptanceScriptHint(baseline, acceptance) {
  try {
    const scripts = JSON.parse(baseline?.files?.["package.json"]?.text ?? "{}").scripts ?? {};
    const command = String(acceptance ?? "");
    const match = command.match(/(?:^|\s)npm\s+(?:run\s+)?([^\s;&|]+)/i);
    const name = match?.[1] === "test" ? "test" : match?.[1];
    return name && scripts[name] ? String(scripts[name]) : "";
  } catch { return ""; }
}

function inputReferencesPath(name, input) {
  const normalized = String(name).replaceAll("\\", "/").toLowerCase();
  const haystack = String(input ?? "").replaceAll("\\", "/").toLowerCase();
  if (!normalized || !haystack) return false;
  return haystack.includes(normalized) || haystack.includes(`./${normalized}`);
}

export function contractCompilerPacket({ ask, acceptance, baseline, baselineAcceptance = null,
  revision = null }) {
  const preferred = /(^|[/\\])(?:README[^/]*|CLAUDE(?:\.local)?\.md|AGENTS\.md|package\.json|pyproject\.toml|Cargo\.toml|go\.mod|[^/]*config[^/]*|\.claude[/\\]rules[/\\][^/]+\.md)$/i;
  const frozenInputHints = [ask, acceptance, acceptanceScriptHint(baseline, acceptance)]
    .map((value) => String(value ?? "")).join("\n");
  const selected = Object.entries(baseline?.files ?? {})
    .filter(([name, value]) => value.text != null
      && (preferred.test(name) || inputReferencesPath(name, frozenInputHints)))
    .sort(([left], [right]) => {
      const score = (name) => (inputReferencesPath(name, frozenInputHints) ? 100 : 0)
        + (preferred.test(name) ? 10 : 0);
      return score(right) - score(left) || left.localeCompare(right);
    })
    .slice(0, 12)
    .map(([name, value]) => ({ path: name, sha256: value.sha ?? null,
      status: "frozen-baseline", content: String(value.text).slice(0, 5000) }));
  const packet = {
    operatorWords: String(ask ?? ""),
    acceptanceCommand: acceptance ? String(acceptance) : null,
    /* At t=0 the only truthful comparison target is the same immutable
       baseline. Reporting "not-compared" made independent auditors believe
       the acceptance files had never been hash-checked, even though their
       hashes were already in the snapshot. Later runtime packets compare the
       same frozen snapshot with the actual current tree. */
    frozenAcceptanceDefinition: frozenAcceptanceEvidence(baseline,
      { ask, acceptance }, { currentSnapshot: baseline }),
    baselineAcceptance: baselineAcceptance ? {
      command: baselineAcceptance.command ?? acceptance ?? null,
      ran: Boolean(baselineAcceptance.ran),
      passed: baselineAcceptance.passed ?? null,
      exit: baselineAcceptance.exit ?? null,
      output: String(baselineAcceptance.output ?? baselineAcceptance.outputTail ?? "").slice(-6000),
    } : null,
    baseline: {
      fingerprint: baseline?.fingerprint ?? null,
      nFiles: baseline?.nFiles ?? 0,
      manifest: Object.keys(baseline?.files ?? {}).slice(0, 500),
      selectedContext: selected,
    },
  };
  if (revision) packet.revision = {
    rejectedDraft: revision.rejectedDraft ?? null,
    auditErrors: Array.isArray(revision.auditErrors) ? revision.auditErrors.slice(0, 20) : [],
    auditInsufficient: revision.auditInsufficient ?? null,
    instruction: "根据独立审计纠正草案；仍以 operatorWords 为最高语义来源，不得只删除触发审计的措辞",
  };
  return packet;
}

export function validSemanticContract(value) {
  return Boolean(value && typeof value === "object"
    && String(value.objective ?? "").trim()
    && Array.isArray(value.successCriteria) && value.successCriteria.some((item) => String(item).trim())
    && Array.isArray(value.architecturalConstraints)
    && Array.isArray(value.forbiddenShortcuts)
    && value.scope && typeof value.scope === "object"
    && Array.isArray(value.uncertainties));
}

export function validContractAudit(value) {
  if (!value || typeof value !== "object" || typeof value.passed !== "boolean") return false;
  if (!Array.isArray(value.errors) || !Array.isArray(value.verifiedFacts)) return false;
  if (value.passed && (value.errors.length || value.insufficient)) return false;
  if (!value.passed && !value.errors.length && !value.insufficient) return false;
  return true;
}

export function losslessOperatorContract({ ask } = {}) {
  const operatorWords = String(ask ?? "").trim();
  if (!operatorWords) throw new Error("LOSSLESS_CONTRACT_REQUIRES_OPERATOR_WORDS");
  const referencedPaths = [...operatorWords.matchAll(/(?:^|[\s`'"(（])((?:\.?\.?\/)?[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)+)/g)]
    .map((match) => match[1].replace(/^\.\//, "").replace(/[),，。；;:：]+$/, ""));
  return {
    /* This mode intentionally does not paraphrase. It is less structured than
       a good compiled contract, but it cannot narrow "any" into "current" or
       invent a mechanism the operator never authorized. */
    objective: operatorWords,
    successCriteria: [operatorWords],
    architecturalConstraints: [
      `操作方原话保持最高效力，不得窄化、扩张或用局部判据替换：${operatorWords}`,
    ],
    forbiddenShortcuts: [
      "不得修改、绕过或削弱冻结验收来制造绿灯",
      "不得用仅通过可见示例的近似实现冒充操作方要求的语义",
    ],
    scope: {
      in: [...new Set(referencedPaths)],
      out: [],
    },
    uncertainties: [
      "本合同没有增加任何操作方未写明的解释；遇到真正未定义的选择时须保守处理，不能擅自缩小原话。",
    ],
  };
}

export function compileSemanticContract({ cmd, ask, acceptance, baseline, baselineAcceptance = null,
  revision = null, execute = runFreshJsonCommand } = {}) {
  const packet = contractCompilerPacket({ ask, acceptance, baseline, baselineAcceptance, revision });
  const input = `${CONTRACT_COMPILER_PROMPT}\n\n────── 冻结输入 ──────\n${JSON.stringify(packet, null, 2)}\n`;
  let attempts = 1;
  let result = execute({ cmd, input, validate: validSemanticContract });
  /* There is no worker yet, so a transient compiler failure cannot be repaired
     later by the runtime controller. Give the same sealed packet one fresh,
     bounded retry; permanent CLI/configuration failures still fail immediately. */
  if (!result?.ok && result?.failure?.retryable === true) {
    attempts += 1;
    result = execute({ cmd, input: result.retryInput ?? `${input}\n\n${result.failure.retryInstruction ?? "Return exactly one valid JSON object and no prose."}`,
      validate: validSemanticContract });
  }
  if (!result?.ok) return { ok: false, error: result?.error ?? "CONTRACT_COMPILER_FAILED",
    failure: result?.failure ?? null, attempts, packet };
  const semantic = result.value ?? result.semantic;
  if (!validSemanticContract(semantic)) return { ok: false, error: "INVALID_SEMANTIC_CONTRACT", packet };
  return { ok: true, semantic, attempts, packet,
    packetBytes: Buffer.byteLength(JSON.stringify(packet)), rawBytes: result.rawBytes ?? null };
}

export function auditSemanticContract({ cmd, ask, acceptance, baseline, baselineAcceptance = null,
  semantic, execute = runFreshJsonCommand } = {}) {
  const compilerInput = contractCompilerPacket({ ask, acceptance, baseline, baselineAcceptance });
  const packet = {
    frozenInput: compilerInput,
    proposedSemanticContract: semantic ?? null,
  };
  const input = `${CONTRACT_AUDITOR_PROMPT}\n\n────── 待审计合同 ──────\n${JSON.stringify(packet, null, 2)}\n`;
  let attempts = 1;
  let result = execute({ cmd, input, validate: validContractAudit });
  if (!result?.ok && result?.failure?.retryable === true) {
    attempts += 1;
    result = execute({ cmd, input: result.retryInput ?? `${input}\n\n${result.failure.retryInstruction ?? "Return exactly one valid JSON object and no prose."}`,
      validate: validContractAudit });
  }
  if (!result?.ok) return { ok: false, error: result?.error ?? "CONTRACT_AUDIT_FAILED",
    failure: result?.failure ?? null, attempts, packet };
  const verdict = result.value ?? result.verdict;
  if (!validContractAudit(verdict)) return { ok: false, error: "INVALID_CONTRACT_AUDIT",
    attempts, packet };
  return { ok: true, verdict, attempts, packet,
    packetBytes: Buffer.byteLength(JSON.stringify(packet)), rawBytes: result.rawBytes ?? null };
}
