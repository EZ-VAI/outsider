import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";

import {
  CANONICAL_STRICT_BOUNDED_ARTIFACT_MAX_MEMBERS,
  CANONICAL_STRICT_MAX_DEPTH,
  CANONICAL_STRICT_MAX_MEMBERS,
  CANONICAL_STRICT_MAX_STRING_CODE_UNITS,
  CANONICAL_STRICT_MAX_WORK_UNITS,
  canonicalizeStrict,
  canonicalizeStrictBoundedArtifact,
} from "../src/canonical.js";

test("canonicalizeStrict preserves ordinary JSON canonical bytes", () => {
  assert.equal(canonicalizeStrict({ z: [1, null, true], a: "x" }),
    "{\"a\":\"x\",\"z\":[1,null,true]}");
  assert.equal(canonicalizeStrict(Object.assign(Object.create(null), { b: 2, a: 1 })),
    "{\"a\":1,\"b\":2}");
  assert.equal(canonicalizeStrict({ "\uffff": 2, "\ud83d\ude00": 1 }),
    "{\"\ud83d\ude00\":1,\"\uffff\":2}");
  const escaped = "\"\\\b\t\n\f\r\u0000\ud800\ud83d\ude00";
  assert.equal(canonicalizeStrict(escaped), JSON.stringify(escaped));
});

test("canonicalizeStrict rejects non-injective array representations", () => {
  const sparse = new Array(1);
  assert.throws(() => canonicalizeStrict(sparse), /dense and undecorated/u);

  const decorated = [];
  decorated.extra = true;
  assert.throws(() => canonicalizeStrict(decorated), /dense and undecorated/u);

  const symbolDecorated = [];
  symbolDecorated[Symbol("hidden")] = true;
  assert.throws(() => canonicalizeStrict(symbolDecorated), /dense and undecorated/u);

  const customPrototype = [];
  Object.setPrototypeOf(customPrototype, { inherited: true });
  assert.throws(() => canonicalizeStrict(customPrototype), /Array\.prototype/u);

  const accessor = [];
  Object.defineProperty(accessor, "0", { enumerable: true, configurable: true,
    get: () => "computed" });
  accessor.length = 1;
  assert.throws(() => canonicalizeStrict(accessor), /data elements/u);
});

test("canonicalizeStrict rejects hidden, symbolic, accessor, and negative-zero semantics", () => {
  const hidden = {};
  Object.defineProperty(hidden, "secret", { value: 1, enumerable: false });
  assert.throws(() => canonicalizeStrict(hidden), /hidden properties/u);

  const symbolic = { visible: true };
  symbolic[Symbol("secret")] = true;
  assert.throws(() => canonicalizeStrict(symbolic), /symbol properties/u);

  const accessor = {};
  Object.defineProperty(accessor, "computed", { enumerable: true, get: () => 1 });
  assert.throws(() => canonicalizeStrict(accessor), /data properties/u);

  assert.throws(() => canonicalizeStrict(-0), /finite numbers/u);
});

test("canonicalizeStrict does not adopt same-process intrinsic replacements after import", () => {
  const moduleUrl = new URL("../src/canonical.js", import.meta.url).href;
  const script = `
    const { canonicalizeStrict } = await import(${JSON.stringify(moduleUrl)});
    const custom = [];
    Object.setPrototypeOf(custom, { inherited: true });
    Object.getPrototypeOf = () => Object.prototype;
    Object.getOwnPropertyDescriptor = () => ({ value: "forged", enumerable: true });
    Object.keys = () => [];
    Reflect.ownKeys = () => [];
    JSON.stringify = () => '"forged"';
    Array.isArray = () => false;
    Array.prototype.constructor = { [Symbol.species]: function (length) {
      return new Proxy(new globalThis.Array(length), {
        set(target, key) { target[key] = "poisoned"; return true; },
      });
    } };
    globalThis.String = () => "poisoned";
    Number.isFinite = () => true;
    Set.prototype.has = () => false;
    Set.prototype.add = function () { return this; };
    Set.prototype.delete = () => false;
    const ordinary = canonicalizeStrict({ z: [2], a: 1 });
    let customResult = "accepted";
    try { canonicalizeStrict(custom); } catch { customResult = "rejected"; }
    process.stdout.write(ordinary + "|" + customResult);
  `;
  assert.equal(execFileSync(process.execPath, ["--input-type=module", "-e", script],
    { encoding: "utf8" }), '{"a":1,"z":[2]}|rejected');
});

