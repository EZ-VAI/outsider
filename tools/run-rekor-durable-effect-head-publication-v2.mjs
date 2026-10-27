#!/usr/bin/env node

/*
 * VERSIONED SOURCE LINEAGE — Rekor durable effect-head runner v2.
 *
 * Supersedes frozen tools/run-rekor-durable-effect-head-publication-v1.mjs,
 * SHA-256 f7cc05c0783d7c643f8091c133fabd22ed956083d6440eb7c0b6208ae04a2cde.
 *
 * This runner never hardcodes a Rekor shard or a SigningConfig target name.
 * Live mode requires a caller-supplied, separately cryptographically verified
 * TUF selection report bound to the exact v2 selection.  The current generic
 * Outsider trust-material v3 report cannot satisfy that requirement because
 * production currently distributes the Rekor-v2 SigningConfig in a separately
 * named delegated target and the production TrustedRoot target is still v0.1.
 * Do not weaken v3 to make it pass; issue a compatible verifier descendant.
 *
 * Reconcile mode performs no network I/O. It checks a caller-supplied Rekor-v2
 * TransparencyLogEntry/tile result against the exact fsynced attempt journal.
 */

import { createHash, generateKeyPairSync } from "node:crypto";
import {
  closeSync, constants, fsyncSync, lstatSync, openSync, readFileSync,
  realpathSync, writeSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { canonicalizeStrict } from "../src/canonical.js";
import {
  publishDurableEffectLedgerExternalHeadV1,
} from "../src/outsider-durable-effect-ledger-external-head-publication-v1.js";
import {
  createRekorDurableEffectHeadTransportV2,
  initializeRekorDurableEffectHeadJournalV2,
  readCapturedRekorDurableEffectHeadBundleV2,
  reconcileRekorV2DurableEffectHeadFromResponseV2,
} from "../src/outsider-rekor-durable-effect-head-transport-v2.js";

const PREFIX = "OUTSIDER_REKOR_DURABLE_EFFECT_HEAD_EPISODE_V2_";
const HASH = /^sha256:[a-f0-9]{64}$/u;
const LEDGER = /^ledger_[a-f0-9]{32}$/u;
const MAX_INPUT_BYTES = 8 * 1024 * 1024;
const TIMEOUT_MS = 30_000;

function fail(code) {
  throw new TypeError(`${PREFIX}${code}`);
}

function value(argv, flag) {
  const index = argv.indexOf(flag);
  if (index < 0 || index + 1 >= argv.length) fail(`${flag.slice(2).toUpperCase()}_REQUIRED`);
  return argv[index + 1];
}

function regular(filename, code, maximum = MAX_INPUT_BYTES) {
  const absolute = path.resolve(filename);
  let stat;
  try { stat = lstatSync(absolute); } catch { fail(`${code}_UNREADABLE`); }
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size < 2
    || stat.size > maximum || (stat.mode & 0o077) !== 0
    || realpathSync(absolute) !== absolute) fail(`${code}_INVALID`);
  return absolute;
}

function readCanonicalJson(filename, code) {
  const bytes = readFileSync(regular(filename, code));
  let parsed;
  try { parsed = JSON.parse(bytes.toString("utf8")); }
  catch { fail(`${code}_JSON_INVALID`); }
  const canonical = canonicalizeStrict(parsed);
  if (!(bytes.equals(Buffer.from(canonical))
    || bytes.equals(Buffer.from(`${canonical}\n`)))) fail(`${code}_NON_CANONICAL`);
  return parsed;
}

