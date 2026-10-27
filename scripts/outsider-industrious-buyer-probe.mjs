import path from "node:path";
import { mkdirSync, existsSync } from "node:fs";
import { readPrivateExecutionBytes, writePrivateExecutionRecordOnce as writeOnce } from "../src/outsider-user-held-durable-execution-v2.js";
import { createIndustriousBuyerDiscoveryAdapter } from "../src/outsider-industrious-buyer-discovery-adapter.js";
import { interfaceDigest } from "../src/outsider-openapi-demand-matcher.js";
const [directory, requestFile] = process.argv.slice(2), read = f => JSON.parse(readPrivateExecutionBytes(f));
if (![directory, requestFile].every(p => path.isAbsolute(p ?? ""))) throw new Error("BUYER_PROBE_PATH_INVALID");
mkdirSync(directory, { recursive: true, mode: 0o700 });
const request = read(requestFile), resultFile = path.join(directory, "result.json");
writeOnce(path.join(directory, "request.json"), request);
if (existsSync(resultFile)) { const prior = read(resultFile); console.log(JSON.stringify({ replayed: true, state: prior.state, receipt: prior.receipt })); }
else {
  const load = file => { const manifest = read(file), base = path.dirname(file);
    const bytes = Buffer.concat(manifest.chunks.map(n => Buffer.from(read(path.join(base, `${n}.json`)).base64, "base64")));
    if (manifest.status !== 200 || interfaceDigest(bytes) !== manifest.sourceHash) throw new Error("BUYER_IMPLEMENTATION_REPLAY_MISMATCH");
    return { manifest, text: bytes.toString("utf8") }; };
  const config = load(request.configurationSource), implementation = load(request.implementationSource);
  if (!config.text.includes('NEXT_PUBLIC_INVENTORY_API_URL:"https://api-gateway.industriousoffice.com/inventory/v1.1.0"')
    || !config.text.includes('NEXT_PUBLIC_PRICING_API_URL:"https://api-gateway.industriousoffice.com/pricing/v1.1.0"')) throw new Error("BUYER_PUBLIC_CONFIGURATION_CHANGED");
  const adapter = createIndustriousBuyerDiscoveryAdapter({ sourceBindings: { configurationHash: config.manifest.sourceHash,
    discoveryImplementationHash: implementation.manifest.sourceHash }, onReceipt: (receipt, bytes) => {
      const chunks = []; for (let offset = 0; offset < bytes.length; offset += 384 * 1024) {
        const name = `response-${chunks.length}`; chunks.push(name); writeOnce(path.join(directory, `${name}.json`), { base64: bytes.subarray(offset, offset + 384 * 1024).toString("base64") }); }
      writeOnce(path.join(directory, "source.json"), { ...receipt, chunks });
    } });
  const methods = { SEARCH_LOCATIONS: "searchLocations", READ_LOCATION: "location", READ_MEETING_ROOM: "meetingRoom",
    SEARCH_MEETING_ROOMS: "searchMeetingRooms", DAY_PASS_PRICE_PREVIEW: "coworkingDayPassPreview",
    MEETING_ROOM_AVAILABILITY: "meetingRoomAvailability",
    MEETING_ROOM_PRICE_DISCOVERY: "meetingRoomPrices", MEETING_ROOM_PRICE_PREVIEW: "meetingRoomPreview" };
  const method = methods[request.operation]; if (!method) throw new Error("BUYER_OPERATION_UNSUPPORTED");
  const requiredPath = { SEARCH_LOCATIONS: "/discovery/locations/all?responseType=", READ_LOCATION: "/discovery/locations/", READ_MEETING_ROOM: "/discovery/meeting-rooms/",
    SEARCH_MEETING_ROOMS: "/discovery/meeting-rooms/search", DAY_PASS_PRICE_PREVIEW: "/coworking-day-pass/preview",
    MEETING_ROOM_AVAILABILITY: "/search-availabilities",
    MEETING_ROOM_PRICE_DISCOVERY: "/discovery/meeting-rooms", MEETING_ROOM_PRICE_PREVIEW: "/preview" }[request.operation];
  if (!implementation.text.includes(requiredPath)) throw new Error("BUYER_OPERATION_SOURCE_MISSING");
  const result = await adapter[method](request.input); writeOnce(resultFile, result);
  console.log(JSON.stringify({ state: result.state, receipt: result.receipt, dataShape: Array.isArray(result.data) ? { rows: result.data.length, fields: Object.keys(result.data[0] ?? {}) } : { fields: Object.keys(result.data ?? {}) } }));
}
