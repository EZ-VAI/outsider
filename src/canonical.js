import { createHash } from "node:crypto";
import { isProxy as nodeIsProxy } from "node:util/types";

export const CANONICAL_STRICT_MAX_DEPTH = 64;
export const CANONICAL_STRICT_MAX_MEMBERS = 65_536;
// A frozen, byte-pinned Stage 1 public-agent manifest contains 88,855
// cumulatively addressable members.  Keep that legacy replay exception
// explicit and scoped instead of weakening every canonical trust boundary.
export const CANONICAL_STRICT_BOUNDED_ARTIFACT_MAX_MEMBERS = 131_072;
export const CANONICAL_STRICT_MAX_STRING_CODE_UNITS = 1_048_576;
export const CANONICAL_STRICT_MAX_WORK_UNITS = 67_108_864;

/* Capture the JSON-semantic intrinsics once.  A caller in the same process may
   mutate globals after import; canonical replay must not silently adopt those
   replacements.  Pre-import realm integrity remains the host's responsibility. */
const ArrayConstructor = Array;
const ArrayIsArray = Array.isArray;
const ArrayPrototype = Array.prototype;
const ObjectCreate = Object.create;
const ObjectPrototype = Object.prototype;
const ObjectDefineProperty = Object.defineProperty;
const ObjectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const ObjectGetPrototypeOf = Object.getPrototypeOf;
const ObjectHasOwn = Object.hasOwn;
const ObjectIs = Object.is;
const ReflectOwnKeys = Reflect.ownKeys;
const JSONStringify = JSON.stringify;
const NumberIsFinite = Number.isFinite;
const NumberIsSafeInteger = Number.isSafeInteger;
const SetConstructor = Set;
const uncurryThis = (method) => Function.prototype.call.bind(method);
const ArrayJoin = uncurryThis(Array.prototype.join);
const ArraySort = uncurryThis(Array.prototype.sort);
const SetAdd = uncurryThis(Set.prototype.add);
const SetDelete = uncurryThis(Set.prototype.delete);
const SetHas = uncurryThis(Set.prototype.has);
const RegExpExec = uncurryThis(RegExp.prototype.exec);
const StringCharCodeAt = uncurryThis(String.prototype.charCodeAt);
const StringConstructor = String;
const IsProxy = nodeIsProxy;
const JsonStringExpansionPattern = /["\\\u0000-\u001f\ud800-\udfff]/u;

function defineDataProperty(target, key, value) {
  const descriptor = ObjectCreate(null);
  descriptor.value = value;
  descriptor.writable = true;
  descriptor.enumerable = true;
  descriptor.configurable = true;
  ObjectDefineProperty(target, key, descriptor);
}

function safeAdd(left, right, message) {
  if (!NumberIsSafeInteger(left) || left < 0
    || !NumberIsSafeInteger(right) || right < 0) {
    throw new TypeError(message);
  }
  const result = left + right;
  if (!NumberIsSafeInteger(result)) throw new TypeError(message);
  return result;
}

function reserveMembers(state, count) {
  const next = safeAdd(state.members, count, "canonical member budget exceeded");
  if (next > state.memberLimit) {
    throw new TypeError("canonical member budget exceeded");
  }
  state.members = next;
}

function reserveWork(state, count) {
  const next = safeAdd(state.work, count, "canonical work budget exceeded");
  if (next > CANONICAL_STRICT_MAX_WORK_UNITS) {
    throw new TypeError("canonical work budget exceeded");
  }
  state.work = next;
}

function enterContainer(depth) {
  const next = safeAdd(depth, 1, "canonical depth budget exceeded");
  if (next > CANONICAL_STRICT_MAX_DEPTH) {
    throw new TypeError("canonical depth budget exceeded");
  }
  return next;
}

function assertStringWithinLimit(value) {
  if (!NumberIsSafeInteger(value.length)
    || value.length > CANONICAL_STRICT_MAX_STRING_CODE_UNITS) {
    throw new TypeError("canonical string budget exceeded");
  }
}

/* JSON.stringify can expand a lone UTF-16 code unit to six output code units.
   Measure first so the allocation is admitted by the work budget, not merely
   discovered after the output string already exists. */
function jsonStringLength(value) {
  if (RegExpExec(JsonStringExpansionPattern, value) === null) {
    return safeAdd(value.length, 2, "canonical work budget exceeded");
  }
  let encodedLength = 2;
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = StringCharCodeAt(value, index);
    let width = 1;
    if (codeUnit === 0x22 || codeUnit === 0x5c
      || codeUnit === 0x08 || codeUnit === 0x09 || codeUnit === 0x0a
      || codeUnit === 0x0c || codeUnit === 0x0d) {
      width = 2;
    } else if (codeUnit <= 0x1f) {
      width = 6;
    } else if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      const next = index + 1 < value.length
        ? StringCharCodeAt(value, index + 1) : -1;
      if (next >= 0xdc00 && next <= 0xdfff) {
        width = 2;
        index += 1;
      } else {
        width = 6;
      }
    } else if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
      width = 6;
    }
    encodedLength += width;
  }
  if (!NumberIsSafeInteger(encodedLength)
    || encodedLength > CANONICAL_STRICT_MAX_WORK_UNITS) {
    throw new TypeError("canonical work budget exceeded");
  }
  return encodedLength;
}

