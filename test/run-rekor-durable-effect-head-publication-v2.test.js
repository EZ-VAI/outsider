import test from "node:test";
import assert from "node:assert/strict";
import { createHash, generateKeyPairSync } from "node:crypto";
import { accessSync, chmodSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  createRekorV2PinnedTufServiceSelectionV2,
} from "../src/outsider-rekor-durable-effect-head-transport-v2.js";
import {
  runRekorDurableEffectHeadPublicationV2,
} from "../tools/run-rekor-durable-effect-head-publication-v2.mjs";

function target(targetPath, value) {
  const bytes = Buffer.from(JSON.stringify(value));
  return { targetPath, expectedLength: bytes.length,
    expectedSha256: createHash("sha256").update(bytes).digest("hex"), bytes };
}

function fixtureSelection() {
  const key = generateKeyPairSync("ed25519").publicKey;
  const host = "log.fixture.test";
  const raw = Buffer.from(key.export({ format: "jwk" }).x, "base64url");
  const keyId = createHash("sha256").update(Buffer.concat([
    Buffer.from(`${host}\n`), Buffer.from([1]), raw,
  ])).digest();
  return createRekorV2PinnedTufServiceSelectionV2({
    signingConfigTarget: target("not-a-hardcoded-name.json", {
      mediaType: "application/vnd.dev.sigstore.signingconfig.v0.2+json",
      rekorTlogUrls: [{ url: `https://${host}`, majorApiVersion: 2,
        validFor: { start: "2026-01-01T00:00:00Z" }, operator: "fixture.test" }],
      rekorTlogConfig: { selector: "ANY" },
    }),
    trustedRootTarget: target("trusted-root-production-v0.1.json", {
      mediaType: "application/vnd.dev.sigstore.trustedroot+json;version=0.1",
      tlogs: [{ baseUrl: `https://${host}`, hashAlgorithm: "SHA2_256",
        publicKey: {
          rawBytes: key.export({ type: "spki", format: "der" }).toString("base64"),
          keyDetails: "PKIX_ED25519",
          validFor: { start: "2026-01-01T00:00:00Z" },
        }, logId: { keyId: keyId.toString("base64") } }],
    }),
    selectedAt: "2026-09-03T22:00:00.000Z",
  });
}

test("runner refuses live setup before filesystem or network without a verified TUF report",
  async (t) => {
    const parent = realpathSync(mkdtempSync(path.join(tmpdir(), "outsider-rekor-run-v2-")));
    chmodSync(parent, 0o700);
    t.after(() => rmSync(parent, { recursive: true, force: true }));
    const journal = path.join(parent, "journal-must-not-exist");
    let calls = 0;
    await assert.rejects(() => runRekorDurableEffectHeadPublicationV2({
      ledgerDirectory: parent,
      ledgerId: "ledger_0123456789abcdef0123456789abcdef",
      expectedLocalHeadHash:
        "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      journalDirectory: journal,
      selection: fixtureSelection(),
      verifiedSelectionReport: {
        schema: "caller-claim-is-not-a-verified-report",
        ok: true,
      },
      fetchImpl: async () => { calls += 1; throw new Error("must not fetch"); },
      clock: () => "2026-09-03T22:00:00.000Z",
    }), /VERIFIED_TUF_SELECTION_REPORT_REQUIRED/u);
    assert.equal(calls, 0);
    assert.throws(() => accessSync(journal));
  });

