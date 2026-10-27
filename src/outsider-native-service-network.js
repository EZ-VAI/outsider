/* Discovery -> concrete executable candidates. Public sources identify a
 * compatible acquisition interface, never a reservation or seller guarantee.
 * The existing OutcomeProgram performs the actual allocation and execution. */
import { createHash } from "node:crypto";
import { readPrivateExecutionBytes } from "./outsider-user-held-durable-execution-v2.js";
import { discoverDemandWebSources } from "./outsider-open-web-demand-sources.js";
import { normalizePublicDataset, publicDatasetHash as digest } from "./outsider-public-dataset.js";

const read = file => JSON.parse(readPrivateExecutionBytes(file));
export function normalizeDatasetDeliveryInput(input) {
  if (!input || Object.keys(input).some(key => !["visibility", "records", "networkPolicy"].includes(key)))
    throw new Error("DATASET_DELIVERY_INPUT_INVALID");
  const dataset = normalizePublicDataset({ visibility: input.visibility, records: input.records });
  if (input.networkPolicy === undefined) return dataset;
  const policy = input.networkPolicy;
  if (!policy || Object.keys(policy).sort().join(",") !== "independentlyQueryableReplica,primaryAccount"
    || !["ACCOUNTLESS", "EXISTING_ACCOUNT", "ANY"].includes(policy.primaryAccount)
    || policy.independentlyQueryableReplica !== true) throw new Error("DATASET_NETWORK_POLICY_INVALID");
  return { ...dataset, networkPolicy: { primaryAccount: policy.primaryAccount, independentlyQueryableReplica: true } };
}

export function selectNativeServiceNetwork({ candidates, policy, requiredUntil, now }) {
  const admissible = candidates.filter(candidate => candidate.interfaceObserved === true
    && candidate.ownerAccessAvailable === true && candidate.capabilities.includes("PUBLIC_DATASET_SERVICE_V1")
    && Date.parse(candidate.offerValidUntil) > Date.parse(now)
    && Date.parse(candidate.resourceUsableUntil) >= Date.parse(requiredUntil));
  const rejected = candidates.filter(candidate => !admissible.includes(candidate)).map(candidate => ({
    candidateId: candidate.candidateId, reason: "INTERFACE_ACCESS_OR_LIFETIME_NOT_SATISFIED" }));
  const primary = admissible.filter(candidate => policy.primaryAccount === "ANY"
    || candidate.accountMode === policy.primaryAccount).sort((a, b) => a.candidateId.localeCompare(b.candidateId))[0];
  const alternate = primary && admissible.find(candidate => candidate.providerRef !== primary.providerRef);
  if (!primary || !alternate) return { state: "UNAVAILABLE", candidates, rejected,
    reason: "NO_DISTINCT_PROVIDER_EXECUTABLE_PAIR_FOR_REQUESTED_POLICY", capacityReserved: false };
  return { schema: "outsider/discovered-native-service-network/v1", state: "SELECTED_NOT_RESERVED", policy,
    primary, alternate, candidates, rejected,
    selectionBasis: "OBSERVED_ACQUISITION_INTERFACE_OWNER_ACCESS_ACCOUNT_MODE_LIFETIME_DISTINCT_PROVIDER",
    bindings: { primary_bundle: primary.adapterId, primary_recovery: alternate.adapterId,
      alternate_bundle: alternate.adapterId, alternate_recovery: primary.adapterId,
      portable_copy: "github_copy", independent_read: "globalping_read" },
    capacityReserved: false, providerOutcomeLiabilityAccepted: false, financialMode: "SIMULATION_ONLY" };
}

