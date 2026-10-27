import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync,
  symlinkSync, writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { canonicalizeStrict } from "../src/canonical.js";
import {
  NETWORK_INTAKE_BOUNDARY,
  encodeNetworkIntakePayload,
  networkIntakeDigest,
} from "../src/outsider-network-intake.js";
import {
  NETWORK_LIFECYCLE_EVENT_GENESIS,
  NETWORK_LIFECYCLE_HEAD_SCHEMAS,
  createNetworkLifecycleAnchorOutboxRequest,
  createNetworkLifecycleHeadCheckpoint,
  assertNetworkLifecycleAnchorOutboxRequest,
  assertNetworkLifecycleHeadCheckpoint,
  verifyNetworkLifecycleHeadCheckpoint,
} from "../src/outsider-network-lifecycle-head-checkpoint.js";
import {
  buildNetworkLifecycleCheckpointDirectory,
  verifyNetworkLifecycleCheckpointDirectory,
} from "../scripts/network-lifecycle-head-checkpoint.mjs";

const CREATED_AT = "2026-08-28T00:11:00.000Z";
const SOURCE_BOUNDARY = {
  ...NETWORK_INTAKE_BOUNDARY,
  disposition: "QUARANTINED",
  automaticTraining: false,
  trainingRows: 0,
  authorityGrants: 0,
  actionAdmissions: 0,
  ceuUnits: 0,
  permitsAuthority: false,
  permitsAction: false,
  permitsCeu: false,
  permitsCuratePromotion: false,
  permitsPricing: false,
  permitsGuarantee: false,
  permitsSettlement: false,
};

function h(value) {
  return `sha256:${createHash("sha256").update(String(value)).digest("hex")}`;
}

function localDigest(domain, value) {
  const input = typeof value === "string" ? value : canonicalizeStrict(value);
  return `sha256:${createHash("sha256")
    .update(`outsider:network-lifecycle-head:${domain}:v1\0${input}`)
    .digest("hex")}`;
}

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function objectIdentity(payload) {
  const encoded = encodeNetworkIntakePayload(payload);
  return networkIntakeDigest("outsider/network-intake-object/v1", {
    payloadByteHash: encoded.payloadByteHash,
    payloadSemanticHash: encoded.payloadSemanticHash,
    payloadBytes: encoded.payloadBytes,
  });
}

function binding(label, objectIdentityHash) {
  return {
    reservationHash: h(`${label}:reservation`),
    manifestHash: h(`${label}:manifest`),
    lane: label === "a" ? "DELEGATION_RESPONSIBILITY" : "ACTION_OUTCOME",
    clientSubmissionId: `checkpoint_${label}_0001`,
    challengeServerKeyId: h(`${label}:challenge-key`),
    registryId: "checkpoint-test-registry",
    retentionPolicyVersion: "outsider/network-retention-policy/v1",
    appliedRetentionDays: 30,
    retentionUntil: "2026-09-27T00:00:00.000Z",
    objectIdentityHash,
    occurrenceIdentityHash: h(`${label}:occurrence`),
    stableOccurrenceSubjectHash: h(`${label}:stable-subject`),
    semanticSubjectHash: h(`${label}:semantic-subject`),
    censusSlotHash: h(`${label}:census-slot`),
  };
}

function event(previousEventHash, ordinal, selected, eventType, occurredAt, reasonCode) {
  const body = {
    schema: "outsider/network-intake-event/v2",
    ordinal,
    previousEventHash,
    ...selected,
    eventType,
    occurredAt,
    disposition: "QUARANTINED",
    reasonCode,
  };
  return { ...body, eventHash: networkIntakeDigest("lifecycle-event", body) };
}

function cursorFor(selected) {
  return Buffer.from(JSON.stringify({ ordinal: selected.ordinal,
    eventHash: selected.eventHash })).toString("base64url");
}

