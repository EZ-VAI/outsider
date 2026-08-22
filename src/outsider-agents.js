/*
 * Per-agent wiring — where each tool writes its live session log, and how to
 * install Outsider as its pre-tool hook. The connection facts for each agent,
 * kept in one place so `watch --agent` and `install-hook` stay thin.
 *
 * Verified surfaces (re-checked against vendor docs 2026-08-02):
 *   Claude Code CLI  : session JSONL under ~/.claude/projects ; PreToolUse hook in
 *                      ~/.claude/settings.json — allow/deny/ask/defer/retry +
 *                      additionalContext, every tool except EndConversation.
 *   Claude Desktop   : TWO TABS, TWO DIFFERENT ANSWERS.
 *                      · Code tab   — runs the bundled Claude Code engine and DOES
 *                        read the host settings.json. `outsider install` covers it.
 *                      · Cowork tab — runs inside a Linux VM with CLAUDE_CONFIG_DIR
 *                        pointed INSIDE the VM; the host ~/.claude/settings.json is
 *                        never mounted (anthropics/claude-code#40495, still open).
 *                        Hooks reach Cowork ONLY through a PLUGIN. Hence the
 *                        `claude-desktop` spec below, which builds one rather than
 *                        writing a settings file that would be silently ignored.
 *   Codex (CLI, desktop app, IDE extension) : ONE shared config — ~/.codex/config.toml
 *                      and ~/.codex/hooks.json — across all three surfaces. The
 *                      installed 0.144.5 schema exposes lifecycle hooks, but the
 *                      local Outsider hook is currently untrusted and no authenticated
 *                      execution canary exists. Treat it as an engine candidate only.
 *   CodeBuddy   : logs under ~/.codebuddy/logs ; Claude-Code-style hooks.
 *   trae-agent  : trajectory JSON under ./trajectories ; no pre-exec hook → wrap.
 *
 * Hook interfaces move fast and vendor docs contradict each other in places, so
 * every spec carries a note telling the operator what to verify against their own
 * installed build instead of trusting this file.
 */

import { randomUUID } from "node:crypto";
import {
  closeSync, constants, fchmodSync, fstatSync, fsyncSync, lstatSync, mkdirSync,
  openSync, readFileSync, readdirSync, realpathSync, renameSync, statSync, unlinkSync,
  writeFileSync, existsSync,
} from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

const HOME = homedir();

