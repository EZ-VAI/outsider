#!/usr/bin/env node
/*
 * node try.mjs —— 一条命令，零参数，零安装，回答一个问题：
 *
 *     「装上之后，它会怎么对我？」
 *
 * WHY THIS FILE EXISTS
 * ====================
 * Everything needed to answer that question already existed — the replay, the
 * fleet audit, the control arm — and all three required the operator to read a
 * README, find `tools/`, work out where their own session logs live, and paste a
 * path. That is four steps of homework before the first piece of evidence, in
 * front of a product whose entire pitch is "it will not waste your attention".
 *
 * A supervisor asks for trust up front. The cheapest way to earn some is to show
 * the operator what it would have done to THEIR last week, on THEIR machine,
 * before it is installed and while it still cannot touch anything.
 *
 * Finds the logs itself. Reads only. Prints the interrupt rate they would have
 * lived with, every single interruption in full with the rule that caused it,
 * and what it would have said and when.
 */
import { existsSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = existsSync(path.join(HERE, "..", "src", "outsider-hook.js"))
  ? path.join(HERE, "..", "src") : path.join(HERE, "src");
const { decideToolCall } = await import(path.join(SRC, "outsider-hook.js"));
const { trajectoryFromSession, classifyToolCall, explainRisk } =
  await import(path.join(SRC, "outsider-session-adapters.js"));

/* ── 自己找日志。找不到就说清楚去哪儿看，不让人猜 ────────────────────── */
/*
 * EVERY PLACE A SUPPORTED HOST ACTUALLY KEEPS ITS LOGS.
 *
 * These were three, matching nothing but the author's own machine — an operator
 * with Codex and trae logs in hand would have been told "没找到会话日志" by a
 * tool whose entire job is "point me at what you already have". The list below
 * is the same one `outsider-agents.js` installs against, so discovery and
 * installation can never disagree about where a host lives.
 */
const ROOTS = [
  path.join(homedir(), ".claude", "projects"),          // Claude Code
  path.join(homedir(), ".codex", "sessions"),           // Codex 终端/桌面/IDE
  path.join(homedir(), ".codebuddy", "logs"),           // CodeBuddy
  path.join(homedir(), ".trae", "trajectories"),        // trae-agent
  path.join(process.cwd(), "trajectories"),             // trae-agent(项目内，默认)
  path.join(homedir(), "Library", "Application Support", "Claude", "logs"),
  "/root/.claude/projects",
];
/* which parser to use for a path — the format differs per host, and guessing
   wrong reads a real log as an empty one, silently */
const AGENT_FOR = (p) => (/[/\\]\.codex[/\\]/.test(p) ? "codex"
  : /[/\\]\.codebuddy[/\\]/.test(p) ? "codebuddy"
  : /trajector/i.test(p) ? "trae"
  : "claude-code");
function findLogs() {
  const out = [];
  for (const root of ROOTS) {
    if (!existsSync(root)) continue;
    let dirs = [];
    try { dirs = readdirSync(root).map((d) => path.join(root, d)); } catch { continue; }
    for (const d of [root, ...dirs]) {
      let names = [];
      try { if (!statSync(d).isDirectory()) continue; names = readdirSync(d); } catch { continue; }
      for (const f of names) {
        if (!/\.jsonl?$/.test(f)) continue;
        const p = path.join(d, f);
        try { out.push({ p, size: statSync(p).size }); } catch { /* ignore */ }
      }
    }
  }
  return out.sort((a, b) => b.size - a.size);
}

const argPath = process.argv.slice(2).find((a) => !a.startsWith("-"));
const logs = argPath ? [{ p: argPath, size: statSync(argPath).size }] : findLogs();

console.log(`\n╭─ Outsider · 试跑 ────────────────────────────────────────────╮`);
console.log(`│ 不安装、不改配置、不启动任何进程 —— 只读你已有的会话日志。      │`);
console.log(`╰──────────────────────────────────────────────────────────────╯\n`);

if (!logs.length) {
  console.log(`没找到会话日志。它们通常在：`);
  for (const r of ROOTS) console.log(`  ${r}/<项目>/<会话id>.jsonl`);
  console.log(`\n找到之后： node try.mjs <那个文件>\n`);
  process.exit(0);
}

const target = logs[0];
const mb = target.size / 1048576;
console.log(`读取：${target.p}`);
console.log(`      ${mb.toFixed(2)}MB`);
if (logs.length > 1) {
  console.log(`      另有 ${logs.length - 1} 份更小的日志没读（默认只读最大的一份，`);
  console.log(`      要读别的： node try.mjs <那个文件的路径>）`);
}
/*
 * A 64MB log took 3 minutes with NO OUTPUT AT ALL. That is the first command an
 * operator runs after unzipping, in front of a product whose pitch is that it
 * will not waste their attention. Reported twice by the same reviewer, unchanged
 * between rounds, because I had only ever run it on a 6MB log of my own.
 */
const estSec = Math.round(mb * 2.8);
if (mb > 8) {
  console.log(`\n这份日志比较大，重放大约需要 ${Math.floor(estSec / 60)} 分 ${estSec % 60} 秒。`);
  console.log(`下面会一边跑一边报进度。`);
}
console.log("");

const AGENT = AGENT_FOR(target.p);
const steps = trajectoryFromSession(target.p, AGENT,
  { tailBytes: 2 ** 30, subTailBytes: 2 ** 30, maxFiles: 512 });
if (!steps.length) {
  console.log(`这份日志里重建出 0 步 —— 解析器读不懂它的格式。`);
  console.log(`这本身就是我要的数据，请把这行连同日志的头几行发回来。\n`);
  process.exit(0);
}

let deny = 0, warn = 0;
const blocks = [], notes = new Map();
const tick = Math.max(1, Math.floor(steps.length / 20));
const t0 = Date.now();
let lastLine = 0;
for (let j = 0; j < steps.length; j++) {
  if (mb > 8 && j > 0 && j % tick === 0) {
    const doneFrac = j / steps.length;
    const elapsed = (Date.now() - t0) / 1000;
    const left = Math.max(0, Math.round(elapsed / doneFrac - elapsed));
    const bar = "█".repeat(Math.round(doneFrac * 24)).padEnd(24, "·");
    process.stdout.write(`\r  ${bar} ${(doneFrac * 100).toFixed(0)}%  剩约 ${left}s   `);
    lastLine = 1;
  }
  const s = steps[j];
  /* the FULL command. Re-classifying the 200-char display string turned an
     `unknown` into a `destructive` and put `rm -f /roo` in front of an operator
     as if the supervisor had lost its mind. */
  const full = String(s.cmd ?? s.action ?? "");
  const input = s.actionKind === "shell" ? { command: full } : { file_path: String(s.file ?? "") };
  let d = null;
  try {
    d = decideToolCall({ toolName: s.toolName ?? (s.actionKind === "shell" ? "Bash" : "Edit"),
      toolInput: input, priorSteps: steps.slice(0, j), cwd: null, agent: AGENT,
      faultCards: false, archBench: false, fleet: false });
  } catch { continue; }
  if (!d) continue;
  if (d.verdict === "deny" || d.verdict === "ask") {
    deny += 1;
    blocks.push({ cmd: full.replace(/\s+/g, " "), why: explainRisk(full) });
  } else if (d.verdict === "warn") {
    warn += 1;
    const k = String(d.reason ?? "?").split(":")[0].slice(0, 44);
    notes.set(k, (notes.get(k) ?? 0) + 1);
  }
}

if (lastLine) process.stdout.write(`\r${" ".repeat(60)}\r`);
const pct = (n) => ((n / Math.max(steps.length, 1)) * 100).toFixed(2);
console.log(`这份日志里有 ${steps.length} 步 —— 主 agent 加上它调用过的子 agent 全算在内。`);
/*
 * `try.mjs` counts the whole floor; `tools/outsider-replay-live.mjs` reads the
 * parent transcript only. Both numbers are right and they will not match. A
 * reviewer noticed 19 vs 15 and correctly said neither output explained why.
 */
console.log(`（tools/outsider-replay-live.mjs 只读主日志，所以它的数字会更小 —— 两个都对。）`);
console.log(`\n装上 Outsider 的话：\n`);
console.log(`  会被拦下来要你确认   ${String(deny).padStart(4)} 次  = ${pct(deny)}%`);
console.log(`  会给 agent 一句提醒   ${String(warn).padStart(4)} 次  = ${pct(warn)}%`);
console.log(`  其余全部一声不吭     ${String(steps.length - deny - warn).padStart(4)} 次\n`);

if (blocks.length) {
  console.log(`── 被拦的每一条，完整命令 + 为什么 ──`);
  console.log(`   （这就是你会亲身经历的全部打扰。看着不对的，请照贴发回来。）\n`);
  for (const b of blocks) {
    console.log(`  ${b.cmd}`);
    if (b.why.rule) console.log(`     ↳ ${b.why.rule}${b.why.segment && b.why.segment !== b.cmd ? `：${b.why.segment}` : ""}`);
    console.log("");
  }
} else {
  console.log(`── 一次都不会拦。──\n`);
}
if (notes.size) {
  console.log(`── 提醒的来源（这些不打断，只在 agent 的上下文里加一句）──`);
  for (const [k, v] of [...notes].sort((a, b) => b[1] - a[1])) console.log(`  ${String(v).padStart(3)} × ${k}`);
  console.log("");
}

console.log(`── 接下来 ──`);
console.log(`  这个数字你能接受   → node install.mjs        （随时 node install.mjs --check 体检）`);
console.log(`  想先一句话都不说   → 装好后设 OUTSIDER_SHADOW=1，它连拦都拦不了，只记账`);
console.log(`  数字难看           → 把上面「被拦的每一条」原样发回来，那正是最有用的东西\n`);
