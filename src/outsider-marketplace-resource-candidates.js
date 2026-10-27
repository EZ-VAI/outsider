import path from "node:path";
import { readPrivateExecutionBytes } from "./outsider-user-held-durable-execution-v2.js";
import { interfaceDigest as digest } from "./outsider-openapi-demand-matcher.js";
import {createLiquidSpaceBuyerAdapter,liquidSpaceWindowAvailable} from "./outsider-liquidspace-buyer-adapter.js";
export function loadMarketplaceBuyerSources(file) {
  const profile=JSON.parse(readPrivateExecutionBytes(file)),result={};
  for(const [key,needle] of [["search","GetWorkspaces"],["availability","/Venues/WorkspacesLandingPageCalculateAvailability"],...(profile.cost?[["cost","/api/Costs/calculate"]]:[])]) {
    const source=profile[key],m=JSON.parse(readPrivateExecutionBytes(source));
    const bytes=Buffer.concat(m.chunks.map(n=>Buffer.from(JSON.parse(readPrivateExecutionBytes(path.join(path.dirname(source),`${n}.json`))).base64,"base64")));
    if(m.status!==200||digest(bytes)!==m.sourceHash||new URL(m.url).origin!=="https://content-fd.liquidspace.com"||!bytes.toString().includes(needle))throw new Error("MARKETPLACE_SOURCE_MISMATCH");
    if(key==="cost"&&!["/api/booking/prerequisites/validate","/availability/check",'e[e.USD=0]="USD"',"/api/reservations",'method:"DELETE"',"processCancel", "terminateWhenTotalPriceMismatch"].every(s=>bytes.toString().includes(s)))throw new Error("MARKETPLACE_BOOKING_SOURCE_MISMATCH");
    result[`${key}ImplementationHash`]=m.sourceHash;
  }
  return result;
}
export async function discoverMarketplaceResourceCandidates({request,center,sources,fetchImpl,onReceipt}) {
  const adapter=createLiquidSpaceBuyerAdapter({fetchImpl,sourceBindings:sources,onReceipt});
  const response=await adapter.search({...request,...(center??{})});
  const data=response.data,effective=data?.effectiveRequest;
  const matched=response.state==="OBSERVED"&&data?.searchAvailable===true&&effective?.StartTime?.slice(0,10)===request.localStartDate.slice(0,10)
    &&effective.ReservationStart===request.localStartDate.slice(11)&&effective.ReservationLengthMinutes===(Date.parse(`${request.localEndDate}Z`)-Date.parse(`${request.localStartDate}Z`))/60000;
  if(!matched||!Array.isArray(data.pageDataModel))return {state:"UNAVAILABLE",reason:"MARKETPLACE_REQUEST_NOT_CONFIRMED",candidates:[]};
  const venueIds=new Set(),selected=[];
  for(const room of data.pageDataModel) {
    if(room.Scenario!=="Private Meeting Room"||room.Capacity<request.minimumSeats||room.Capacity>request.maximumSeats||room.IsNearMatch||venueIds.has(room.VenueId))continue;
    venueIds.add(room.VenueId);selected.push(room);if(selected.length===2)break;
  }
  const settled=await Promise.allSettled(selected.map(async room=>{
    const observed=await adapter.availability({venueId:room.VenueId,day:request.localStartDate.slice(0,10)});
    const inventory=observed.data?.WorkspacesAvailability?.find(r=>r.Id===room.Id);
    const available=observed.state==="OBSERVED"&&observed.data?.IsBlocked===false&&liquidSpaceWindowAvailable(inventory?.Availability,request.localStartDate,request.localEndDate);
    const url=new URL(room.WorkspaceUrl,"https://liquidspace.com");
    return {marketplace:"LiquidSpace",operatorDisplayName:room.VenueName,venueId:room.VenueId,resourceId:room.Id,seats:room.Capacity,
      sourceUrl:url.origin==="https://liquidspace.com"?url.href:null,requestedWindow:{localStartDate:request.localStartDate,localEndDate:request.localEndDate},
      state:available?"ALTERNATIVE_RESOURCE_AVAILABILITY_OBSERVED":"NOT_AVAILABLE",availabilityObserved:available,
      advertisedRate:room.HidePrices?null:{amount:room.PriceAmountValue??null,unit:room.PriceDescription??null,kind:"LISTING_RATE_NOT_TOTAL_QUOTE",currency:null},
      capacityReserved:false,responsibilityAccepted:false,substitutionAccepted:false,independentOwnershipVerified:false,
      sourceHashes:[response.receipt.sourceHash,observed.receipt.sourceHash],
      missing:["ALL_IN_PRICE_AND_VALIDITY","CAPACITY_RESERVATION","RESPONSIBILITY_ACCEPTANCE","SUBSTITUTABILITY_AND_OWNER_INDEPENDENCE","INDEPENDENT_OUTCOME_WITNESS"]};
  }));
  const candidates=settled.filter(r=>r.status==="fulfilled").map(r=>r.value);
  return {state:"MARKETPLACE_ALTERNATIVES_OBSERVED_NOT_RECOVERY",acquisition:"ENGINEERED_ADAPTER_FOR_PUBLIC_BUYER_ENTRY",requestEchoMatched:true,
    returnedRows:data.pageDataModel.length,totalAdvertisedMatches:data.totalWorkspacesUntrimmed??null,sourceBindings:sources,candidates,
    failedCandidateReads:settled.filter(r=>r.status==="rejected").length};
}