function fixturePages() {
  const payloadA = { schema: "outsider/checkpoint-fixture-object/v1",
    resultHash: h("payload-a") };
  const payloadB = { schema: "outsider/checkpoint-fixture-object/v1",
    resultHash: h("payload-b") };
  const a = binding("a", objectIdentity(payloadA));
  const b = binding("b", objectIdentity(payloadB));
  const events = [];
  events.push(event(NETWORK_LIFECYCLE_EVENT_GENESIS, 1, a, "RESERVED",
    "2026-08-28T00:00:00.000Z", null));
  events.push(event(events.at(-1).eventHash, 2, a, "QUARANTINED",
    "2026-08-28T00:01:00.000Z", "PENDING_CURATE_REVIEW"));
  events.push(event(events.at(-1).eventHash, 3, b, "RESERVED",
    "2026-08-28T00:02:00.000Z", null));
  events.push(event(events.at(-1).eventHash, 4, b, "QUARANTINED",
    "2026-08-28T00:03:00.000Z", "PENDING_CURATE_REVIEW"));
  events.push(event(events.at(-1).eventHash, 5, a, "REVOKED",
    "2026-08-28T00:04:00.000Z", "SIGNED_TRANSPORT_WITHDRAWAL"));
  const tailHash = events.at(-1).eventHash;
  const item = (selected) => {
    const revoked = selected.reservationHash === a.reservationHash;
    return {
      event: selected,
      object: selected.ordinal === 4 ? payloadB : null,
      derivedState: { reservationStatus: revoked ? "REVOKED" : "SETTLED" },
      retention: {
        retentionUntil: selected.retentionUntil,
        payloadTombstoned: revoked,
        tombstonedAt: revoked ? "2026-08-28T00:04:00.000Z" : null,
      },
    };
  };
  const page = (items, nextCursor, generatedAt) => ({
    schema: "outsider/network-quarantine-export/v1",
    registryId: "checkpoint-test-registry",
    generatedAt,
    lane: null,
    count: items.length,
    items: items.map(item),
    nextCursor,
    eventChain: { eventCount: 5, tailHash, appendOnlyReplayVerified: true },
    derivedLedgerAudit: { verified: true,
      retentionSweep: { generatedAt, sourceClaimOnly: true } },
    occurrencePolicy: "CONTENT_IS_CAS_DEDUPLICATED_OCCURRENCES_ARE_NEVER_DEDUPLICATED",
    useBoundary: SOURCE_BOUNDARY,
  });
  return [page(events.slice(0, 2), cursorFor(events[1]), "2026-08-28T00:08:00.000Z"),
    page(events.slice(2, 4), cursorFor(events[3]), "2026-08-28T00:09:00.000Z"),
    page(events.slice(4), null, "2026-08-28T00:10:00.000Z")];
}

function rawPages(pages = fixturePages()) {
  return pages.map((page) => Buffer.from(`${JSON.stringify(page)}\n`, "utf8"));
}

function artifacts(bytes = rawPages()) {
  const checkpoint = createNetworkLifecycleHeadCheckpoint({ exportPageBytes: bytes,
    createdAt: CREATED_AT });
  const outboxRequest = createNetworkLifecycleAnchorOutboxRequest({ checkpoint });
  return { checkpoint, outboxRequest };
}

function resealCheckpoint(value) {
  const body = structuredClone(value);
  delete body.checkpointHash;
  return { ...body, checkpointHash: localDigest("checkpoint", body) };
}

function resealOutbox(value) {
  const body = structuredClone(value);
  delete body.requestHash;
  return { ...body, requestHash: localDigest("outbox-request", body) };
}

function resealEventPages(pages) {
  const events = pages.flatMap((page) => page.items.map((item) => item.event));
  let previous = NETWORK_LIFECYCLE_EVENT_GENESIS;
  for (let index = 0; index < events.length; index += 1) {
    const selected = events[index];
    selected.ordinal = index + 1;
    selected.previousEventHash = previous;
    const body = { ...selected };
    delete body.eventHash;
    selected.eventHash = networkIntakeDigest("lifecycle-event", body);
    previous = selected.eventHash;
  }
  for (let index = 0; index < pages.length; index += 1) {
    const page = pages[index];
    page.count = page.items.length;
    page.eventChain.eventCount = events.length;
    page.eventChain.tailHash = previous;
    page.nextCursor = index === pages.length - 1 ? null
      : cursorFor(page.items.at(-1).event);
  }
  return pages;
}

