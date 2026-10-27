import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { canonicalizeStrict } from "../src/canonical.js";
import {
  DELEGATION_RADIUS_ATOMS,
  DELEGATION_RADIUS_NO_AUTHORITY,
  DELEGATION_RADIUS_SCHEMAS,
  allocateDelegationChildren,
  delegationRadiusLeq,
  meetDelegationRadii,
  normalizeDelegationRadius,
  requestDelegationRadiusJoin,
  requestedDelegationDelta,
  verifyDelegationChildAllocation,
  verifyDelegationRadius,
  verifyDelegationRadiusJoinRequest,
  verifyRequestedDelegationDelta,
} from "../src/outsider-delegation-radius.js";

const SCOPE_A = `sha256:${"a".repeat(64)}`;
const SCOPE_B = `sha256:${"b".repeat(64)}`;
const SCOPE_C = `sha256:${"c".repeat(64)}`;
const UNIT_OBSERVE = `sha256:${"1".repeat(64)}`;
const UNIT_WRITE = `sha256:${"2".repeat(64)}`;
const UNIT_DELEGATE = `sha256:${"3".repeat(64)}`;
const UNIT_OTHER = `sha256:${"4".repeat(64)}`;
const WINDOW = Object.freeze({
  validFrom: "2026-08-27T00:00:00.000Z",
  validUntil: "2026-08-28T00:00:00.000Z",
});

function grant(atom, scopeHashes, limit, unitHash = UNIT_OBSERVE) {
  return { atom, scopeHashes, budget: { unitHash, limit: String(limit) } };
}

function radius(grants, validity = WINDOW) {
  return normalizeDelegationRadius({ validity: grants.length ? validity : null, grants });
}

function cell(record, atom) {
  return record.cells.find((item) => item.atom === atom);
}

function assertNoAuthority(value) {
  assert.deepEqual(value, DELEGATION_RADIUS_NO_AUTHORITY);
  assert.ok(Object.values(value).every((item) => item === false));
}

function resealRadius(record) {
  const clone = structuredClone(record);
  delete clone.radiusHash;
  return {
    ...clone,
    radiusHash: `sha256:${createHash("sha256")
      .update(`${DELEGATION_RADIUS_SCHEMAS.radius}\0${canonicalizeStrict(clone)}`)
      .digest("hex")}`,
  };
}

test("radius schema is a closed 14-atom canonical vector with no authority", () => {
  assert.deepEqual(DELEGATION_RADIUS_ATOMS, [
    "OBSERVE", "PROPOSE", "WRITE_REVERSIBLE", "WRITE_IRREVERSIBLE",
    "PHYSICAL_ACTUATE", "DELEGATE", "PERSIST", "SCHEDULE", "TRAIN", "PRICE",
    "GUARANTEE", "SETTLE", "MOVE_FUNDS", "CLOSE_OBLIGATION",
  ]);
  const record = radius([
    grant("WRITE_REVERSIBLE", [SCOPE_B, SCOPE_A], "7", UNIT_WRITE),
    grant("OBSERVE", [SCOPE_A], "10"),
  ]);
  assert.equal(record.schema, DELEGATION_RADIUS_SCHEMAS.radius);
  assert.equal(record.schemaVersion, "1.0.0");
  assert.equal(record.empty, false);
  assert.equal(record.cells.length, DELEGATION_RADIUS_ATOMS.length);
  assert.deepEqual(record.cells.map((item) => item.atom), DELEGATION_RADIUS_ATOMS);
  assert.deepEqual(cell(record, "WRITE_REVERSIBLE").scopeHashes, [SCOPE_A, SCOPE_B]);
  assert.deepEqual(cell(record, "PRICE"), {
    atom: "PRICE", scopeHashes: [], budget: { unitHash: null, limit: "0" },
  });
  assert.match(record.radiusHash, /^sha256:[a-f0-9]{64}$/u);
  assert.equal(Object.isFrozen(record), true);
  assert.equal(Object.isFrozen(record.cells), true);
  assertNoAuthority(record.authority);

  const checked = verifyDelegationRadius(record,
    { expectedRadiusHash: record.radiusHash });
  assert.equal(checked.ok, true);
  assert.equal(checked.verificationLevel, "EXPECTED_HASH_BOUND_CANONICAL_RADIUS");
  assert.equal(checked.externalAuthorityVerified, false);
  assert.equal(checked.executable, false);
  assertNoAuthority(checked.authority);

  const bottom = radius([]);
  assert.equal(bottom.empty, true);
  assert.equal(bottom.validity, null);
  assert.ok(bottom.cells.every((item) => item.budget.limit === "0"));
  assertNoAuthority(bottom.authority);
});