export const AGENT_SPECS = {
  "claude-code": {
    label: "Claude Code",
    sessionDirs: [path.join(HOME, ".claude", "projects")],
    match: (f) => f.endsWith(".jsonl"),
    hook: (cli) => ({
      path: path.join(HOME, ".claude", "settings.json"),
      kind: "json",
      /*
       * TWO EVENTS, AND THE SECOND ONE IS THE POINT.
       *
       * PreToolUse has a hole that is fatal to this product's actual promise:
       * IT ONLY FIRES IF THE AGENT MAKES ANOTHER TOOL CALL. An agent that
       * decides it is finished and simply stops was never seen at all — the
       * whole 出厂验收 layer could be skipped by doing nothing.
       *
       * Stop closes it, and it is a different kind of power than a nudge:
       * `{"decision":"block","reason":…}` REFUSES TO LET THE RUN END and sends
       * the model back with the reason. That is the literal mechanism for the
       * sentence this product has been claiming all along — 这一夜不是在 agent
       * 觉得做完时结束，是在验收通过时结束。
       *
       * SubagentStop rides the same handler so a subagent cannot hand its parent
       * a deliverable that would have been refused at the top level.
       */
      value: { hooks: Object.fromEntries([
        "SessionStart", "UserPromptSubmit", "PreToolUse", "PostToolUse", "SubagentStart",
        "SubagentStop", "PreCompact", "Stop", "SessionEnd", "TaskCreated", "TaskCompleted",
        "TeammateIdle",
      ].map((event) => [event, [{ hooks: [{ type: "command",
        command: `${cli} hook claude-code`, timeout: 900 }] }]])) },
      note: "SessionStart/UserPromptSubmit 透明建立会话与冻结合同；Pre/PostToolUse 形成执行证据。\n"
        + "  PreToolUse 覆盖所有工具:deny 在动作执行前硬拦、additionalContext 注入纠正。\n"
        + "  Stop / SubagentStop 是「收工那一刻」:验收没过就 block,把它打回去继续做——\n"
        + "  Subagent/Task 事件建立多 agent 任务树；PreCompact 先持久化合同和状态。",
    }),
  },
  codex: {
    /* one config file serves the terminal CLI, the desktop app and the IDE extension */
    label: "Codex(终端版 / 桌面版 / IDE 插件,共用一份配置)",
    sessionDirs: [path.join(HOME, ".codex", "sessions")],
    match: (f) => f.endsWith(".jsonl"),
    hook: (cli) => ({
      path: path.join(HOME, ".codex", "hooks.json"),
      kind: "json",
      /* The nested {hooks:{PreToolUse:[{matcher,hooks:[{type,command}]}]}} shape is
         the real one. The flat {PreToolUse:[{command}]} written before was valid
         JSON that registered NOTHING — the hook never ran, on any Codex surface. */
      /*
       * Codex 0.144.5 exposes all of these lifecycle boundaries.  They share
       * one command intentionally: /hooks trusts the exact command hash, so a
       * Pre-only command and a later, different Stop command would create two
       * independently drifting authorities.  --attached-control is not a
       * cosmetic flag.  It selects the authenticated local controller path;
       * invoking `outsider hook codex` by hand remains fail-visible observer
       * mode and cannot be mistaken for the installed control surface.
       */
      value: { hooks: Object.fromEntries([
        ["SessionStart", "outsider 正在建立 Codex 会话身份"],
        ["UserPromptSubmit", "outsider 正在冻结本轮任务"],
        ["PreToolUse", "outsider 正在核对这个动作"],
        ["PostToolUse", "outsider 正在记录动作结果"],
        ["PreCompact", "outsider 正在持久化压缩前状态"],
        ["Stop", "outsider 正在做最终验收"],
      ].map(([event, statusMessage]) => [event, [{
        ...(event === "PreToolUse" || event === "PostToolUse" ? { matcher: "" } : {}),
        hooks: [{ type: "command",
          command: `${cli} hook codex --attached-control`, timeout: 900, statusMessage }],
      }]])) },
      note: "这一份配置同时管住 Codex 的终端版、桌面版和 IDE 插件——它们共用 ~/.codex/。\n"
        + "  ① 钩子默认已开;要确认,可在 ~/.codex/config.toml 写 [features] 下 hooks = true\n"
        + "     (旧名 codex_hooks 已废弃,别再用)。\n"
        + "  ② Codex 要求你在 /hooks 逐项审阅并信任 SessionStart / UserPromptSubmit / PreToolUse /\n"
        + "     PostToolUse / PreCompact / Stop；缺一项都只能机器标成未受控。\n"
        + "     钩子内容改了哈希就变,需要重新信任——\n"
        + "     在你点头之前它会被跳过。这是它的设计,不是故障。\n"
        + "  ③ 默认不带 --strict:软告警按 schema 写入 additionalContext；在本机 live canary 证明送达前,\n"
        + "     它只算候选通道,不计为已送达模型。真正不可逆的动作仍硬拦；--strict 会把软告警也硬拦。\n"
        + "  ④ hooks.json 不能带 UTF-8 BOM,否则 Codex 解析失败且不会告诉你。\n"
        + "  ⑤ 安装器注册当前 Stage 0.5 必需的 6 个候选事件，但不是 Codex 全部生命周期；\n"
        + "     `hooks/list` 显示 discovered/enabled 仍不等于执行过；\n"
        + "     只有 source-bound app-server conformance 才能把它从候选提升为真实控制。\n"
        + "     不得用 --dangerously-bypass-hook-trust 把候选能力冒充成用户已授权。",
    }),
  },
  "claude-desktop": {
    /*
     * The Cowork tab cannot be reached by writing a settings file — so this spec
     * does not pretend to. kind:"plugin" makes the CLI build a real plugin and
     * tell the operator how to load it. Writing ~/.claude/settings.json here
     * would have "succeeded" and done nothing, which is precisely the failure
     * mode this module exists to prevent.
     */
    label: "Claude 桌面版(Cowork 标签页)",
    sessionDirs: [
      path.join(HOME, "Library", "Application Support", "Claude", "local-agent-mode-sessions"),
      path.join(HOME, "AppData", "Roaming", "Claude", "local-agent-mode-sessions"),
    ],
    match: (f) => f.endsWith(".jsonl"),
    hook: () => ({
      path: null,
      kind: "plugin",
      note: "Cowork 标签页跑在一个 Linux 虚拟机里,CLAUDE_CONFIG_DIR 指向虚拟机内部——\n"
        + "  你主机上的 ~/.claude/settings.json 它根本读不到(anthropics/claude-code#40495,至今未修)。\n"
        + "  所以这里装的不是配置文件,是一个插件:钩子只有走插件才进得去 Cowork。\n"
        + "  ⚠ 官方文档没有列出 Cowork 里哪些钩子事件会触发,PreToolUse 我无法从文档确认——装完必须实测。\n"
        + "  桌面版的 Code 标签页读主机配置,用 `outsider install` 即可。",
    }),
  },
  codebuddy: {
    label: "CodeBuddy Code (腾讯)",
    sessionDirs: [path.join(HOME, ".codebuddy", "logs")],
    match: (f) => f.endsWith(".jsonl") || f.endsWith(".json") || f.endsWith(".log"),
    hook: (cli) => ({
      path: path.join(process.cwd(), ".codebuddy", "settings.json"),
      kind: "json",
      value: { hooks: { PreToolUse: [{ matcher: "", hooks: [{ type: "command", command: `${cli} hook codebuddy` }] }] } },
      note: "CodeBuddy Code 是 Claude-Code 风格的终端 agent,钩子形状默认同 Claude Code;字段名请对照其 hooks 文档核实。也可用 --permission-prompt-tool 指向 outsider。",
    }),
  },
  trae: {
    label: "trae-agent",
    sessionDirs: [path.join(process.cwd(), "trajectories")],
    match: (f) => f.endsWith(".json"),
    hook: () => ({
      path: null, kind: "none",
      note: "trae-agent 没有已验证的前置钩子，因此当前不宣称 Stage 0.5 实时控制。"
        + "源码工作区可用 `node try.mjs <trajectory.json>` 做只读、脱敏的事后回放；"
        + "不要把该回放冒充 `outsider run` 的受控执行。",
    }),
  },
};

