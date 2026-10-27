# Outsider

[English](README.md) | [简体中文](README.zh-CN.md)

**一个面向不同提供方 Agent 的 mutual layer，让它们围绕一个或多个目标，共同操作同一个页面或界面。**

Outsider 提供共同的协调入口：Agent 可以领取任务、查看共享界面、协调操作，并把结果交给其他 Agent。资源所有者决定哪些 Agent 和浏览器会话可以接入。各方可通过 MCP 或 HTTP 连接，无需使用相同的模型或 Agent 框架。

## 目前能做什么

- **共同操作浏览器。** Agent 可以读取页面文本和可操作元素、获取截图，并以一个有序操作批次完成点击、输入、按键、选择或勾选。Playwright adapter 将 Agent 接到对应的浏览器页面。
- **不同浏览器访问同一个共享页面。** 示例使用 Chrome 和 Edge 操作同一个 Web 应用。Agent 也可以共用一个浏览器标签页；独立浏览器会话之间的内容同步由应用本身提供。
- **一个或多个 goal。** Agent 可以领取并行或有依赖的任务，接收前序任务已验收的输出，并提交自己的结果供所有者配置的验证器检查。
- **协调和交接。** 任务领取权可以续期或移交；共享资源使用互斥访问、状态检查和稳定操作 ID。写入结果不明时，可以先核对原操作，再继续写入。
- **跨提供方接入。** MCP 服务将这些能力提供给兼容的 Agent 客户端；其他客户端可以使用 HTTP 或 JavaScript 接口。

浏览器 adapter 使用资源所有者提供的 Playwright `Page`；页面访问、身份认证和验收条件由所有者配置。集成测试实际运行 Chrome 和 Edge。

## 运行

需要 **Node.js 22 或更高版本**，以及本机 Chrome 和 Edge：

```bash
npm ci
npm run demo:browser
npm test
```

示例会启动隔离的 Chrome、Edge 和三个 MCP 服务进程，代表两类 Agent，共同编辑并发布一个真实网页，同时完成两个 goal。示例使用脚本客户端和本地 Web 应用，不需要模型凭证。`npm run test:browser` 可以单独运行浏览器集成测试。

若已登录 Codex 和 Claude Code，可用 `npm run demo:live-agents` 运行真实 Agent 协作示例。这个可选命令使用现有账户额度，其中 Claude Code 调用的预算上限为 0.25 美元。

要接入现有 Agent 或浏览器，请看[浏览器与 Agent 接入指南](docs/MUTUAL-AGENT-LAYER.md)：其中说明了所有者网关、浏览器页面连接、MCP 工具、凭证、goal 定义和恢复方式。组件结构见[架构说明](docs/ARCHITECTURE.md)。

## 参与贡献

欢迎贡献 Agent 提供方接入、浏览器 adapter、页面观察方式和可复现的跨 Agent 交接案例。详见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 许可证

[Apache License 2.0](LICENSE)。