test("wildcards, UNKNOWN, extra fields, noncanonical budgets, and exotic objects fail closed", () => {
  assert.throws(() => radius([grant("UNKNOWN", [SCOPE_A], "1")]), /ATOM_UNKNOWN/u);
  assert.throws(() => radius([grant("*", [SCOPE_A], "1")]), /ATOM_UNKNOWN/u);
  assert.throws(() => radius([grant("OBSERVE", ["*"], "1")]), /SCOPE_HASH_INVALID/u);
  assert.throws(() => radius([grant("OBSERVE", ["UNKNOWN"], "1")]),
    /SCOPE_HASH_INVALID/u);
  assert.throws(() => radius([grant("OBSERVE", [SCOPE_A], "01")]),
    /BUDGET_LIMIT_INVALID/u);
  assert.throws(() => radius([grant("OBSERVE", [SCOPE_A], "0")]),
    /BUDGET_LIMIT_INVALID/u);
  assert.throws(() => normalizeDelegationRadius({ validity: WINDOW, grants: [],
    trusted: true }), /INPUT_FIELDS_INVALID/u);
  assert.throws(() => normalizeDelegationRadius({ validity: WINDOW,
    grants: [{ ...grant("OBSERVE", [SCOPE_A], "1"), authority: true }] }),
  /GRANT_FIELDS_INVALID/u);

  const inherited = Object.assign(Object.create({ trusted: true }), {
    validity: WINDOW, grants: [grant("OBSERVE", [SCOPE_A], "1")],
  });
  assert.throws(() => normalizeDelegationRadius(inherited),
    /PLAIN_DATA_OBJECT_REQUIRED/u);
  const symbolDecorated = { validity: WINDOW,
    grants: [grant("OBSERVE", [SCOPE_A], "1")] };
  symbolDecorated[Symbol("trusted")] = true;
  assert.throws(() => normalizeDelegationRadius(symbolDecorated),
    /PLAIN_DATA_OBJECT_REQUIRED/u);
});

test("validity instants require exact UTC millisecond form", () => {
  for (const validity of [
    { validFrom: "2026-08-27T00:00:00", validUntil: WINDOW.validUntil },
    { validFrom: "2026-08-27T00:00:00+08:00", validUntil: WINDOW.validUntil },
    { validFrom: "2026-08-27T00:00:00Z", validUntil: WINDOW.validUntil },
    { validFrom: "2026-02-30T00:00:00.000Z", validUntil: WINDOW.validUntil },
  ]) {
    assert.throws(() => radius([grant("OBSERVE", [SCOPE_A], "1")], validity),
      /VALID_FROM_INVALID/u);
  }
});

