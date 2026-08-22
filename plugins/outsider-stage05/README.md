# Outsider Stage 0.5 universal plugin

[English](#english) · [简体中文](#简体中文)

## English

This repository plugin is discoverable by both ChatGPT and Codex. It packages
the Outsider install/verification skill and a Codex-only session boundary
notice. It deliberately does **not** claim that plugin installation alone
activates Stage 0.5.

For Codex, install the reviewed `outsider-guard` runtime first, add this repo as
a plugin marketplace, install `outsider-stage05`, restart Codex, and review the
exact hook definition in `/hooks`. Full control requires a real conformance
receipt. Codex hooks do not cover hosted tools or every specialized path.

```bash
codex plugin marketplace add EZ-VAI/outsider --ref <reviewed-tag>
codex plugin add outsider-stage05@outsider
```

In the ChatGPT desktop app, the same repo marketplace can expose the plugin in
the Plugins Directory. ChatGPT receives the skill, but ordinary ChatGPT
conversations do not expose a universal lifecycle interception boundary. Do
not describe that surface as fully controlled Stage 0.5.

## 简体中文

这个仓库插件可以被 ChatGPT 与 Codex 共同发现。它包含 Outsider 的安装/
验证 skill，以及仅在 Codex 运行的会话边界提示。它不会把“插件已安装”冒充成
“Stage 0.5 已经受控”。

Codex 用户应先安装审过的 `outsider-guard` runtime，再添加本仓库 marketplace、
安装 `outsider-stage05`、重启 Codex，并在 `/hooks` 中核对和信任精确 hook。
完整控制还必须有真实 conformance receipt。Codex hooks 不覆盖 hosted tools 和
所有特殊工具路径。

ChatGPT 桌面版可以从同一仓库 marketplace 看到这个插件并使用 skill；普通
ChatGPT 对话没有通用生命周期拦截，所以不能宣传成完整 Stage 0.5 受控。