test("canonicalizeStrict does not read a post-import RegExp.prototype.exec", () => {
  const moduleUrl = new URL("../src/canonical.js", import.meta.url).href;
  const script = `
    const { canonicalizeStrict } = await import(${JSON.stringify(moduleUrl)});
    const defineProperty = Object.defineProperty;
    const originalDescriptor = Object.getOwnPropertyDescriptor(RegExp.prototype, "exec");
    let execTouches = 0;
    defineProperty(RegExp.prototype, "exec", {
      configurable: true,
      get() {
        execTouches += 1;
        return () => { execTouches += 1; throw new Error("poisoned regexp exec"); };
      },
    });
    let plain;
    let escaped;
    try {
      plain = canonicalizeStrict("plain");
      escaped = canonicalizeStrict("line\\nfeed");
    } finally {
      defineProperty(RegExp.prototype, "exec", originalDescriptor);
    }
    process.stdout.write(plain + "|" + escaped + "|" + execTouches);
  `;
  assert.equal(execFileSync(process.execPath, ["--input-type=module", "-e", script],
    { encoding: "utf8" }), '"plain"|"line\\nfeed"|0');
});

test("canonicalizeStrict does not touch polluted Object.prototype descriptor fields", () => {
  const moduleUrl = new URL("../src/canonical.js", import.meta.url).href;
  const script = `
    const { canonicalizeStrict } = await import(${JSON.stringify(moduleUrl)});
    const fields = ["get", "set", "value", "enumerable", "configurable", "writable"];
    const defineProperty = Object.defineProperty;
    const create = Object.create;
    let getterTouches = 0;
    const poison = () => { getterTouches += 1; return undefined; };
    for (let index = 0; index < fields.length; index += 1) {
      const descriptor = create(null);
      descriptor.get = poison;
      descriptor.set = undefined;
      descriptor.enumerable = false;
      descriptor.configurable = true;
      defineProperty(Object.prototype, fields[index], descriptor);
    }
    let output;
    try {
      output = canonicalizeStrict({ z: [2], a: 1 });
    } catch (error) {
      output = "threw:" + error.name;
    } finally {
      for (let index = 0; index < fields.length; index += 1) {
        delete Object.prototype[fields[index]];
      }
    }
    process.stdout.write(output + "|" + getterTouches);
  `;
  assert.equal(execFileSync(process.execPath, ["--input-type=module", "-e", script],
    { encoding: "utf8" }), '{"a":1,"z":[2]}|0');
});

test("canonicalizeStrict rejects accessors without touching inherited descriptor value", () => {
  const moduleUrl = new URL("../src/canonical.js", import.meta.url).href;
  const script = `
    const { canonicalizeStrict } = await import(${JSON.stringify(moduleUrl)});
    const objectAccessor = {};
    Object.defineProperty(objectAccessor, "computed", {
      enumerable: true, configurable: true, get: () => "caller-value",
    });
    const arrayAccessor = [];
    Object.defineProperty(arrayAccessor, "0", {
      enumerable: true, configurable: true, get: () => "caller-value",
    });
    const defineProperty = Object.defineProperty;
    const descriptor = Object.create(null);
    let getterTouches = 0;
    descriptor.get = () => { getterTouches += 1; return "forged"; };
    descriptor.set = undefined;
    descriptor.enumerable = false;
    descriptor.configurable = true;
    defineProperty(Object.prototype, "value", descriptor);
    Object.hasOwn = () => true;
    let objectResult = "accepted";
    let arrayResult = "accepted";
    try { canonicalizeStrict(objectAccessor); } catch { objectResult = "rejected"; }
    try { canonicalizeStrict(arrayAccessor); } catch { arrayResult = "rejected"; }
    delete Object.prototype.value;
    process.stdout.write(objectResult + "|" + arrayResult + "|" + getterTouches);
  `;
  assert.equal(execFileSync(process.execPath, ["--input-type=module", "-e", script],
    { encoding: "utf8" }), "rejected|rejected|0");
});

