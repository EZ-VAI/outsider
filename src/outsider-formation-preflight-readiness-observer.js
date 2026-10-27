/* A new external observation can establish readiness after a rejected one.
 * Each observation keeps its own durable source operation. Creation ambiguity
 * is never treated as permission to submit another measurement.
 */
import { createHash } from "node:crypto";
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync,
  readFileSync, writeSync } from "node:fs";
import path from "node:path";
import { canonicalizeStrict } from "./canonical.js";

const RETRIABLE = new Set(["EXACT_FINAL_BODY_UNAVAILABLE",
  "EXACT_HTTP_RESULT_UNAVAILABLE", "MEASUREMENT_TIMEOUT",
  "MEASUREMENT_READ_TIMEOUT", "MEASUREMENT_TERMINAL_WITHOUT_RESULT"]);
const digest = value => createHash("sha256").update(value).digest("hex");
function writeOnce(file, value) {
  const bytes = Buffer.from(`${canonicalizeStrict(value)}\n`);
  const fd = openSync(file, "wx", 0o600);
  try { let offset = 0; while (offset < bytes.length) offset += writeSync(fd, bytes, offset);
    fsyncSync(fd); } finally { closeSync(fd); }
}

export function createFormationPreflightReadinessObserver(input) {
  const { observer, directory, formationDeadline } = input;
  const clock = input.clock ?? (() => new Date().toISOString());
  const wait = input.wait ?? (ms => new Promise(resolve => setTimeout(resolve, ms)));
  const maximumOccurrences = input.maximumOccurrences ?? 3;
  const retryDelayMs = input.retryDelayMs ?? 5000;
  if (typeof observer?.observe !== "function" || !Number.isFinite(Date.parse(formationDeadline))
    || !Number.isSafeInteger(maximumOccurrences) || maximumOccurrences < 1
    || maximumOccurrences > 5 || !Number.isSafeInteger(retryDelayMs)
    || retryDelayMs < 0 || retryDelayMs > 30000) throw new Error("PREFLIGHT_READINESS_CONFIG_INVALID");
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  return Object.freeze({ ...observer,
    async observe(command) {
      if (!command.operationId.endsWith(":EXACT_PREFLIGHT")) return observer.observe(command);
      let lastError;
      for (let ordinal = 1; ordinal <= maximumOccurrences; ordinal += 1) {
        const operationId = `preflight_${digest(`${command.operationId}\0${ordinal}`)}`;
        const file = path.join(directory, `${operationId}.json`);
        if (existsSync(file)) {
          const prior = JSON.parse(readFileSync(file, "utf8"));
          if (prior.operationId !== operationId) throw new Error("PREFLIGHT_OCCURRENCE_MISMATCH");
          if (prior.disposition === "REJECTED_SOURCE_OBSERVATION") {
            lastError = new Error(prior.errorCode);
            lastError.outsiderCode = prior.errorCode;
            if (!RETRIABLE.has(prior.errorCode)) throw lastError;
            continue;
          }
          // Source observer verifies/replays its own finished receipt.
          return observer.observe({ ...command, operationId });
        }
        if (Date.parse(clock()) >= Date.parse(formationDeadline)) break;
        try {
          const observed = await observer.observe({ ...command, operationId });
          writeOnce(file, { schema: "outsider/private-formation-preflight-occurrence/v1",
            operationId, ordinal, recordedAt: clock(), disposition: "SOURCE_OBSERVED",
            sourceReceiptHash: `sha256:${digest(canonicalizeStrict(observed))}` });
          return observed;
        } catch (error) {
          const code = typeof error?.outsiderCode === "string"
            ? error.outsiderCode : "UNCLASSIFIED_OBSERVER_FAILURE";
          writeOnce(file, { schema: "outsider/private-formation-preflight-occurrence/v1",
            operationId, ordinal, recordedAt: clock(),
            disposition: "REJECTED_SOURCE_OBSERVATION", errorCode: code,
            sourceJournalOperationId: operationId });
          if (!RETRIABLE.has(code)) throw error;
          lastError = error;
        }
        if (ordinal < maximumOccurrences
          && Date.parse(clock()) + retryDelayMs < Date.parse(formationDeadline)) {
          await wait(retryDelayMs);
        } else break;
      }
      throw lastError ?? new Error("PREFLIGHT_FORMATION_DEADLINE_REACHED");
    },
  });
}