test("full unfiltered exact export bytes produce only a local commitment and digest outbox", () => {
  const bytes = rawPages();
  const { checkpoint, outboxRequest } = artifacts(bytes);
  assert.equal(checkpoint.schema, NETWORK_LIFECYCLE_HEAD_SCHEMAS.checkpoint);
  assert.equal(checkpoint.registryId, "checkpoint-test-registry");
  assert.equal(checkpoint.eventCount, 5);
  assert.equal(checkpoint.coveredFromOrdinal, 1);
  assert.equal(checkpoint.coveredToOrdinal, 5);
  assert.match(checkpoint.tailHash, /^sha256:[a-f0-9]{64}$/);
  assert.match(checkpoint.exportSetRoot, /^sha256:[a-f0-9]{64}$/);
  assert.equal(checkpoint.localCheckpointOnly, true);
  assert.equal(checkpoint.selfSignaturePresent, false);
  assert.equal(checkpoint.externalAnchorEstablished, false);
  assert.equal(checkpoint.independentWitnessEstablished, false);
  assert.equal(checkpoint.wormStorageEstablished, false);
  assert.equal(checkpoint.nonOmissionProofEstablished, false);
  assert.deepEqual(checkpoint.useBoundary, {
    authority: "NONE", authorityGrants: 0, actionAuthorized: false, actionAdmissions: 0,
    productionTrainingAuthorized: false, trainingRows: 0, causalExperienceUnits: 0,
    pricingAuthorized: false, guaranteeEstablished: false, settlementAuthorized: false,
  });

  assert.equal(outboxRequest.schema, NETWORK_LIFECYCLE_HEAD_SCHEMAS.outboxRequest);
  assert.equal(outboxRequest.checkpointHash, checkpoint.checkpointHash);
  assert.equal(outboxRequest.rawEventsIncluded, false);
  assert.equal(outboxRequest.rawObjectsIncluded, false);
  assert.equal(outboxRequest.rawPayloadsIncluded, false);
  assert.equal(outboxRequest.exportPageBytesIncluded, false);
  assert.equal(outboxRequest.networkSubmissionPerformed, false);
  assert.equal(outboxRequest.providerReceiptPresent, false);
  assert.equal(outboxRequest.externalAnchorEstablished, false);
  const wire = JSON.stringify(outboxRequest);
  assert.doesNotMatch(wire, /checkpoint-fixture-object|resultHash|reservationHash|eventHash/);

  const report = verifyNetworkLifecycleHeadCheckpoint({ exportPageBytes: bytes, checkpoint,
    outboxRequest, expectedCheckpointHash: checkpoint.checkpointHash });
  assert.equal(report.eventCount, 5);
  assert.equal(report.source.pageCount, 3);
  assert.equal(report.source.exactGatewayResponseBytesReplayed, true);
  assert.equal(report.localChecks.eventHashesRecomputed, true);
  assert.equal(report.localChecks.paginationCursorsAndTailReplayed, true);
  assert.equal(report.limitations.externalAnchorEstablished, false);
  assert.equal(report.limitations.independentWitnessEstablished, false);
  assert.equal(report.limitations.wormStorageEstablished, false);
  assert.equal(report.limitations.nonOmissionProofEstablished, false);
  assert.equal(report.limitations.serverNonEquivocationEstablished, false);
  assert.equal(report.limitations.serverCompletenessEstablished, false);
  assert.equal(report.limitations.generatedAtIsExternalTimeEvidence, false);
  assert.equal(report.limitations.derivedLedgerAuditIndependentlyReplayed, false);
  assert.equal(report.useBoundary.trainingRows, 0);
  assert.equal(report.useBoundary.authorityGrants, 0);
  assert.equal(report.useBoundary.actionAdmissions, 0);
  assert.equal(report.useBoundary.causalExperienceUnits, 0);
});

test("deeply frozen in-memory pages are an explicit alternative, not claimed HTTP bytes", () => {
  const pages = deepFreeze(structuredClone(fixturePages()));
  const checkpoint = createNetworkLifecycleHeadCheckpoint({ frozenPages: pages,
    createdAt: CREATED_AT });
  const rawCheckpoint = createNetworkLifecycleHeadCheckpoint({ exportPageBytes: rawPages(),
    createdAt: CREATED_AT });
  assert.equal(checkpoint.checkpointHash, rawCheckpoint.checkpointHash,
    "the same deterministic JSON page bytes produce the same exact export root");
  const outboxRequest = createNetworkLifecycleAnchorOutboxRequest({ checkpoint });
  const report = verifyNetworkLifecycleHeadCheckpoint({ frozenPages: pages, checkpoint,
    outboxRequest, expectedCheckpointHash: checkpoint.checkpointHash });
  assert.equal(report.source.exactGatewayResponseBytesReplayed, false);
  assert.equal(report.source.inMemoryExactFrozenPagesReplayed, true);

  assert.throws(() => createNetworkLifecycleHeadCheckpoint({
    frozenPages: structuredClone(fixturePages()), createdAt: CREATED_AT,
  }), /FROZEN_SOURCE_PAGES_INVALID/);
});

