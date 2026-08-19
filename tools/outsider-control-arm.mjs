#!/usr/bin/env node
/*
 * 对照臂 —— 不装任何东西，也不需要任何人同意被打断。
 *
 * THE REALISATION THAT MAKES THIS FREE
 * ====================================
 * The control arm asks: at the moments where the foreman WOULD have spoken, what
 * did the worker do next — on his own, with nobody telling him anything?
 *
 * Every one of those moments is already in the transcript, and the agent was
 * never told anything at any of them. So the control arm is computable entirely
 * after the fact, from a file. No install, no settings written, no hook, no
 * process spawned, nothing that can interrupt anyone. The session being measured
 * has already finished.
 *
 * That matters more than it sounds: it means half of the one number that can
 * invalidate this whole product costs nothing and risks nothing to collect, and
 * it can be collected from people who would never agree to install a supervisor.
 *
 * WHAT THIS IS NOT
 * ================
 * It is not the intervention arm. Nothing here tells us what an agent does after
 * being corrected — only what it does when it is NOT. That number is the floor
 * the intervention has to beat, and a floor that is already high is itself a
 * finding: it would mean the corrections have very little room to add anything.
 *
 *   node scripts/outsider-control-arm.mjs <session.jsonl|目录> [...]
 */
import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { decideToolCall } from "../src/outsider-hook.js";
import { trajectoryFromSession, scopeTrajectory, classifyToolCall } from "../src/outsider-session-adapters.js";
import { complianceProbe, scoreProbe, COMPLIANCE_BAR, placeboRate, samplesNeeded, headroom }
  from "../src/outsider-compliance.js";

const args = process.argv.slice(2);
if (!args.length) {
  console.error("用法: node scripts/outsider-control-arm.mjs <session.jsonl|目录> [...]");
  process.exit(2);
}
const logs = [];
for (const a of args) {
  if (!existsSync(a)) continue;
  if (statSync(a).isDirectory()) {
    for (const f of readdirSync(a)) if (f.endsWith(".jsonl")) logs.push(path.join(a, f));
  } else logs.push(a);
}

/*
 * ITERATE THE STEPS, NOT THE RAW CALLS.
 *
 * The first version walked the tool_use blocks and sliced the STEP array by the
 * CALL index — two sequences of different length, because a step exists only
 * once a call has paired with its result. 6 of 8 moments scored "unknown" purely
 * from that misalignment. It is the identical defect this repo already fixed
 * once in the live replay harness, reintroduced the moment a second harness was
 * written, which is an argument for one harness rather than for more care.
 *
 * Walking the steps makes the alignment structural: prior is everything before
 * j, the proposed action IS step j, and what happened next is everything after.
 */
/* the FULL command, never the 200-char display string — see classifyToolCall */
const inputOf = (s) => (s.actionKind === "shell"
  ? { command: String(s.cmd ?? s.action ?? "") }
  : { file_path: String(s.file ?? "") });

const tally = { moments: 0, complied: 0, didNot: 0, unknown: 0, unmeasurable: 0 };
const allSteps = [];
/* every moment the supervisor would have spoken, with what followed — kept so
   the same moments can be re-scored at several window sizes */
const moments = [];
const byKind = new Map();
const examples = [];

