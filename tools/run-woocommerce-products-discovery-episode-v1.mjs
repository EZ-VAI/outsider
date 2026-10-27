#!/usr/bin/env node

import { createHash, randomBytes } from "node:crypto";
import { closeSync, constants, fsyncSync, lstatSync, openSync, readFileSync,
  realpathSync, writeSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { canonicalizeStrict } from "../src/canonical.js";
import { discoverBraveSearchRoutesV1 }
  from "../src/outsider-brave-search-route-discovery-adapter-v1.js";
import { adaptBraveSearchDiscoveryProjectionV1 }
  from "../src/outsider-brave-search-discovery-federation-node-v1.js";
import { createPinnedPublicHttpsFetchV1 }
  from "../src/outsider-public-https-read-only-fetch-transport-v1.js";
import { compileOutsiderOutcomeTenderV1 }
  from "../src/outsider-outcome-tender-v1.js";
import {
  OUTSIDER_ORDER_SCOPED_DISCOVERY_FEDERATION_V1_SCHEMAS,
  createOrderScopedDiscoveryNodeCapabilityV1,
  runOrderScopedDiscoveryFederationV1,
} from "../src/outsider-order-scoped-discovery-federation-v1.js";
import { discoverWooCommerceProductsV1,
  importWooCommerceSellerOriginFromBraveFederationV1 }
  from "../src/outsider-woocommerce-products-discovery-adapter-v1.js";

const PREFIX = "OUTSIDER_WOOCOMMERCE_PRODUCTS_DISCOVERY_EPISODE_V1_";
const TOKEN = /^[A-Za-z0-9._~-]{20,512}$/u;
const MAX_CAPABILITY_BYTES = 8 * 1024;
const QUERY = Object.freeze({ text: "WooCommerce official extensions marketplace",
  country: "ALL", searchLang: "en", count: 5 });
const h = (label) => `sha256:${createHash("sha256").update(label).digest("hex")}`;
const alias = (prefix, label) => `${prefix}_${h(label).slice(7, 39)}`;
const at = (base, offset) => new Date(base + offset).toISOString();
const fail = (code) => { throw new TypeError(`${PREFIX}${code}`); };

function readCapability(filename) {
  if (typeof filename !== "string" || filename.length === 0) fail("CAPABILITY_REQUIRED");
  const absolute = path.resolve(filename);
  let stat;
  try { stat = lstatSync(absolute, { bigint: true }); } catch { fail("CAPABILITY_UNREADABLE"); }
  if (!stat.isFile() || stat.isSymbolicLink() || Number(stat.mode & 0o777n) !== 0o600
    || stat.size < 2n || stat.size > BigInt(MAX_CAPABILITY_BYTES)
    || realpathSync(absolute) !== absolute
    || (typeof process.getuid === "function" && stat.uid !== BigInt(process.getuid()))) {
    fail("CAPABILITY_SAFETY_CHECK_FAILED");
  }
  const bytes = readFileSync(absolute);
  let value;
  try { value = JSON.parse(bytes.toString("utf8")); } catch { bytes.fill(0); fail("CAPABILITY_JSON_INVALID"); }
  bytes.fill(0);
  if (value === null || typeof value !== "object" || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype
    || Object.keys(value).join(",") !== "apiToken"
    || typeof value.apiToken !== "string" || !TOKEN.test(value.apiToken)) {
    fail("CAPABILITY_FIELDS_INVALID");
  }
  return value;
}

function createTranscript(filename) {
  const absolute = path.resolve(filename);
  const fd = openSync(absolute, constants.O_WRONLY | constants.O_CREAT
    | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
  return { append(value) {
    const text = `${canonicalizeStrict(value)}\n`;
    writeSync(fd, text, null, "utf8"); fsyncSync(fd);
  }, close() { fsyncSync(fd); closeSync(fd); }, path: absolute };
}

function tender(now, label) {
  const evidenceId = alias("evidence", `${label}:evidence`);
  return compileOutsiderOutcomeTenderV1({
    tenderId: alias("tender", label), compiledAt: at(now, 0),
    lineage: { revision: 0, predecessorTenderHash: null, supersedesTenderHash: null },
    workOrderHash: h(`${label}:work-order`),
    typedGraph: {
      principalEpoch: { principalRefHash: h(`${label}:principal`), epochRefHash: h(`${label}:epoch`), principalEpochProjectionHash: h(`${label}:principal-epoch`) },
      accountableDeployment: { deploymentLineageRefHash: h(`${label}:lineage`), deploymentRevisionHash: h(`${label}:deployment-revision`), accountableDeploymentSubjectHash: h(`${label}:deployment-subject`) },
      runtime: { runtimeInstanceRefHash: h(`${label}:runtime-ref`), runtimeInstanceHash: h(`${label}:runtime`) },
      embodiment: { present: false, deviceLineageRefHash: null, embodimentRevisionHash: null },
      delegation: { delegationEvidenceRefHash: h(`${label}:delegation-evidence`), delegationEdgeHash: h(`${label}:delegation-edge`) },
      episode: { episodeHash: h(`${label}:episode`), networkCompleteEpisodeJoinHash: h(`${label}:episode-join`) },
      attempt: { attemptHash: h(`${label}:attempt`), attemptActorSubjectHash: h(`${label}:attempt-subject`) },
    },
    authorizationBinding: { actorIdentityEnvelopeHash: h(`${label}:actor-envelope`), delegationEvidenceRefHash: h(`${label}:delegation-evidence`), delegationEdgeHash: h(`${label}:delegation-edge`), authorityScopeRefHash: h(`${label}:authority-scope`), resourceOwnerAuthorizationRefHash: h(`${label}:owner-authorization`), rightsPrivacyPolicyRefHash: h(`${label}:rights-policy`) },
    exactOutcome: { outcomeKindCode: "GENERIC_COMMERCE_RESOURCE_DISCOVERED", outcomeSpecRefHash: h(`${label}:outcome-spec`), subjectRefHash: h(`${label}:subject`), acceptanceCriteriaRefHash: h(`${label}:acceptance`), conditions: [{ conditionId: alias("condition", `${label}:condition`), metricCode: "SELLER_OWNED_READ_ONLY_SURFACE_STATE", comparator: "EQUAL", target: { valueKind: "STATE_CODE", booleanValue: null, integerValue: null, stateCode: "OBSERVED", unitCode: null }, observationWindowMs: 0, conditionRefHash: h(`${label}:condition-ref`), mandatory: true }], deadline: at(now, 15 * 60_000) },
    formationDeadline: at(now, 10 * 60_000),
    resourceRequirements: [{ resourceRequirementId: alias("resource", `${label}:resource`), resourceClassCode: "GENERIC_COMMERCE_PRODUCT_OR_SERVICE", capabilityRefHash: h(`${label}:capability`), quantity: 1, unitCode: "RESOURCE", regionRefHash: h(`${label}:global`), requiredBy: at(now, 14 * 60_000), mandatory: true }],
    evidenceRequirements: [{ evidenceRequirementId: evidenceId, evidenceClassCode: "INDEPENDENT_EXTERNAL_OUTCOME_EVIDENCE", evidenceRequirementRefHash: h(`${label}:evidence-ref`), sourceControl: "INDEPENDENT_OF_PROVIDER", observationMode: "AT_COMPLETION", dueBy: at(now, 15 * 60_000), mandatory: true }],
    recoveryRequirements: [{ recoveryRequirementId: alias("recovery", `${label}:recovery`), triggerRefHash: h(`${label}:trigger`), recoveryOutcomeRefHash: h(`${label}:recovery-outcome`), resourceClassCode: "ALTERNATE_DISCOVERY_ROUTE", maximumAttempts: 1, completionDeadline: at(now, 15 * 60_000), recoveryEvidenceRequirementId: evidenceId, routePolicy: "ALTERNATE_RESOURCE_REQUIRED", mandatory: true }],
    maximumConsequence: { consequenceEnvelopeRefHash: h(`${label}:consequence`), consequenceClassCode: "BOUNDED_READ_ONLY_DISCOVERY", measureCode: "MAXIMUM_EXTERNAL_READS", maximumValue: 4, unitCode: "REQUEST", affectedChannelRefHashes: [h(`${label}:channel`)], irreversibleHarmAllowed: false, unboundedConsequenceAllowed: false },
    zeroInternalOps: { outsiderStaffInterventionsAllowed: 0, internalManualSourcingAllowed: false, internalManualCoordinationAllowed: false, internalManualVerificationAllowed: false, internalManualRecoveryAllowed: false, humanQueueFallbackAllowed: false, failureDisposition: "DECLINE_NOT_HUMAN_QUEUE" },
  });
}

function requirementBinding(record) {
  const section = record.resourceRequirements;
  const requirement = section.items[0];
  return { requirementKind: "RESOURCE", requirementId: requirement.resourceRequirementId,
    requirementSetHash: section.requirementSetHash,
    requirementObjectHash: h(`outsider/outcome-formation-exact-tender-requirement/v1\0${canonicalizeStrict({ tenderHash: record.tenderHash, requirementKind: "RESOURCE", requirementSetHash: section.requirementSetHash, requirement })}`) };
}

function response(body, headers = {}) {
  return { status: 200, headers: { get(name) { return headers[name.toLowerCase()] ?? null; } },
    async text() { return typeof body === "string" ? body : JSON.stringify(body); } };
}

export async function runWooCommerceProductsDiscoveryEpisodeV1(options) {
  const now = options.now ?? Date.now();
  const label = `woocommerce-discovery:${randomBytes(32).toString("hex")}`;
  const record = tender(now, label);
  const requirement = requirementBinding(record);
  const occurrenceId = alias("discovery", `${label}:brave`);
  const slot = alias("node", `${label}:slot`);
  const expiresAt = at(now, 9 * 60_000);
  let braveRequests = 0;
  const braveFetch = options.mode === "mock" ? async () => {
    braveRequests += 1;
    return response({ type: "search", web: { type: "search", results: [{
      title: "private", description: "private", url: "https://seller.example/catalog" }] } });
  } : async (...args) => { braveRequests += 1; return fetch(...args); };
  const capability = createOrderScopedDiscoveryNodeCapabilityV1({ nodeKind: "brave.web_search.v1",
    async invoke(context) {
      const result = await discoverBraveSearchRoutesV1({ tender: context.tender,
        requirementKind: context.requirementKind, requirementId: context.requirementId,
        query: context.nodeInput.query, asOf: context.asOf,
        privateBindingNonce: context.privateBindingNonce },
      { apiToken: options.apiToken, timeoutMs: 8000, fetchImpl: braveFetch });
      return { publicReceipt: adaptBraveSearchDiscoveryProjectionV1(result, context), privateEphemeral: result };
    } });
  const federation = await runOrderScopedDiscoveryFederationV1({ tender: record,
    asOf: at(now, 1000), publicPlan: { schema: OUTSIDER_ORDER_SCOPED_DISCOVERY_FEDERATION_V1_SCHEMAS.plan,
      federationId: alias("federation", `${label}:federation`), tenderHash: record.tenderHash,
      workOrderHash: record.workOrderHash, typedGraphHash: record.typedGraph.typedGraphHash,
      concurrencyLimit: 1, jobs: [{ occurrenceId, nodeSlotId: slot,
        nodeKind: "brave.web_search.v1", ...requirement, expiresAt, maximumRuntimeMs: 15000 }] },
    privateJobs: [{ occurrenceId, nodeInput: { query: { ...QUERY, expiresAt } },
      privateBindingNonce: h(`${label}:brave-private`) }], privateProjectionNonce: h(`${label}:projection`) },
  { capabilityBindings: [{ nodeSlotId: slot, capability }] });
  if (braveRequests !== 1) fail("BRAVE_REQUEST_CARDINALITY_INVALID");
  const sellerOriginLease = importWooCommerceSellerOriginFromBraveFederationV1({
    federationResult: federation, expectedTenderHash: record.tenderHash,
    occurrenceId, candidateIndex: 0 });
  let wooFetch;
  if (options.mode === "mock") {
    let call = 0;
    wooFetch = async () => {
      call += 1;
      if (call === 1) return response("", { link: "<https://seller.example/wp-json/>; rel=\"https://api.w.org/\"" });
      if (call === 2) return response({ namespaces: ["wc/store/v1"], routes: { "/wc/store/v1/products": { methods: ["GET"] } } }, { "content-type": "application/json" });
      return response([{ id: 1, name: "private", slug: "private",
        prices: { currency_code: "USD", currency_minor_unit: 2, price: "100" },
        is_purchasable: true, is_in_stock: true, has_options: false,
        add_to_cart: { text: "private" } }],
      { "content-type": "application/json" });
    };
  } else {
    wooFetch = createPinnedPublicHttpsFetchV1({ timeoutMs: 8000,
      maximumResponseBytes: 2 * 1024 * 1024 });
  }
  const woo = await discoverWooCommerceProductsV1({ sellerOriginLease,
    search: QUERY.text, limit: 5, asOf: at(now, 2000), expiresAt,
    privateBindingNonce: h(`${label}:woo-private`) }, { fetchImpl: wooFetch, timeoutMs: 8000 });
  return Object.freeze({ schema: "outsider/woocommerce-products-discovery-episode-privacy-closed/v1",
    mode: options.mode === "mock" ? "MOCK_DRY_RUN" : "LIVE_READ_ONLY",
    tenderHash: record.tenderHash, federation: federation.publicProjection,
    wooCommerce: woo.publicProjection, decisionState: "HOLD", authority: "NONE",
    providerAcceptanceEstablished: false, capacityReserved: false,
    cartCheckoutPaymentPerformed: false });
}

async function main(argv) {
  const mode = argv.includes("--live") ? "live" : argv.includes("--mock-dry-run") ? "mock" : null;
  const value = (flag) => { const i = argv.indexOf(flag); return i < 0 ? null : argv[i + 1]; };
  if (mode === null || argv.includes("--live") === argv.includes("--mock-dry-run")) fail("MODE_REQUIRED");
  const capability = readCapability(value("--capability"));
  const transcript = createTranscript(value("--transcript"));
  try {
    const result = await runWooCommerceProductsDiscoveryEpisodeV1({ mode, apiToken: capability.apiToken });
    transcript.append(result); process.stdout.write(`${canonicalizeStrict(result)}\n`);
  } catch (error) {
    transcript.append({ schema: "outsider/woocommerce-products-discovery-episode-failure/v1",
      failureCode: /^OUTSIDER_[A-Z0-9_]+/u.exec(String(error?.message))?.[0] ?? `${PREFIX}FAILURE`,
      decisionState: "HOLD", authority: "NONE" });
    throw error;
  } finally { capability.apiToken = ""; transcript.close(); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((error) => { process.stderr.write(`${String(error.message)}\n`); process.exitCode = 1; });
}
