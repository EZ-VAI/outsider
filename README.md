# Outsider Stage 0.5

> **Open-source beta.** Outsider controls only the Claude Code and Cowork
> surfaces that pass its runtime conformance checks. It is not yet a stable
> release, an OS sandbox, an insurer, or a guarantee of universally correct
> model behavior.

[Releases](https://github.com/eric20050115/outsider/releases) ·
[Security](SECURITY.md) · [Privacy](PRIVACY.md) ·
[Contributing](CONTRIBUTING.md)

Outsider 是本地 work agent 的透明自治监工。安装后，用户继续在原来的 Claude Code 终端、Claude Desktop 的 Code
标签页或 Cowork 里工作；不需要把日常习惯改成 `outsider run`，也不需要每隔半小时回来点确认。

它要解决的不是单条命令是否危险，而是长任务里的慢性偏航：架构逐步做偏、无关分支和 token 浪费、打地鼠式修错、
遗忘工程核心，以及“测试绿了但发动机是错的”这种 literal completion。

## 安装

推荐从 [GitHub Releases](https://github.com/eric20050115/outsider/releases/latest)
下载最新的 `outsider-guard-<version>.tgz`，先按同一 Release 附带的
`SHA256SUMS` 校验，再安装：

```bash
npm install -g ./outsider-guard-<version>.tgz
outsider doctor
outsider install --scope user
```

也可以从源码安装并先运行完整的确定性验证：

```bash
git clone https://github.com/eric20050115/outsider.git
cd outsider
npm ci
npm test
npm run test:corpus
npm install -g .
outsider install --scope user
```

`--scope user` 会明确写入 `~/.claude/settings.json`，对本机所有 Claude 项目生效。不要在正在依赖的 Claude/Cowork
会话里执行安装；从独立终端安装，然后新开会话。若只想试一个仓库：

```bash
cd your-project
outsider install --scope project
```

这只写当前仓库的 `.claude/settings.json`，不会注入用户级 Claude settings。之后照常使用：

```bash
cd your-project
claude
```

## 用户看到的产品

健康路径里 Outsider 默默返回 allow，不增加确认框。只有确实发现偏航时，它才会在 Claude 已经提供的同步工具/Stop
边界暂停当前 worker，独立诊断，送入具体纠正计划，再观察计划是否被执行。只有 repo 自己的机械验收和独立语义
验收都通过，才会签成可交付终态；预算耗尽或证明失败会显式终止为红，不会伪称完成，也不会留下无人可恢复的 Stop 墙。

`outsider run` 仍保留给 CI、显式无头任务和 release canary；它不再是普通用户的主入口。

## Claude Desktop

- **Desktop 的 Claude Code / Code 标签页**：与终端 Claude Code 共用原生 hook 配置；`outsider install` 后透明工作。
- **Cowork**：`outsider install --scope user` 会显式注册一个用户级 macOS LaunchAgent；它在 Claude Hosted Plugin
  sandbox 外持有独立 supervisor 身份。再从同一 GitHub Release 安装
  `outsider-guard-<version>-claude.plugin.zip`，以后正常聊天即可。
  插件只是经过认证的薄客户端，不会在读不到 Keychain 的 sandbox 内静默降级。hooks 只在 Cowork 运行，不在普通 Chat 运行。
- **普通 Claude Chat**：Anthropic 当前不运行 plugin hooks，因此它不是可同步控制的 agent surface。Outsider 不会把
  “插件可见”冒充成“监督正在运行”。
- **远程 Cowork**：只有实际收到 SessionStart/UserPromptSubmit/PreToolUse/Stop 且留下 conformance 记录后才标为受控；
  不能访问本地 hook/sidecar 的会话明确保持 unsupported。

查看本机能力：

```bash
outsider doctor
```

`doctor` 会把“插件已打包”“hook 已安装”和“这个 surface 真正触发过”分开报告。

## 真实运行演示

仓库内的 [Stage 0.5 demo](deploy/cloudflare-product-demo/) 回放一条经过隐私投影的、真实封存 Claude Agent Team
canary。浏览器会重新计算公开证据 artifact 的哈希，并验证从暂停、诊断、纠正送达、行为改变到独立验收的有序因果链；
它不会伪造一次在线 agent 执行，也不会把评测 canary 说成客户生产数据。公开部署地址以仓库 homepage 和最新
GitHub Release 为准；本地可运行：

```bash
npm run demo:serve
```

## 内核闭环

```text
用户原话
  → UserPromptSubmit 冻结逐字 operator ledger 与版本链
  → 第一个工具边界在动作执行前逐字封印 operator contract（不串行调用 LLM 编译器）
  → 自动发现并在 t=0 封存 repo-owned acceptance
  → lazy sidecar 按 session 隔离 controller
  → Pre/PostToolUse 记录主 agent、子 agent、diff、test exit、token/轨迹
  → 周期性独立语义巡检（不是等机械 detector 报警）
  → 偏航时在同步安全边界暂停
  → fresh supervisor 诊断根因；controller 将其收缩为最小 correction authority
  → 只审计并送达独立语义缺口、修复步骤、受保护文件哈希和闭集动作；散文遥测没有控制权
  → authority hash 绑定 audit→delivery→observed→effect→resolved；controller 不执行模型生成命令
  → Stop 时机械验收 + 独立语义验收 + PASS 反方审计
  → 因果链和 evidence manifest 完整后才结束
```

主机拥有 Claude 进程，Outsider 拥有控制边界。这避免强迫用户换入口，同时仍能真正暂停、指导、恢复和验收。
hook 只是短命 RPC client；唯一可写监管状态的是带租约、可恢复的 controller generation。

## 自动合同与验收

每次用户提交 prompt，Outsider 都把原文写入 controller-owned ledger；第一个工具动作前以确定性、逐字无损合同直接封印，
不再让多个 LLM 在 worker 开工前串行改写标准。普通无工具聊天不启动 controller。中途追加要求会 supersede 旧 run，以新 seal
重开，不允许正在偏航的 worker 改写标准，也不会让上下文压缩抹掉合同。

验收发现顺序：

1. `.outsider.json` 的显式 `acceptance`；
2. `package.json` 的 `test`（其次 `check` / `verify` / `ci`）；
3. Python、Cargo、Go、Make 的仓库标准入口。

示例：

```json
{
  "acceptance": "npm run test:sealed"
}
```

没有 repo-owned acceptance 时，Outsider 会诚实降为 observer-only，并把这个事实注入 Claude 上下文；它不会发明一条
永远为绿的命令来冒充 Stage 0.5 证明。知识工作/Cowork 任务要获得完整保证，仍需提供可执行验收或后续的 artifact-specific
acceptance provider。

## 多 agent 与恢复

- SubagentStart/SubagentStop 与 Agent Teams 的 TaskCreated/TaskCompleted/TeammateIdle 进入同一任务图；依赖环、未完成依赖、
  文件冲突和无法唯一归属的任务都显式记录，不靠猜。
- controller 进程 SIGKILL 后 watchdog 以同一合同 seal、supervisor identity、事件链和预算恢复；旧 generation 失去租约后
  不能继续判卷。
- attached daemon 被杀后，下一个正常 hook 会 lazy restart；session ledger 中的 run socket/token 用于重新连接仍存活的
  controller。边界也死亡时，以同一 operator ledger 和当前 baseline 重建，绝不静默 open-loop。
- 同一个宿主 session id 若出现在不同 cwd（常见于嵌套启动继承 `CLAUDE_CODE_SESSION_ID`），会记录 identity conflict
  并 fail-closed；不会把两个仓库的轨迹静默合并。
- PreCompact 先持久化合同/registry，避免长任务压缩后忘掉目标。

## 证据与边界

状态默认位于 `~/.outsider/attached/`（透明会话）和 `~/.outsider/runs/`（显式 run），目录 0700、证据 0600。
每个完成 run 都有冻结合同、hash-chained events、私有 evidence manifest、hash-only public derivative 和 canonical projection。
`run_finalized`/`gate_containment_finalized` 必须是事件流最后一条；controller lease 完全释放后 manifest 才能落盘，且 manifest
一旦存在，event/state/lease 都进入只读状态。

存证的终态分开计量：`SAFE_DELIVERY` 是交付正确且完整因果链成立；`VERIFIED_DELIVERY_UNATTRIBUTED` 是交付物已独立
验证为正确、但 Outsider 不能证明自己导致了修复；`CONTROL_BOUNDARY_CONTAINMENT` 是构造性假绿攻击在同步闸门被拦住；
`CONSERVATIVE_STOP` 是终止为红且未形成交付证明。后三者永远不冒充 Stage 0.5 闭环。`run_finalized` 后不再返回一个没有
controller 可以恢复的 Stop block；终态会明确披露并幂等结束。

```bash
outsider runs
outsider show <run-id>
outsider verify /absolute/path/to/run
outsider attest /path/run-a /path/run-b --out /path/attestation.json
```

当前产品承诺只覆盖经过 hook conformance 的 Claude Code/Cowork surface。Codex、Trae 仍只有旧 observer/日志分析，
不宣称 Stage 0.5 闭环。Desktop 普通 Chat、无法执行 hooks 的远程 Cowork 也不在保证内。

## 贡献 Experience（默认关闭）

安装 Outsider **不会**把源码、prompt、transcript 或运行数据上传给任何后台。完成 run 的隐私压缩 Experience 默认只留在
本机。可选的贡献网关必须由用户显式开启，而且每次发送仍需单独执行 `share send`：

```bash
# 无网络、无同意变更：先看将要贡献的精确白名单记录
outsider share preview <run-id>

# 只有官方 Release 给出 HTTPS endpoint 与固定的服务器公钥后才能开启
outsider share enable \
  --endpoint https://contributions.example.com \
  --server-public-key ./server-public.pem \
  --accept-policy

outsider share send <run-id>
outsider share status
outsider share disable
outsider share revoke --reason "user request"
```

客户端只发送从已封印 `supervised-experience/v2` 再做一次严格白名单投影的贡献记录，以及绑定该记录的签名 ATTEST；
不会发送 raw event stream。协议使用一次性服务器 challenge、设备 Ed25519 签名、Experience hash 去重和服务器签名回执。
服务端接收后的唯一默认状态是 `QUARANTINED`，所有 PRICE/GUARANTEE/SETTLE 权限均为 false。匿名自报数据即使来自已知
版本，也只是 L1/L2 研究证据；没有 owner confirmation、独立 adjudication 与真实 loss label，不能用于保险定价或赔付。

当前仓库交付的是客户端、可验证协议和 quarantine-only 参考接收服务。只有在 GitHub Release 元数据中同时发布 HTTPS
endpoint 和服务器公钥后，才应把某个网关视为官方入口；不要信任 issue、评论或聊天里单独出现的 endpoint。
部署与数据治理边界见 [Experience Contribution Gateway](docs/EXPERIENCE-CONTRIBUTIONS.md)。

## Global Outsider（研究预览）

跨运营商层现在可以把 Codex → DeepSeek Harness → Claude → Trae 表示为同一张可验证图：协调方先签一份不带执行权的
全局任务计划，冻结 owner、instrument、Way、依赖、scope 和各 surface 的声明上限；每个运营方只有签署自己的
task-bound checkpoint 才算接受。全局 monitor 拒绝依赖未完成就开工、任务换 run、输入承诺替换和计划外 handoff；
双边交接仍由发送方 offer 和接收方 receipt 两次独立签名组成。持久化 registry 拒绝 nonce 重放、逐条重验签并按
tenant 隔离读取。全局节点不持有双方私钥，也不获得任何宿主的 root 权限。

这不是把四个宿主虚构成同一种能力。Claude 的已验证闭环仍只在本地 Claude controller；DeepSeek 当前最多证明纠正已
持久送达和有限行为效果；Codex/Trae 仍是 observer-only。全局监督记录只进入路由研究，不能进入因果效果、独立可靠性、
损失、定价、担保或结算分母。plan-aware monitor 会另产出 routing/liveness-only 的监督记录，不会偷渡进本地因果效果模型。
完整协议与 CLI 见 [Global Outsider federation](docs/GLOBAL-OUTSIDER.md)。

## 构建与验证

```bash
npm test
npm run test:corpus
npm run release:build
npm run release:certify
npm run release:metadata
```

Field evidence is never imported by editing a status flag. After the exact
artifact has completed a gate, pass its immutable result directory back to the
certifier:

```bash
npm run release:certify -- \
  --r1-run /absolute/r1 \
  --r2-run /absolute/r2 \
  --r3-run /absolute/r3 \
  --r4-run /absolute/r4 \
  --endurance-run /absolute/r5/run-directory
```

The certifier re-verifies every seal and rejects a different package version,
artifact hash, runtime closure or evaluator hash. Partial evidence remains
explicitly `NOT_RUN`/`FAIL`; an older package's PASS cannot be inherited.

发布构建会：

- 跑完整协议测试与 125 条 corpus；
- 从干净解压的 npm artifact 再跑一遍；
- 生成 npm 安装包与 Claude Desktop/Cowork plugin zip；
- 验证正常 `outsider-hook` 能在没有 `outsider run` 环境变量时 lazy 启动认证 sidecar；
- 把 Desktop plugin “已打包”和“已真机 conformance”分开写入 release certificate。

公开发版的 artifact、隐私投影证书、checksum 和版本冻结规则见
[Public release procedure](docs/PUBLIC-RELEASE.md)。

确定性 release-gate、四类假绿 fixture、多 agent recovery family 与真实 Claude canary 仍保留在 `scripts/`。这些数据只对
命名 artifact、fixture 和环境成立；不会把单一错误族的 0 假绿外推成真实世界通用正确率。

## Open-source beta 的等待边界

Claude 的同步 hook timeout 是 900 秒，Outsider 自预算是 890 秒，保证 sidecar 卡住时能在宿主杀死 hook 前返回明确 deny。
代价是一次 PreToolUse/Stop 最坏会可见地等待约 15 分钟。它不会静默放行，但 beta 用户应把这当作已知锐边；
看到长时间暂停时可从独立终端运行 `outsider doctor`，不要在原会话里重装。
