/*
 * Delegation-radius algebra.
 *
 * A radius is a closed, content-addressed declaration of the actions, opaque
 * source-bound scopes, time window, and abstract budgets exposed to a child or
 * executor.  It is deliberately not Claim / Way / World / Experience, and it
 * establishes no institutional or execution authority.  Domain adapters bind
 * the opaque scope and budget-unit hashes to those existing protocol objects.
 *
 * The safe algebra is intentionally asymmetric:
 *   - leq and meet can prove contraction;
 *   - a requested delta can describe an expansion;
 *   - join can only emit an unauthorised expansion request; and
 *   - child allocation conserves every budget and charges one DELEGATE unit per
 *     non-empty child, but still grants no authority.
 */

import { createHash } from "node:crypto";

import { canonicalizeStrict } from "./canonical.js";

/* Capture every ambient intrinsic used by this trust boundary once.  A host
 * may replace globals and prototype methods after module import; radius
 * containment and budget conservation must not adopt those replacements. */
const ArrayConstructor = Array;
const ArrayIsArray = Array.isArray;
const ArrayPrototype = Array.prototype;
const ObjectPrototype = Object.prototype;
const ObjectFreeze = Object.freeze;
const ObjectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const ObjectGetPrototypeOf = Object.getPrototypeOf;
const ObjectHasOwn = Object.hasOwn;
const ObjectIsFrozen = Object.isFrozen;
const ReflectOwnKeys = Reflect.ownKeys;
const NumberIsFinite = Number.isFinite;
const DateConstructor = Date;
const DateParse = Date.parse;
const BigIntConstructor = BigInt;
const StringConstructor = String;
const ErrorConstructor = Error;
const TypeErrorConstructor = TypeError;
const RegExpTest = Function.prototype.call.bind(RegExp.prototype.test);
const ArraySort = Function.prototype.call.bind(Array.prototype.sort);
const DateToISOString = Function.prototype.call.bind(Date.prototype.toISOString);
const SetHas = Function.prototype.call.bind(Set.prototype.has);
const BigIntToString = Function.prototype.call.bind(BigInt.prototype.toString);
const HashPrototype = ObjectGetPrototypeOf(createHash("sha256"));
const HashUpdate = Function.prototype.call.bind(HashPrototype.update);
const HashDigest = Function.prototype.call.bind(HashPrototype.digest);

export const DELEGATION_RADIUS_SCHEMAS = ObjectFreeze({
  radius: "outsider/delegation-radius/v1",
  delta: "outsider/delegation-radius-requested-delta/v1",
  joinRequest: "outsider/delegation-radius-join-request/v1",
  childAllocation: "outsider/delegation-radius-child-allocation/v1",
});

export const DELEGATION_RADIUS_ATOMS = ObjectFreeze([
  "OBSERVE",
  "PROPOSE",
  "WRITE_REVERSIBLE",
  "WRITE_IRREVERSIBLE",
  "PHYSICAL_ACTUATE",
  "DELEGATE",
  "PERSIST",
  "SCHEDULE",
  "TRAIN",
  "PRICE",
  "GUARANTEE",
  "SETTLE",
  "MOVE_FUNDS",
  "CLOSE_OBLIGATION",
]);

export const DELEGATION_RADIUS_NO_AUTHORITY = deepFreeze({
  executionAuthority: false,
  delegationAuthority: false,
  trainingAuthority: false,
  pricingAuthority: false,
  guaranteeAuthority: false,
  settlementAuthority: false,
  fundsMovementAuthority: false,
  obligationClosureAuthority: false,
  externalAuthorityVerified: false,
  callerBooleanAccepted: false,
  localSignatureAccepted: false,
});

const ATOM_SET = new Set(DELEGATION_RADIUS_ATOMS);
const HASH = /^sha256:[a-f0-9]{64}$/u;
const DECIMAL = /^(0|[1-9][0-9]*)$/u;
const CANONICAL_UTC_INSTANT
  = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d\.\d{3}Z$/u;
const MAX_BUDGET = (1n << 256n) - 1n;
const MAX_SCOPES_PER_ATOM = 256;
const MAX_CHILDREN = 1024;

function fail(code) {
  throw new TypeErrorConstructor(`DELEGATION_RADIUS_${code}`);
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || ObjectIsFrozen(value)) return value;
  const keys = ReflectOwnKeys(value);
  for (let index = 0; index < keys.length; index += 1) {
    if (keys[index] === "length") continue;
    const descriptor = ObjectGetOwnPropertyDescriptor(value, keys[index]);
    if (descriptor && "value" in descriptor) deepFreeze(descriptor.value);
  }
  return ObjectFreeze(value);
}