test("page omissions, duplicates, reordering, lane filters and cursor splices fail closed", () => {
  const pages = fixturePages();
  const cases = [
    ["missing page", [pages[0], pages[2]]],
    ["duplicate page", [pages[0], pages[1], pages[1], pages[2]]],
    ["reordered page", [pages[1], pages[0], pages[2]]],
  ];
  for (const [name, selected] of cases) {
    assert.throws(() => createNetworkLifecycleHeadCheckpoint({ exportPageBytes: rawPages(selected),
      createdAt: CREATED_AT }), /NETWORK_LIFECYCLE_HEAD_/, name);
  }

  const splice = structuredClone(pages);
  splice[0].nextCursor = cursorFor(splice[1].items[0].event);
  assert.throws(() => createNetworkLifecycleHeadCheckpoint({ exportPageBytes: rawPages(splice),
    createdAt: CREATED_AT }), /EXPORT_CURSOR_SPLICE/);

  const finalCursor = structuredClone(pages);
  finalCursor.at(-1).nextCursor = cursorFor(finalCursor.at(-1).items[0].event);
  assert.throws(() => createNetworkLifecycleHeadCheckpoint({ exportPageBytes: rawPages(finalCursor),
    createdAt: CREATED_AT }), /EXPORT_FINAL_CURSOR_NOT_NULL/);

  const laneFiltered = structuredClone(pages);
  laneFiltered.forEach((page) => { page.lane = "ACTION_OUTCOME"; });
  assert.throws(() => createNetworkLifecycleHeadCheckpoint({
    exportPageBytes: rawPages(laneFiltered), createdAt: CREATED_AT,
  }), /EXPORT_PAGE_FIELD_INVALID/);

  const snapshotDrift = structuredClone(pages);
  snapshotDrift[1].eventChain.tailHash = h("different-advertised-tail");
  assert.throws(() => createNetworkLifecycleHeadCheckpoint({
    exportPageBytes: rawPages(snapshotDrift), createdAt: CREATED_AT,
  }), /EXPORT_SNAPSHOT_DRIFT/);
});

test("event fields, exact gateway JSON, retained object identity and semantic replay fail closed", () => {
  const cases = [
    ["ordinal", (pages) => { pages[1].items[0].event.ordinal = 99; }],
    ["previous", (pages) => { pages[2].items[0].event.previousEventHash = h("splice"); }],
    ["schema", (pages) => { pages[0].items[0].event.schema = "outsider/event/v999"; }],
    ["disposition", (pages) => { pages[0].items[0].event.disposition = "ADMITTED"; }],
    ["retention", (pages) => {
      pages[0].items[0].event.retentionUntil = "2026-09-28T00:00:00.000Z";
    }],
    ["registry", (pages) => { pages[1].registryId = "different-registry"; }],
    ["object content addition", (pages) => { pages[1].items[1].object.extraHash = h("added"); }],
  ];
  for (const [name, mutate] of cases) {
    const pages = structuredClone(fixturePages());
    mutate(pages);
    assert.throws(() => createNetworkLifecycleHeadCheckpoint({ exportPageBytes: rawPages(pages),
      createdAt: CREATED_AT }), /NETWORK_LIFECYCLE_HEAD_|NETWORK_INTAKE_/, name);
  }

  const bytes = rawPages();
  const alternateWhitespace = Buffer.from(bytes[0].toString("utf8")
    .replace('{"schema"', '{ "schema"'), "utf8");
  assert.throws(() => createNetworkLifecycleHeadCheckpoint({
    exportPageBytes: [alternateWhitespace, bytes[1], bytes[2]], createdAt: CREATED_AT,
  }), /SOURCE_PAGE_BYTES_NOT_EXACT_GATEWAY_JSON/);

  const illegalRevocationChain = structuredClone(fixturePages());
  illegalRevocationChain[2].items[0].event.eventType = "QUARANTINED";
  illegalRevocationChain[2].items[0].event.reasonCode = "PENDING_CURATE_REVIEW";
  resealEventPages(illegalRevocationChain);
  assert.throws(() => createNetworkLifecycleHeadCheckpoint({
    exportPageBytes: rawPages(illegalRevocationChain), createdAt: CREATED_AT,
  }), /EVENT_REPLAY_INVALID/,
  "valid hashes cannot turn a second settlement into a valid REVOKED successor");

  const middleDeletedAndResealed = structuredClone(fixturePages());
  middleDeletedAndResealed[1].items.shift();
  resealEventPages(middleDeletedAndResealed);
  assert.throws(() => createNetworkLifecycleHeadCheckpoint({
    exportPageBytes: rawPages(middleDeletedAndResealed), createdAt: CREATED_AT,
  }), /EVENT_(?:REPLAY_INVALID|BINDING_DRIFT)/,
  "deleting a reservation then resealing all later event hashes is still invalid");
});

