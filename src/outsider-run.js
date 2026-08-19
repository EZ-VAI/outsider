/*
 * outsider run —— controller 持有 worker 的生命周期。
 *
 * WHAT CHANGED, STRUCTURALLY
 * ==========================
 * For seven rounds this product was a PreToolUse plugin that named itself a
 * supervisor. A hook is woken between two tool calls, answers, and dies; it
 * cannot resume anything, cannot come back in twenty steps, and cannot own a
 * standard the worker did not write. Every attempt to close the loop from inside
 * it produced another detector.
 *
 * Here the controller starts the worker and outlives it. The hook keeps exactly
 * one job — a SYNCHRONOUS GATE AT A SAFE TOOL BOUNDARY, and an actuator for what
 * the supervisor decides. It is no longer the kernel; it is the kernel's hands.
 *
 * PAUSE IS THE BLOCKING HOOK, NOT A SIGNAL
 * ========================================
 * The host blocks on the hook's answer. So holding that answer holds the worker
 * at a point where no tool has run, nothing is half-written, no lock is held and
 * no subagent is mid-flight. SIGSTOP remains only for a worker that has stopped
 * answering at the boundary at all.
 *
 * 事件流是唯一的成品
 * ==================
 * Definition of done for this slice is not a module count and not a pass rate:
 * a run with a planted drift point, corrected with nobody watching, passing a
 * standard that was frozen before the work began — and an event record that
 * proves the pause, the independent diagnosis, the delivery, the behaviour
 * change and the outcome. Anything missing from the record did not happen.
 */
import { spawn } from "node:child_process";
import { writeFileSync, appendFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { freezeContract, writeContract } from "./outsider-work-contract.js";

export const RUN_PATH = ".outsider/run.json";
export const EVENTS_PATH = ".outsider/events.jsonl";

export function emit(cwd, event) {
  const p = path.join(cwd, EVENTS_PATH);
  try {
    mkdirSync(path.dirname(p), { recursive: true });
    appendFileSync(p, `${JSON.stringify({ ...event, at: new Date().toISOString() })}\n`);
  } catch { /* the record is best effort at write time; its absence is visible */ }
}

export function readEvents(cwd) {
  try {
    return readFileSync(path.join(cwd, EVENTS_PATH), "utf8").split("\n")
      .filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  } catch { return []; }
}

/*
 * 模式必须是显式的。没有配置 supervisor 就只能是 observer-only,而且要说出来 —
 * 一个静默降级之后仍然自称 Stage 0.5 的东西,正是这个产品要抓的那种病。
 */
export function runMode({ supervisorCmd }) {
  return supervisorCmd ? "controlled" : "observer-only";
}

export function writeRunState(cwd, state) {
  const p = path.join(cwd, RUN_PATH);
  mkdirSync(path.dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify(state, null, 2));
  return p;
}

export function readRunState(cwd, { readFile = (p) => readFileSync(p, "utf8") } = {}) {
  try { return JSON.parse(readFile(path.join(cwd, RUN_PATH))); } catch { return null; }
}

/* the hooks settings the worker is launched with — the controller owns them */
export function workerSettings(hookEntry) {
  const cmd = `node "${hookEntry}" claude-code`;
  const one = [{ matcher: "", hooks: [{ type: "command", command: cmd, timeout: 300 }] }];
  return { hooks: { PreToolUse: one, Stop: one, SubagentStop: one } };
}

/*
 * `startRun` — freeze, then launch. In that order, always: a contract written
 * after the worker exists is a contract the worker could have influenced.
 */
export function startRun({ cwd, ask, acceptance, supervisorCmd = null, hookEntry,
  workerCmd = null, spawnFn = spawn, budgetMs = 30 * 60 * 1000 }) {
  const contract = freezeContract({ cwd, ask, acceptance });
  writeContract(cwd, contract);

  const mode = runMode({ supervisorCmd });
  const state = { schema: "outsider/run/v1", mode, supervisorCmd,
    contractSeal: contract.seal, startedAt: new Date().toISOString() };
  writeRunState(cwd, state);

  emit(cwd, { type: "contract_frozen", seal: contract.seal, ask: contract.ask,
    acceptance: contract.acceptance, baselineFiles: contract.baseline.nFiles });
  emit(cwd, { type: "mode", mode,
    note: mode === "observer-only"
      ? "没有配置 supervisor —— 只观察，不做独立诊断。这不是 Stage 0.5。"
      : "controller 持有 worker 生命周期；独立诊断走全新会话。" });

  const settingsPath = path.join(cwd, ".outsider", "worker-settings.json");
  writeFileSync(settingsPath, JSON.stringify(workerSettings(hookEntry), null, 2));

  const argv = workerCmd ?? ["-p", ask, "--settings", settingsPath,
    "--permission-mode", "acceptEdits"];
  emit(cwd, { type: "worker_launch", argv: argv.map((a) => String(a).slice(0, 120)) });

  const child = spawnFn(workerCmd ? argv[0] : "claude", workerCmd ? argv.slice(1) : argv,
    { cwd, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, OUTSIDER_RUN: "1" } });
  const killer = setTimeout(() => { try { child.kill("SIGKILL"); } catch { /* */ } }, budgetMs);
  killer.unref?.();
  return { child, contract, state, settingsPath, stop: () => clearTimeout(killer) };
}

/*
 * 独立验收 —— 用冻结的那条命令，由 controller 跑，不由 worker 报告。
 * worker 说什么在这里没有任何权重,这是「不给自己判卷」的具体含义。
 */
export function independentAcceptance({ cwd, contract, execFn }) {
  if (!contract?.acceptance) {
    return { ran: false, passed: null, reason: "合同里没有验收命令 —— 无法独立验收" };
  }
  try {
    execFn(contract.acceptance, { cwd });
    return { ran: true, passed: true, command: contract.acceptance };
  } catch (e) {
    return { ran: true, passed: false, command: contract.acceptance,
      output: String(e?.stdout ?? e?.message ?? "").slice(-1200) };
  }
}
