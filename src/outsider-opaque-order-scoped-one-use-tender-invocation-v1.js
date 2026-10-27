/* Opaque, order-scoped contact capability. Seller declarations never mint authority. */
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { canonicalizeStrict } from "./canonical.js";
import { claimSellerTransactionEndpointLeaseV2 } from "./outsider-seller-transaction-interface-discovery-adapter-v2.js";
import { createPinnedPublicHttpsOneUsePostTransportV1 } from "./outsider-pinned-public-https-one-use-post-transport-v1.js";
import { createDurableOneUseEndpointEffectEventV1, initializeDurableOneUseEndpointEffectLedgerV1, appendDurableOneUseEndpointEffectLedgerV1, verifyDurableOneUseEndpointEffectLedgerV1 } from "./outsider-durable-one-use-endpoint-effect-ledger-v1.js";
import { verifyExternalCapacityReceiptLifecycleV1 } from "./outsider-one-use-tender-response-lifecycle-v1.js";

const PREFIX="OUTSIDER_OPAQUE_ORDER_SCOPED_ONE_USE_TENDER_INVOCATION_V1_",HASH=/^sha256:[a-f0-9]{64}$/u;
const GRANTS=new WeakMap(),CAPS=new WeakMap();
const fail=code=>{throw new TypeError(`${PREFIX}${code}`);};
const h=(domain,value)=>`sha256:${createHash("sha256").update(`${domain}\0${canonicalizeStrict(value)}`).digest("hex")}`;
const bh=bytes=>`sha256:${createHash("sha256").update(bytes).digest("hex")}`;
const freeze=value=>{if(value&&typeof value==="object"&&!Object.isFrozen(value)){for(const k of Reflect.ownKeys(value))freeze(value[k]);Object.freeze(value);}return value;};
function exact(value,fields,code){if(!value||typeof value!=="object"||Array.isArray(value)||Reflect.ownKeys(value).length!==fields.length||fields.some(f=>!Object.hasOwn(value,f)))fail(code);}
function hashes(value,fields){for(const f of fields)if(!HASH.test(value[f]))fail(`${f.toUpperCase()}_INVALID`);}
function instant(v,code){if(typeof v!=="string"||!Number.isFinite(Date.parse(v))||new Date(Date.parse(v)).toISOString()!==v)fail(code);return v;}

const BINDING_FIELDS=["tenderHash","workOrderHash","typedGraphHash","requirementHash","descriptorProjectionHash","bodyHash","oneUseNonceHash","idempotencyKeyHash","effectDeadline"];
export const OUTSIDER_OPAQUE_ORDER_SCOPED_ONE_USE_TENDER_INVOCATION_V1_BOUNDARY=freeze({position:"OPAQUE_ORDER_SCOPED_CONTACT_HOLD_ONLY",endpointUrlProjected:false,requesterContactPermissionIsSellerAuthority:false,attemptBeforeIoRequired:true,retryAfterAttemptPermitted:false,sellerAckIsOutcome:false,authority:"NONE",capacityReserved:false,outcomeEstablished:false,decisionState:"HOLD"});

export function createRequesterExactTenderContactPermissionV1(input){
  exact(input,[...BINDING_FIELDS,"requesterDelegationPermissionHash"],"CONTACT_PERMISSION_INPUT_INVALID");hashes(input,[...BINDING_FIELDS.filter(f=>f!=="effectDeadline"),"requesterDelegationPermissionHash"]);instant(input.effectDeadline,"DEADLINE_INVALID");
  const projection=freeze({schema:"outsider/requester-exact-tender-contact-permission/v1",schemaVersion:"1.0.0",permissionScope:"SEND_EXACT_TENDER_TO_DECLARED_INTERFACE_ONLY",sellerOwnerAuthorityEstablished:false,capacityReserved:false,authority:"NONE",decisionState:"HOLD",permissionHash:h("outsider/requester-exact-tender-contact-permission/v1",input)});
  GRANTS.set(projection,{...input,consumed:false,permissionHash:projection.permissionHash});return projection;
}