function encodeString(value, state) {
  assertStringWithinLimit(value);
  const encodedLength = jsonStringLength(value);
  reserveWork(state, safeAdd(value.length, encodedLength,
    "canonical work budget exceeded"));
  const encoded = JSONStringify(value);
  if (encoded.length !== encodedLength) {
    throw new TypeError("canonical string encoding length mismatch");
  }
  return encoded;
}

function finishContainer(encoded, opening, closing, state) {
  let joinedLength = encoded.length === 0 ? 0 : encoded.length - 1;
  for (let index = 0; index < encoded.length; index += 1) {
    joinedLength = safeAdd(joinedLength, encoded[index].length,
      "canonical work budget exceeded");
  }
  const outputLength = safeAdd(joinedLength, 2, "canonical work budget exceeded");
  reserveWork(state, safeAdd(joinedLength, outputLength,
    "canonical work budget exceeded"));
  return `${opening}${ArrayJoin(encoded, ",")}${closing}`;
}

function sortCanonicalKeys(keys, state) {
  reserveWork(state, keys.length);
  ArraySort(keys, (left, right) => {
    const sharedLength = left.length < right.length ? left.length : right.length;
    for (let index = 0; index < sharedLength; index += 1) {
      reserveWork(state, 1);
      const leftCodeUnit = StringCharCodeAt(left, index);
      const rightCodeUnit = StringCharCodeAt(right, index);
      if (leftCodeUnit < rightCodeUnit) return -1;
      if (leftCodeUnit > rightCodeUnit) return 1;
    }
    reserveWork(state, 1);
    if (left.length < right.length) return -1;
    if (left.length > right.length) return 1;
    return 0;
  });
}

