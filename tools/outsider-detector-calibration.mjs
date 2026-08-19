#!/usr/bin/env node
/*
 * THE GATE THREE DETECTORS HAVE TO PASS BEFORE THEY GET A DENY BUTTON.
 *
 * 屎山 / 架构做偏 / 糊弄 have existed in `src/` for a long time and have never
 * been wired into the hook. Their AUC comes entirely from constructed data —
 * controlled functions with injected faults — and the most expensive lesson in
 * this repo is what happens when constructed evidence is used to justify a live
 * gate. So before wiring, two numbers on REAL code:
 *
 *   1. BASE RATE. What fraction of ordinary, already-reviewed files does it fire
 *      on? A detector that fires on most of a careful codebase is a style
 *      opinion with a stop sign attached, not a defect signal.
 *   2. COST. What does it take to answer, on a repo of realistic size? The hook
 *      runs once per tool call. A supervisor whose cost grows with the thing it
 *      supervises gets uninstalled, and this repo has already paid that bill
 *      once (42s at 4000 calls).
 *
 *   node scripts/outsider-detector-calibration.mjs [dir ...]
 */
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import path from "node:path";
import { assessShitCode } from "../src/outsider-shitcode.js";
import { assessArchDrift } from "../src/outsider-archdrift.js";
import { stubTells } from "../src/outsider-depth.js";

const dirs = process.argv.slice(2).filter((d) => existsSync(d) && statSync(d).isDirectory());
if (!dirs.length) dirs.push("dist-user/src", "src", "test", "scripts");

const load = (dir) => readdirSync(dir)
  .filter((f) => /\.(js|mjs|cjs)$/.test(f))
  .map((f) => ({ path: `${dir}/${f}`, content: readFileSync(path.join(dir, f), "utf8") }));

const pct = (a, b) => (b ? ((a / b) * 100).toFixed(1) + "%" : "—");

for (const dir of dirs) {
  let files = [];
  try { files = load(dir); } catch { continue; }
  if (!files.length) continue;
  const lines = files.reduce((n, f) => n + f.content.split("\n").length, 0);
  console.log(`\n═══ ${dir} · ${files.length} 文件 / ${lines} 行 ═══`);

  /* ---- 屎山：整体，以及逐文件的触发率（决定能不能当门用的就是后者）---- */
  let t0 = Date.now();
  const sc = assessShitCode({ files });
  const scMs = Date.now() - t0;
  const sigs = sc.signals ?? [];
  console.log(`屎山  score ${sc.score ?? "—"} · 整体信号 ${sigs.length} · ${scMs}ms`);
  for (const s of sigs.slice(0, 4)) {
    console.log(`   ${s.signal} conf ${s.confidence} — ${String(s.observed).slice(0, 96)}`);
  }
  let fired = 0;
  for (const f of files) {
    if ((assessShitCode({ files: [f] }).signals ?? []).length) fired += 1;
  }
  console.log(`   逐文件触发 ${fired}/${files.length} = ${pct(fired, files.length)}`
    + `  ${fired / files.length > 0.2 ? "← 远超可接线上限" : ""}`);

  /* ---- 架构做偏：信号数，以及代价 ---- */
  t0 = Date.now();
  const ad = assessArchDrift({ files });
  const adMs = Date.now() - t0;
  console.log(`架构  信号 ${(ad.signals ?? []).length} · ${adMs}ms`
    + `${adMs > 500 ? "  ← 热路径预算 5000ms，当前钩子全程 ~161ms" : ""}`);
  for (const s of (ad.signals ?? []).slice(0, 3)) {
    console.log(`   ${s.signal} — ${String(s.observed).slice(0, 96)}`);
  }

  /* ---- 糊弄（stub 迹象）：逐文件 ---- */
  let stubHits = 0;
  for (const f of files) {
    let t = null;
    try { t = stubTells(f.content, { path: f.path }); } catch { t = null; }
    const k = Array.isArray(t) ? t.length : (t?.tells?.length ?? 0);
    if (k) stubHits += 1;
  }
  console.log(`糊弄  stubTells 命中 ${stubHits}/${files.length} = ${pct(stubHits, files.length)}`);
}

console.log(`
── 判读标准 ──
逐文件触发率是能不能接进活门的那个数。真实代码上普遍触发的探测器，
接进去就是把「所有指令都被拦」重演一遍——这个项目开篇要避免的就是它。
代价那一栏同理：钩子每次工具调用跑一次，秒级的检查只能放到脱钩的探针里，
不能放在热路径上。`);
