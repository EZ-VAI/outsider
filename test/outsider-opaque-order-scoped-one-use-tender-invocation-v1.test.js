import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRequesterExactTenderContactPermissionV1, createOpaqueOrderScopedOneUseTenderInvocationV1, OUTSIDER_OPAQUE_ORDER_SCOPED_ONE_USE_TENDER_INVOCATION_V1_BOUNDARY } from "../src/outsider-opaque-order-scoped-one-use-tender-invocation-v1.js";

const h=s=>`sha256:${createHash("sha256").update(s).digest("hex")}`;
const binding=Object.freeze({tenderHash:h("tender"),workOrderHash:h("work"),typedGraphHash:h("graph"),requirementHash:h("requirement"),descriptorProjectionHash:h("descriptor"),bodyHash:h("body"),oneUseNonceHash:h("nonce"),idempotencyKeyHash:h("idempotency"),effectDeadline:"2099-01-01T00:10:00.000Z"});

test("contact permission is opaque, exact-order bound, and explicitly not seller authority",()=>{
  const permission=createRequesterExactTenderContactPermissionV1({...binding,requesterDelegationPermissionHash:h("delegation")});
  assert.equal(permission.permissionScope,"SEND_EXACT_TENDER_TO_DECLARED_INTERFACE_ONLY");
  assert.equal(permission.sellerOwnerAuthorityEstablished,false);assert.equal(permission.authority,"NONE");
  assert.equal(Object.values(permission).some(v=>typeof v==="string"&&v.startsWith("https://")),false);
  assert.equal(OUTSIDER_OPAQUE_ORDER_SCOPED_ONE_USE_TENDER_INVOCATION_V1_BOUNDARY.endpointUrlProjected,false);
});

test("cross-order splice is refused before descriptor lease consumption",()=>{
  const permission=createRequesterExactTenderContactPermissionV1({...binding,requesterDelegationPermissionHash:h("delegation-2")});
  assert.throws(()=>createOpaqueOrderScopedOneUseTenderInvocationV1({descriptorResult:Object.freeze({publicProjection:{projectionHash:binding.descriptorProjectionHash}}),contactPermission:permission,binding:{...binding,workOrderHash:h("other")},ledgerDirectory:"/not-used",ledgerId:"ledger_00000000000000000000000000000000",adapterInstanceRefHash:h("adapter"),verifierContext:{},expectedVerifierContextHash:h("context"),observedAt:"2099-01-01T00:00:00.000Z"}),/CONTACT_PERMISSION_CROSS_ORDER_OR_BODY_MISMATCH/);
});
