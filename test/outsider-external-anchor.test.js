import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { canonicalizeStrict } from "../src/canonical.js";
import {
  ANCHOR_OPERATOR_RELATIONSHIPS,
  EXTERNAL_ANCHOR_ASSURANCE,
  EXTERNAL_ANCHOR_PROFILES,
  captureExternalAnchorEvidence,
  createExternalAnchorRequest,
  createExternalAnchorTrustPolicy,
  verifyExternalAnchorEvidence,
} from "../src/outsider-external-anchor.js";

function digest(value) {
  return `sha256:${createHash("sha256")
    .update(canonicalizeStrict(value)).digest("hex")}`;
}

function commitment() {
  const body = {
    schema: "outsider/census-anchor-commitment/v1",
    ledgerId: "external-anchor-test-ledger",
    anchorPolicyHash: digest({ policy: "test" }),
    entryCount: 1,
    startedCount: 1,
    terminalCount: 0,
    openCount: 1,
    contractBoundCount: 0,
    headEntryHash: digest({ head: 1 }),
    prefixRoot: digest({ prefix: 1 }),
    disclosure: "COMMITMENT_ONLY_NO_RUN_PROMPT_PATH_OUTPUT_OR_EVENT_DATA",
  };
  return { ...body, anchorCommitmentHash: digest(body) };
}

function assertNoVerifiedBooleanTrue(value, prefix = "result") {
  if (value === null || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    const pathName = `${prefix}.${key}`;
    if (key.endsWith("Verified") && typeof child === "boolean") {
      assert.equal(child, false, pathName);
    }
    assertNoVerifiedBooleanTrue(child, pathName);
  }
}

test("caller-pinned SCITT verification cannot establish operator independence", () => {
  const request = createExternalAnchorRequest({ commitment: commitment(),
    profile: EXTERNAL_ANCHOR_PROFILES.SCITT });
  const evidence = captureExternalAnchorEvidence({ request,
    providerId: "caller-labelled-independent.fixture",
    artifact: Buffer.from([0xd2, 0x84, 0x40, 0xa0]),
    receivedAtLocal: "2026-08-25T01:02:03.000Z" });
  const trustPolicy = createExternalAnchorTrustPolicy({
    providerId: "caller-labelled-independent.fixture",
    operatorRelationship: ANCHOR_OPERATOR_RELATIONSHIPS.INDEPENDENT_PROVIDER,
    profile: EXTERNAL_ANCHOR_PROFILES.SCITT,
    endpointOrigin: "https://caller-labelled-independent.fixture",
    relationshipEvidenceHash: digest({ claim: "independence" }),
    trustMaterial: {
      kind: "SCITT_RFC9943_VERIFIER",
      transparencyServiceIssuer: "https://caller-labelled-independent.fixture",
      trustedKeysHash: digest({ keys: "caller" }),
      verifierPin: digest({ verifier: "caller" }),
      witnessPolicyHash: null,
    },
  });
  const scittVerifier = ({ subjectDigest, transparencyServiceIssuer, verifierPin }) => ({
    ok: true,
    verifierPin,
    subjectDigest,
    transparencyServiceIssuer,
    inclusionVerified: true,
    consistencyVerified: false,
    existenceTimeVerified: false,
    providerProofTime: null,
    providerProofTimeVerified: false,
    independentWitnessesVerified: 0,
  });

  const checked = verifyExternalAnchorEvidence({ request, evidence, trustPolicy,
    scittVerifier });
  assert.equal(checked.ok, true, checked.error);
  assert.equal(checked.verificationDecisionAccepted, true);
  assert.equal(checked.builtInCryptographicVerification, false);
  assert.equal(checked.cryptographicArtifactVerified, false);
  assert.equal(checked.assurance,
    EXTERNAL_ANCHOR_ASSURANCE.VERIFICATION_DECISION_ONLY);
  assert.equal(checked.trustBoundary,
    "CALLER_SUPPLIED_POLICY_AND_TRUST_ROOT_NO_MAINTAINER_EXTERNAL_REGISTRY");
  assert.equal(checked.operatorRelationshipClaimed,
    ANCHOR_OPERATOR_RELATIONSHIPS.INDEPENDENT_PROVIDER);
  assert.equal(checked.remoteClaimed, true);
  assert.equal(checked.independent, false);
  assert.equal(checked.operatorIndependenceEstablished, false);
  assert.equal(checked.proof.reportedInclusionClaim, true);
  assert.equal(checked.proof.inclusionProofVerified, false);
  assert.equal(checked.proof.checkpointSignatureVerified, false);
  assert.equal(checked.proof.appendOnlyConsistencyVerified, false);
  assert.equal(checked.proof.existenceTimeVerified, false);
  assert.equal(checked.proof.providerProofTimeVerified, false);
  assert.equal(checked.proof.witnessSignaturesVerified, 0);
  assert.equal(checked.proof.witnessOperatorIndependenceEstablished, false);
  assert.equal("operatorRelationship" in checked, false);
  assertNoVerifiedBooleanTrue(checked);
});

