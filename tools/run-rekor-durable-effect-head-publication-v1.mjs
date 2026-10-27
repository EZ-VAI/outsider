#!/usr/bin/env node

/*
 * One-shot live runner for publishing one privacy-closed durable-effect-ledger
 * head commitment to a caller-pinned Rekor v1 transparency log. The operator
 * P-256 private key exists only in memory. The transcript is created 0600 and
 * fsynced; it contains the replay bundle and trust policy but no private key,
 * raw ledger entry, ledger id, directory, account, endpoint credential, or
 * payment material. There is no retry.
 */

import { generateKeyPairSync } from "node:crypto";
import { closeSync, constants, fsyncSync, lstatSync, openSync, readFileSync,
  realpathSync, writeSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { canonicalizeStrict } from "../src/canonical.js";
import { publishDurableEffectLedgerExternalHeadV1 }
  from "../src/outsider-durable-effect-ledger-external-head-publication-v1.js";
import { createNetworkLifecycleRekorTrustPolicy }
  from "../src/outsider-network-lifecycle-rekor-anchor.js";
import {
  createRekorDurableEffectHeadTransportV1,
  readCapturedRekorDurableEffectHeadBundleV1,
  verifyRekorDurableEffectHeadBundleV1,
} from "../src/outsider-rekor-durable-effect-head-transport-v1.js";

const PREFIX = "OUTSIDER_REKOR_DURABLE_EFFECT_HEAD_EPISODE_V1_";
const HASH = /^sha256:[a-f0-9]{64}$/u;
const LEDGER = /^ledger_[a-f0-9]{32}$/u;
const TREE = /^(?:0|[1-9][0-9]{0,19})$/u;
const NAME = /^[A-Za-z0-9][A-Za-z0-9.-]{0,253}$/u;
const PEM_MAX = 64 * 1024;
const fail = (code) => { throw new TypeError(`${PREFIX}${code}`); };

function value(argv, flag) {
  const index = argv.indexOf(flag);
  if (index < 0 || index + 1 >= argv.length) fail(`${flag.slice(2).toUpperCase()}_REQUIRED`);
  return argv[index + 1];
}

function regularFile(filename, maximumBytes, code) {
  const absolute = path.resolve(filename);
  let stat;
  try { stat = lstatSync(absolute, { bigint: true }); }
  catch { fail(`${code}_UNREADABLE`); }
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size < 1n
    || stat.size > BigInt(maximumBytes) || realpathSync(absolute) !== absolute) {
    fail(`${code}_INVALID`);
  }
  return absolute;
}

function transcript(filename) {
  const absolute = path.resolve(filename);
  const fd = openSync(absolute, constants.O_WRONLY | constants.O_CREAT
    | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
  return {
    append(record) {
      writeSync(fd, `${canonicalizeStrict(record)}\n`, null, "utf8");
      fsyncSync(fd);
    },
    close() { fsyncSync(fd); closeSync(fd); },
  };
}

function instant(value, code) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))
    || new Date(value).toISOString() !== value) fail(code);
  return value;
}