export function listAgents() { return Object.keys(AGENT_SPECS); }

function newestUnder(dir, match, acc) {
  if (!existsSync(dir)) return;
  let names = [];
  try { names = readdirSync(dir); } catch { return; }
  for (const name of names) {
    const full = path.join(dir, name);
    let st; try { st = statSync(full); } catch { continue; }
    if (st.isDirectory()) newestUnder(full, match, acc);
    else if (match(name) && st.mtimeMs > acc.mtime) { acc.file = full; acc.mtime = st.mtimeMs; }
  }
}

/* the newest session file for an agent (what `watch --agent` tails). `dirs`
 * overrides the search roots (for tests). */
export function locateLatestSession(agent, { dirs } = {}) {
  const spec = AGENT_SPECS[agent];
  if (!spec) return null;
  const acc = { file: null, mtime: 0 };
  for (const d of (dirs ?? spec.sessionDirs)) newestUnder(d, spec.match, acc);
  return acc.file;
}

/* what to add, and where, to install Outsider as this agent's pre-tool hook */
export function hookConfigFor(agent, cliInvocation) {
  const spec = AGENT_SPECS[agent];
  if (!spec) return null;
  return { label: spec.label, ...spec.hook(cliInvocation) };
}

/*
 * OURS — an entry this tool wrote, identified by its command string. Used only
 * to clean up after ourselves; anything we cannot prove is ours is left alone.
 */
function isOurEntry(e) {
  const cmd = e?.command ?? e?.hooks?.[0]?.command ?? "";
  return typeof cmd === "string" && /outsider/i.test(cmd);
}

