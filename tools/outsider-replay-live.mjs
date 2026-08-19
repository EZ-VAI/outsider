/*
 * REPLAY A REAL TRANSCRIPT.
 *
 * The 91-command corpus is a fixture I wrote. This repository's most expensive
 * lesson is that a fixture proves the author's imagination, not the product: the
 * self-assessment lists six fatal defects that only real sessions surfaced, every
 * one of them invisible to a fixture suite that was passing at the time.
 *
 * So: take an ACTUAL agent session log — real shape, real command distribution,
 * real observation sizes — and ask the two questions a fixture cannot answer.
 *
 *   1. Does the parser reconstruct anything at all from this shape? A parser that
 *      silently yields zero steps reports a clean run, which is the worst thing
 *      it can say.
 *   2. Of the calls this session actually made, how many would Outsider have
 *      interrupted? That is the number the operator experiences. It has never
 *      been measured on real traffic.
 *
 * Usage: node scripts/outsider-replay-live.mjs <transcript.jsonl> [...]
 */
import { readFileSync, statSync } from "node:fs";
import { classifyToolCall, trajectoryFromTranscript, scopeTrajectory, explainRisk } from "../src/outsider-session-adapters.js";
import { decideToolCall } from "../src/outsider-hook.js";

const files = process.argv.slice(2);
if (!files.length) { console.error("用法: node scripts/outsider-replay-live.mjs <transcript.jsonl> [...]"); process.exit(2); }

/* pull every tool_use out of the raw log, in order, with its result */
function callsOf(path) {
  const out = [];
  const pending = new Map();
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    if (!line.trim()) continue;
    let o; try { o = JSON.parse(line); } catch { continue; }
    const blocks = o?.message?.content;
    if (!Array.isArray(blocks)) continue;
    for (const b of blocks) {
      if (b?.type === "tool_use") { pending.set(b.id, { name: b.name, input: b.input ?? {} }); out.push({ id: b.id, ...pending.get(b.id) }); }
      if (b?.type === "tool_result") {
        const rec = out.find((r) => r.id === b.tool_use_id);
        if (rec) rec.isError = b.is_error === true;
      }
    }
  }
  return out;
}

let grand = { calls: 0, interrupt: 0, deny: 0, warn: 0, steps: 0, bytes: 0 };
const interrupts = [];
const byTool = new Map();
const warnKind = new Map();