export function createOpaqueOrderScopedOneUseTenderInvocationV1(input){
  exact(input,["descriptorResult","contactPermission","binding","ledgerDirectory","ledgerId","adapterInstanceRefHash","verifierContext","expectedVerifierContextHash","observedAt"],"INVOCATION_INPUT_INVALID");
  exact(input.binding,BINDING_FIELDS,"BINDING_INVALID");hashes(input.binding,BINDING_FIELDS.filter(f=>f!=="effectDeadline"));instant(input.binding.effectDeadline,"DEADLINE_INVALID");
  const grant=GRANTS.get(input.contactPermission);if(!grant||grant.consumed)fail("CONTACT_PERMISSION_INVALID");
  for(const f of BINDING_FIELDS)if(grant[f]!==input.binding[f])fail("CONTACT_PERMISSION_CROSS_ORDER_OR_BODY_MISMATCH");
  if(input.descriptorResult?.publicProjection?.projectionHash!==input.binding.descriptorProjectionHash)fail("DESCRIPTOR_PROJECTION_MISMATCH");
  const endpoint=claimSellerTransactionEndpointLeaseV2(input.descriptorResult);if(endpoint.tenderHash!==input.binding.tenderHash)fail("DESCRIPTOR_TENDER_MISMATCH");
  if(Date.parse(endpoint.expiresAt)<Date.parse(input.binding.effectDeadline))fail("DESCRIPTOR_EXPIRES_BEFORE_EFFECT_DEADLINE");
  grant.consumed=true;const cap=freeze({schema:"outsider/opaque-order-scoped-one-use-tender-invocation/v1",schemaVersion:"1.0.0",endpointProjected:false,contactPermissionHash:grant.permissionHash,authority:"NONE",decisionState:"HOLD"});
  CAPS.set(cap,{...input,endpointUrl:endpoint.endpoint,permissionHash:grant.permissionHash,used:false});return cap;
}

function event(state,type,at,previous,extra={}){return createDurableOneUseEndpointEffectEventV1({ledgerId:state.ledgerId,eventType:type,effectIdHash:h("outsider/opaque-tender-effect/v1",state.binding),transactionBindingHash:h("outsider/opaque-tender-transaction/v1",{tenderHash:state.binding.tenderHash,workOrderHash:state.binding.workOrderHash,typedGraphHash:state.binding.typedGraphHash,requirementHash:state.binding.requirementHash}),endpointBindingHash:h("outsider/private-endpoint-binding/v1",{endpoint:state.endpointUrl,descriptorProjectionHash:state.binding.descriptorProjectionHash}),adapterInstanceRefHash:state.adapterInstanceRefHash,permissionGrantHash:state.permissionHash,oneUseNonceHash:state.binding.oneUseNonceHash,idempotencyKeyHash:state.binding.idempotencyKeyHash,bodyHash:state.binding.bodyHash,effectDeadline:state.binding.effectDeadline,recordedAt:at,previousEffectEventHash:previous,occurrenceNonceHash:h("outsider/opaque-tender-occurrence/v1",{type,at,nonce:state.binding.oneUseNonceHash}),endpointReceiptHash:type==="ENDPOINT_RECEIPT_OBSERVED"?extra.evidence:null,terminalEvidenceHash:type==="AMBIGUOUS_NO_RETRY_HOLD"?extra.evidence:null});}
function append(state,head,e){return appendDurableOneUseEndpointEffectLedgerV1({directory:state.ledgerDirectory,ledgerId:state.ledgerId,event:e,expectedLocalHeadHash:head.head.headHash});}
function decode(source,key){const v=source[key];if(typeof v!=="string")fail("SOURCE_DOCUMENT_SET_INVALID");return Buffer.from(v,"base64");}