test("a caller-selectable RFC3161 runner decision is not built-in cryptographic verification",
  (t) => {
    const directory = mkdtempSync(path.join(tmpdir(), "outsider-fake-openssl-"));
    t.after(() => rmSync(directory, { recursive: true, force: true }));
    const fakeOpenSsl = path.join(directory, "fake-openssl");
    writeFileSync(fakeOpenSsl, [
      "#!/bin/sh",
      "if [ \"$2\" = \"-verify\" ]; then",
      "  printf 'Verification: OK\\n'",
      "else",
      "  printf 'Time stamp: 2026-08-25T01:02:03.000Z\\n'",
      "fi",
      "",
    ].join("\n"), { mode: 0o700 });
    chmodSync(fakeOpenSsl, 0o700);
    const request = createExternalAnchorRequest({ commitment: commitment(),
      profile: EXTERNAL_ANCHOR_PROFILES.RFC3161,
      nonceHex: "01".repeat(8) });
    const evidence = captureExternalAnchorEvidence({ request,
      providerId: "caller-runner.fixture",
      artifact: Buffer.from("not-a-timestamp-response"),
      receivedAtLocal: "2026-08-25T01:02:03.000Z" });
    const trustPolicy = createExternalAnchorTrustPolicy({
      providerId: "caller-runner.fixture",
      operatorRelationship: ANCHOR_OPERATOR_RELATIONSHIPS.INDEPENDENT_PROVIDER,
      profile: EXTERNAL_ANCHOR_PROFILES.RFC3161,
      endpointOrigin: "https://caller-runner.fixture",
      relationshipEvidenceHash: digest({ claim: "independence" }),
      trustMaterial: {
        kind: "RFC3161_X509_TRUST",
        caCertificatesPem:
          "-----BEGIN CERTIFICATE-----\ncaller-selected\n-----END CERTIFICATE-----",
        untrustedCertificatesPem: null,
      },
    });

    const checked = verifyExternalAnchorEvidence({ request, evidence, trustPolicy,
      opensslPath: fakeOpenSsl });
    assert.equal(checked.ok, true, checked.error);
    assert.equal(checked.verificationDecisionAccepted, true);
    assert.equal(checked.builtInCryptographicVerification, false);
    assert.equal(checked.cryptographicArtifactVerified, false);
    assert.equal(checked.operatorIndependenceEstablished, false);
    assert.equal(checked.proof.reportedExistenceTimeClaim, true);
    assert.equal(checked.proof.existenceTimeVerified, false);
    assert.equal(checked.proof.providerProofTime, null);
    assert.equal(checked.proof.providerProofTimeVerified, false);
    assert.equal(checked.proof.verificationBoundary,
      "CALLER_SELECTABLE_OPENSSL_PROCESS_AND_CALLER_SUPPLIED_TRUST_ROOT");
    assertNoVerifiedBooleanTrue(checked);
  });
