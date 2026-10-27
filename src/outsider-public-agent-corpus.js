/*
 * Public agent-corpus intake.
 *
 * Public benchmark/telemetry labels stay native source observations.  They are
 * never interpreted as economic loss, liability, pricing or settlement facts.
 */

import { createHash } from "node:crypto";
import {
  canonicalizeStrict,
  canonicalizeStrictBoundedArtifact,
} from "./canonical.js";

export const PUBLIC_AGENT_SCHEMAS = Object.freeze({
  manifest: "outsider/public-agent-acquisition-manifest/v2",
  record: "outsider/public-agent-normalized-record/v1",
  summary: "outsider/public-agent-corpus-summary/v1",
});

export const PUBLIC_AGENT_PINS = Object.freeze({
  openhandsFeedback: Object.freeze({
    id: "OpenHands/openhands-feedback",
    revision: "facf45600d625510b98222ec584a8c9ac59272a2",
    licenseId: "MIT",
    licenseDeclarationUrl: "https://huggingface.co/datasets/OpenHands/openhands-feedback/blob/facf45600d625510b98222ec584a8c9ac59272a2/README.md",
    sourceClass: "organic-user-agent-interaction-feedback",
    upstreamObject: Object.freeze({ path: "data/train-00000-of-00001.parquet",
      sizeBytes: 113686725,
      sha256: "sha256:f8176795f554d2e40296ad17154f1539a4eb20474dee71de3bb1b3f36d41a9a0" }),
  }),
  computerAgentArena: Object.freeze({
    id: "xlangai/computer-agent-arena",
    revision: "897b9f45287c516a44f9e79879b14bc3c1bc5b0a",
    licenseId: "CC-BY-4.0",
    licenseDeclarationUrl: "https://huggingface.co/datasets/xlangai/computer-agent-arena/blob/897b9f45287c516a44f9e79879b14bc3c1bc5b0a/README.md",
    sourceClass: "real-user-task-controlled-agent-evaluation",
    upstreamObject: Object.freeze({ path: "agent_arena_data.jsonl", sizeBytes: 50609777,
      sha256: "sha256:3696bc254bd64b27ddf340640c495ac887669ad8b7db2f8be371221080e3b9e1" }),
  }),
  traceLab: Object.freeze({
    id: "uw-syfi/TraceLab",
    revision: "fc061574a0f9700ccf88be33112adc8e86b425fa",
    release: "v0.0.1",
    licenseId: "CC-BY-4.0",
    licenseDeclarationUrl: "https://github.com/uw-syfi/TraceLab/blob/fc061574a0f9700ccf88be33112adc8e86b425fa/LICENSE-DATASET.md",
    sourceClass: "organic-sanitized-agent-telemetry",
    upstreamObject: Object.freeze({ path: "syfi_coding_trace.jsonl.gz", sizeBytes: 53601226,
      sha256: "sha256:9d265eae69a31cae203848bea936f018148eed7ca8bf56050c5abe96da0b4e6b" }),
  }),
  nebiusOpenHands: Object.freeze({
    id: "nebius/SWE-rebench-openhands-trajectories",
    revision: "35455389ab51bf5e2306bfd436ef72d0f98bf882",
    licenseId: "CC-BY-4.0",
    licenseDeclarationUrl: "https://huggingface.co/datasets/nebius/SWE-rebench-openhands-trajectories/blob/35455389ab51bf5e2306bfd436ef72d0f98bf882/LICENSE",
    sourceClass: "benchmark-agent-rollout-on-real-github-issue",
    upstreamObject: Object.freeze({ path: "trajectories.parquet", sizeBytes: 2079503354,
      sha256: "sha256:14048dd1fcd22ce094b6e85f8a38f223a9ef1327031aaaad052804870212efa1" }),
  }),
});

const PUBLIC_AGENT_PROVENANCE_POLICIES = Object.freeze({
  [PUBLIC_AGENT_PINS.computerAgentArena.id]: Object.freeze({
    byteStatus: "FULL_UPSTREAM_OBJECT_BYTES_VERIFIED",
    upstreamObjectBytesAcquired: true,
    publishedDigestMatched: true,
    revisionStatus: "HOST_PINNED_REVISION_TREE_WITH_CONTENT_IDS",
    hostDeclaredAtPinnedRevision: true,
    cryptographicRevisionInclusionProof: false,
  }),
  [PUBLIC_AGENT_PINS.traceLab.id]: Object.freeze({
    byteStatus: "FULL_RELEASE_ASSET_BYTES_AND_PUBLISHED_DIGEST_VERIFIED",
    upstreamObjectBytesAcquired: true,
    publishedDigestMatched: true,
    revisionStatus: "HOST_RELEASE_TAG_TO_COMMIT_AND_ASSET_METADATA_SNAPSHOT",
    hostDeclaredAtPinnedRevision: true,
    cryptographicRevisionInclusionProof: false,
  }),
  [PUBLIC_AGENT_PINS.openhandsFeedback.id]: Object.freeze({
    byteStatus: "COMPLETE_LOGICAL_API_RESPONSE_BYTES_VERIFIED",
    upstreamObjectBytesAcquired: false,
    publishedDigestMatched: false,
    revisionStatus: "HOST_REPOSITORY_SNAPSHOT_WITHOUT_ROW_INCLUSION_PROOF",
    hostDeclaredAtPinnedRevision: false,
    cryptographicRevisionInclusionProof: false,
  }),
  [PUBLIC_AGENT_PINS.nebiusOpenHands.id]: Object.freeze({
    byteStatus: "SELECTED_LOGICAL_API_RESPONSE_BYTES_VERIFIED",
    upstreamObjectBytesAcquired: false,
    publishedDigestMatched: false,
    revisionStatus: "HOST_REPOSITORY_SNAPSHOT_WITHOUT_ROW_INCLUSION_PROOF",
    hostDeclaredAtPinnedRevision: false,
    cryptographicRevisionInclusionProof: false,
  }),
});