function plainDataObject(value) {
  if (!value || typeof value !== "object" || ArrayIsArray(value)) return false;
  const prototype = ObjectGetPrototypeOf(value);
  if (prototype !== ObjectPrototype && prototype !== null) return false;
  const keys = ReflectOwnKeys(value);
  for (let index = 0; index < keys.length; index += 1) {
    if (typeof keys[index] !== "string") return false;
    const descriptor = ObjectGetOwnPropertyDescriptor(value, keys[index]);
    if (!descriptor || !("value" in descriptor) || descriptor.enumerable !== true) {
      return false;
    }
  }
  return true;
}

function exactObject(value, keys, code) {
  if (!plainDataObject(value)) fail(`${code}_PLAIN_DATA_OBJECT_REQUIRED`);
  const actual = ReflectOwnKeys(value);
  if (actual.length !== keys.length) fail(`${code}_FIELDS_INVALID`);
  for (let expectedIndex = 0; expectedIndex < keys.length; expectedIndex += 1) {
    let found = false;
    for (let actualIndex = 0; actualIndex < actual.length; actualIndex += 1) {
      if (actual[actualIndex] === keys[expectedIndex]) {
        found = true;
        break;
      }
    }
    if (!found) fail(`${code}_FIELDS_INVALID`);
  }
  return value;
}

function exactOptions(value, allowed, code) {
  if (!plainDataObject(value)) fail(`${code}_PLAIN_DATA_OBJECT_REQUIRED`);
  const actual = ReflectOwnKeys(value);
  for (let actualIndex = 0; actualIndex < actual.length; actualIndex += 1) {
    let found = false;
    for (let allowedIndex = 0; allowedIndex < allowed.length; allowedIndex += 1) {
      if (actual[actualIndex] === allowed[allowedIndex]) {
        found = true;
        break;
      }
    }
    if (!found) fail(`${code}_FIELDS_INVALID`);
  }
  return value;
}

function denseArray(value, code, { maximum = 4096 } = {}) {
  if (!ArrayIsArray(value) || ObjectGetPrototypeOf(value) !== ArrayPrototype
    || value.length > maximum) fail(`${code}_DENSE_ARRAY_REQUIRED`);
  const keys = ReflectOwnKeys(value);
  if (keys.length !== value.length + 1 || keys[keys.length - 1] !== "length") {
    fail(`${code}_DENSE_ARRAY_REQUIRED`);
  }
  for (let index = 0; index < value.length; index += 1) {
    const key = StringConstructor(index);
    if (keys[index] !== key) fail(`${code}_DENSE_ARRAY_REQUIRED`);
    const descriptor = ObjectGetOwnPropertyDescriptor(value, key);
    if (!descriptor || !("value" in descriptor) || descriptor.enumerable !== true) {
      fail(`${code}_DENSE_ARRAY_REQUIRED`);
    }
  }
  return value;
}

function digest(domain, value) {
  const instance = createHash("sha256");
  HashUpdate(instance, `${domain}\0${canonicalizeStrict(value)}`, "utf8");
  return `sha256:${HashDigest(instance, "hex")}`;
}

function same(left, right) {
  return canonicalizeStrict(left) === canonicalizeStrict(right);
}

function hash(value, code) {
  if (typeof value !== "string" || !RegExpTest(HASH, value)) fail(`${code}_INVALID`);
  return value;
}

function iso(value, code) {
  if (typeof value !== "string" || !RegExpTest(CANONICAL_UTC_INSTANT, value)
    || !NumberIsFinite(DateParse(value))
    || DateToISOString(new DateConstructor(value)) !== value) {
    fail(`${code}_INVALID`);
  }
  return value;
}

function decimal(value, code, { positive = false } = {}) {
  if (typeof value !== "string" || !RegExpTest(DECIMAL, value)) fail(`${code}_INVALID`);
  const parsed = BigIntConstructor(value);
  if (parsed > MAX_BUDGET || (positive && parsed === 0n)) fail(`${code}_INVALID`);
  return BigIntToString(parsed);
}

function disabledCell(atom) {
  return {
    atom,
    scopeHashes: [],
    budget: { unitHash: null, limit: "0" },
  };
}

function normalizeValidity(value) {
  exactObject(value, ["validFrom", "validUntil"], "VALIDITY");
  const validFrom = iso(value.validFrom, "VALID_FROM");
  const validUntil = iso(value.validUntil, "VALID_UNTIL");
  if (DateParse(validUntil) <= DateParse(validFrom)) fail("VALIDITY_WINDOW_EMPTY");
  return { validFrom, validUntil };
}

