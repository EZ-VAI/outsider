#!/usr/bin/env node

/* Offline Target v2 -> buyer-native evidence -> existing recovery hard gate. */
import { createHash, randomBytes } from "node:crypto";
import { chmodSync, closeSync, constants, fsyncSync, lstatSync, mkdirSync,
  openSync, readFileSync, realpathSync, writeSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { canonicalizeStrict } from "../src/canonical.js";
import { createBuyerNativeRouteEvidenceV1,
  selectBuyerNativeRouteEvidenceRecoveryCandidatesV1,
} from "../src/outsider-buyer-native-route-evidence-v1.js";
import { OUTSIDER_AGENT_NEUTRAL_ROUTE_PROPOSAL_REGISTRY_V1_GENESIS,
  appendAgentNeutralRouteProposalV1,
} from "../src/outsider-agent-neutral-route-proposal-registry-v1.js";
import { createOutcomeOsLifecycleRuntimeV1 } from "../src/outsider-outcome-os-lifecycle-v1.js";
import { prepareRecoveryOptionPortfolioV2 } from "../src/outsider-recovery-option-portfolio-v2.js";
import { prepareOutcomeOsV1 } from "../src/outsider-three-layer-outcome-product-contract-v1.js";

const PREFIX = "OUTSIDER_TARGET_V2_BUYER_NATIVE_RECOVERY_BRIDGE_V1_";
const ROOT = path.join(process.cwd(), ".outsider", "private");
const H = /^sha256:[a-f0-9]{64}$/u;
const sha = bytes => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
const digest = (domain, value) => sha(Buffer.from(`${domain}\0${canonicalizeStrict(value)}`));
function fail(code) { throw new TypeError(`${PREFIX}${code}`); }
function directory(dir) { mkdirSync(dir, { recursive: true, mode: 0o700 }); chmodSync(dir, 0o700); }
function write0600(file, value) {
  const bytes = Buffer.from(`${canonicalizeStrict(value)}\n`); let fd;
  try { fd = openSync(file, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL
    | (constants.O_NOFOLLOW ?? 0), 0o600); writeSync(fd, bytes); fsyncSync(fd); }
  finally { if (fd !== undefined) closeSync(fd); }
  chmodSync(file, 0o600); return { byteLength: bytes.length, bytesHash: sha(bytes) };
}
function loadProjection(root, file) {
  const base = realpathSync(root), absolute = realpathSync(path.resolve(file));
  if (!absolute.startsWith(`${base}${path.sep}`)) fail("SOURCE_OUTSIDE_PRIVATE_ROOT");
  const stat = lstatSync(absolute);
  if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o077) !== 0) fail("SOURCE_MODE_INVALID");
  const bytes = readFileSync(absolute), value = JSON.parse(bytes);
  if (value.schema !== "outsider/target-exact-spec-eta-route-evidence/v2"
    || !H.test(value.projectionHash ?? "")) fail("SOURCE_SCHEMA_INVALID");
  const body = { ...value }; delete body.projectionHash;
  if (digest(value.schema, body) !== value.projectionHash) fail("SOURCE_REPLAY_INVALID");
  return { absolute, bytes, value };
}
const option = (role, label, latest, domain) => ({
  optionRefHash: digest("outsider/target-bridge-option/v1", { label }), role,
  recoveryMechanismKind: "ROUTE_SUBSTITUTION", latestSafeExerciseAt: latest,
  exerciseAuthorityRefHash: digest("outsider/target-bridge-authority/v1", { label }),
  exerciseInstructionRefHash: digest("outsider/target-bridge-instruction/v1", { label }),
  cancellationRefHash: digest("outsider/target-bridge-cancellation/v1", { label }),
  exclusiveExerciseSemantics: "SINGLE_WRITER_PRIMARY_XOR_RECOVERY",
  failureDomainRefHashes: [digest("outsider/target-bridge-domain/v1", { domain })],
  failureDomainEvidenceRefHash: digest("outsider/target-bridge-domain-evidence/v1", { domain }),
});

