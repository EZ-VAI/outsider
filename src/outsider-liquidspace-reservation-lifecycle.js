/* Native buyer booking lifecycle. UI is only for account connection, never the
 * order execution engine. A booking receipt is NOT independent fulfillment.
 * Calls need an account-local authorized transport and exact operation grants.
 */
import path from "node:path";
import {existsSync,mkdirSync} from "node:fs";
import {randomUUID} from "node:crypto";
import {interfaceDigest as digest} from "./outsider-openapi-demand-matcher.js";
import {readPrivateExecutionBytes,writePrivateExecutionRecordOnce as writeOnce,withUserHeldExecutionLockV2 as locked} from "./outsider-user-held-durable-execution-v2.js";
const ORIGIN="https://liquidspace.com";
const ID=/^[A-Za-z0-9_-]{1,128}$/u;
const HASH=/^sha256:[a-f0-9]{64}$/u;
const fail=code=>{throw Object.assign(new Error(code),{code});};
const read=file=>JSON.parse(readPrivateExecutionBytes(file));

export function buildLiquidSpaceHourlyOrder({preparation,organizerId,paymentMethod=null}) {
  if(preparation?.state!=="SELLER_PREFLIGHT_PASSED_NOT_RESERVED"||!preparation.prerequisiteValid||!preparation.bookingAvailable
    ||preparation.price?.currency!=="USD"||!Number.isFinite(preparation.price?.total)||preparation.price.total<0)fail("BOOKING_PREFLIGHT_NOT_READY");
  if(!ID.test(organizerId??""))fail("BOOKING_BUYER_ID_REQUIRED");
  const {localStartDate:start,localEndDate:end}=preparation.requestedWindow??{};
  const durationMinutes=(Date.parse(`${end}Z`)-Date.parse(`${start}Z`))/60000;
  if(!Number.isFinite(durationMinutes)||durationMinutes<30||durationMinutes>720||start.slice(0,10)!==end.slice(0,10))fail("BOOKING_WINDOW_INVALID");
  // The publisher's creation contract has an explicit price-mismatch abort.
  return {discriminator:"HourlyReservationRequest",venueId:preparation.venueId,workspaceId:preparation.resourceId,
    organizer:{discriminator:"AuthenticatedReservationOrganizer",id:organizerId},amenities:[],
    details:{discriminator:"HourlyReservationDetails",startDate:start.slice(0,10),startTime:start.slice(11),durationMinutes},
    totalPrice:preparation.price.total,terminateWhenTotalPriceMismatch:true,paymentMethod};
}