// Transaction preparation is distinct from discovery and from reservation.
// It calls the seller's real booking validators; it never creates a booking.
export async function prepareMarketplaceTransaction({candidate,sources,fetchImpl,onReceipt,anonymousBuyer=true}) {
  const adapter=createLiquidSpaceBuyerAdapter({fetchImpl,sourceBindings:sources,onReceipt,anonymousBuyer});
  const input={venueId:candidate.venueId,workspaceId:candidate.resourceId,...candidate.requestedWindow};
  const names=["calculateCost","prerequisites","checkBookingAvailability"];
  const results=await Promise.allSettled(names.map(name=>adapter[name](input)));
  const [cost,prerequisites,availability]=results.map(r=>r.status==="fulfilled"?r.value:null);
  const p=cost?.data;
  const validCost=cost?.state==="OBSERVED"&&p?.currency===0&&[p.salesPrice,p.salesTax,p.serviceCharge,p.totalPrice,p.amountDue].every(n=>Number.isFinite(n)&&n>=0)
    &&Math.abs(p.salesPrice+p.salesTax+p.serviceCharge-p.totalPrice)<.011;
  const quote=validCost?{kind:"SELLER_BOOKING_COST_CALCULATION",currency:"USD",base:p.salesPrice,tax:p.salesTax,serviceCharge:p.serviceCharge,
    total:p.totalPrice,amountDue:p.amountDue,priceLocked:false,expiresAt:null}:null;
  const prerequisiteValid=prerequisites?.state==="OBSERVED"&&prerequisites.data?.isValid===true;
  const bookingAvailable=availability?.state==="OBSERVED"&&availability.data?.isAvailable===true;
  const providerRequirements=Array.isArray(prerequisites?.data?.errors)?prerequisites.data.errors.map(e=>({type:e.type??null,message:e.message??null})):[];
  return {schema:"outsider/marketplace-transaction-preparation/v1",marketplace:candidate.marketplace,venueId:candidate.venueId,resourceId:candidate.resourceId,
    requestedWindow:candidate.requestedWindow,state:validCost&&prerequisiteValid&&bookingAvailable?"SELLER_PREFLIGHT_PASSED_NOT_RESERVED":"TRANSACTION_PREPARATION_INCOMPLETE",
    price:quote,prerequisiteValid,bookingAvailable,providerRequirements,
    checks:Object.fromEntries(names.map((name,i)=>[name,{state:results[i].status==="fulfilled"?results[i].value.state:"READ_FAILED",status:results[i].value?.receipt?.status??null}])),
    sourceHashes:results.filter(r=>r.status==="fulfilled").map(r=>r.value.receipt.sourceHash),
    nextActions:[...(!validCost?["OBTAIN_BOOKING_COST"]:[]),...(!prerequisiteValid?["RESOLVE_SELLER_PREREQUISITES"]:[]),...(!bookingAvailable?["SELECT_AVAILABLE_RESOURCE"]:[]),
      "BIND_ACTUAL_ORDER_AND_BUYER",...(quote?.amountDue>0?["AUTHORIZE_SPECIFIC_PAYMENT"]:[]),"ACCEPT_SELLER_TERMS_AND_RESERVE","RESERVE_SUBSTITUTABLE_RECOVERY","BIND_INDEPENDENT_ACCEPTANCE"],
    transactionSubmitted:false,capacityReserved:false,confirmationAvailable:false};
}