export function bridgeTargetV2ToBuyerNativeRecoveryV1(projection) {
  const observedAt = projection.observedAt;
  const occurrenceRefHash = projection.sourceOccurrences.targetReviews.occurrenceHash;
  const validUntil = projection.postalFulfillment.selectedSourceService.cutoff;
  const completionDeadline = "2026-09-10T23:59:59.999Z";
  const acceptancePredicateHash = digest("outsider/target-frozen-predicate/v1",
    projection.frozenPredicate);
  const maximumLossConstraintHash = digest("outsider/target-maximum-loss/v1",
    { currency: "USD", maximumAllInMinorUnits: 2000 });
  const outcomeOs = prepareOutcomeOsV1({ requestIdHash: digest("outsider/target-request/v1", {}),
    outcomeProgramHash: null, outcomeDefinitionHash: digest("outsider/target-outcome/v1", {}),
    acceptancePredicateHash, formationDeadline: validUntil, completionDeadline,
    maximumLossConstraintHash, typedGraphRefs: {
      principalEpochRefHash: digest("outsider/target-graph/v1", { node: "principal" }),
      accountableDeploymentRefHash: digest("outsider/target-graph/v1", { node: "deployment" }),
      runtimeRefHash: digest("outsider/target-graph/v1", { node: "runtime" }), embodimentRefHash: null,
      delegationRefHash: digest("outsider/target-graph/v1", { node: "delegation" }),
      episodeRefHash: digest("outsider/target-graph/v1", { node: "episode" }),
      attemptRefHash: digest("outsider/target-graph/v1", { node: "attempt" }),
    } });
  const lifecycle = createOutcomeOsLifecycleRuntimeV1({ events: [] });
  const created = lifecycle.create({ contractId: `contract_${occurrenceRefHash.slice(7, 39)}`,
    outcomeOs, expectedOutcomeOsArtifactHash: outcomeOs.artifactHash, recordedAt: observedAt,
    idempotencyKeyHash: digest("outsider/target-contract-create/v1", {}) });
  lifecycle.append({ eventType: "CONTRACT_OPENED",
    recordedAt: new Date(Date.parse(observedAt) + 1000).toISOString(),
    idempotencyKeyHash: digest("outsider/target-contract-open/v1", {}),
    expectedHeadHash: created.head.headHash,
    payload: { openInstructionRefHash: digest("outsider/target-open-instruction/v1", {}) } });
  const events = lifecycle.exportEvents();
  const latest = new Date(Date.parse(validUntil) - 60 * 60 * 1000).toISOString();
  const primary = option("PRIMARY", "primary", latest, "non-target");
  const recovery = option("RECOVERY", "target", latest, "target");
  const portfolio = prepareRecoveryOptionPortfolioV2({ outcomeOs, observedAt,
    primaryOption: primary, recoveryOptions: [recovery] });
  const registeredAt = new Date(Date.parse(observedAt) + 1500).toISOString();
  const registered = appendAgentNeutralRouteProposalV1({ outcomeLifecycleEvents: events,
    registryEvents: [], proposal: { recordedAt: registeredAt,
      idempotencyKeyHash: digest("outsider/target-route-register/v1", {}),
      expectedRegistryHeadHash: OUTSIDER_AGENT_NEUTRAL_ROUTE_PROPOSAL_REGISTRY_V1_GENESIS,
      routeProposalRefHash: projection.projectionHash, occurrenceRefHash } });
  const sourceReplayReceiptHash = digest("outsider/target-v2-source-replay-receipt/v1",
    { projectionHash: projection.projectionHash, occurrenceRefHash });
  const evidence = createBuyerNativeRouteEvidenceV1({
    routeProposalRefHash: projection.projectionHash, occurrenceRefHash,
    recoveryOptionRefHash: recovery.optionRefHash, observedAt, validUntil,
    sourceReplayReceiptHash, facts: {
      specification: { sourceOccurrenceRefHash: occurrenceRefHash,
        frozenPredicateHash: acceptancePredicateHash,
        evaluationRefHash: projection.projectionHash, status: "MATCH" },
      allInPrice: { sourceOccurrenceRefHash: projection.sourceOccurrences.redskyFulfillment.occurrenceHash,
        constraintRefHash: maximumLossConstraintHash, currency: "USD",
        allInMinorUnits: projection.price.itemPlusDisplayedDeliveryFeeBeforeTaxMinor,
        includesItemTaxShippingAndFees: false, status: "PARTIAL" },
      eta: { sourceOccurrenceRefHash: projection.postalFulfillment.sourceOccurrenceHash,
        completionDeadline,
        estimatedCompletionAt: `${projection.postalFulfillment.selectedSourceService.maxDeliveryDate}T23:59:59.999Z`,
        status: "STRUCTURED" },
      capacity: { sourceOccurrenceRefHash: projection.postalFulfillment.sourceOccurrenceHash,
        capacityLifecycleRefHash: null, capacityLifecycleHeadHash: null,
        reservedFrom: null, reservedUntil: null, status: "UNRESERVED",
        sourceClass: "SELLER_SERVER_ACK_ONLY" },
    } });
  const evaluatedAt = new Date(Date.parse(observedAt) + 2000).toISOString();
  const decision = selectBuyerNativeRouteEvidenceRecoveryCandidatesV1({
    outcomeLifecycleEvents: events, routeProposalRegistryEvents: registered.exportedEvents,
    recoveryPortfolio: portfolio, evaluatedAt,
    frozenConstraints: { acceptancePredicateHash, maximumLossConstraintHash,
      currency: "USD", maximumAllInMinorUnits: 2000, completionDeadline },
    routeEvidence: [evidence] });
  return { evidence, decision, sourceReplayReceiptHash, validUntil };
}

