/* Source-backed capability descriptions for bounded READ-ONLY report goals.
 * A successful discovery is not a reservation, completed future report, owner
 * adoption, or an independent witness. The existing strict runtime must still
 * form its required routes before it can execute a compiled proposal.
 */
import { createHash } from "node:crypto";
import { canonicalizeStrict } from "./canonical.js";
import { createCalComSlotReservationAdapter, CALCOM_SLOT_RESERVATION_PROTOCOL }
  from "./outsider-calcom-slot-reservation-adapter.js";
import { createOpcUaResourceNode } from "./outsider-opcua-resource-node.js";
import path from "node:path";

const SCHEMA = "outsider/observation-capability-catalog/v1";
const HASH = /^sha256:[a-f0-9]{64}$/u;
const digest = value => `sha256:${createHash("sha256").update(canonicalizeStrict(value)).digest("hex")}`;
const fail = code => { throw new TypeError(`OUTSIDER_OBSERVATION_CATALOG_${code}`); };
function instant(value) {
  if (typeof value !== "string" || !/(?:Z|[+-]\d{2}:\d{2})$/u.test(value)
    || !Number.isFinite(Date.parse(value))) fail("TIMESTAMP_INVALID");
  return new Date(value).toISOString();
}
function positive(value) {
  if (!Number.isSafeInteger(value) || value < 1) fail("POSITIVE_INTEGER_REQUIRED");
  return value;
}
function sourceReference(input, sourceClass, observedAt) {
  if (!HASH.test(input?.sourceHash ?? "") || input.sourceClass !== sourceClass) fail("SOURCE_INVALID");
  const recordedAt = instant(input.observedAt);
  if (Date.parse(recordedAt) > Date.parse(observedAt)) fail("SOURCE_FROM_FUTURE");
  return { sourceHash: input.sourceHash, sourceClass, observedAt: recordedAt };
}
function boundary() {
  return { readOnly: true, providerCapacityReserved: false, bookingPerformed: false,
    physicalActuationPerformed: false, independentWitnessAdopted: false,
    commercialCommitmentIssued: false, paymentPerformed: false };
}