const HASH = /^sha256:[a-f0-9]{64}$/;
const PINS_BY_ID = new Map(Object.values(PUBLIC_AGENT_PINS).map((pin) => [pin.id, pin]));

function exactKeys(value, keys) {
  return plain(value)
    && Object.keys(value).sort().join("\0") === [...keys].sort().join("\0");
}

function same(left, right) {
  return canonicalizeStrict(left) === canonicalizeStrict(right);
}

export function publicAgentDigest(value, domain = "outsider/public-agent/v1") {
  const body = Buffer.isBuffer(value) ? value
    : typeof value === "string" ? Buffer.from(value) : Buffer.from(canonicalizeStrict(value));
  return `sha256:${createHash("sha256").update(`${domain}\0`).update(body).digest("hex")}`;
}

function pinnedManifestDigest(value) {
  return `sha256:${createHash("sha256")
    .update(`${PUBLIC_AGENT_SCHEMAS.manifest}\0`)
    .update(Buffer.from(canonicalizeStrictBoundedArtifact(value))).digest("hex")}`;
}

function plain(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function proofPaths(paths) {
  if (!Array.isArray(paths) || paths.length < 1
    || paths.some((path) => typeof path !== "string" || path.length < 1
      || path.startsWith("/") || path.split("/").includes(".."))) {
    throw new Error("PUBLIC_AGENT_PROVENANCE_PROOF_PATH_INVALID");
  }
  const normalized = [...new Set(paths)].sort();
  if (normalized.length !== paths.length) {
    throw new Error("PUBLIC_AGENT_PROVENANCE_PROOF_PATH_DUPLICATED");
  }
  return normalized;
}

export function buildPublicAgentProvenanceProof({ datasetId, byteObjectPaths,
  revisionObjectPaths, licenseObjectPaths }) {
  const policy = PUBLIC_AGENT_PROVENANCE_POLICIES[datasetId];
  if (!policy) throw new Error("PUBLIC_AGENT_PROVENANCE_PROOF_DATASET_INVALID");
  return Object.freeze({
    byteIdentity: Object.freeze({ status: policy.byteStatus,
      upstreamObjectBytesAcquired: policy.upstreamObjectBytesAcquired,
      publishedDigestMatched: policy.publishedDigestMatched,
      objectPaths: proofPaths(byteObjectPaths) }),
    revisionBinding: Object.freeze({ status: policy.revisionStatus,
      hostDeclaredAtPinnedRevision: policy.hostDeclaredAtPinnedRevision,
      cryptographicInclusionProof: policy.cryptographicRevisionInclusionProof,
      objectPaths: proofPaths(revisionObjectPaths) }),
    licenseDeclaration: Object.freeze({ status: "PINNED_DECLARATION_BYTES_VERIFIED",
      legalConclusion: false, objectPaths: proofPaths(licenseObjectPaths) }),
  });
}

function finite(value, fallback = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function countTextError(value) {
  const text = [value?.content, value?.message, value?.observation, value?.extras,
    value?.value?.thought, value?.value?.code]
    .filter((item) => typeof item === "string").join("\n");
  return /(?:^|\W)(?:error|failed|failure|exception|invalid token)(?:\W|$)/i.test(text) ? 1 : 0;
}

function durationMs(steps) {
  const times = steps.map((step) => Date.parse(step?.timestamp ?? step?.emitted_at ?? ""))
    .filter(Number.isFinite).sort((a, b) => a - b);
  return times.length > 1 ? Math.max(0, times.at(-1) - times[0]) : null;
}

function rootsFor(pin, { repository = null, task = null, instruction = null,
  episode, collector = null, session = null, setup = null, model = null } = {}) {
  const datasetRevisionRoot = publicAgentDigest({ id: pin.id, revision: pin.revision },
    "outsider/public-agent/dataset-revision-root/v1");
  const repositoryRoot = repository == null ? null
    : publicAgentDigest({ dataset: pin.id, repository }, "outsider/public-agent/repository-root/v1");
  const taskRoot = task == null ? null
    : publicAgentDigest({ dataset: pin.id, task }, "outsider/public-agent/task-root/v1");
  const instructionRoot = instruction == null ? null
    : publicAgentDigest({ dataset: pin.id, instruction },
      "outsider/public-agent/instruction-root/v1");
  const episodeRoot = publicAgentDigest({ dataset: pin.id, episode },
    "outsider/public-agent/episode-root/v1");
  const userRoot = collector == null ? null
    : publicAgentDigest({ dataset: pin.id, collector }, "outsider/public-agent/collector-root/v1");
  const sessionRoot = session == null ? null
    : publicAgentDigest({ dataset: pin.id, session }, "outsider/public-agent/session-root/v1");
  const setupRoot = setup == null || setup === "" ? null
    : publicAgentDigest({ dataset: pin.id, setup }, "outsider/public-agent/setup-root/v1");
  const modelRoot = model == null || model === "" ? null
    : publicAgentDigest({ dataset: pin.id, model }, "outsider/public-agent/model-root/v1");
  const correlationRoots = [repositoryRoot, taskRoot, instructionRoot, userRoot, sessionRoot,
    setupRoot, modelRoot]
    .filter(Boolean).filter((value, index, all) => all.indexOf(value) === index).sort();
  if (correlationRoots.length === 0) correlationRoots.push(datasetRevisionRoot);
  return { datasetRevisionRoot, repositoryRoot, taskRoot, instructionRoot, episodeRoot,
    userRoot, sessionRoot, setupRoot, modelRoot,
    correlationRoots };
}

function lossBoundary() {
  return {
    disposition: "QUARANTINED_RESEARCH_ONLY",
    economicLossObserved: false,
    lossMinorUnits: null,
    currency: null,
    exposureDenominatorObserved: false,
    automaticTraining: false,
    permits: { PRICE: false, GUARANTEE: false, SETTLE: false },
  };
}

function strictBinary(value, code) {
  if (value == null) return null;
  if (value === true || value === 1) return true;
  if (value === false || value === 0) return false;
  throw new Error(code);
}

function makeRecord(pin, { nativeId, sourceObjectHash, roots, episode, labels,
  detectorOutputs = {} }) {
  if (!HASH.test(sourceObjectHash ?? "")) throw new Error("PUBLIC_AGENT_SOURCE_HASH_INVALID");
  const body = {
    schema: PUBLIC_AGENT_SCHEMAS.record,
    schemaVersion: "1.0.0",
    dataset: { sourceClass: pin.sourceClass, id: pin.id, revision: pin.revision,
      licenseId: pin.licenseId, sourceObjectHash },
    roots,
    episode: { nativeIdHash: publicAgentDigest(String(nativeId),
      "outsider/public-agent/native-id/v1"), ...episode },
    labels: {
      ...labels,
      economicLossObserved: false,
      lossMinorUnits: null,
      currency: null,
    },
    detectorOutputs,
    privacy: {
      rawContentIncluded: false,
      projection: "counts-labels-and-content-commitments-only",
    },
    useBoundary: lossBoundary(),
  };
  return Object.freeze({ ...body, recordHash: publicAgentDigest(body,
    PUBLIC_AGENT_SCHEMAS.record) });
}

function parseCsvLine(line) {
  const fields = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') { value += '"'; index += 1; }
      else quoted = !quoted;
    } else if (character === "," && !quoted) { fields.push(value); value = ""; }
    else value += character;
  }
  if (quoted) throw new Error("PUBLIC_AGENT_CAA_CSV_QUOTE_INVALID");
  fields.push(value);
  return fields;
}

