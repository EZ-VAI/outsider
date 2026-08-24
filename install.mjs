#!/usr/bin/env node
/*
 * Outsider Stage 0.5 transparent-attached 安装器。
 *   node install.mjs            装
 *   node install.mjs --check    只体检,不改任何文件
 *   node install.mjs --strict   所有提醒都升级成硬拦(默认只硬拦不可逆动作)
 *   node install.mjs --scope project  只写当前项目 .claude/settings.json
 *   node install.mjs --stage-only     写入隔离目录但不注册 LaunchAgent（发布认证用）
 *   node install.mjs --supervisor "claude -p" --allow-external-supervisor
 *
 * 这个目录本身就是插件。Claude 桌面版直接指向它;Codex / Claude Code 跑这个脚本。
 */
import { existsSync, readFileSync, mkdtempSync, rmSync } from "node:fs";
import { homedir, platform, tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { stageClaudeHostedPlugin } from "./scripts/claude-plugin-package.mjs";
import { decideToolCall } from "./src/outsider-hook.js";
import { hookConfigFor, securelyMergeHookConfigFile } from "./src/outsider-agents.js";
import {
  externalSupervisorConfigurationEnvironment, hookCommandWithExternalSupervisor,
  installSystemHelper, shellQuoteHookValue,
} from "./src/outsider-system-helper.js";

const HOME = homedir();
const HERE = path.dirname(fileURLToPath(import.meta.url));
const BASE_HOOK = `${shellQuoteHookValue(process.execPath)} ${shellQuoteHookValue(path.join(HERE,
  "bin", "outsider-hook.mjs"))}`;
const A = process.argv.slice(2);
const CHECK = A.includes("--check"), STRICT = A.includes("--strict");
const STAGE_ONLY = A.includes("--stage-only");
const scopeIndex = A.indexOf("--scope");
const SCOPE = scopeIndex >= 0 ? A[scopeIndex + 1] : "user";
const optionValue = (name) => {
  const index = A.indexOf(name);
  const value = index >= 0 ? A[index + 1] : null;
  return value && !value.startsWith("--") ? value : null;
};
const SUPERVISOR_TEXT = optionValue("--supervisor");
const SUPERVISOR_ARGV_TEXT = optionValue("--supervisor-argv");
const ALLOW_EXTERNAL_SUPERVISOR = A.includes("--allow-external-supervisor");
let SUPERVISOR_COMMAND = SUPERVISOR_TEXT;
if ((A.includes("--supervisor") && !SUPERVISOR_TEXT)
  || (A.includes("--supervisor-argv") && !SUPERVISOR_ARGV_TEXT)) {
  console.error("--supervisor/--supervisor-argv 缺少命令值");
  process.exit(2);
}
if (SUPERVISOR_TEXT && SUPERVISOR_ARGV_TEXT) {
  console.error("--supervisor 与 --supervisor-argv 只能选择一个");
  process.exit(2);
}
if (SUPERVISOR_ARGV_TEXT) {
  try { SUPERVISOR_COMMAND = JSON.parse(SUPERVISOR_ARGV_TEXT); } catch {
    console.error("--supervisor-argv 必须是 JSON 字符串数组");
    process.exit(2);
  }
  if (!Array.isArray(SUPERVISOR_COMMAND) || SUPERVISOR_COMMAND.length === 0
    || SUPERVISOR_COMMAND.some((item) => typeof item !== "string" || item.length === 0)) {
    console.error("--supervisor-argv 必须是非空 JSON 字符串数组");
    process.exit(2);
  }
}
if (Boolean(SUPERVISOR_COMMAND) !== ALLOW_EXTERNAL_SUPERVISOR) {
  console.error("外部 supervisor 必须同时提供 --supervisor/--supervisor-argv 与独立 --allow-external-supervisor 同意；缺一不会安装外部披露配置");
  process.exit(2);
}
const PROJECT_ROOT = path.resolve(process.env.OUTSIDER_INSTALL_PROJECT_ROOT || process.cwd());
const say = (s = "") => console.log(s);
const rule = (c = "─") => say(c.repeat(74));

if (!["user", "project"].includes(SCOPE)) {
  console.error("用法: outsider install [--scope user|project] [--check] [--strict] [--stage-only] [--supervisor <cmd>|--supervisor-argv <json>] [--allow-external-supervisor]");
  process.exit(2);
}
if (SCOPE !== "user" && SUPERVISOR_COMMAND) {
  console.error("外部 supervisor 的 system-helper 配置只适用于 --scope user");
  process.exit(2);
}
if (STAGE_ONLY && (SCOPE !== "user" || CHECK)) {
  console.error("--stage-only 仅用于 user-scope 发布认证，且不能与 --check 同用");
  process.exit(2);
}
let HOOK = BASE_HOOK;
let SUPERVISOR_HOOK_ENVIRONMENT = {};
try {
  HOOK = hookCommandWithExternalSupervisor({ hookCommand: BASE_HOOK,
    supervisorCommand: SUPERVISOR_COMMAND,
    allowExternalSupervisor: ALLOW_EXTERNAL_SUPERVISOR });
  SUPERVISOR_HOOK_ENVIRONMENT = externalSupervisorConfigurationEnvironment({
    supervisorCommand: SUPERVISOR_COMMAND,
    allowExternalSupervisor: ALLOW_EXTERNAL_SUPERVISOR,
  });
} catch (error) {
  console.error(`external supervisor 配置拒绝写入 settings：${error?.message ?? error}`);
  console.error("命令只能包含 supervisor 的程序/argv 身份；API key、token、密码、私钥与带 query 的 URL 必须留在工具自己的受保护登录存储中。");
  process.exit(2);
}

const USER_SURFACES = [
  { key: "codex", label: "Codex(终端版 / 桌面版 / IDE 插件)", probe: path.join(HOME, ".codex") },
  { key: "claude-code", label: "Claude Code 终端版 + 桌面版 Code 标签页", probe: path.join(HOME, ".claude") },
];
const SURFACES = SCOPE === "project"
  ? [{ key: "claude-code", label: "Claude Code（仅当前项目）", probe: PROJECT_ROOT }]
  : USER_SURFACES;

say(""); rule("═");
say("  Outsider Stage 0.5 —— 安装后透明监督 Claude / Codex 的长任务");
say("  模式:transparent attached（照常使用 Claude Code / Claude Desktop / Codex）");
rule("═"); say("");
say(`  Node ${process.version} · ${platform()} · ${CHECK ? "体检模式" : STRICT ? "严格模式" : "标准模式"}`);
say(`  安装 scope: ${SCOPE === "user" ? "user（本机 Claude / Codex 项目）" : `project（${PROJECT_ROOT}）`}`);
if (SCOPE === "user") {
  say(`  ⚠ 存在对应宿主时，将写入 ${path.join(HOME, ".claude", "settings.json").replace(HOME, "~")}`
    + ` 和 ${path.join(HOME, ".codex", "hooks.json").replace(HOME, "~")}；下一次新会话起生效。`);
  say("    不要在你正依赖的 Claude/Cowork/Codex 会话里执行安装；请从独立终端安装并新开会话。");
  say(SUPERVISOR_COMMAND
    ? "  ✓ 已显式配置并同意 external supervisor；Claude/Codex hook 与 Cowork helper 都已持久化双门，只传递最小化/脱敏投影。"
    : "  ✓ 默认 local-only/no-external；未配置或同意 external supervisor，不会发送 workspace/prompt/tool/output。");
} else {
  say(`  ✓ 不写用户级 Claude settings；只写 ${path.join(PROJECT_ROOT,
    ".claude", "settings.json")}`);
}

if (Number(process.version.slice(1).split(".")[0]) < 20) {
  say("  ✗ 需要 Node 20 以上。"); process.exit(1);
}

/* Cowork plugin hooks execute inside Claude's hosted sandbox. That sandbox can
   reach the selected workspace but cannot read the user's macOS Keychain, so a
   daemon spawned there cannot open an independently authenticated supervisor
   session. Install one explicit, user-visible LaunchAgent; the plugin remains
   a thin authenticated RPC client and normal Claude Code keeps its lazy local
   sidecar path. */
if (SCOPE === "user" && platform() === "darwin") {
  if (CHECK) {
    say(`  Cowork system helper（体检不写）: ${path.join(HOME,
      "Library", "LaunchAgents", "ai.outsider.stage05.plist").replace(HOME, "~")}`);
  } else {
    try {
      const helper = installSystemHelper({ sourceRoot: HERE, home: HOME,
        register: !STAGE_ONLY, supervisorCommand: SUPERVISOR_COMMAND,
        allowExternalSupervisor: ALLOW_EXTERNAL_SUPERVISOR });
      say(STAGE_ONLY
        ? `  ✓ Cowork system helper ${helper.version} 已写入隔离目录（未注册 ${helper.label}）`
        : `  ✓ Cowork system helper ${helper.version} 已注册（${helper.label}）`);
    } catch (error) {
      say(`  ✗ Cowork system helper 安装失败：${error?.message ?? error}`);
      say("    Hosted Plugin 不会退回 sandbox 内假装受控；本次安装按失败处理。");
      process.exit(1);
    }
  }
}

/* Cowork's picker needs a stable, user-visible plugin directory. A global npm
   module path is both hard to find and may move on upgrade, so install a
   self-contained copy under Outsider-owned state. */
const PLUGIN_TARGET = path.join(HOME, ".outsider", "plugin", "outsider-guard");
if (SCOPE === "project") {
  say("  Cowork 插件不属于 project scope，本次不写 ~/.outsider/plugin。可单独上传发布包里的 plugin zip。");
} else if (CHECK) {
  say(`  Cowork 插件目标（体检不写）: ${PLUGIN_TARGET.replace(HOME, "~")}`);
} else {
  try {
    stageClaudeHostedPlugin({ sourceRoot: HERE, targetRoot: PLUGIN_TARGET });
    JSON.parse(readFileSync(path.join(PLUGIN_TARGET, ".claude-plugin", "plugin.json"), "utf8"));
    JSON.parse(readFileSync(path.join(PLUGIN_TARGET, "hooks", "hooks.json"), "utf8"));
    say(`  ✓ Cowork 插件已准备在 ${PLUGIN_TARGET.replace(HOME, "~")}`);
  } catch (error) {
    say(`  ✗ Cowork 插件无法准备：${error?.message ?? error}`);
    process.exit(1);
  }
}

/* ---- 自检:引擎在这台机器上到底行不行 ---- */
say(""); rule();
say("  自检 —— 真实引擎跑真实场景,不碰你任何文件");
rule();
const reads = (n) => Array.from({ length: n }, () => ({ action: "Read(/src/app.js)", exit: 0 }));
const CASES = [
  ["同一个文件读了 5 次(纯浪费 token)", reads(5), ["Read", { file_path: "/src/app.js" }], "warn"],
  ["失败的测试反复重跑,中间没改代码",
    [{ action: "pytest -q", isTest: true, exit: 1 }, { action: "pytest -q", isTest: true, exit: 1 }],
    ["Bash", { command: "ls" }], "warn"],
  ["全程没跑过测试就要提交",
    ["a", "b", "c"].map((f) => ({ action: `Edit(${f}.js)`, isEdit: true, exit: 0 })),
    ["Bash", { command: "git commit -am done" }], "warn"],
  ["正常干活(不该被打扰)",
    [{ action: "Read(a.js)", exit: 0 }, { action: "Edit(a.js)", isEdit: true, exit: 0 }, { action: "pytest", isTest: true, exit: 0 }],
    ["Bash", { command: "git status" }], "allow"],
];
let ok = true;
for (const [name, steps, call, want] of CASES) {
  let d; try { d = decideToolCall({ toolName: call[0], toolInput: call[1], priorSteps: steps, agent: "claude-code" }); }
  catch (e) { say(`    ✗ ${name} —— 引擎报错 ${e.message}`); ok = false; continue; }
  const good = d.verdict === want; if (!good) ok = false;
  say(`    ${good ? "✓" : "✗"} ${name}  →  ${d.verdict}`);
  if (d.corrective) say(`        它会对 agent 说:${d.corrective}`);
}
if (!ok) { say("\n  ✗ 自检没过,装了也不会起作用。把上面这段发回去。"); process.exit(1); }

/* ---- 装 ---- */
const done = [], yours = [], failed = [];
for (const s of SURFACES) {
  if (!existsSync(s.probe)) { say(`\n  ○ 没找到 ${s.label}(${s.probe.replace(HOME, "~")})—— 跳过`); continue; }
  const cfg = hookConfigFor(s.key, HOOK + (STRICT ? " --strict" : ""));
  if (SCOPE === "project" && s.key === "claude-code") {
    cfg.path = path.join(PROJECT_ROOT, ".claude", "settings.json");
  }
  say(""); rule(); say(`  ${s.label}`); rule();
  if (CHECK) { say(`    体检模式:不写。目标文件 ${cfg.path.replace(HOME, "~")}`); continue; }
  let merged, back;
  try {
    const stored = securelyMergeHookConfigFile({
      file: cfg.path,
      value: cfg.value,
      trustedRoot: SCOPE === "project" ? PROJECT_ROOT : HOME,
    });
    merged = stored.merged;
    back = stored.committed;
    if (stored.backupPath) {
      say(`    ↳ 原配置已保存为私有可恢复备份 ${stored.backupPath.replace(HOME, "~")}`);
    }
  } catch (error) {
    say(`    ✗ 拒绝写入 ${cfg.path.replace(HOME, "~")}：${error?.message ?? error}`);
    say("      现有 settings 保持原样；修复 JSON/移除 symlink 或结束并发编辑后再重试。");
    failed.push(s.label);
    continue;
  }
  /*
   * ── 每一个声明的事件都要落地，而且命令要真的能跑 ──────────────────────
   * This checked PreToolUse only, and separately the config declared three
   * events while the merger copied one — so 收工拦截 was "installed" on every
   * machine and present on none. Checking the string was written is not
   * checking anything: the very next edit to the entry shipped a syntax error
   * and every check still said ✓.
   */
  const want = Object.keys(cfg.value.hooks ?? {});
  const got = want.filter((ev) => (back.hooks?.[ev] ?? [])
    .some((e) => (e.hooks ?? []).some((h) => /outsider/.test(h.command))));
  const landed = got.length === want.length;
  say(`    ${landed ? "✓" : "✗"} 写入 ${cfg.path.replace(HOME, "~")} —— 事件 ${got.join(" ")}${landed ? "（都读回确认过）" : ` ✗ 少了 ${want.filter((e) => !got.includes(e)).join(" ")}`}`);
  /*
   * 命令要真的跑一次,而且【不能按空格拆】。
   * 上一版 split(/\s+/) 在一个叫 "outsider 2" 的目录下会把路径拆成两段,于是
   * 刚加的这条冒烟检查在真实路径下自己先坏掉。更糟的是它坏了也不影响结论:
   * 配置已经写入、landed 仍为 true、最后照样打印「✓ 已做完」。
   * 发现一条检查不够 → 加一条冒烟检查 → 冒烟检查没进成功判定,这是同一个病。
   */
  let ran = false;
  let smokeRoot = null;
  try {
    const { execFileSync } = await import("node:child_process");
    const entry = path.join(HERE, "bin", "outsider-hook.mjs");
    const attachedCandidate = s.key === "claude-code" || s.key === "codex";
    const argv = [entry, "hook", s.key]
      .concat(s.key === "codex" ? ["--attached-control"] : [])
      .concat(STRICT ? ["--strict"] : []);
    if (attachedCandidate) smokeRoot = mkdtempSync(path.join(tmpdir(), "outsider-install-smoke-"));
    const env = smokeRoot ? { ...process.env, ...SUPERVISOR_HOOK_ENVIRONMENT,
      OUTSIDER_ATTACHED_ROOT: smokeRoot, OUTSIDER_BUDGET_MS: "12000" }
      : { ...process.env, ...SUPERVISOR_HOOK_ENVIRONMENT };
    const out = execFileSync(process.execPath, argv, { encoding: "utf8", timeout: 15000, env,
      input: JSON.stringify(attachedCandidate
        ? { _outsiderAttachedPing: true, hook_event_name: "SessionStart",
          session_id: "install-smoke", cwd: HERE }
        : { tool_name: "Bash", tool_input: { command: "ls" }, cwd: HERE }) });
    JSON.parse(out || "{}");
    if (smokeRoot) {
      const descriptor = JSON.parse(readFileSync(path.join(smokeRoot, "daemon.json"), "utf8"));
      if (!descriptor.pid || !descriptor.socketPath || !descriptor.token) {
        throw new Error("sidecar descriptor 不完整");
      }
      try { process.kill(descriptor.pid, "SIGTERM"); } catch { /* already stopped */ }
    }
    ran = true;
    say(attachedCandidate
      ? `    ✓ ${s.key === "codex" ? "Codex attached" : "正常"} hook 已自动启动 sidecar，并完成健康握手`
      : "    ✓ observer hook 命令实际跑通，返回合法 JSON");
  } catch (e) {
    say(`    ✗ 钩子写进去了,但跑不起来:${String(e.message).slice(0, 200)}`);
    say("      这条钩子在你的 agent 里会被静默跳过。把这一段发回来。");
  } finally { if (smokeRoot) rmSync(smokeRoot, { recursive: true, force: true }); }
  if (!ran) failed.push(s.label);
  for (const r of merged.__removedLegacy ?? []) say(`      ⟲ 移除一条旧的 outsider 钩子(${r.why})`);
  if (landed && ran) done.push(s.label); else if (!landed) failed.push(s.label);
  if (s.key === "codex") yours.push(["打开 Codex → 输入 /hooks → 核对并信任 Outsider 的 10 个 Stage 0.5 核心 hooks。",
    "核心面是 SessionStart / UserPromptSubmit / PreToolUse / PermissionRequest / PostToolUse /"
      + " PreCompact / PostCompact / SubagentStart / SubagentStop / Stop；"
      + "任一项缺失或哈希变化都不能宣称核心控制面完整。",
    "SessionEnd 也会注册，但它是 best-effort advisory；宿主不暴露它时会报告能力缺口，"
      + "不否定上面 10 个 consequential 控制事件。"]);
}

if (SCOPE === "user" && !STAGE_ONLY && !CHECK) {
  yours.push([`Claude 桌面版 Cowork 标签页:设置 → 插件 → 从目录安装 → 选 ${PLUGIN_TARGET}`,
    "装完在会话里运行 /reload-plugins。插件是薄客户端；系统 helper 已由本次安装显式注册。"]);
} else if (SCOPE === "user" && CHECK) {
  yours.push([`Claude 桌面版 Cowork 真实安装时：设置 → 插件 → 从目录安装 → 选 ${PLUGIN_TARGET}`,
    "--check 未写入插件也未注册 helper；去掉 --check 的真实安装完成后再运行 /reload-plugins。"]);
} else if (SCOPE === "user") {
  yours.push(["这是隔离发布认证安装；LaunchAgent 没有注册，不能当作真实 Cowork 安装。",
    "真实用户安装必须省略 --stage-only，并在新会话中完成宿主 conformance。"]);
} else {
  yours.push(["project scope 只覆盖当前仓库的 Claude Code / Desktop Code。",
    "Cowork 必须另行上传发布包里的 .plugin.zip；普通 Chat 仍不运行 hooks。"]);
}
yours.push(["可选验证 —— 在要验证的 Claude 或 Codex 宿主中新开一个项目任务，然后运行 outsider doctor。",
  "runtime seen 证明宿主真的触发过 hook，而不只是配置文件写在磁盘上。"
    + "Codex 的 consequential closed-loop 运行与严格 source-bound app-server 控制评估是两个独立字段，不要混用。",
  "普通 Chat 不触发 hook；Cowork 的 runtime 证明必须来自 Cowork 自己的会话环境。"]);

if (failed.length) {
  say(""); rule("═");
  say("  ✗ 安装没有成功 —— 下面这些宿主上,钩子装了但跑不起来或没落地:");
  for (const x of failed) say(`      · ${x}`);
  say("  在修好之前,请当作【没有装】。把上面的报错原样发回来。");
  rule("═"); say("");
  process.exit(1);
}
say(""); rule("═");
if (CHECK) {
  say("  ✓ 体检完成（没有写配置，也没有声称宿主已加载 hook）");
  rule("═");
  say("    真实安装后才会执行 sidecar 健康握手；完整 readiness 仍以 outsider doctor 和首次真实会话 conformance 为准。");
} else {
  say(STAGE_ONLY
    ? "  ✓ 隔离 staging 已做完（配置、插件、helper 字节都读回；没有注册 LaunchAgent）"
    : "  ✓ 已做完(都读回确认过,而且命令实际跑通过)");
  rule("═");
  say(STAGE_ONLY
    ? "    这只证明可安装字节和 hook 配置；不声称系统 helper 或真实宿主已运行。"
    : "    Claude Code / Codex transparent attached 控制链已安装；无需改用 outsider run。");
  say("    sidecar 运输已实测，完整 Stage 0.5 readiness 仍以 outsider doctor 和首次真实会话 conformance 为准。");
}
for (const d of done) say(`    ✓ ${d}`);
if (!done.length && !CHECK) say("    (没有找到需要写配置的终端 agent —— 桌面版走下面的插件安装)");
say(""); rule("═"); say("  ○ 只有你能做的"); rule("═");
yours.forEach((b, i) => { say(""); say(`  ${i + 1}. ${b[0]}`); b.slice(1).forEach((l) => say(`     ${l}`)); });
say(""); rule("═"); say("  ⚠ 我担保不了的"); rule("═");
say("    · Claude 普通 Chat 不运行 hooks；Desktop 中受控面是 Claude Code 与 Cowork。Cowork 必须通过插件安装。\n"
  + "      若该版本/远程会话不触发 hooks，Outsider 会把 surface 标为未受控，不能提供 Stage 0.5 证明。");
say("    · Codex 宿主只对经用户在 /hooks 审阅且信任的精确 hook hash 执行控制；改版后需重新审阅。");
say("    · Codex 的 hosted tools 和部分 specialized path 不经过本地 tool hooks；已存在 unified-exec session 上的"
  + " write_stdin 不会再触发一次 PreToolUse。这是 guardrail，不是全工具或 OS sandbox 保证。");
say("    · 已通过的 Codex bounded live run 闭合了具体 Stop/纠正/复验路径；doctor 的运行证据"
  + " 不等于严格 source-bound app-server 评估，也不是对所有 Codex 行为的 100% 保证。");
say("    · 别挪这个文件夹,钩子里是绝对路径。挪了就重跑一次 node install.mjs。");
say("");
