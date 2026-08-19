#!/usr/bin/env node
/*
 * 外部检验会发出去什么 —— 在它第一次发出去之前，先给你看。
 *
 * The external judge is the only part of Outsider that leaves the machine, and
 * it is off unless the operator names a command. So before anyone turns it on,
 * this prints the EXACT bytes that would be sent, built from their own most
 * recent session. No call is made. Nothing is enabled.
 *
 *   node tools/outsider-judge-preview.mjs [session.jsonl]
 */
import { existsSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = existsSync(path.join(HERE, "..", "src", "outsider-hook.js"))
  ? path.join(HERE, "..", "src") : path.join(HERE, "src");
const { trajectoryFromSession } = await import(path.join(SRC, "outsider-session-adapters.js"));
const { evidencePacket, judgeStdin, judgeKey } = await import(path.join(SRC, "outsider-acceptance.js"));

const ROOTS = [path.join(homedir(), ".claude", "projects"), "/root/.claude/projects"];
let target = process.argv.slice(2).find((a) => !a.startsWith("-"));
if (!target) {
  const found = [];
  for (const r of ROOTS) {
    if (!existsSync(r)) continue;
    for (const d of readdirSync(r).map((x) => path.join(r, x))) {
      try { if (!statSync(d).isDirectory()) continue; } catch { continue; }
      for (const f of readdirSync(d)) if (f.endsWith(".jsonl")) {
        try { found.push({ p: path.join(d, f), s: statSync(path.join(d, f)).size }); } catch { /* */ }
      }
    }
  }
  found.sort((a, b) => b.s - a.s);
  target = found[0]?.p;
}
if (!target) { console.log("没找到会话日志。用法： node tools/outsider-judge-preview.mjs <日志>"); process.exit(0); }

const usage = {};
const steps = trajectoryFromSession(target, "claude-code",
  { tailBytes: 2 ** 30, subTailBytes: 2 ** 30, maxFiles: 512, usageByOrigin: usage });
const acc = usage.main ?? {};
const packet = evidencePacket({ steps, operatorTurns: acc.operator ?? [],
  usage: acc.usage ?? null, boundaries: acc.boundaries ?? [] });
/*
 * ONE FUNCTION, BOTH PATHS. This is byte-for-byte what the detached child writes
 * to the judge command's stdin — not a rendering of it. A preview assembled by a
 * second code path is a promise; this is the same bytes.
 */
const wire = judgeStdin(packet);

console.log(`\n这是外部检验开启后，会通过 stdin 发出去的全部内容 —— 一个字节不多。`);
console.log(`来源：${target}`);
console.log(`本次的卡片键：${judgeKey(packet)}（一份判决只描述交付的这一个状态；再改一次就作废）\n`);
console.log(`────── 原文（提示词 + 证据包，结构化：无源码、无 diff、无 traceback 正文）──────`);
console.log(wire);
console.log(`────── 大小 ──────`);
console.log(`${Buffer.byteLength(wire, "utf8")} 字节 ≈ ${Math.round(Buffer.byteLength(wire, "utf8") / 3.5)} tokens`);
console.log(`\n没有发出任何东西。要开启：OUTSIDER_JUDGE="你的命令"（例如 claude -p），一次交付调用一次。`);
console.log(`不设这个变量，它永远不会被调用。`);
console.log(`开启后：本地那几项过了但检验员还没回来时，交付会被「压住」一次工具调用（最多两次），`);
console.log(`检验员叫不动的话会明说，绝不会把你卡在那里。\n`);