function normalizeGrant(value) {
  exactObject(value, ["atom", "scopeHashes", "budget"], "GRANT");
  if (typeof value.atom !== "string" || !SetHas(ATOM_SET, value.atom)) fail("ATOM_UNKNOWN");
  denseArray(value.scopeHashes, "SCOPE_HASHES", { maximum: MAX_SCOPES_PER_ATOM });
  if (value.scopeHashes.length === 0) fail("ENABLED_GRANT_SCOPES_REQUIRED");
  const scopeHashes = new ArrayConstructor(value.scopeHashes.length);
  for (let index = 0; index < value.scopeHashes.length; index += 1) {
    scopeHashes[index] = hash(value.scopeHashes[index], "SCOPE_HASH");
  }
  ArraySort(scopeHashes);
  for (let index = 1; index < scopeHashes.length; index += 1) {
    if (scopeHashes[index] === scopeHashes[index - 1]) fail("SCOPE_HASH_DUPLICATE");
  }
  exactObject(value.budget, ["unitHash", "limit"], "BUDGET");
  const budget = {
    unitHash: hash(value.budget.unitHash, "BUDGET_UNIT_HASH"),
    limit: decimal(value.budget.limit, "BUDGET_LIMIT", { positive: true }),
  };
  return { atom: value.atom, scopeHashes, budget };
}

function seal(schema, body, hashField) {
  return deepFreeze({ ...body, [hashField]: digest(schema, body) });
}

/**
 * Normalize a raw closed-radius specification into the one canonical 14-cell
 * vector.  Missing atoms become explicit disabled cells.  A bottom radius is
 * represented only by `{ validity:null, grants:[] }`.
 */
export function normalizeDelegationRadius(input = {}) {
  exactObject(input, ["validity", "grants"], "INPUT");
  denseArray(input.grants, "GRANTS", { maximum: DELEGATION_RADIUS_ATOMS.length });
  const grants = new ArrayConstructor(input.grants.length);
  for (let index = 0; index < input.grants.length; index += 1) {
    grants[index] = normalizeGrant(input.grants[index]);
    for (let prior = 0; prior < index; prior += 1) {
      if (grants[prior].atom === grants[index].atom) fail("ATOM_DUPLICATE");
    }
  }
  if ((grants.length === 0) !== (input.validity === null)) {
    fail("BOTTOM_VALIDITY_CONSISTENCY_INVALID");
  }
  const cells = new ArrayConstructor(DELEGATION_RADIUS_ATOMS.length);
  for (let atomIndex = 0; atomIndex < DELEGATION_RADIUS_ATOMS.length; atomIndex += 1) {
    const atom = DELEGATION_RADIUS_ATOMS[atomIndex];
    let cell = null;
    for (let grantIndex = 0; grantIndex < grants.length; grantIndex += 1) {
      if (grants[grantIndex].atom === atom) {
        cell = grants[grantIndex];
        break;
      }
    }
    cells[atomIndex] = cell ?? disabledCell(atom);
  }
  const body = {
    schema: DELEGATION_RADIUS_SCHEMAS.radius,
    schemaVersion: "1.0.0",
    empty: grants.length === 0,
    validity: grants.length === 0 ? null : normalizeValidity(input.validity),
    cells,
    authority: DELEGATION_RADIUS_NO_AUTHORITY,
  };
  return seal(DELEGATION_RADIUS_SCHEMAS.radius, body, "radiusHash");
}

function specFromRadius(radius) {
  exactObject(radius, ["schema", "schemaVersion", "empty", "validity", "cells",
    "authority", "radiusHash"], "ARTIFACT");
  if (radius.schema !== DELEGATION_RADIUS_SCHEMAS.radius
    || radius.schemaVersion !== "1.0.0" || typeof radius.empty !== "boolean") {
    fail("SCHEMA_INVALID");
  }
  hash(radius.radiusHash, "RADIUS_HASH");
  denseArray(radius.cells, "CELLS", { maximum: DELEGATION_RADIUS_ATOMS.length });
  if (radius.cells.length !== DELEGATION_RADIUS_ATOMS.length) fail("CELL_COUNT_INVALID");
  const grants = [];
  for (let index = 0; index < DELEGATION_RADIUS_ATOMS.length; index += 1) {
    const atom = DELEGATION_RADIUS_ATOMS[index];
    const cell = radius.cells[index];
    exactObject(cell, ["atom", "scopeHashes", "budget"], "CELL");
    if (cell.atom !== atom) fail("CELL_ATOM_ORDER_OR_LABEL_INVALID");
    denseArray(cell.scopeHashes, "CELL_SCOPE_HASHES", { maximum: MAX_SCOPES_PER_ATOM });
    exactObject(cell.budget, ["unitHash", "limit"], "CELL_BUDGET");
    if (cell.budget.limit === "0") {
      if (cell.scopeHashes.length !== 0 || cell.budget.unitHash !== null) {
        fail("DISABLED_CELL_NONCANONICAL");
      }
      continue;
    }
    grants[grants.length] = normalizeGrant(cell);
  }
  if (!same(radius.authority, DELEGATION_RADIUS_NO_AUTHORITY)) fail("AUTHORITY_INVALID");
  if (radius.empty !== (grants.length === 0)
    || (radius.empty && radius.validity !== null)
    || (!radius.empty && radius.validity === null)) fail("EMPTY_STATE_INVALID");
  return { validity: radius.validity, grants };
}

