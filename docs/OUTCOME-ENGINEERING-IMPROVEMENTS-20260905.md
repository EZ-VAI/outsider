# Outsider 工程改良前序

日期：2026-09-05。执行顺序：本前序 → 原 0–8 工程计划。

本轮保留 Outcome OS、临时供应网络、跨 Agent 责任连续性与自动恢复方向。
改良直接进入现有代码和运行流程，不以访谈、销售试验或付费客户数量作为
继续工程的前置条件。原有数字履约与恢复成果、在线 Edge rail、卖方来源事实
均继续复用；当前实物采购主线继续推进。

本前序调整当前研发方式及计划解释。历史运行、合同、授权、回执和已封存
产物保持原样；已确认订单仍遵守其原始 profile，不能通过本前序放宽授权。

## 1 供给形成与交易接入同时推进

每个候选路线分别呈现两种进度：

- 交易进度：规格、含税总价、目的地 ETA；具体 checkout step 由交易产物承载。
- 容量进度：当前预留状态、接口获取动作及可预留替代路线。期限、行权、释放
  等事实随实际预留接入，当前不预填。

报价进度直接产生下一次来源获取动作；缺少容量能力时，另列原生预留接口
发现或资源 owner 接入动作。一个未知字段不使其他已授权工作停摆。
不要求卖方采用 Outsider 描述符；API、原生交易生命周期、现有平台容量接口
和用户持有节点继续作为入口。已有零售路线继续对账，也允许容量原生路线
并行加入。独立来源事实仍由现有 admission 处理。

实施位置：现有 formation materializer 与 decision runner 的 `routeProgress`。
输出应回答下一步做什么，而不是只重复一个总的 HOLD。

## 2 把恢复经济性嵌入路线选择

在现有决策输出比较主路线成功、主路线失败两种情景：

- 普通补救：失败时另行采购的成本。
- 预留恢复：持有费，加上未使用时的释放费，或使用时的行权费。

当前替代路线报价单列，保留其时间与来源；不能直接替代未来故障时价格。
金额齐备时计算情景差额，缺项用 null 并指出下一项成本来源。不凭空填失败
概率，也不因缺少概率而阻止执行接入、对账或容量发现。原报价保留观测时间
并标记尚未重新验证；补充成本按计划、候选与币种绑定，附来源引用。比较属于
决策辅助，不自行生成报价、付款或保证权限。

实施位置：现有 decision 输出的 `recoveryCostComparisons`，可选私有成本输入。
此项在运行中积累，不要求先启动独立商业试验。

## 3 把自动化目标应用到正确的边界

无人介入仍是自主订单的运行目标。接口开发、配置、账户接入、调试和历史
运行分析是建设工作；不能因这些工作涉及人，就阻止产品研发。
订单中的人工介入仍如实记录，不能算成无人订单，也不能在 COMMIT 后通过
修改 profile 隐藏。自动流程不引入隐形客服队列。

L1 继续接收目标、观察和候选；L2 依据已取得的恢复能力推进；严格 L3 保留
其双容量、见证和义务要求。未来容量池、回滚等不同保障方式按 profile
实现，不将一种实现拓扑追加为所有产品层的要求。本轮不改变既有 L3 门。

现有分层基础：`OUTSIDER-THREE-LAYER-OUTCOME-ARCHITECTURE.md`。

## 4 明确 COMMIT 的产品含义

COMMIT 表示各方接受了界定清楚、可追踪的结果义务。当前事实、取得的权利、
对未来的估计和失败后的救济分别呈现；每项从其现有来源读取。
承诺后遇到失败，进入恢复、补救或争议，而不是将订单悄悄退回未承诺状态。
现有严格 bundle 和 lifecycle 继续承担这一含义，不新增一套“证明未来”的
前置验证体系。

面向用户的说明优先回答：谁接住、何时完成、失败如何恢复、何时关闭义务。
工程字段用于执行与回放，不扩大用户的理解负担。

## 5 以可组合能力推进竞争优势

UCP 的订单与售后事件、AP2 的交易授权证据、其他 Agent 的规划与执行能力
均作为可复用输入。Outsider 的工程重点是跨提供方组合、持续义务、可执行
恢复和统一验收。供应方或 Agent 新增能力时，优先减少适配工作并增加可用路线。

不把“对手不会做”或“规范未覆盖”设置成系统前提；也不因尚无竞争排他性
证明而暂停工程。实际优势通过接入耗时、无需改代码可处理的目标、恢复时延、
费用和可用供给逐步积累。现阶段无需新增竞争评分器。

## 6 让运行反馈推动计划更新

战略与产品决定可更新；已执行订单及其证据不可改写。当前计划保持一个可读
入口，历史 checkpoint 留在原文中供检索，不要求读完全部历史才能继续。

每个工程 checkpoint 简短记录：改变了哪项能力、接入了哪种来源、下一步可
执行动作及剩余外部依赖。模型推理可指导构建；真实运行用于修正具体参数与
行为。无需为每项方向判断建立额外审计、评分或批准步骤。

进度同时保留候选与需求分母、完成、恢复、拒绝/缺项，避免只显示一个放行率。
本轮先在既有 decision 投影中输出候选路线列表与缺项动作，随订单生命周期继续接入。

## 7 分开历史版本与当前实现

历史事件、原始来源、已签合同、回执和已发布协议版本保留原样。
当前执行代码允许正常修复与重构，稳定的未版本化入口用于未来运行；版本化
实现留给历史回放。活跃路径不再因一个请求编码修复而层层包装旧错误编码。