for (const file of logs) {
  const all = trajectoryFromSession(file, "claude-code",
    { tailBytes: 2 ** 30, subTailBytes: 2 ** 30, maxFiles: 512 });
  const cwd = null;
  let n = 0;

  for (let j = 0; j < all.length; j++) {
    const step = all[j];
    const prior = all.slice(0, j);
    if (prior.length < 5) continue;
    let d = null;
    try {
      d = decideToolCall({
        toolName: step.toolName ?? (step.actionKind === "shell" ? "Bash" : "Edit"),
        toolInput: inputOf(step), priorSteps: prior, cwd, complianceMode: "live",
        faultCards: false, archBench: false, fleet: false });
    } catch { continue; }
    if (!d || d.verdict === "allow") continue;
    /* an irreversible refusal is not part of the comparison: it is the thing we
       always say, and it has no "would the agent have done it anyway" arm */
    if (d.proposed?.irreversible) continue;

    const probe = complianceProbe(d);
    /* what the agent did NEXT, untold — its OWN chain, after this moment. A
       correction aimed at one worker is not answered by another worker's move. */
    const after = all.slice(j + 1).filter((s) => (s.origin ?? "main") === (step.origin ?? "main"));
    moments.push({ after });
    if (!probe) { tally.unmeasurable += 1; n += 1; continue; }
    n += 1; tally.moments += 1;
    const score = scoreProbe(probe, after);
    if (score === "complied") tally.complied += 1;
    else if (score === "did-not") tally.didNot += 1;
    else tally.unknown += 1;

    const k = `${probe.kind}${probe.weak ? "(弱)" : ""}`;
    if (!byKind.has(k)) byKind.set(k, { complied: 0, n: 0, unknown: 0 });
    const b = byKind.get(k);
    if (score === "unknown") b.unknown += 1; else { b.n += 1; if (score === "complied") b.complied += 1; }

    if (examples.length < 6 && score !== "unknown") {
      examples.push(`${score === "complied" ? "照做" : "没照做"}  ${probe.kind}  `
        + `${String(d.reason ?? "").slice(0, 70)}`);
    }
  }
  /*
   * PRINT THE DENOMINATOR AND THE MOMENT IT WAS READ.
   *
   * A reader compared three of these tools and found 5088 / 5091 / 3870 steps
   * for the same session, and was right to ask. Two causes, both mundane and
   * both previously invisible: a LIVE log grows between runs, and the tools do
   * not all count the same thing. Neither is a bug, but a number whose
   * denominator is unstated is a number that will be quoted wrongly.
   */
  allSteps.push(...all);
  let bytes = 0; try { bytes = statSync(file).size; } catch { /* ignore */ }
  console.log(`${path.basename(file).slice(0, 40).padEnd(42)} 步 ${String(all.length).padStart(5)}`
    + ` · 主日志 ${(bytes / 1048576).toFixed(2)}MB · 监工本会开口 ${n} 次`);
}

const scorable = tally.complied + tally.didNot;
const pct = (a, b) => (b ? ((a / b) * 100).toFixed(1) + "%" : "—");

console.log(`\n═══ 对照臂（没有任何人被告知任何事）═══`);
console.log(`口径：只数「有干预对象可判定」的时刻。这个数比 replay-live 的 warn 少，`);
console.log(`      因为不可逆硬拦被排除（那是我们永远都会说的，没有对照臂），`);
console.log(`      而且不是每一条提醒都有一个可机械判定的「照做」动作。两个数不可互相代入。\n`);
console.log(`监工本会开口的时刻   ${tally.moments + tally.unmeasurable}`);
console.log(`  其中无法机械判定   ${tally.unmeasurable}   （没有一个「照做」动作可以检查 ——`);
console.log(`                      这些不计入比例。上一版给它们套了一个「下一步换了个动作」的`);
console.log(`                      判据，两轮都是 20/20，因为那个判据几乎不可能为假。）`);
console.log(`  有判据的时刻       ${tally.moments}`);
console.log(`  其中可判           ${scorable}   （判不了 ${tally.unknown}：之后没有足够的后续动作）`);
console.log(`  agent 自己就做对了 ${tally.complied} / ${scorable} = ${pct(tally.complied, scorable)}  ← 这是基线`);

/*
 * 安慰剂列 —— 没有它，读者会拿合规率跟 0 比。
 *
 * The same predicate applied to randomly chosen moments in the same log. A
 * reviewer asked to doubt a 14/14 result measured this and found the floor was
 * 81.4%: fourteen straight successes against that base rate happen by luck about
 * 6% of the time. The number was not a result, it was a coin landing the same
 * way fourteen times.
 */
