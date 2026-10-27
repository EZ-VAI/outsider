#!/usr/bin/env node
/*
 * One bounded real-network pilot against Restful Booker, a public API-testing
 * sandbox.  This creates only synthetic, resettable test state.  The target is
 * compiled into this file; no URL, credential, callback, browser, provider
 * registry, or retry surface is accepted from the caller.
 */

import { Buffer } from "node:buffer";
import { createHash, randomBytes } from "node:crypto";
import {
  chmodSync,
  closeSync,
  constants,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  realpathSync,
  writeSync,
} from "node:fs";
import { request as httpsRequest } from "node:https";
import path from "node:path";

import { canonicalizeStrict } from "../src/canonical.js";
import {
  appendDurableOneUseEndpointEffectLedgerV1,
  createDurableOneUseEndpointEffectEventV1,
  initializeDurableOneUseEndpointEffectLedgerV1,
  verifyDurableOneUseEndpointEffectLedgerV1,
} from "../src/outsider-durable-one-use-endpoint-effect-ledger-v1.js";

const PROFILE = "RESTFUL_BOOKER_PUBLIC_TEST_SANDBOX_V1";
const HOSTNAME = "restful-booker.herokuapp.com";
const CREATE_PATH = "/booking";
const RUN_RELATIVE = path.join("artifacts",
  "external-resource-sandbox-pilot-20260903", "run-v1");
const SOURCE_URLS = Object.freeze([
  "https://github.com/mwinteringham/restful-booker",
  "https://www.postman.com/automation-in-testing/restful-booker-collections/documentation/55eh7vh/restful-booker",
]);
const MAX_RESPONSE_BYTES = 256 * 1024;

function sha256(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function semanticHash(domain, value) {
  return sha256(Buffer.from(`${domain}\0${canonicalizeStrict(value)}`, "utf8"));
}

function canonicalBytes(value) {
  return Buffer.from(`${canonicalizeStrict(value)}\n`, "utf8");
}

function writePrivateNoClobber(file, bytes) {
  const descriptor = openSync(file,
    constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY
      | constants.O_NOFOLLOW,
    0o600);
  try {
    let offset = 0;
    while (offset < bytes.length) {
      offset += writeSync(descriptor, bytes, offset, bytes.length - offset);
    }
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
  chmodSync(file, 0o600);
}

function fsyncDirectory(directory) {
  const descriptor = openSync(directory,
    constants.O_RDONLY | constants.O_NOFOLLOW);
  try { fsyncSync(descriptor); } finally { closeSync(descriptor); }
}

function event(input) {
  return createDurableOneUseEndpointEffectEventV1(input);
}

function append(directory, ledgerId, previous, next) {
  return appendDurableOneUseEndpointEffectLedgerV1({
    directory,
    ledgerId,
    event: next,
    expectedLocalHeadHash: previous.head.headHash,
  });
}

function occurrenceNonce(runNonce, type, ordinal) {
  return semanticHash("outsider/external-sandbox-occurrence/v1", {
    runNonce, type, ordinal,
  });
}

function fixedHttpsRequest({ method, requestPath, body = null }) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    const headers = {
      accept: "application/json",
      "user-agent": "Outsider-External-Sandbox-Pilot/1.0",
    };
    if (body !== null) {
      headers["content-type"] = "application/json";
      headers["content-length"] = String(body.length);
    }
    const request = httpsRequest({
      hostname: HOSTNAME,
      port: 443,
      method,
      path: requestPath,
      headers,
      agent: false,
      rejectUnauthorized: true,
    }, (response) => {
      const chunks = [];
      let byteCount = 0;
      const certificate = response.socket.getPeerCertificate();
      const transport = {
        tlsAuthorized: response.socket.authorized === true,
        tlsAuthorizationError: response.socket.authorizationError ?? null,
        tlsProtocol: response.socket.getProtocol?.() ?? null,
        peerCertificateFingerprint256: certificate?.fingerprint256 ?? null,
        remoteAddressObserved: typeof response.socket.remoteAddress === "string",
      };
      response.on("data", (chunk) => {
        byteCount += chunk.length;
        if (byteCount > MAX_RESPONSE_BYTES) request.destroy();
        else chunks.push(Buffer.from(chunk));
      });
      response.on("end", () => finish({
        ok: byteCount <= MAX_RESPONSE_BYTES,
        statusCode: response.statusCode ?? 0,
        headers: {
          contentType: response.headers["content-type"] ?? null,
          date: response.headers.date ?? null,
          requestId: response.headers["request-id"] ?? null,
          via: response.headers.via ?? null,
          server: response.headers.server ?? null,
        },
        bytes: Buffer.concat(chunks),
        transport,
        errorCode: null,
      }));
    });
    request.once("error", (error) => finish({
      ok: false,
      statusCode: 0,
      headers: {},
      bytes: Buffer.alloc(0),
      transport: null,
      errorCode: typeof error?.code === "string" ? error.code : "NETWORK_ERROR",
    }));
    request.setTimeout(15_000, () => request.destroy(new Error("TIMEOUT")));
    if (body !== null) request.write(body);
    request.end();
  });
}