/** Build descriptions from native source receipts, never from planner effects. */
export function createObservationCapabilityCatalog(input = {}) {
  const observedAt = instant(input.observedAt), expiresAt = instant(input.expiresAt);
  const lifetime = Date.parse(expiresAt) - Date.parse(observedAt);
  if (lifetime < 1 || lifetime > 300_000) fail("LIFETIME_EXCEEDS_FIVE_MINUTES");
  const actions = [], requirements = [], actionBindings = {}, semanticTargets = [], sources = [];
  const finalWitnessRequirementId = "source_report_independent_witness";

  function add({ actionId, capability, targetId, predicateId, description, constraints, source }) {
    const effect = { predicateId, valueType: "boolean", value: true };
    actions.push({ actionId, capability, preconditions: [], effects: [effect],
      durationMs: 15_000, costMinor: "0", resourceClaims: [],
      failureDomainRefs: [constraints.sourceFailureDomain] });
    for (const role of ["PRIMARY", "RECOVERY"]) requirements.push({
      requirementId: `${actionId}_${role.toLowerCase()}`, role, capability,
      constraints: { ...constraints, formationStatus: "DECLARED_NOT_RESERVED",
        sourceEvidenceHash: source.sourceHash, acquireFreshEvidenceAtExecution: true,
        reportMustIncludeObservedAt: true, discoveryIsFutureReport: false,
        costBasis: "AUTHORIZED_READ_AND_LOCAL_REPORT_ONLY_EXTERNAL_WITNESS_UNPRICED" },
      minimumReservationMs: 60_000, dependsOnRequirementIds: [],
    });
    actionBindings[actionId] = { primaryRequirementId: `${actionId}_primary`,
      recoveryRequirementId: `${actionId}_recovery`, witnessRequirementId: finalWitnessRequirementId,
      input: { reportKind: targetId, sourceClass: source.sourceClass,
        sourceEvidenceHash: source.sourceHash, ...boundary() } };
    semanticTargets.push({ targetId, description,
      predicates: [{ ...effect, operator: "EQ" }] });
    sources.push(source);
  }

  if (input.calcom) {
    const item = input.calcom, eventTypeId = positive(item.eventTypeId);
    // This first public catalog is explicitly the official sandbox, not an
    // arbitrary calendar owner or an invitation to make a booking.
    if (eventTypeId !== 6) fail("CALCOM_OFFICIAL_SANDBOX_EVENT_REQUIRED");
    const start = instant(item.start), end = instant(item.end);
    if (Date.parse(end) <= Date.parse(start)
      || Date.parse(end) - Date.parse(start) > 7 * 86_400_000) fail("CALCOM_WINDOW_INVALID");
    const timeZone = item.timeZone ?? "UTC";
    if (timeZone !== "UTC") fail("CALCOM_TIMEZONE_MUST_BE_UTC");
    const source = sourceReference(item.source, "CALCOM_PUBLIC_SANDBOX_AVAILABILITY", observedAt);
    add({ actionId: "read_calcom_sandbox_availability", capability: "CALCOM_AVAILABLE_SLOT_REPORT",
      targetId: "calcom_availability_report", predicateId: "calcom_availability_report_ready",
      description: "Produce a new timestamped report of the Cal.com public sandbox's advertised available slots in the configured window. Empty availability is a valid report. This does not reserve a slot, book a meeting, or promise future availability.",
      constraints: { eventTypeId, start, end, timeZone,
        sourceClass: source.sourceClass, sourceFailureDomain: "calcom_public_api",
        apiOrigin: CALCOM_SLOT_RESERVATION_PROTOCOL.apiOrigin,
        apiVersion: CALCOM_SLOT_RESERVATION_PROTOCOL.apiVersion,
        officialSourceUrl: "https://demo.cal.com/api-slots",
        operation: "GET /v2/slots", capacityReserved: false }, source });
  }
  if (input.opcua) {
    const item = input.opcua, endpoint = new URL(item.endpointUrl), official = new URL(item.officialSourceUrl);
    if (endpoint.protocol !== "opc.tcp:" || endpoint.username || endpoint.password
      || endpoint.search || endpoint.hash || official.protocol !== "https:"
      || official.username || official.password || !Array.isArray(item.nodeIds)
      || item.nodeIds.length < 1 || item.nodeIds.length > 16
      || new Set(item.nodeIds).size !== item.nodeIds.length
      || item.nodeIds.some(value => typeof value !== "string" || value.length > 512
        || !/^(?:ns=\d+;)?[isgb]=[^\r\n]+$/u.test(value))) fail("OPCUA_SOURCE_INVALID");
    const source = sourceReference(item.source, "SIMULATED_INDUSTRIAL_DEMO", observedAt);
    add({ actionId: "read_opcua_demo_telemetry", capability: "OPCUA_DEMO_TELEMETRY_REPORT",
      targetId: "opcua_demo_report", predicateId: "opcua_demo_report_ready",
      description: "Produce a new timestamped, quality-labelled report of readings from the configured public OPC UA simulated-device demo. This is not real factory hardware, physical readiness, device control, or independent evidence of completed work.",
      constraints: { endpointUrl: endpoint.href, officialSourceUrl: official.href,
        nodeIds: [...item.nodeIds], sourceClass: source.sourceClass,
        sourceFailureDomain: "opcua_public_demo", operations: ["READ"],
        physicalHardwareConnected: false }, source });
  }
  if (!actions.length) fail("AT_LEAST_ONE_NATIVE_SOURCE_REQUIRED");
  requirements.push({ requirementId: finalWitnessRequirementId, role: "INDEPENDENT_WITNESS",
    capability: "INDEPENDENT_SOURCE_BACKED_REPORT_OBSERVATION",
    constraints: { formationStatus: "DECLARED_NOT_RESERVED", independentOwnerAdopted: false,
      verifyFreshSourceAndReportIntegrity: true, independenceCannotBeInferredFromAdapterName: true },
    minimumReservationMs: 60_000, dependsOnRequirementIds: [] });
  const body = { schema: SCHEMA, observedAt, expiresAt,
    planningInput: { initialState: [], actions, resources: [] },
    programInput: { requirements, obligations: requirements.map(requirement => ({
      obligationId: `close_${requirement.requirementId}`, trigger: "ALWAYS",
      targetRequirementId: requirement.requirementId, nodeId: null,
      action: "CLOSE_READ_SESSION_AND_RELEASE_ANY_FORMED_LOCAL_EXECUTION_CLAIM",
      input: { reservationCurrentlyExists: false, sourceBytesRetainedPrivately: true },
      deadline: expiresAt,
    })), finalWitnessRequirementId },
    actionBindings, semanticTargets, sourceReferences: sources,
    executionReadiness: { ready: false, blockers: [
      "REPORT_EXECUTION_BINDINGS_NOT_REGISTERED",
      "PRIMARY_AND_RECOVERY_ROUTES_NOT_RESERVED",
      "INDEPENDENT_REPORT_WITNESS_NOT_ADOPTED_OR_PRICED",
    ] },
    planningAssumptions: { durationBasis: "ENGINEERING_BUDGET_NOT_SUPPLIER_ETA",
      amountCurrency: "USD", amountScope: "AUTHORIZED_READ_AND_LOCAL_REPORT_ONLY",
      externalWitnessCostIncluded: false, declaredEffectsAreEvidence: false },
    boundary: boundary(),
  };
  return { catalogId: digest(body), ...body };
}

