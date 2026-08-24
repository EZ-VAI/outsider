# Outsider Stage 0.5

[English](README.md) | [简体中文](README.zh-CN.md)

> **开源 Beta。** Outsider 是长任务 Agent 的本地生命周期 controller 与证据系统。
> 它不是操作系统沙箱，也不能保证模型永远正确。只有某个精确宿主 surface 通过真实
> runtime conformance 后，Outsider 才会对该 surface 声称受控。

[Releases](https://github.com/EZ-VAI/outsider/releases) ·
[Security](SECURITY.md) · [Privacy](PRIVACY.md) ·
[Contributing](CONTRIBUTING.md)

Outsider 是一个可接入 Claude 与 Codex 工作流、并在 ChatGPT/Codex 中提供通用插件 skill 的本地 controller。普通安装默认是
`local-only/no-external`：不会自动启动模型或把 workspace 证据交给第三方进程，且在没有独立
supervisor 的情况下只允许只读诊断。操作方另外配置 supervisor 命令并单独同意外部披露后，
你可以继续使用原来的 Claude Code、Claude Desktop Code 标签页或 Cowork；Outsider 才会在后台
冻结任务标准、观察长任务和多 Agent 轨迹、送达纠正，并在结束前独立验证结果。

它重点处理单条安全检查很难发现的长程问题：任务逐步做偏、重复消耗、遗漏约束、子 Agent 之间冲突，以及“公开测试通过、
实际实现仍然错误”的假绿。正常路径不会增加确认框；需要干预或无法证明完成时，它才会暂停并明确说明原因。

## 能做什么

- 逐字保存用户目标，并在第一次工具动作前冻结本次运行的 operator contract；
- 自动发现仓库自己的验收命令，也支持 `.outsider.json` 显式配置；
- 按会话隔离记录工具调用、测试结果、变更、子 Agent 任务图和 controller generation；
- 在显式配置并同意的 supervisor 边界内周期性做独立语义检查，在同步 hook 边界暂停偏航 worker 并送达最小纠正计划；
- 在 Stop 前同时检查机械验收、语义结果和反方审计；
- 对 controller、sidecar 或会话异常进行 fail-closed 恢复，而不是静默变成 open loop；
- 为每个完成运行生成 hash-chained events、evidence manifest 和可独立验证的终态。

Outsider 不替 Claude 执行模型生成的命令，也不会把“最终结果正确”自动冒充成“Outsider 导致了修复”。证据会区分安全交付、
正确但无法归因的交付、在控制边界被阻断的错误、保守停机和未完成运行。

## 支持面

安装、hook 配置、精确信任、runtime 观测和“已受控”是不同状态。
`outsider doctor --json` 用于本机诊断并会包含本地路径；若要把结果贴进聊天或发给别人，
只能使用脱敏投影 `outsider doctor --share-json`。

| Surface | 当前支持 |
| --- | --- |
| Claude Code CLI（macOS / Linux） | companion runtime 与原生 hooks 可安装；默认 local-only/read-only；受控仍需真实 conformance receipt |
| Claude Desktop Code 标签页 | 使用同一套 Claude Code hooks 与同一组 supervisor 双门 |
| Claude Desktop Cowork（macOS） | 需要同一 Release 的 plugin ZIP、本机 helper 与真实握手 |
| 远程 Cowork | 仅在该会话实际可达 helper 并留下 conformance 记录后支持 |
| 普通 Claude Chat | 不支持；该 surface 不运行所需 hooks |
| Codex CLI / Desktop / IDE | ChatGPT/Codex 通用插件与 companion runtime 均可安装；精确 1.3.99 源码 runtime 的一条 project-local 实机链路已经做到：绑定并独立核验一个只读子 Agent、拦截红色 Stop、送达并确认有限纠正、修复后独立复验转绿、第二次 Stop 放行、`SAFE_DELIVERY` 封存及 63-event 哈希链验证；用户仍必须在 `/hooks` 核对并信任精确 hook hash，hosted tools 与部分特殊路径不经过 hooks |
| ChatGPT Chat / Work | 插件包在开放本地插件源的账户/工作区中具备结构安装资格，但尚未完成 ChatGPT Desktop 实机安装；普通 ChatGPT 对话没有通用 pre/post/stop 生命周期，因此不是完整 Stage 0.5 全局受控 |
| DeepSeek Harness | 研究型 cooperative delivery adapter；不声明 production semantic effect 或恶意 worker/OS attestation |
| Trae、CodeBuddy | observer / wrapper only；不在受控闭环承诺内 |

`outsider doctor` 会分别报告“hook 已安装”“Cowork plugin/helper 已就绪”和“该 surface 在真实运行中触发过”，不会只因插件可见
就声称监督正在运行。

Codex 的 hosted tools 与部分 specialized path 可能绕过该 hook；对已有 unified exec session
调用 `write_stdin` 也不会再次触发 `PreToolUse`。因此 Codex hooks 是 guardrail，不是完整工具或 OS sandbox。

本次测试中的 Codex 宿主只暴露并信任了 10 个 project hook 定义，没有暴露当前 Codex
hook 文档中列出的 `SessionEnd`。`SessionEnd` 是 advisory 事件，它的输出不能纠正 Codex，
也不能让任务继续保持打开。因此 Outsider 会把缺失项明确报告为宿主能力缺口，不会声称
11-event 生命周期覆盖已经建立。上面的实机结果证明的是有实际后果的合同、工具、纠正、
Stop、复验与终态封存链路，不代表每一条文档事件或 hosted path 都已触发过。

## 安装

需要 Node.js 20 或更高版本。**只有在经过审查的 v1.3.99 release 已实际发布后**，才从
[GitHub Release](https://github.com/EZ-VAI/outsider/releases) 下载下列同一 release 的文件。
在此之前请使用下方本地源码 staging 流程，不要把 `latest` 页面误当成 v1.3.99 安装包：

- `outsider-guard-1.3.99.tgz`；
- 若使用 Cowork，再下载 `outsider-guard-1.3.99-claude.plugin.zip`；
- `release-certificate-public-1.3.99.json`；
- `SHA256SUMS`。

先核对下载文件的 SHA-256，再从一个**不依赖当前 Claude/Cowork 会话**的独立终端安装：

```bash
shasum -a 256 outsider-guard-1.3.99.tgz
npm install -g ./outsider-guard-1.3.99.tgz
outsider install --scope user
# 重启宿主并开始一个真实会话，然后运行：
outsider doctor --json
```

`--scope user` 会明确写入 `~/.claude/settings.json`，并对本机所有 Claude 项目生效。安装完成后关闭旧会话并新开一个会话。

如果 npm 全局目录报 `EACCES`，请使用用户可写的 npm prefix，不要用 `sudo` 安装：

```bash
npm install -g --prefix "$HOME/.local" ./outsider-guard-1.3.99.tgz
export PATH="$HOME/.local/bin:$PATH"
outsider install --scope user
# 重启宿主并开始一个真实会话，然后运行：
outsider doctor --json
```

将 `~/.local/bin` 持久加入 shell 的 `PATH`。若只想控制一个仓库，可在该仓库内安装 project scope：

```bash
cd your-project
outsider install --scope project
```

它只写当前仓库的 `.claude/settings.json`。此时仍是 local-only/read-only；之后无需使用新的工作入口：

```bash
cd your-project
claude
```

### 可选 external supervisor（显式双门）

完整语义控制需要同时给出 supervisor 命令和单独的披露同意。缺少任一项时，Outsider 不启动
外部进程、不发送 workspace/prompt/tool/output，并对潜在世界变更 fail-closed。user-scope
安装会把两项同时写入 Claude/Codex hook；macOS 上也会写入权限为用户私有的 Cowork helper 配置：

```bash
outsider install --scope user \
  --supervisor-argv '["claude","-p"]' \
  --allow-external-supervisor
```

安装器只接受 supervisor 的 executable/argv 身份。内联 token、API key、密码、私钥或带 query
的 URL 会被拒绝；请使用 supervisor 自己的受保护登录存储。现有 settings 若格式损坏、是 symlink、
在写入期间发生变化，安装会 fail-closed 且保持原样；成功更新前会在同目录留下 `0600` 的唯一隐藏备份。

在没有 system helper 的 CLI 环境，必须在启动宿主的同一环境中同时设置：

```bash
export OUTSIDER_SUPERVISOR_ARGV='["claude","-p"]'
export OUTSIDER_ALLOW_EXTERNAL_SUPERVISOR=1
claude
```

命令由操作方选择；它是否调用远程服务、如何保留输入以及适用何种服务条款，取决于该命令和
provider。Outsider 只发送递归最小化/脱敏后的 supervisor packet：敏感文件对象和二进制对象
不出境，子进程环境使用 allowlist，常见密钥、认证头和 URL query 会被移除。它仍可能包含完成
语义审查所需的非敏感源码片段、operator prompt、工具摘要和验收输出；脱敏器不是对任意未知
秘密格式的数学保证。启用前请先阅读 [Privacy Policy](PRIVACY.md)。

CodeBuddy、Trae 等 standalone/legacy adapter 不读取仓库可写的 `.outsider/run.json` 或
`.outsider/contract.json` 来获得 acceptance/supervisor 命令权限；只有 authenticated
controller/RunStore 路径能执行命令。它们仍是 observer/unsupported surface。

也可以从源码验证并安装。经过审查的 tag 发布后，必须把 checkout 精确绑定到该 tag；
tag 尚不存在时只能使用现有的已审查本地 checkout，不能把持续变化的远端 `main` 当成 v1.3.99：

```bash
git clone --branch v1.3.99 --depth 1 https://github.com/EZ-VAI/outsider.git
cd outsider
npm ci
npm test
npm run test:corpus
node scripts/stage05-public-package.mjs --out /tmp/outsider-stage05-public-1.3.99
npm install -g /tmp/outsider-stage05-public-1.3.99
outsider install --scope user
```

源码 checkout 包含开发测试和 operator 发布工具，因此直接 `npm install -g .` / `npm pack`
会明确拒绝；上面的 staging 步骤只复制审过的 Stage 0.5 import closure，并对实际成员集合与哈希做精确检查。

## 安装 ChatGPT / Codex 通用插件

仓库现在包含经过官方结构验证的通用插件 `plugins/outsider-stage05/`，以及 repo marketplace
`.agents/plugins/marketplace.json`。

### Codex CLI / Desktop / IDE

本地 checkout 可用 Codex CLI 注册 marketplace 并安装插件（路径填写仓库根目录）：

```bash
codex plugin marketplace add /path/to/outsider
codex plugin add outsider-stage05@outsider
```

在审过的 `v1.3.99` Git tag **确实发布以后**：

```bash
codex plugin marketplace add EZ-VAI/outsider --ref v1.3.99
codex plugin add outsider-stage05@outsider
```

安装后重启 Codex。Codex 用户还必须打开 `/hooks`，核对并信任精确
hook 定义；随后在真实会话后运行 `outsider doctor --json`。插件可见、runtime 已安装、
hook 已配置、hook 已信任、runtime seen 与 controlled 是六种不同状态，不能互相冒充。

### 具备资格的 ChatGPT Desktop 账号 / 工作区

上面的 Codex CLI 命令可以注册审过的 repo marketplace，但 ChatGPT 插件必须在 ChatGPT
Desktop 界面中安装和测试：

1. 将审过的 `v1.3.99` checkout 作为当前仓库，或先运行
   `codex plugin marketplace add EZ-VAI/outsider --ref v1.3.99` 注册 marketplace；
2. 重启 ChatGPT Desktop；
3. 打开 Plugins Directory，选择 **Outsider** marketplace source，安装
   **Outsider Stage 0.5**；
4. 新建启用了该插件的对话，并分别测试直接、间接、追问、负例和明确不支持的边界请求。

Plugins Directory 和本地 marketplace 是否可用由账号与工作区策略决定。ChatGPT 安装得到的是
Outsider skill；它不会替你安装 companion runtime，也不会在普通 ChatGPT 对话里建立全局生命周期拦截器。

这个插件包在结构上已满足 Codex，以及开放本地插件源的合格 ChatGPT 账号/工作区的
repo/local marketplace 安装要求；Codex 隔离安装已实测，但真实 ChatGPT Desktop 安装与
新会话评测尚未建立。具体可见性仍受宿主账号与工作区策略约束。进入 OpenAI 公共 universal
Plugins Directory 还需要单独提交和审核，在真正发布前不会声称已经上架。ChatGPT 侧获得的是安装/验收 skill，
不是隐藏的全局 interceptor；Codex 插件里的 hook 只提示能力边界，实际 Stage 0.5 控制仍由
companion runtime、精确信任和真实 conformance receipt 共同建立。

## Claude Desktop / Cowork

Claude Desktop 的 Code 标签页使用原生 Claude Code hooks；完成上述安装后即可透明工作。

Cowork 还需要两部分：

1. `outsider install --scope user` 注册本机 macOS helper；
2. 在 Claude Desktop 的 plugin 管理界面上传同一 Release 的
   `outsider-guard-1.3.99-claude.plugin.zip`，然后新建 Cowork 会话。

plugin 是经过认证的薄客户端，controller 状态由 sandbox 外的 helper 持有。如果远程 Cowork 无法访问本机 helper，Outsider 会把
该会话标为 unsupported，而不是 fail-closed 拦死所有工具调用。

安装后先检查：

```bash
outsider doctor --json
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
outsider run "完成这个任务" --accept "npm test" --max-budget-usd 20 \
  --supervisor-argv '["claude","-p"]' --allow-external-supervisor
```

## 可选贡献运行数据

**默认不上传，也不启动 external supervisor。** 普通安装不会启用遥测，也不会发送源码、prompt、transcript、文件路径、命令输出、凭证或 raw event stream。
运行结束后，隐私压缩的 Experience 仍只保存在本机。

这项默认值与上一节的可选 supervisor 是两个不同边界：只有同时配置命令并单独同意时，
脱敏后的最小 supervisor packet 才会交给该命令；贡献网关仍需另一套逐运行显式同意。

用户可以先离线查看将要贡献的精确白名单记录：

```bash
outsider share preview <run-id>
```

`preview` 不发起网络请求。若决定贡献，只使用同一个已审 GitHub Release 中发布并经 SHA-256
核对的 endpoint 与 Ed25519 公钥，然后显式启用：

```bash
outsider share enable \
  --endpoint <endpoint-from-the-same-reviewed-release> \
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

- 只有通过 runtime conformance 的精确宿主 surface 才能称为受控；
- ChatGPT 插件安装不会产生通用 ChatGPT 生命周期拦截；
- Codex 插件安装不会自动信任 hooks，也不覆盖 hosted/opt-out tool paths；
- Outsider 是生命周期 controller 和证据系统，不是进程级或操作系统级 sandbox；
- 单一 canary 或错误夹具的结果只适用于对应版本、环境和仪器，不能外推为通用正确率；
- Claude 同步 hook timeout 为 900 秒，Outsider 自预算为 890 秒。sidecar 卡住时一次工具调用最坏可能等待约 15 分钟，之后会返回
  明确 deny；看到长时间暂停时请从独立终端运行 `outsider doctor`，不要在原会话中重装。
