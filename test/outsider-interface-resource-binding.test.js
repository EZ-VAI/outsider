import test from "node:test";
import assert from "node:assert/strict";
import { observeInterfaceMatchedResources } from "../src/outsider-interface-resource-binding.js";
const hash = `sha256:${"a".repeat(64)}`;
const operation = { sourceHash: hash, operationRef: "read-slots", method: "GET", path: "/slots" };
const matches = { graphHash: hash, matches: ["install", "witness"].map(requirementId => ({ requirementId,
  supportedSubstep: "schedule only", missingConditions: ["actual personnel"], operationEvidence: [operation] })) };
function connection(discover) { return { connectionId: "one-owner", sourceHashes: [hash], operations: [operation],
  discoveryOperation: operation, scopeExpiresAt: "2027-01-01T00:00:00.000Z", discover }; }
test("two needs share one native query and cannot count the same owner as independent resources", async () => {
  let calls = 0;
  const result = await observeInterfaceMatchedResources({ matches, connections: [connection(async () => {
    calls++; return { status: "OBSERVED", providerReceipt: hash, slots: [] };
  })], discoveryRequest: { start: "future" } });
  assert.equal(calls, 1); assert.equal(result.observedResourceCount, 1);
  assert.equal(result.rows[0].bindings[0].discoveryKey, result.rows[1].bindings[0].discoveryKey);
  assert.equal(result.completeTemporaryNetwork, false); assert.equal(result.executableRouteCount, 0);
  assert.deepEqual(result.rows[0].missingConditions, ["actual personnel"]);
});
test("unmatched source and expired connection never invoke the registered adapter", async () => {
  let calls = 0; const c = connection(async () => { calls++; });
  await observeInterfaceMatchedResources({ matches, connections: [{ ...c, sourceHashes: [] }], discoveryRequest: {} });
  const result = await observeInterfaceMatchedResources({ matches, connections: [{ ...c, scopeExpiresAt: "2000-01-01T00:00:00Z" }], discoveryRequest: {} });
  assert.equal(calls, 0); assert.equal(result.rows[0].bindings[0].state, "CONNECTION_SCOPE_EXPIRED");
});
test("registered read-only discovery is a prerequisite of reserve, not of release-only matching", async () => {
  const reserve = { ...operation, method: "POST", path: "/holds", operationRef: "reserve" };
  const release = { ...operation, method: "DELETE", path: "/holds/{id}", operationRef: "release" };
  let calls = 0;
  const c = { ...connection(async () => { calls++; return { status: "OBSERVED", providerReceipt: hash }; }),
    operations: [operation, reserve, release], discoveryPrerequisite: { readOnly: true, forOperations: [reserve] } };
  const selected = { ...matches, matches: [{ ...matches.matches[0], operationEvidence: [reserve] },
    { ...matches.matches[1], operationEvidence: [release] }] };
  const result = await observeInterfaceMatchedResources({ matches: selected, connections: [c], discoveryRequest: {} });
  assert.equal(calls, 1);
  assert.equal(result.rows[0].bindings[0].discoveryReason, "REGISTERED_READ_ONLY_PREREQUISITE");
  assert.equal(result.rows[1].bindings[0].discoveryKey, null);
});
