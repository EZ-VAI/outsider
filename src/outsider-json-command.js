import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const managedCommandRunner = fileURLToPath(new URL("./outsider-json-command-process.mjs",
  import.meta.url));

const tail = (value, max = 2000) => String(value ?? "").slice(-max);

/** Preserve the process facts that Node exposes on an exec failure.  A single
 * flattened message hid whether the judge timed out, exited non-zero, lost its
 * network connection, or merely returned malformed JSON.  Recovery policy must
 * be based on those facts, not on a regex over a lossy sentence. */
export function commandFailure(error, { kind = "process" } = {}) {
  const message = String(error?.message ?? error ?? "command failed");
  const stderrTail = tail(error?.stderr);
  const stdoutTail = tail(error?.stdout);
  const code = error?.code == null ? null : String(error.code);
  const status = Number.isInteger(error?.status) ? error.status : null;
  const signal = error?.signal == null ? null : String(error.signal);
  const timedOut = code === "ETIMEDOUT" || /timed?\s*out/i.test(message);
  const combined = `${message}\n${stderrTail}\n${stdoutTail}`;
  const budgetGuardExhausted = /CLAUDE_BUDGET_GUARD_INVOCATION_LIMIT:\d+/i.test(combined);
  const permanent = budgetGuardExhausted
    || /(?:not logged in|please (?:run )?\/?login|authentication required|unknown option|unrecognized (?:option|argument)|invalid (?:option|argument)|no such file|\benoent\b|\beacces\b|permission denied)/i.test(combined);
  /* Claude's first-party control plane reports a temporary network/policy edge
     outage as `Failed to authenticate. API Error: 403 Request not allowed`,
     even when the local credential preflight passed immediately before the
     run. Treat that exact runtime shape as bounded capacity loss, not as proof
     that the user's credential is permanently invalid. */
  const firstPartyCapacityLoss = /failed to authenticate[\s\S]{0,200}\b403\b[\s\S]{0,200}request not allowed/i
    .test(combined);
  const transient = !permanent && (timedOut || signal != null
    || firstPartyCapacityLoss
    || /(?:execution error|temporar|overload|rate.?limit|\b429\b|\b5\d\d\b|econn|socket|network|connection|service unavailable|try again)/i.test(combined));
  const detail = [message, stderrTail, stdoutTail].filter(Boolean).join("\n").slice(0, 4000);
  return {
    error: detail || "command failed",
    failure: {
      kind,
      code,
      status,
      signal,
      timedOut,
      retryable: transient,
      category: budgetGuardExhausted ? "evaluation-budget"
        : transient ? "control-plane-capacity" : permanent ? "configuration" : "process",
      stderrTail,
      stdoutTail,
    },
  };
}

function validationViolations(value, validate, describeValidationErrors) {
  let valid = false;
  try { valid = Boolean(validate(value)); } catch (error) {
    return [`validator threw: ${String(error?.message ?? error).slice(0, 500)}`];
  }
  if (valid) return [];
  if (typeof describeValidationErrors !== "function") {
    return ["parsed JSON does not satisfy the required schema"];
  }
  try {
    const described = describeValidationErrors(value);
    if (!Array.isArray(described) || described.length === 0) {
      return ["parsed JSON does not satisfy the required schema"];
    }
    return described.map((item) => String(item).trim()).filter(Boolean).slice(0, 24);
  } catch (error) {
    return [`schema validator could not describe the violation: ${String(error?.message ?? error).slice(0, 500)}`];
  }
}

/** Inspect all JSON-looking regions without conflating syntax and schema.
 *
 * Model CLIs can print status text around a JSON object.  We therefore retain
 * non-structural status prose, but record whether the one top-level JSON region
 * parsed.  The old
 * implementation returned null for both malformed JSON and a perfectly parsed
 * object rejected by `validate`; that made a schema repair retry blind.
 */