test("source-aware verification rejects locally resealed registry, count, tail and claims", () => {
  const bytes = rawPages();
  const { checkpoint, outboxRequest } = artifacts(bytes);
  const mutations = [
    (value) => { value.registryId = "self-resealed-registry"; },
    (value) => {
      value.eventCount = 4; value.coveredToOrdinal = 4; value.coveredFromOrdinal = 1;
    },
    (value) => { value.tailHash = h("self-resealed-tail"); },
  ];
  for (const mutate of mutations) {
    const changed = structuredClone(checkpoint);
    mutate(changed);
    const resealed = resealCheckpoint(changed);
    const reboundOutbox = createNetworkLifecycleAnchorOutboxRequest({ checkpoint: resealed });
    assert.throws(() => verifyNetworkLifecycleHeadCheckpoint({ exportPageBytes: bytes,
      checkpoint: resealed, outboxRequest: reboundOutbox,
      expectedCheckpointHash: resealed.checkpointHash }), /CHECKPOINT_SOURCE_MISMATCH/);
  }

  const positive = structuredClone(checkpoint);
  positive.externalAnchorEstablished = true;
  assert.throws(() => assertNetworkLifecycleHeadCheckpoint(resealCheckpoint(positive)),
    /CHECKPOINT_INVALID/);
  const actionClaim = structuredClone(checkpoint);
  actionClaim.useBoundary.actionAuthorized = true;
  assert.throws(() => assertNetworkLifecycleHeadCheckpoint(resealCheckpoint(actionClaim)),
    /CHECKPOINT_INVALID/);

  assert.throws(() => verifyNetworkLifecycleHeadCheckpoint({ exportPageBytes: bytes, checkpoint,
    outboxRequest }), /CALLER_PINNED_CHECKPOINT_HASH_REQUIRED/);
  assert.throws(() => verifyNetworkLifecycleHeadCheckpoint({ exportPageBytes: bytes, checkpoint,
    outboxRequest, expectedCheckpointHash: h("wrong-pin") }),
  /CALLER_PINNED_CHECKPOINT_MISMATCH/);
});

test("outbox is exact-shape digest-only and cannot be resealed into a receipt or permission", () => {
  const { checkpoint, outboxRequest } = artifacts();
  const raw = structuredClone(outboxRequest);
  raw.rawEventsIncluded = true;
  assert.throws(() => assertNetworkLifecycleAnchorOutboxRequest(resealOutbox(raw), { checkpoint }),
    /OUTBOX_REQUEST_INVALID/);

  const receipt = structuredClone(outboxRequest);
  receipt.providerReceipt = { accepted: true };
  receipt.requestHash = localDigest("outbox-request", (() => {
    const body = structuredClone(receipt); delete body.requestHash; return body;
  })());
  assert.throws(() => assertNetworkLifecycleAnchorOutboxRequest(receipt, { checkpoint }),
    /OUTBOX_REQUEST_SHAPE_INVALID/);

  const authority = structuredClone(outboxRequest);
  authority.useBoundary.authorityGrants = 1;
  assert.throws(() => assertNetworkLifecycleAnchorOutboxRequest(resealOutbox(authority),
    { checkpoint }), /OUTBOX_REQUEST_INVALID/);
});

test("proxy/accessor inputs are rejected without invoking traps", () => {
  let proxyGets = 0;
  const proxyPages = new Proxy(rawPages(), {
    get(target, key, receiver) {
      proxyGets += 1;
      return Reflect.get(target, key, receiver);
    },
  });
  assert.throws(() => createNetworkLifecycleHeadCheckpoint({
    exportPageBytes: proxyPages, createdAt: CREATED_AT,
  }), /SOURCE_PAGES_INVALID/);
  assert.equal(proxyGets, 0);

  let getterCalls = 0;
  const accessorOptions = { createdAt: CREATED_AT };
  Object.defineProperty(accessorOptions, "exportPageBytes", {
    enumerable: true,
    get() { getterCalls += 1; return rawPages(); },
  });
  assert.throws(() => createNetworkLifecycleHeadCheckpoint(accessorOptions),
    /CREATE_OPTIONS_DESCRIPTOR_INVALID/);
  assert.equal(getterCalls, 0);

  const accessorPage = structuredClone(fixturePages()[0]);
  Object.defineProperty(accessorPage, "registryId", {
    enumerable: true, configurable: false, get() { getterCalls += 1; return "forged"; },
  });
  Object.freeze(accessorPage);
  const remainingPages = structuredClone(fixturePages().slice(1));
  deepFreeze(remainingPages);
  const frozen = Object.freeze([accessorPage, ...remainingPages]);
  getterCalls = 0;
  assert.throws(() => createNetworkLifecycleHeadCheckpoint({ frozenPages: frozen,
    createdAt: CREATED_AT }), /SOURCE_ACCESSOR_FORBIDDEN/);
  assert.equal(getterCalls, 0);
});

