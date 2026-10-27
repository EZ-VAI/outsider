/* Anonymous marketplace buyer search. A listing rate/availability is not a
 * signed offer, confirmed booking, or proof of independent ownership. */
import { interfaceDigest as digest } from "./outsider-openapi-demand-matcher.js";
export function liquidSpaceWindowAvailable(cells,start,end) {
  if(!Array.isArray(cells)||cells.length!==24)return false;
  // Same three-cell rotation as the publisher XPP calendar, whose index is
  // passed directly to Date.setHours when a buyer chooses a cell.
  const hours=cells.slice(-3).concat(cells.slice(0,-3));
  const minutes=s=>Number(s.slice(11,13))*60+Number(s.slice(14,16));
  const a=minutes(start),b=minutes(end);
  if(a%30||b%30||b<=a||start.slice(0,10)!==end.slice(0,10))return false;
  for(let m=a;m<b;m+=30)if(hours[Math.floor(m/60)]?.split("-")[m%60/30]!=="available")return false;
  return true;
}
export function parseLiquidSpaceSearchPage(text) {
  const marker="SearchPage.initialize(",start=text.indexOf(marker),end=text.indexOf("</script>",start);
  if(start<0||end<0)throw new Error("LIQUIDSPACE_SEARCH_BOOTSTRAP_MISSING");
  const value=JSON.parse(text.slice(start+marker.length,end).trim().replace(/\);$/u,""));
  if(!value.SearchScriptConstructorParams?.searchRequest)throw new Error("LIQUIDSPACE_SEARCH_SCHEMA_CHANGED");
  return value.SearchScriptConstructorParams.searchRequest;
}
export function createLiquidSpaceBuyerAdapter({fetchImpl=globalThis.fetch,sourceBindings,onReceipt=async()=>{},anonymousBuyer=true}={}) {
  if(!sourceBindings||![sourceBindings.searchImplementationHash,sourceBindings.availabilityImplementationHash].every(h=>/^sha256:[a-f0-9]{64}$/u.test(h??"")))throw new Error("LIQUIDSPACE_IMPLEMENTATION_SOURCE_REQUIRED");
  async function read(operation,url,body,form=false) {
    const start=Date.now(),request={operation,url,method:body?"POST":"GET",body:body??null};
    const response=await fetchImpl(url,{method:request.method,credentials:"omit",redirect:"error",signal:AbortSignal.timeout(12000),
      headers:{Accept:body?"application/json":"text/html",...(body?{"Content-Type":form?"application/x-www-form-urlencoded; charset=UTF-8":"application/json; charset=utf-8","X-Requested-With":"XMLHttpRequest"}:{} )},
      ...(body?{body:form?new URLSearchParams(body).toString():JSON.stringify(body)}:{})});
    const bytes=Buffer.from(await response.arrayBuffer());if(bytes.length>2*1024*1024)throw new Error("LIQUIDSPACE_RESPONSE_TOO_LARGE");
    const receipt={schema:"outsider/liquidspace-buyer-source/v1",request,requestHash:digest(request),status:response.status,sourceHash:digest(bytes),bytes:bytes.length,
      observedAt:new Date().toISOString(),elapsedMs:Date.now()-start,sourceBindings,anonymousBuyer,transactionSubmitted:false,capacityReserved:false,responsibilityAccepted:false};
    await onReceipt(receipt,bytes);let data=null;try{data=JSON.parse(bytes)}catch{}
    return {receipt,data,text:body?null:bytes.toString(),state:response.status===200?"OBSERVED":"SOURCE_READ_FAILED"};
  }
  function reservationDetails({venueId,workspaceId,localStartDate,localEndDate}) {
    if(!/^sha256:[a-f0-9]{64}$/u.test(sourceBindings.costImplementationHash??""))throw new Error("LIQUIDSPACE_COST_SOURCE_REQUIRED");
    const minutes=(Date.parse(`${localEndDate}Z`)-Date.parse(`${localStartDate}Z`))/60000;
    if(![venueId,workspaceId].every(id=>/^[a-f0-9-]{36}$/iu.test(id??""))||!Number.isFinite(minutes)||minutes<30||minutes>720
      ||localStartDate.slice(0,10)!==localEndDate.slice(0,10))throw new Error("LIQUIDSPACE_COST_INPUT_INVALID");
    return {discriminator:"HourlyReservationDetails",startDate:localStartDate.slice(0,10),startTime:localStartDate.slice(11),durationMinutes:minutes};
  }
  return {
    async search({city,latitude,longitude,localStartDate,localEndDate,minimumSeats,maximumSeats}) {
      const located=latitude!=null||longitude!=null;
      if(typeof city!=="string"||!city.trim()||city.length>100||(located&&(![latitude,longitude].every(Number.isFinite)||Math.abs(latitude)>90||Math.abs(longitude)>180)))throw new Error("LIQUIDSPACE_QUERY_INVALID");
      const minutes=(Date.parse(`${localEndDate}Z`)-Date.parse(`${localStartDate}Z`))/60000;
      if(!Number.isFinite(minutes)||minutes<30||minutes>720)throw new Error("LIQUIDSPACE_WINDOW_INVALID");
      const page=await read("BUYER_SEARCH_BOOTSTRAP","https://liquidspace.com/search");
      if(page.state!=="OBSERVED")return page;
      const template=parseLiquidSpaceSearchPage(page.text);
      // Publisher's typed-address search supports null coordinates. It must not
      // depend on a different seller's location service to discover candidates.
      return read("SEARCH_WORKSPACES","https://liquidspace.com/search/GetWorkspaces",{...template,Address:city,Latitude:latitude??null,Longitude:longitude??null,IsFullTextSearch:!located,
        IsCurrentLocationSearch:false,StartTime:localStartDate.slice(0,10),ReservationStart:localStartDate.slice(11),ReservationLengthMinutes:minutes,
        WorkspaceCapacity:minimumSeats,WorkspaceMaxCapacity:maximumSeats,VenueId:null,VenueGroupId:null,loggedInUserId:null});
    },
    availability({venueId,day}) {
      if(!/^[a-f0-9-]{36}$/iu.test(venueId??"")||!/^\d{4}-\d\d-\d\d$/u.test(day??""))throw new Error("LIQUIDSPACE_AVAILABILITY_INPUT_INVALID");
      return read("VENUE_AVAILABILITY","https://liquidspace.com/Venues/WorkspacesLandingPageCalculateAvailability",{venueId,startDate:`${day}T00:00:00`},true);
    },
    calculateCost({venueId,workspaceId,localStartDate,localEndDate}) {
      return read("CALCULATE_RESERVATION_COST","https://liquidspace.com/api/Costs/calculate",{venueId,workspaceId,
        reservationDetails:reservationDetails({venueId,workspaceId,localStartDate,localEndDate})});
    },
    prerequisites(input) {
      const {discriminator,...details}=reservationDetails(input);
      return read("VALIDATE_BOOKING_PREREQUISITES","https://liquidspace.com/api/booking/prerequisites/validate",
        {discriminator:"NEW",venueId:input.venueId,workspaceId:input.workspaceId,...details});
    },
    checkBookingAvailability(input) {
      const details=reservationDetails(input);
      return read("VALIDATE_BOOKING_AVAILABILITY",`https://liquidspace.com/api/venues/${input.venueId}/workspaces/${input.workspaceId}/availability/check`,
        {reservationDetails:details});
    },
  };
}
