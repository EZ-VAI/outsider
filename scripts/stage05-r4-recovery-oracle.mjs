#!/usr/bin/env node
/* Deterministic R4 judge transport. It drives production controller recovery
 * edges without mixing model randomness into a process-liveness experiment. */
import { closeSync, existsSync, openSync, readFileSync, writeFileSync } from "node:fs";

const input = readFileSync(0, "utf8");
const currentIsTwo = /export const value = 2/.test(input);
const kind = input.includes("纠正提案的独立事实审计员") ? "correction-factual-audit"
  : input.includes("最终 PASS 判决的独立反方审计员") ? "outcome-approval-audit"
    : input.includes("最终交付的独立验收员") ? "outcome-verifier"
      : input.includes("独立监工") ? "supervisor" : "unknown";

if (kind === process.env.OUTSIDER_R4_BLOCK_KIND) {
  const marker = process.env.OUTSIDER_R4_BLOCK_MARKER;
  if (!marker) throw new Error("R4_BLOCK_MARKER_REQUIRED");
  if (!existsSync(marker)) {
    let fd = null;
    try { fd = openSync(marker, "wx", 0o600); writeFileSync(fd, `${process.pid}\n`); }
    finally { if (fd != null) closeSync(fd); }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0);
  }
}

let verdict;
if (kind === "supervisor") {
  verdict = { onTrack: false, drift: "src/value.js still exports 1 instead of the frozen value 2",
    plan: ["edit src/value.js so value is exactly 2", "run npm test"],
    expectedNextActions: ["edit:src/value.js", "run:npm test"],
    acceptanceRisk: "npm test remains red until the exported value is 2" };
} else if (kind === "correction-factual-audit") {
  verdict = { decision: "pass", blockingErrors: [], notes: [],
    verifiedFacts: ["the frozen source exports 1", "the proposed edit to 2 directly repairs the failed assertion"],
    insufficientReason: null };
} else if (kind === "outcome-verifier") {
  verdict = currentIsTwo
    ? { passed: true, gaps: [], evidence: ["current source exports exactly 2 and frozen acceptance passed"] }
    : { passed: false, gaps: ["src/value.js exports 1, not 2"],
      evidence: ["current source evidence contains export const value = 1"] };
} else if (kind === "outcome-approval-audit") {
  verdict = { decision: "pass", blockingErrors: [], notes: [],
    verifiedFacts: ["the proposed PASS is bound to source exporting 2 and green frozen acceptance"],
    insufficientReason: null };
} else {
  process.stderr.write("R4_ORACLE_UNKNOWN_PROMPT\n");
  process.exit(2);
}
process.stdout.write(`${JSON.stringify(verdict)}\n`);