/*
 * merge our hook entry into an existing config object, idempotently (dedupe by
 * the command string), AND sweep out the legacy flat entries this tool itself
 * installed before it knew the real schema.
 *
 * Why the sweep exists: earlier builds wrote `{PreToolUse:[{command}]}` at the
 * top level. Codex ignores that shape, so those entries are inert — but they are
 * also a loaded gun. One of them carries `--strict`, and if a future Codex ever
 * starts honouring the flat form, a user who installed once in April would
 * silently get hard blocks they never asked for. Cleaning up our own litter is
 * part of shipping a fix; leaving it and calling the new entry "the fix" is not.
 *
 * The sweep is deliberately narrow: only top-level PreToolUse entries in the
 * legacy flat shape whose command mentions outsider. A user's own hooks, and any
 * correctly-shaped entry, are never touched.
 */
export function mergeHookConfig(existing, value) {
  const merged = existing && typeof existing === "object" ? { ...existing } : {};
  const removedLegacy = [];

  if (Array.isArray(merged.PreToolUse) && value.hooks?.PreToolUse) {
    const kept = merged.PreToolUse.filter((e) => {
      const legacyOurs = e && typeof e === "object" && e.command && !e.hooks && isOurEntry(e);
      if (legacyOurs) removedLegacy.push({ command: e.command, why: "格式错误、从未生效" });
      return !legacyOurs;
    });
    if (kept.length) merged.PreToolUse = kept;
    else delete merged.PreToolUse;              // do not leave an empty husk behind
  }

  /*
   * EXACTLY ONE outsider. Reinstalling from a new location (a fresh clone, an
   * extracted package, a moved folder) used to leave the old absolute path in
   * place, so every tool call ran two supervisors — double latency, double
   * stderr, and two deny reasons racing to explain the same block. There is no
   * case where a second copy of ourselves is what the operator wanted; the newest
   * install wins and the displaced one is reported.
   */
  if (merged.hooks && value.hooks) {
    merged.hooks = { ...merged.hooks };
    for (const [event, entries] of Object.entries(value.hooks)) {
      if (!Array.isArray(merged.hooks[event])) continue;
      const incoming = new Set(entries.map((e) => e.hooks?.[0]?.command));
      merged.hooks[event] = merged.hooks[event].filter((e) => {
        const cmd = e?.hooks?.[0]?.command;
        const staleOurs = isOurEntry(e) && cmd && !incoming.has(cmd);
        if (staleOurs) removedLegacy.push({ command: cmd,
          why: `${event} 指向旧的安装位置,已被这次安装取代` });
        return !staleOurs;
      });
    }
  }

  /*
   * ── 去重要比对命令本身，不能比对 JSON.stringify 的结果 ────────────────
   *
   * `seen.includes(cmd)` on a stringified array never matched, because every
   * real command contains quotes — the installer writes
   *     node "/…/bin/outsider-hook.mjs" hook claude-code
   * and JSON.stringify turns those into \", so the needle was never in the
   * haystack. Consequence: `node install.mjs` run twice left TWO identical
   * hooks, three times left three, and every tool call paid for each of them.
   * The dedup looked right for as long as nobody ran the installer twice with a
   * path that needed quoting — i.e. always, in the field.
   *
   * Found by the regression wall written for the Stop bug, not by reading.
   */
  const commandsIn = (arr) => (Array.isArray(arr) ? arr : []).flatMap((e) =>
    [e.command, ...((e.hooks ?? []).map((h) => h.command))]).filter(Boolean);
  const push = (arr, entries) => {
    const cur = Array.isArray(arr) ? arr.slice() : [];
    const seen = new Set(commandsIn(cur));
    for (const e of entries) {
      const cmds = commandsIn([e]);
      if (cmds.length && cmds.every((c) => seen.has(c))) continue;   // already installed
      cur.push(e);
      for (const c of cmds) seen.add(c);
    }
    return cur;
  };
  /*
   * ── EVERY DECLARED EVENT, NOT THE ONE THIS FUNCTION WAS FIRST WRITTEN FOR ──
   *
   * This hard-coded `PreToolUse`. The config above declared PreToolUse, Stop and
   * SubagentStop; the merger copied one. An external reviewer ran it and got:
   *
   *     declared:  [ 'PreToolUse', 'Stop', 'SubagentStop' ]
   *     installed: [ 'PreToolUse' ]
   *
   * So the entire 收工拦截 layer — the one thing in this product that is not a
   * reminder, the thing its own comments call 唯一一个不是提醒的接口 — was never
   * installed on any machine. Shell, no engine, shipped, in the same round this
   * file's neighbours were lecturing about boundaries asserted in comments.
   *
   * Iterating the declared events is not a fix for one missing key; it is the
   * removal of the assumption that let the key go missing silently. Adding a
   * fourth event now requires no change here.
   */
  if (value.hooks && typeof value.hooks === "object") {
    merged.hooks = { ...(merged.hooks ?? {}) };
    for (const ev of Object.keys(value.hooks)) {
      merged.hooks[ev] = push(merged.hooks[ev], value.hooks[ev]);
    }
  } else {
    for (const ev of Object.keys(value)) {
      if (!Array.isArray(value[ev])) continue;
      merged[ev] = push(merged[ev], value[ev]);
    }
  }
  /* non-enumerable so it never lands in the JSON we write to the user's config */
  Object.defineProperty(merged, "__removedLegacy", { value: removedLegacy, enumerable: false });
  return merged;
}