/** Self-check the canonical artifact. Expected-hash binding detects full reseals. */
export function verifyDelegationRadius(radius, options = {}) {
  try {
    exactOptions(options, ["expectedRadiusHash"], "VERIFY_OPTIONS");
    const spec = specFromRadius(radius);
    const rebuilt = normalizeDelegationRadius(spec);
    if (!same(radius, rebuilt)) fail("DERIVATION_INVALID");
    if (ObjectHasOwn(options, "expectedRadiusHash")) {
      const expected = hash(options.expectedRadiusHash, "EXPECTED_RADIUS_HASH");
      if (radius.radiusHash !== expected) fail("EXPECTED_RADIUS_HASH_MISMATCH");
    }
    return deepFreeze({
      ok: true,
      verificationLevel: ObjectHasOwn(options, "expectedRadiusHash")
        ? "EXPECTED_HASH_BOUND_CANONICAL_RADIUS" : "SELF_CHECK_ONLY",
      radiusHash: radius.radiusHash,
      empty: radius.empty,
      externalAuthorityVerified: false,
      executable: false,
      authority: DELEGATION_RADIUS_NO_AUTHORITY,
    });
  } catch (error) {
    return deepFreeze({
      ok: false,
      verificationLevel: "INVALID",
      externalAuthorityVerified: false,
      executable: false,
      authority: DELEGATION_RADIUS_NO_AUTHORITY,
      error: error instanceof ErrorConstructor ? error.message : StringConstructor(error),
    });
  }
}

function requireRadius(radius, code) {
  const checked = verifyDelegationRadius(radius);
  if (!checked.ok) fail(`${code}_INVALID:${checked.error}`);
  return radius;
}

function cellActive(cell) {
  return cell.budget.limit !== "0";
}

function scopeSubset(candidate, ceiling) {
  for (let candidateIndex = 0; candidateIndex < candidate.length; candidateIndex += 1) {
    let found = false;
    for (let ceilingIndex = 0; ceilingIndex < ceiling.length; ceilingIndex += 1) {
      if (candidate[candidateIndex] === ceiling[ceilingIndex]) {
        found = true;
        break;
      }
    }
    if (!found) return false;
  }
  return true;
}

function radiusLeq(candidate, ceiling) {
  if (candidate.empty) return true;
  if (ceiling.empty) return false;
  if (DateParse(candidate.validity.validFrom) < DateParse(ceiling.validity.validFrom)
    || DateParse(candidate.validity.validUntil) > DateParse(ceiling.validity.validUntil)) {
    return false;
  }
  for (let index = 0; index < candidate.cells.length; index += 1) {
    const cell = candidate.cells[index];
    if (!cellActive(cell)) continue;
    const upper = ceiling.cells[index];
    if (!(cellActive(upper)
      && cell.budget.unitHash === upper.budget.unitHash
      && BigIntConstructor(cell.budget.limit) <= BigIntConstructor(upper.budget.limit)
      && scopeSubset(cell.scopeHashes, upper.scopeHashes))) return false;
  }
  return true;
}

/** Closed partial order: action scopes, units, budgets, and time may only contract. */
export function delegationRadiusLeq(input = {}) {
  exactObject(input, ["candidate", "ceiling"], "LEQ_INPUT");
  const candidate = requireRadius(input.candidate, "LEQ_CANDIDATE");
  const ceiling = requireRadius(input.ceiling, "LEQ_CEILING");
  return radiusLeq(candidate, ceiling);
}