test("captured JSON, hash, array, string and Buffer intrinsics survive post-import replacement", () => {
  const bytes = rawPages();
  const { checkpoint, outboxRequest } = artifacts(bytes);
  const hashPrototype = Object.getPrototypeOf(createHash("sha256"));
  const replacements = [
    [JSON, "parse"], [JSON, "stringify"],
    [Array.prototype, "includes"], [Array.prototype, "join"],
    [Array.prototype, "map"], [Array.prototype, "push"],
    [Array.prototype, "some"], [Array.prototype, "sort"],
    [String.prototype, "slice"], [String.prototype, "startsWith"],
    [Buffer.prototype, "equals"], [Buffer.prototype, "toString"],
    [hashPrototype, "update"], [hashPrototype, "digest"],
  ].map(([object, key]) => ({ object, key, value: object[key] }));
  let report;
  let failure;
  try {
    for (const replacement of replacements) {
      replacement.object[replacement.key] = () => { throw new Error("POISONED_INTRINSIC"); };
    }
    report = verifyNetworkLifecycleHeadCheckpoint({ exportPageBytes: bytes, checkpoint,
      outboxRequest, expectedCheckpointHash: checkpoint.checkpointHash });
  } catch (error) {
    failure = error;
  } finally {
    for (const replacement of replacements) {
      replacement.object[replacement.key] = replacement.value;
    }
  }
  assert.ifError(failure);
  assert.equal(report.eventCount, 5);
});

test("empty captured Set construction survives simultaneous global and prototype poisoning", () => {
  const bytes = rawPages();
  const expected = artifacts(bytes);
  const NativeSet = globalThis.Set;
  const originalAdd = NativeSet.prototype.add;
  const originalDelete = NativeSet.prototype.delete;
  const originalHas = NativeSet.prototype.has;
  let checkpoint;
  let report;
  let failure;
  try {
    globalThis.Set = class PoisonedGlobalSet {
      constructor() { throw new Error("POISONED_GLOBAL_SET"); }
    };
    NativeSet.prototype.add = () => { throw new Error("POISONED_SET_ADD"); };
    NativeSet.prototype.delete = () => { throw new Error("POISONED_SET_DELETE"); };
    NativeSet.prototype.has = () => { throw new Error("POISONED_SET_HAS"); };
    checkpoint = createNetworkLifecycleHeadCheckpoint({ exportPageBytes: bytes,
      createdAt: CREATED_AT });
    report = verifyNetworkLifecycleHeadCheckpoint({ exportPageBytes: bytes, checkpoint,
      outboxRequest: expected.outboxRequest,
      expectedCheckpointHash: expected.checkpoint.checkpointHash });
  } catch (error) {
    failure = error;
  } finally {
    NativeSet.prototype.add = originalAdd;
    NativeSet.prototype.delete = originalDelete;
    NativeSet.prototype.has = originalHas;
    globalThis.Set = NativeSet;
  }
  assert.ifError(failure);
  assert.equal(checkpoint.checkpointHash, expected.checkpoint.checkpointHash);
  assert.equal(report.verificationHash,
    verifyNetworkLifecycleHeadCheckpoint({ exportPageBytes: bytes,
      checkpoint: expected.checkpoint, outboxRequest: expected.outboxRequest,
      expectedCheckpointHash: expected.checkpoint.checkpointHash }).verificationHash);
});

