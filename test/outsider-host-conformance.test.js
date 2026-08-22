/*
 * 宿主一致性 —— 一个宿主能不能被宣称支持，由测试决定，不由我的话决定。
 *
 * WHY THIS FILE EXISTS
 * ====================
 * I published "518/518 UID unique" as a product-level result. It was the Claude
 * Code path only; the original Codex parser did not carry `call_id`, so Codex
 * anchors were null and judgements came back `unknown`. The parser now binds
 * real-shaped function_call/function_call_output pairs through `call_id`, and
 * this file keeps that capability tied to executable evidence rather than prose.
 *
 * So the claim moves out of prose and into a test. Each host declares which
 * capabilities it has; a capability this file cannot demonstrate on real
 * transcript shapes is FALSE, and anything that reads `SUPPORT` has to degrade
 * accordingly. When Codex's `uid` lands, this file is where it gets proven —
 * not in a summary.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { trajectoryFromSession } from "../src/outsider-session-adapters.js";
import { SUPPORT, supports } from "../src/outsider-host-support.js";

/* one real-shaped transcript per host */
const FIXTURES = {
  "claude-code": [
    JSON.stringify({ type: "assistant", timestamp: "2026-08-04T01:00:00Z",
      message: { content: [{ type: "tool_use", id: "tu_1", name: "Bash", input: { command: "npm test" } }] } }),
    JSON.stringify({ type: "user",
      message: { content: [{ type: "tool_result", tool_use_id: "tu_1", content: "FAIL 1 test" }] } }),
  ],
  codex: [
    JSON.stringify({ type: "response_item", payload: { type: "function_call", name: "shell",
      call_id: "c1", arguments: JSON.stringify({ command: ["bash", "-lc", "npm test"] }) } }),
    JSON.stringify({ type: "response_item", payload: { type: "function_call_output", call_id: "c1",
      output: JSON.stringify({ output: "FAIL", metadata: { exit_code: 1 } }) } }),
  ],
};

function stepsFor(host) {
  const dir = mkdtempSync(path.join(tmpdir(), `conf-${host}-`));
  const p = path.join(dir, "s.jsonl");
  writeFileSync(p, `${FIXTURES[host].join("\n")}\n`);
  return trajectoryFromSession(p, host, {});
}

test("每个宿主的 uid 能力由实测决定，不由声明决定", () => {
  for (const host of Object.keys(FIXTURES)) {
    const steps = stepsFor(host);
    assert.ok(steps.length, `${host}: 连步骤都解析不出来`);
    const hasUid = steps.every((s) => Boolean(s.uid));
    assert.equal(hasUid, supports(host, "uid"),
      `${host}: SUPPORT 表说 uid=${supports(host, "uid")}，实测 ${hasUid} —— `
      + "表和现实必须一致，否则一张跨宿主的漂亮表格会把一条能跑的路径说成四条");
  }
});

test("没有 uid 的宿主，观察器必须自己承认它跑不起来", async () => {
  const { observerUsable } = await import("../src/outsider-host-support.js");
  for (const host of Object.keys(FIXTURES)) {
    const steps = stepsFor(host);
    const usable = steps.every((s) => Boolean(s.uid));
    assert.equal(observerUsable(host), usable,
      `${host}: 没有唯一事件身份就没有锚点，没有锚点就永远是 unknown —— `
      + "这种情况下观察器不是「有 bug」，是根本没在运行");
  }
});

test("每一条能力都要么被证明，要么是 false", () => {
  for (const [host, caps] of Object.entries(SUPPORT)) {
    for (const [cap, val] of Object.entries(caps)) {
      assert.equal(typeof val, "boolean", `${host}.${cap} 必须是明确的真假，不能是"大概"`);
    }
  }
  /* 实测过的两条硬事实，不许被悄悄改坏 */
  assert.equal(supports("codex", "contextToModel"), false,
    "实测：codex 上 allow+additionalContext 里的内容模型看不到，session JSONL 里也没有");
  assert.equal(supports("codex", "uid"), true,
    "实测：Codex function_call/function_call_output 的 call_id 被保留为唯一事件身份");
});