/** Greatest common contraction. Incompatible units or disjoint time yield bottom cells/radius. */
export function meetDelegationRadii(input = {}) {
  exactObject(input, ["left", "right"], "MEET_INPUT");
  const left = requireRadius(input.left, "MEET_LEFT");
  const right = requireRadius(input.right, "MEET_RIGHT");
  if (left.empty || right.empty) return normalizeDelegationRadius({ validity: null, grants: [] });
  const leftFrom = DateParse(left.validity.validFrom);
  const rightFrom = DateParse(right.validity.validFrom);
  const validFrom = DateToISOString(new DateConstructor(leftFrom > rightFrom
    ? leftFrom : rightFrom));
  const leftUntil = DateParse(left.validity.validUntil);
  const rightUntil = DateParse(right.validity.validUntil);
  const validUntilMs = leftUntil < rightUntil ? leftUntil : rightUntil;
  if (validUntilMs <= DateParse(validFrom)) {
    return normalizeDelegationRadius({ validity: null, grants: [] });
  }
  const grants = [];
  for (let index = 0; index < DELEGATION_RADIUS_ATOMS.length; index += 1) {
    const leftCell = left.cells[index];
    const rightCell = right.cells[index];
    if (!cellActive(leftCell) || !cellActive(rightCell)
      || leftCell.budget.unitHash !== rightCell.budget.unitHash) continue;
    const scopeHashes = new ArrayConstructor();
    for (let leftIndex = 0; leftIndex < leftCell.scopeHashes.length; leftIndex += 1) {
      for (let rightIndex = 0; rightIndex < rightCell.scopeHashes.length; rightIndex += 1) {
        if (leftCell.scopeHashes[leftIndex] === rightCell.scopeHashes[rightIndex]) {
          scopeHashes[scopeHashes.length] = leftCell.scopeHashes[leftIndex];
          break;
        }
      }
    }
    const limit = BigIntConstructor(leftCell.budget.limit)
      < BigIntConstructor(rightCell.budget.limit)
      ? leftCell.budget.limit : rightCell.budget.limit;
    if (scopeHashes.length && limit !== "0") {
      grants[grants.length] = { atom: DELEGATION_RADIUS_ATOMS[index], scopeHashes,
        budget: { unitHash: leftCell.budget.unitHash, limit } };
    }
  }
  if (!grants.length) return normalizeDelegationRadius({ validity: null, grants: [] });
  return normalizeDelegationRadius({
    validity: { validFrom, validUntil: DateToISOString(new DateConstructor(validUntilMs)) },
    grants,
  });
}

function validityExpansion(base, requested) {
  if (requested.empty) {
    return { requestedStartsBeforeBase: false, requestedEndsAfterBase: false,
      requestedOutsideBase: false };
  }
  if (base.empty) {
    return { requestedStartsBeforeBase: true, requestedEndsAfterBase: true,
      requestedOutsideBase: true };
  }
  const requestedStartsBeforeBase = DateParse(requested.validity.validFrom)
    < DateParse(base.validity.validFrom);
  const requestedEndsAfterBase = DateParse(requested.validity.validUntil)
    > DateParse(base.validity.validUntil);
  return { requestedStartsBeforeBase, requestedEndsAfterBase,
    requestedOutsideBase: requestedStartsBeforeBase || requestedEndsAfterBase };
}

