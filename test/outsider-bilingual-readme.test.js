import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const english = readFileSync(new URL("../README.md", import.meta.url), "utf8");
const chinese = readFileSync(new URL("../README.zh-CN.md", import.meta.url), "utf8");
const social = readFileSync(new URL("../docs/SOCIAL-ANNOUNCEMENT-1.3.98.md",
  import.meta.url), "utf8");

test("public README files are complete reciprocal language surfaces", () => {
  assert.match(english, /^# Outsider/m);
  assert.match(chinese, /^# Outsider/m);
  assert.match(english, /\[简体中文\]\(README\.zh-CN\.md\)/);
  assert.match(chinese, /\[English\]\(README\.md\)/);
  for (const body of [english, chinese]) {
    for (const target of ["docs/ARCHITECTURE.md", "CONTRIBUTING.md", "LICENSE"]) {
      assert(body.includes(`](${target})`), `README must link to ${target}`);
      assert(existsSync(new URL(`../${target}`, import.meta.url)), `missing ${target}`);
    }
    assert.match(body, /OutcomeProgram/);
    assert.match(body, /0\.5 — MEASURE/);
    assert.match(body, /4 — CLAIMS \/ SETTLE/);
  }
});

test("social copy keeps ChatGPT structural eligibility separate from live validation", () => {
  assert.match(social, /eligible ChatGPT accounts and workspaces/i);
  assert.match(social, /live Desktop installation and new-chat evaluation are not yet established/i);
  assert.match(social, /具备插件资格的 ChatGPT 账户与工作区/);
  assert.match(social, /ChatGPT Desktop 实机安装和新对话评测尚未建立/);
  assert.doesNotMatch(social, /ChatGPT can install the Outsider skill/i);
});

test("both README files provide the source contribution workflow", () => {
  for (const body of [english, chinese]) {
    assert.match(body, /Node\.js 22/);
    assert.match(body, /npm ci/);
    assert.match(body, /npm test/);
    for (const target of ["test/outsider-world-state-resource-planner.test.js",
      "test/outsider-durable-outcome-program-orchestrator-v1.test.js"]) {
      assert(body.includes(`node --test ${target}`));
      assert(existsSync(new URL(`../${target}`, import.meta.url)), `missing ${target}`);
    }
  }
});

test("both README files distinguish local coordination from live adapters and financial authority", () => {
  for (const body of [english, chinese]) {
    assert.match(body, /NON_BINDING_ABSTAIN/);
    assert.match(body, /`HOLD`/);
    assert.match(body, /adapter/i);
  }
  assert.match(english, /Actual pages and devices need their own adapters/);
  assert.match(english, /does not require a live cloud account or move money/);
  assert.match(english, /not a claim that a global financial clearing network is operating/);
  assert.match(chinese, /具体页面和设备需要接入 adapter/);
  assert.match(chinese, /默认不需要云账号，也不会移动资金/);
  assert.match(chinese, /目前没有运营覆盖任意现实目标的全球金融清算网络/);
});