test("captured Map constructor and methods reject a validly resealed double settlement", () => {
  const validBytes = rawPages();
  const expected = createNetworkLifecycleHeadCheckpoint({ exportPageBytes: validBytes,
    createdAt: CREATED_AT });
  const illegal = structuredClone(fixturePages());
  illegal[2].items[0].event.eventType = "QUARANTINED";
  illegal[2].items[0].event.reasonCode = "PENDING_CURATE_REVIEW";
  resealEventPages(illegal);
  const illegalBytes = rawPages(illegal);

  const NativeMap = globalThis.Map;
  const nativeGet = NativeMap.prototype.get;
  const nativeEntries = NativeMap.prototype.entries;
  let role = 0;
  class StateWashingMap extends NativeMap {
    constructor(...args) {
      super(...args);
      this.role = role++;
    }

    get(key) {
      const actual = nativeGet.call(this, key);
      return this.role % 3 === 0 && actual === "SETTLED" ? "OPEN" : actual;
    }

    *[Symbol.iterator]() {
      for (const entry of nativeEntries.call(this)) {
        yield this.role % 3 === 2 ? [entry[0], "OPEN"] : entry;
      }
    }
  }
  try {
    globalThis.Map = StateWashingMap;
    const stable = createNetworkLifecycleHeadCheckpoint({ exportPageBytes: validBytes,
      createdAt: CREATED_AT });
    assert.equal(stable.checkpointHash, expected.checkpointHash);
    assert.throws(() => createNetworkLifecycleHeadCheckpoint({ exportPageBytes: illegalBytes,
      createdAt: CREATED_AT }), /EVENT_REPLAY_INVALID/);
  } finally {
    globalThis.Map = NativeMap;
  }

  const originalGet = NativeMap.prototype.get;
  const originalSet = NativeMap.prototype.set;
  const originalIterator = NativeMap.prototype[Symbol.iterator];
  const roles = new WeakMap();
  let stable;
  let rejected = false;
  let failure;
  try {
    NativeMap.prototype.set = function poisonedSet(key, value) {
      if (!roles.has(this)) {
        roles.set(this, value === "OPEN" ? "state"
          : value && typeof value === "object" ? "bindings" : "displayed");
      }
      return originalSet.call(this, key, value);
    };
    NativeMap.prototype.get = function poisonedGet(key) {
      const actual = originalGet.call(this, key);
      return roles.get(this) === "state" && actual === "SETTLED" ? "OPEN" : actual;
    };
    NativeMap.prototype[Symbol.iterator] = function* poisonedIterator() {
      for (const entry of originalIterator.call(this)) {
        yield roles.get(this) === "displayed" ? [entry[0], "OPEN"] : entry;
      }
    };
    stable = createNetworkLifecycleHeadCheckpoint({ exportPageBytes: validBytes,
      createdAt: CREATED_AT });
    try {
      createNetworkLifecycleHeadCheckpoint({ exportPageBytes: illegalBytes,
        createdAt: CREATED_AT });
    } catch (error) {
      rejected = /EVENT_REPLAY_INVALID/.test(String(error?.message ?? error));
    }
  } catch (error) {
    failure = error;
  } finally {
    NativeMap.prototype.get = originalGet;
    NativeMap.prototype.set = originalSet;
    NativeMap.prototype[Symbol.iterator] = originalIterator;
  }
  assert.ifError(failure);
  assert.equal(stable.checkpointHash, expected.checkpointHash);
  assert.equal(rejected, true);
});

test("the empty exact chain seals genesis with zero coverage and no stronger claim", () => {
  const page = fixturePages()[0];
  page.count = 0;
  page.items = [];
  page.nextCursor = null;
  page.eventChain.eventCount = 0;
  page.eventChain.tailHash = NETWORK_LIFECYCLE_EVENT_GENESIS;
  const checkpoint = createNetworkLifecycleHeadCheckpoint({ exportPageBytes: rawPages([page]),
    createdAt: CREATED_AT });
  assert.equal(checkpoint.eventCount, 0);
  assert.equal(checkpoint.coveredFromOrdinal, 0);
  assert.equal(checkpoint.coveredToOrdinal, 0);
  assert.equal(checkpoint.tailHash, NETWORK_LIFECYCLE_EVENT_GENESIS);
  assert.equal(checkpoint.externalAnchorEstablished, false);
});

