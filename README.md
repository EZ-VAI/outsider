# Outsider Stage 0.5

> **Open-source beta.** Outsider controls only Claude Code and Cowork surfaces
> that pass its runtime conformance checks. It is not an OS sandbox and cannot
> guarantee that a model is universally correct.

[Releases](https://github.com/EZ-VAI/outsider/releases) ·
[Security](SECURITY.md) · [Privacy](PRIVACY.md) ·
[Contributing](CONTRIBUTING.md)

Outsider 是一个安装在 Claude 工作流背后的本地 controller。你继续使用原来的 Claude Code、Claude Desktop Code
标签页或 Cowork；Outsider 在后台保存任务标准、观察长任务和多 Agent 轨迹、发现偏航、送达纠正，并在结束前独立验证结果。

它重点处理单条安全检查很难发现的长程问题：任务逐步做偏、重复消耗、遗漏约束、子 Agent 之间冲突，以及“公开测试通过、
实际实现仍然错误”的假绿。正常路径不会增加确认框；需要干预或无法证明完成时，它才会暂停并明确说明原因。

## 能做什么

- 逐字保存用户目标，并在第一次工具动作前冻结本次运行的 operator contract；
- 自动发现仓库自己的验收命令，也支持 `.outsider.json` 显式配置；
- 按会话隔离记录工具调用、测试结果、变更、子 Agent 任务图和 controller generation；
- 周期性做独立语义检查，在同步 hook 边界暂停偏航 worker 并送达最小纠正计划；
- 在 Stop 前同时检查机械验收、语义结果和反方审计；
- 对 controller、sidecar 或会话异常进行 fail-closed 恢复，而不是静默变成 open loop；
- 为每个完成运行生成 hash-chained events、evidence manifest 和可独立验证的终态。

Outsider 不替 Claude 执行模型生成的命令，也不会把“最终结果正确”自动冒充成“Outsider 导致了修复”。证据会区分安全交付、
正确但无法归因的交付、在控制边界被阻断的错误、保守停机和未完成运行。

## 支持面

| Surface | 当前支持 |
| --- | --- |
| Claude Code CLI（macOS / Linux） | 支持；安装 hook 后透明工作 |
| Claude Desktop Code 标签页 | 支持；使用同一套原生 Claude Code hooks |
| Claude Desktop Cowork（macOS） | 支持；需要 Release 中的 plugin ZIP 和本机 helper |
| 远程 Cowork | 仅在实际 hook/helper 握手并留下 conformance 记录后支持 |
| 普通 Claude Chat | 不支持；该 surface 不运行 hooks |
| Codex、Trae、DeepSeek Harness | 不在本产品的受控闭环承诺内 |

`outsider doctor` 会分别报告“hook 已安装”“Cowork plugin/helper 已就绪”和“该 surface 在真实运行中触发过”，不会只因插件可见
就声称监督正在运行。

## 安装

需要 Node.js 20 或更高版本。从 [最新 GitHub Release](https://github.com/EZ-VAI/outsider/releases/latest) 下载：

- `outsider-guard-1.3.97.tgz`；
- `SHA256SUMS`；
- 若使用 Cowork，再下载 `outsider-guard-1.3.97-claude.plugin.zip`。

先核对下载文件的 SHA-256，再从一个**不依赖当前 Claude/Cowork 会话**的独立终端安装：

```bash
shasum -a 256 outsider-guard-1.3.97.tgz
npm install -g ./outsider-guard-1.3.97.tgz
outsider doctor
outsider install --scope user
```

`--scope user` 会明确写入 `~/.claude/settings.json`，并对本机所有 Claude 项目生效。安装完成后关闭旧会话并新开一个会话。

如果 npm 全局目录报 `EACCES`，请使用用户可写的 npm prefix，不要用 `sudo` 安装：

```bash
npm install -g --prefix "$HOME/.local" ./outsider-guard-1.3.97.tgz
export PATH="$HOME/.local/bin:$PATH"
outsider doctor
outsider install --scope user
```

将 `~/.local/bin` 持久加入 shell 的 `PATH`。若只想控制一个仓库，可在该仓库内安装 project scope：

```bash
cd your-project
outsider install --scope project
```

它只写当前仓库的 `.claude/settings.json`。之后无需使用新的工作入口：

```bash
cd your-project
claude
```

也可以从源码验证并安装：

```bash
git clone https://github.com/EZ-VAI/outsider.git
cd outsider
npm ci
npm test
npm run test:corpus
npm install -g .
outsider install --scope user
```

## Claude Desktop / Cowork

Claude Desktop 的 Code 标签页使用原生 Claude Code hooks；完成上述安装后即可透明工作。

Cowork 还需要两部分：

1. `outsider install --scope user` 注册本机 macOS helper；
2. 在 Claude Desktop 的 plugin 管理界面上传同一 Release 的
   `outsider-guard-1.3.97-claude.plugin.zip`，然后新建 Cowork 会话。

plugin 是经过认证的薄客户端，controller 状态由 sandbox 外的 helper 持有。如果远程 Cowork 无法访问本机 helper，Outsider 会把
该会话标为 unsupported，而不是 fail-closed 拦死所有工具调用。

安装后先检查：

```bash
outsider doctor
```

只有 `runtime seen` 或等价的真实 conformance 结果，才表示对应 surface 已经被实际观测到。

## 合同与验收

Outsider 按以下顺序发现 repo-owned acceptance：

1. `.outsider.json` 的 `acceptance`；
2. `package.json` 的 `test`，其次是 `check` / `verify` / `ci`；
3. Python、Cargo、Go 或 Make 的标准仓库入口。

需要固定命令时，在仓库根目录添加：

```json
{
  "acceptance": "npm run test:sealed"
}
```

没有可执行验收时，Outsider 会明确降为 observer-only；它不会编造一条永远为绿的命令。知识工作或非代码任务若要获得完整终态
证明，也需要提供可执行的 artifact-specific acceptance。

## 查看与验证运行

透明会话状态默认保存在 `~/.outsider/attached/`，显式无头运行保存在 `~/.outsider/runs/`。目录权限为 `0700`，证据文件为
`0600`。

```bash
outsider runs
outsider show <run-id>
outsider verify /absolute/path/to/run
```

`verify` 会重新检查事件哈希链、合同和验收绑定、终态顺序及 evidence manifest。`outsider run` 仍可用于 CI、显式无头任务和
release canary，但不是普通用户的主入口：

```bash
outsider run "完成这个任务" --accept "npm test" --max-budget-usd 20
```

## 可选贡献运行数据

**默认不上传。** 普通安装不会启用遥测，也不会发送源码、prompt、transcript、文件路径、命令输出、凭证或 raw event stream。
运行结束后，隐私压缩的 Experience 仍只保存在本机。

用户可以先离线查看将要贡献的精确白名单记录：

```bash
outsider share preview <run-id>
```

`preview` 不发起网络请求。若决定贡献，先从当前 tag 下载并校验网关的 Ed25519 公钥：

```bash
curl -fsSLo outsider-server-public-key.pem \
  https://raw.githubusercontent.com/EZ-VAI/outsider/v1.3.97/deploy/cloudflare-experience-gateway/server-public-key.pem
echo "f6989604603342300aa73c27f5ea27ad681eabf816a976bdfa527468664587cb  outsider-server-public-key.pem" \
  | shasum -a 256 -c -
```

然后显式启用当前官方网关：

```bash
outsider share enable \
  --endpoint https://outsider-experience-gateway.outsider-guard.workers.dev \
  --server-public-key ./outsider-server-public-key.pem \
  --accept-policy
```

`enable` 只写本地同意记录，不会发送历史或未来运行。每一条运行仍必须单独发送：

```bash
outsider share send <run-id>
outsider share status
```

发送内容是已封印运行的严格 allowlist projection 和绑定签名；服务端返回可验证回执并按记录哈希去重。接收记录默认只进入
`QUARANTINED`，不会因自报数据直接获得更高可信级别。停止未来发送或请求撤回：

```bash
outsider share disable
outsider share revoke --send --reason USER_REQUEST
```

完整字段、签名、保留和删除规则见 [Experience Contribution Gateway](docs/EXPERIENCE-CONTRIBUTIONS.md) 与
[Privacy Policy](PRIVACY.md)。只信任同一 GitHub Release 同时发布的 endpoint 与服务器公钥，不要使用 issue、评论或聊天中单独出现的地址。

## Demo 与本地验证

[Stage 0.5 demo](deploy/cloudflare-product-demo/) 回放一条经过隐私投影的真实 Claude Agent Team canary。浏览器会重新计算公开
artifact 哈希，并验证从暂停、诊断、纠正送达、行为改变到独立验收的有序证据链。它是固定证据回放，不伪装成在线 agent
执行或客户生产数据。

```bash
npm run demo:serve

# 完整确定性验证
npm test
npm run test:corpus
```

公开 demo 地址以仓库 homepage 和最新 Release 为准。构建、证书和 release artifact 的复现说明见
[Public release procedure](docs/PUBLIC-RELEASE.md)。

## 已知 beta 边界

- 覆盖范围只包括通过 runtime conformance 的 Claude Code/Cowork surface；
- Outsider 是生命周期 controller 和证据系统，不是进程级或操作系统级 sandbox；
- 单一 canary 或错误夹具的结果只适用于对应版本、环境和仪器，不能外推为通用正确率；
- Claude 同步 hook timeout 为 900 秒，Outsider 自预算为 890 秒。sidecar 卡住时一次工具调用最坏可能等待约 15 分钟，之后会返回
  明确 deny；看到长时间暂停时请从独立终端运行 `outsider doctor`，不要在原会话中重装。