/** Describe, but never authorize, the part of `requested` outside `base`. */
export function requestedDelegationDelta(input = {}) {
  exactObject(input, ["base", "requested"], "DELTA_INPUT");
  const base = requireRadius(input.base, "DELTA_BASE");
  const requested = requireRadius(input.requested, "DELTA_REQUESTED");
  const validity = validityExpansion(base, requested);
  const cellDeltas = new ArrayConstructor(DELEGATION_RADIUS_ATOMS.length);
  for (let index = 0; index < DELEGATION_RADIUS_ATOMS.length; index += 1) {
    const atom = DELEGATION_RADIUS_ATOMS[index];
    const lower = base.cells[index];
    const upper = requested.cells[index];
    const upperActive = cellActive(upper);
    const lowerActive = cellActive(lower);
    const unitChanged = upperActive && lowerActive
      && upper.budget.unitHash !== lower.budget.unitHash;
    const addedScopeHashes = new ArrayConstructor();
    if (upperActive) {
      for (let upperIndex = 0; upperIndex < upper.scopeHashes.length; upperIndex += 1) {
        let present = false;
        for (let lowerIndex = 0; lowerIndex < lower.scopeHashes.length; lowerIndex += 1) {
          if (upper.scopeHashes[upperIndex] === lower.scopeHashes[lowerIndex]) {
            present = true;
            break;
          }
        }
        if (!present) addedScopeHashes[addedScopeHashes.length] = upper.scopeHashes[upperIndex];
      }
    }
    let additionalBudget = 0n;
    if (upperActive) {
      const requestedLimit = BigIntConstructor(upper.budget.limit);
      if (!lowerActive || unitChanged) additionalBudget = requestedLimit;
      else if (requestedLimit > BigIntConstructor(lower.budget.limit)) {
        additionalBudget = requestedLimit - BigIntConstructor(lower.budget.limit);
      }
    }
    const expansionRequested = addedScopeHashes.length > 0 || unitChanged
      || additionalBudget > 0n;
    cellDeltas[index] = {
      atom,
      addedScopeHashes,
      budgetUnitChanged: unitChanged,
      requestedBudgetUnitHash: upperActive ? upper.budget.unitHash : null,
      additionalBudget: BigIntToString(additionalBudget),
      expansionRequested,
    };
  }
  const expands = !radiusLeq(requested, base);
  const body = {
    schema: DELEGATION_RADIUS_SCHEMAS.delta,
    schemaVersion: "1.0.0",
    baseRadiusHash: base.radiusHash,
    requestedRadiusHash: requested.radiusHash,
    status: expands ? "EXPANSION_REQUEST_NO_AUTHORITY" : "WITHIN_BASE_RADIUS",
    validityExpansion: validity,
    cellDeltas,
    authority: DELEGATION_RADIUS_NO_AUTHORITY,
  };
  return seal(DELEGATION_RADIUS_SCHEMAS.delta, body, "deltaHash");
}

/**
 * There is intentionally no union-radius constructor. A join is only a
 * content-addressed request for external review and carries no resulting radius.
 */
export function requestDelegationRadiusJoin(input = {}) {
  exactObject(input, ["left", "right"], "JOIN_INPUT");
  const left = requireRadius(input.left, "JOIN_LEFT");
  const right = requireRadius(input.right, "JOIN_RIGHT");
  const leftLeqRight = radiusLeq(left, right);
  const rightLeqLeft = radiusLeq(right, left);
  let relation;
  if (leftLeqRight && rightLeqLeft) {
    relation = { kind: "EQUAL", narrowerRadiusHash: left.radiusHash,
      widerRadiusHash: right.radiusHash };
  } else if (leftLeqRight) {
    relation = { kind: "COMPARABLE", narrowerRadiusHash: left.radiusHash,
      widerRadiusHash: right.radiusHash };
  } else if (rightLeqLeft) {
    relation = { kind: "COMPARABLE", narrowerRadiusHash: right.radiusHash,
      widerRadiusHash: left.radiusHash };
  } else {
    relation = { kind: "INCOMPARABLE", narrowerRadiusHash: null,
      widerRadiusHash: null };
  }
  const inputRadiusHashes = [left.radiusHash, right.radiusHash];
  if (inputRadiusHashes[1] < inputRadiusHashes[0]) {
    const first = inputRadiusHashes[0];
    inputRadiusHashes[0] = inputRadiusHashes[1];
    inputRadiusHashes[1] = first;
  }
  const meet = meetDelegationRadii({ left, right });
  const body = {
    schema: DELEGATION_RADIUS_SCHEMAS.joinRequest,
    schemaVersion: "1.0.0",
    inputRadiusHashes,
    meetRadiusHash: meet.radiusHash,
    requestedUnionCommitmentHash: digest("outsider/delegation-radius-requested-union/v1",
      { inputRadiusHashes }),
    relation,
    status: "EXPANSION_REQUEST_NO_AUTHORITY",
    resultRadius: null,
    authority: DELEGATION_RADIUS_NO_AUTHORITY,
  };
  return seal(DELEGATION_RADIUS_SCHEMAS.joinRequest, body, "joinRequestHash");
}

function childScopeHashes(child) {
  const result = new ArrayConstructor();
  for (let cellIndex = 0; cellIndex < child.cells.length; cellIndex += 1) {
    const scopes = child.cells[cellIndex].scopeHashes;
    for (let scopeIndex = 0; scopeIndex < scopes.length; scopeIndex += 1) {
      let present = false;
      for (let resultIndex = 0; resultIndex < result.length; resultIndex += 1) {
        if (result[resultIndex] === scopes[scopeIndex]) {
          present = true;
          break;
        }
      }
      if (!present) result[result.length] = scopes[scopeIndex];
    }
  }
  return ArraySort(result);
}

/**
 * Split a declared parent budget among non-empty child radii. Every child must
 * already be a contraction of the parent and every child scope must be inside
 * the parent's DELEGATE scope. One DELEGATE unit is consumed for each child in
 * addition to any DELEGATE budget passed down. The returned residual is exact,
 * but the allocation remains a zero-authority local algebra artifact.
 */
