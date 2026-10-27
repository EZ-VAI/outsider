import test from "node:test";
import assert from "node:assert/strict";
import { interfaceDigest, indexOpenApiOperations, matchDemandToInterfaces, validateInterfaceDemandMatches,
  attachInterfaceMatchesToFrontier } from "../src/outsider-openapi-demand-matcher.js";
const graph = { requirements: [{ id: "site", outcome: "usable office", acceptance: ["power and network"], recoveryNeeds: ["substitute"] }] };
const document = { openapi: "3.0.0", info: { title: "Scheduling" }, security: [{ bearer: [] }],
  components: { parameters: { id: { in: "path", name: "id", required: true } } },
  paths: { "/slots/{id}": { parameters: [{ $ref: "#/components/parameters/id" }],
    get: { summary: "Read slot", parameters: [{ name: "version", in: "header", required: true }] },
    delete: { summary: "Release slot", security: [] } } } };
const catalog = indexOpenApiOperations({ document, source: { contentHash: interfaceDigest(document) } });
const valid = { matches: [{ requirementId: "site", fit: "POSSIBLE_SUBSTEP",
  operationRefs: [catalog.operations[0].operationRef], supportedSubstep: "Read a schedule, not supply an office",
  missingConditions: ["owner binding", "physical office supply"] }] };
test("indexes exact operations, inherited inputs and security without turning documentation into capacity", () => {
  assert.equal(catalog.operations.length, 2);
  assert.equal(catalog.operations[0].pointer, "/paths/~1slots~1{id}/get");
  assert.deepEqual(catalog.operations[0].requiredParameters, [{ name: "id", in: "path" }, { name: "version", in: "header" }]);
  assert.equal(catalog.operations[0].securityDeclaration, "DECLARED");
  assert.equal(catalog.operations[1].securityDeclaration, "NONE_DECLARED");
  assert.equal(catalog.capacityEstablished, false);
});
test("model proposals must preserve every need and cite real source operation references", () => {
  assert.equal(validateInterfaceDemandMatches(valid, graph, [catalog]), true);
  assert.equal(validateInterfaceDemandMatches({ matches: [] }, graph, [catalog]), false);
  assert.equal(validateInterfaceDemandMatches({ matches: [{ ...valid.matches[0], operationRefs: ["invented"] }] }, graph, [catalog]), false);
  assert.equal(validateInterfaceDemandMatches({ matches: [{ ...valid.matches[0], fit: "NO_MATCH" }] }, graph, [catalog]), false);
});
test("source-backed substeps attach to original frontier, preserve unknowns and never generate execution", async () => {
  const result = await matchDemandToInterfaces({ graph, catalogs: [catalog], interpret: async () => valid });
  const original = { graph, graphHash: interfaceDigest(graph), integrationFrontier: [{ requirementId: "site", pendingQueries: ["office supplier"] }] };
  const successor = attachInterfaceMatchesToFrontier(original, result);
  assert.deepEqual(successor.integrationFrontier[0].pendingQueries, ["office supplier"]);
  assert.equal(successor.interfaceMatches.executableRouteCount, 0);
  assert.equal(result.matches[0].operationEvidence[0].sourceHash, catalog.source.contentHash);
  assert.equal(original.integrationFrontier[0].interfaceHypothesis, undefined);
  assert.throws(() => attachInterfaceMatchesToFrontier({ ...original, graphHash: "wrong" }, result));
});
