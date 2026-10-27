/*
 * Strict canonical JSON compatibility for three already frozen evidence
 * projections (AIID, USDA RMA and CAS Schedule P).
 *
 * This is intentionally separate from canonical.js.  New protocol records
 * keep the ordinary 65,536-member / 64 Mi-work boundary.  The legacy evidence
 * projections were frozen before that limit existed and contain bounded,
 * source-replayed row sets.  Their adapters must independently pin the exact
 * schema and source objects before treating a replay as official.
 */

import { isProxy as nodeIsProxy } from "node:util/types";

export const PINNED_LEGACY_EVIDENCE_CANONICAL_LIMITS = Object.freeze({
  maximumDepth: 64,
  maximumMembers: 1_048_576,
  maximumStringCodeUnits: 1_048_576,
  maximumWorkUnits: 536_870_912,
  maximumOutputCodeUnits: 67_108_864,
});

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
  const next = safeAdd(state.members, count,
    "legacy evidence canonical member budget exceeded");
  if (next > PINNED_LEGACY_EVIDENCE_CANONICAL_LIMITS.maximumMembers) {
    throw new TypeError("legacy evidence canonical member budget exceeded");
  }
  state.members = next;
}

function reserveWork(state, count) {
  const next = safeAdd(state.work, count,
    "legacy evidence canonical work budget exceeded");
  if (next > PINNED_LEGACY_EVIDENCE_CANONICAL_LIMITS.maximumWorkUnits) {
    throw new TypeError("legacy evidence canonical work budget exceeded");
  }
  state.work = next;
}

function enterContainer(depth) {
  const next = safeAdd(depth, 1,
    "legacy evidence canonical depth budget exceeded");
  if (next > PINNED_LEGACY_EVIDENCE_CANONICAL_LIMITS.maximumDepth) {
    throw new TypeError("legacy evidence canonical depth budget exceeded");
  }
  return next;
}

function assertStringWithinLimit(value) {
  if (!NumberIsSafeInteger(value.length)
    || value.length
      > PINNED_LEGACY_EVIDENCE_CANONICAL_LIMITS.maximumStringCodeUnits) {
    throw new TypeError("legacy evidence canonical string budget exceeded");
  }
}

function jsonStringLength(value) {
  if (RegExpExec(JsonStringExpansionPattern, value) === null) {
    return safeAdd(value.length, 2,
      "legacy evidence canonical work budget exceeded");
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
  return encodedLength;
}

function encodeString(value, state) {
  assertStringWithinLimit(value);
  const encodedLength = jsonStringLength(value);
  reserveWork(state, safeAdd(value.length, encodedLength,
    "legacy evidence canonical work budget exceeded"));
  const encoded = JSONStringify(value);
  if (encoded.length !== encodedLength) {
    throw new TypeError("legacy evidence canonical string length mismatch");
  }
  return encoded;
}

function finishContainer(encoded, opening, closing, state) {
  let joinedLength = encoded.length === 0 ? 0 : encoded.length - 1;
  for (let index = 0; index < encoded.length; index += 1) {
    joinedLength = safeAdd(joinedLength, encoded[index].length,
      "legacy evidence canonical work budget exceeded");
  }
  const outputLength = safeAdd(joinedLength, 2,
    "legacy evidence canonical work budget exceeded");
  if (outputLength
    > PINNED_LEGACY_EVIDENCE_CANONICAL_LIMITS.maximumOutputCodeUnits) {
    throw new TypeError("legacy evidence canonical output budget exceeded");
  }
  reserveWork(state, safeAdd(joinedLength, outputLength,
    "legacy evidence canonical work budget exceeded"));
  return `${opening}${ArrayJoin(encoded, ",")}${closing}`;
}

function sortCanonicalKeys(keys, state) {
  reserveWork(state, keys.length);
  ArraySort(keys, (left, right) => {
    const sharedLength = left.length < right.length
      ? left.length : right.length;
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
  if (IsProxy(value)) {
    throw new TypeError("legacy evidence canonical proxies are unsupported");
  }
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
      throw new TypeError("legacy evidence canonical numbers must be finite");
    }
    reserveWork(state, 24);
    return JSONStringify(value);
  }
  if (typeof value === "undefined" || typeof value === "function"
    || typeof value === "symbol" || typeof value === "bigint") {
    throw new TypeError(
      `unsupported legacy evidence canonical type:${typeof value}`);
  }

  const childDepth = enterContainer(depth);
  if (SetHas(active, value)) {
    throw new TypeError("cyclic legacy evidence canonical value");
  }
  SetAdd(active, value);
  try {
    if (ArrayIsArray(value)) {
      if (ObjectGetPrototypeOf(value) !== ArrayPrototype) {
        throw new TypeError("legacy evidence arrays must use Array.prototype");
      }
      const elementCount = value.length;
      reserveMembers(state, elementCount);
      const ownKeys = ReflectOwnKeys(value);
      if (ownKeys.length !== elementCount + 1
        || ownKeys[ownKeys.length - 1] !== "length") {
        throw new TypeError("legacy evidence arrays must be dense");
      }
      const encoded = new ArrayConstructor(elementCount);
      for (let index = 0; index < elementCount; index += 1) {
        if (ownKeys[index] !== StringConstructor(index)) {
          throw new TypeError("legacy evidence arrays must be undecorated");
        }
        const descriptor = ObjectGetOwnPropertyDescriptor(value, ownKeys[index]);
        if (!descriptor || !ObjectHasOwn(descriptor, "value")
          || descriptor.enumerable !== true) {
          throw new TypeError("legacy evidence array element invalid");
        }
        defineDataProperty(encoded, index,
          canonicalizeValue(descriptor.value, active, state, childDepth));
      }
      return finishContainer(encoded, "[", "]", state);
    }

    const prototype = ObjectGetPrototypeOf(value);
    if (prototype !== ObjectPrototype && prototype !== null) {
      throw new TypeError("legacy evidence values must be plain objects");
    }
    const ownKeys = ReflectOwnKeys(value);
    reserveMembers(state, ownKeys.length);
    for (let index = 0; index < ownKeys.length; index += 1) {
      if (typeof ownKeys[index] !== "string") {
        throw new TypeError("legacy evidence symbol properties are forbidden");
      }
      assertStringWithinLimit(ownKeys[index]);
      const descriptor = ObjectGetOwnPropertyDescriptor(value, ownKeys[index]);
      if (!descriptor || descriptor.enumerable !== true
        || !ObjectHasOwn(descriptor, "value")) {
        throw new TypeError("legacy evidence data property invalid");
      }
    }
    sortCanonicalKeys(ownKeys, state);
    const entries = new ArrayConstructor(ownKeys.length);
    for (let index = 0; index < ownKeys.length; index += 1) {
      const key = ownKeys[index];
      const descriptor = ObjectGetOwnPropertyDescriptor(value, key);
      const encodedKey = encodeString(key, state);
      const encodedValue = canonicalizeValue(
        descriptor.value, active, state, childDepth);
      const entryLength = safeAdd(encodedKey.length + 1,
        encodedValue.length,
        "legacy evidence canonical work budget exceeded");
      reserveWork(state, entryLength);
      defineDataProperty(entries, index, `${encodedKey}:${encodedValue}`);
    }
    return finishContainer(entries, "{", "}", state);
  } finally {
    SetDelete(active, value);
  }
}

export function canonicalizePinnedLegacyEvidence(value) {
  const state = ObjectCreate(null);
  defineDataProperty(state, "members", 0);
  defineDataProperty(state, "work", 0);
  return canonicalizeValue(value, new SetConstructor(), state, 0);
}
