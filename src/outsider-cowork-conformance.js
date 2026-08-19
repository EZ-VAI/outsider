import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { verifyStage05RunDirectory } from "./outsider-stage05-evidence.js";

export function assessCoworkConformance({ session, verified, events, workspace,
  expectedPrompt = null } = {}) {
  const errors = [];
  const resolvedWorkspace = workspace ? path.resolve(workspace) : null;
  const latest = session?.completedRuns?.at(-1) ?? null;
  const promptEntries = Array.isArray(session?.revisions) ? session.revisions : [];
  const operatorPromptPreserved = expectedPrompt == null || promptEntries.some((entry) =>
    String(entry.prompt) === String(expectedPrompt));
  const eventTypes = new Set(events.map((event) => event.type));
  const boundaries = events.filter((event) => event.type === "boundary_reached");
  const preToolBoundaries = boundaries.filter((event) => event.boundary === "PreToolUse").length;
  const postToolBoundaries = boundaries.filter((event) => event.boundary === "PostToolUse").length;
  const finalized = [...events].reverse().find((event) => event.type === "run_finalized") ?? null;
  const finalAcceptance = [...events].reverse().find((event) => event.type === "acceptance_finished"
    && event.phase === "final") ?? null;
  const finalOutcome = [...events].reverse().find((event) => event.type === "outcome_verdict"
    && event.phase === "final") ?? null;
  const reusedOutcome = [...events].reverse().find((event) =>
    event.type === "outcome_verification_reused") ?? null;
  const reusedSource = reusedOutcome
    ? events.find((event) => event.type === "outcome_verdict"
      && event.seq === reusedOutcome.sourceSeq) ?? null
    : null;
  const finalSemanticOutcomePassed = finalOutcome?.passed === true
    || reusedSource?.passed === true;

  if (!session || session.host !== "claude-desktop") errors.push("attached session host is not claude-desktop");
  if (resolvedWorkspace && path.resolve(session?.cwd ?? "/") !== resolvedWorkspace) {
    errors.push("attached session cwd does not match the Cowork fixture");
  }
  if (!latest || latest.status !== "complete") errors.push("attached session has no completed run");
  if (!verified?.ok) errors.push(`sealed run evidence is invalid:${verified?.error ?? "missing"}`);
  if (verified?.binding?.source?.hostProtocol !== "claude-desktop") {
    errors.push("sealed binding hostProtocol is not claude-desktop");
  }
  if (verified?.binding?.createdBeforeWorker !== false
    || verified?.binding?.createdBeforeFirstAction !== true) {
    errors.push("attached binding does not honestly claim pre-action rather than pre-worker control");
  }
  if (verified?.binding?.authority?.capabilityRequired !== false
    || verified?.binding?.authority?.lane !== "RESEARCH") {
    errors.push("attached run claimed execution authority");
  }
  if (!operatorPromptPreserved) errors.push("operator prompt is not preserved byte-for-byte in the ledger");
  if (!eventTypes.has("worker_attached")) errors.push("worker_attached event missing");
  if (preToolBoundaries === 0) errors.push("no real PreToolUse boundary observed");
  if (postToolBoundaries === 0) errors.push("no real PostToolUse boundary observed");
  if (finalAcceptance?.passed !== true) errors.push("final frozen acceptance did not pass");
  if (!finalSemanticOutcomePassed) errors.push("final independent semantic outcome did not pass");
  if (finalized?.proofComplete !== true) errors.push("run_finalized is not proofComplete");
  if (verified?.projection?.outcome?.terminalClass !== "SAFE_DELIVERY") {
    errors.push("sealed terminal class is not SAFE_DELIVERY");
  }
  return {
    ok: errors.length === 0,
    runId: verified?.manifest?.sourceRunId ?? latest?.runId ?? null,
    runDirectory: latest?.runDirectory ?? null,
    host: session?.host ?? null,
    operatorPromptPreserved,
    preToolBoundaries,
    postToolBoundaries,
    proofComplete: finalized?.proofComplete === true,
    terminalClass: verified?.projection?.outcome?.terminalClass ?? null,
    unattendedInteractionAttempts: events.filter((event) =>
      event.type === "unattended_interaction_intercepted").length,
    errors,
  };
}

export function findCoworkSession({ stateRoot, workspace }) {
  const sessionsRoot = path.join(stateRoot, "sessions");
  if (!existsSync(sessionsRoot)) return null;
  const matches = [];
  for (const name of readdirSync(sessionsRoot, { withFileTypes: true })) {
    if (!name.isDirectory()) continue;
    try {
      const file = path.join(sessionsRoot, name.name, "session.json");
      const session = JSON.parse(readFileSync(file, "utf8"));
      if (path.resolve(session.cwd) === path.resolve(workspace)) matches.push({ file, session });
    } catch { /* skip unrelated/incomplete ledger entries */ }
  }
  matches.sort((left, right) => String(left.session.updatedAt).localeCompare(String(right.session.updatedAt)));
  return matches.at(-1) ?? null;
}

export function verifyCoworkConformance({ stateRoot, workspace, expectedPrompt = null } = {}) {
  const found = findCoworkSession({ stateRoot, workspace });
  if (!found) return { ok: false, errors: ["no Cowork session ledger for workspace"] };
  const latest = found.session.completedRuns?.at(-1);
  if (!latest?.runDirectory) return { ok: false, errors: ["Cowork session has no completed run directory"] };
  const verified = verifyStage05RunDirectory(latest.runDirectory);
  let events = [];
  try {
    events = readFileSync(path.join(latest.runDirectory, "events.jsonl"), "utf8")
      .split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
  } catch (error) {
    return { ok: false, errors: [`cannot read Cowork event stream:${error?.message ?? error}`] };
  }
  return assessCoworkConformance({ session: found.session, verified, events,
    workspace, expectedPrompt });
}