test("sparse and decorated arrays are rejected at every trust boundary", () => {
  const sparseGrants = [];
  sparseGrants.length = 1;
  assert.throws(() => normalizeDelegationRadius({ validity: WINDOW, grants: sparseGrants }),
    /GRANTS_DENSE_ARRAY_REQUIRED/u);

  const sparseScopes = [SCOPE_A];
  sparseScopes.length = 2;
  assert.throws(() => radius([grant("OBSERVE", sparseScopes, "1")]),
    /SCOPE_HASHES_DENSE_ARRAY_REQUIRED/u);

  const decoratedScopes = [SCOPE_A];
  decoratedScopes.trusted = true;
  assert.throws(() => radius([grant("OBSERVE", decoratedScopes, "1")]),
    /SCOPE_HASHES_DENSE_ARRAY_REQUIRED/u);

  const decoratedGrants = [grant("OBSERVE", [SCOPE_A], "1")];
  decoratedGrants.signature = "local";
  assert.throws(() => normalizeDelegationRadius({ validity: WINDOW,
    grants: decoratedGrants }), /GRANTS_DENSE_ARRAY_REQUIRED/u);

  const inheritedArray = [grant("OBSERVE", [SCOPE_A], "1")];
  Object.setPrototypeOf(inheritedArray, Object.create(Array.prototype));
  assert.throws(() => normalizeDelegationRadius({ validity: WINDOW,
    grants: inheritedArray }), /GRANTS_DENSE_ARRAY_REQUIRED/u);

  const canonical = radius([grant("OBSERVE", [SCOPE_A], "1")]);
  const decoratedCells = structuredClone(canonical);
  decoratedCells.cells.callerVerified = true;
  assert.equal(verifyDelegationRadius(decoratedCells).ok, false);
});

test("leq is reflexive, antisymmetric, transitive, and preserves incomparability", () => {
  const bottom = radius([]);
  const samples = [bottom];
  for (const scopeHashes of [[SCOPE_A], [SCOPE_A, SCOPE_B]]) {
    for (const limit of ["1", "2", "3"]) {
      samples.push(radius([grant("OBSERVE", scopeHashes, limit)]));
    }
  }
  for (const item of samples) {
    assert.equal(delegationRadiusLeq({ candidate: item, ceiling: item }), true,
      `reflexive:${item.radiusHash}`);
    assert.equal(delegationRadiusLeq({ candidate: bottom, ceiling: item }), true);
  }
  for (const left of samples) {
    for (const right of samples) {
      const lr = delegationRadiusLeq({ candidate: left, ceiling: right });
      const rl = delegationRadiusLeq({ candidate: right, ceiling: left });
      if (lr && rl) assert.equal(left.radiusHash, right.radiusHash, "antisymmetric");
      for (const upper of samples) {
        if (lr && delegationRadiusLeq({ candidate: right, ceiling: upper })) {
          assert.equal(delegationRadiusLeq({ candidate: left, ceiling: upper }), true,
            "transitive");
        }
      }
    }
  }

  const observeOnly = radius([grant("OBSERVE", [SCOPE_A], "2")]);
  const proposeOnly = radius([grant("PROPOSE", [SCOPE_A], "2")]);
  assert.equal(delegationRadiusLeq({ candidate: observeOnly, ceiling: proposeOnly }), false);
  assert.equal(delegationRadiusLeq({ candidate: proposeOnly, ceiling: observeOnly }), false);

  const unitA = radius([grant("OBSERVE", [SCOPE_A], "2", UNIT_OBSERVE)]);
  const unitB = radius([grant("OBSERVE", [SCOPE_A], "2", UNIT_OTHER)]);
  assert.equal(delegationRadiusLeq({ candidate: unitA, ceiling: unitB }), false);
  assert.equal(delegationRadiusLeq({ candidate: unitB, ceiling: unitA }), false);

  const narrowTime = radius([grant("OBSERVE", [SCOPE_A], "1")], {
    validFrom: "2026-08-27T01:00:00.000Z",
    validUntil: "2026-08-27T23:00:00.000Z",
  });
  assert.equal(delegationRadiusLeq({ candidate: narrowTime, ceiling: observeOnly }), true);
  assert.equal(delegationRadiusLeq({ candidate: observeOnly, ceiling: narrowTime }), false);
});