test("offline CLI publishes a marker-last complete 0600 set in a claimed 0700 directory", (t) => {
  const root = mkdtempSync(path.join(tmpdir(), "outsider-lifecycle-checkpoint-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const source = path.join(root, "source");
  const pages = rawPages();
  const pageFiles = pages.map((bytes, index) => {
    const target = `${source}-${index + 1}.json`;
    writeFileSync(target, bytes, { mode: 0o600, flag: "wx" });
    return target;
  });
  const output = path.join(root, "sealed");
  const args = [path.resolve("scripts/network-lifecycle-head-checkpoint.mjs")];
  for (const file of pageFiles) args.push("--page", file);
  args.push("--created-at", CREATED_AT, "--out-dir", output);
  const first = spawnSync(process.execPath, args, { cwd: path.resolve("."), encoding: "utf8" });
  assert.equal(first.status, 0, first.stderr);
  assert.equal(lstatSync(output).isSymbolicLink(), false);
  assert.equal(statSync(output).mode & 0o777, 0o700);
  assert.deepEqual(readdirSync(output).sort(), ["anchor-outbox-request.json", "checkpoint.json",
    "complete.json", "verification.json"]);
  for (const name of ["checkpoint.json", "anchor-outbox-request.json", "verification.json",
    "complete.json"]) {
    const target = path.join(output, name);
    assert.equal(statSync(target).mode & 0o777, 0o600, name);
    assert.equal(lstatSync(target).isSymbolicLink(), false, name);
  }
  const outbox = readFileSync(path.join(output, "anchor-outbox-request.json"), "utf8");
  assert.doesNotMatch(outbox, /checkpoint-fixture-object|resultHash|reservationHash|eventHash/);
  assert.equal(JSON.parse(outbox).networkSubmissionPerformed, false);
  const marker = JSON.parse(readFileSync(path.join(output, "complete.json"), "utf8"));
  assert.equal(marker.localDirectoryCompletionOnly, true);
  assert.equal(marker.sourceReplayReportedBeforePublication, true);
  assert.equal(marker.sourcePagesStored, false);
  assert.equal(marker.providerReceiptPresent, false);
  assert.equal(marker.externalAnchorEstablished, false);
  assert.equal(marker.independentWitnessEstablished, false);
  assert.equal(marker.wormStorageEstablished, false);
  assert.equal(marker.nonOmissionProofEstablished, false);
  assert.equal(marker.networkSubmissionPerformed, false);
  const directoryVerification = verifyNetworkLifecycleCheckpointDirectory(output);
  assert.equal(directoryVerification.directoryComplete, true);
  assert.equal(directoryVerification.sourceReplayReperformed, false);
  assert.equal(directoryVerification.externalAnchorEstablished, false);

  const verifyCli = spawnSync(process.execPath, [
    path.resolve("scripts/network-lifecycle-head-checkpoint.mjs"),
    "verify-dir", "--dir", output,
  ], { cwd: path.resolve("."), encoding: "utf8" });
  assert.equal(verifyCli.status, 0, verifyCli.stderr);
  assert.equal(JSON.parse(verifyCli.stdout).directoryComplete, true);

  const repeated = spawnSync(process.execPath, args,
    { cwd: path.resolve("."), encoding: "utf8" });
  assert.notEqual(repeated.status, 0);
  assert.match(repeated.stderr, /OUTPUT_DIRECTORY_EXISTS/);

  const linked = path.join(root, "source-link.json");
  symlinkSync(pageFiles[0], linked);
  const linkOutput = path.join(root, "link-output");
  const linkedRun = spawnSync(process.execPath, [
    path.resolve("scripts/network-lifecycle-head-checkpoint.mjs"),
    "--page", linked, "--created-at", CREATED_AT, "--out-dir", linkOutput,
  ], { cwd: path.resolve("."), encoding: "utf8" });
  assert.notEqual(linkedRun.status, 0);
  assert.match(linkedRun.stderr, /SOURCE_PAGE_PRIVATE_REGULAR_FILE_REQUIRED/);
});

test("partial targets fail closed and an empty-directory claim race preserves dev/ino", (t) => {
  const root = mkdtempSync(path.join(tmpdir(), "outsider-lifecycle-publish-race-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const pageFiles = rawPages().map((bytes, index) => {
    const target = path.join(root, `page-${index + 1}.json`);
    writeFileSync(target, bytes, { mode: 0o600, flag: "wx" });
    return target;
  });

  const partial = path.join(root, "partial");
  mkdirSync(partial, { mode: 0o700 });
  writeFileSync(path.join(partial, "checkpoint.json"), "{}\n",
    { mode: 0o600, flag: "wx" });
  assert.throws(() => verifyNetworkLifecycleCheckpointDirectory(partial),
    /CHECKPOINT_DIRECTORY_INCOMPLETE/,
  "no complete marker means a visible partial directory is never accepted");

  const racedTarget = path.join(root, "raced-target");
  let before;
  assert.throws(() => buildNetworkLifecycleCheckpointDirectory({ pageFiles,
    createdAt: CREATED_AT, outDir: racedTarget,
    beforeClaim({ targetDirectory, stagingDirectory }) {
      assert.equal(targetDirectory, racedTarget);
      assert.equal(verifyNetworkLifecycleCheckpointDirectory(stagingDirectory)
        .directoryComplete, true, "staging is fully written and verified before claim");
      mkdirSync(targetDirectory, { mode: 0o700 });
      before = lstatSync(targetDirectory, { bigint: true });
    },
  }), /OUTPUT_DIRECTORY_EXISTS/);
  const after = lstatSync(racedTarget, { bigint: true });
  assert.equal(after.dev, before.dev);
  assert.equal(after.ino, before.ino);
  assert.equal(after.mode, before.mode);
  assert.deepEqual(readdirSync(racedTarget), [],
    "the competing empty directory is never overwritten or populated");
  assert.throws(() => verifyNetworkLifecycleCheckpointDirectory(racedTarget),
    /CHECKPOINT_DIRECTORY_INCOMPLETE/);
});
