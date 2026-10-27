#!/usr/bin/env node

/*
 * Append one hash-only route-proposal occurrence to the deployed Outcome
 * registry.  The caller performs seller interaction and redaction locally;
 * this client can transmit only the two resulting content references.
 */

import { createHash } from "node:crypto";
import { lstatSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { canonicalizeStrict } from "../src/canonical.js";
import {
  verifyBuyerNativeRouteEvidenceV1,
} from "../src/outsider-buyer-native-route-evidence-v1.js";

const PREFIX = "OUTSIDER_PRODUCTION_ROUTE_PROPOSAL_APPEND_V1_";
const DEFAULT_ORIGIN
  = "https://outsider-formation-job-worker.outsider-guard.workers.dev";
const HASH = /^sha256:[a-f0-9]{64}$/u;
const CONTRACT = /^contract_[a-f0-9]{32}$/u;
const UTC
  = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d\.\d{3}Z$/u;

export const OUTSIDER_PRODUCTION_ROUTE_PROPOSAL_APPEND_V1_BOUNDARY
  = Object.freeze({
    position: "USER_HELD_HASH_ONLY_PRODUCTION_REGISTRY_CLIENT",
    transmittedFields: Object.freeze([
      "schema", "recordedAt", "idempotencyKeyHash",
      "expectedRegistryHeadHash", "routeProposalRefHash",
      "occurrenceRefHash",
    ]),
    providerIdentityAccepted: false,
    providerUrlAccepted: false,
    rawSourceBytesAccepted: false,
    directPiiAccepted: false,
    credentialProjected: false,
    paymentMaterialAccepted: false,
    routeSelected: false,
    capacityEstablished: false,
    authorityMinted: false,
    outcomeTruthEstablished: false,
    outcomeCommitIssued: false,
  });

function fail(code) {
  const error = new TypeError(`${PREFIX}${code}`);
  error.outsiderCode = code;
  throw error;
}

function exact(value, fields, code) {
  if (value === null || typeof value !== "object" || Array.isArray(value)
    || Reflect.ownKeys(value).length !== fields.length
    || fields.some((field) => !Object.hasOwn(value, field))) {
    fail(`${code}_FIELDS_INVALID`);
  }
  return value;
}

function hash(value, code) {
  if (typeof value !== "string" || !HASH.test(value)) fail(`${code}_INVALID`);
  return value;
}

function instant(value, code) {
  if (typeof value !== "string" || !UTC.test(value)
    || !Number.isFinite(Date.parse(value))
    || new Date(Date.parse(value)).toISOString() !== value) {
    fail(`${code}_INVALID`);
  }
  return value;
}

function origin(value) {
  let parsed;
  try { parsed = new URL(value); } catch { fail("CENTRAL_ORIGIN_INVALID"); }
  if (parsed.protocol !== "https:" || parsed.username !== ""
    || parsed.password !== "" || parsed.pathname !== "/"
    || parsed.search !== "" || parsed.hash !== "") {
    fail("CENTRAL_ORIGIN_INVALID");
  }
  return parsed.origin;
}

function secret(file) {
  if (typeof file !== "string" || file === "") fail("TOKEN_FILE_REQUIRED");
  const absolute = path.resolve(file);
  const stat = lstatSync(absolute);
  if (!stat.isFile() || stat.isSymbolicLink()
    || (stat.mode & 0o777) !== 0o600 || stat.size < 32 || stat.size > 4096) {
    fail("TOKEN_FILE_NOT_PRIVATE");
  }
  const bytes = readFileSync(absolute);
  const token = bytes.toString("utf8").trim();
  if (!/^[\x21-\x7e]{32,4096}$/u.test(token)
    || /^Bearer\s/iu.test(token)) fail("TOKEN_INVALID");
  return token;
}

function digest(domain, value) {
  return `sha256:${createHash("sha256")
    .update(`${domain}\0${canonicalizeStrict(value)}`, "utf8").digest("hex")}`;
}

async function jsonResponse(response, code) {
  const contentType = response.headers.get("content-type") ?? "";
  if (!/^application\/json(?:\s*;|\s*$)/iu.test(contentType)) {
    fail(`${code}_CONTENT_TYPE_INVALID`);
  }
  const text = await response.text();
  if (Buffer.byteLength(text, "utf8") > 1024 * 1024) {
    fail(`${code}_BODY_TOO_LARGE`);
  }
  try { return JSON.parse(text); } catch { fail(`${code}_JSON_INVALID`); }
}

const INPUT_FIELDS = Object.freeze([
  "centralOrigin", "tokenFile", "contractId", "routeProposalRefHash",
  "occurrenceRefHash", "recordedAt",
]);

export async function appendProductionRouteProposalOccurrenceV1(input = {},
  dependencies = {}) {
  exact(input, INPUT_FIELDS, "INPUT");
  exact(dependencies, ["fetchImpl"], "DEPENDENCIES");
  if (typeof dependencies.fetchImpl !== "function") fail("FETCH_INVALID");
  const centralOrigin = origin(input.centralOrigin);
  if (typeof input.contractId !== "string"
    || !CONTRACT.test(input.contractId)) fail("CONTRACT_ID_INVALID");
  const routeProposalRefHash = hash(input.routeProposalRefHash,
    "ROUTE_PROPOSAL_REF_HASH");
  const occurrenceRefHash = hash(input.occurrenceRefHash,
    "OCCURRENCE_REF_HASH");
  const recordedAt = instant(input.recordedAt, "RECORDED_AT");
  const bearerToken = secret(input.tokenFile);
  const endpoint
    = `${centralOrigin}/v1/outcomes/${input.contractId}/route-proposals`;
  const headers = { accept: "application/json",
    authorization: `Bearer ${bearerToken}` };
  const readResponse = await dependencies.fetchImpl(endpoint, {
    method: "GET", headers, redirect: "error",
  });
  const read = await jsonResponse(readResponse, "REGISTRY_READ");
  if (readResponse.status !== 200 || read?.ok !== true
    || !HASH.test(read?.registry?.head?.headEventHash ?? "")
    || read.rawEventsProjected !== false) fail("REGISTRY_READ_REJECTED");
  const expectedRegistryHeadHash = read.registry.head.headEventHash;
  const identity = { contractId: input.contractId, routeProposalRefHash,
    occurrenceRefHash, recordedAt };
  const body = {
    schema: "outsider/agent-neutral-route-proposal-append-request/v1",
    recordedAt,
    idempotencyKeyHash: digest(
      "outsider/production-route-proposal-append-idempotency/v1", identity),
    expectedRegistryHeadHash,
    routeProposalRefHash,
    occurrenceRefHash,
  };
  const postResponse = await dependencies.fetchImpl(endpoint, {
    method: "POST",
    headers: { ...headers, "content-type": "application/json" },
    body: canonicalizeStrict(body),
    redirect: "error",
  });
  const post = await jsonResponse(postResponse, "REGISTRY_APPEND");
  if (![200, 201].includes(postResponse.status) || post?.ok !== true
    || post?.result?.rawEventsProjected !== false
    || post?.result?.routeSelected !== false
    || post?.result?.executableCapabilityEstablished !== false
    || post?.result?.capacityEstablished !== false
    || post?.result?.authority !== "NONE"
    || post?.result?.outcomeTruthEstablished !== false
    || post?.result?.outcomeCommitIssued !== false
    || post?.result?.receipt?.routeProposalRefHash !== routeProposalRefHash
    || post?.result?.receipt?.occurrenceRefHash !== occurrenceRefHash
    || post?.result?.receipt?.idempotencyKeyHash !== body.idempotencyKeyHash) {
    fail("REGISTRY_APPEND_REJECTED");
  }
  return Object.freeze({
    schema: "outsider/production-route-proposal-append-receipt/v1",
    schemaVersion: "1.0.0",
    centralOrigin,
    contractId: input.contractId,
    routeProposalRefHash,
    occurrenceRefHash,
    recordedAt,
    idempotencyKeyHash: body.idempotencyKeyHash,
    expectedRegistryHeadHash,
    appendHttpStatus: postResponse.status,
    eventAppended: post.result.eventAppended,
    idempotentReplay: post.result.idempotentReplay,
    registryHead: post.result.head,
    credentialProjected: false,
    rawEventsProjected: false,
    routeSelected: false,
    executableCapabilityEstablished: false,
    capacityEstablished: false,
    authority: "NONE",
    outcomeTruthEstablished: false,
    outcomeCommitIssued: false,
  });
}

const ROUTE_EVIDENCE_APPEND_INPUT_FIELDS = Object.freeze([
  "centralOrigin", "tokenFile", "contractId", "routeEvidence",
]);

/**
 * Verify a seller-neutral user-held evidence artifact, then append only its
 * proposal/occurrence references. The evidence facts never cross this client.
 */
export async function appendProductionBuyerNativeRouteEvidenceV1(input = {},
  dependencies = {}) {
  exact(input, ROUTE_EVIDENCE_APPEND_INPUT_FIELDS,
    "ROUTE_EVIDENCE_APPEND_INPUT");
  exact(dependencies, ["fetchImpl"], "ROUTE_EVIDENCE_APPEND_DEPENDENCIES");
  const routeEvidence = verifyBuyerNativeRouteEvidenceV1(input.routeEvidence);
  const appended = await appendProductionRouteProposalOccurrenceV1({
    centralOrigin: input.centralOrigin,
    tokenFile: input.tokenFile,
    contractId: input.contractId,
    routeProposalRefHash: routeEvidence.routeProposalRefHash,
    occurrenceRefHash: routeEvidence.occurrenceRefHash,
    recordedAt: routeEvidence.observedAt,
  }, dependencies);
  return Object.freeze({
    schema: "outsider/production-buyer-native-route-evidence-append-receipt/v1",
    schemaVersion: "1.0.0",
    routeEvidenceHash: routeEvidence.evidenceHash,
    routeEvidenceRemainedUserHeld: true,
    transmittedRouteProposalRefHash: appended.routeProposalRefHash,
    transmittedOccurrenceRefHash: appended.occurrenceRefHash,
    evidenceFactsTransmitted: false,
    credentialProjected: false,
    capacityEstablished: false,
    authority: "NONE",
    outcomeTruthEstablished: false,
    outcomeCommitIssued: false,
    registryAppend: appended,
  });
}

function parseCli(argv) {
  const values = new Map();
  const allowed = new Set([
    "--origin", "--token-file", "--contract-id", "--route-proposal-ref",
    "--occurrence-ref", "--recorded-at",
  ]);
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    if (!allowed.has(flag) || argv[index + 1] === undefined) {
      fail("ARGUMENT_INVALID");
    }
    values.set(flag, argv[index + 1]);
  }
  return {
    centralOrigin: values.get("--origin") ?? DEFAULT_ORIGIN,
    tokenFile: values.get("--token-file"),
    contractId: values.get("--contract-id"),
    routeProposalRefHash: values.get("--route-proposal-ref"),
    occurrenceRefHash: values.get("--occurrence-ref"),
    recordedAt: values.get("--recorded-at") ?? new Date().toISOString(),
  };
}

if (process.argv[1] !== undefined
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const result = await appendProductionRouteProposalOccurrenceV1(
      parseCli(process.argv.slice(2)), { fetchImpl: fetch });
    process.stdout.write(`${canonicalizeStrict(result)}\n`);
  } catch (error) {
    process.stderr.write(`${String(error?.message ?? error)}\n`);
    process.exitCode = 1;
  }
}