test("post-import prototype replacement cannot forge radius containment", () => {
  const candidate = radius([grant("PHYSICAL_ACTUATE", [SCOPE_A], "9")]);
  const ceiling = radius([grant("OBSERVE", [SCOPE_A], "1")]);
  const originalEvery = Array.prototype.every;
  const originalValues = Object.values;
  const originalSetHas = Set.prototype.has;
  let contained;
  let candidateChecked;
  try {
    Array.prototype.every = () => true;
    Object.values = () => [];
    Set.prototype.has = () => true;
    contained = delegationRadiusLeq({ candidate, ceiling });
    candidateChecked = verifyDelegationRadius(candidate, {
      expectedRadiusHash: candidate.radiusHash,
    });
  } finally {
    Array.prototype.every = originalEvery;
    Object.values = originalValues;
    Set.prototype.has = originalSetHas;
  }
  assert.equal(contained, false);
  assert.equal(candidateChecked.ok, true);
});

test("post-import crypto Hash prototype replacement cannot collapse radius hashes", () => {
  const left = radius([grant("OBSERVE", [SCOPE_A], "2")]);
  const right = radius([grant("OBSERVE", [SCOPE_B], "2")]);
  const prototype = Object.getPrototypeOf(createHash("sha256"));
  const originalUpdate = prototype.update;
  const originalDigest = prototype.digest;
  let rebuilt;
  let checked;
  try {
    prototype.update = function poisonedUpdate() { return this; };
    prototype.digest = () => "0".repeat(64);
    rebuilt = radius([grant("OBSERVE", [SCOPE_A], "2")]);
    checked = verifyDelegationRadius(left, { expectedRadiusHash: left.radiusHash });
  } finally {
    prototype.update = originalUpdate;
    prototype.digest = originalDigest;
  }
  assert.notEqual(left.radiusHash, right.radiusHash);
  assert.equal(rebuilt.radiusHash, left.radiusHash);
  assert.equal(checked.ok, true);
});

test("meet is the greatest common contraction and never reconciles unit/time conflicts", () => {
  const left = radius([grant("OBSERVE", [SCOPE_A, SCOPE_B], "8")], {
    validFrom: "2026-08-27T00:00:00.000Z",
    validUntil: "2026-08-29T00:00:00.000Z",
  });
  const right = radius([grant("OBSERVE", [SCOPE_B, SCOPE_C], "5")], {
    validFrom: "2026-08-27T12:00:00.000Z",
    validUntil: "2026-08-30T00:00:00.000Z",
  });
  const common = meetDelegationRadii({ left, right });
  assert.deepEqual(common.validity, {
    validFrom: "2026-08-27T12:00:00.000Z",
    validUntil: "2026-08-29T00:00:00.000Z",
  });
  assert.deepEqual(cell(common, "OBSERVE"), grant("OBSERVE", [SCOPE_B], "5"));
  assert.equal(delegationRadiusLeq({ candidate: common, ceiling: left }), true);
  assert.equal(delegationRadiusLeq({ candidate: common, ceiling: right }), true);
  assert.equal(meetDelegationRadii({ left: right, right: left }).radiusHash,
    common.radiusHash, "commutative");

  const unitConflict = radius([grant("OBSERVE", [SCOPE_B], "5", UNIT_OTHER)],
    right.validity);
  assert.equal(meetDelegationRadii({ left, right: unitConflict }).empty, true);
  const timeConflict = radius([grant("OBSERVE", [SCOPE_B], "5")], {
    validFrom: "2026-08-30T00:00:00.000Z",
    validUntil: "2026-08-31T00:00:00.000Z",
  });
  assert.equal(meetDelegationRadii({ left, right: timeConflict }).empty, true);
});

