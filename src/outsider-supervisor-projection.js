/*
 * External supervisors are an optional disclosure boundary.  Keep the local
 * controller's full evidence for deterministic policy and hashing, but expose
 * only this recursively redacted projection to a separately configured judge.
 */

const SENSITIVE_BASENAME = /^(?:\.env(?:\..+)?|\.envrc|credentials?(?:\..+)?|secrets?(?:\..+)?|auth\.json|\.git-credentials|application_default_credentials\.json|id_(?:rsa|dsa|ecdsa|ed25519)(?:\.pub)?|service[-_]?account(?:[-_.].*)?\.json|\.?(?:npmrc|pypirc|netrc|dockercfg))$/iu;
const SENSITIVE_EXTENSION = /\.(?:pem|key|p12|pfx|jks|keystore)$/iu;
const SENSITIVE_DIRECTORY = /^(?:\.aws|\.docker|\.gnupg|\.kube|\.ssh|gcloud|credentials?|secrets?)$/iu;
function normalizedFieldName(value) {
  return String(value ?? "").replace(/([a-z0-9])([A-Z])/gu, "$1_$2")
    .replace(/[^A-Za-z0-9]+/gu, "_").replace(/^_+|_+$/gu, "").toLowerCase();
}

function isPathIdentityKey(value) {
  const normalized = normalizedFieldName(value);
  return /^(?:path|file|filename|file_path|filepath|source_path|target_path|cwd|directory|root|workspace_root)$/u.test(normalized)
    || /_(?:path|file|filename)$/u.test(normalized);
}

function isSensitiveSupervisorKey(value) {
  const normalized = normalizedFieldName(value);
  if (!normalized) return false;
  if (/^(?:token_(?:count|budget|usage|waste)|max_tokens?|input_tokens?|output_tokens?)$/u
    .test(normalized)) return false;
  return /^(?:authorization|auth|credentials?|password|passwd|private_key(?:_pem)?|api_(?:key|token)|access_(?:key|token)|auth_token|refresh_token|client_secret|session_(?:key|token)|id_token|aws_secret_access_key|secret|token|cookie)$/u.test(normalized)
    || /_(?:credential|password|private_key|api_key|access_key|secret|token|cookie)$/u
      .test(normalized);
}

