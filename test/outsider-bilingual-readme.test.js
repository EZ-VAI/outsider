import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const english = readFileSync(new URL("../README.md", import.meta.url), "utf8");
const chinese = readFileSync(new URL("../README.zh-CN.md", import.meta.url), "utf8");
const social = readFileSync(new URL("../docs/SOCIAL-ANNOUNCEMENT-1.3.98.md",
  import.meta.url), "utf8");
const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

test("public README files are complete reciprocal language surfaces", () => {
  assert.match(english, /^# Outsider/m);
  assert.match(chinese, /^# Outsider/m);
  assert.match(english, /\[简体中文\]\(README\.zh-CN\.md\)/);
  assert.match(chinese, /\[English\]\(README\.md\)/);
  assert(english.length > 8_000, "English README is not a token summary");
  assert(chinese.length > 8_000, "Chinese README is not a token summary");
});

test("social copy keeps ChatGPT structural eligibility separate from live validation", () => {
  assert.match(social, /eligible ChatGPT accounts and workspaces/i);
  assert.match(social, /live Desktop installation and new-chat evaluation are not yet established/i);
  assert.match(social, /具备插件资格的 ChatGPT 账户与工作区/);
  assert.match(social, /ChatGPT Desktop 实机安装和新对话评测尚未建立/);
  assert.doesNotMatch(social, /ChatGPT can install the Outsider skill/i);
});

test("both README files bind one release identity and install workflow", () => {
  const escapedVersion = pkg.version.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  for (const body of [english, chinese]) {
    assert.match(body, new RegExp(`outsider-guard-${escapedVersion}\\.tgz`));
    assert.match(body, /codex plugin marketplace add EZ-VAI\/outsider --ref v1\.3\.98/);
    assert.match(body, /codex plugin add outsider-stage05@outsider/);
    assert.match(body, /outsider doctor --json/);
    assert.match(body, /outsider doctor --share-json/);
    assert.match(body, /git clone --branch v1\.3\.98 --depth 1/);
    assert.doesNotMatch(body, /outsider-guard-1\.3\.97/);
    assert.match(body, /v1\.3\.98.*(?:published|发布)/is);
  }
});

test("both README files preserve ChatGPT and Codex claim boundaries", () => {
  assert.match(english, /ChatGPT conversations do not expose a universal pre-tool\/post-tool\/stop lifecycle/i);
  assert.match(english, /Codex hooks are a guardrail, not complete tool coverage/i);
  assert.match(chinese, /普通 ChatGPT 对话没有通用 pre\/post\/stop 生命周期/);
  assert.match(chinese, /hosted tools 与部分特殊路径不经过 hooks/);
  assert.match(english, /live ChatGPT\s+Desktop install and new-chat evaluation are not yet established/i);
  assert.match(chinese, /真实 ChatGPT Desktop 安装与\s*新会话评测尚未建立/);
  assert.match(english, /OUTSIDER_SUPERVISOR_ARGV/);
  assert.match(chinese, /OUTSIDER_SUPERVISOR_ARGV/);
  assert.match(english, /controller\/RunStore/);
  assert.match(chinese, /controller\/RunStore/);
  assert.match(english, /write_stdin/);
  assert.match(chinese, /write_stdin/);
  assert.match(english, /endpoint-from-the-same-reviewed-release/);
  assert.match(chinese, /endpoint-from-the-same-reviewed-release/);
  assert.match(english, /public universal Plugins Directory/);
  assert.match(chinese, /公共 universal\s+Plugins Directory/);
  for (const body of [english, chinese]) assert.match(body, /repo\/local\s+marketplace/);
});
