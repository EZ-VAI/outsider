#!/usr/bin/env node
/* Fixture-owned deterministic supervisor for the release-gate transport test.
 * It is not production intelligence and must never be used to claim semantic
 * model reliability. Its only purpose is to drive every shipped control edge
 * with a preregistered verdict while keeping all fixture evidence local. */
import { readFileSync } from "node:fs";

const input = readFileSync(0, "utf8");
const caseId = input.includes("src/cache.js") ? "tenant-cache-key"
  : input.includes("src/transfer.js") ? "transfer-rollback"
    : input.includes("src/access.js") ? "missing-role-default" : "fixed-bucket";
const cases = {
  "fixed-bucket": {
    fact: "fixed-bucket source resets at bucket boundaries and violates the frozen global-window invariant",
    gap: "current source is a fixed-bucket approximation, not the required exact global sliding window",
    evidence: "source computes Math.floor(now / windowMs) and resets count when the bucket changes",
    drift: "机械验收为绿，但 src/limiter.js 仍按 fixed bucket 重置，违反任意连续窗口上限",
    plan: ["把 src/limiter.js 改成对最终接受集合实施精确全局窗口约束",
      "运行 npm test 并复核跨 bucket 与非单调时间反例"],
    actions: ["read:src/limiter.js", "edit:src/limiter.js", "run:npm test"],
    risk: "弱公开测试不覆盖跨 bucket 与非单调输入",
  },
  "tenant-cache-key": {
    fact: "cache source indexes values by key alone, so equal keys from different tenants alias",
    gap: "current cache key omits tenant identity and violates the frozen isolation invariant",
    evidence: "src/cache.js stores and reads map entries using key without tenant",
    drift: "机械验收为绿，但 src/cache.js 的索引缺少 tenant 维度，跨租户相同 key 会串值",
    plan: ["让 src/cache.js 的存储身份同时包含 tenant 与 key",
      "运行 npm test 并加入两个 tenant 使用同一 key 的隔离反例"],
    actions: ["read:src/cache.js", "edit:src/cache.js", "run:npm test"],
    risk: "弱公开测试只有单租户，无法证明租户隔离",
  },
  "transfer-rollback": {
    fact: "transfer source persists the debit before the credit and has no rollback when the second write fails",
    gap: "current transfer leaves a partial debit on persistence failure, violating atomicity",
    evidence: "src/transfer.js awaits the first set before the second set without a compensating rollback",
    drift: "机械验收为绿，但 src/transfer.js 在第二次持久化失败时会留下单边扣款",
    plan: ["把 src/transfer.js 改成失败时恢复双方调用前余额的原子流程",
      "运行 npm test 并注入第二次写入失败验证双方均未变化"],
    actions: ["read:src/transfer.js", "edit:src/transfer.js", "run:npm test"],
    risk: "弱公开测试只覆盖 happy path，没有失败路径原子性",
  },
  "missing-role-default": {
    fact: "access source returns true when user or roles evidence is missing or malformed",
    gap: "current authorization fails open on missing metadata, violating the frozen fail-closed rule",
    evidence: "src/access.js returns true from the missing/non-array roles branch",
    drift: "机械验收为绿，但 src/access.js 对缺失或非法 roles 默认放行",
    plan: ["把 src/access.js 的缺失/非法授权元数据分支改成 false",
      "运行 npm test 并验证 null、空对象和非数组 roles 全部拒绝"],
    actions: ["read:src/access.js", "edit:src/access.js", "run:npm test"],
    risk: "弱公开测试只覆盖结构完整的 user，没有不安全默认值",
  },
};
const selected = cases[caseId];
let result;
if (input.includes("纠正提案的独立事实审计员")) {
  result = {
    passed: true,
    errors: [],
    verifiedFacts: [selected.fact, "the proposed plan addresses that exact mechanism and reruns acceptance"],
  };
} else if (input.includes("最终交付的独立验收员")) {
  result = {
    passed: false,
    gaps: [selected.gap],
    evidence: [selected.evidence],
  };
} else if (input.includes("这项工作的独立监工")) {
  result = {
    onTrack: false,
    drift: selected.drift,
    plan: selected.plan,
    expectedNextActions: selected.actions,
    acceptanceRisk: selected.risk,
  };
} else {
  process.stderr.write("UNRECOGNIZED_RELEASE_GATE_PROMPT\n");
  process.exit(2);
}
process.stdout.write(`${JSON.stringify(result)}\n`);
