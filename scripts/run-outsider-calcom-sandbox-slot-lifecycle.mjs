#!/usr/bin/env node
// One bounded hold on the event published by the official Cal.com Sandbox.
// No booking, attendee, invitation, credential, custom duration, or payment.
import { createHash, randomBytes } from "node:crypto";
import { chmodSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalizeStrict } from "../src/canonical.js";
import { createCalComSlotReservationAdapter, CALCOM_SLOT_RESERVATION_PROTOCOL } from "../src/outsider-calcom-slot-reservation-adapter.js";

const project = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const args = process.argv.slice(2);
if (args.some((arg) => !["--reserve-official-sandbox"].includes(arg))) {
  throw new Error("Only --reserve-official-sandbox is accepted; target and duration cannot be overridden.");
}
const effectEnabled = args.includes("--reserve-official-sandbox");
const startedAt = new Date().toISOString();
const runId = `${startedAt.replace(/[:.]/gu, "-")}-${randomBytes(5).toString("hex")}`;
const directory = path.join(project, ".outsider/private/calcom-slot-lifecycle", runId);
mkdirSync(directory, { recursive: true, mode: 0o700 }); chmodSync(directory, 0o700);
const digest = (bytes) => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
const store = (name, value) => {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(canonicalizeStrict(value));
  writeFileSync(path.join(directory, name), bytes, { flag: "wx", mode: 0o600 });
  return { name, bytes: bytes.length, sha256: digest(bytes) };
};
const events = [];
const networkCalls = [];
function event(type, detail) {
  const value = { type, observedAt: new Date().toISOString(), ...detail };
  events.push(value); store(`event-${String(events.length).padStart(3, "0")}.json`, value);
  console.log(JSON.stringify(value));
}
async function fetchTracked(url, init = {}) {
  const item = { method: init.method ?? "GET", url: String(url), startedAt: new Date().toISOString() };
  networkCalls.push(item);
  try {
    const response = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(55_000), ...init });
    item.status = response.status; item.responseHeadersAt = new Date().toISOString();
    return response;
  } catch (error) {
    item.transportError = error.name; item.endedAt = new Date().toISOString(); throw error;
  }
}
async function publicSource(url, name) {
  const response = await fetchTracked(url);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > 4 * 1024 * 1024) throw new Error("PUBLIC_SOURCE_TOO_LARGE");
  const source = { url, observedAt: new Date().toISOString(), status: response.status,
    providerDate: response.headers.get("date"), contentType: response.headers.get("content-type"),
    bodyBase64: bytes.toString("base64") };
  const receipt = store(name, source);
  if (response.status !== 200) throw new Error(`PUBLIC_SOURCE_STATUS_${response.status}`);
  return { text: bytes.toString("utf8"), receipt };
}
const result = { runId, startedAt, effectEnabled, eventTypeId: 6,
  protocol: CALCOM_SLOT_RESERVATION_PROTOCOL, bookingCount: 0, invitationCount: 0,
  paymentCount: 0, ownerAdoptionEstablished: false, serviceExecutionPromised: false,
  status: "STARTED" };