function exactBookingMatch(expected, observed) {
  return canonicalizeStrict(expected) === canonicalizeStrict(observed);
}

const repositoryRoot = realpathSync(process.cwd());
const runDirectory = path.join(repositoryRoot, RUN_RELATIVE);
if (existsSync(runDirectory)) {
  throw new Error("OUTSIDER_EXTERNAL_SANDBOX_RUN_V1_ALREADY_EXISTS_NO_RETRY");
}
const familyDirectory = path.dirname(runDirectory);
mkdirSync(familyDirectory, { recursive: true, mode: 0o700 });
chmodSync(familyDirectory, 0o700);
mkdirSync(runDirectory, { mode: 0o700 });
chmodSync(runDirectory, 0o700);
fsyncDirectory(path.dirname(familyDirectory));
fsyncDirectory(familyDirectory);

const runNonce = randomBytes(32).toString("hex");
const startedAt = new Date().toISOString();
const effectDeadline = new Date(Date.now() + 10 * 60 * 1000).toISOString();
const syntheticBooking = {
  firstname: "Outsider",
  lastname: "Synthetic",
  totalprice: 1,
  depositpaid: false,
  bookingdates: {
    checkin: "2035-01-01",
    checkout: "2035-01-02",
  },
  additionalneeds: "TEST_OR_RESEARCH_SYNTHETIC_NO_REAL_GUEST",
};
const requestBytes = Buffer.from(canonicalizeStrict(syntheticBooking), "utf8");
const requestBodyHash = sha256(requestBytes);
const ledgerId = `ledger_${createHash("sha256")
  .update(`restful-booker:${runNonce}`).digest("hex").slice(0, 32)}`;
const ledgerDirectory = path.join(runDirectory, "ledger");
const binding = {
  effectIdHash: semanticHash("outsider/external-sandbox-effect/v1", {
    profile: PROFILE, runNonce, requestBodyHash,
  }),
  transactionBindingHash: semanticHash(
    "outsider/external-sandbox-transaction/v1", {
      operation: "CREATE_SYNTHETIC_BOOKING_TEST_RESOURCE",
      sourceUrls: SOURCE_URLS,
    }),
  endpointBindingHash: semanticHash("outsider/external-sandbox-endpoint/v1", {
    scheme: "https", hostname: HOSTNAME, port: 443, path: CREATE_PATH,
  }),
  adapterInstanceRefHash: semanticHash(
    "outsider/external-sandbox-adapter-instance/v1", {
      profile: PROFILE, script: "run-outsider-external-resource-sandbox-pilot.mjs",
    }),
  permissionGrantHash: semanticHash(
    "outsider/public-test-interface-documentation/v1", { sourceUrls: SOURCE_URLS }),
  oneUseNonceHash: semanticHash("outsider/external-sandbox-one-use-nonce/v1", {
    runNonce,
  }),
  idempotencyKeyHash: semanticHash(
    "outsider/external-sandbox-local-idempotency/v1", {
      runNonce, requestBodyHash,
    }),
  bodyHash: requestBodyHash,
};