export function parseComputerAgentArenaSessionsCsv(input) {
  if (typeof input !== "string" || input.length < 1) {
    throw new Error("PUBLIC_AGENT_CAA_CSV_INVALID");
  }
  const lines = input.replace(/\r\n/g, "\n").split("\n").filter((line) => line.length > 0);
  const headers = parseCsvLine(lines.shift());
  const required = ["session_id", "user_id", "agent0_conversation_id",
    "agent1_conversation_id", "task_instruction", "setup_description", "agent0_model",
    "agent1_model"];
  if (new Set(headers).size !== headers.length
    || required.some((header) => !headers.includes(header))) {
    throw new Error("PUBLIC_AGENT_CAA_CSV_HEADER_INVALID");
  }
  const contexts = new Map();
  for (const line of lines) {
    const values = parseCsvLine(line);
    if (values.length !== headers.length) throw new Error("PUBLIC_AGENT_CAA_CSV_ROW_INVALID");
    const row = Object.fromEntries(headers.map((header, index) => [header, values[index]]));
    for (const agent of [0, 1]) {
      const conversationId = row[`agent${agent}_conversation_id`];
      if (!conversationId) continue;
      const context = Object.freeze({ sessionId: row.session_id, userId: row.user_id,
        instruction: row.task_instruction || null,
        setupDescription: row.setup_description || null,
        model: row[`agent${agent}_model`] || null });
      if (contexts.has(conversationId) && !same(contexts.get(conversationId), context)) {
        throw new Error("PUBLIC_AGENT_CAA_CONVERSATION_CONTEXT_CONFLICT");
      }
      contexts.set(conversationId, context);
    }
  }
  return contexts;
}

