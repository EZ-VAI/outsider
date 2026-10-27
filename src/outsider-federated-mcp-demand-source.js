/* Existing registry -> existing federation -> existing read-only observer.
 * Keeps the module-issued lease chain intact. No naked endpoint or tools/call.
 */
import {createHash} from "node:crypto";
import {canonicalizeStrict} from "./canonical.js";
import {discoverMcpRegistryRemoteRoutesV1} from "./outsider-mcp-registry-discovery-adapter-v1.js";
import {adaptMcpRegistryDiscoveryProjectionV1} from "./outsider-mcp-registry-discovery-federation-node-v1.js";
import {createOrderScopedDiscoveryNodeCapabilityV1,runOrderScopedDiscoveryFederationV1,
  OUTSIDER_ORDER_SCOPED_DISCOVERY_FEDERATION_V1_SCHEMAS} from "./outsider-order-scoped-discovery-federation-v1.js";
import {observeMcpRemoteInterfacesV1} from "./outsider-mcp-remote-interface-observer-v1.js";
const digest=x=>`sha256:${createHash("sha256").update(canonicalizeStrict(x)).digest("hex")}`;
export async function discoverFederatedMcpDemandSource({binding,query,fetchImpl=globalThis.fetch,
  observerDependencies}){
  const {tender,requirementKind,requirementId,asOf,expiresAt,privateBindingNonce}=binding;
  const section=requirementKind==="RESOURCE"?tender.resourceRequirements:
    requirementKind==="EVIDENCE"?tender.evidenceRequirements:tender.recoveryRequirements;
  const idField=requirementKind==="RESOURCE"?"resourceRequirementId":
    requirementKind==="EVIDENCE"?"evidenceRequirementId":"recoveryRequirementId";
  const requirement=section.items.find(r=>r[idField]===requirementId);
  if(!requirement)throw new Error("FEDERATED_MCP_REQUIREMENT_MISSING");
  const requirementSetHash=section.requirementSetHash;
  const requirementObjectHash=`sha256:${createHash("sha256")
    .update("outsider/outcome-formation-exact-tender-requirement/v1\0")
    .update(canonicalizeStrict({tenderHash:tender.tenderHash,requirementKind,requirementSetHash,requirement})).digest("hex")}`;
  const key=digest({tenderHash:tender.tenderHash,requirementId,query,asOf});
  const occurrenceId=`discovery_${key.slice(7,39)}`,nodeSlotId=`node_${key.slice(7,39)}`;
  let envelope;
  const capability=createOrderScopedDiscoveryNodeCapabilityV1({nodeKind:"mcp.registry.v01",async invoke(context){
    envelope=await discoverMcpRegistryRemoteRoutesV1({tender:context.tender,requirementKind:context.requirementKind,
      requirementId:context.requirementId,discovery:context.nodeInput.discovery,asOf:context.asOf,
      expiresAt:context.expiresAt,privateBindingNonce:context.privateBindingNonce},{fetchImpl,timeoutMs:10000});
    return{publicReceipt:adaptMcpRegistryDiscoveryProjectionV1(envelope,context),privateEphemeral:envelope};
  }});
  const federation=await runOrderScopedDiscoveryFederationV1({tender,asOf,
    publicPlan:{schema:OUTSIDER_ORDER_SCOPED_DISCOVERY_FEDERATION_V1_SCHEMAS.plan,
      federationId:`federation_${key.slice(7,39)}`,tenderHash:tender.tenderHash,workOrderHash:tender.workOrderHash,
      typedGraphHash:tender.typedGraph.typedGraphHash,concurrencyLimit:1,
      jobs:[{occurrenceId,nodeSlotId,nodeKind:"mcp.registry.v01",requirementKind,requirementId,
        requirementSetHash,requirementObjectHash,expiresAt,maximumRuntimeMs:12000}]},
    privateJobs:[{occurrenceId,nodeInput:{discovery:{search:query,limit:10}},privateBindingNonce}],
    privateProjectionNonce:digest({key,privateBindingNonce})},{capabilityBindings:[{nodeSlotId,capability}]});
  if(!envelope)throw new Error("FEDERATED_MCP_SOURCE_NOT_RETURNED");
  let observation=null;
  if(envelope.publicProjection.status==="SUCCEEDED"&&envelope.privateEphemeral.candidateLeaseCount>0){
    observation=await observeMcpRemoteInterfacesV1({federationResult:federation,expectedTenderHash:tender.tenderHash,
      occurrenceId,candidateIndexes:[0]},observerDependencies);
  }
  return{projection:envelope.publicProjection,observation,
    observationHash:observation?digest(observation):null,
    sourceScope:"REGISTRY_AND_CREDENTIAL_FREE_PROTOCOL_OBSERVATION_NOT_SUPPLIER_CAPACITY"};
}