writePrivateNoClobber(path.join(runDirectory, "request.json"), requestBytes);
const intent = event({
  ledgerId,
  eventType: "INTENT_ADMITTED",
  ...binding,
  effectDeadline,
  recordedAt: startedAt,
  previousEffectEventHash: null,
  occurrenceNonceHash: occurrenceNonce(runNonce, "INTENT_ADMITTED", 1),
  endpointReceiptHash: null,
  terminalEvidenceHash: null,
});
let ledger = initializeDurableOneUseEndpointEffectLedgerV1({
  directory: ledgerDirectory, ledgerId, genesisEvent: intent,
});
const reservedAt = new Date().toISOString();
const reserved = event({
  ledgerId,
  eventType: "SUBMIT_RESERVED",
  ...binding,
  effectDeadline,
  recordedAt: reservedAt,
  previousEffectEventHash: intent.eventHash,
  occurrenceNonceHash: occurrenceNonce(runNonce, "SUBMIT_RESERVED", 2),
  endpointReceiptHash: null,
  terminalEvidenceHash: null,
});
ledger = append(ledgerDirectory, ledgerId, ledger, reserved);
const attemptedAt = new Date().toISOString();
const attempted = event({
  ledgerId,
  eventType: "SUBMIT_ATTEMPTED",
  ...binding,
  effectDeadline,
  recordedAt: attemptedAt,
  previousEffectEventHash: reserved.eventHash,
  occurrenceNonceHash: occurrenceNonce(runNonce, "SUBMIT_ATTEMPTED", 3),
  endpointReceiptHash: null,
  terminalEvidenceHash: null,
});
ledger = append(ledgerDirectory, ledgerId, ledger, attempted);

// Exactly one external mutation attempt. There is intentionally no loop and
// no retry branch after this line.
const created = await fixedHttpsRequest({
  method: "POST", requestPath: CREATE_PATH, body: requestBytes,
});
writePrivateNoClobber(path.join(runDirectory, "post-response.bin"),
  created.bytes);

