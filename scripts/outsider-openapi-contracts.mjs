import { readdirSync } from "node:fs";
import path from "node:path";
import { readPrivateExecutionBytes, writePrivateExecutionRecordOnce as writeOnce } from "../src/outsider-user-held-durable-execution-v2.js";
import { interfaceDigest } from "../src/outsider-openapi-demand-matcher.js";
import { materializeOpenApiOperationContract } from "../src/outsider-openapi-operation-contract.js";
const directory = process.argv[2];
if (!path.isAbsolute(directory ?? "")) throw new Error("CONTRACT_DIRECTORY_INVALID");
const file = name => path.join(directory, `${name}.json`), read = name => JSON.parse(readPrivateExecutionBytes(file(name)));
const result = read("result");
const sources = new Map(readdirSync(directory).filter(n => /^source-\d+\.json$/u.test(n)).map(n => {
  const manifest = read(n.slice(0, -5));
  return [manifest.source.contentHash, { source: manifest.source,
    bytes: Buffer.concat(manifest.chunks.map(c => Buffer.from(read(c).base64, "base64"))) }];
}));
const selected = new Map(result.matches.flatMap(m => m.operationEvidence.map(o => [o.operationRef, o])));
const contracts = [];
for (const [operationRef, operation] of selected) {
  const source = sources.get(operation.sourceHash);
  if (!source) throw new Error("CONTRACT_SOURCE_NOT_CAPTURED");
  const contract = materializeOpenApiOperationContract({ ...source, operationRef });
  const name = `contract-${operationRef.slice(7)}`;
  writeOnce(file(name), contract);
  contracts.push({ operationRef, contentHash: interfaceDigest(contract), file: `${name}.json`,
    localReferenceCount: Object.keys(contract.resolvedLocalReferences).length,
    unresolvedReferenceCount: contract.unresolvedReferences.length });
}
const summary = { schema: "outsider/selected-interface-contracts/v1", parentMatchesHash: interfaceDigest(result),
  contracts, newHttpRequests: 0, newModelCalls: 0, executableRouteCount: 0 };
writeOnce(file("contracts-index"), summary);
console.log(JSON.stringify({ ...summary, contracts: undefined, contractCount: contracts.length,
  unresolvedReferenceCount: contracts.reduce((n, c) => n + c.unresolvedReferenceCount, 0) }));
