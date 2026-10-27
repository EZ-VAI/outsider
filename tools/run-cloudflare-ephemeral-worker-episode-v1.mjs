#!/usr/bin/env node

import { createHash, randomBytes } from "node:crypto";
import {
  chmodSync,
  lstatSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { canonicalizeStrict } from "../src/canonical.js";
import { compileOutsiderOutcomeTenderV1 }
  from "../src/outsider-outcome-tender-v1.js";

const MAX_CAPABILITY_BYTES = 32 * 1024;
const ACCOUNT_ID = /^[a-f0-9]{32}$/u;
const API_TOKEN = /^[A-Za-z0-9._~-]{20,512}$/u;
const DNS_LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u;

function abort(code) {
  throw new TypeError(`OUTSIDER_EPHEMERAL_WORKER_LIVE_CLI_V1_${code}`);
}

function h(label) {
  return `sha256:${createHash("sha256").update(label, "utf8").digest("hex")}`;
}

function alias(prefix, label) {
  return `${prefix}_${h(label).slice(7, 39)}`;
}

function at(base, milliseconds) {
  return new Date(base + milliseconds).toISOString();
}

function readCapability(filename) {
  if (typeof filename !== "string" || filename.length < 1) {
    abort("CAPABILITY_FILE_REQUIRED");
  }
  const absolute = path.resolve(filename);
  let stat;
  try { stat = lstatSync(absolute, { bigint: true }); }
  catch { abort("CAPABILITY_FILE_UNREADABLE"); }
  if (stat.isSymbolicLink() || !stat.isFile()
    || Number(stat.mode & 0o777n) !== 0o600
    || stat.size < 2n || stat.size > BigInt(MAX_CAPABILITY_BYTES)
    || realpathSync(absolute) !== absolute
    || (typeof process.getuid === "function"
      && stat.uid !== BigInt(process.getuid()))) {
    abort("CAPABILITY_FILE_SAFETY_CHECK_FAILED");
  }
  const bytes = readFileSync(absolute);
  let value;
  try { value = JSON.parse(bytes.toString("utf8")); }
  catch { bytes.fill(0); abort("CAPABILITY_JSON_INVALID"); }
  bytes.fill(0);
  if (value === null || typeof value !== "object" || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype
    || Object.keys(value).sort().join(",")
      !== "accountId,apiToken,workersDevSubdomain"
    || typeof value.apiToken !== "string" || !API_TOKEN.test(value.apiToken)
    || typeof value.accountId !== "string" || !ACCOUNT_ID.test(value.accountId)
    || typeof value.workersDevSubdomain !== "string"
    || !DNS_LABEL.test(value.workersDevSubdomain)) {
    abort("CAPABILITY_JSON_FIELDS_INVALID");
  }
  return value;
}

function compileCurrentHoldTender(now) {
  const run = randomBytes(32).toString("hex");
  const label = `cloudflare-ephemeral-worker:${run}`;
  const evidenceId = alias("evidence", `${label}:independent-evidence`);
  return compileOutsiderOutcomeTenderV1({
    tenderId: alias("tender", label),
    compiledAt: at(now, 0),
    lineage: { revision: 0, predecessorTenderHash: null,
      supersedesTenderHash: null },
    workOrderHash: h(`${label}:work-order`),
    typedGraph: {
      principalEpoch: { principalRefHash: h(`${label}:principal`),
        epochRefHash: h(`${label}:epoch`),
        principalEpochProjectionHash: h(`${label}:principal-epoch`) },
      accountableDeployment: {
        deploymentLineageRefHash: h(`${label}:lineage`),
        deploymentRevisionHash: h(`${label}:deployment-revision`),
        accountableDeploymentSubjectHash: h(`${label}:deployment-subject`) },
      runtime: { runtimeInstanceRefHash: h(`${label}:runtime-ref`),
        runtimeInstanceHash: h(`${label}:runtime`) },
      embodiment: { present: false, deviceLineageRefHash: null,
        embodimentRevisionHash: null },
      delegation: { delegationEvidenceRefHash: h(`${label}:delegation-evidence`),
        delegationEdgeHash: h(`${label}:delegation-edge`) },
      episode: { episodeHash: h(`${label}:episode`),
        networkCompleteEpisodeJoinHash: h(`${label}:episode-join`) },
      attempt: { attemptHash: h(`${label}:attempt`),
        attemptActorSubjectHash: h(`${label}:attempt-subject`) },
    },
    authorizationBinding: {
      actorIdentityEnvelopeHash: h(`${label}:actor-envelope`),
      delegationEvidenceRefHash: h(`${label}:delegation-evidence`),
      delegationEdgeHash: h(`${label}:delegation-edge`),
      authorityScopeRefHash: h(`${label}:authority-scope`),
      resourceOwnerAuthorizationRefHash: h(`${label}:owner-authorization`),
      rightsPrivacyPolicyRefHash: h(`${label}:rights-policy`),
    },
    exactOutcome: {
      outcomeKindCode: "EPHEMERAL_WORKER_PATH_CERTIFIED",
      outcomeSpecRefHash: h(`${label}:outcome-spec`),
      subjectRefHash: h(`${label}:subject`),
      acceptanceCriteriaRefHash: h(`${label}:acceptance`),
      conditions: [{ conditionId: alias("condition", `${label}:roundtrip`),
        metricCode: "PUBLIC_EFFECT_RECOVERY_STATE", comparator: "EQUAL",
        target: { valueKind: "STATE_CODE", booleanValue: null,
          integerValue: null, stateCode: "OBSERVED_AND_REMOVED", unitCode: null },
        observationWindowMs: 0,
        conditionRefHash: h(`${label}:condition-ref`), mandatory: true }],
      deadline: at(now, 12 * 60_000),
    },
    formationDeadline: at(now, 4 * 60_000),
    resourceRequirements: [{
      resourceRequirementId: alias("resource", `${label}:worker`),
      resourceClassCode: "EPHEMERAL_EDGE_COMPUTE",
      capabilityRefHash: h(`${label}:capability`), quantity: 1,
      unitCode: "WORKER", regionRefHash: h(`${label}:global-region`),
      requiredBy: at(now, 11 * 60_000), mandatory: true,
    }],
    evidenceRequirements: [{
      evidenceRequirementId: evidenceId,
      evidenceClassCode: "INDEPENDENT_EXTERNAL_OUTCOME_EVIDENCE",
      evidenceRequirementRefHash: h(`${label}:evidence-ref`),
      sourceControl: "INDEPENDENT_OF_PROVIDER",
      observationMode: "AT_COMPLETION",
      dueBy: at(now, 12 * 60_000), mandatory: true,
    }],
    recoveryRequirements: [{
      recoveryRequirementId: alias("recovery", `${label}:delete`),
      triggerRefHash: h(`${label}:trigger`),
      recoveryOutcomeRefHash: h(`${label}:recovery-outcome`),
      resourceClassCode: "EPHEMERAL_EDGE_COMPUTE_RECOVERY",
      maximumAttempts: 1,
      completionDeadline: at(now, 12 * 60_000),
      recoveryEvidenceRequirementId: evidenceId,
      routePolicy: "REPERFORM_ALLOWED", mandatory: true,
    }],
    maximumConsequence: {
      consequenceEnvelopeRefHash: h(`${label}:consequence`),
      consequenceClassCode: "BOUNDED_EPHEMERAL_RESOURCE",
      measureCode: "MAXIMUM_EPHEMERAL_WORKERS", maximumValue: 1,
      unitCode: "WORKER",
      affectedChannelRefHashes: [h(`${label}:channel`)],
      irreversibleHarmAllowed: false, unboundedConsequenceAllowed: false,
    },
    zeroInternalOps: {
      outsiderStaffInterventionsAllowed: 0,
      internalManualSourcingAllowed: false,
      internalManualCoordinationAllowed: false,
      internalManualVerificationAllowed: false,
      internalManualRecoveryAllowed: false,
      humanQueueFallbackAllowed: false,
      failureDisposition: "DECLINE_NOT_HUMAN_QUEUE",
    },
  });
}

function emit(value) {
  process.stdout.write(`${canonicalizeStrict(value)}\n`);
}

function emitProjection(phase, result) {
  emit({ phase, publicProjection: result.publicProjection });
  return result.publicProjection;
}

function safeErrorCode(error) {
  const value = typeof error?.message === "string" ? error.message : "";
  const match = /^(OUTSIDER_[A-Z0-9_]+)/u.exec(value);
  return match?.[1] ?? "OUTSIDER_EPHEMERAL_WORKER_LIVE_CLI_V1_FAILURE";
}

function createMockFetch(capability, state) {
  const accountId = capability.accountId;
  const workersDevSubdomain = capability.workersDevSubdomain;
  return async (rawUrl, options) => {
    const url = new URL(rawUrl);
    if (url.origin === "https://api.cloudflare.com"
      && (url.pathname === "/client/v4/user/tokens/verify"
        || url.pathname
          === `/client/v4/accounts/${accountId}/tokens/verify`)) {
      return new Response(JSON.stringify({ success: true,
        result: { status: "active" } }), { status: 200,
        headers: { "content-type": "application/json" } });
    }
    if (url.origin === "https://api.cloudflare.com"
      && url.pathname
        === `/client/v4/accounts/${accountId}/workers/subdomain`) {
      return new Response(JSON.stringify({ success: true,
        result: { subdomain: workersDevSubdomain } }), {
        status: 200, headers: { "content-type": "application/json" },
      });
    }
    if (url.origin === "https://api.cloudflare.com"
      && url.pathname.endsWith("/subdomain") && options.method === "GET") {
      if (!state.uploaded) return new Response(null, { status: 404 });
      return new Response(JSON.stringify({ success: true,
        result: { enabled: state.enabled, previews_enabled: false } }), {
        status: 200, headers: { "content-type": "application/json" },
      });
    }
    if (url.origin === "https://api.cloudflare.com"
      && options.method === "PUT") {
      state.uploaded = true;
      return new Response(JSON.stringify({ success: true,
        result: { etag: "mock-only" } }), { status: 200,
        headers: { "content-type": "application/json" } });
    }
    if (url.origin === "https://api.cloudflare.com"
      && options.method === "POST" && url.pathname.endsWith("/subdomain")) {
      state.enabled = true;
      return new Response(JSON.stringify({ success: true,
        result: { enabled: true, previews_enabled: false } }), { status: 200,
        headers: { "content-type": "application/json" } });
    }
    if (url.origin === "https://api.cloudflare.com"
      && options.method === "DELETE") {
      state.deleted = true;
      return new Response(null, { status: 204 });
    }
    if (url.hostname.endsWith(".workers.dev") && options.method === "GET") {
      if (state.deleted) return new Response("not found", { status: 404 });
      return new Response(state.responseBytes, { status: 200, headers: {
        "content-type": "application/json", "cache-control": "no-store",
      } });
    }
    return new Response(null, { status: 404 });
  };
}

async function main() {
  const args = process.argv.slice(2);
  const mock = args[0] === "--mock-dry-run";
  const filename = mock ? args[1] : args[0];
  if ((mock && args.length !== 2) || (!mock && args.length !== 1)) {
    abort("USAGE_INVALID");
  }
  const rawCapability = readCapability(filename);
  const now = Date.now();
  const tender = compileCurrentHoldTender(now);
  const responseBytes = Buffer.from(canonicalizeStrict({
    schema: "outsider/cloudflare-ephemeral-worker-proof-response/v1",
    schemaVersion: "1.0.0",
    exactOutcomeHash: tender.exactOutcome.exactOutcomeHash,
  }), "utf8");
  const priorFetch = globalThis.fetch;
  if (mock) {
    globalThis.fetch = createMockFetch(rawCapability, {
      uploaded: false, enabled: false, deleted: false, responseBytes,
    });
  }
  const adapter = await import(
    "../src/outsider-cloudflare-ephemeral-worker-interface-v1.js");
  globalThis.fetch = priorFetch;

  const root = mkdtempSync(path.join(realpathSync(tmpdir()),
    "outsider-ephemeral-worker-episode-v1-"));
  chmodSync(root, 0o700);
  const ledgerDirectory = path.join(root, "ledger");
  const credential = adapter.sealCloudflareEphemeralWorkerCapabilityV1(
    rawCapability);
  rawCapability.apiToken = "";
  rawCapability.accountId = "";
  rawCapability.workersDevSubdomain = "";

  emit({
    phase: "EPISODE_STARTED",
    tenderHash: tender.tenderHash,
    publicOutcomeCommitmentHash: tender.exactOutcome.exactOutcomeHash,
    incrementalPriceMinorUnits: 0,
    currencyCode: "USD",
    paymentAttempted: false,
    decisionState: "HOLD",
    authority: "NONE",
  });

  const uploadDeadline = at(now, 3 * 60_000);
  const witnessDeadline = at(now, 7 * 60_000);
  const deleteDeadline = at(now, 10 * 60_000);
  const preflight = await adapter.preflightCloudflareEphemeralWorkerV1({
    credentialCapability: credential,
    tender,
    expectedTenderHash: tender.tenderHash,
    publicOutcomeCommitmentHash: tender.exactOutcome.exactOutcomeHash,
    uploadDeadline,
    witnessDeadline,
    deleteDeadline,
  }, { timeoutMs: 15_000 });
  const preflightProjection = emitProjection("PREFLIGHT", preflight);
  if (preflightProjection.status !== "SUCCEEDED") abort("PREFLIGHT_FAILED");

  const handoff = adapter.claimCloudflareEphemeralWorkerLeaseV1(preflight, {
    tender, expectedTenderHash: tender.tenderHash,
  });
  const driver = adapter.createCloudflareEphemeralWorkerDriverV1(handoff, {
    ledgerDirectory,
    ledgerId: `ledger_${randomBytes(16).toString("hex")}`,
    expectedTenderHash: tender.tenderHash,
    expectedOutcomeCommitmentHash: tender.exactOutcome.exactOutcomeHash,
    adapterInstanceRefHash: h(`adapter:${randomBytes(32).toString("hex")}`),
    permissionGrantHash: h(`caller-asserted:${randomBytes(32).toString("hex")}`),
    privateProjectionNonce: randomBytes(32).toString("hex"),
  });
  emit({ phase: "DRIVER_ADMITTED",
    publicProjection: driver.publicProjection });

  const operation = { expectedPlanHash: driver.publicProjection.planHash };
  let latest = driver.publicProjection;
  let uploadAttempted = false;
  let primaryFailure = null;
  try {
    uploadAttempted = true;
    const uploaded = await adapter.uploadCloudflareEphemeralWorkerOnceV1(
      driver, operation, { timeoutMs: 15_000 });
    latest = emitProjection("UPLOAD", uploaded);
    if (!latest.uploadProviderReceiptObserved) {
      const reconciled = await adapter
        .reconcileCloudflareEphemeralWorkerUploadV1(driver, operation,
          { timeoutMs: 15_000 });
      latest = emitProjection("UPLOAD_RECONCILE", reconciled);
    }
    if (!latest.uploadProviderReceiptObserved) abort("UPLOAD_UNRESOLVED");

    const enabled = await adapter
      .enableCloudflareEphemeralWorkerSubdomainOnceV1(driver, operation,
        { timeoutMs: 15_000 });
    latest = emitProjection("WORKERS_DEV_ENABLE", enabled);
    if (!latest.subdomainEnableProviderReceiptObserved) {
      const reconciled = await adapter
        .reconcileCloudflareEphemeralWorkerSubdomainV1(driver, operation,
          { timeoutMs: 15_000 });
      latest = emitProjection("WORKERS_DEV_ENABLE_RECONCILE", reconciled);
    }
    if (!latest.subdomainEnableProviderReceiptObserved) {
      abort("WORKERS_DEV_ENABLE_UNRESOLVED");
    }

    const observed = await adapter
      .observeCloudflareEphemeralWorkerPublicEffectV1(driver, operation, {
        requestTimeoutMs: 8_000, pollIntervalMs: 1_000, maxWaitMs: 45_000,
      });
    latest = emitProjection("PUBLIC_EFFECT_OBSERVE", observed);
    if (!latest.publicEffectObservedAtWorkersDev) {
      abort("PUBLIC_EFFECT_NOT_OBSERVED");
    }
  } catch (error) {
    primaryFailure = safeErrorCode(error);
  } finally {
    if (uploadAttempted) {
      try {
        const deleted = await adapter.deleteCloudflareEphemeralWorkerOnceV1(
          driver, operation, { timeoutMs: 15_000 });
        latest = emitProjection("DELETE", deleted);
        if (!latest.deleteProviderReceiptObserved) {
          const reconciled = await adapter
            .reconcileCloudflareEphemeralWorkerDeleteV1(driver, operation,
              { timeoutMs: 15_000 });
          latest = emitProjection("DELETE_RECONCILE", reconciled);
        }
        if (latest.deleteProviderReceiptObserved
          && latest.publicEffectObservedAtWorkersDev) {
          const absent = await adapter
            .observeCloudflareEphemeralWorkerAbsenceV1(driver, operation, {
              requestTimeoutMs: 8_000, pollIntervalMs: 1_000,
              maxWaitMs: 45_000,
            });
          latest = emitProjection("PUBLIC_ABSENCE_OBSERVE", absent);
        }
      } catch (error) {
        emit({ phase: "CLEANUP_HOLD", errorCode: safeErrorCode(error),
          decisionState: "HOLD", authority: "NONE" });
      }
    }
  }

  const complete = latest.publicEffectObservedAtWorkersDev === true
    && latest.deleteProviderReceiptObserved === true
    && latest.publicAbsenceObservedAtWorkersDev === true;
  emit({
    phase: "EPISODE_FINISHED",
    pathCertificationObserved: complete,
    independentOutcomeTruthEstablished: false,
    primaryFailureCode: primaryFailure,
    durableOccurrenceCount: latest.durableOccurrenceCount ?? 0,
    totalSubmitAttemptOccurrenceCount:
      latest.totalSubmitAttemptOccurrenceCount ?? 0,
    totalProviderReceiptOccurrenceCount:
      latest.totalProviderReceiptOccurrenceCount ?? 0,
    incrementalPriceMinorUnits: 0,
    paymentAttempted: false,
    decisionState: "HOLD",
    authority: "NONE",
  });
  if (!complete || primaryFailure !== null) process.exitCode = 1;
}

main().catch((error) => {
  emit({ phase: "EPISODE_ABORTED", errorCode: safeErrorCode(error),
    incrementalPriceMinorUnits: 0, paymentAttempted: false,
    decisionState: "HOLD", authority: "NONE" });
  process.exitCode = 1;
});