if (!created.ok || created.statusCode < 200 || created.statusCode >= 300) {
  const ambiguousAt = new Date().toISOString();
  const ambiguous = event({
    ledgerId,
    eventType: "AMBIGUOUS_NO_RETRY_HOLD",
    ...binding,
    effectDeadline,
    recordedAt: ambiguousAt,
    previousEffectEventHash: attempted.eventHash,
    occurrenceNonceHash: occurrenceNonce(runNonce,
      "AMBIGUOUS_NO_RETRY_HOLD", 4),
    endpointReceiptHash: null,
    terminalEvidenceHash: semanticHash(
      "outsider/external-sandbox-ambiguous-evidence/v1", {
        statusCode: created.statusCode, errorCode: created.errorCode,
        responseHash: sha256(created.bytes),
      }),
  });
  ledger = append(ledgerDirectory, ledgerId, ledger, ambiguous);
  const failureManifest = {
    schema: "outsider/external-resource-sandbox-pilot-manifest/v1",
    schemaVersion: "1.0.0",
    runClass: "PUBLIC_TEST_SANDBOX_EXTERNAL_EFFECT",
    profile: PROFILE,
    state: "AMBIGUOUS_NO_RETRY_HOLD",
    postAttemptCount: 1,
    automaticRetryCount: 0,
    httpStatusCode: created.statusCode,
    responseByteCount: created.bytes.length,
    responseHash: sha256(created.bytes),
    tls: created.transport,
    durableOccurrenceCount: ledger.head.exactOccurrenceCount,
    externalStateObserved: false,
    providerAcceptance: false,
    capacityReserved: false,
    userOutcomePromiseIssued: false,
    priceEstablished: false,
    guaranteeEstablished: false,
    settlementPermitted: false,
    decisionState: "HOLD",
  };
  writePrivateNoClobber(path.join(runDirectory, "manifest.json"),
    canonicalBytes(failureManifest));
  fsyncDirectory(runDirectory);
  process.stdout.write(`${canonicalizeStrict(failureManifest)}\n`);
  process.exitCode = 2;
} else {
  let parsedCreate;
  try { parsedCreate = JSON.parse(created.bytes.toString("utf8")); }
  catch { parsedCreate = null; }
  const bookingId = parsedCreate?.bookingid;
  const createBodyMatched = Number.isSafeInteger(bookingId)
    && bookingId > 0
    && exactBookingMatch(syntheticBooking, parsedCreate?.booking);
  if (!createBodyMatched) {
    throw new Error("OUTSIDER_EXTERNAL_SANDBOX_CREATE_RESPONSE_INVALID_NO_RETRY");
  }
  const observedAt = new Date().toISOString();
  const receipt = event({
    ledgerId,
    eventType: "ENDPOINT_RECEIPT_OBSERVED",
    ...binding,
    effectDeadline,
    recordedAt: observedAt,
    previousEffectEventHash: attempted.eventHash,
    occurrenceNonceHash: occurrenceNonce(runNonce,
      "ENDPOINT_RECEIPT_OBSERVED", 4),
    endpointReceiptHash: sha256(created.bytes),
    terminalEvidenceHash: null,
  });
  ledger = append(ledgerDirectory, ledgerId, ledger, receipt);

  const readBack = await fixedHttpsRequest({
    method: "GET", requestPath: `${CREATE_PATH}/${bookingId}`,
  });
  writePrivateNoClobber(path.join(runDirectory, "get-response.bin"),
    readBack.bytes);
  let parsedReadBack;
  try { parsedReadBack = JSON.parse(readBack.bytes.toString("utf8")); }
  catch { parsedReadBack = null; }
  const externalStateReadBackMatched = readBack.ok
    && readBack.statusCode === 200
    && exactBookingMatch(syntheticBooking, parsedReadBack);
  const verifiedLedger = verifyDurableOneUseEndpointEffectLedgerV1({
    directory: ledgerDirectory,
    ledgerId,
    expectedLocalHeadHash: ledger.head.headHash,
  });
  if (!verifiedLedger.ok) throw new Error("OUTSIDER_EXTERNAL_SANDBOX_LEDGER_INVALID");
  const completedAt = new Date().toISOString();
  const manifestBody = {
    schema: "outsider/external-resource-sandbox-pilot-manifest/v1",
    schemaVersion: "1.0.0",
    runClass: "PUBLIC_TEST_SANDBOX_EXTERNAL_EFFECT",
    profile: PROFILE,
    sourceDocumentationUrls: SOURCE_URLS,
    sourceRevisionPinEstablished: false,
    endpoint: {
      scheme: "https",
      hostname: HOSTNAME,
      createPath: CREATE_PATH,
      readBackPathClass: "/booking/{externally-assigned-id}",
    },
    startedAt,
    completedAt,
    requestByteCount: requestBytes.length,
    requestBodyHash,
    postResponseStatusCode: created.statusCode,
    postResponseByteCount: created.bytes.length,
    postResponseHash: sha256(created.bytes),
    getResponseStatusCode: readBack.statusCode,
    getResponseByteCount: readBack.bytes.length,
    getResponseHash: sha256(readBack.bytes),
    tls: {
      post: created.transport,
      readBack: readBack.transport,
    },
    exactPostAttemptCount: 1,
    automaticPostRetryCount: 0,
    exactReadBackCount: 1,
    externallyAssignedObjectId: bookingId,
    externalSandboxObjectCreated: true,
    externalStateReadBackMatched,
    durableOccurrenceCount: verifiedLedger.head.exactOccurrenceCount,
    durableSubmitAttemptOccurrenceCount:
      verifiedLedger.head.transitionCounts.SUBMIT_ATTEMPTED,
    durableEndpointReceiptOccurrenceCount:
      verifiedLedger.head.transitionCounts.ENDPOINT_RECEIPT_OBSERVED,
    publicTestInterfaceDocumentationObserved: true,
    publicTestInterfaceOwnerConsentForSyntheticTestingDeclared: true,
    realSupplierResourceEstablished: false,
    realCounterpartyContacted: false,
    resourceOwnerAuthorityEstablished: false,
    providerAcceptance: false,
    externalCapacityEstablished: false,
    capacityReserved: false,
    standingCreated: false,
    trustedClockEstablished: false,
    externalNonOmissionEstablished: false,
    outsiderStaffTouchCount: null,
    zeroInternalOpsEstablished: false,
    userOutcomePromiseIssued: false,
    priceEstablished: false,
    guaranteeEstablished: false,
    settlementPermitted: false,
    moneyMovementPermitted: false,
    decisionState: "HOLD",
    authority: "PUBLIC_TEST_SANDBOX_USE_ONLY",
    actionReady: false,
    executable: false,
  };
  const manifest = {
    ...manifestBody,
    manifestHash: semanticHash(
      "outsider/external-resource-sandbox-pilot-manifest/v1", manifestBody),
  };
  writePrivateNoClobber(path.join(runDirectory, "manifest.json"),
    canonicalBytes(manifest));
  fsyncDirectory(runDirectory);
  process.stdout.write(`${canonicalizeStrict({
    ok: true,
    profile: PROFILE,
    runDirectory: RUN_RELATIVE,
    postStatus: created.statusCode,
    readBackStatus: readBack.statusCode,
    externalSandboxObjectCreated: true,
    externalStateReadBackMatched,
    exactPostAttemptCount: 1,
    automaticPostRetryCount: 0,
    exactReadBackCount: 1,
    durableOccurrenceCount: verifiedLedger.head.exactOccurrenceCount,
    manifestHash: manifest.manifestHash,
    realSupplierResourceEstablished: false,
    providerAcceptance: false,
    capacityReserved: false,
    userOutcomePromiseIssued: false,
    decisionState: "HOLD",
  })}\n`);
}