for (const f of files) {
  const calls = callsOf(f);
  const bytes = statSync(f).size;
  /*
   * READ THE WHOLE FILE HERE. In production the hook reads a bounded tail on
   * purpose (cost per call must not grow with the session). Replaying with that
   * same bound was a harness bug: it parsed the last 512KB — 58 steps — while
   * iterating all 283 tool calls, so call #12 was scored against a trajectory
   * from hour three. Offline we can afford the whole thing, and the alignment
   * between "call i" and "what had happened by call i" is the only thing that
   * makes the replay mean anything.
   */
  const all = trajectoryFromTranscript(f, "claude-code", { tailBytes: 512 * 1024 * 1024 });
  grand.steps += all.length; grand.bytes += bytes; grand.calls += calls.length;

  let interrupt = 0, deny = 0, warn = 0;
  for (let i = 0; i < calls.length; i++) {
    const c = calls[i];
    /*
     * CAUSALLY CORRECT REPLAY. Call i must see only what had happened before it.
     * Feeding every call the FINAL trajectory inflates every history-dependent
     * signal, because a condition met once at step 400 then appears to have been
     * true at step 1. My first pass did exactly that and reported a warn rate
     * more than twice the real one. A replay harness that runs time backwards
     * measures the harness.
     */
    /* the parser emits one step per completed tool call, so call i lines up with
       step i. Proportional slicing (the first version) put several calls on the
       same prefix and understated every signal that depends on what just
       happened — including the "say it once per attempt" dedup. */
    const prior = scopeTrajectory(all.slice(0, Math.min(i, all.length)), { window: 120 });
    const d = decideToolCall({ toolName: c.name, toolInput: c.input, priorSteps: prior });
    byTool.set(c.name, (byTool.get(c.name) ?? 0) + 1);
    if (d.verdict === "deny" || d.verdict === "ask") {
      interrupt++; if (d.verdict === "deny") deny++;
      /*
       * SHOW THE PART THAT DECIDED, NOT THE FIRST 110 CHARACTERS.
       *
       * This list was truncated to 110 chars, and a reader auditing it reached a
       * WRONG PUBLIC CONCLUSION because of it: an 890-character `npx esbuild …`
       * whose `rm` sat at offset 356 looked like a build command blocked for no
       * reason. Worse, a fix was then written against the tidied-up forms quoted
       * from this display rather than against the forms in the log, passed its
       * own verification, and left two thirds of the false positives standing.
       *
       * A display layer that hides the evidence is not cosmetic. It produced a
       * wrong inference, and then a wrong fix validated against the wrong
       * artefact. So: print the whole command, and point at the segment that
       * actually triggered the verdict.
       */
      const full = String(c.input?.command ?? c.input?.file_path ?? c.input?.pattern ?? "")
        .replace(/\s+/g, " ");
      /* the reason comes from the classifier, not from a second guess at it —
         see explainRisk. Five of a stranger's 24 blocks printed nothing under
         the guess-based version, and those five caused a wrong inference. */
      const why = explainRisk(full);
      interrupts.push({ file: f.split("/").pop(), tool: c.name,
        risk: classifyToolCall(c.name, c.input).risk, action: full,
        culprit: why.segment, rule: why.rule });
    }
    if (d.verdict === "warn") {
      warn++;
      const k = (d.reason ?? "?").split(":")[0].slice(0, 40);
      warnKind.set(k, (warnKind.get(k) ?? 0) + 1);
    }
  }
  grand.interrupt += interrupt; grand.deny += deny; grand.warn += warn;
  console.log(`${f.split("/").pop().slice(0, 46).padEnd(48)} ${String(calls.length).padStart(5)} 次调用 · `
    + `重建 ${String(all.length).padStart(4)} 步 · 打断 ${interrupt} · 提醒 ${warn} · ${(bytes / 1048576).toFixed(2)}MB`);
}

const pct = (n) => ((n / Math.max(grand.calls, 1)) * 100).toFixed(2);
console.log(`\n合计 ${grand.calls} 次真实工具调用 · ${(grand.bytes / 1048576).toFixed(2)}MB 日志`);
console.log(`打断(deny/ask) ${grand.interrupt} 次 = ${pct(grand.interrupt)}%   其中硬拦 ${grand.deny}`);
console.log(`上下文提醒(warn) ${grand.warn} 次 = ${pct(grand.warn)}%`);
if (warnKind.size) console.log(`  提醒来源: ${[...warnKind].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(" · ")}`);
console.log(`工具分布: ${[...byTool].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, v]) => `${k} ${v}`).join(" · ")}`);

if (interrupts.length) {
  console.log(`\n── 被打断的每一条（这是操作方会亲身经历的全部）──`);
  console.log(`   命令完整打印，不截断；「触发段」是真正让判决落下的那一小段。`);
  console.log(`   上一版把这里截到 110 字符，直接导致了一次错误的公开推断和一次修错地方的修复。\n`);
  for (const x of interrupts) {
    console.log(`  ${x.risk.padEnd(12)} ${x.tool.padEnd(10)} ${x.action}`);
    if (x.rule) {
      console.log(`  ${" ".repeat(23)}触发规则 → ${x.rule}`);
      if (x.culprit && x.culprit !== x.action) console.log(`  ${" ".repeat(23)}触发段   → ${x.culprit}`);
    }
  }
} else {
  console.log(`\n零打断。`);
}

/* the parser must not silently yield nothing on a real shape */
if (grand.calls > 50 && grand.steps === 0) {
  console.log(`\n⚠ 解析器在真实形态上重建出 0 步 —— 检测层是死的,而它会报告"这一轮很干净"`);
  process.exitCode = 1;
}