const EXPECT_OF = {
  "stop-repeating": (s) => (s?.action ? { action: s.action } : null),
  "edit-before-rerun": (s) => (s?.action ? { action: s.action } : null),
  "stop-rereading": (s) => (s?.file ? { file: s.file } : null),
  "run-a-test": () => ({ runsTest: true }),
  "back-it-up": () => ({ editOrTest: true }),
  "do-not-submit-yet": () => ({ notSubmit: true }),
  "run-the-acceptance": () => ({ runsTest: true }),
  "declare-a-charter": () => ({ charter: true }),
  "edit-the-named-file": (s) => (s?.file ? { file: s.file } : null),
};
/*
 * THREE NUMBERS, AND I HAD TWO OF THEM MIXED UP.
 *
 * The reviewer reported both a random-moment rate (81.4%) and a
 * trigger-moment rate (51.0%) and was careful to keep them apart. I collapsed
 * them into one "placebo" column and immediately produced nonsense: a −42.9pp
 * "lift" for `do-not-submit-yet`, because at a random moment an agent is almost
 * never about to submit, and at the moments we speak it is about to submit BY
 * DEFINITION. That is not a counterfactual, it is a different population.
 *
 * The three roles, kept straight:
 *
 *   安慰剂   same predicate at RANDOM moments. Says whether the predicate carries
 *            any information about the trigger at all. If it matches the trigger
 *            rate, the predicate is not measuring the trigger.
 *   对照     the predicate at TRIGGER moments with nothing said. THIS is the
 *            floor an intervention has to beat — this column, not the placebo.
 *   余量     100% − 对照. The most an intervention could possibly add. When this
 *            is near zero the agent already does the right thing unprompted and
 *            no amount of data will show an effect.
 */
console.log(`\n按干预种类：`);
console.log(`  ${"".padEnd(26)} 对照(地板)  安慰剂   判据有信息?  余量   每臂需要`);
for (const [k, b] of byKind) {
  const ex = EXPECT_OF[k];
  const pl = ex ? placeboRate(k, ex, allSteps, { window: 5 }) : { rate: null, n: 0 };
  const rate = b.n ? b.complied / b.n : null;
  const diff = (rate != null && pl.rate != null) ? rate - pl.rate : null;
  const room = headroom(pl.rate);
  const need = pl.rate != null ? samplesNeeded(pl.rate, 0.15) : null;
  /* 余量 is measured against the CONTROL rate — the floor an intervention has
     to beat — not against the placebo, which belongs to a different population */
  const room2 = headroom(rate);
  const need2 = rate != null ? samplesNeeded(rate, 0.15) : null;
  const informative = (rate != null && pl.rate != null)
    ? (Math.abs(rate - pl.rate) >= 0.15 ? "是" : "存疑") : "—";
  console.log(`  ${k.padEnd(26)} ${String(b.complied).padStart(3)}/${String(b.n).padEnd(3)}`
    + ` ${pct(b.complied, b.n).padStart(7)}`
    + `  ${(pl.rate == null ? "—" : (pl.rate * 100).toFixed(1) + "%").padStart(7)}`
    + `  ${informative.padStart(9)}`
    + `  ${(room2 == null ? "—" : (room2 * 100).toFixed(1) + "pp").padStart(8)}`
    + `  ${need2 == null ? "—" : need2}`);
  if (room2 != null && b.n >= 3 && room2 < 0.20) {
    console.log(`  ${" ".repeat(26)} ⚠ 余量 ${(room2 * 100).toFixed(1)}pp —— 没人管的时候 agent 本来就照做，`);
    console.log(`  ${" ".repeat(26)}   干预最多只能补这么多。这不是样本量问题，多收也读不出来。`);
  }
  if (informative === "存疑" && pl.n > 20) {
    console.log(`  ${" ".repeat(26)} ⚠ 触发时刻和随机时刻的通过率几乎一样 —— 这个判据可能没在量触发本身。`);
  }
}
if (examples.length) {
  console.log(`\n样本：`);
  for (const e of examples) console.log(`  ${e}`);
}