export function createLiquidSpaceReservationLifecycle({directory,sourceHash,request,authorizedFetch,authorize,clock=()=>new Date().toISOString()}) {
  if(!path.isAbsolute(directory??"")||!HASH.test(sourceHash??"")||typeof authorizedFetch!=="function"||typeof authorize!=="function")fail("BOOKING_LIFECYCLE_CONFIG_INVALID");
  if(request?.discriminator!=="HourlyReservationRequest"||request.terminateWhenTotalPriceMismatch!==true
    ||![request.venueId,request.workspaceId].every(id=>/^[a-f0-9-]{36}$/iu.test(id??""))
    ||!Number.isFinite(request.totalPrice)||request.totalPrice<0||request.details?.recurrencePattern)fail("BOOKING_REQUEST_INVALID");
  mkdirSync(directory,{recursive:true,mode:0o700});
  const file=name=>path.join(directory,`${name}.json`),requestHash=digest(request),lock=digest({directory,requestHash});
  writeOnce(file("binding"),{schema:"outsider/liquidspace-reservation-binding/v1",sourceHash,requestHash,request});
  const identity=()=>existsSync(file("created"))?read(file("created")):null;
  const summary=(state,extra={})=>({state,requestHash,provider:"LiquidSpace",capacityReserved:false,independentlyFulfilled:false,...extra});
  async function access(operation,extra={}) {
    const decision=await authorize({operation,requestHash,amount:request.totalPrice,currency:"USD",...extra});
    if(decision?.allowed!==true||decision.requestHash!==requestHash||!HASH.test(decision.grantHash??""))fail("BOOKING_OPERATION_NOT_AUTHORIZED");
    return decision.grantHash;
  }
  async function call(name,method,route,body) {
    // No generic endpoint, no redirect, no credentials in public receipts.
    const options={method,redirect:"error",signal:AbortSignal.timeout(15000),headers:{Accept:"application/json",...(body?{"Content-Type":"application/json"}:{})},...(body?{body:JSON.stringify(body)}:{})};
    const response=await authorizedFetch(`${ORIGIN}${route}`,options);
    if(response.redirected)fail("BOOKING_REDIRECT_REJECTED");
    const bytes=Buffer.from(await response.arrayBuffer());if(bytes.length>512*1024)fail("BOOKING_RESPONSE_TOO_LARGE");
    const receipt={operation:name,method,route,status:response.status,observedAt:clock(),sourceHash:digest(bytes),bytes:bytes.length,implementationSourceHash:sourceHash};
    writeOnce(file(name),{receipt,bodyBase64:bytes.toString("base64")});
    let data=null;try{data=JSON.parse(bytes)}catch{}
    return {receipt,data};
  }
  function createdFromSource() {
    if(!existsSync(file("create-response")))return null;
    const source=read(file("create-response"));let body;try{body=JSON.parse(Buffer.from(source.bodyBase64,"base64"))}catch{return null;}
    if(source.receipt.status!==200||!ID.test(body?.id??""))return null;
    const value={id:body.id,receiptHash:digest(source.receipt)};writeOnce(file("created"),value);return value;
  }
  async function inspectNow() {
    const created=identity()??createdFromSource();if(!created)return summary(existsSync(file("create-attempt"))?"SUBMISSION_UNKNOWN_NO_RETRY":"NOT_SUBMITTED");
    await access("READ");
    // Reads are occurrences: retries never overwrite a previous observation.
    const name=`read-${randomUUID()}`;
    const current=await call(name,"GET",`/api/reservations/${encodeURIComponent(created.id)}`);
    const value=current.data;
    const expectedStart=`${request.details.startDate}T${request.details.startTime}`;
    const expectedEnd=new Date(Date.parse(`${expectedStart}Z`)+request.details.durationMinutes*60000).toISOString().slice(0,19);
    const matched=current.receipt.status===200&&(value?.id===created.id||value?.idForLink===created.id)
      &&value.venueId===request.venueId&&value.workspaceId===request.workspaceId
      &&value.startTime?.slice(0,19)===expectedStart&&value.endTime?.slice(0,19)===expectedEnd;
    return summary(matched?(value.deleted===true?"CANCELLATION_CONFIRMED":"BOOKING_RECORDED_AWAITING_CAPACITY_ACCEPTANCE"):"READBACK_UNCONFIRMED",
      {reservationRefHash:digest(created.id),matched,deleted:matched?value.deleted===true:null,
        sellerStatus:matched?value.status??null:null,sellerReservationState:matched?value.reservationState??null:null,
        sourceReceiptHash:digest(current.receipt)});
  }
  return Object.freeze({
    inspect:()=>locked(lock,inspectNow),
    async submit() {return locked(lock,async()=>{
      if(identity()??createdFromSource())return inspectNow();
      if(existsSync(file("create-attempt")))return summary("SUBMISSION_UNKNOWN_NO_RETRY");
      const grantHash=await access("CREATE");
      writeOnce(file("create-attempt"),{requestHash,grantHash,attemptedAt:clock()});
      let response;try{response=await call("create-response","POST","/api/reservations",request);}catch{return summary("SUBMISSION_UNKNOWN_NO_RETRY");}
      if(!createdFromSource())return summary(response.receipt.status>=400&&response.receipt.status<500?"SUBMISSION_REJECTED":"SUBMISSION_UNKNOWN_NO_RETRY",
        {status:response.receipt.status,sourceReceiptHash:digest(response.receipt)});
      return inspectNow();
    });},
    async cancel() {return locked(lock,async()=>{
      const created=identity()??createdFromSource();if(!created)return summary("NO_KNOWN_RESERVATION_TO_CANCEL");
      const current=await inspectNow();if(current.state==="CANCELLATION_CONFIRMED")return current;
      if(!current.matched)return summary("CANCELLATION_NEEDS_MATCHED_READBACK");
      if(existsSync(file("cancel-attempt")))return summary("CANCELLATION_UNCONFIRMED_NO_RESUBMIT",{sourceReceiptHash:current.sourceReceiptHash});
      // Cancellation may itself create a fee; it has a separate grant.
      const grantHash=await access("CANCEL",{reservationRefHash:digest(created.id)});
      writeOnce(file("cancel-attempt"),{requestHash,grantHash,attemptedAt:clock()});
      try{await call("cancel-response","DELETE",`/api/reservations/${encodeURIComponent(created.id)}`);}catch{/* Read back even after an uncertain delete. */}
      return inspectNow();
    });},
  });
}