let adapter; let reservation; let program; let permissionGrantHash;
try {
  // Reconfirm that the fixed target is still published in the official
  // Sandbox's current client bundle; stop rather than select another owner.
  const demo = await publicSource("https://demo.cal.com/api-slots", "official-sandbox-page.json");
  if (!demo.text.includes("Cal.com Sandbox") || !demo.text.includes("ApiSlotsDemo")) {
    throw new Error("OFFICIAL_SANDBOX_NOT_CONFIRMED");
  }
  const assets = [...new Set([...demo.text.matchAll(/<script src="([^"]+)"/gu)]
    .map((match) => match[1]))];
  let confirmed = null;
  for (const asset of assets.filter((value) => value.includes("/_next/static/chunks/")).reverse()) {
    const module = await publicSource(new URL(asset, "https://demo.cal.com").href,
      `official-client-${assets.indexOf(asset)}.json`);
    if (/\["eventTypeId",String\(6\)\]/u.test(module.text) && module.text.includes("/api/slots?")) {
      confirmed = module.receipt; break;
    }
  }
  if (!confirmed) throw new Error("OFFICIAL_SANDBOX_EVENT_6_NOT_CONFIRMED");
  result.sandboxSource = { page: demo.receipt, client: confirmed,
    review: "Single default-duration hold on official published demo event, immediately released; no booking." };
  permissionGrantHash = digest(canonicalizeStrict(result.sandboxSource));
  adapter = createCalComSlotReservationAdapter({ directory: path.join(directory, "adapter"),
    eventTypeId: 6, requestTimeoutMs: 55_000, fetchImpl: fetchTracked });
  const from = new Date(Date.now() + 3 * 86400_000); from.setUTCHours(0, 0, 0, 0);
  const until = new Date(from.getTime() + 7 * 86400_000);
  const available = await adapter.discover({ start: from.toISOString(), end: until.toISOString() });
  event("AVAILABILITY_OBSERVED", { status: available.status, slotCount: available.slots?.length ?? 0,
    providerReceipt: available.providerReceipt });
  if (available.status !== "OBSERVED" || !available.slots.length) throw new Error("NO_AVAILABLE_SANDBOX_SLOT");
  const selected = available.slots[0]; result.selectedSlot = selected;
  if (!effectEnabled) result.status = "READ_ONLY_READY";
  else {
    const requirement = { requirementId: "official-demo-slot", capability: "RESOURCE_TIME_SLOT_HOLD",
      constraints: { eventTypeId: 6, slotStart: selected.start,
        slotDuration: (Date.parse(selected.end) - Date.parse(selected.start)) / 60_000 } };
    program = { programHash: digest(canonicalizeStrict({ runId, requirement })),
      formationDeadline: new Date(Date.now() + 120_000).toISOString(),
      completionDeadline: new Date(Date.now() + 300_000).toISOString() };
    const context = { program, requirement, operationId: "official-demo-one-hold", permissionGrantHash };
    store("operation-context.json", context);
    reservation = await adapter.reserve(context);
    event("RESERVE_RESULT", reservation);
    if (reservation.status === "RESERVED") {
      result.reservationUid = reservation.adapterState.reservationUid;
      result.providerValidUntil = reservation.validUntil;
      const readback = await adapter.readReservation({ reservation });
      event("RESERVATION_READBACK", readback);
      result.readbackStatus = readback.status;
      result.status = "RESERVATION_RECEIPT_OBSERVED";
    } else if (reservation.ambiguous) {
      result.reconciliation = await adapter.reconcileReserve(context);
      event("AMBIGUOUS_RESERVE_RECONCILIATION", result.reconciliation);
      result.status = "AMBIGUOUS_RESERVE_NO_RETRY";
    } else result.status = "RESERVATION_UNAVAILABLE";
  }
} catch (error) {
  result.error = { name: error.name, message: error.message };
  result.status = "INCOMPLETE";
  event("RUN_ERROR", result.error);
} finally {
  if (reservation?.status === "RESERVED") {
    try {
      const released = await adapter.release({ reservation, program, requirementId: "official-demo-slot",
        operationId: "official-demo-one-release", permissionGrantHash });
      event("RELEASE_RESULT", released); result.releaseStatus = released.status;
      const final = await adapter.readReservation({ reservation });
      event("FINAL_UID_READ", final); result.finalUidReason = final.reason ?? null;
      if (released.status === "RELEASED" && final.reason === "RESERVATION_NOT_CURRENT") {
        result.status = result.readbackStatus === "RESERVED"
          ? "NATIVE_SANDBOX_HOLD_LIFECYCLE_COMPLETE" : "HOLD_RELEASED_READBACK_INCOMPLETE";
      }
    } catch (error) {
      result.releaseError = { name: error.name, message: error.message };
      result.status = "RELEASE_UNCONFIRMED"; event("RELEASE_ERROR", result.releaseError);
    }
  }
  store("network-calls.json", networkCalls);
  const inventory = (root) => readdirSync(root).flatMap((name) => {
    const file = path.join(root, name); const stat = statSync(file);
    return stat.isDirectory() ? inventory(file) : [{ path: path.relative(directory, file),
      bytes: stat.size, sha256: digest(readFileSync(file)), mode: (stat.mode & 0o777).toString(8) }];
  });
  result.endedAt = new Date().toISOString();
  result.networkCounts = Object.fromEntries(["GET", "POST", "DELETE"].map((method) =>
    [method, networkCalls.filter((item) => item.method === method).length]));
  result.sourceFiles = inventory(directory); result.totalBytes = result.sourceFiles.reduce((n, f) => n + f.bytes, 0);
  const manifest = store("manifest.json", result);
  console.log(JSON.stringify({ directory, status: result.status, manifest, networkCounts: result.networkCounts }));
}
