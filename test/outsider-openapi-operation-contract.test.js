import test from "node:test";
import assert from "node:assert/strict";
import { indexOpenApiOperations, interfaceDigest } from "../src/outsider-openapi-demand-matcher.js";
import { materializeOpenApiOperationContract } from "../src/outsider-openapi-operation-contract.js";
test("selected operation carries exact request and response schemas through local recursive refs without following remote refs", () => {
  const document = { openapi: "3.0.0", paths: { "/holds": { post: { summary: "Hold",
    requestBody: { $ref: "#/components/requestBodies/hold" }, responses: { 200: { $ref: "https://example.org/schema.json" } } } } },
    components: { requestBodies: { hold: { content: { "application/json": { schema: { $ref: "#/components/schemas/hold" } } } } },
      schemas: { hold: { type: "object", required: ["slotId"], properties: { slotId: { type: "string" }, parent: { $ref: "#/components/schemas/hold" } } } } } };
  const bytes = Buffer.from(JSON.stringify(document)), source = { contentHash: interfaceDigest(bytes) };
  const operationRef = indexOpenApiOperations({ document, source }).operations[0].operationRef;
  const result = materializeOpenApiOperationContract({ bytes, source, operationRef });
  assert.equal(Object.keys(result.resolvedLocalReferences).length, 2);
  assert.deepEqual(result.unresolvedReferences, ["https://example.org/schema.json"]);
  assert.deepEqual(result.resolvedLocalReferences["#/components/schemas/hold"].required, ["slotId"]);
  assert.equal(result.executionBindingCreated, false);
  assert.throws(() => materializeOpenApiOperationContract({ bytes: Buffer.from("{}"), source, operationRef }));
});
