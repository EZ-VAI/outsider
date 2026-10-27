import {privateExecutionRecordExists as existsSync} from './outsider-user-held-durable-execution-v2.js';
/* Task-scoped native resource observations. These are price previews, not offers
 * or reservation authority, and cannot enter the execution/commitment path. */
import path from "node:path";
import { mkdirSync } from "node:fs";
import { interfaceDigest as digest } from "./outsider-openapi-demand-matcher.js";
import { readPrivateExecutionBytes, writePrivateExecutionRecordOnce as writeOnce } from "./outsider-user-held-durable-execution-v2.js";
import { createIndustriousBuyerDiscoveryAdapter } from "./outsider-industrious-buyer-discovery-adapter.js";
import { discoverMarketplaceResourceCandidates, prepareMarketplaceTransaction } from "./outsider-marketplace-resource-candidates.js";
import {buildLiquidSpaceHourlyOrder,createLiquidSpaceReservationLifecycle} from "./outsider-liquidspace-reservation-lifecycle.js";
import { validateOpenResourceDemand } from "./outsider-open-resource-demand-graph.js";
const read = file => JSON.parse(readPrivateExecutionBytes(file));
const fail = code => { throw Object.assign(new Error(code), { code }); };

export function loadNativeBuyerSources(profileFile) {
  const profile = read(profileFile), sources = {};
  for (const key of ["configuration", "locations", "rooms", "preview"]) {
    const file = profile[key], manifest = read(file);
    const bytes = Buffer.concat(manifest.chunks.map(name => Buffer.from(read(path.join(path.dirname(file), `${name}.json`)).base64, "base64")));
    const url = new URL(manifest.url ?? manifest.sourceUrl);
    if (manifest.status !== 200 || digest(bytes) !== manifest.sourceHash || url.origin !== "https://www.industriousoffice.com") fail("RESOURCE_QUOTE_SOURCE_REPLAY_FAILED");
    sources[key] = { hash: manifest.sourceHash, text: bytes.toString("utf8") };
  }
  if (!sources.configuration.text.includes('NEXT_PUBLIC_INVENTORY_API_URL:"https://api-gateway.industriousoffice.com/inventory/v1.1.0"')
    || !sources.configuration.text.includes('NEXT_PUBLIC_PRICING_API_URL:"https://api-gateway.industriousoffice.com/pricing/v1.1.0"')
    || !sources.locations.text.includes("/discovery/locations/all?responseType=")
    || !sources.rooms.text.includes("/discovery/meeting-rooms/search")
    || !sources.preview.text.includes("/search-availabilities") || !sources.preview.text.includes("/preview")) fail("RESOURCE_QUOTE_SOURCE_OPERATION_MISSING");
  return Object.fromEntries(Object.entries(sources).map(([k,v]) => [k,v.hash]));
}