export function allocateDelegationChildren(input = {}) {
  exactObject(input, ["parent", "children"], "CHILD_ALLOCATION_INPUT");
  const parent = requireRadius(input.parent, "CHILD_PARENT");
  denseArray(input.children, "CHILDREN", { maximum: MAX_CHILDREN });
  const children = new ArrayConstructor(input.children.length);
  for (let index = 0; index < input.children.length; index += 1) {
    children[index] = requireRadius(input.children[index], "CHILD");
    if (children[index].empty) fail("EMPTY_CHILD_NOT_ALLOCATABLE");
    for (let prior = 0; prior < index; prior += 1) {
      if (children[prior].radiusHash === children[index].radiusHash) {
        fail("CHILD_RADIUS_DUPLICATE_IDENTITY_REQUIRED");
      }
    }
  }
  const orderedChildren = new ArrayConstructor(children.length);
  for (let index = 0; index < children.length; index += 1) {
    orderedChildren[index] = children[index];
  }
  ArraySort(orderedChildren, (left, right) => left.radiusHash < right.radiusHash
    ? -1 : left.radiusHash > right.radiusHash ? 1 : 0);
  for (let index = 0; index < orderedChildren.length; index += 1) {
    if (!radiusLeq(orderedChildren[index], parent)) {
      fail("CHILD_SCOPE_OR_BUDGET_AMPLIFICATION");
    }
  }
  let delegateIndex = -1;
  for (let index = 0; index < DELEGATION_RADIUS_ATOMS.length; index += 1) {
    if (DELEGATION_RADIUS_ATOMS[index] === "DELEGATE") {
      delegateIndex = index;
      break;
    }
  }
  const delegateCell = parent.cells[delegateIndex];
  if (orderedChildren.length && !cellActive(delegateCell)) fail("PARENT_DELEGATE_GRANT_REQUIRED");
  if (orderedChildren.length) {
    for (let index = 0; index < orderedChildren.length; index += 1) {
      if (!scopeSubset(childScopeHashes(orderedChildren[index]), delegateCell.scopeHashes)) {
        fail("CHILD_SCOPE_OUTSIDE_DELEGATE_SCOPE");
      }
    }
  }
  const residualGrants = [];
  const conservation = new ArrayConstructor(DELEGATION_RADIUS_ATOMS.length);
  for (let index = 0; index < DELEGATION_RADIUS_ATOMS.length; index += 1) {
    const atom = DELEGATION_RADIUS_ATOMS[index];
    const parentCell = parent.cells[index];
    const parentBudget = BigIntConstructor(parentCell.budget.limit);
    let childBudget = 0n;
    for (let childIndex = 0; childIndex < orderedChildren.length; childIndex += 1) {
      childBudget += BigIntConstructor(orderedChildren[childIndex].cells[index].budget.limit);
    }
    const issuanceBudget = atom === "DELEGATE"
      ? BigIntConstructor(orderedChildren.length) : 0n;
    if (childBudget + issuanceBudget > parentBudget) fail("CHILD_BUDGET_AMPLIFICATION");
    const residualBudget = parentBudget - childBudget - issuanceBudget;
    if (residualBudget > 0n) {
      residualGrants[residualGrants.length] = {
        atom,
        scopeHashes: parentCell.scopeHashes,
        budget: { unitHash: parentCell.budget.unitHash,
          limit: BigIntToString(residualBudget) },
      };
    }
    conservation[index] = {
      atom,
      unitHash: parentCell.budget.unitHash,
      parentBudget: BigIntToString(parentBudget),
      childBudget: BigIntToString(childBudget),
      issuanceBudget: BigIntToString(issuanceBudget),
      residualBudget: BigIntToString(residualBudget),
      exact: parentBudget === childBudget + issuanceBudget + residualBudget,
    };
  }
  const residualRadius = normalizeDelegationRadius(residualGrants.length ? {
    validity: parent.validity,
    grants: residualGrants,
  } : { validity: null, grants: [] });
  const body = {
    schema: DELEGATION_RADIUS_SCHEMAS.childAllocation,
    schemaVersion: "1.0.0",
    parentRadiusHash: parent.radiusHash,
    childRadiusHashes: (() => {
      const hashes = new ArrayConstructor(orderedChildren.length);
      for (let index = 0; index < orderedChildren.length; index += 1) {
        hashes[index] = orderedChildren[index].radiusHash;
      }
      return hashes;
    })(),
    issuedChildCount: orderedChildren.length,
    delegateIssuanceBudgetPerChild: "1",
    residualRadius,
    conservation,
    scopeContainmentVerified: true,
    budgetConservationVerified: (() => {
      for (let index = 0; index < conservation.length; index += 1) {
        if (!conservation[index].exact) return false;
      }
      return true;
    })(),
    status: "CHILD_SPLIT_STRUCTURALLY_CONSERVED_NO_AUTHORITY",
    authority: DELEGATION_RADIUS_NO_AUTHORITY,
  };
  return seal(DELEGATION_RADIUS_SCHEMAS.childAllocation, body, "allocationHash");
}