function lstatOrNull(file) {
  try { return lstatSync(file, { bigint: true }); }
  catch (error) { if (error?.code === "ENOENT") return null; throw error; }
}

function sameDirectoryIdentity(left, right) {
  return Boolean(left && right && left.isDirectory() && right.isDirectory()
    && left.dev === right.dev && left.ino === right.ino && left.mode === right.mode);
}

function ensurePrivateSettingsDirectory(directory, trustedRoot) {
  const canonicalRoot = realpathSync(path.resolve(trustedRoot));
  const rootStatus = lstatOrNull(canonicalRoot);
  if (!rootStatus?.isDirectory()) throw new Error("SETTINGS_TRUSTED_ROOT_INVALID");
  const relative = path.relative(canonicalRoot, path.resolve(directory));
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("SETTINGS_PATH_OUTSIDE_TRUSTED_ROOT");
  }
  const chain = [{ path: canonicalRoot, identity: rootStatus }];
  let cursor = canonicalRoot;
  for (const segment of relative.split(path.sep).filter(Boolean)) {
    cursor = path.join(cursor, segment);
    let status = lstatOrNull(cursor);
    if (!status) {
      mkdirSync(cursor, { mode: 0o700 });
      status = lstatOrNull(cursor);
    }
    if (status?.isSymbolicLink()) throw new Error("SETTINGS_DIRECTORY_SYMLINK_REFUSED");
    if (!status?.isDirectory()) throw new Error("SETTINGS_DIRECTORY_NOT_DIRECTORY");
    chain.push({ path: cursor, identity: status });
  }
  return { canonicalRoot, directory: cursor, chain };
}

function settingsDirectoryChainStable(chain) {
  return chain.every((entry) => sameDirectoryIdentity(entry.identity,
    lstatOrNull(entry.path)));
}

function sameFileIdentity(left, right) {
  return Boolean(left && right && left.isFile() && right.isFile()
    && left.dev === right.dev && left.ino === right.ino
    && left.size === right.size && left.mode === right.mode
    && left.mtimeNs === right.mtimeNs && left.ctimeNs === right.ctimeNs);
}

function privateExclusiveWrite(file, bytes) {
  const flags = constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL
    | (constants.O_NOFOLLOW ?? 0);
  let descriptor = null;
  try {
    descriptor = openSync(file, flags, 0o600);
    fchmodSync(descriptor, 0o600);
    writeFileSync(descriptor, bytes);
    fsyncSync(descriptor);
  } catch (error) {
    try { if (descriptor != null) closeSync(descriptor); } catch { /* */ }
    try { unlinkSync(file); } catch { /* */ }
    throw error;
  }
  closeSync(descriptor);
}

