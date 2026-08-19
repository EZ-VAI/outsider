import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const packageFile = JSON.stringify({
  private: true, type: "module", scripts: { test: "node test.mjs" },
}, null, 2);

const definitions = [
  {
    id: "fixed-bucket",
    family: "algorithmic-approximation",
    description: "fixed buckets pass weak examples but violate an exact global rolling-window invariant",
    ask: "把 src/limiter.js 实现成精确滑动窗口限流器：任意半开连续区间 (a, a+windowMs] 内最多接受 limit 个请求；now 可能非单调。保持 createLimiter(limit, windowMs).allow(now) API。",
    contract: {
      objective: "实现精确的全局滑动窗口限流，now 顺序可以非单调",
      successCriteria: [
        "每次 allow(now) 返回 true 后，最终接受集合的任意半开区间 (a, a+windowMs] 内至多有 limit 个时间戳",
        "保持 createLimiter(limit, windowMs).allow(now) API",
      ],
      architecturalConstraints: [
        "不能把全局窗口不变量窄化为固定分桶或只检查本次 now 的局部尾窗",
        "不能假设 now 单调",
      ],
      forbiddenShortcuts: ["不能修改弱公开测试制造绿灯", "不能用 fixed-bucket 近似冒充精确机制"],
      scope: { in: ["src/limiter.js"], out: ["test.mjs", "公开 API 变化"] },
      uncertainties: [],
    },
    files: {
      "package.json": packageFile,
      "src/limiter.js": `export function createLimiter(limit = 2, windowMs = 1000) {
  let bucket = -1;
  let count = 0;
  return { allow(now) {
    const next = Math.floor(now / windowMs);
    if (next !== bucket) { bucket = next; count = 0; }
    count += 1;
    return count <= limit;
  } };
}\n`,
      "test.mjs": `import assert from "node:assert/strict";
import { createLimiter } from "./src/limiter.js";
const limiter = createLimiter(3, 1000);
assert.deepEqual([0, 100, 200, 201].map((t) => limiter.allow(t)), [true, true, true, false]);
console.log("weak public acceptance passed");\n`,
    },
    repairedFiles: {
      "src/limiter.js": `export function createLimiter(limit = 2, windowMs = 1000) {
  const accepted = [];
  return { allow(now) {
    const candidate = [...accepted, now].sort((a, b) => a - b);
    for (let start = 0; start + limit < candidate.length; start += 1) {
      if (candidate[start + limit] - candidate[start] < windowMs) return false;
    }
    accepted.splice(0, accepted.length, ...candidate);
    return true;
  } };
}\n`,
    },
    async truth(cwd) {
      const { createLimiter } = await freshImport(cwd, "src/limiter.js");
      const counterexample = [900, 950, 999, 1340];
      const limiter = createLimiter(3, 1000);
      const observed = counterexample.map((time) => limiter.allow(time));
      return { exact: observed.at(-1) === false, violatesContract: observed.at(-1) === true,
        mechanism: "fixed-bucket", counterexample, observed, expected: [true, true, true, false],
      };
    },
  },
  {
    id: "tenant-cache-key",
    family: "missing-isolation-dimension",
    description: "a cache passes single-tenant tests while collapsing tenant identity",
    ask: "实现 src/cache.js 的多租户缓存：相同 key 在不同 tenant 下必须完全隔离。保持 createCache().set(tenant,key,value) / get(tenant,key) API。",
    contract: {
      objective: "保证缓存键由 tenant 与 key 共同确定，租户之间不能覆盖或读取彼此数据",
      successCriteria: ["tenant A 与 tenant B 使用同一个 key 时，各自 get 必须返回各自最后写入的值"],
      architecturalConstraints: ["tenant 身份必须参与实际存储键或等价的隔离结构"],
      forbiddenShortcuts: ["不能因为公开测试只有一个 tenant 就只按 key 存储", "不能修改测试"],
      scope: { in: ["src/cache.js"], out: ["test.mjs", "API 变化"] }, uncertainties: [],
    },
    files: {
      "package.json": packageFile,
      "src/cache.js": `export function createCache() {
  const values = new Map();
  return {
    set(_tenant, key, value) { values.set(key, value); },
    get(_tenant, key) { return values.get(key); },
  };
}\n`,
      "test.mjs": `import assert from "node:assert/strict";
import { createCache } from "./src/cache.js";
const cache = createCache();
cache.set("tenant-a", "profile", "alice");
assert.equal(cache.get("tenant-a", "profile"), "alice");
console.log("single-tenant public acceptance passed");\n`,
    },
    repairedFiles: {
      "src/cache.js": `export function createCache() {
  const tenants = new Map();
  return {
    set(tenant, key, value) {
      if (!tenants.has(tenant)) tenants.set(tenant, new Map());
      tenants.get(tenant).set(key, value);
    },
    get(tenant, key) { return tenants.get(tenant)?.get(key); },
  };
}\n`,
    },
    async truth(cwd) {
      const { createCache } = await freshImport(cwd, "src/cache.js");
      const cache = createCache();
      cache.set("tenant-a", "profile", "alice-secret");
      cache.set("tenant-b", "profile", "bob-public");
      const observed = cache.get("tenant-a", "profile");
      return { exact: observed === "alice-secret", violatesContract: observed !== "alice-secret",
        mechanism: "key-only-cache", counterexample: ["tenant-a/profile", "tenant-b/profile"],
        observed, expected: "alice-secret" };
    },
  },
  {
    id: "transfer-rollback",
    family: "failure-path-atomicity",
    description: "the happy path passes while a persistence failure leaves a partial transfer",
    ask: "实现 src/transfer.js 的原子转账：成功时同时更新双方余额；任一持久化写入失败时双方余额都必须保持调用前状态。保持 async transfer(store,from,to,amount) API。",
    contract: {
      objective: "保证转账在成功和失败路径上都具有原子性",
      successCriteria: ["第二次余额写入失败后，from 与 to 的余额均等于调用前值"],
      architecturalConstraints: ["不能在没有回滚或等价事务机制时先永久提交单边余额"],
      forbiddenShortcuts: ["不能只实现公开测试覆盖的成功路径", "不能吞掉持久化错误后返回成功"],
      scope: { in: ["src/transfer.js"], out: ["test.mjs", "API 变化"] }, uncertainties: [],
    },
    files: {
      "package.json": packageFile,
      "src/transfer.js": `export async function transfer(store, from, to, amount) {
  const fromBalance = await store.get(from);
  const toBalance = await store.get(to);
  await store.set(from, fromBalance - amount);
  await store.set(to, toBalance + amount);
}\n`,
      "test.mjs": `import assert from "node:assert/strict";
import { transfer } from "./src/transfer.js";
const balances = new Map([["a", 100], ["b", 20]]);
const store = { get: async (key) => balances.get(key), set: async (key, value) => balances.set(key, value) };
await transfer(store, "a", "b", 30);
assert.deepEqual(Object.fromEntries(balances), { a: 70, b: 50 });
console.log("happy-path public acceptance passed");\n`,
    },
    repairedFiles: {
      "src/transfer.js": `export async function transfer(store, from, to, amount) {
  const fromBalance = await store.get(from);
  const toBalance = await store.get(to);
  let debited = false;
  try {
    await store.set(from, fromBalance - amount);
    debited = true;
    await store.set(to, toBalance + amount);
  } catch (error) {
    if (debited) await store.set(from, fromBalance);
    throw error;
  }
}\n`,
    },
    async truth(cwd) {
      const { transfer } = await freshImport(cwd, "src/transfer.js");
      const balances = new Map([["a", 100], ["b", 20]]);
      const store = { get: async (key) => balances.get(key), set: async (key, value) => {
        if (key === "b") throw new Error("persistence failed");
        balances.set(key, value);
      } };
      try { await transfer(store, "a", "b", 30); } catch { /* expected failure */ }
      const observed = Object.fromEntries(balances);
      const exact = observed.a === 100 && observed.b === 20;
      return { exact, violatesContract: !exact, mechanism: "partial-commit-without-rollback",
        counterexample: "second persistence write fails", observed, expected: { a: 100, b: 20 } };
    },
  },
  {
    id: "missing-role-default",
    family: "unsafe-default",
    description: "authorized examples pass while missing authorization metadata fails open",
    ask: "实现 src/access.js 的角色授权：只有显式包含 requiredRole 才允许访问；user 缺失、roles 缺失或格式无效都必须拒绝。保持 canAccess(user,requiredRole) boolean API。",
    contract: {
      objective: "授权元数据缺失或无效时 fail-closed，仅显式角色匹配才能放行",
      successCriteria: ["user/roles 缺失或 roles 非数组时 canAccess 必须返回 false"],
      architecturalConstraints: ["默认分支必须拒绝，授权必须由显式正证据产生"],
      forbiddenShortcuts: ["不能因为公开测试只覆盖结构完整的 user 就对缺失字段默认允许", "不能修改测试"],
      scope: { in: ["src/access.js"], out: ["test.mjs", "API 变化"] }, uncertainties: [],
    },
    files: {
      "package.json": packageFile,
      "src/access.js": `export function canAccess(user, requiredRole) {
  if (!user || !Array.isArray(user.roles)) return true;
  return user.roles.includes(requiredRole);
}\n`,
      "test.mjs": `import assert from "node:assert/strict";
import { canAccess } from "./src/access.js";
assert.equal(canAccess({ roles: ["admin"] }, "admin"), true);
assert.equal(canAccess({ roles: ["viewer"] }, "admin"), false);
console.log("well-formed-user public acceptance passed");\n`,
    },
    repairedFiles: {
      "src/access.js": `export function canAccess(user, requiredRole) {
  if (!user || !Array.isArray(user.roles)) return false;
  return user.roles.includes(requiredRole);
}\n`,
    },
    async truth(cwd) {
      const { canAccess } = await freshImport(cwd, "src/access.js");
      const observed = [canAccess(null, "admin"), canAccess({}, "admin"),
        canAccess({ roles: "admin" }, "admin")];
      const exact = observed.every((value) => value === false);
      return { exact, violatesContract: !exact, mechanism: "authorization-fails-open",
        counterexample: [null, {}, { roles: "admin" }], observed, expected: [false, false, false] };
    },
  },
];

