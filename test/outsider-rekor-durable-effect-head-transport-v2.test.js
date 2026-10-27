import test from "node:test";
import assert from "node:assert/strict";
import {
  createHash, generateKeyPairSync, sign,
} from "node:crypto";
import {
  chmodSync, mkdtempSync, readFileSync, realpathSync, rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { canonicalizeStrict } from "../src/canonical.js";
import {
  publishDurableEffectLedgerExternalHeadV1,
} from "../src/outsider-durable-effect-ledger-external-head-publication-v1.js";
import {
  createDurableOneUseEndpointEffectEventV1,
  initializeDurableOneUseEndpointEffectLedgerV1,
} from "../src/outsider-durable-one-use-endpoint-effect-ledger-v1.js";
import {
  createRekorDurableEffectHeadTransportV2,
  createRekorV2PinnedTufServiceSelectionV2,
  createRekorV2ReconciliationQueryV2,
  initializeRekorDurableEffectHeadJournalV2,
  readCapturedRekorDurableEffectHeadBundleV2,
  reconcileRekorV2DurableEffectHeadFromResponseV2,
  verifyRekorDurableEffectHeadJournalV2,
} from "../src/outsider-rekor-durable-effect-head-transport-v2.js";

const ORIGIN = "https://log.fixture.test";
const HOST = "log.fixture.test";
const LEDGER_ID = "ledger_0123456789abcdef0123456789abcdef";
const AT = "2026-09-03T22:00:00.000Z";

function h(label) {
  return `sha256:${createHash("sha256").update(label).digest("hex")}`;
}

function target(targetPath, value) {
  const bytes = Buffer.from(JSON.stringify(value));
  return { targetPath, expectedLength: bytes.length,
    expectedSha256: createHash("sha256").update(bytes).digest("hex"), bytes };
}

function checkpointKeyId(publicKey, host = HOST) {
  const jwk = publicKey.export({ format: "jwk" });
  return createHash("sha256").update(Buffer.concat([
    Buffer.from(`${host}\n`), Buffer.from([1]), Buffer.from(jwk.x, "base64url"),
  ])).digest();
}

function selectionFixture() {
  const log = generateKeyPairSync("ed25519");
  const publicDer = log.publicKey.export({ type: "spki", format: "der" });
  const keyId = checkpointKeyId(log.publicKey);
  const signingConfig = {
    mediaType: "application/vnd.dev.sigstore.signingconfig.v0.2+json",
    rekorTlogUrls: [
      { url: "https://legacy.fixture.test", majorApiVersion: 1,
        validFor: { start: "2026-08-01T00:00:00Z" }, operator: "fixture.test" },
      { url: ORIGIN, majorApiVersion: 2,
        validFor: { start: "2026-01-01T00:00:00Z" }, operator: "fixture.test" },
    ],
    rekorTlogConfig: { selector: "ANY" },
  };
  const trustedRoot = {
    mediaType: "application/vnd.dev.sigstore.trustedroot+json;version=0.1",
    tlogs: [{
      baseUrl: ORIGIN,
      hashAlgorithm: "SHA2_256",
      publicKey: { rawBytes: publicDer.toString("base64"),
        keyDetails: "PKIX_ED25519",
        validFor: { start: "2026-01-01T00:00:00Z" } },
      logId: { keyId: keyId.toString("base64") },
    }],
  };
  const selection = createRekorV2PinnedTufServiceSelectionV2({
    signingConfigTarget: target("delegated/custom-signing-rekor-v2.json",
      signingConfig),
    trustedRootTarget: target("trusted_root.json", trustedRoot),
    selectedAt: AT,
  });
  return { selection, log };
}

function setupLedger(t) {
  const parent = realpathSync(mkdtempSync(path.join(tmpdir(), "outsider-rekor-v2-")));
  chmodSync(parent, 0o700);
  t.after(() => rmSync(parent, { recursive: true, force: true }));
  const directory = path.join(parent, "effect-ledger");
  const event = createDurableOneUseEndpointEffectEventV1({
    ledgerId: LEDGER_ID,
    eventType: "INTENT_ADMITTED",
    effectIdHash: h("effect"),
    transactionBindingHash: h("transaction"),
    endpointBindingHash: h("endpoint"),
    adapterInstanceRefHash: h("adapter"),
    permissionGrantHash: h("grant"),
    oneUseNonceHash: h("nonce"),
    idempotencyKeyHash: h("idempotency"),
    bodyHash: h("body"),
    effectDeadline: "2026-09-04T00:00:00.000Z",
    recordedAt: "2026-09-03T21:00:00.000Z",
    previousEffectEventHash: null,
    occurrenceNonceHash: h("occurrence"),
    endpointReceiptHash: null,
    terminalEvidenceHash: null,
  });
  const verified = initializeDurableOneUseEndpointEffectLedgerV1({
    directory, ledgerId: LEDGER_ID, genesisEvent: event,
  });
  const journal = initializeRekorDurableEffectHeadJournalV2(
    path.join(parent, "rekor-journal"));
  return { parent, directory, verified, journal };
}

function operator() {
  return generateKeyPairSync("ec", { namedCurve: "prime256v1" })
    .privateKey.export({ type: "pkcs8", format: "pem" });
}

function rekorResponse(proposal, selection, log, mutate = null) {
  const canonicalEntry = {
    apiVersion: "0.0.2",
    kind: "hashedrekord",
    spec: { hashedRekordV002: {
      data: { algorithm: "SHA2_256",
        digest: proposal.hashedRekordRequestV002.digest },
      signature: proposal.hashedRekordRequestV002.signature,
    } },
  };
  const entryBytes = Buffer.from(canonicalizeStrict(canonicalEntry));
  const leaf = createHash("sha256").update(Buffer.concat([
    Buffer.from([0]), entryBytes,
  ])).digest();
  const signed = `${HOST}\n1\n${leaf.toString("base64")}\n`;
  const noteSignature = sign(null, Buffer.from(signed), log.privateKey);
  const keyId = Buffer.from(selection.logTrust.checkpointKeyIdBase64, "base64");
  const envelope = `${signed}\n— ${HOST} ${Buffer.concat([
    keyId.subarray(0, 4), noteSignature,
  ]).toString("base64")}\n`;
  const response = {
    logIndex: "0",
    logId: { keyId: selection.logTrust.logIdKeyIdBase64 },
    kindVersion: { kind: "hashedrekord", version: "0.0.2" },
    integratedTime: "0",
    inclusionPromise: null,
    inclusionProof: { logIndex: "0", rootHash: leaf.toString("base64"),
      treeSize: "1", hashes: [], checkpoint: { envelope } },
    canonicalizedBody: entryBytes.toString("base64"),
  };
  if (mutate) mutate(response);
  return JSON.stringify(response);
}

function input(ledger) {
  return {
    localLedger: { directory: ledger.directory, ledgerId: LEDGER_ID,
      expectedLocalHeadHash: ledger.verified.head.headHash },
    publishedAt: AT,
    externalChain: { expectedSequence: 1, previousReceiptHash: null },
  };
}

test("arbitrary pinned target name selects active v2 and one response is durably replayable",
  async (t) => {
    const ledger = setupLedger(t);
    const fixture = selectionFixture();
    const calls = [];
    const fetchImpl = async (url, options) => {
      calls.push({ url, options });
      return new Response(rekorResponse(JSON.parse(options.body),
        fixture.selection, fixture.log), {
        status: 200, headers: { "content-type": "application/json" },
      });
    };
    const adapter = createRekorDurableEffectHeadTransportV2({
      selection: fixture.selection,
      expectedSelectionHash: fixture.selection.selectionHash,
      operatorPrivateKeyPem: operator(),
      tufRoleChainVerificationHash: h("tuf-role-chain"),
      journalDirectory: ledger.journal,
      fetchImpl,
      clock: () => AT,
    });
    const published = await publishDurableEffectLedgerExternalHeadV1(input(ledger), {
      transport: adapter.transport,
      transportId: adapter.transportId,
      transportPolicyHash: adapter.transportPolicyHash,
      timeoutMs: 20_000,
    });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, `${ORIGIN}/api/v2/log/entries`);
    assert.equal(calls[0].options.method, "POST");
    assert.equal(JSON.parse(calls[0].options.body).hashedRekordRequestV002
      .signature.verifier.keyDetails, "PKIX_ECDSA_P256_SHA_256");
    const bundle = readCapturedRekorDurableEffectHeadBundleV2(adapter, {
      expectedBundleHash: published.receipt.providerReceiptHash,
    });
    assert.equal(bundle.facts.rfc6962InclusionProofVerified, true);
    assert.equal(bundle.facts.pinnedCheckpointSignatureVerified, true);
    assert.equal(bundle.facts.trustedTimeEstablished, false);
    assert.equal(bundle.authority, "NONE");
    assert.equal(bundle.decisionState, "HOLD");
    const replay = verifyRekorDurableEffectHeadJournalV2({
      directory: ledger.journal, expectedHeadHash: null,
    });
    assert.deepEqual(replay.phases,
      ["PREPARED", "POST_ATTEMPTED", "RESPONSE_OBSERVED", "BUNDLE_VERIFIED"]);
    assert.equal(replay.operatorPrivateKeyPresent, false);
    const bytes = readFileSync(path.join(ledger.journal, "000000000001.json"), "utf8");
    assert.equal(bytes.includes("PRIVATE KEY"), false);
    assert.equal(bytes.includes(LEDGER_ID), false);
  });