/** True for paths whose *name* conventionally carries credentials or keys. */
export function isSensitiveSupervisorPath(value) {
  const normalized = String(value ?? "").trim().replaceAll("\\", "/")
    .replace(/^['"`]|['"`]$/gu, "");
  if (!normalized) return false;
  const withoutQuery = normalized.split(/[?#]/u, 1)[0];
  const segments = withoutQuery.split("/").filter(Boolean);
  const basename = segments.at(-1) ?? "";
  return SENSITIVE_BASENAME.test(basename) || SENSITIVE_EXTENSION.test(basename)
    || segments.some((segment) => SENSITIVE_DIRECTORY.test(segment));
}

function redactUrlQueries(text) {
  return text.replace(/\bhttps?:\/\/[^\s<>"'`]+/giu, (candidate) => {
    const trailing = candidate.match(/[),.;:!?\]}]+$/u)?.[0] ?? "";
    const raw = trailing ? candidate.slice(0, -trailing.length) : candidate;
    try {
      const parsed = new URL(raw);
      if (!parsed.search && !parsed.hash && !parsed.username && !parsed.password) return candidate;
      const port = parsed.port ? `:${parsed.port}` : "";
      const query = parsed.search ? "?[REDACTED_QUERY]" : "";
      const fragment = parsed.hash ? "#[REDACTED_FRAGMENT]" : "";
      return `${parsed.protocol}//${parsed.hostname}${port}${parsed.pathname}${query}${fragment}${trailing}`;
    } catch {
      const queryAt = raw.indexOf("?");
      if (queryAt < 0) return candidate;
      return `${raw.slice(0, queryAt)}?[REDACTED_QUERY]${trailing}`;
    }
  });
}

function redactSensitivePathFragments(text) {
  /* Shell actions and tool outputs can contain a sensitive path without a
     typed `path` field.  Redact the complete token, including parent folders,
     so the filename itself is not disclosed. */
  return text.replace(/(?:[A-Za-z]:)?(?:[^\s<>"'`|;,()[\]{}]+[\\/])*(?:\.env(?:\.[A-Za-z0-9_.-]+)?|\.envrc|credentials?(?:\.[A-Za-z0-9_.-]+)?|secrets?(?:\.[A-Za-z0-9_.-]+)?|auth\.json|\.git-credentials|application_default_credentials\.json|\.aws|\.docker|\.gnupg|\.kube|\.ssh|gcloud|id_(?:rsa|dsa|ecdsa|ed25519)(?:\.pub)?|service[-_]?account(?:[-_.][A-Za-z0-9_.-]*)?\.json|\.?(?:npmrc|pypirc|netrc|dockercfg)|[A-Za-z0-9_.-]+\.(?:pem|key|p12|pfx|jks|keystore))(?:[\\/][^\s<>"'`|;,()[\]{}]+)*/giu,
    "[REDACTED_SENSITIVE_PATH]");
}

/** Redact secret-bearing text while retaining enough surrounding evidence for
 * semantic diagnosis.  This function is deliberately idempotent. */
export function redactExternalSupervisorText(value) {
  const markers = [];
  const shieldMarkers = (input) => input.replace(/\[REDACTED_[A-Z_]+\]/gu, (marker) => {
    const index = markers.push(marker) - 1;
    return `\uE000${index}\uE001`;
  });
  let text = shieldMarkers(String(value ?? ""));
  text = text.replace(/-----BEGIN ([A-Z0-9 ]*PRIVATE KEY(?: BLOCK)?)-----[\s\S]*?-----END \1-----/giu,
    "[REDACTED_PRIVATE_KEY]");
  text = text.replace(/---- BEGIN SSH2 (?:ENCRYPTED )?PRIVATE KEY ----[\s\S]*?---- END SSH2 (?:ENCRYPTED )?PRIVATE KEY ----/giu,
    "[REDACTED_PRIVATE_KEY]");
  text = text.replace(/\bAGE-SECRET-KEY-[A-Z0-9-]+\b/gu, "[REDACTED_PRIVATE_KEY]");
  text = text.replace(/(\bauthorization\s*[:=]\s*)(?:bearer|basic)\s+[^\s,;"']+/giu,
    "$1[REDACTED_SECRET]");
  text = text.replace(/\bBearer\s+[^\s,;"']+/giu,
    "Bearer [REDACTED_TOKEN]");
  text = text.replace(/\b(?:sk-[A-Za-z0-9_-]{12,}|gh[pousr]_[A-Za-z0-9]{12,}|xox[baprs]-[A-Za-z0-9-]{12,}|AKIA[A-Z0-9]{16}|eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,})\b/gu,
    "[REDACTED_TOKEN]");
  text = shieldMarkers(text);
  /* Handles dotenv, command-line assignments, YAML and JSON keys. */
  text = text.replace(/((?:["'`])?(?:authorization|auth|credentials?|password|passwd|private[_-]?key(?:[_-]?pem)?|api[_-]?(?:key|token)|access[_-]?(?:key|token)|auth[_-]?token|refresh[_-]?token|client[_-]?secret|session[_-]?token|id[_-]?token|aws[_-]?secret[_-]?access[_-]?key|secret|token)(?:["'`])?\s*[:=]\s*)("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|[^\s,;\]}]+)/giu,
    (_match, prefix, secret) => {
      const quote = ["\"", "'", "`"].includes(secret[0]) ? secret[0] : "";
      return `${prefix}${quote}[REDACTED_SECRET]${quote}`;
    });
  text = redactUrlQueries(text);
  text = shieldMarkers(text);
  text = redactSensitivePathFragments(text);
  return text.replace(/\uE000(\d+)\uE001/gu,
    (_match, index) => markers[Number(index)] ?? "[REDACTED]");
}

function objectHasSensitiveIdentity(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return Object.entries(value).some(([key, candidate]) => isPathIdentityKey(key)
    && typeof candidate === "string" && isSensitiveSupervisorPath(candidate));
}

const SENSITIVE_EVIDENCE_PAYLOAD_KEY = new Set([
  "body", "bytes", "content", "data", "output", "raw", "text",
]);

function containsSensitiveIdentity(value, remainingDepth = 3, seen = new WeakSet()) {
  if (!value || typeof value !== "object" || remainingDepth < 0) return false;
  if (seen.has(value)) return false;
  seen.add(value);
  if (objectHasSensitiveIdentity(value)) return true;
  if (remainingDepth === 0) return false;
  const children = Array.isArray(value) ? value : Object.values(value);
  return children.some((child) => containsSensitiveIdentity(child,
    remainingDepth - 1, seen));
}

/* Caller schemas often separate a file identity from its bytes:
 *   { metadata:{filePath:".env"}, content:"..." }
 * Redacting only the nested metadata leaves the sibling payload untouched.
 * Mark the nearest payload-bearing evidence unit instead. Requiring a direct
 * payload sibling and bounding identity descent prevents one sensitive child
 * elsewhere in a large supervisor packet from erasing the whole packet. */
function objectIsSensitiveEvidenceUnit(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  if (objectHasSensitiveIdentity(value)) return true;
  const entries = Object.entries(value);
  if (!entries.some(([key]) => SENSITIVE_EVIDENCE_PAYLOAD_KEY.has(normalizedFieldName(key)))) {
    return false;
  }
  return entries.some(([key, candidate]) =>
    !SENSITIVE_EVIDENCE_PAYLOAD_KEY.has(normalizedFieldName(key))
    && containsSensitiveIdentity(candidate));
}

/**
 * Recursively project any packet, including unknown future fields.  Sensitive
 * file evidence is omitted as a unit; secret-looking values and embedded paths
 * are redacted.  The caller's object is never mutated.
 */
export function projectExternalSupervisorValue(value, {
  maxDepth = 24, maxArrayItems = 320, maxStringLength = 24_000,
} = {}) {
  const seen = new WeakSet();
  const visit = (current, key = "", depth = 0) => {
    if (current == null || typeof current === "boolean" || typeof current === "number") {
      return current;
    }
    if (typeof current === "bigint") return String(current);
    if (typeof current === "string") {
      if (isSensitiveSupervisorKey(key)) return "[REDACTED_SECRET]";
      if (isPathIdentityKey(key) && isSensitiveSupervisorPath(current)) {
        return "[REDACTED_SENSITIVE_PATH]";
      }
      const redacted = redactExternalSupervisorText(current);
      return redacted.length <= maxStringLength ? redacted
        : `${redacted.slice(0, maxStringLength)}\n[TRUNCATED]`;
    }
    if (typeof current !== "object") return redactExternalSupervisorText(current);
    if (seen.has(current)) return "[REDACTED_CIRCULAR_REFERENCE]";
    if (depth >= maxDepth) return "[TRUNCATED_DEPTH]";
    if (objectIsSensitiveEvidenceUnit(current)) {
      return { redacted: true, reason: "sensitive-path-evidence-not-exported" };
    }
    seen.add(current);
    if (ArrayBuffer.isView(current) || current instanceof ArrayBuffer) {
      return { redacted: true, reason: "binary-evidence-not-exported",
        byteLength: Number(current.byteLength ?? 0) };
    }
    if (Array.isArray(current)) {
      const result = [];
      for (const item of current.slice(0, maxArrayItems)) {
        if (objectIsSensitiveEvidenceUnit(item)) continue;
        result.push(visit(item, key, depth + 1));
      }
      if (current.length > maxArrayItems) result.push("[TRUNCATED_ARRAY]");
      return result;
    }
    const prototype = Object.getPrototypeOf(current);
    if (prototype !== Object.prototype && prototype !== null) {
      return { redacted: true, reason: "non-plain-evidence-not-exported",
        type: String(current?.constructor?.name ?? "Object").slice(0, 80) };
    }
    const result = {};
    for (const [childKey, childValue] of Object.entries(current)) {
      /* Snapshot file maps use relative paths as object keys. */
      if (isSensitiveSupervisorPath(childKey)) continue;
      if (isSensitiveSupervisorKey(childKey)) {
        result[childKey] = "[REDACTED_SECRET]";
        continue;
      }
      result[childKey] = visit(childValue, childKey, depth + 1);
    }
    return result;
  };
  return visit(value);
}

/** One canonical formatting path for compiler, diagnosis, audit and outcome. */
export function externalSupervisorPrompt({ prompt, heading, packet, suffix = "" } = {}) {
  const projected = projectExternalSupervisorValue(packet);
  const cleanPrompt = redactExternalSupervisorText(prompt);
  const cleanHeading = redactExternalSupervisorText(heading);
  const cleanSuffix = redactExternalSupervisorText(suffix);
  return `${cleanPrompt}\n\n${cleanHeading}\n${JSON.stringify(projected, null, 2)}\n${cleanSuffix}`;
}

/* Do not hand an external command every credential in the controller's
 * environment.  Login/config files remain usable through HOME, while API keys,
 * session tokens, cloud credentials and Outsider controller secrets are absent. */
const SAFE_ENVIRONMENT_KEYS = new Set([
  "APPDATA", "COLORTERM", "ComSpec", "HOME", "LANG", "LOCALAPPDATA", "LOGNAME",
  "NO_COLOR", "PATH", "PATHEXT", "SHELL", "SSL_CERT_DIR", "SSL_CERT_FILE", "SystemRoot",
  "TEMP", "TERM", "TMP", "TMPDIR", "TZ", "USER", "USERPROFILE", "WINDIR",
  "XDG_CACHE_HOME", "XDG_CONFIG_HOME", "XDG_DATA_HOME", "CLAUDE_CONFIG_DIR",
]);

export function externalSupervisorEnvironment(base = process.env) {
  const environment = {};
  for (const [key, value] of Object.entries(base ?? {})) {
    if (value == null) continue;
    if (SAFE_ENVIRONMENT_KEYS.has(key) || /^LC_/u.test(key)) environment[key] = String(value);
  }
  environment.CLAUDE_CODE_DISABLE_AUTO_MEMORY = "1";
  return environment;
}
