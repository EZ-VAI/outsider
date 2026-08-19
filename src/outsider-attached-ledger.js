import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";

const hash = (value) => `sha256:${createHash("sha256").update(String(value)).digest("hex")}`;

function atomicJson(file, value) {
  mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`;
  writeFileSync(temporary, JSON.stringify(value, null, 2), { mode: 0o600 });
  renameSync(temporary, file);
}

export function attachedSessionKey(input = {}) {
  const explicit = input.session_id ?? input.sessionId;
  if (explicit) return `session-${hash(explicit).slice(7, 31)}`;
  const transcript = input.transcript_path ?? input.transcriptPath;
  if (transcript) return `transcript-${hash(path.resolve(String(transcript))).slice(7, 31)}`;
  /* Never merge unknown sessions merely because they share a cwd.  A host that
     omits both stable identities is not conformant enough for control mode. */
  return null;
}

export function attachedPrompt(input = {}) {
  const direct = input.prompt ?? input.user_prompt ?? input.userPrompt;
  if (typeof direct === "string" && direct.trim()) return direct.trim();
  const content = input.message?.content;
  if (typeof content === "string" && content.trim()) return content.trim();
  if (Array.isArray(content)) {
    const text = content.filter((part) => part?.type === "text")
      .map((part) => part.text).filter(Boolean).join("\n").trim();
    if (text) return text;
  }
  return null;
}

export class AttachedLedger {
  constructor({ root, sessionKey, host, cwd }) {
    if (!root || !sessionKey) throw new Error("ATTACHED_LEDGER_IDENTITY_REQUIRED");
    this.directory = path.join(root, "sessions", sessionKey);
    this.file = path.join(this.directory, "session.json");
    this.value = this.read() ?? {
      schema: "outsider/attached-session/v1",
      sessionKey,
      host,
      cwd,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      taskNumber: 0,
      revisions: [],
      active: null,
      completedRuns: [],
    };
  }

  read() {
    try { return JSON.parse(readFileSync(this.file, "utf8")); } catch { return null; }
  }

  save(patch = {}) {
    this.value = { ...this.value, ...patch, updatedAt: new Date().toISOString() };
    atomicJson(this.file, this.value);
    return this.value;
  }

  addPrompt(prompt) {
    const continuing = Boolean(this.value.active
      && ["pending-bootstrap", "bootstrapping", "running", "needs-recovery"]
        .includes(this.value.active.status));
    const taskNumber = continuing ? this.value.taskNumber : this.value.taskNumber + 1;
    const taskRevisions = continuing
      ? this.value.revisions.filter((entry) => entry.taskNumber === taskNumber) : [];
    const revision = taskRevisions.length + 1;
    const entry = {
      taskNumber,
      revision,
      at: new Date().toISOString(),
      prompt: String(prompt),
      promptHash: hash(prompt),
      supersedesRunId: continuing ? this.value.active.runId : null,
    };
    const revisions = [...this.value.revisions, entry];
    /* A resumed/new turn re-opens the host session. Keeping an old SessionEnd
       timestamp beside a live task made diagnostics claim the controller was
       working after the host had already ended. */
    this.save({ taskNumber, revisions, sessionEndedAt: null });
    return {
      entry,
      continuing,
      combinedPrompt: revisions.filter((item) => item.taskNumber === taskNumber)
        .map((item) => `[operator revision ${item.revision}]\n${item.prompt}`).join("\n\n"),
    };
  }

  setActive(active) { return this.save({ active }); }

  recordIdentityConflict(conflict) {
    const prior = this.value.identityConflicts ?? [];
    const duplicate = prior.some((item) => item.originalCwd === conflict.originalCwd
      && item.requestedCwd === conflict.requestedCwd);
    return this.save({ identityConflicts: duplicate ? prior : [...prior, conflict] });
  }

  completeActive(status, extra = {}) {
    const current = this.value.active;
    if (!current) return this.value;
    const completed = { ...current, ...extra, status, completedAt: new Date().toISOString() };
    return this.save({ active: null, completedRuns: [...this.value.completedRuns, completed] });
  }
}