export function normalizeOpenHandsFeedbackRow(row, { rowIndex, sourceObjectHash }) {
  if (!plain(row) || !Array.isArray(row.trajectory) || !Number.isSafeInteger(rowIndex)) {
    throw new Error("PUBLIC_AGENT_OPENHANDS_ROW_INVALID");
  }
  if (row.permissions !== "public") throw new Error("PUBLIC_AGENT_OPENHANDS_NOT_PUBLIC");
  const steps = row.trajectory;
  const feedbackRaw = typeof row.feedback === "string" ? row.feedback.toLowerCase() : null;
  const feedback = ["positive", "negative"].includes(feedbackRaw) ? feedbackRaw : null;
  const unrecognizedNativeLabelHash = feedback == null && feedbackRaw != null
    ? publicAgentDigest(feedbackRaw, "outsider/public-agent/unrecognized-label/v1") : null;
  const nativeId = `row:${rowIndex}:${row.timestamp ?? "unknown"}`;
  return makeRecord(PUBLIC_AGENT_PINS.openhandsFeedback, {
    nativeId, sourceObjectHash,
    roots: rootsFor(PUBLIC_AGENT_PINS.openhandsFeedback,
      { episode: nativeId, collector: "OpenHands-feedback-public-submissions" }),
    episode: {
      stepCount: steps.length,
      toolCallCount: steps.filter((step) => step?.action != null
        && !["message", "initialize"].includes(String(step.action))).length,
      toolResultCount: steps.filter((step) => step?.observation != null).length,
      errorCount: steps.reduce((sum, step) => sum + countTextError(step), 0),
      userTurnCount: steps.filter((step) => step?.source === "user").length,
      agentTurnCount: steps.filter((step) => step?.source === "agent").length,
      durationMs: durationMs(steps),
    },
    labels: {
      nativeOutcomeKind: "user-feedback-preference",
      nativeOutcomeValue: feedback,
      provenance: "user-submitted-feedback",
      independentAdjudication: false,
      preferenceOnly: true,
      benchmarkResolvedOnly: false,
    },
    detectorOutputs: { lexicalErrorMentionCount: steps.reduce(
      (sum, step) => sum + countTextError(step), 0), unrecognizedNativeLabelHash },
  });
}

export function normalizeComputerAgentArenaRow(row, { rowIndex, sourceObjectHash,
  correlation = null }) {
  const steps = row?.traj ?? row?.trajectory;
  if (!plain(row) || !Array.isArray(steps) || !Number.isSafeInteger(rowIndex)) {
    throw new Error("PUBLIC_AGENT_CAA_ROW_INVALID");
  }
  const taskId = String(row.task_id ?? row.taskId ?? `row-${rowIndex}`);
  const instruction = typeof row.instruction === "string" && row.instruction.length > 0
    ? row.instruction : correlation?.instruction ?? null;
  const model = String(row.model ?? row.agent ?? "unknown-model");
  const nativeId = `${taskId}:${model}:${rowIndex}`;
  const correctnessRaw = row.human_eval_correctness ?? row.correctness ?? null;
  const correctness = strictBinary(correctnessRaw, "PUBLIC_AGENT_CAA_LABEL_INVALID");
  const actionCount = steps.filter((step) => step?.action != null || step?.code != null
    || step?.pyautogui_code != null || step?.value?.code != null).length;
  const observationCount = steps.filter((step) => step?.image != null
    || step?.screenshot != null || step?.observation != null).length;
  return makeRecord(PUBLIC_AGENT_PINS.computerAgentArena, {
    nativeId, sourceObjectHash,
    roots: rootsFor(PUBLIC_AGENT_PINS.computerAgentArena,
      { task: taskId, instruction, episode: nativeId, collector: correlation?.userId ?? null,
        session: correlation?.sessionId ?? null, setup: correlation?.setupDescription ?? null,
        model: correlation?.model ?? model }),
    episode: { stepCount: steps.length, toolCallCount: actionCount,
      toolResultCount: observationCount,
      errorCount: steps.reduce((sum, step) => sum + countTextError(step), 0),
      userTurnCount: 1, agentTurnCount: steps.length, durationMs: durationMs(steps) },
    labels: {
      nativeOutcomeKind: "human-evaluated-task-correctness",
      nativeOutcomeValue: correctness,
      provenance: "dataset-human-evaluation",
      independentAdjudication: false,
      preferenceOnly: false,
      benchmarkResolvedOnly: false,
    },
    detectorOutputs: { lexicalErrorMentionCount: steps.reduce(
      (sum, step) => sum + countTextError(step), 0) },
  });
}