test("requested delta records scope, budget, unit, and time expansion without authority", () => {
  const base = radius([grant("OBSERVE", [SCOPE_A], "3")], {
    validFrom: "2026-08-27T02:00:00.000Z",
    validUntil: "2026-08-27T22:00:00.000Z",
  });
  const within = radius([grant("OBSERVE", [SCOPE_A], "2")], {
    validFrom: "2026-08-27T03:00:00.000Z",
    validUntil: "2026-08-27T21:00:00.000Z",
  });
  const noExpansion = requestedDelegationDelta({ base, requested: within });
  assert.equal(noExpansion.status, "WITHIN_BASE_RADIUS");
  assertNoAuthority(noExpansion.authority);
  assert.equal(verifyRequestedDelegationDelta(noExpansion,
    { base, requested: within, expectedDeltaHash: noExpansion.deltaHash }).ok, true);

  const requested = radius([
    grant("OBSERVE", [SCOPE_A, SCOPE_B], "8"),
    grant("TRAIN", [SCOPE_C], "2", UNIT_OTHER),
  ], WINDOW);
  const delta = requestedDelegationDelta({ base, requested });
  assert.equal(delta.status, "EXPANSION_REQUEST_NO_AUTHORITY");
  assert.equal(delta.validityExpansion.requestedOutsideBase, true);
  const observe = delta.cellDeltas.find((item) => item.atom === "OBSERVE");
  assert.deepEqual(observe.addedScopeHashes, [SCOPE_B]);
  assert.equal(observe.additionalBudget, "5");
  assert.equal(observe.expansionRequested, true);
  const train = delta.cellDeltas.find((item) => item.atom === "TRAIN");
  assert.equal(train.additionalBudget, "2");
  assertNoAuthority(delta.authority);
  const checked = verifyRequestedDelegationDelta(delta, { base, requested });
  assert.equal(checked.ok, true);
  assert.equal(checked.verificationLevel, "SOURCE_RADII_REDERIVED");
  assertNoAuthority(checked.authority);

  const changedUnit = radius([grant("OBSERVE", [SCOPE_A], "1", UNIT_OTHER)]);
  const unitDelta = requestedDelegationDelta({ base, requested: changedUnit });
  assert.equal(unitDelta.cellDeltas[0].budgetUnitChanged, true);
  assert.equal(unitDelta.status, "EXPANSION_REQUEST_NO_AUTHORITY");
});

test("join is never a union constructor and always returns an unauthorised request", () => {
  const left = radius([grant("OBSERVE", [SCOPE_A], "1")]);
  const right = radius([grant("TRAIN", [SCOPE_B], "1", UNIT_OTHER)]);
  const request = requestDelegationRadiusJoin({ left, right });
  assert.equal(request.schema, DELEGATION_RADIUS_SCHEMAS.joinRequest);
  assert.equal(request.status, "EXPANSION_REQUEST_NO_AUTHORITY");
  assert.equal(request.relation.kind, "INCOMPARABLE");
  assert.equal(request.resultRadius, null);
  assert.equal(Object.hasOwn(request, "joinedRadius"), false);
  assert.match(request.requestedUnionCommitmentHash, /^sha256:[a-f0-9]{64}$/u);
  assertNoAuthority(request.authority);
  assert.equal(verifyDelegationRadiusJoinRequest(request, {
    left, right, expectedJoinRequestHash: request.joinRequestHash,
  }).ok, true);

  const equalRequest = requestDelegationRadiusJoin({ left, right: left });
  assert.equal(equalRequest.status, "EXPANSION_REQUEST_NO_AUTHORITY");
  assert.equal(equalRequest.resultRadius, null);
  assertNoAuthority(equalRequest.authority);

  assert.throws(() => requestDelegationRadiusJoin({ left, right, trusted: true }),
    /JOIN_INPUT_FIELDS_INVALID/u);
  assert.throws(() => requestDelegationRadiusJoin({ left, right,
    localSignature: { keyId: "operator" } }), /JOIN_INPUT_FIELDS_INVALID/u);
});