test("ambiguous POST is never retried and an exact supplied response reconciles offline",
  async (t) => {
    const ledger = setupLedger(t);
    const fixture = selectionFixture();
    let proposal;
    let calls = 0;
    const adapter = createRekorDurableEffectHeadTransportV2({
      selection: fixture.selection,
      expectedSelectionHash: fixture.selection.selectionHash,
      operatorPrivateKeyPem: operator(),
      tufRoleChainVerificationHash: h("tuf-role-chain"),
      journalDirectory: ledger.journal,
      fetchImpl: async (_url, options) => {
        calls += 1;
        proposal = JSON.parse(options.body);
        throw new Error("response lost after possible commit");
      },
      clock: () => AT,
    });
    await assert.rejects(() => publishDurableEffectLedgerExternalHeadV1(
      input(ledger), {
        transport: adapter.transport,
        transportId: adapter.transportId,
        transportPolicyHash: adapter.transportPolicyHash,
        timeoutMs: 20_000,
      }), /TRANSPORT_FAILED_OR_TIMED_OUT_NO_AUTOMATIC_RETRY/u);
    assert.equal(calls, 1);
    let replay = verifyRekorDurableEffectHeadJournalV2({
      directory: ledger.journal, expectedHeadHash: null,
    });
    assert.deepEqual(replay.phases,
      ["PREPARED", "POST_ATTEMPTED", "COMMIT_UNKNOWN"]);
    const query = createRekorV2ReconciliationQueryV2({
      journalDirectory: ledger.journal,
    });
    assert.equal(query.networkIoPerformed, false);
    assert.equal(query.boundedScanAbsenceProvesNonInclusion, false);
    const reconciled = reconcileRekorV2DurableEffectHeadFromResponseV2({
      journalDirectory: ledger.journal,
      responseText: rekorResponse(proposal, fixture.selection, fixture.log),
      observedAt: AT,
    });
    assert.equal(reconciled.facts.externalInclusionUnderCallerPinnedCheckpointKeyEstablished,
      true);
    replay = verifyRekorDurableEffectHeadJournalV2({
      directory: ledger.journal, expectedHeadHash: null,
    });
    assert.deepEqual(replay.phases, ["PREPARED", "POST_ATTEMPTED",
      "COMMIT_UNKNOWN", "RECONCILIATION_EVIDENCE_OBSERVED", "BUNDLE_VERIFIED"]);
    assert.equal(calls, 1);
  });