export function normalizeNebiusOpenHandsRow(row, { rowIndex, sourceObjectHash }) {
  if (!plain(row) || !Array.isArray(row.trajectory) || !Number.isSafeInteger(rowIndex)) {
    throw new Error("PUBLIC_AGENT_NEBIUS_ROW_INVALID");
  }
  const steps = row.trajectory;
  const repository = String(row.repo ?? "unknown-repository");
  const task = String(row.instance_id ?? `row-${rowIndex}`);
  const nativeId = String(row.trajectory_id ?? `${task}:${rowIndex}`);
  const toolCallCount = steps.reduce((sum, step) => sum
    + (Array.isArray(step?.tool_calls) ? step.tool_calls.length : 0), 0);
  const toolResultCount = steps.filter((step) => step?.role === "tool"
    || step?.tool_call_id != null).length;
  return makeRecord(PUBLIC_AGENT_PINS.nebiusOpenHands, {
    nativeId, sourceObjectHash,
    roots: rootsFor(PUBLIC_AGENT_PINS.nebiusOpenHands,
      { repository, task, episode: nativeId }),
    episode: { stepCount: steps.length, toolCallCount, toolResultCount,
      errorCount: steps.reduce((sum, step) => sum + countTextError(step), 0),
      userTurnCount: steps.filter((step) => step?.role === "user").length,
      agentTurnCount: steps.filter((step) => step?.role === "assistant").length,
      durationMs: null },
    labels: {
      nativeOutcomeKind: "benchmark-resolved",
      nativeOutcomeValue: strictBinary(row.resolved, "PUBLIC_AGENT_NEBIUS_LABEL_INVALID"),
      provenance: "benchmark-test-harness",
      independentAdjudication: false,
      preferenceOnly: false,
      benchmarkResolvedOnly: true,
    },
    detectorOutputs: { lexicalErrorMentionCount: steps.reduce(
      (sum, step) => sum + countTextError(step), 0),
      nativeGenTestsCorrect: Number.isFinite(row.gen_tests_correct)
        ? row.gen_tests_correct : null,
      nativePredPassesGenTests: Number.isFinite(row.pred_passes_gen_tests)
        ? row.pred_passes_gen_tests : null },
  });
}

export function normalizeTraceLabSession(session, { sourceObjectHash }) {
  if (!plain(session) || typeof session.sessionId !== "string"
    || !Number.isSafeInteger(session.roundCount) || session.roundCount < 1) {
    throw new Error("PUBLIC_AGENT_TRACELAB_SESSION_INVALID");
  }
  return makeRecord(PUBLIC_AGENT_PINS.traceLab, {
    nativeId: session.sessionId, sourceObjectHash,
    roots: rootsFor(PUBLIC_AGENT_PINS.traceLab, { episode: session.sessionId,
      collector: session.userId ?? "unknown-public-contributor" }),
    episode: { stepCount: session.roundCount, toolCallCount: finite(session.toolCallCount),
      toolResultCount: finite(session.toolResultCount), errorCount: finite(session.errorCount),
      userTurnCount: finite(session.userTurnCount), agentTurnCount: session.roundCount,
      durationMs: session.durationMs ?? null },
    labels: {
      nativeOutcomeKind: "none",
      nativeOutcomeValue: null,
      provenance: "sanitized-organic-telemetry-no-task-outcome",
      independentAdjudication: false,
      preferenceOnly: false,
      benchmarkResolvedOnly: false,
    },
    detectorOutputs: { inputTokens: finite(session.inputTokens),
      outputTokens: finite(session.outputTokens), cachedInputTokens: finite(session.cachedInputTokens),
      providerCount: Array.isArray(session.providers) ? session.providers.length : 0 },
  });
}

export function traceLabUserTurnCount(row) {
  if (!plain(row) || !Array.isArray(row.timing_events)) return 0;
  return row.timing_events.filter((event) => event?.event_type === "user_message"
    || event?.type === "user_message" || event?.event === "user_message").length;
}