function transcript(filename) {
  const absolute = path.resolve(filename);
  const fd = openSync(absolute, constants.O_WRONLY | constants.O_CREAT
    | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
  return {
    append(record) {
      const bytes = Buffer.from(`${canonicalizeStrict(record)}\n`);
      let offset = 0;
      while (offset < bytes.length) offset += writeSync(fd, bytes, offset);
      fsyncSync(fd);
    },
    close() { fsyncSync(fd); closeSync(fd); },
  };
}

function assertVerifiedSelectionReport(report, selection) {
  if (report === null || typeof report !== "object" || Array.isArray(report)
    || report.schema !== "outsider/rekor-v2-production-tuf-selection-verification/v1"
    || report.ok !== true
    || report.tufRoleChainCryptographicallyVerified !== true
    || report.signingConfigTargetBytesVerified !== true
    || report.trustedRootTargetBytesVerified !== true
    || report.selectionHash !== selection.selectionHash
    || report.signingConfigTargetPath
      !== selection.signingConfigTarget.targetPath
    || report.signingConfigTargetHash
      !== selection.signingConfigTarget.sha256
    || report.signingConfigTargetLength
      !== selection.signingConfigTarget.length
    || report.trustedRootTargetPath !== selection.trustedRootTarget.targetPath
    || report.trustedRootTargetHash !== selection.trustedRootTarget.sha256
    || report.trustedRootTargetLength !== selection.trustedRootTarget.length
    || typeof report.tufRoleChainVerificationHash !== "string"
    || !HASH.test(report.tufRoleChainVerificationHash)
    || report.authority !== "NONE" || report.decisionState !== "HOLD") {
    fail("VERIFIED_TUF_SELECTION_REPORT_REQUIRED");
  }
  return report;
}

export async function runRekorDurableEffectHeadPublicationV2(input) {
  if (!LEDGER.test(input.ledgerId) || !HASH.test(input.expectedLocalHeadHash)) {
    fail("LOCAL_LEDGER_BINDING_INVALID");
  }
  const report = assertVerifiedSelectionReport(input.verifiedSelectionReport,
    input.selection);
  initializeRekorDurableEffectHeadJournalV2(input.journalDirectory);
  let operatorPrivateKeyPem = generateKeyPairSync("ec", {
    namedCurve: "prime256v1",
  }).privateKey.export({ type: "pkcs8", format: "pem" });
  try {
    const adapter = createRekorDurableEffectHeadTransportV2({
      selection: input.selection,
      expectedSelectionHash: input.selection.selectionHash,
      operatorPrivateKeyPem,
      tufRoleChainVerificationHash: report.tufRoleChainVerificationHash,
      journalDirectory: path.resolve(input.journalDirectory),
      fetchImpl: input.fetchImpl,
      clock: input.clock,
    });
    const publishedAt = input.clock();
    const publication = await publishDurableEffectLedgerExternalHeadV1({
      localLedger: { directory: path.resolve(input.ledgerDirectory),
        ledgerId: input.ledgerId,
        expectedLocalHeadHash: input.expectedLocalHeadHash },
      publishedAt,
      externalChain: { expectedSequence: 1, previousReceiptHash: null },
    }, {
      transport: adapter.transport,
      transportId: adapter.transportId,
      transportPolicyHash: adapter.transportPolicyHash,
      timeoutMs: TIMEOUT_MS,
    });
    const bundle = readCapturedRekorDurableEffectHeadBundleV2(adapter, {
      expectedBundleHash: publication.receipt.providerReceiptHash,
    });
    return Object.freeze({
      schema: "outsider/rekor-v2-durable-effect-head-reality-episode/v2",
      mode: "LIVE_ONE_SHOT_TUF_SELECTED_REKOR_V2_DIGEST_ONLY",
      selectionHash: input.selection.selectionHash,
      tufRoleChainVerificationHash: report.tufRoleChainVerificationHash,
      publication,
      bundle,
      operatorPrivateKeyProjected: false,
      automaticRetryPerformed: false,
      minimumTimeoutRequirementSatisfied: TIMEOUT_MS >= 20_000,
      paymentPerformed: false,
      authority: "NONE",
      decisionState: "HOLD",
    });
  } finally {
    operatorPrivateKeyPem = "";
  }
}

async function main(argv) {
  const out = transcript(value(argv, "--transcript"));
  try {
    if (argv.includes("--reconcile")) {
      if (argv.includes("--live")) fail("MODE_CONFLICT");
      const bundle = reconcileRekorV2DurableEffectHeadFromResponseV2({
        journalDirectory: value(argv, "--journal-directory"),
        responseText: readFileSync(regular(value(argv, "--response"),
          "RESPONSE"), "utf8"),
        observedAt: new Date().toISOString(),
      });
      const record = {
        schema: "outsider/rekor-v2-durable-effect-head-reconciliation/v2",
        ok: true,
        networkIoPerformed: false,
        bundleHash: bundle.bundleHash,
        externalInclusionUnderCallerPinnedCheckpointKeyEstablished:
          bundle.facts.externalInclusionUnderCallerPinnedCheckpointKeyEstablished,
        authority: "NONE",
        decisionState: "HOLD",
      };
      out.append(record);
      process.stdout.write(`${canonicalizeStrict(record)}\n`);
      return;
    }
    if (!argv.includes("--live")) fail("LIVE_OR_RECONCILE_MODE_REQUIRED");
    const selection = readCanonicalJson(value(argv, "--selection"), "SELECTION");
    const verifiedSelectionReport = readCanonicalJson(
      value(argv, "--verified-tuf-selection-report"), "TUF_REPORT");
    const record = await runRekorDurableEffectHeadPublicationV2({
      ledgerDirectory: value(argv, "--ledger-directory"),
      ledgerId: value(argv, "--ledger-id"),
      expectedLocalHeadHash: value(argv, "--expected-local-head"),
      journalDirectory: value(argv, "--journal-directory"),
      selection,
      verifiedSelectionReport,
      fetchImpl: fetch,
      clock: () => new Date().toISOString(),
    });
    out.append(record);
    process.stdout.write(`${canonicalizeStrict({
      schema: record.schema,
      mode: record.mode,
      selectionHash: record.selectionHash,
      commitmentHash: record.publication.commitment.commitmentHash,
      requestHash: record.publication.request.requestHash,
      bundleHash: record.bundle.bundleHash,
      logIndex: record.bundle.facts.logIndex,
      treeSize: record.bundle.facts.treeSize,
      authority: record.authority,
      decisionState: record.decisionState,
      paymentPerformed: record.paymentPerformed,
    })}\n`);
  } catch (error) {
    out.append({
      schema: "outsider/rekor-v2-durable-effect-head-reality-episode-failure/v2",
      failureCode: /^OUTSIDER_[A-Z0-9_:.-]+/u.exec(String(error?.message))?.[0]
        ?? `${PREFIX}FAILURE`,
      automaticRetryPerformed: false,
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
