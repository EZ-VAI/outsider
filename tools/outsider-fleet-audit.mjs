#!/usr/bin/env node
/*
 * HOW MUCH OF THE RUN DOES A SINGLE-TRANSCRIPT SUPERVISOR NEVER SEE?
 *
 * The hook reads a bounded tail of each log, which is right for the hot path and
 * wrong for this question: the parent transcript is usually far bigger than any
 * child, so it gets proportionally more truncated and the windowed ratio
 * overstates the children. A number that decides whether a whole capability is
 * worth building must not have an implementation detail in its denominator.
 *
 * So this reads every log WHOLE and counts. Nothing installed, nothing sent, no
 * model — the same zero-risk shape as the replay harness, and it is the one
 * thing anyone with a session directory can run for us on their own repo.
 *
 *   node scripts/outsider-fleet-audit.mjs <session.jsonl | session-dir> [...]
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { discoverFleetLogs, trajectoryFromSession, trajectoryFromTranscript }
  from "../src/outsider-session-adapters.js";

const WHOLE = { tailBytes: 1024 * 1024 * 1024, subTailBytes: 1024 * 1024 * 1024 };

const args = process.argv.slice(2);
if (!args.length) {
  console.error("用法: node scripts/outsider-fleet-audit.mjs <session.jsonl|目录> [...]");
  process.exit(2);
}

/* every parent transcript named on the command line, directly or by directory */
const parents = [];
for (const a of args) {
  if (!existsSync(a)) continue;
  if (statSync(a).isDirectory()) {
    for (const f of readdirSync(a)) if (f.endsWith(".jsonl")) parents.push(path.join(a, f));
  } else parents.push(a);
}

const fmt = (n) => String(n).padStart(5);
const mb = (b) => (b / (1024 * 1024)).toFixed(2) + "MB";

let gTotal = 0, gOff = 0, gSessions = 0, gWithSubs = 0;

for (const parent of parents) {
  const { subagents } = discoverFleetLogs(parent, { maxFiles: 512 });
  const mainSteps = trajectoryFromTranscript(parent, "claude-code", WHOLE);
  const subCounts = subagents.map((f) => ({
    f, n: trajectoryFromTranscript(f, "claude-code", WHOLE).length, bytes: statSync(f).size,
  }));
  const off = subCounts.reduce((n, s) => n + s.n, 0);
  const total = mainSteps.length + off;
  if (!total) continue;
  gSessions += 1; gTotal += total; gOff += off;
  if (subagents.length) gWithSubs += 1;

  console.log(`\n${path.basename(parent)}  ${mb(statSync(parent).size)}`);
  console.log(`  主 agent          ${fmt(mainSteps.length)} 步`);
  for (const s of subCounts) {
    console.log(`  ${path.basename(s.f).replace(/\.jsonl$/, "").padEnd(18)}${fmt(s.n)} 步  ${mb(s.bytes)}`);
  }
  const share = total ? (off / total) * 100 : 0;
  console.log(`  ── 子 agent 合计   ${fmt(off)} 步 = 全部工作的 ${share.toFixed(1)}%，`
    + `单一日志的监工一步都看不到`);

  /* what the merged view additionally makes judgeable, as opposed to merely
     visible: failing tests and edits that only ever existed off-main */
  const fleetSteps = trajectoryFromSession(parent, "claude-code", { ...WHOLE, maxFiles: 512 });
  const offSteps = fleetSteps.filter((s) => (s.origin ?? "main") !== "main");
  const offRed = offSteps.filter((s) => s.isTest && s.exit != null && s.exit !== 0).length;
  const offEdits = offSteps.filter((s) => s.isEdit).length;
  if (offRed || offEdits) {
    console.log(`     其中：失败的测试 ${offRed} 次 · 编辑 ${offEdits} 次 —— `
      + `打地鼠/漂移只可能发生在看得见的地方`);
  }
}

console.log(`\n═══ ${gSessions} 个会话 · 其中 ${gWithSubs} 个用了子 agent ═══`);
console.log(`总步数 ${gTotal} · 发生在主日志之外 ${gOff} = ${gTotal ? ((gOff / gTotal) * 100).toFixed(1) : "0.0"}%`);
if (!gWithSubs) {
  console.log(`\n没有会话使用子 agent —— 这份日志里，单一日志的视野就是全部视野。`);
} else if (gOff / gTotal > 0.2) {
  console.log(`\n读一份日志的监工，对这批会话是在半张图上判断。`);
}
console.log(`\n⚠ 这里只数步数，不判断这些步骤好坏。是否"该管"是另一个问题，需要合规率。`);
console.log(`⚠ 口径：这里数的是「重建出来的步骤」，一次工具调用配上它的结果才算一步。`);
console.log(`   replay-live 数的是「工具调用」，control-arm 数的是可判定的干预时刻 ——`);
console.log(`   三个数天生不同，而且日志在被读的同时还在长。差几条是正常的，别当成 bug。`);