export async function discoverNativeServiceNetwork({ input, profile, requiredUntil, writeRecord,
  clock = () => new Date().toISOString(), discover = discoverDemandWebSources, fetchImpl = fetch }) {
  const normalized = normalizeDatasetDeliveryInput(input);
  if (!normalized.networkPolicy) return null;
  if (!profile.discovery?.referenceFile || !profile.discovery?.capabilityFile) throw new Error("NATIVE_NETWORK_DISCOVERY_NOT_CONFIGURED");
  const now = clock();
  const graph = { requirements: [{ id: "service_primary" }, { id: "service_alternate" }] };
  const plan = { queries: [
    { provider: "BRAVE", requirementId: "service_primary", purpose: "PRIMARY", query: "temporary PostgreSQL database REST API no account Neon claimable" },
    { provider: "BRAVE", requirementId: "service_alternate", purpose: "RECOVERY", query: "Cloudflare D1 Workers database API create account" },
  ] };
  const sources = await discover({ graph, plan, reference: read(profile.discovery.referenceFile),
    apiToken: read(profile.discovery.capabilityFile).apiToken, maximumSearches: 2, writeRecord, clock });
  const candidates = [], sourceCards = sources.cards.filter(card => card.status === 200);
  // Installed adapters advertise recognizable provider protocols. Search cannot
  // invent an executor for an unknown service, or supply arbitrary credential destinations.
  for (const protocol of [
    { candidateId: "cloudflare-d1-worker", providerRef: "cloudflare", adapterId: "cloudflare_bundle", accountMode: "EXISTING_ACCOUNT",
      host: "developers.cloudflare.com", protocolUrl: "https://developers.cloudflare.com/api/resources/d1/subresources/database/methods/create/",
      evidence: body => body.includes("/d1/database") && /(?:API Token|api_token|Bearer)/u.test(body) },
    { candidateId: "neon-claimable-data-api", providerRef: "neon", adapterId: "neon_bundle", accountMode: "ACCOUNTLESS",
      host: "neon.com", protocolUrl: "https://neon.com/auth.md",
      evidence: body => body.includes("https://claimable.neon.tech/v1/agent/identity") && body.includes('"data_api"') && body.includes('"auth"') },
  ]) {
    const discovered = sourceCards.find(card => new URL(card.url).hostname === protocol.host);
    if (!discovered) continue;
    const began = Date.now();
    const response = await fetchImpl(protocol.protocolUrl, { headers: { accept: "text/markdown, text/html" }, redirect: "error",
      signal: AbortSignal.timeout(20000) });
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > 2 * 1024 * 1024) throw new Error("NATIVE_INTERFACE_SOURCE_TOO_LARGE");
    const source = { url: protocol.protocolUrl, status: response.status, observedAt: clock(),
      contentHash: `sha256:${createHash("sha256").update(bytes).digest("hex")}`, bytes: bytes.length, bodyBase64: bytes.toString("base64") };
    await writeRecord(`native-interface-${protocol.candidateId}`, source);
    candidates.push({ candidateId: protocol.candidateId, adapterId: protocol.adapterId, providerRef: protocol.providerRef,
      accountMode: protocol.accountMode, ownerAccessAvailable: protocol.accountMode === "ACCOUNTLESS" || profile.zeroCostScope.confirmed === true,
      capabilities: ["PUBLIC_DATASET_SERVICE_V1"], interfaceObserved: response.status === 200 && protocol.evidence(bytes.toString("utf8")),
      discoverySource: { url: discovered.url, contentHash: discovered.sourceHash },
      protocolSource: { url: source.url, contentHash: source.contentHash, bytes: source.bytes, observedAt: source.observedAt },
      offerValidUntil: new Date(Date.parse(now) + 5 * 60000).toISOString(),
      resourceUsableUntil: protocol.accountMode === "ACCOUNTLESS" ? new Date(Date.parse(now) + 71 * 3600000).toISOString() : profile.zeroCostScope.expiresAt,
      requestedPriceMinor: "0", priceBasis: protocol.accountMode === "ACCOUNTLESS" ? "PUBLIC_TEMPORARY_FREE_SERVICE" : "OWNER_APPROVED_EXISTING_ZERO_COST_SCOPE_NOT_SELLER_QUOTE",
      interfaceReadMs: Date.now() - began, capacityReserved: false, quoteLocked: false, bespokeOutcomeLiabilityAccepted: false });
  }
  const network = { ...selectNativeServiceNetwork({ candidates, policy: normalized.networkPolicy, requiredUntil, now }),
    discovery: { metrics: sources.metrics, observedCandidateCount: candidates.length,
      sources: sourceCards.map(({ sourceHash, url }) => ({ sourceHash, url })),
      coverage: "OPEN_SEARCH_WITH_TWO_INSTALLED_PROVIDER_PROTOCOLS_NOT_ARBITRARY_WEB_EXECUTION" } };
  await writeRecord("selected-native-network", network);
  return network;
}
