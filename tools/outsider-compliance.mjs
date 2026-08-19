#!/usr/bin/env node
/*
 * 合规率 —— 把影子账本和真实日志对起来，算出工人到底听不听。
 *
 *   node scripts/outsider-compliance.mjs <repo>/.outsider/shadow.jsonl <session.jsonl|目录> [...]
 *
 * The ledger says what the foreman would have said and at which moment. The
 * transcript says what the agent did next. Pairing them is the whole
 * measurement, and it needs no model, no network, and nothing installed here.
 *
 * TWO NUMBERS, NEVER ADDED TOGETHER
 * =================================
 *   合规  did the agent mechanically do the thing asked, inside the window
 *   效果  did red turn green sooner than in the silent arm
 *
 * A high 合规 with no 效果 is a real and important result — the corrections are
 * obeyed and useless — and one combined "it works" number is exactly how that
 * finding would disappear.
 */
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { trajectoryFromSession } from "../src/outsider-session-adapters.js";
import { scoreProbe, summarise, COMPLIANCE_BAR } from "../src/outsider-compliance.js";

const args = process.argv.slice(2);
if (args.length < 2) {
  console.error("用法: node scripts/outsider-compliance.mjs <shadow.jsonl> <session.jsonl|目录> [...]");
  process.exit(2);
}
const [ledgerPath, ...logArgs] = args;
if (!existsSync(ledgerPath)) { console.error(`找不到账本: ${ledgerPath}`); process.exit(2); }

const records = readFileSync(ledgerPath, "utf8").split("\n")
  .filter((l) => l.trim()).map((l) => { try { return JSON.parse(l); } catch { return null; } })
  .filter(Boolean)
  /* an irreversible refusal is outside the experiment by construction; scoring it
     would mix a thing we always say into a comparison about saying things */
  .filter((r) => r.arm !== "exempt")
  /* rows with no probe cannot be graded — counted and reported, never scored */
  .filter((r) => r.kind != null);

const logs = [];
for (const a of logArgs) {
  if (!existsSync(a)) continue;
  if (statSync(a).isDirectory()) {
    for (const f of readdirSync(a)) if (f.endsWith(".jsonl")) logs.push(path.join(a, f));
  } else logs.push(a);
}

/* every step of the run, in one time-ordered list, so a record can be located by
   its timestamp regardless of which agent on the floor produced it */
const steps = [];
for (const f of logs) {
  steps.push(...trajectoryFromSession(f, "claude-code",
    { tailBytes: 2 ** 30, subTailBytes: 2 ** 30, maxFiles: 512 }));
}
steps.sort((a, b) => (a.ts ?? 0) - (b.ts ?? 0));

console.log(`账本 ${records.length} 条（已排除不可逆硬拦）· 日志 ${logs.length} 份 / ${steps.length} 步\n`);
if (!records.length || !steps.length) {
  console.log("没有可配对的数据。影子模式跑够一场会话之后再来。");
  process.exit(0);
}

const scores = [];
let unlocated = 0;
for (const r of records) {
  /* the steps that happened AFTER the moment, in that agent's own chain — a
     correction aimed at one worker is not answered by another worker's next move */
  const after = steps.filter((s) => s.ts && r.ts && s.ts > r.ts
    && (s.origin ?? "main") === (r.origin ?? "main"));
  if (!after.length) { unlocated += 1; scores.push("unknown"); continue; }
  scores.push(scoreProbe({ kind: r.kind, expect: r.expect, window: r.window ?? 6 }, after));
}

const sum = summarise(records, scores);

const byKind = new Map();
records.forEach((r, i) => {
  const k = `${r.kind}${r.weak ? "(弱)" : ""}`;
  if (!byKind.has(k)) byKind.set(k, { spoken: [0, 0], silent: [0, 0] });
  const b = byKind.get(k)[r.spoke ? "spoken" : "silent"];
  if (scores[i] === "complied") { b[0] += 1; b[1] += 1; }
  else if (scores[i] === "did-not") { b[1] += 1; }
});

const pct = (a, b) => (b ? ((a / b) * 100).toFixed(1) + "%" : "—");
console.log("按臂：");
for (const a of sum.arms) {
  console.log(`  ${a.arm === "spoken" ? "说了  " : "没说  "}`
    + `照做 ${String(a.complied).padStart(3)} / 可判 ${String(a.n).padStart(3)} = ${pct(a.complied, a.n)}`
    + `   （判不了 ${a.unknown}）`);
}
console.log(`\n差值 (说了 − 没说): ${sum.lift == null ? "—" : sum.lift}`);
console.log(`结论: ${sum.verdict}`);

console.log(`\n按干预种类（照做/可判）：`);
for (const [k, b] of byKind) {
  console.log(`  ${k.padEnd(26)} 说了 ${b.spoken[0]}/${b.spoken[1]}   没说 ${b.silent[0]}/${b.silent[1]}`);
}

if (!sum.powered) {
  const need = sum.arms.map((a) => `${a.arm} ${a.n}`).join(" · ");
  console.log(`\n⚠ 每臂至少 ${COMPLIANCE_BAR.minPerArm} 对才读大小，现在是 ${need}。`);
  console.log(`  低于这条线的差值区间必然跨零 —— 这个数只读方向，或者干脆先别读。`);
}
if (unlocated) console.log(`\n注：${unlocated} 条记录之后没有同一 agent 的后续步骤（会话在那里结束了），计为「判不了」。`);
console.log(`\n注：「照做」只是机械动作对上了，不代表修对了。效果要另算 —— 见本文件头。`);