function canonicalizeValue(value, active, state, depth) {
  if (IsProxy(value)) throw new TypeError("canonical proxies are not supported");
  if (value === null) {
    reserveWork(state, 4);
    return "null";
  }
  if (typeof value === "string") return encodeString(value, state);
  if (typeof value === "boolean") {
    reserveWork(state, value ? 4 : 5);
    return JSONStringify(value);
  }
  if (typeof value === "number") {
    if (!NumberIsFinite(value) || ObjectIs(value, -0)) {
      throw new TypeError("canonical values must contain only finite numbers");
    }
    /* Every finite ECMAScript number has a bounded JSON representation. */
    reserveWork(state, 24);
    return JSONStringify(value);
  }
  if (typeof value === "undefined" || typeof value === "function"
    || typeof value === "symbol" || typeof value === "bigint") {
    throw new TypeError(`unsupported canonical value type:${typeof value}`);
  }

  /* util.types.isProxy does not invoke Proxy traps.  The check at function
     entry precedes Array.isArray, prototype lookup, key enumeration, and
     descriptor lookup, including for callable and revoked proxies. */
  const childDepth = enterContainer(depth);
  if (SetHas(active, value)) throw new TypeError("cyclic canonical value");
  reserveWork(state, 1);
  SetAdd(active, value);
  try {
    if (ArrayIsArray(value)) {
      if (ObjectGetPrototypeOf(value) !== ArrayPrototype) {
        throw new TypeError("canonical arrays must use Array.prototype");
      }
      const elementCount = value.length;
      reserveMembers(state, elementCount);
      const expectedOwnKeyCount = safeAdd(elementCount, 1,
        "canonical work budget exceeded");
      reserveWork(state, expectedOwnKeyCount);
      const ownKeys = ReflectOwnKeys(value);
      let exact = ownKeys.length === expectedOwnKeyCount
        && ownKeys[ownKeys.length - 1] === "length";
      for (let index = 0; exact && index < elementCount; index += 1) {
        reserveWork(state, 10);
        exact = ownKeys[index] === StringConstructor(index);
      }
      if (!exact) {
        throw new TypeError("canonical arrays must be dense and undecorated");
      }
      reserveWork(state, elementCount);
      const encoded = new ArrayConstructor(elementCount);
      for (let index = 0; index < elementCount; index += 1) {
        reserveWork(state, 1);
        const key = ownKeys[index];
        const descriptor = ObjectGetOwnPropertyDescriptor(value, key);
        if (!descriptor || !ObjectHasOwn(descriptor, "value")
          || descriptor.enumerable !== true) {
          throw new TypeError("canonical arrays must contain enumerable data elements");
        }
        reserveWork(state, 1);
        defineDataProperty(encoded, index,
          canonicalizeValue(descriptor.value, active, state, childDepth));
      }
      return finishContainer(encoded, "[", "]", state);
    }
    const prototype = ObjectGetPrototypeOf(value);
    if (prototype !== ObjectPrototype && prototype !== null) {
      throw new TypeError("canonical values must be plain objects or arrays");
    }
    reserveWork(state, 1);
    const ownKeys = ReflectOwnKeys(value);
    reserveMembers(state, ownKeys.length);
    reserveWork(state, ownKeys.length);
    for (let index = 0; index < ownKeys.length; index += 1) {
      if (typeof ownKeys[index] !== "string") {
        throw new TypeError("canonical objects must not contain symbol properties");
      }
      assertStringWithinLimit(ownKeys[index]);
      reserveWork(state, ownKeys[index].length);
      reserveWork(state, 1);
      const descriptor = ObjectGetOwnPropertyDescriptor(value, ownKeys[index]);
      if (!descriptor || descriptor.enumerable !== true) {
        throw new TypeError("canonical objects must not contain hidden properties");
      }
      if (!ObjectHasOwn(descriptor, "value")) {
        throw new TypeError("canonical objects must contain enumerable data properties");
      }
    }
    sortCanonicalKeys(ownKeys, state);
    reserveWork(state, ownKeys.length);
    const entries = new ArrayConstructor(ownKeys.length);
    for (let index = 0; index < ownKeys.length; index += 1) {
      const key = ownKeys[index];
      reserveWork(state, 1);
      const descriptor = ObjectGetOwnPropertyDescriptor(value, key);
      const encodedKey = encodeString(key, state);
      reserveWork(state, 1);
      const encodedValue = canonicalizeValue(descriptor.value, active, state, childDepth);
      const entryLength = safeAdd(safeAdd(encodedKey.length, 1,
        "canonical work budget exceeded"), encodedValue.length,
        "canonical work budget exceeded");
      reserveWork(state, entryLength);
      defineDataProperty(entries, index, `${encodedKey}:${encodedValue}`);
    }
    return finishContainer(entries, "{", "}", state);
  } finally {
    SetDelete(active, value);
  }
}

export function canonicalizeStrict(value) {
  const state = ObjectCreate(null);
  defineDataProperty(state, "members", 0);
  defineDataProperty(state, "work", 0);
  defineDataProperty(state, "memberLimit", CANONICAL_STRICT_MAX_MEMBERS);
  return canonicalizeValue(value, new SetConstructor(), state, 0);
}

/* Compatibility-only serializer for already byte-pinned historical artifacts
 * whose frozen canonical form exceeds the ordinary member ceiling.  New
 * records must use canonicalizeStrict(). */
export function canonicalizeStrictBoundedArtifact(value) {
  const state = ObjectCreate(null);
  defineDataProperty(state, "members", 0);
  defineDataProperty(state, "work", 0);
  defineDataProperty(state, "memberLimit",
    CANONICAL_STRICT_BOUNDED_ARTIFACT_MAX_MEMBERS);
  return canonicalizeValue(value, new SetConstructor(), state, 0);
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