test("a response body lost after headers is durably COMMIT_UNKNOWN and not retried",
  async (t) => {
    const ledger = setupLedger(t);
    const fixture = selectionFixture();
    let calls = 0;
    const adapter = createRekorDurableEffectHeadTransportV2({
      selection: fixture.selection,
      expectedSelectionHash: fixture.selection.selectionHash,
      operatorPrivateKeyPem: operator(),
      tufRoleChainVerificationHash: h("tuf-role-chain"),
      journalDirectory: ledger.journal,
      fetchImpl: async () => {
        calls += 1;
        return new Response(new ReadableStream({
          start(controller) { controller.error(new Error("body lost")); },
        }), { status: 200, headers: { "content-type": "application/json" } });
      },
      clock: () => AT,
    });
    await assert.rejects(() => publishDurableEffectLedgerExternalHeadV1(
      input(ledger), {
        transport: adapter.transport,
        transportId: adapter.transportId,
        transportPolicyHash: adapter.transportPolicyHash,
        timeoutMs: 20_000,
      }), /TRANSPORT_FAILED_OR_TIMED_OUT_NO_AUTOMATIC_RETRY/u);
    assert.equal(calls, 1);
    const replay = verifyRekorDurableEffectHeadJournalV2({
      directory: ledger.journal, expectedHeadHash: null,
    });
    assert.deepEqual(replay.phases,
      ["PREPARED", "POST_ATTEMPTED", "COMMIT_UNKNOWN"]);
  });

test("wrong canonical entry and checkpoint proof fail closed without a second POST",
  async (t) => {
    for (const mutate of [
      (response) => { response.canonicalizedBody = Buffer.from("{}").toString("base64"); },
      (response) => { response.inclusionProof.hashes = [Buffer.alloc(32, 7).toString("base64")]; },
    ]) {
      const ledger = setupLedger(t);
      const fixture = selectionFixture();
      let calls = 0;
      const adapter = createRekorDurableEffectHeadTransportV2({
        selection: fixture.selection,
        expectedSelectionHash: fixture.selection.selectionHash,
        operatorPrivateKeyPem: operator(),
        tufRoleChainVerificationHash: h("tuf-role-chain"),
        journalDirectory: ledger.journal,
        fetchImpl: async (_url, options) => {
          calls += 1;
          return new Response(rekorResponse(JSON.parse(options.body),
            fixture.selection, fixture.log, mutate), {
            status: 200, headers: { "content-type": "application/json" },
          });
        },
        clock: () => AT,
      });
      await assert.rejects(() => publishDurableEffectLedgerExternalHeadV1(
        input(ledger), {
          transport: adapter.transport,
          transportId: adapter.transportId,
          transportPolicyHash: adapter.transportPolicyHash,
          timeoutMs: 20_000,
        }), /TRANSPORT_FAILED_OR_TIMED_OUT_NO_AUTOMATIC_RETRY/u);
      assert.equal(calls, 1);
      await assert.rejects(() => adapter.transport({}, { signal: new AbortController().signal }),
        /TRANSPORT_ALREADY_CONSUMED/u);
    }
  });