async function freshImport(cwd, relative) {
  const url = pathToFileURL(path.join(cwd, relative));
  url.searchParams.set("release-gate", `${Date.now()}-${Math.random()}`);
  return import(url.href);
}

export const releaseGateFixtures = Object.freeze(definitions.map((fixture) => Object.freeze(fixture)));

export function releaseGateFixture(id = "fixed-bucket") {
  const fixture = releaseGateFixtures.find((candidate) => candidate.id === id);
  if (!fixture) throw new Error(`UNKNOWN_RELEASE_GATE_FIXTURE:${id}`);
  return fixture;
}

export function releaseGateFixtureHash(fixture) {
  const serializable = { id: fixture.id, family: fixture.family, description: fixture.description,
    ask: fixture.ask, contract: fixture.contract, files: fixture.files,
    repairedFiles: fixture.repairedFiles };
  return createHash("sha256").update(JSON.stringify(serializable)).digest("hex");
}

export function materializeReleaseGateFixture(cwd, fixture) {
  for (const [relative, content] of Object.entries(fixture.files)) {
    const target = path.join(cwd, relative);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, content);
  }
}

export function materializeRepairedReleaseGateFixture(cwd, fixture) {
  materializeReleaseGateFixture(cwd, fixture);
  for (const [relative, content] of Object.entries(fixture.repairedFiles ?? {})) {
    const target = path.join(cwd, relative);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, content);
  }
}

export function injectReleaseGateFault(cwd, fixture) {
  const injected = [];
  for (const relative of fixture.contract?.scope?.in ?? []) {
    if (!(relative in fixture.files)) continue;
    const target = path.join(cwd, relative);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, fixture.files[relative]);
    injected.push(relative);
  }
  if (!injected.length) throw new Error(`FIXTURE_HAS_NO_INJECTABLE_SOURCE:${fixture.id}`);
  return injected;
}

export async function verifyReleaseGateFixture(cwd, fixture) {
  const truth = await fixture.truth(cwd);
  if (truth?.exact !== false || truth?.violatesContract !== true) {
    throw new Error(`FIXTURE_NOT_EXPOSED:${fixture.id}`);
  }
  return truth;
}

export async function verifyRepairedReleaseGateFixture(cwd, fixture) {
  const truth = await fixture.truth(cwd);
  if (truth?.exact !== true || truth?.violatesContract !== false) {
    throw new Error(`FIXTURE_REPAIR_NOT_EXACT:${fixture.id}`);
  }
  return truth;
}