test("child allocation conserves budgets, delegate issuance, and returns an exact residual", () => {
  const parent = radius([
    grant("OBSERVE", [SCOPE_A, SCOPE_B], "10", UNIT_OBSERVE),
    grant("WRITE_REVERSIBLE", [SCOPE_A, SCOPE_B], "10", UNIT_WRITE),
    grant("DELEGATE", [SCOPE_A, SCOPE_B], "6", UNIT_DELEGATE),
  ]);
  const childA = radius([
    grant("OBSERVE", [SCOPE_A], "3", UNIT_OBSERVE),
    grant("WRITE_REVERSIBLE", [SCOPE_A], "4", UNIT_WRITE),
    grant("DELEGATE", [SCOPE_A], "1", UNIT_DELEGATE),
  ], {
    validFrom: "2026-08-27T01:00:00.000Z",
    validUntil: "2026-08-27T20:00:00.000Z",
  });
  const childB = radius([
    grant("OBSERVE", [SCOPE_B], "2", UNIT_OBSERVE),
    grant("WRITE_REVERSIBLE", [SCOPE_B], "1", UNIT_WRITE),
  ], {
    validFrom: "2026-08-27T02:00:00.000Z",
    validUntil: "2026-08-27T21:00:00.000Z",
  });
  const allocation = allocateDelegationChildren({ parent, children: [childB, childA] });
  assert.equal(allocation.schema, DELEGATION_RADIUS_SCHEMAS.childAllocation);
  assert.equal(allocation.issuedChildCount, 2);
  assert.equal(allocation.delegateIssuanceBudgetPerChild, "1");
  assert.equal(allocation.scopeContainmentVerified, true);
  assert.equal(allocation.budgetConservationVerified, true);
  assert.ok(allocation.conservation.every((row) => row.exact));
  assert.equal(cell(allocation.residualRadius, "OBSERVE").budget.limit, "5");
  assert.equal(cell(allocation.residualRadius, "WRITE_REVERSIBLE").budget.limit, "5");
  assert.equal(cell(allocation.residualRadius, "DELEGATE").budget.limit, "3");
  assert.equal(delegationRadiusLeq({ candidate: allocation.residualRadius,
    ceiling: parent }), true);
  const delegateRow = allocation.conservation.find((row) => row.atom === "DELEGATE");
  assert.deepEqual({ parent: delegateRow.parentBudget, child: delegateRow.childBudget,
    issuance: delegateRow.issuanceBudget, residual: delegateRow.residualBudget },
  { parent: "6", child: "1", issuance: "2", residual: "3" });
  assertNoAuthority(allocation.authority);
  assertNoAuthority(allocation.residualRadius.authority);
  const checked = verifyDelegationChildAllocation(allocation, {
    parent, children: [childA, childB], expectedAllocationHash: allocation.allocationHash,
  });
  assert.equal(checked.ok, true);
  assert.equal(checked.verificationLevel, "SOURCE_RADII_REDERIVED");
  assertNoAuthority(checked.authority);

  const residualMutation = structuredClone(allocation);
  cell(residualMutation.residualRadius, "OBSERVE").budget.limit = "6";
  assert.equal(verifyDelegationChildAllocation(residualMutation,
    { parent, children: [childA, childB] }).ok, false);
});

