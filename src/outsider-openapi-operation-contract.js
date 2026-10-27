/* Materialize selected interface definitions from exact captured source bytes.
 * This is an adapter-development input, not a generated executor/authority.
 */
import { interfaceDigest, indexOpenApiOperations } from "./outsider-openapi-demand-matcher.js";
const at = (document, ref) => ref.slice(2).split("/")
  .map(x => x.replaceAll("~1", "/").replaceAll("~0", "~"))
  .reduce((node, key) => node && Object.hasOwn(node, key) ? node[key] : undefined, document);

export function materializeOpenApiOperationContract({ bytes, source, operationRef }) {
  if (interfaceDigest(bytes) !== source.contentHash) throw new Error("OPENAPI_CONTRACT_SOURCE_MISMATCH");
  const document = JSON.parse(bytes);
  const operation = indexOpenApiOperations({ document, source }).operations.find(o => o.operationRef === operationRef);
  if (!operation) throw new Error("OPENAPI_CONTRACT_OPERATION_MISSING");
  const pathItem = document.paths[operation.path];
  const resolvedLocalReferences = {}, unresolvedReferences = new Set(), visited = new Set();
  const visit = value => {
    if (!value || typeof value !== "object") return;
    if (typeof value.$ref === "string" && !visited.has(value.$ref)) {
      visited.add(value.$ref);
      if (visited.size > 1000) throw new Error("OPENAPI_CONTRACT_REFERENCE_LIMIT");
      const target = value.$ref.startsWith("#/") ? at(document, value.$ref) : undefined;
      if (target === undefined) unresolvedReferences.add(value.$ref);
      else { resolvedLocalReferences[value.$ref] = target; visit(target); }
    }
    for (const child of Object.values(value)) visit(child);
  };
  // Keep path-level parameter inheritance and servers, but do not pull sibling
  // operations into the contract. Reference targets remain exact, not expanded
  // recursively into a lossy/infinitely recursive substitute schema.
  let effectivePath = pathItem;
  const pathRefs = new Set();
  while (effectivePath?.$ref) {
    if (!effectivePath.$ref.startsWith("#/") || pathRefs.has(effectivePath.$ref)) throw new Error("OPENAPI_PATH_REFERENCE_UNRESOLVED");
    pathRefs.add(effectivePath.$ref);
    effectivePath = at(document, effectivePath.$ref);
  }
  const operationDefinition = effectivePath?.[operation.method.toLowerCase()];
  if (!operationDefinition) throw new Error("OPENAPI_CONTRACT_DEFINITION_MISSING");
  const definition = { operation: operationDefinition, pathParameters: effectivePath.parameters ?? [],
    servers: operationDefinition.servers ?? effectivePath.servers ?? document.servers ?? [],
    security: operationDefinition.security ?? document.security ?? null,
    securitySchemes: document.components?.securitySchemes ?? {} };
  visit(definition);
  return { schema: "outsider/openapi-operation-contract/v1", source, operationRef,
    sourcePointer: operation.pointer, pathReferences: [...pathRefs], method: operation.method, path: operation.path,
    definition, resolvedLocalReferences, unresolvedReferences: [...unresolvedReferences],
    requestAndResponseDefinitionsCaptured: true, executionBindingCreated: false,
    nextStep: "BIND_VALIDATED_ADAPTER_AND_OWNER_THEN_OBSERVE_RESOURCE_QUOTE_ETA_CAPACITY" };
}