export function buildPublicAgentAcquisitionManifest({ generatedAt, sources }) {
  if (typeof generatedAt !== "string" || new Date(generatedAt).toISOString() !== generatedAt
    || !Array.isArray(sources) || sources.length !== PINS_BY_ID.size) {
    throw new Error("PUBLIC_AGENT_MANIFEST_INPUT_INVALID");
  }
  const seen = new Set();
  for (const source of sources) {
    const pin = PINS_BY_ID.get(source?.id);
    let rebuiltProvenanceProof = null;
    try {
      rebuiltProvenanceProof = buildPublicAgentProvenanceProof({ datasetId: source?.id,
        byteObjectPaths: source?.provenanceProof?.byteIdentity?.objectPaths,
        revisionObjectPaths: source?.provenanceProof?.revisionBinding?.objectPaths,
        licenseObjectPaths: source?.provenanceProof?.licenseDeclaration?.objectPaths });
    } catch {
      rebuiltProvenanceProof = null;
    }
    if (!exactKeys(source, ["id", "revision", "sourceClass", "upstreamObject", "license",
      "sampling", "correlationPolicy", "provenanceProof", "acquiredObjects"])
      || !pin || seen.has(source.id)
      || source.revision !== pin.revision || source.sourceClass !== pin.sourceClass
      || !same(source.upstreamObject, pin.upstreamObject)
      || !exactKeys(source.license, ["identifier", "declarationUrl", "adapterGrantsRights",
        "attributionRequired"])
      || source.license.identifier !== pin.licenseId
      || source.license.declarationUrl !== pin.licenseDeclarationUrl
      || source.license.adapterGrantsRights !== false
      || source.license.attributionRequired !== (pin.licenseId === "CC-BY-4.0")
      || rebuiltProvenanceProof == null || !same(source.provenanceProof, rebuiltProvenanceProof)
      || !plain(source.sampling)
      || typeof source.correlationPolicy !== "string" || source.correlationPolicy.length < 1
      || !Array.isArray(source.acquiredObjects) || source.acquiredObjects.length < 1
      || source.acquiredObjects.some((object) => !exactKeys(object,
        ["path", "sizeBytes", "sha256"])
        || typeof object.path !== "string" || object.path.length < 1
        || object.path.startsWith("/") || object.path.split("/").includes("..")
        || !HASH.test(object.sha256 ?? "")
        || !Number.isSafeInteger(object.sizeBytes) || object.sizeBytes < 1)
      || [source.provenanceProof?.byteIdentity?.objectPaths,
        source.provenanceProof?.revisionBinding?.objectPaths,
        source.provenanceProof?.licenseDeclaration?.objectPaths]
        .flat().some((path) => !source.acquiredObjects.some((object) => object.path === path))) {
      throw new Error("PUBLIC_AGENT_MANIFEST_SOURCE_INVALID");
    }
    seen.add(source.id);
  }
  if (seen.size !== PINS_BY_ID.size) throw new Error("PUBLIC_AGENT_MANIFEST_SOURCE_SET_INVALID");
  const body = {
    schema: PUBLIC_AGENT_SCHEMAS.manifest,
    schemaVersion: "2.0.0",
    generatedAt,
    generatedAtEvidence: { status: "SELF_ASSERTED_LOCAL_TIME", externallyVerified: false },
    sources: structuredClone(sources).sort((a, b) => a.id.localeCompare(b.id)),
    useBoundary: lossBoundary(),
    limitations: [
      "Native feedback, correctness and resolved labels are not economic-loss observations.",
      "Public-source checksums establish byte identity, not causal validity or independence.",
      "Rows sharing declared correlation roots must not be counted as independent evidence.",
      "generatedAt is self-asserted local time and has no external timestamp verification.",
    ],
  };
  return Object.freeze({ ...body, manifestHash: pinnedManifestDigest(body) });
}