export async function invokeExactTender(capability,input,dependencies){
  const state=CAPS.get(capability);if(!state||state.used)fail("INVOCATION_CAPABILITY_INVALID_OR_CONSUMED");state.used=true;
  exact(input,["bodyBytes","admittedAt","reservedAt","attemptedAt","reconciledAt"],"INVOKE_INPUT_INVALID");for(const k of ["admittedAt","reservedAt","attemptedAt","reconciledAt"])instant(input[k],`${k.toUpperCase()}_INVALID`);
  const bytes=Buffer.from(input.bodyBytes);if(bh(bytes)!==state.binding.bodyHash)fail("BODY_HASH_MISMATCH");let request;try{request=JSON.parse(bytes.toString("utf8"));}catch{fail("BODY_INVALID");}if(`${canonicalizeStrict(request)}\n`!==bytes.toString("utf8")&&canonicalizeStrict(request)!==bytes.toString("utf8"))fail("BODY_NOT_CANONICAL");if(request.expectedTenderHash!==state.binding.tenderHash||request.tender?.tenderHash!==state.binding.tenderHash||request.tender?.workOrderHash!==state.binding.workOrderHash)fail("REQUEST_CROSS_ORDER_MISMATCH");
  let head;if(existsSync(state.ledgerDirectory)){const replay=verifyDurableOneUseEndpointEffectLedgerV1({directory:state.ledgerDirectory,ledgerId:state.ledgerId,expectedLocalHeadHash:null});if(replay.ok)fail("RESTART_AFTER_DURABLE_HISTORY_REFUSED");fail("EXISTING_LEDGER_REPLAY_INVALID_HOLD");}
  const admitted=event(state,"INTENT_ADMITTED",input.admittedAt,null);head=initializeDurableOneUseEndpointEffectLedgerV1({directory:state.ledgerDirectory,ledgerId:state.ledgerId,genesisEvent:admitted});const reserved=event(state,"SUBMIT_RESERVED",input.reservedAt,admitted.eventHash);head=append(state,head,reserved);const attempted=event(state,"SUBMIT_ATTEMPTED",input.attemptedAt,reserved.eventHash);head=append(state,head,attempted);
  try{
    const post=createPinnedPublicHttpsOneUsePostTransportV1(dependencies.transportConfig);const response=await post(state.endpointUrl,{method:"POST",headers:{"Content-Type":"application/json",Accept:"application/json"},redirect:"error",credentials:"omit",body:bytes,signal:dependencies.signal});if(response.status<200||response.status>299)throw new Error("NON_2XX_OR_REDIRECT");const text=await response.text();let body;try{body=JSON.parse(text);}catch{throw new Error("MALFORMED_RESPONSE");}
    if(body.schema!=="outsider/seller-owned-http-one-use-tender-response/v1"||body.tenderHash!==state.binding.tenderHash||body.exactSourceDocumentCount!==5||body.capacityReserved!==false||body.authority!=="NONE")throw new Error("SELLER_RESPONSE_BOUNDARY_INVALID");const s=body.sourceDocuments,m=body.sourceBundleManifest;const verified=verifyExternalCapacityReceiptLifecycleV1({tender:request.tender,expectedTenderHash:request.expectedTenderHash,responses:request.responses,responseOccurrences:request.responseOccurrences,expectedResponseOccurrenceCount:request.expectedResponseOccurrenceCount,expectedResponseLifecycleHeadHash:request.expectedResponseLifecycleHeadHash,verifierContext:state.verifierContext,expectedVerifierContextHash:state.expectedVerifierContextHash,semanticsSourceBytes:decode(s,"semantics"),expectedSemanticsSourceHash:m.sourceHashes.semanticsSourceHash,standingSourceBytes:decode(s,"standing"),expectedStandingSourceHash:m.sourceHashes.standingSourceHash,receiptSourceBytes:decode(s,"receipt"),expectedReceiptSourceHash:m.sourceHashes.receiptSourceHash,lifecycleEventSourceBytes:s.lifecycleEvents.map(v=>Buffer.from(v,"base64")),lifecycleHeadSourceBytes:decode(s,"lifecycleHead"),expectedLifecycleHeadSourceHash:m.sourceHashes.lifecycleHeadSourceHash,observedAt:state.observedAt});if(!verified.ok)throw new Error("LIFECYCLE_VERIFICATION_FAILED");const receipt=event(state,"ENDPOINT_RECEIPT_OBSERVED",input.reconciledAt,attempted.eventHash,{evidence:bh(Buffer.from(text))});head=append(state,head,receipt);return freeze({schema:"outsider/opaque-order-scoped-one-use-tender-invocation-result/v1",sellerFiveSourceLifecycleVerified:true,endpointProjected:false,transportReceiptIsOutcome:false,capacityReserved:false,outcomeEstablished:false,authority:"NONE",decisionState:"HOLD",ledgerHeadHash:head.head.headHash});
  }catch(error){const evidence=h("outsider/opaque-tender-ambiguous/v1",{name:error?.name??"Error",message:String(error?.message??error)});try{head=append(state,head,event(state,"AMBIGUOUS_NO_RETRY_HOLD",input.reconciledAt,attempted.eventHash,{evidence}));}catch{}throw Object.assign(new Error(`${PREFIX}AMBIGUOUS_NO_RETRY_HOLD`),{cause:error,ledgerHeadHash:head?.head?.headHash});}
}