test("canonicalizeStrict rejects Proxy inputs without touching any trap", () => {
  let trapTouches = 0;
  const touch = () => {
    trapTouches += 1;
    throw new Error("proxy trap must not run");
  };
  const handler = {
    defineProperty: touch,
    deleteProperty: touch,
    get: touch,
    getOwnPropertyDescriptor: touch,
    getPrototypeOf: touch,
    has: touch,
    isExtensible: touch,
    ownKeys: touch,
    preventExtensions: touch,
    set: touch,
    setPrototypeOf: touch,
  };
  const objectProxy = new Proxy({ value: 1 }, handler);
  const arrayProxy = new Proxy([1], handler);
  const functionProxy = new Proxy(() => undefined, {
    apply: touch,
    construct: touch,
    get: touch,
    getOwnPropertyDescriptor: touch,
    getPrototypeOf: touch,
    ownKeys: touch,
  });

  assert.throws(() => canonicalizeStrict(objectProxy), /proxies are not supported/u);
  assert.throws(() => canonicalizeStrict(arrayProxy), /proxies are not supported/u);
  assert.throws(() => canonicalizeStrict(functionProxy), /proxies are not supported/u);
  assert.throws(() => canonicalizeStrict({ nested: objectProxy }),
    /proxies are not supported/u);
  assert.equal(trapTouches, 0);

  const revocable = Proxy.revocable({}, handler);
  revocable.revoke();
  assert.throws(() => canonicalizeStrict(revocable.proxy), /proxies are not supported/u);
  assert.equal(trapTouches, 0);
});

test("canonicalizeStrict enforces its depth boundary before deeper recursion", () => {
  const nested = (depth) => {
    let value = 0;
    for (let index = 0; index < depth; index += 1) value = [value];
    return value;
  };

  assert.doesNotThrow(() => canonicalizeStrict(nested(CANONICAL_STRICT_MAX_DEPTH)));
  assert.throws(() => canonicalizeStrict(nested(CANONICAL_STRICT_MAX_DEPTH + 1)),
    /depth budget exceeded/u);
});

test("canonicalizeStrict enforces its cumulative member boundary", () => {
  const atLimit = new Array(CANONICAL_STRICT_MAX_MEMBERS).fill(null);
  const aboveLimit = new Array(CANONICAL_STRICT_MAX_MEMBERS + 1).fill(null);

  assert.doesNotThrow(() => canonicalizeStrict(atLimit));
  assert.throws(() => canonicalizeStrict(aboveLimit), /member budget exceeded/u);
  assert.throws(() => canonicalizeStrict([
    new Array(CANONICAL_STRICT_MAX_MEMBERS / 2).fill(null),
    new Array((CANONICAL_STRICT_MAX_MEMBERS / 2) - 1).fill(null),
  ]), /member budget exceeded/u);
});

test("the larger pinned-artifact budget is explicit and remains bounded", () => {
  const legacySized = new Array(CANONICAL_STRICT_MAX_MEMBERS + 1).fill(null);
  const abovePinned = new Array(
    CANONICAL_STRICT_BOUNDED_ARTIFACT_MAX_MEMBERS + 1).fill(null);

  assert.throws(() => canonicalizeStrict(legacySized), /member budget exceeded/u);
  assert.doesNotThrow(() => canonicalizeStrictBoundedArtifact(legacySized));
  assert.throws(() => canonicalizeStrictBoundedArtifact(abovePinned),
    /member budget exceeded/u);
});

test("canonicalizeStrict enforces value and property-name string boundaries", () => {
  const atLimit = "x".repeat(CANONICAL_STRICT_MAX_STRING_CODE_UNITS);
  const aboveLimit = `${atLimit}x`;
  const encoded = canonicalizeStrict(atLimit);

  assert.equal(encoded.length, CANONICAL_STRICT_MAX_STRING_CODE_UNITS + 2);
  assert.equal(encoded[0], "\"");
  assert.equal(encoded[encoded.length - 1], "\"");
  assert.throws(() => canonicalizeStrict(aboveLimit), /string budget exceeded/u);
  assert.throws(() => canonicalizeStrict({ [aboveLimit]: true }),
    /string budget exceeded/u);
});

test("canonicalizeStrict enforces cumulative work before the final join", () => {
  assert.equal(CANONICAL_STRICT_MAX_WORK_UNITS,
    64 * CANONICAL_STRICT_MAX_STRING_CODE_UNITS);
  const chunk = "x".repeat(CANONICAL_STRICT_MAX_STRING_CODE_UNITS / 2);

  assert.doesNotThrow(() => canonicalizeStrict(new Array(31).fill(chunk)));
  assert.throws(() => canonicalizeStrict(new Array(32).fill(chunk)),
    /work budget exceeded/u);
});