首项落地为 Cloudflare：当前 adapter 直接生成 FormData；当前预激活 adapter
直接组合当前 lifecycle；历史 v1/v2/v3 保留。当前数字履约入口接入这一实现，
用聚焦测试检查上传、执行、恢复、清理和旧行为兼容。新运行单独保存，不接管
尚未完成的历史执行。当前脚本不自动成为旧订单的恢复器。

研究模块继续保留。只在当前运行确实需要时进入产品依赖路径，不做全仓迁移。

## 接回原主线

1. 完成以上决策输出、适配器和说明更新，运行对应测试。
2. 完成 Adafruit v10，使用现有 v9 来源和 cookie 进行有时限的只读 checkout
   对账，最多两次 GET，不重放不明确的 shipping POST。
3. 将 seller 当前 step、总价、ETA 或会话到期结果写入新产物；据实际响应
   选择下一交易动作，并保留独立的容量接入动作。
4. 继续既有 Stage 3/4 的资源形成与 Edge 工程，再接自动恢复、Strict COMMIT
   和后续阶段。当前代码改良不自动批准付款、下单或扩大任何外部动作范围。

报价、恢复能力和成本在上述工作中并行积累，不要求先完成另一个创业验证计划。

## 本轮实施记录

当前状态：前序的决策输出、当前生产入口与研发规则已落地，原主线已恢复运行。
历史修改前源码快照位于
`artifacts/engineering-improvements-20260905/source-baseline/manifest.json`。

### 已接入的代码

- `src/outsider-formation-candidate-ranking-bridge-v1.js`：从现有候选构造路线
  进度和两种恢复支出情景，金额用最小货币单位精确计算。
- `src/outsider-first-physical-formation-ranking-materializer-v2.js` 与
  `scripts/outsider-first-physical-formation-decision-runner-v2.mjs`：上述字段
  进入原 decision 输出，缺项动作合并进 `nextMachineSearchObjectives`。
- `src/outsider-cloudflare-worker-production-adapter.js` 与
  `src/outsider-cloudflare-worker-preactivated-production-adapter.js`：直接构造
  原生上传，复用现有确定性身份、receipt 和清理语义。
- 当前数字履约调用链：
  `scripts/outsider-first-committed-reality-production.mjs` →
  `src/outsider-first-committed-digital-reality-production-launcher.js` →
  `src/outsider-first-committed-digital-reality-production-composition.js` →
  当前 Cloudflare adapter。历史入口仍用于历史运行。

可用命令：`npm run formation:digital -- --help`；
`npm run formation:decision --` 后使用原 decision 参数，可追加
`--recovery-cost-evidence FILE`。当前数字入口使用新的空 runtime 目录，之后
可以从该入口 resume；不会接管旧入口的未完成订单。

### 真实资料重放

已用现有统一投影、SparkFun 卖方投影和 Target v2 投影运行改良后的 decision。
结果位于
`artifacts/engineering-improvements-20260905/formation-decision-offline-replay/`。
结果保持 `CONTINUE_AUTONOMOUSLY`，给出独立的报价/ETA、owner 预留和恢复成本
获取动作。原始观测时间保留，未将离线重放变成新报价。

这份输出对应现有 v2 决策输入格式。它保留该路径原有的 Target 5V 约束判断，
不取代另行维护的 v3 seller-neutral registry，也不覆盖新产生的 Adafruit
checkout 资料。交易资料由其单独生命周期继续累积。

### 验证

当前入口、历史 v6 入口、Cloudflare 新旧 adapter、formation ranking 与
decision 相关 10 个测试文件联合运行：57/57 通过。当前 CLI 帮助命令通过。
Adafruit v10 的真实对账与追加回放记录见下一个 checkpoint。

### Adafruit 原主线推进

2026-09-05 02:31:07.861 UTC，v10 使用上次 v9 会话进行两次 GET：
`/checkout` 返回 302，跟进 `/checkout?step=4` 返回 200。无 POST、付款或下单。

首次解析遇到旧解析器的两处页面适配问题：将付款模块的 purchase order
说明误认作已经下单，以及只接受通用 Shipping 标签。当前 v10 已识别
checkout totals 与选定的 UPS Ground Saver 运费行；采用本次已保存页面
离线追加解析结果，没有再次访问卖方。

来源金额：商品 495、运费 869、税 31 美分，显示总价与组件和均为
1395 美分，即 USD 13.95，满足原 USD 20 预算。仍未出现结构化 ETA。
下一交易事实为 `OBTAIN_SOURCE_STRUCTURED_ETA`，容量接入继续独立推进。

本轮新增通用路线证据与投影位于：
`.outsider/private/adafruit-shipping-reconciliation-replay-v10-20260905-ea66c18dbf52ca4104347c951e7eb98a/`。
投影 hash 为
`sha256:c10cfa7914ae4db70d2859fa684df6653bdc45abe0e1486e937e30a4013b0fab`。
回放保留原观察时间和有效期；后续新交易仍刷新报价。原解析失败记录保留。

v9/v10 的 17 项聚焦测试通过，含真实页面脱敏结构、费用合计、只读追加回放
以及原观察时窗保留。与前述 57 项合计 74/74 通过。

本轮原主线已完成“当前 checkout 对账 → 完整含税总价 → 通用 route evidence”。
随后继续 ETA、资源预留、恢复路线与自动切换，沿原 0–8 计划推进。