/** Native, bounded read acquisition. No reservation/Write/Call is exposed. */
export async function acquireObservationCapabilityCatalog({ directory, calcom, opcua,
  clock = () => new Date().toISOString(), fetchImpl } = {}) {
  if (typeof directory !== "string" || !directory || (!calcom && !opcua)) fail("ACQUISITION_CONFIG_INVALID");
  const startedAt = instant(clock()), input = {}, acquisition = [];
  if (calcom) {
    if (calcom.eventTypeId !== 6) fail("CALCOM_OFFICIAL_SANDBOX_EVENT_REQUIRED");
    const adapter = createCalComSlotReservationAdapter({ eventTypeId: calcom.eventTypeId,
      directory: path.join(directory, "calcom"), clock, fetchImpl,
      requestTimeoutMs: 15_000 });
    const observation = await adapter.discover(calcom);
    if (observation.status !== "OBSERVED") fail("CALCOM_READ_UNAVAILABLE");
    input.calcom = { ...calcom, source: { sourceHash: observation.providerReceipt,
      sourceClass: "CALCOM_PUBLIC_SANDBOX_AVAILABILITY", observedAt: observation.observedAt } };
    acquisition.push({ family: "CALCOM", status: observation.status,
      slotCount: observation.slots.length, providerReceipt: observation.providerReceipt,
      observedAt: observation.observedAt, capacityReserved: false });
  }
  if (opcua) {
    const resource = createOpcUaResourceNode({ endpointUrl: opcua.endpointUrl,
      officialSourceUrl: opcua.officialSourceUrl, sourceClass: "SIMULATED_INDUSTRIAL_DEMO",
      transport: opcua.transport, directory: path.join(directory, "opcua"), clock });
    try {
      const observation = await resource.observe({ nodeIds: opcua.nodeIds, maxSamples: 1, intervalMs: 0 });
      const source = observation.sources[0];
      input.opcua = { endpointUrl: opcua.endpointUrl, officialSourceUrl: opcua.officialSourceUrl,
        nodeIds: [...opcua.nodeIds], source: { sourceHash: source.hash,
          sourceClass: observation.sourceClass, observedAt: source.observedAt } };
      acquisition.push({ family: "OPCUA", status: "OBSERVED",
        sampleCount: observation.samples.length,
        goodCount: observation.samples.filter(item => item.quality === "GOOD").length,
        providerReceipt: source.hash, observedAt: source.observedAt,
        decodedSourceBytes: source.bytes, physicalHardwareConnected: false });
    } finally { await resource.close(); }
  }
  const observedAt = instant(clock());
  const catalog = createObservationCapabilityCatalog({ ...input, observedAt,
    expiresAt: new Date(Date.parse(observedAt) + 300_000).toISOString() });
  return { catalog, acquisition: { startedAt, completedAt: observedAt,
    observations: acquisition, ...boundary() } };
}