function derivedVerificationSuccess(hashField, record) {
  return deepFreeze({
    ok: true,
    verificationLevel: "SOURCE_RADII_REDERIVED",
    [hashField]: record[hashField],
    externalAuthorityVerified: false,
    executable: false,
    authority: DELEGATION_RADIUS_NO_AUTHORITY,
  });
}

function derivedVerificationFailure(error) {
  return deepFreeze({
    ok: false,
    verificationLevel: "INVALID",
    externalAuthorityVerified: false,
    executable: false,
    authority: DELEGATION_RADIUS_NO_AUTHORITY,
    error: error instanceof ErrorConstructor ? error.message : StringConstructor(error),
  });
}

/** Rebuild a requested delta from its exact base and requested radii. */
export function verifyRequestedDelegationDelta(record, context = {}) {
  try {
    exactOptions(context, ["base", "requested", "expectedDeltaHash"],
      "DELTA_VERIFY_CONTEXT");
    if (!ObjectHasOwn(context, "base") || !ObjectHasOwn(context, "requested")) {
      fail("DELTA_VERIFY_SOURCES_REQUIRED");
    }
    const rebuilt = requestedDelegationDelta({ base: context.base, requested: context.requested });
    if (!same(record, rebuilt)) fail("DELTA_DERIVATION_INVALID");
    if (ObjectHasOwn(context, "expectedDeltaHash")) {
      const expected = hash(context.expectedDeltaHash, "EXPECTED_DELTA_HASH");
      if (record.deltaHash !== expected) fail("EXPECTED_DELTA_HASH_MISMATCH");
    }
    return derivedVerificationSuccess("deltaHash", record);
  } catch (error) {
    return derivedVerificationFailure(error);
  }
}

/** Rebuild a join request; no verification path can turn it into a union radius. */
export function verifyDelegationRadiusJoinRequest(record, context = {}) {
  try {
    exactOptions(context, ["left", "right", "expectedJoinRequestHash"],
      "JOIN_VERIFY_CONTEXT");
    if (!ObjectHasOwn(context, "left") || !ObjectHasOwn(context, "right")) {
      fail("JOIN_VERIFY_SOURCES_REQUIRED");
    }
    const rebuilt = requestDelegationRadiusJoin({ left: context.left, right: context.right });
    if (!same(record, rebuilt)) fail("JOIN_DERIVATION_INVALID");
    if (ObjectHasOwn(context, "expectedJoinRequestHash")) {
      const expected = hash(context.expectedJoinRequestHash, "EXPECTED_JOIN_REQUEST_HASH");
      if (record.joinRequestHash !== expected) fail("EXPECTED_JOIN_REQUEST_HASH_MISMATCH");
    }
    return derivedVerificationSuccess("joinRequestHash", record);
  } catch (error) {
    return derivedVerificationFailure(error);
  }
}

/** Rebuild child allocation and its exact residual from the parent and children. */
export function verifyDelegationChildAllocation(record, context = {}) {
  try {
    exactOptions(context, ["parent", "children", "expectedAllocationHash"],
      "CHILD_VERIFY_CONTEXT");
    if (!ObjectHasOwn(context, "parent") || !ObjectHasOwn(context, "children")) {
      fail("CHILD_VERIFY_SOURCES_REQUIRED");
    }
    const rebuilt = allocateDelegationChildren({ parent: context.parent,
      children: context.children });
    if (!same(record, rebuilt)) fail("CHILD_ALLOCATION_DERIVATION_INVALID");
    if (ObjectHasOwn(context, "expectedAllocationHash")) {
      const expected = hash(context.expectedAllocationHash, "EXPECTED_ALLOCATION_HASH");
      if (record.allocationHash !== expected) fail("EXPECTED_ALLOCATION_HASH_MISMATCH");
    }
    return derivedVerificationSuccess("allocationHash", record);
  } catch (error) {
    return derivedVerificationFailure(error);
  }
}
