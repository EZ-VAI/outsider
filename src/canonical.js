import { createHash } from "node:crypto";

function canonicalizeValue(value, active) {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError("canonical values must contain only finite numbers");
    }
    return JSON.stringify(value);
  }
  if (["undefined", "function", "symbol", "bigint"].includes(typeof value)) {
    throw new TypeError(`unsupported canonical value type:${typeof value}`);
  }

  if (active.has(value)) throw new TypeError("cyclic canonical value");
  active.add(value);
  if (Array.isArray(value)) {
    const encoded = `[${value.map((item) => (
      canonicalizeValue(item, active)
    )).join(",")}]`;
    active.delete(value);
    return encoded;
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    active.delete(value);
    throw new TypeError("canonical values must be plain objects or arrays");
  }

  const entries = Object.keys(value)
    .sort()
    .map((key) => (
      `${JSON.stringify(key)}:${canonicalizeValue(value[key], active)}`
    ));
  active.delete(value);
  return `{${entries.join(",")}}`;
}

export function canonicalizeStrict(value) {
  return canonicalizeValue(value, new Set());
}

/*
 * Legacy artifacts from V1–V38.0.6 committed the historical serializer,
 * including its treatment of optional `undefined` members and exotic
 * objects. Changing those bytes would silently invalidate prior evidence.
 * Keep that compatibility in canonicalize()/sha256(); new trust-boundary
 * code should call canonicalizeStrict() before hashing untrusted input.
 */
export function canonicalize(value) {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalize).join(",")}]`;
  }
  const entries = Object.keys(value)
    .sort()
    .map((key) => (
      `${JSON.stringify(key)}:${canonicalize(value[key])}`
    ));
  return `{${entries.join(",")}}`;
}

export function sha256(value) {
  let input;
  if (typeof value === "string" || Buffer.isBuffer(value)) {
    input = value;
  } else if (value === null || ["number", "boolean"].includes(typeof value)) {
    input = `outsider:scalar:${typeof value}:${canonicalizeStrict(value)}`;
  } else if (value === undefined) {
    throw new TypeError("unsupported hash value type:undefined");
  } else {
    input = canonicalize(value);
  }
  return `sha256:${createHash("sha256").update(input).digest("hex")}`;
}