export function inspectJsonResponse(output, validate = () => true,
  describeValidationErrors = null) {
  const text = String(output ?? "").replace(/```(?:json)?/gi, " ");
  const regions = [];
  const malformed = [];
  let start = -1;
  let stack = [];
  let inString = false;
  let escaped = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (start < 0) {
      if (char === "{" || char === "[") {
        start = index;
        stack = [char === "{" ? "}" : "]"];
        inString = false;
        escaped = false;
      } else if (char === "}" || char === "]") {
        malformed.push(`unmatched ${char} at byte ${index}`);
      }
      continue;
    }
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === "{" || char === "[") {
      stack.push(char === "{" ? "}" : "]");
      continue;
    }
    if (char !== "}" && char !== "]") continue;
    const expected = stack.at(-1);
    if (char !== expected) {
      malformed.push(`mismatched ${char} at byte ${index}; expected ${expected}`);
      start = -1;
      stack = [];
      inString = false;
      escaped = false;
      continue;
    }
    stack.pop();
    if (stack.length === 0) {
      regions.push(text.slice(start, index + 1));
      start = -1;
      inString = false;
      escaped = false;
    }
  }
  if (start >= 0) malformed.push(`unterminated JSON region beginning at byte ${start}`);
  const parsed = [];
  for (const region of regions) {
    try {
      const value = JSON.parse(region);
      parsed.push({ value,
        violations: validationViolations(value, validate, describeValidationErrors) });
    } catch (error) {
      malformed.push(`invalid JSON region: ${String(error?.message ?? error).slice(0, 300)}`);
    }
  }
  if (malformed.length || parsed.length === 0) {
    return { kind: "invalid-json", value: null, violations: malformed.slice(0, 24) };
  }
  /* Exactly one complete top-level region is the authority boundary.  A broken
     wrapper cannot expose a nested PASS, and an invalid first object cannot be
     ignored merely because a later object satisfies the schema. */
  if (parsed.length !== 1) {
    return { kind: "schema-invalid", value: parsed[0]?.value ?? null,
      violations: ["response contains multiple top-level JSON objects; exactly one authority object is required"] };
  }
  const authority = parsed[0];
  if (authority.violations.length === 0) {
    return { kind: "valid", value: authority.value, violations: [] };
  }
  return { kind: "schema-invalid", value: authority.value,
    violations: authority.violations };
}

export function extractJsonObject(output, validate = () => true) {
  const inspected = inspectJsonResponse(output, validate);
  return inspected.kind === "valid" ? inspected.value : null;
}

/** Run an operator-configured command in a fresh process and require typed JSON. */
export function runFreshJsonCommand({
  cmd,
  input,
  validate,
  describeValidationErrors = null,
  timeoutMs = 240_000,
  execute = execFileSync,
} = {}) {
  if (!cmd) return { ok: false, error: "NO_COMMAND" };
  let output;
  try {
    if (execute === execFileSync) {
      const executable = Array.isArray(cmd) ? cmd[0] : process.env.SHELL || "/bin/sh";
      const argv = Array.isArray(cmd) ? cmd.slice(1) : ["-lc", String(cmd)];
      const ownershipDirectory = process.env.OUTSIDER_JUDGE_OWNERSHIP_DIRECTORY ?? null;
      const ownerId = process.env.OUTSIDER_CONTROLLER_OWNER_ID ?? null;
      const generation = Number(process.env.OUTSIDER_CONTROLLER_GENERATION ?? 0);
      const ownership = ownershipDirectory && ownerId && Number.isInteger(generation)
        && generation > 0 ? { directory: ownershipDirectory, ownerId, generation,
          logicalOperationId: randomUUID() } : null;
      const envelopeRaw = execute(process.execPath, [managedCommandRunner], {
        input: JSON.stringify({ executable, argv, input, timeoutMs,
          ownership,
          env: { ...process.env, CLAUDE_CODE_DISABLE_AUTO_MEMORY: "1" } }),
        encoding: "utf8", timeout: timeoutMs + 5_000, maxBuffer: 20 * 1024 * 1024,
      });
      const envelope = JSON.parse(envelopeRaw);
      if (!envelope.ok) {
        const error = new Error(envelope.message || "command failed");
        error.code = envelope.code;
        error.status = envelope.status;
        error.signal = envelope.signal;
        error.stdout = envelope.stdout;
        error.stderr = envelope.stderr;
        throw error;
      }
      output = envelope.stdout;
    } else if (Array.isArray(cmd)) {
      output = execute(cmd[0], cmd.slice(1), {
        input, encoding: "utf8", timeout: timeoutMs, maxBuffer: 8 * 1024 * 1024,
        env: { ...process.env, CLAUDE_CODE_DISABLE_AUTO_MEMORY: "1" },
      });
    } else {
      output = execute(process.env.SHELL || "/bin/sh", ["-lc", String(cmd)], {
        input, encoding: "utf8", timeout: timeoutMs, maxBuffer: 8 * 1024 * 1024,
        env: { ...process.env, CLAUDE_CODE_DISABLE_AUTO_MEMORY: "1" },
      });
    }
  } catch (error) {
    return { ok: false, ...commandFailure(error) };
  }
  const inspected = inspectJsonResponse(output, validate, describeValidationErrors);
  if (inspected.kind === "valid") {
    return { ok: true, value: inspected.value,
      rawBytes: Buffer.byteLength(String(output)) };
  }
  if (inspected.kind === "schema-invalid") {
    const schemaViolations = inspected.violations.slice(0, 24);
    const retryInstruction = [
      "The previous response parsed as JSON but violated the required schema:",
      ...schemaViolations.map((item) => `- ${item}`),
      "Return exactly one corrected JSON object. Do not repeat the invalid shape and do not add prose.",
    ].join("\n");
    return {
      ok: false,
      error: `SCHEMA_INVALID_RESPONSE:${schemaViolations.join("; ").slice(0, 1200)}`,
      retryInput: `${String(input ?? "")}\n\n────── SCHEMA REPAIR REQUIRED ──────\n${retryInstruction}\n`,
      failure: {
        kind: "schema-invalid", code: null, status: 0, signal: null,
        timedOut: false, retryable: true, stderrTail: "", stdoutTail: tail(output),
        schemaViolations,
        retryInstruction,
      },
    };
  }
  const retryInstruction = "Return exactly one syntactically valid JSON object and no prose.";
  return { ok: false, error: `INVALID_JSON_RESPONSE:${String(output).trim().slice(0, 240)}`,
    retryInput: `${String(input ?? "")}\n\n────── JSON REPAIR REQUIRED ──────\n${retryInstruction}\n`,
    failure: { kind: "invalid-json", code: null, status: 0, signal: null,
      timedOut: false, retryable: true, stderrTail: "", stdoutTail: tail(output),
      schemaViolations: [],
      retryInstruction } };
}