export function runOffline(options = {}) {
  const root = path.resolve(options.privateRoot ?? ROOT); directory(root);
  const source = loadProjection(root, options.projectionFile);
  const bridged = bridgeTargetV2ToBuyerNativeRecoveryV1(source.value);
  const nonce = options.nonce ?? randomBytes(16).toString("hex");
  const dir = path.join(root, `target-v2-buyer-native-recovery-bridge-v1-${nonce}`); directory(dir);
  const artifact = { schema: "outsider/target-v2-buyer-native-recovery-bridge/v1",
    source: { schema: source.value.schema, projectionHash: source.value.projectionHash,
      occurrenceRefHash: source.value.sourceOccurrences.targetReviews.occurrenceHash,
      validUntil: bridged.validUntil }, buyerNativeEvidence: bridged.evidence,
    admission: { decisionState: bridged.decision.decisionState,
      assessment: bridged.decision.assessments[0] }, networkIoPerformed: false,
    authority: "NONE", commitIssued: false };
  const finalArtifact = { ...artifact, artifactHash: digest(artifact.schema, artifact) };
  const receipt = write0600(path.join(dir, "seller-neutral-evidence-and-admission.v1.json"), finalArtifact);
  write0600(path.join(dir, "private-receipt.v1.json"), {
    schema: "outsider/private-target-v2-buyer-native-recovery-bridge-receipt/v1",
    sourcePath: source.absolute, sourceFileHash: sha(source.bytes),
    sourceReplayReceiptHash: bridged.sourceReplayReceiptHash,
    derivedArtifactHash: finalArtifact.artifactHash, derivedArtifactReceipt: receipt,
    networkIoPerformed: false });
  return { dir, artifact: finalArtifact, receipt };
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const i = process.argv.indexOf("--projection");
  if (i < 0 || process.argv[i + 1] === undefined) fail("CLI_ARGUMENTS_INVALID");
  const result = runOffline({ projectionFile: process.argv[i + 1] });
  process.stdout.write(`${canonicalizeStrict({ artifactRef: path.basename(result.dir),
    artifactHash: result.artifact.artifactHash,
    evidenceHash: result.artifact.buyerNativeEvidence.evidenceHash,
    decisionState: result.artifact.admission.decisionState,
    admissionDecision: result.artifact.admission.assessment.admissionDecision,
    gapCodes: result.artifact.admission.assessment.gapCodes })}\n`);
}
