import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { compileBraveProductionProbeInputV1 }
  from "../src/outsider-brave-production-probe-input-compiler-v1.js";
import { runBraveOneUseTenderProductionProbeV1 }
  from "../src/outsider-brave-one-use-tender-production-probe-v1.js";
import { verifyOutcomeProgramV1 }
  from "../src/outsider-outcome-program-v1.js";
import { verifyOutsiderOutcomeTenderV1 }
  from "../src/outsider-outcome-tender-v1.js";
import { main as prepareProbeInput }
  from "../scripts/outsider-brave-production-probe-input-v1.mjs";

function h(label) {
  return `sha256:${createHash("sha256").update(label, "utf8").digest("hex")}`;
}

function refs() {
  const delegationEvidenceRefHash = h("existing-delegation-evidence");
  const delegationEdgeHash = h("existing-delegation-edge");
  return {
    requestScopeRefHash: h("private-high-entropy-request-scope"),
    workOrderHash: h("existing-work-order"),
    typedGraph: {
      principalEpoch: {
        principalRefHash: h("principal"),
        epochRefHash: h("principal-epoch"),
        principalEpochProjectionHash: h("principal-epoch-projection"),
      },
      accountableDeployment: {
        deploymentLineageRefHash: h("deployment-lineage"),
        deploymentRevisionHash: h("deployment-revision"),
        accountableDeploymentSubjectHash: h("deployment-subject"),
      },
      runtime: {
        runtimeInstanceRefHash: h("runtime-ref"),
        runtimeInstanceHash: h("runtime"),
      },
      embodiment: {
        present: false,
        deviceLineageRefHash: null,
        embodimentRevisionHash: null,
      },
      delegation: { delegationEvidenceRefHash, delegationEdgeHash },
      episode: {
        episodeHash: h("episode"),
        networkCompleteEpisodeJoinHash: h("network-complete-episode"),
      },
      attempt: {
        attemptHash: h("attempt"),
        attemptActorSubjectHash: h("attempt-actor"),
      },
    },
    authorizationBinding: {
      actorIdentityEnvelopeHash: h("existing-actor-envelope"),
      delegationEvidenceRefHash,
      delegationEdgeHash,
      authorityScopeRefHash: h("existing-authority-scope"),
      resourceOwnerAuthorizationRefHash: h("existing-owner-authorization"),
      rightsPrivacyPolicyRefHash: h("existing-rights-privacy-policy"),
    },
    subjectRefHash: h("private-outcome-subject"),
    regionRefHash: h("private-resource-region"),
    consequenceEnvelopeRefHash: h("existing-consequence-envelope"),
    affectedChannelRefHashes: [h("affected-channel")],
  };
}

function input(overrides = {}) {
  return {
    requestId: "fresh_live_probe_001",
    query: "industrial pump repair service provider",
    currentTime: "2026-09-04T12:00:00.000Z",
    formationDeadline: "2026-09-04T12:30:00.000Z",
    completionDeadline: "2026-09-05T12:00:00.000Z",
    references: refs(),
    exactCallerContactAuthorityRefHash: null,
    ...overrides,
  };
}

test("compiles a fresh canonical Brave probe input with tender and program cross-bound",
  async (t) => {
    t.mock.method(Date, "now", () => Date.parse("2026-09-04T12:00:00.000Z"));
    const source = input();
    const compiled = compileBraveProductionProbeInputV1(source);
    const tender = verifyOutsiderOutcomeTenderV1(compiled.tender, {
      expectedTenderHash: compiled.tender.tenderHash,
    });
    const program = verifyOutcomeProgramV1(compiled.program);

    assert.equal(tender.ok, true, tender.error);
    assert.equal(program.tenderHash, compiled.tender.tenderHash);
    assert.equal(compiled.programRequirementId, "primary_resource_route");
    assert.equal(compiled.tenderRequirement.kind, "RESOURCE");
    assert.equal(compiled.query.text, source.query);
    assert.equal(compiled.query.country, "ALL");
    assert.equal(compiled.query.searchLang, null);
    assert.equal(compiled.mode, "PROBE_ONLY_NO_TENDER_POST");
    assert.equal(compiled.exactCallerContactAuthorityRefHash, null);
    assert.equal(compiled.tender.authorizationBinding.authorityEstablished,
      false);
    assert.equal(compiled.tender.authority, "NONE");
    assert.equal(compiled.program.zeroInternalOps.staffTouchLimit, 0);
    assert.equal(JSON.stringify({
      tender: compiled.tender,
      program: compiled.program,
    }).includes(source.query), false,
    "plain query must not enter tender or OutcomeProgram projections");
    assert.equal(Object.isFrozen(compiled), true);
    assert.deepEqual(compileBraveProductionProbeInputV1(source), compiled,
      "the pure compiler must be deterministic for one frozen request");

    let braveCalls = 0;
    const probed = await runBraveOneUseTenderProductionProbeV1(compiled, {
      apiToken: "injected-test-token",
      braveFetchImpl: async () => {
        braveCalls += 1;
        return {
          status: 200,
          headers: { get() { return null; } },
          async text() {
            return JSON.stringify({ type: "search", web: { results: [] } });
          },
        };
      },
      braveTimeoutMs: 1_000,
      descriptorTransportConfig: {},
      descriptorTimeoutMs: 1_000,
    });
    assert.equal(braveCalls, 1);
    assert.equal(probed.status, "NO_DISCOVERY_CANDIDATE");
    assert.equal(probed.tenderPostAttemptCount, 0);
    assert.equal(probed.paymentAttemptCount, 0);
    assert.equal(probed.humanQueueCreated, false);
    assert.equal(probed.authority, "NONE");
    assert.equal(probed.decisionState, "HOLD");
  });