export async function runRekorDurableEffectHeadPublicationV1(input) {
  if (!LEDGER.test(input.ledgerId) || !HASH.test(input.expectedLocalHeadHash)) {
    fail("LOCAL_LEDGER_BINDING_INVALID");
  }
  if (!TREE.test(input.treeId) || !NAME.test(input.checkpointSignerName)) {
    fail("REKOR_CHECKPOINT_BINDING_INVALID");
  }
  const logPublicKeyPem = readFileSync(regularFile(input.logPublicKeyFile,
    PEM_MAX, "LOG_PUBLIC_KEY"), "utf8");
  const trustPolicy = createNetworkLifecycleRekorTrustPolicy({
    rekorOrigin: input.rekorOrigin,
    logKeyEpochs: [{
      logID: input.logId,
      publicKeyPem: logPublicKeyPem,
      checkpointOrigin: `${input.checkpointSignerName} - ${input.treeId}`,
      checkpointSignerName: input.checkpointSignerName,
      validFrom: instant(input.validFrom, "VALID_FROM_INVALID"),
      validUntil: instant(input.validUntil, "VALID_UNTIL_INVALID"),
    }],
  });
  let operatorPrivateKeyPem = generateKeyPairSync("ec", {
    namedCurve: "prime256v1",
  }).privateKey.export({ type: "pkcs8", format: "pem" });
  try {
    const adapter = createRekorDurableEffectHeadTransportV1({
      rekorOrigin: input.rekorOrigin,
      trustPolicy,
      expectedTrustPolicyHash: trustPolicy.policyHash,
      operatorPrivateKeyPem,
      fetchImpl: fetch,
      clock: () => new Date().toISOString(),
    });
    const publication = await publishDurableEffectLedgerExternalHeadV1({
      localLedger: {
        directory: path.resolve(input.ledgerDirectory),
        ledgerId: input.ledgerId,
        expectedLocalHeadHash: input.expectedLocalHeadHash,
      },
      publishedAt: new Date().toISOString(),
      externalChain: { expectedSequence: 1, previousReceiptHash: null },
    }, {
      transport: adapter.transport,
      transportId: adapter.transportId,
      transportPolicyHash: adapter.transportPolicyHash,
      timeoutMs: 20_000,
    });
    const bundle = readCapturedRekorDurableEffectHeadBundleV1(adapter, {
      expectedBundleHash: publication.receipt.providerReceiptHash,
    });
    const replay = verifyRekorDurableEffectHeadBundleV1(bundle, {
      trustPolicy,
      expectedTrustPolicyHash: trustPolicy.policyHash,
      expectedTransportPolicyHash: adapter.transportPolicyHash,
      expectedBundleHash: bundle.bundleHash,
      expectedPublicationRequestHash: publication.request.requestHash,
    });
    if (replay.ok !== true) fail("FINAL_OFFLINE_REPLAY_FAILED");
    return Object.freeze({
      schema: "outsider/rekor-durable-effect-head-reality-episode/v1",
      mode: "LIVE_ONE_SHOT_DIGEST_ONLY",
      trustPolicy,
      publication,
      bundle,
      replay,
      rawLedgerProjected: false,
      rawLedgerIdProjected: false,
      ledgerDirectoryProjected: false,
      operatorPrivateKeyProjected: false,
      paymentPerformed: false,
      authority: "NONE",
      decisionState: "HOLD",
    });
  } finally {
    operatorPrivateKeyPem = "";
  }
}

async function main(argv) {
  if (!argv.includes("--live") || argv.includes("--mock")) fail("LIVE_MODE_REQUIRED");
  const out = transcript(value(argv, "--transcript"));
  try {
    const record = await runRekorDurableEffectHeadPublicationV1({
      ledgerDirectory: value(argv, "--ledger-directory"),
      ledgerId: value(argv, "--ledger-id"),
      expectedLocalHeadHash: value(argv, "--expected-local-head"),
      logPublicKeyFile: value(argv, "--log-public-key"),
      rekorOrigin: value(argv, "--rekor-origin"),
      logId: value(argv, "--log-id"),
      treeId: value(argv, "--tree-id"),
      checkpointSignerName: value(argv, "--checkpoint-signer"),
      validFrom: value(argv, "--valid-from"),
      validUntil: value(argv, "--valid-until"),
    });
    out.append(record);
    process.stdout.write(`${canonicalizeStrict({
      schema: record.schema,
      mode: record.mode,
      commitmentHash: record.publication.commitment.commitmentHash,
      requestHash: record.publication.request.requestHash,
      receiptHash: record.publication.receipt.receiptHash,
      bundleHash: record.bundle.bundleHash,
      verificationHash: record.replay.verificationHash,
      entryUUID: record.replay.entryUUID,
      logID: record.replay.logID,
      logIndex: record.replay.logIndex,
      integratedTime: record.replay.integratedTime,
      externalInclusionUnderPinnedLogKeyEstablished:
        record.replay.externalInclusionUnderPinnedLogKeyEstablished,
      externalNonEquivocationEstablished:
        record.replay.externalNonEquivocationEstablished,
      authority: record.authority,
      decisionState: record.decisionState,
      paymentPerformed: record.paymentPerformed,
    })}\n`);
  } catch (error) {
    out.append({
      schema: "outsider/rekor-durable-effect-head-reality-episode-failure/v1",
      failureCode: /^OUTSIDER_[A-Z0-9_:.-]+/u.exec(String(error?.message))?.[0]
        ?? `${PREFIX}FAILURE`,
      authority: "NONE",
      decisionState: "HOLD",
      paymentPerformed: false,
    });
    throw error;
  } finally { out.close(); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`${String(error.message)}\n`);
    process.exitCode = 1;
  });
}
