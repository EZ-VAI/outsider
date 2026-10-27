import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  chmodSync, lstatSync, mkdtempSync, readFileSync, readdirSync, rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { canonicalizeStrict } from "../src/canonical.js";
import { createEpisodeAttemptSetComposition }
  from "../src/outsider-episode-attempt-set-composition.js";
import {
  createUserHeldSparkFunActivationV1,
} from "../scripts/outsider-user-held-sparkfun-activation-v1.mjs";
import { runUserHeldSparkFunFormationExecutorCliV1 }
  from "../scripts/outsider-user-held-sparkfun-formation-executor-v1.mjs";

const NOW = "2026-09-04T22:30:00.000Z";
const STREET = "700 Private Activation Avenue";
const EMAIL = "activation-only@example.invalid";
const PHONE = "+1 555 010 7654";
const TOKEN = "deployed-test-formation-dispatch-token-00000001";

function h(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function root(t) {
  const directory = mkdtempSync(path.join(tmpdir(),
    "outsider-user-held-activation-"));
  chmodSync(directory, 0o700);
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}

function writePrivate(file, value, canonical = true) {
  const bytes = canonical ? `${canonicalizeStrict(value)}\n` : `${value}\n`;
  writeFileSync(file, bytes, { mode: 0o600 });
  chmodSync(file, 0o600);
  return file;
}

function predecessor() {
  return createEpisodeAttemptSetComposition({
    recordedAt: "2026-09-04T20:00:00.000Z",
    episodeBinding: {
      principalEpochProjectionHash: h("principal"),
      accountableDeploymentSubjectHash: h("deployment"),
      runtimeInstanceHash: h("runtime"),
      embodimentRevisionHash: h("embodiment"),
      delegationEdgeHash: h("delegation"),
      episodeHash: h("episode"),
      workOrderProjectionHash: h("work-order"),
      networkCompleteEpisodeJoinHash: h("complete-episode"),
      prospectiveCensusProjectionHash: h("census"),
      realityObligationGenesisHash: h("obligation-genesis"),
      realityObligationStateHash: h("obligation-state"),
      genesisObligationAttemptHash: h("attempt-1"),
    },
    appendOnlyLineage: {
      revision: 0,
      predecessorCompositionHash: null,
      supersedesCompositionHash: null,
    },
    attempts: [{
      attemptOrdinal: 1,
      occurredAt: "2026-09-04T19:59:00.000Z",
      episodeHash: h("episode"),
      attemptHash: h("attempt-1"),
      attemptActorSubjectHash: h("actor"),
      kind: "PRIMARY",
      retryOfAttemptHash: null,
      recoveryOfAttemptHash: null,
    }],
    reportOccurrences: [],
  }, { predecessor: null });
}

function sourceInput() {
  return {
    schema: "outsider/private-sparkfun-full-address-prepayment-run-request/v1",
    schemaVersion: "1.0.0",
    product: { catalogPath: "/usb-3-1-cable-a-to-c-3-foot.html",
      productId: "4636", sku: "CAB-14743", quantity: 1 },
    destination: { firstName: "Private", lastName: "Activation", email: EMAIL,
      telephone: PHONE, countryCode: "US", regionId: 25,
      region: "Massachusetts", regionCode: "MA", city: "Exampleville",
      postalCode: "02139", streetLines: [STREET] },
    budget: { currency: "USD", maximumAmountMinor: "2000" },
    completionDeadline: "2026-09-10T23:59:59.999Z",
    formationExpiresAt: "2026-09-04T20:15:00.000Z",
    paymentAuthorized: false,
    orderAuthorized: false,
  };
}

test("activation reissues private input, appends one user-held Attempt, and is CLI-consumable",
  async (t) => {
    const directory = root(t);
    const sourceFile = writePrivate(path.join(directory, "source.json"),
      sourceInput());
    const predecessorValue = predecessor();
    const predecessorFile = writePrivate(path.join(directory,
      "predecessor.json"), predecessorValue);
    const unifiedFile = writePrivate(path.join(directory, "unified.json"), {
      schema: "outsider/test-private-unified-result/v1",
      programHash: h("outcome-program"),
    });
    const dispatchFile = writePrivate(path.join(directory, "dispatch.secret"),
      TOKEN, false);
    const sourceBefore = readFileSync(sourceFile);
    const sourceModifiedBefore = lstatSync(sourceFile).mtimeMs;
    let randomCall = 0;
    const result = createUserHeldSparkFunActivationV1({
        sourceInputFile: sourceFile,
        predecessorCompositionFile: predecessorFile,
        unifiedResultFile: unifiedFile,
        formationDispatchTokenFile: dispatchFile,
        outputRoot: path.join(directory, "activations"),
        centralOrigin:
          "https://outsider-formation-job-worker.outsider-guard.workers.dev",
        targetApiVersion: "2.5.0",
        ttlMinutes: 240,
      }, {
        clock: () => NOW,
        randomBytesImpl: (size) => {
          randomCall += 1;
          return Buffer.alloc(size, 0x30 + randomCall);
        },
        randomUuidImpl: () => "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      });
    assert.equal(result.safeProjection.attemptOrdinal, 2);
    assert.equal(result.safeProjection.sameEpisode, true);
    assert.equal(result.safeProjection.newAttemptHash, true);
    assert.equal(result.safeProjection.descendantCompositionVerified, true);
    assert.equal(result.safeProjection.sourceArtifactOverwritten, false);
    assert.equal(result.safeProjection.dispatchTokenCopied, false);
    assert.equal(result.safeProjection.targetApiVersion, "2.5.0");
    assert.equal((lstatSync(result.outputDirectory).mode & 0o777), 0o700);
    assert.equal((lstatSync(path.join(result.outputDirectory, "runtime")).mode
      & 0o777), 0o700);
    const artifactNames = readdirSync(result.outputDirectory)
      .filter((name) => name !== "runtime").sort();
    assert.equal(artifactNames.length, 10);
    for (const name of artifactNames) {
      assert.equal(lstatSync(path.join(result.outputDirectory, name)).mode
        & 0o777, 0o600, name);
    }
    assert.deepEqual(readFileSync(sourceFile), sourceBefore);
    assert.equal(lstatSync(sourceFile).mtimeMs, sourceModifiedBefore);
    const original = JSON.parse(readFileSync(sourceFile, "utf8"));
    const descendant = JSON.parse(readFileSync(path.join(result.outputDirectory,
      "sparkfun-private-input-descendant-v1.json"), "utf8"));
    assert.equal(original.formationExpiresAt, "2026-09-04T20:15:00.000Z");
    assert.equal(descendant.formationExpiresAt, "2026-09-05T02:30:00.000Z");
    assert.deepEqual({ ...descendant, formationExpiresAt: original.formationExpiresAt },
      original);
    const lineage = JSON.parse(readFileSync(path.join(result.outputDirectory,
      "sparkfun-private-input-lineage-v1.json"), "utf8"));
    assert.equal(lineage.relation,
      "REISSUE_SUPERSEDES_EXPIRED_PRIVATE_INPUT");
    assert.equal(lineage.sourceArtifactOverwritten, false);
    const attempt = JSON.parse(readFileSync(path.join(result.outputDirectory,
      "formation-attempt.json"), "utf8"));
    assert.equal(attempt.executionSurface,
      "USER_HELD_OUTBOUND_MACHINE_HTTPS");
    assert.equal(attempt.episodeHash,
      predecessorValue.episodeBinding.episodeHash);
    assert.equal(attempt.retryOfAttemptHash,
      predecessorValue.attempts.at(-1).attemptHash);
    assert.equal(attempt.paymentAuthorized, false);
    assert.equal(attempt.orderAuthorized, false);
    const config = JSON.parse(readFileSync(path.join(result.outputDirectory,
      "executor-config.json"), "utf8"));
    assert.equal(config.centralApiVersion, "2.5.0");
    assert.equal(config.inputFile, "sparkfun-private-input-descendant-v1.json");
    assert.equal(config.privateRoot, "runtime");
    const references = JSON.parse(readFileSync(result.runtimeReferencesFile,
      "utf8"));
    assert.equal(references.publicationBearerTokenFile,
      path.resolve(dispatchFile));
    assert.equal(references.executorBearerTokenFile,
      "executor-bearer-token.secret");
    const executorToken = readFileSync(path.join(result.outputDirectory,
      references.executorBearerTokenFile), "utf8").trim();
    assert.notEqual(executorToken, TOKEN);
    assert.equal(executorToken.length >= 64, true);
    assert.equal(references.targetApiVersion, "2.5.0");
    const allActivationBytes = artifactNames.map((name) => readFileSync(
      path.join(result.outputDirectory, name), "utf8")).join("\n");
    assert.equal(allActivationBytes.includes(TOKEN), false);
    const safeText = JSON.stringify(result.safeProjection);
    for (const privateValue of [STREET, EMAIL, PHONE, TOKEN,
      lineage.predecessor.privateBytesHash,
      lineage.descendant.privateBytesHash, lineage.lineageHash]) {
      assert.equal(safeText.includes(privateValue), false);
    }

    let networkCalls = 0;
    const stdout = [];
    const stderr = [];
    const exitCode = await runUserHeldSparkFunFormationExecutorCliV1({
      argv: ["--once", "--activation", result.runtimeReferencesFile],
      environment: {},
    }, {
      fetchImpl: async (url) => {
        networkCalls += 1;
        assert.equal(url,
          "https://outsider-formation-job-worker.outsider-guard.workers.dev/v1/client-executions");
        return new Response("unavailable", { status: 503 });
      },
      clock: () => NOW,
    }, {
      stdout: (value) => stdout.push(value),
      stderr: (value) => stderr.push(value),
    });
    assert.equal(exitCode, 1);
    assert.equal(networkCalls, 1);
    assert.deepEqual(stdout, []);
    assert.equal(JSON.parse(stderr[0]).errorCode, "PUBLISH_HTTP_503");
    assert.equal(stderr[0].includes(STREET), false);
    assert.equal(stderr[0].includes(TOKEN), false);
  });