function stableSettingsRead(file) {
  const identity = lstatOrNull(file);
  if (!identity) return { identity: null, bytes: null, value: {} };
  if (identity.isSymbolicLink()) throw new Error("SETTINGS_SYMLINK_REFUSED");
  if (!identity.isFile()) throw new Error("SETTINGS_NOT_REGULAR_FILE");
  const flags = constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0);
  let descriptor;
  try {
    descriptor = openSync(file, flags);
    const opened = fstatSync(descriptor, { bigint: true });
    if (!sameFileIdentity(identity, opened)) throw new Error("SETTINGS_IDENTITY_CHANGED");
    const bytes = readFileSync(descriptor);
    if (!sameFileIdentity(opened, fstatSync(descriptor, { bigint: true }))) {
      throw new Error("SETTINGS_IDENTITY_CHANGED");
    }
    let value;
    try { value = JSON.parse(bytes.toString("utf8")); }
    catch (error) {
      throw new Error(`SETTINGS_JSON_INVALID:${String(error?.message ?? error).slice(0, 200)}`);
    }
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("SETTINGS_JSON_ROOT_INVALID");
    }
    return { identity, bytes, value };
  } finally {
    if (descriptor != null) closeSync(descriptor);
  }
}

/** Safely merge an Outsider hook into a host-owned JSON settings file.
 *
 * Malformed or symlinked settings are never reinterpreted as an empty object.
 * The replacement is a same-directory 0600 O_EXCL file, fsynced before an
 * atomic rename. Existing bytes remain in a private, unique backup. The inode
 * read at the start must still be the inode at commit, so a concurrent editor
 * is surfaced instead of silently clobbered. */
export function securelyMergeHookConfigFile({ file, value, trustedRoot,
  beforeCommit = null } = {}) {
  if (typeof file !== "string" || !file.trim()) throw new Error("SETTINGS_PATH_REQUIRED");
  if (typeof trustedRoot !== "string" || !trustedRoot.trim()) {
    throw new Error("SETTINGS_TRUSTED_ROOT_REQUIRED");
  }
  const requestedRoot = path.resolve(trustedRoot);
  const requestedFile = path.resolve(file);
  const relativeFile = path.relative(requestedRoot, requestedFile);
  if (relativeFile.startsWith("..") || path.isAbsolute(relativeFile)) {
    throw new Error("SETTINGS_PATH_OUTSIDE_TRUSTED_ROOT");
  }
  const prepared = ensurePrivateSettingsDirectory(path.join(
    realpathSync(requestedRoot), path.dirname(relativeFile)), requestedRoot);
  const directory = prepared.directory;
  const canonicalFile = path.join(directory, path.basename(relativeFile));
  const original = stableSettingsRead(canonicalFile);
  const merged = mergeHookConfig(original.value, value);
  const serialized = `${JSON.stringify(merged, null, 2)}\n`;
  const temporary = path.join(directory,
    `.${path.basename(file)}.outsider-${process.pid}-${randomUUID()}.tmp`);
  let backupPath = null;
  try {
    privateExclusiveWrite(temporary, serialized);
    if (!settingsDirectoryChainStable(prepared.chain)) {
      throw new Error("SETTINGS_DIRECTORY_IDENTITY_CHANGED");
    }
    const beforeBackup = lstatOrNull(canonicalFile);
    if (original.identity
      ? !sameFileIdentity(original.identity, beforeBackup) : beforeBackup != null) {
      throw new Error("SETTINGS_IDENTITY_CHANGED");
    }
    if (original.bytes != null) {
      backupPath = path.join(directory,
        `.${path.basename(file)}.outsider-backup-${Date.now()}-${randomUUID()}`);
      privateExclusiveWrite(backupPath, original.bytes);
    }
    if (typeof beforeCommit === "function") beforeCommit();
    if (!settingsDirectoryChainStable(prepared.chain)) {
      throw new Error("SETTINGS_DIRECTORY_IDENTITY_CHANGED");
    }
    const atCommit = lstatOrNull(canonicalFile);
    if (original.identity
      ? !sameFileIdentity(original.identity, atCommit) : atCommit != null) {
      throw new Error("SETTINGS_IDENTITY_CHANGED");
    }
    renameSync(temporary, canonicalFile);
    let directoryDescriptor = null;
    try {
      directoryDescriptor = openSync(directory, constants.O_RDONLY);
      fsyncSync(directoryDescriptor);
    } finally {
      if (directoryDescriptor != null) closeSync(directoryDescriptor);
    }
    const committed = stableSettingsRead(canonicalFile);
    return { merged, committed: committed.value, backupPath };
  } catch (error) {
    try { unlinkSync(temporary); } catch { /* already renamed or absent */ }
    throw error;
  }
}