test("child scope, aggregate budget, delegate scope, duplicate, and caller amplification fail", () => {
  const parent = radius([
    grant("OBSERVE", [SCOPE_A, SCOPE_B], "10", UNIT_OBSERVE),
    grant("WRITE_REVERSIBLE", [SCOPE_A, SCOPE_B], "10", UNIT_WRITE),
    grant("DELEGATE", [SCOPE_A, SCOPE_B], "4", UNIT_DELEGATE),
  ]);
  const outside = radius([grant("OBSERVE", [SCOPE_C], "1", UNIT_OBSERVE)]);
  assert.throws(() => allocateDelegationChildren({ parent, children: [outside] }),
    /CHILD_SCOPE_OR_BUDGET_AMPLIFICATION/u);

  const childSixA = radius([grant("OBSERVE", [SCOPE_A], "6", UNIT_OBSERVE)]);
  const childSixB = radius([grant("OBSERVE", [SCOPE_B], "6", UNIT_OBSERVE)]);
  assert.throws(() => allocateDelegationChildren({ parent,
    children: [childSixA, childSixB] }), /CHILD_BUDGET_AMPLIFICATION/u);

  const narrowDelegate = radius([
    grant("OBSERVE", [SCOPE_A, SCOPE_B], "10", UNIT_OBSERVE),
    grant("DELEGATE", [SCOPE_A], "4", UNIT_DELEGATE),
  ]);
  const childB = radius([grant("OBSERVE", [SCOPE_B], "1", UNIT_OBSERVE)]);
  assert.throws(() => allocateDelegationChildren({ parent: narrowDelegate,
    children: [childB] }), /CHILD_SCOPE_OUTSIDE_DELEGATE_SCOPE/u);

  const noDelegate = radius([grant("OBSERVE", [SCOPE_A], "10", UNIT_OBSERVE)]);
  const childA = radius([grant("OBSERVE", [SCOPE_A], "1", UNIT_OBSERVE)]);
  assert.throws(() => allocateDelegationChildren({ parent: noDelegate,
    children: [childA] }), /PARENT_DELEGATE_GRANT_REQUIRED/u);
  assert.throws(() => allocateDelegationChildren({ parent, children: [childA, childA] }),
    /CHILD_RADIUS_DUPLICATE_IDENTITY_REQUIRED/u);
  assert.throws(() => allocateDelegationChildren({ parent, children: [childA],
    authorized: true }), /CHILD_ALLOCATION_INPUT_FIELDS_INVALID/u);

  const sparse = [childA];
  sparse.length = 2;
  assert.throws(() => allocateDelegationChildren({ parent, children: sparse }),
    /CHILDREN_DENSE_ARRAY_REQUIRED/u);
});

test("relabel, full rehash, local signature, and caller booleans cannot expand authority", () => {
  const original = radius([
    grant("OBSERVE", [SCOPE_A], "2", UNIT_OBSERVE),
    grant("WRITE_REVERSIBLE", [SCOPE_A], "2", UNIT_WRITE),
  ]);

  const directRelabel = structuredClone(original);
  directRelabel.cells[0].atom = "TRAIN";
  const directReseal = resealRadius(directRelabel);
  assert.equal(verifyDelegationRadius(directReseal).ok, false,
    "fixed cell labels reject a relabel even after full rehash");

  const reclassified = structuredClone(original);
  const observe = cell(reclassified, "OBSERVE");
  const train = cell(reclassified, "TRAIN");
  train.scopeHashes = observe.scopeHashes;
  train.budget = observe.budget;
  observe.scopeHashes = [];
  observe.budget = { unitHash: null, limit: "0" };
  const reclassifiedReseal = resealRadius(reclassified);
  assert.equal(verifyDelegationRadius(reclassifiedReseal).ok, true,
    "a coherent reseal is only a new self-checking declaration");
  const expectedBound = verifyDelegationRadius(reclassifiedReseal,
    { expectedRadiusHash: original.radiusHash });
  assert.equal(expectedBound.ok, false);
  assert.equal(delegationRadiusLeq({ candidate: reclassifiedReseal,
    ceiling: original }), false);
  assertNoAuthority(verifyDelegationRadius(reclassifiedReseal).authority);
  const request = requestDelegationRadiusJoin({ left: original,
    right: reclassifiedReseal });
  assert.equal(request.status, "EXPANSION_REQUEST_NO_AUTHORITY");
  assert.equal(request.resultRadius, null);

  const authorityMutation = structuredClone(original);
  authorityMutation.authority.executionAuthority = true;
  const authorityReseal = resealRadius(authorityMutation);
  assert.equal(verifyDelegationRadius(authorityReseal).ok, false);

  const signedMutation = structuredClone(original);
  signedMutation.localSignature = { keyId: "operator", signature: "self" };
  const signedReseal = resealRadius(signedMutation);
  assert.equal(verifyDelegationRadius(signedReseal).ok, false);

  const callerOption = verifyDelegationRadius(original,
    { expectedRadiusHash: original.radiusHash, trusted: true });
  assert.equal(callerOption.ok, false);
  assertNoAuthority(callerOption.authority);
});