/*
 * 战略尺度 —— 余量在这儿，不在 5 步窗口里。
 *
 * Measured on this repo: the SAME moments, scored on whether the run recovered
 * (red turned green) inside a widening window —
 *
 *     5 步   对照 83.3%  安慰剂 67.2%  余量 16.7pp   (可判 6/12)
 *   120 步   对照 50.0%  安慰剂 63.7%  余量 50.0pp   (可判 12/12)
 *
 * At 120 steps the moments the supervisor would have spoken at recover LESS
 * often than random ones. The detector was pointing at real trouble all along;
 * the trouble takes a hundred steps to play out, and every probe here had a
 * four-to-six step window.
 *
 * Which fits the operator's own diagnosis: the agent is not stupid TACTICALLY —
 * within five steps it stops, backs out, recovers. None of the six diseases he
 * listed is a five-step phenomenon. Short windows were chosen because they are
 * easy to score, and that is the wrong reason to choose a measurement.
 */
function recoveredWithin(after, W) {
  const win = after.slice(0, W);
  const lastRed = win.findLastIndex((s) => s.isTest && s.exit != null && s.exit !== 0);
  const lastGreen = win.findLastIndex((s) => s.isTest && s.exit === 0);
  if (lastGreen < 0 && lastRed < 0) return "unknown";
  return lastGreen > lastRed ? "complied" : "did-not";
}
console.log(`\n战略尺度（判据换成「这一段之后跑回绿灯了没有」，窗口逐级放大）：`);
console.log(`  窗口   可判   对照(地板)   安慰剂    余量`);
for (const W of [5, 20, 50, 120]) {
  let n = 0, ok = 0;
  for (const m of moments) {
    const r = recoveredWithin(m.after, W);
    if (r === "unknown") continue;
    n += 1; if (r === "complied") ok += 1;
  }
  let pn = 0, pok = 0;
  const stride = Math.max(1, Math.floor(allSteps.length / 400));
  for (let i = 0; i < allSteps.length - W; i += stride) {
    const r = recoveredWithin(allSteps.slice(i + 1), W);
    if (r === "unknown") continue;
    pn += 1; if (r === "complied") pok += 1;
  }
  const ctrl = n ? ok / n : null;
  const plac = pn ? pok / pn : null;
  console.log(`  ${String(W).padStart(4)} 步 ${String(n).padStart(5)}`
    + `   ${(ctrl == null ? "—" : (ctrl * 100).toFixed(1) + "%").padStart(8)}`
    + `  ${(plac == null ? "—" : (plac * 100).toFixed(1) + "%").padStart(8)}`
    + `  ${(ctrl == null ? "—" : ((1 - ctrl) * 100).toFixed(1) + "pp").padStart(8)}`);
}
console.log(`  余量随窗口放大 = 这些病要几十上百步才展开，短窗口看不见它们。`);

console.log(`\n读法：`);
console.log(`  「对照」是没人说话时 agent 自己的通过率 —— 干预必须超过的就是它，不是 0。`);
console.log(`  「安慰剂」是同一判据套在随机时刻上的通过率，用来看这个判据有没有在量触发本身；`);
console.log(`  两者接近，说明判据没抓到触发；两者差得远，说明判据确实指向了不寻常的时刻。`);
console.log(`  「余量」= 100% − 对照。余量接近 0，意味着 agent 本来就会做对，干预无处可加 ——`);
console.log(`  这不是样本量问题，再多样本也读不出来。要么换更严的判据，要么承认这一类不需要管。`);
if (scorable < COMPLIANCE_BAR.minPerArm) {
  console.log(`\n⚠ 可判样本 ${scorable} < ${COMPLIANCE_BAR.minPerArm}：只读方向，不读大小。`);
}
console.log(`\n本脚本不安装任何东西、不写任何配置、不启动任何进程 —— 它只读了几个文件。`);
console.log(`注：日志在被测量的同时还在增长。三个脚本在不同时刻读，步数差几条是正常的，`);
console.log(`    上面每份日志都印了它读到的字节数，可以据此对账。`);