export function verifyPublicAgentAcquisitionManifest(manifest) {
  try {
    if (!plain(manifest) || !HASH.test(manifest.manifestHash ?? "")) {
      return { ok: false, error: "PUBLIC_AGENT_MANIFEST_INVALID" };
    }
    const rebuilt = buildPublicAgentAcquisitionManifest({ generatedAt: manifest.generatedAt,
      sources: manifest.sources });
    return canonicalizeStrictBoundedArtifact(rebuilt)
      === canonicalizeStrictBoundedArtifact(manifest)
      ? { ok: true, manifestHash: manifest.manifestHash }
      : { ok: false, error: "PUBLIC_AGENT_MANIFEST_HASH_MISMATCH" };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

function groupStats(records) {
  const count = records.length;
  const sum = (key) => records.reduce((total, record) => total + finite(record.episode[key]), 0);
  return { records: count,
    meanSteps: count ? sum("stepCount") / count : null,
    meanToolCalls: count ? sum("toolCallCount") / count : null,
    meanToolResults: count ? sum("toolResultCount") / count : null,
    meanLexicalErrorMentions: count ? sum("errorCount") / count : null };
}

export function summarizePublicAgentRecords(records, { manifestHash }) {
  if (!Array.isArray(records) || records.length < 1 || !HASH.test(manifestHash ?? "")) {
    throw new Error("PUBLIC_AGENT_SUMMARY_INPUT_INVALID");
  }
  const byDataset = {};
  for (const record of records) {
    if (!verifyPublicAgentRecord(record).ok) {
      throw new Error("PUBLIC_AGENT_RECORD_BOUNDARY_INVALID");
    }
    const bucket = byDataset[record.dataset.id] ??= [];
    bucket.push(record);
  }
  const datasets = Object.fromEntries(Object.entries(byDataset).sort(([a], [b]) => a.localeCompare(b))
    .map(([id, rows]) => {
      const labels = {};
      for (const row of rows) {
        const key = row.labels.nativeOutcomeValue === null ? "null"
          : String(row.labels.nativeOutcomeValue);
        (labels[key] ??= []).push(row);
      }
      return [id, { ...groupStats(rows), nativeOutcomeGroups: Object.fromEntries(
        Object.entries(labels).sort(([a], [b]) => a.localeCompare(b))
          .map(([key, group]) => [key, groupStats(group)])),
      }];
    }));
  const body = {
    schema: PUBLIC_AGENT_SCHEMAS.summary,
    schemaVersion: "1.0.0",
    manifestHash,
    records: records.length,
    datasets,
    interpretation: {
      design: "descriptive-association-only",
      causalEffectClaimed: false,
      prevalenceValidForCaseControlSamples: false,
      economicLossRows: 0,
      pricingEligibleRows: 0,
    },
    useBoundary: lossBoundary(),
  };
  return Object.freeze({ ...body, summaryHash: publicAgentDigest(body,
    PUBLIC_AGENT_SCHEMAS.summary) });
}

const RECORD_FIELDS = ["schema", "schemaVersion", "dataset", "roots", "episode",
  "labels", "detectorOutputs", "privacy", "useBoundary", "recordHash"];
const ROOT_FIELDS = ["datasetRevisionRoot", "repositoryRoot", "taskRoot", "instructionRoot",
  "episodeRoot", "userRoot", "sessionRoot", "setupRoot", "modelRoot", "correlationRoots"];
const EPISODE_FIELDS = ["nativeIdHash", "stepCount", "toolCallCount", "toolResultCount",
  "errorCount", "userTurnCount", "agentTurnCount", "durationMs"];
const LABEL_FIELDS = ["nativeOutcomeKind", "nativeOutcomeValue", "provenance",
  "independentAdjudication", "preferenceOnly", "benchmarkResolvedOnly",
  "economicLossObserved", "lossMinorUnits", "currency"];

function validNumberOrNull(value) {
  return value == null || typeof value === "number" && Number.isFinite(value);
}

function validDetectorOutputs(record) {
  const outputs = record.detectorOutputs;
  if (record.dataset.id === PUBLIC_AGENT_PINS.openhandsFeedback.id) {
    return exactKeys(outputs, ["lexicalErrorMentionCount", "unrecognizedNativeLabelHash"])
      && Number.isSafeInteger(outputs.lexicalErrorMentionCount)
      && outputs.lexicalErrorMentionCount >= 0
      && (outputs.unrecognizedNativeLabelHash == null
        || HASH.test(outputs.unrecognizedNativeLabelHash));
  }
  if (record.dataset.id === PUBLIC_AGENT_PINS.computerAgentArena.id) {
    return exactKeys(outputs, ["lexicalErrorMentionCount"])
      && Number.isSafeInteger(outputs.lexicalErrorMentionCount)
      && outputs.lexicalErrorMentionCount >= 0;
  }
  if (record.dataset.id === PUBLIC_AGENT_PINS.nebiusOpenHands.id) {
    return exactKeys(outputs, ["lexicalErrorMentionCount", "nativeGenTestsCorrect",
      "nativePredPassesGenTests"])
      && Number.isSafeInteger(outputs.lexicalErrorMentionCount)
      && outputs.lexicalErrorMentionCount >= 0
      && validNumberOrNull(outputs.nativeGenTestsCorrect)
      && validNumberOrNull(outputs.nativePredPassesGenTests);
  }
  return record.dataset.id === PUBLIC_AGENT_PINS.traceLab.id
    && exactKeys(outputs, ["inputTokens", "outputTokens", "cachedInputTokens", "providerCount"])
    && Object.values(outputs).every((value) => Number.isSafeInteger(value) && value >= 0);
}

function validNativeLabels(record) {
  const labels = record.labels;
  if (!exactKeys(labels, LABEL_FIELDS)
    || labels.independentAdjudication !== false
    || labels.economicLossObserved !== false || labels.lossMinorUnits !== null
    || labels.currency !== null) return false;
  if (record.dataset.id === PUBLIC_AGENT_PINS.openhandsFeedback.id) {
    const recognized = ["positive", "negative"].includes(labels.nativeOutcomeValue);
    const unknown = labels.nativeOutcomeValue === null;
    return labels.nativeOutcomeKind === "user-feedback-preference"
      && labels.provenance === "user-submitted-feedback"
      && labels.preferenceOnly === true && labels.benchmarkResolvedOnly === false
      && (recognized || unknown)
      && (recognized ? record.detectorOutputs.unrecognizedNativeLabelHash === null
        : HASH.test(record.detectorOutputs.unrecognizedNativeLabelHash ?? ""));
  }
  if (record.dataset.id === PUBLIC_AGENT_PINS.computerAgentArena.id) {
    return labels.nativeOutcomeKind === "human-evaluated-task-correctness"
      && labels.provenance === "dataset-human-evaluation"
      && labels.preferenceOnly === false && labels.benchmarkResolvedOnly === false
      && [true, false, null].includes(labels.nativeOutcomeValue);
  }
  if (record.dataset.id === PUBLIC_AGENT_PINS.nebiusOpenHands.id) {
    return labels.nativeOutcomeKind === "benchmark-resolved"
      && labels.provenance === "benchmark-test-harness"
      && labels.preferenceOnly === false && labels.benchmarkResolvedOnly === true
      && [true, false, null].includes(labels.nativeOutcomeValue);
  }
  return record.dataset.id === PUBLIC_AGENT_PINS.traceLab.id
    && labels.nativeOutcomeKind === "none" && labels.nativeOutcomeValue === null
    && labels.provenance === "sanitized-organic-telemetry-no-task-outcome"
    && labels.preferenceOnly === false && labels.benchmarkResolvedOnly === false;
}

export function verifyPublicAgentRecord(record, { manifest = null } = {}) {
  const pin = PINS_BY_ID.get(record?.dataset?.id);
  if (!exactKeys(record, RECORD_FIELDS) || !pin
    || record.schema !== PUBLIC_AGENT_SCHEMAS.record || record.schemaVersion !== "1.0.0"
    || !HASH.test(record.recordHash ?? "")
    || !exactKeys(record.dataset, ["sourceClass", "id", "revision", "licenseId",
      "sourceObjectHash"])
    || record.dataset.sourceClass !== pin.sourceClass || record.dataset.revision !== pin.revision
    || record.dataset.licenseId !== pin.licenseId || !HASH.test(record.dataset.sourceObjectHash ?? "")
    || !exactKeys(record.roots, ROOT_FIELDS)
    || !HASH.test(record.roots.datasetRevisionRoot ?? "")
    || record.roots.datasetRevisionRoot !== publicAgentDigest({ id: pin.id,
      revision: pin.revision }, "outsider/public-agent/dataset-revision-root/v1")
    || !HASH.test(record.roots.episodeRoot ?? "")
    || ROOT_FIELDS.filter((field) => field.endsWith("Root")
      && !["datasetRevisionRoot", "episodeRoot"].includes(field))
      .some((field) => record.roots[field] !== null && !HASH.test(record.roots[field] ?? ""))
    || !Array.isArray(record.roots.correlationRoots)
    || !same(record.roots.correlationRoots,
      [record.roots.repositoryRoot, record.roots.taskRoot, record.roots.instructionRoot,
        record.roots.userRoot, record.roots.sessionRoot, record.roots.setupRoot,
        record.roots.modelRoot].filter(Boolean)
        .filter((value, index, all) => all.indexOf(value) === index).sort().length > 0
        ? [record.roots.repositoryRoot, record.roots.taskRoot, record.roots.instructionRoot,
          record.roots.userRoot, record.roots.sessionRoot, record.roots.setupRoot,
          record.roots.modelRoot].filter(Boolean)
          .filter((value, index, all) => all.indexOf(value) === index).sort()
        : [record.roots.datasetRevisionRoot])
    || !exactKeys(record.episode, EPISODE_FIELDS)
    || !HASH.test(record.episode.nativeIdHash ?? "")
    || !Number.isSafeInteger(record.episode.stepCount) || record.episode.stepCount < 1
    || ["toolCallCount", "toolResultCount", "errorCount", "userTurnCount", "agentTurnCount"]
      .some((field) => !Number.isSafeInteger(record.episode[field]) || record.episode[field] < 0)
    || record.episode.durationMs !== null
      && (!Number.isSafeInteger(record.episode.durationMs) || record.episode.durationMs < 0)
    || !exactKeys(record.privacy, ["rawContentIncluded", "projection"])
    || !same(record.privacy, { rawContentIncluded: false,
      projection: "counts-labels-and-content-commitments-only" })
    || !same(record.useBoundary, lossBoundary())
    || !validDetectorOutputs(record) || !validNativeLabels(record)) return { ok: false };
  const { recordHash, ...body } = record;
  if (publicAgentDigest(body, PUBLIC_AGENT_SCHEMAS.record) !== recordHash) return { ok: false };
  if (manifest != null) {
    if (!verifyPublicAgentAcquisitionManifest(manifest).ok) return { ok: false };
    const source = manifest.sources.find((item) => item.id === record.dataset.id);
    if (!source || !source.acquiredObjects.some((item) =>
      item.sha256 === record.dataset.sourceObjectHash)) return { ok: false };
  }
  return { ok: true };
}

export function verifyPublicAgentRecordSet(records, { manifest }) {
  if (!Array.isArray(records) || records.length < 1
    || !verifyPublicAgentAcquisitionManifest(manifest).ok) {
    return Object.freeze({ ok: false, error: "PUBLIC_AGENT_RECORD_SET_INPUT_INVALID" });
  }
  const sourceHashes = new Map(manifest.sources.map((source) => [source.id,
    new Set(source.acquiredObjects.map((object) => object.sha256))]));
  const counts = {};
  const recordHashes = [];
  for (const record of records) {
    if (!verifyPublicAgentRecord(record).ok
      || !sourceHashes.get(record.dataset.id)?.has(record.dataset.sourceObjectHash)) {
      return Object.freeze({ ok: false, error: "PUBLIC_AGENT_RECORD_SET_RECORD_INVALID" });
    }
    counts[record.dataset.id] = (counts[record.dataset.id] ?? 0) + 1;
    recordHashes.push(record.recordHash);
  }
  const body = { manifestHash: manifest.manifestHash, records: records.length,
    counts: Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b))),
    recordHashes: [...recordHashes].sort() };
  return Object.freeze({ ok: true, ...body,
    recordSetHash: publicAgentDigest(body, "outsider/public-agent-record-set/v1") });
}