export function createNativeResourceQuoteService({ directory, inspectExploration, sources, marketplaceSources, buyerConnection, fetchImpl, adapterFactory = createIndustriousBuyerDiscoveryAdapter }) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const pending = new Map(); let closing = false;
  const rootFor = id => { if (!/^quote_[a-f0-9]{32}$/u.test(id ?? "")) fail("RESOURCE_QUOTE_ID_INVALID"); return path.join(directory, id); };
  const inspect = id => {
    const root = rootFor(id);
    if (existsSync(path.join(root,"result.json"))) return read(path.join(root,"result.json"));
    if (!existsSync(path.join(root,"request.json"))) fail("RESOURCE_QUOTE_NOT_FOUND");
    return { quoteId:id, state:pending.has(id) ? "READING_RESOURCES" : "INTERRUPTED", confirmationAvailable:false };
  };
  const validate = (request, formation = false) => {
    const originKey = formation ? "formationRef" : "explorationId";
    const expected = ["city", originKey, "localEndDate", "localStartDate", "maximumSeats", "minimumSeats", "requestId", "resourceKind"].sort().join(",");
    if (!request || Object.keys(request).sort().join(",") !== expected
      || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(request.requestId ?? "") || (!formation && !/^explore_[a-f0-9]{32}$/u.test(request.explorationId ?? ""))
      || typeof request.city !== "string" || !request.city.trim() || request.city.length > 100
      || ![request.minimumSeats,request.maximumSeats].every(x => Number.isInteger(x) && x > 0 && x <= 100)
      || request.minimumSeats > request.maximumSeats) fail("RESOURCE_QUOTE_REQUEST_INVALID");
    for (const field of ["localStartDate","localEndDate"]) {
      const value = request[field];
      if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d:00$/u.test(value ?? "") || !Number.isFinite(Date.parse(`${value}Z`))
        || new Date(`${value}Z`).toISOString().slice(0,19) !== value) fail("RESOURCE_QUOTE_WINDOW_INVALID");
    }
    const hours = (Date.parse(`${request.localEndDate}Z`) - Date.parse(`${request.localStartDate}Z`)) / 3600000;
    if (hours <= 0 || hours > 12 || request.localStartDate.slice(0,10) !== request.localEndDate.slice(0,10)) fail("RESOURCE_QUOTE_WINDOW_INVALID");
    return hours;
  };
  async function collect(request, root, quoteId, parent, hours) {
    const start = Date.now(), receipts = [], offers = [];
    const base = { schema:"outsider/native-resource-quotes/v1", quoteId, request,
      ...(request.formationRef ? { formationRef:request.formationRef, formationSourceHash:digest(parent.result) } : { explorationResultHash:digest(parent.result) }),
      financialMode:"SIMULATION_ONLY", confirmationAvailable:false, transactionSubmitted:false, capacityReserved:false,
      responsibilityAccepted:false, signedOffer:null, independentRecoveryAvailable:false, independentWitnessAvailable:false };
    const finish = (state, reason) => {
      const result = { ...base, state, reason, quotes:offers, receipts, sourceBindings:sources, elapsedMs:Date.now()-start,
        apiCalls:receipts.length, bytes:receipts.reduce((n,r)=>n+r.bytes,0) };
      writeOnce(path.join(root,"result.json"),result); return result;
    };
    if (request.resourceKind !== "MEETING_SPACE") return finish("UNAVAILABLE","NO_NATIVE_ADAPTER_FOR_RESOURCE_KIND");
    const candidates = parent.result?.transactionCandidates?.candidates ?? [];
    const candidate = candidates.find(c => { try { return c.kind === "RESOURCE_SELLER" && new URL(c.sourceUrl).hostname === "www.industriousoffice.com"; } catch { return false; } });
    if(candidate)base.discoveredSellerSource = { url:candidate.sourceUrl, hash:candidate.sourceHash??null, requirementIds:candidate.requirementIds??[] };
    const record = (receipt, bytes) => {
        const index = receipts.length; receipts.push(receipt);
        const chunks = [];
        for (let offset=0; offset<bytes.length; offset+=384*1024) {
          const name = `source-${index}-chunk-${chunks.length}`; chunks.push(name);
          writeOnce(path.join(root,`${name}.json`),{base64:bytes.subarray(offset,offset+384*1024).toString("base64")});
        }
        writeOnce(path.join(root,`source-${index}.json`),{...receipt,chunks});
      };
    const make = implementation => adapterFactory({ fetchImpl, sourceBindings:{ configurationHash:sources.configuration, discoveryImplementationHash:sources[implementation] },onReceipt:record });
    const locationApi = make("locations"), roomApi = make("rooms"), previewApi = make("preview");
    const primary = (async()=>{try {
      if(!candidate)fail("NO_DISCOVERED_SUPPORTED_SELLER");
      if(hours<2||hours*2!==Math.round(hours*2))fail("PROVIDER_MINIMUM_TWO_HOURS_HALF_HOUR_SLOTS");
      const locations = await locationApi.searchLocations({text:request.city,limit:3});
      if (locations.state !== "OBSERVED" || !Array.isArray(locations.data)) fail("LOCATION_READ_FAILED");
      const center = locations.data.find(l=>Number.isFinite(l.geolocalization?.lat) && Number.isFinite(l.geolocalization?.lng));
      if (!center) fail("NO_LOCATION_FOUND");
      const nearTo = {latitude:center.geolocalization.lat,longitude:center.geolocalization.lng};
      const within = { northEastPoint:{latitude:Math.min(90,nearTo.latitude+.015),longitude:Math.min(180,nearTo.longitude+.02)},
        southWestPoint:{latitude:Math.max(-90,nearTo.latitude-.015),longitude:Math.max(-180,nearTo.longitude-.02)} };
      base.searchScope = {city:request.city,within,locationCount:locations.data.length,coverage:"BOUNDED_AREA_NOT_ALL_CITY_OR_WORLD"};
      const dateRange = {localStartDate:request.localStartDate,localEndDate:request.localEndDate};
      const rooms = await roomApi.searchMeetingRooms({within,nearTo,seats:[{min:request.minimumSeats,max:request.maximumSeats}],dateRange});
      if (rooms.state !== "OBSERVED" || !Array.isArray(rooms.data)) fail("ROOM_SEARCH_FAILED");
      base.discoveredRoomCount = rooms.data.length;
      const selected = rooms.data.filter(r => r.seats >= request.minimumSeats && r.seats <= request.maximumSeats).slice(0,2);
      await Promise.allSettled(selected.map(async room => {
        const checks = await Promise.allSettled([
          roomApi.meetingRoom(room.slug), previewApi.meetingRoomPreview({resourceSlug:room.slug,duration:{type:"Hour",value:hours},...dateRange}),
          previewApi.meetingRoomAvailability({id:room.id,day:request.localStartDate.slice(0,10)})]);
        if(checks.some(r=>r.status!=="fulfilled"))return;
        const [detail,price,availability]=checks.map(r=>r.value);
        const d=detail.data,p=price.data;
        const available = availability.state === "OBSERVED" && Array.isArray(availability.data) && availability.data.some(w=>w.localStartDate<=request.localStartDate && w.localEndDate>=request.localEndDate);
        const validPrice = price.state === "OBSERVED" && [p?.priceAmount,p?.taxAmount,p?.totalPrice].every(x=>Number.isFinite(x)&&x>=0)
          && Math.abs(p.priceAmount+p.taxAmount-p.totalPrice)<.011 && /^[A-Z]{3}$/u.test(p.currencyIsoCode ?? "");
        const matched = detail.state === "OBSERVED" && d?.id === room.id && d.slug === room.slug && d.seats>=request.minimumSeats && d.seats<=request.maximumSeats;
        offers.push({ provider:"Industrious", resourceId:room.id, resourceSlug:room.slug, seats:room.seats, locationName:room.locationName,
          timezone:d?.locationTimezone ?? room.timezone ?? null, requestedWindow:dateRange,
          state:matched && d.isOnDemandBookable === true && available && validPrice ? "PRICE_AND_AVAILABILITY_OBSERVED" : "NOT_QUOTABLE",
          availabilityObserved:available, bookableAdvertised:matched && d.isOnDemandBookable === true,
          price:validPrice ? {kind:"PROVIDER_PRICE_PREVIEW",amount:p.priceAmount,tax:p.taxAmount,total:p.totalPrice,currency:p.currencyIsoCode,priceLocked:false,expiresAt:null} : null,
          bookingType:room.onDemandBookingType, capacityReserved:false, responsibilityAccepted:false,
          sourceHashes:[detail.receipt.sourceHash,price.receipt.sourceHash,availability.receipt.sourceHash],
          missing:["SIGNED_OFFER_AND_VALIDITY","CAPACITY_RESERVATION","RESPONSIBILITY_ACCEPTANCE"] });
      }));
      offers.sort((a,b)=>a.resourceSlug.localeCompare(b.resourceSlug));
    } catch(error) { base.primaryFailure=error.code??"NATIVE_RESOURCE_READ_FAILED"; }})();
    const marketplace=(async()=>{
      if(marketplaceSources) {
        try { base.marketplaceAlternatives=await discoverMarketplaceResourceCandidates({request,sources:marketplaceSources,fetchImpl,onReceipt:record}); }
        catch { base.marketplaceAlternatives={state:"UNAVAILABLE",reason:"MARKETPLACE_READ_FAILED",candidates:[]}; }
      }
    })();
    await Promise.all([primary,marketplace]);
    base.queryExecution="INDEPENDENT_CONCURRENT_BUYER_CHANNELS";
    const quoted=offers.some(o=>o.state==="PRICE_AND_AVAILABILITY_OBSERVED"),alternative=base.marketplaceAlternatives?.candidates.some(c=>c.availabilityObserved);
    return finish(quoted?"RESOURCE_QUOTES_OBSERVED_NOT_COMMITMENT":alternative?"RESOURCE_CANDIDATES_OBSERVED_NOT_COMMITMENT":"UNAVAILABLE",base.primaryFailure??"PRICE_PREVIEW_IS_NOT_LOCKED_CAPACITY");
  }
  return {
    inspect,
    async createFromFormation(request, formation) {
      const hours = validate(request, true), ref = request.formationRef;
      if (!ref || Object.keys(ref).sort().join(",") !== "graphHash,requirementId,taskRequestHash"
        || !/^sha256:[a-f0-9]{64}$/u.test(ref.taskRequestHash ?? "")
        || !validateOpenResourceDemand(formation?.graph) || digest(formation.graph) !== ref.graphHash
        || !formation.graph.requirements.some(n => n.id === ref.requirementId && n.capability === "MEETING_SPACE_BOOKING")
        || !Array.isArray(formation.publisherSources)) fail("RESOURCE_QUOTE_FORMATION_INVALID");
      const candidates = formation.publisherSources.map(source => ({ kind:"RESOURCE_SELLER", sourceUrl:source.url,
        sourceHash:source.sourceHash, requirementIds:[ref.requirementId] }));
      if (!candidates.length || candidates.some(c => {
        try { return !/^sha256:[a-f0-9]{64}$/u.test(c.sourceHash ?? "") || !["www.industriousoffice.com","liquidspace.com","www.liquidspace.com"].includes(new URL(c.sourceUrl).hostname); }
        catch { return true; }
      })) fail("RESOURCE_QUOTE_FORMATION_SOURCES_INVALID");
      const id = `quote_${digest(request.requestId).slice(7,39)}`, root = rootFor(id);
      const parent = { result: { graph:formation.graph, publisherSources:formation.publisherSources, transactionCandidates:{candidates} } };
      if (existsSync(path.join(root,"request.json"))) {
        if (digest(read(path.join(root,"request.json"))) !== digest(request)
          || digest(read(path.join(root,"formation-origin.json"))) !== digest(parent.result)) fail("RESOURCE_QUOTE_REQUEST_CONFLICT");
        return pending.get(id) ?? inspect(id);
      }
      if (closing || pending.size) fail("RESOURCE_QUOTE_BUSY");
      mkdirSync(root,{recursive:true,mode:0o700}); writeOnce(path.join(root,"request.json"),request);
      writeOnce(path.join(root,"formation-origin.json"),parent.result);
      const operation = collect(request,root,id,parent,hours); pending.set(id,operation);
      try { return await operation; } finally { pending.delete(id); }
    },
    connectionStatus(){return {provider:"LiquidSpace",configured:!!buyerConnection,sessionVerified:false,paymentAuthorized:false,
      transactionLifecycle:["SUBMIT","INSPECT","CANCEL"],transactionLifecycleLiveVerified:false};},
    async transact(input){
      if(!input||Object.keys(input).sort().join(",")!=="action,preparationId"||!["SUBMIT","INSPECT","CANCEL"].includes(input.action)
        ||!/^prepare_[a-f0-9]{32}$/u.test(input.preparationId??""))fail("RESOURCE_TRANSACTION_COMMAND_INVALID");
      if(!buyerConnection)fail("RESOURCE_TRANSACTION_BUYER_CONNECTION_REQUIRED");
      const root=path.join(directory,input.preparationId),prepared=read(path.join(root,"result.json"));
      const lifecycleDirectory=path.join(root,"reservation");
      const bindingFile=path.join(lifecycleDirectory,"binding.json");
      // Existing booking identity survives changes to account/profile defaults.
      const order=existsSync(bindingFile)?read(bindingFile).request:buildLiquidSpaceHourlyOrder({preparation:prepared,
        organizerId:buyerConnection.organizerId,paymentMethod:buyerConnection.paymentMethod});
      const lifecycle=createLiquidSpaceReservationLifecycle({directory:lifecycleDirectory,sourceHash:marketplaceSources.costImplementationHash,
        request:order,authorizedFetch:buyerConnection.fetch,authorize:buyerConnection.authorize});
      if(closing||pending.size)fail("RESOURCE_QUOTE_BUSY");
      const operation=lifecycle[input.action.toLowerCase()]();pending.set(input.preparationId,operation);
      try{return await operation;}finally{pending.delete(input.preparationId);}
    },
    async prepareTransaction(input) {
      if(!input||Object.keys(input).sort().join(",")!=="quoteId,requestId,resourceId"
        || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(input.requestId??""))fail("RESOURCE_TRANSACTION_REQUEST_INVALID");
      const quote=inspect(input.quoteId),candidate=quote.marketplaceAlternatives?.candidates.find(c=>c.resourceId===input.resourceId);
      if(!candidate||!marketplaceSources?.costImplementationHash)fail("RESOURCE_TRANSACTION_CANDIDATE_NOT_FOUND");
      const id=`prepare_${digest(input.requestId).slice(7,39)}`,root=path.join(directory,id),file=path.join(root,"request.json");
      if(existsSync(file)) {
        if(digest(read(file))!==digest(input))fail("RESOURCE_TRANSACTION_REQUEST_CONFLICT");
        if(pending.has(id))return pending.get(id);
        if(existsSync(path.join(root,"result.json")))return read(path.join(root,"result.json"));
        fail("RESOURCE_TRANSACTION_INTERRUPTED_USE_NEW_REQUEST_ID");
      }
      if(closing||pending.size)fail("RESOURCE_QUOTE_BUSY");
      mkdirSync(root,{recursive:true,mode:0o700});writeOnce(file,input);
      const operation=(async()=>{
        const started=Date.now(),receipts=[];
        const result=await prepareMarketplaceTransaction({candidate,sources:marketplaceSources,fetchImpl:buyerConnection?.fetch??fetchImpl,anonymousBuyer:!buyerConnection,onReceipt(receipt,bytes){
          const index=receipts.length;receipts.push(receipt);const chunks=[];
          for(let offset=0;offset<bytes.length;offset+=384*1024){const name=`source-${index}-chunk-${chunks.length}`;chunks.push(name);writeOnce(path.join(root,`${name}.json`),{base64:bytes.subarray(offset,offset+384*1024).toString("base64")});}
          writeOnce(path.join(root,`source-${index}.json`),{...receipt,chunks});
        }});
        const prepared={...result,preparationId:id,quoteId:input.quoteId,quoteHash:digest(quote),receipts,elapsedMs:Date.now()-started,
          apiCalls:receipts.length,bytes:receipts.reduce((sum,r)=>sum+r.bytes,0)};
        writeOnce(path.join(root,"result.json"),prepared);return prepared;
      })();pending.set(id,operation);
      try{return await operation;}finally{pending.delete(id);}
    },
    async create(request) {
      const hours = validate(request), id = `quote_${digest(request.requestId).slice(7,39)}`, root=rootFor(id);
      if (existsSync(path.join(root,"request.json"))) {
        if (digest(read(path.join(root,"request.json"))) !== digest(request)) fail("RESOURCE_QUOTE_REQUEST_CONFLICT");
        return pending.get(id) ?? inspect(id);
      }
      if (closing || pending.size) fail("RESOURCE_QUOTE_BUSY");
      const parent = await inspectExploration(request.explorationId);
      if (parent.state !== "FRONTIER_READY") fail("RESOURCE_QUOTE_EXPLORATION_NOT_READY");
      mkdirSync(root,{recursive:true,mode:0o700}); writeOnce(path.join(root,"request.json"),request);
      const operation = collect(request,root,id,parent,hours); pending.set(id,operation);
      try { return await operation; } finally { pending.delete(id); }
    },
    async close() { closing=true; await Promise.allSettled(pending.values()); },
  };
}