test("caller authority and typed graph references are preserved but never upgraded",
  () => {
    const exactContact = h("existing-exact-contact-authority");
    const source = input({
      exactCallerContactAuthorityRefHash: exactContact,
    });
    const compiled = compileBraveProductionProbeInputV1(source);
    assert.equal(compiled.exactCallerContactAuthorityRefHash, exactContact);
    assert.equal(compiled.tender.typedGraph.principalEpoch.principalRefHash,
      source.references.typedGraph.principalEpoch.principalRefHash);
    assert.equal(compiled.tender.authorizationBinding.authorityScopeRefHash,
      source.references.authorizationBinding.authorityScopeRefHash);
    assert.equal(compiled.tender.authorizationBinding
      .resourceOwnerAuthorizationRefHash,
    source.references.authorizationBinding.resourceOwnerAuthorizationRefHash);
    assert.equal(compiled.tender.authorizationBinding.authorityEstablished,
      false);
    assert.equal(compiled.tender.actionReady, false);
    assert.equal(compiled.tender.executable, false);
  });

test("query and request scope are bound without exposing query text publicly",
  () => {
    const original = compileBraveProductionProbeInputV1(input());
    const changedQuery = compileBraveProductionProbeInputV1(input({
      query: "commercial refrigeration repair service provider",
    }));
    const changedScope = compileBraveProductionProbeInputV1(input({
      references: { ...refs(), requestScopeRefHash: h("different-scope") },
    }));
    assert.notEqual(changedQuery.tender.tenderHash,
      original.tender.tenderHash);
    assert.notEqual(changedQuery.program.programHash,
      original.program.programHash);
    assert.notEqual(changedScope.tender.tenderHash,
      original.tender.tenderHash);
    assert.equal(JSON.stringify(changedQuery.tender)
      .includes(changedQuery.query.text), false);
  });

test("invalid deadlines or authority references fail before any probe exists",
  () => {
    assert.throws(() => compileBraveProductionProbeInputV1(input({
      formationDeadline: "2026-09-04T12:00:00.000Z",
    })), /DEADLINE_ORDER_INVALID/u);
    assert.throws(() => compileBraveProductionProbeInputV1(input({
      exactCallerContactAuthorityRefHash: h("not-used").slice(0, -1),
    })), /EXACT_CALLER_CONTACT_AUTHORITY_REF_HASH_INVALID/u);
    const mismatched = refs();
    mismatched.authorizationBinding.delegationEdgeHash
      = h("different-delegation");
    assert.throws(() => compileBraveProductionProbeInputV1(input({
      references: mismatched,
    })), /AUTHORIZATION_DELEGATION_TYPED_GRAPH_MISMATCH/u);
  });

test("prepare CLI creates one new private canonical input without a token or network",
  (t) => {
    const directory = realpathSync(mkdtempSync(path.join(tmpdir(),
      "outsider-brave-probe-prepare-v1-")));
    t.after(() => rmSync(directory, { recursive: true, force: true }));
    const requestFile = path.join(directory, "request.json");
    const outputFile = path.join(directory, "probe-input.json");
    writeFileSync(requestFile, JSON.stringify(input()), { mode: 0o600 });
    let stdout = "";
    const receipt = prepareProbeInput([
      "prepare",
      "--request", requestFile,
      "--output", outputFile,
    ], { writeOutput(value) { stdout += value; } });
    const compiled = JSON.parse(readFileSync(outputFile, "utf8"));
    assert.equal(statSync(outputFile).mode & 0o777, 0o600);
    assert.equal(compiled.program.tenderHash, compiled.tender.tenderHash);
    assert.equal(receipt.networkIoPerformed, false);
    assert.equal(receipt.tenderPostPerformed, false);
    assert.equal(receipt.paymentPerformed, false);
    assert.equal(JSON.parse(stdout).tenderHash, compiled.tender.tenderHash);
    assert.throws(() => prepareProbeInput([
      "prepare",
      "--request", requestFile,
      "--output", outputFile,
    ], { writeOutput() {} }), /OUTPUT_ALREADY_EXISTS/u);
  });
