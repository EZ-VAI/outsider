import {
  createHash, createPrivateKey, createPublicKey, randomUUID, sign as cryptoSign,
  verify as cryptoVerify,
} from "node:crypto";
import {
  existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalizeStrict } from "./canonical.js";
import { EVENT_CHAIN_GENESIS, computeKernelEventHash } from "./outsider-kernel-store.js";
import {
  buildSupervisedExperienceV2, verifySupervisedExperienceV2,
} from "./outsider-supervised-experience.js";

const generatedNames = new Set([
  "stage05-evidence-manifest.json",
  "stage05-canonical-projection.json",
  "stage05-public-evidence.json",
  "stage05-attestation.json",
  "stage05-supervised-experience.json",
  "r4-recovery-result.json",
]);

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function digest(value) {
  const bytes = Buffer.isBuffer(value) ? value
    : typeof value === "string" ? value : canonicalizeStrict(value);
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function withHash(body, field) {
  canonicalizeStrict(body);
  return { ...body, [field]: digest(body) };
}

function readJson(file) {
  return JSON.parse(readFileSync(file, "utf8"));
}

function readJsonIfPresent(file) {
  try { return readJson(file); } catch { return null; }
}

function fileDigest(file) {
  return digest(readFileSync(file));
}

function atomicArtifact(file, value) {
  const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`;
  writeFileSync(temporary, value, { mode: 0o600 });
  renameSync(temporary, file);
}

function sourceHash(relative) {
  const file = path.join(packageRoot, relative);
  return existsSync(file) ? fileDigest(file) : null;
}

function packageVersion() {
  try { return readJson(path.join(packageRoot, "package.json")).version; } catch { return null; }
}

function commandIdentity(value) {
  if (Array.isArray(value)) return value.map(String);
  return String(value ?? "").trim();
}

function requireHash(value, name) {
  if (!/^sha256:[a-f0-9]{64}$/.test(String(value ?? ""))) {
    throw new Error(`STAGE05_INVALID_${name.toUpperCase()}_HASH`);
  }
  return value;
}

/**
 * Bind the controlled workflow before the worker exists. Missing constitutional
 * inputs stay missing: a cwd, login or process owner is not owner standing.
 */
export function createStage05ControlledWayBinding({
  contract,
  host = "claude-code",
  workerExecutable = "claude",
  supervisorCommand,
  exactClaim = null,
  exactWay = null,
  exactWorld = null,
  authority = null,
  createdBeforeWorker = true,
} = {}) {
  if (!contract?.seal) throw new Error("STAGE05_BINDING_CONTRACT_REQUIRED");
  if (exactClaim?.claimHash) requireHash(exactClaim.claimHash, "claim");
  if (exactWay?.wayHash) requireHash(exactWay.wayHash, "way");
  if (exactWorld?.worldHash) requireHash(exactWorld.worldHash, "world");
  if (authority?.capabilityHash) requireHash(authority.capabilityHash, "capability");
  const source = {
    packageName: "outsider-guard",
    packageVersion: packageVersion(),
    controllerImplementationHash: sourceHash("src/outsider-kernel-controller.js"),
    runnerImplementationHash: sourceHash("src/outsider-kernel-runner.js"),
    hookImplementationHash: sourceHash("bin/outsider-hook.mjs"),
    contractCompilerHash: sourceHash("src/outsider-contract-compiler.js"),
    outcomeVerifierHash: sourceHash("src/outsider-outcome-verifier.js"),
    extractorId: "outsider-stage05-evidence/v1",
    hostProtocol: host,
  };
  const components = {
    worker: digest({ host, executable: String(workerExecutable) }),
    controller: source.controllerImplementationHash,
    supervisor: digest({ commandIdentity: commandIdentity(supervisorCommand) }),
    verifier: source.outcomeVerifierHash,
  };
  const wayBody = {
    wayType: "DURABLE_WORKFLOW",
    correlationModel: "COMPOSED_NOT_INDEPENDENT",
    components,
  };
  const body = {
    artifactType: "outsider_stage05_controlled_way_binding_v1",
    adapterVersion: "1.0.0",
    source,
    contractRef: { contractSeal: contract.seal },
    claimRef: exactClaim?.claimHash ? {
      mode: "EXACT_CLAIM", claimHash: exactClaim.claimHash,
    } : {
      mode: "OBSERVATION_ONLY", claimHash: null,
      observedObjectiveHash: digest(String(contract.ask ?? "")),
    },
    wayRef: exactWay?.wayHash ? {
      mode: "EXACT_WAY_REFERENCE", wayHash: exactWay.wayHash,
      observedComposition: wayBody,
    } : {
      mode: "OBSERVATION_ONLY", wayHash: digest(wayBody), ...wayBody,
    },
    worldRef: exactWorld?.worldHash ? {
      mode: "EXACT_WORLD",
      worldHash: exactWorld.worldHash,
      policyVersionHash: exactWorld.policyVersionHash ?? null,
      worldConstitutionHash: exactWorld.worldConstitutionHash ?? null,
    } : {
      mode: "OBSERVATION_ONLY",
      worldHash: null,
      policyVersionHash: null,
      worldConstitutionHash: null,
      workspaceEvidenceHash: contract.baselineEvidence?.fingerprint ?? null,
    },
    authority: authority?.capabilityHash ? {
      lane: authority.lane ?? "AUTHORITY",
      capabilityRequired: true,
      capabilityHash: authority.capabilityHash,
      ownerAdoptionEvidenceHash: authority.ownerAdoptionEvidenceHash ?? null,
    } : {
      lane: "RESEARCH",
      capabilityRequired: false,
      capabilityHash: null,
      ownerAdoptionEvidenceHash: null,
    },
    evidencePolicy: {
      rawEvidenceLocationClass: "LOCAL_PRIVATE",
      disclosureProfileHash: digest("outsider/stage05/hash-only-public-derivative/v1"),
      redactionPolicyHash: digest("exclude raw prompts, output, paths and credentials"),
      retentionPolicyHash: null,
    },
    createdBeforeWorker: Boolean(createdBeforeWorker),
    createdBeforeFirstAction: true,
  };
  return withHash(body, "bindingHash");
}

function walkFiles(root, current = root, output = []) {
  for (const name of readdirSync(current).sort()) {
    if (generatedNames.has(name)) continue;
    const absolute = path.join(current, name);
    const stat = lstatSync(absolute);
    if (stat.isSymbolicLink()) continue;
    if (stat.isDirectory()) walkFiles(root, absolute, output);
    else if (stat.isFile()) output.push({ absolute, relative: path.relative(root, absolute) });
  }
  return output;
}

function roleFor(relative) {
  if (relative === "events.jsonl") return "KERNEL_EVENT_STREAM";
  if (relative === "contract.json") return "FROZEN_WORK_CONTRACT";
  if (relative === "stage05-binding.json") return "PRE_WORKER_BINDING";
  if (relative === "workspace-identity.json") return "CONTROLLER_WORKSPACE_IDENTITY";
  if (relative === "run.json") return "RUN_TERMINAL_STATE";
  if (relative === "baseline.json") return "WORKSPACE_BASELINE";
  if (/acceptance/i.test(relative)) return "ACCEPTANCE_EVIDENCE";
  if (/audit|outcome|evidence/i.test(relative)) return "SEMANTIC_EVIDENCE";
  return "PRIVATE_RUN_ARTIFACT";
}

export function verifyKernelEventChain(events, { requireCryptographic = true } = {}) {
  let previous = EVENT_CHAIN_GENESIS;
  for (let index = 0; index < events.length; index += 1) {
    const event = events[index];
    if (event.seq !== index + 1) return { ok: false, error: `EVENT_SEQUENCE_BROKEN:${index + 1}` };
    if (event.schema !== "outsider/kernel-event/v2") {
      if (requireCryptographic) return { ok: false, error: `EVENT_CHAIN_NOT_CRYPTOGRAPHIC:${index + 1}` };
      continue;
    }
    if (event.prevEventHash !== previous || event.eventHash !== computeKernelEventHash(event)) {
      return { ok: false, error: `EVENT_HASH_CHAIN_BROKEN:${index + 1}` };
    }
    previous = event.eventHash;
  }
  return {
    ok: true,
    cryptographic: events.length === 0 || events.every((event) => event.schema === "outsider/kernel-event/v2"),
    firstEventHash: events[0]?.eventHash ?? null,
    lastEventHash: events.at(-1)?.eventHash ?? null,
    eventCount: events.length,
    chainHash: digest(events.map((event) => event.eventHash ?? digest(event))),
  };
}

function terminalFrom(run, events) {
  const finalized = [...events].reverse().find((event) => event.type === "run_finalized") ?? null;
  const containment = [...events].reverse().find((event) =>
    event.type === "gate_containment_finalized") ?? null;
  const proofComplete = Boolean(run?.proof?.complete && finalized?.proofComplete);
  const deliveryComplete = proofComplete
    || Boolean(run?.proof?.deliveryComplete && finalized?.deliveryComplete);
  const interventionRequired = run?.proof?.interventionRequired === true
    || finalized?.interventionRequired === true;
  const interventionComplete = proofComplete || (run?.proof?.interventionComplete === true
    && finalized?.interventionComplete !== false);
  return {
    terminalClass: containment?.contained === true ? "CONTROL_BOUNDARY_CONTAINMENT"
      : proofComplete ? "SAFE_DELIVERY"
        : deliveryComplete ? "VERIFIED_DELIVERY_UNATTRIBUTED"
          : finalized ? "CONSERVATIVE_STOP" : "UNFINALIZED",
    workerStarted: events.some((event) => event.type === "worker_launch"
      || event.type === "worker_attached"),
    controllerGenerationCount: new Set(events.filter((event) =>
      ["controller_started", "controller_recovered"].includes(event.type))
      .map((event) => event.generation).filter(Boolean)).size,
    acceptanceRan: events.some((event) => event.type === "acceptance_finished" && event.phase === "final"),
    gateAcceptanceRan: events.some((event) => event.type === "acceptance_finished"
      && event.phase === "stop"),
    proofComplete,
    deliveryComplete,
    interventionRequired,
    interventionComplete,
    containmentComplete: containment?.contained === true,
    containmentClass: containment?.outcomeClass ?? null,
    runStatus: run?.status ?? null,
    finalFingerprint: finalized?.finalFingerprint ?? containment?.artifactFingerprint ?? null,
  };
}

export function finalizeStage05Evidence({ directory } = {}) {
  if (!directory) throw new Error("STAGE05_RUN_DIRECTORY_REQUIRED");
  const existingManifest = path.join(directory, "stage05-evidence-manifest.json");
  if (existsSync(existingManifest)) {
    const verified = verifyStage05RunDirectory(directory);
    if (!verified.ok) throw new Error(`STAGE05_EVIDENCE_ALREADY_SEALED_INVALID:${verified.error}`);
    const supervisedExperience = exportSupervisedExperienceV2({ directory, verified });
    return { ...verified, supervisedExperience };
  }
  const binding = readJson(path.join(directory, "stage05-binding.json"));
  const run = readJson(path.join(directory, "run.json"));
  const contract = readJson(path.join(directory, "contract.json"));
  const events = readFileSync(path.join(directory, "events.jsonl"), "utf8").split("\n")
    .filter(Boolean).map(JSON.parse);
  const expectedBindingHash = digest(Object.fromEntries(Object.entries(binding)
    .filter(([key]) => key !== "bindingHash")));
  if (binding.bindingHash !== expectedBindingHash) throw new Error("STAGE05_BINDING_HASH_BROKEN");
  if (binding.contractRef?.contractSeal !== contract.seal || run.bindingHash !== binding.bindingHash) {
    throw new Error("STAGE05_BINDING_IDENTITY_MISMATCH");
  }
  let workspaceIdentity = null;
  if (run.workspaceIdentityHash) {
    workspaceIdentity = readJson(path.join(directory, "workspace-identity.json"));
    if (!verifyHashedArtifact(workspaceIdentity, "identityHash")
      || workspaceIdentity.identityHash !== run.workspaceIdentityHash
      || workspaceIdentity.contractSeal !== contract.seal
      || path.resolve(workspaceIdentity.canonicalCwd ?? "") !== path.resolve(run.cwd ?? "")) {
      throw new Error("STAGE05_WORKSPACE_IDENTITY_BROKEN");
    }
  }
  const eventChain = verifyKernelEventChain(events);
  if (!eventChain.ok) throw new Error(eventChain.error);
  const terminalEvents = events.filter((event) =>
    event.type === "run_finalized" || event.type === "gate_containment_finalized");
  const terminalEvent = terminalEvents[0] ?? null;
  if (!terminalEvent) throw new Error("STAGE05_RUN_NOT_TERMINAL");
  if (terminalEvents.length !== 1 || terminalEvent.seq !== events.at(-1)?.seq) {
    throw new Error("STAGE05_TERMINAL_EVENT_NOT_FINAL");
  }
  const leaseFile = path.join(directory, "controller-lease.json");
  if (existsSync(leaseFile)) {
    const lease = readJson(leaseFile);
    if (lease?.status === "active") throw new Error("STAGE05_CONTROLLER_LEASE_ACTIVE");
  }
  const entries = walkFiles(directory).map(({ absolute, relative }) => {
    const bytes = readFileSync(absolute);
    return {
      logicalRole: roleFor(relative),
      privateLocatorHash: digest(relative),
      contentHash: digest(bytes),
      mediaType: relative.endsWith(".json") || relative.endsWith(".jsonl")
        ? "application/json" : "application/octet-stream",
      byteLength: bytes.length,
      disclosureClass: "LOCAL_PRIVATE",
    };
  });
  const rawLocalRoot = {
    merkleRoot: digest(entries),
    disclosure: "LOCAL_PRIVATE",
    entries,
  };
  const publicEntries = entries.map((entry) => ({
    logicalRole: entry.logicalRole,
    sourceContentHash: entry.contentHash,
    derivativeContentHash: digest({ role: entry.logicalRole, source: entry.contentHash }),
    fieldsRemoved: ["raw-content", "path", "prompt", "command-output", "credentials"],
  }));
  const publicDerivativeRoot = {
    merkleRoot: digest(publicEntries),
    redactionPolicyHash: binding.evidencePolicy.redactionPolicyHash,
    entries: publicEntries,
  };
  const manifestBody = {
    artifactType: "outsider_stage05_evidence_manifest_v1",
    sourceRunId: run.runId,
    bindingHash: binding.bindingHash,
    workspaceIdentityHash: workspaceIdentity?.identityHash ?? null,
    contractSeal: contract.seal,
    product: binding.source,
    rawLocalRoot,
    publicDerivativeRoot,
    eventChain,
    terminal: terminalFrom(run, events),
    signature: null,
  };
  const manifest = withHash(manifestBody, "manifestHash");
  const projectionBody = {
    artifactType: "outsider_stage05_canonical_projection_v1",
    sourceRunId: run.runId,
    bindingHash: binding.bindingHash,
    manifestHash: manifest.manifestHash,
    admission: binding.claimRef.mode === "EXACT_CLAIM"
      && binding.wayRef.mode === "EXACT_WAY_REFERENCE"
      && binding.worldRef.mode === "EXACT_WORLD"
      ? "CANONICAL_REFERENCES_BOUND_NOT_REVERIFIED" : "OBSERVATION_ONLY",
    realityClaimRef: binding.claimRef,
    executionWay: binding.wayRef,
    worldRef: binding.worldRef,
    authority: binding.authority,
    outcome: manifest.terminal,
    evidenceCommitment: {
      rawLocalMerkleRoot: manifest.rawLocalRoot.merkleRoot,
      publicDerivativeMerkleRoot: manifest.publicDerivativeRoot.merkleRoot,
      eventChainHash: manifest.eventChain.chainHash,
    },
  };
  const projection = withHash(projectionBody, "projectionHash");
  const publicEvidence = withHash({
    artifactType: "outsider_stage05_public_evidence_v1",
    sourceRunId: run.runId,
    bindingHash: binding.bindingHash,
    manifestHash: manifest.manifestHash,
    projectionHash: projection.projectionHash,
    terminal: manifest.terminal,
    commitments: projection.evidenceCommitment,
    rawEvidenceDisclosure: "LOCAL_PRIVATE_NOT_EMBEDDED",
  }, "publicEvidenceHash");
  /* Manifest is the immutable commit marker and is written last. Once it
     exists RunStore rejects every future event/state/lease mutation. */
  atomicArtifact(path.join(directory, "stage05-canonical-projection.json"),
    JSON.stringify(projection, null, 2));
  atomicArtifact(path.join(directory, "stage05-public-evidence.json"),
    JSON.stringify(publicEvidence, null, 2));
  atomicArtifact(path.join(directory, "stage05-evidence-manifest.json"),
    JSON.stringify(manifest, null, 2));
  const verified = { ok: true, binding, manifest, projection, publicEvidence };
  const supervisedExperience = exportSupervisedExperienceV2({ directory, verified, events });
  return { ...verified, supervisedExperience };
}

/** Deterministically project one sealed Stage 0.5 run into the private
 * supervised corpus.  This is an adapter, not an evaluator: it never changes
 * the sealed terminal class or asks an LLM to reinterpret the run. */
export function exportSupervisedExperienceV2({ directory, verified = null,
  events = null, outFile = null, corpusDirectory = null } = {}) {
  if (!directory) throw new Error("SUPERVISED_EXPERIENCE_RUN_DIRECTORY_REQUIRED");
  const checkedRun = verified ?? verifyStage05RunDirectory(directory);
  if (!checkedRun?.ok) {
    throw new Error(`SUPERVISED_EXPERIENCE_STAGE05_RUN_INVALID:${checkedRun?.error ?? "unknown"}`);
  }
  const sourceEvents = events ?? readFileSync(path.join(directory, "events.jsonl"), "utf8")
    .split("\n").filter(Boolean).map(JSON.parse);
  const record = buildSupervisedExperienceV2({
    verified: checkedRun,
    events: sourceEvents,
    witness: readJsonIfPresent(path.join(directory, "endurance-witness.json")),
    preregistration: readJsonIfPresent(path.join(directory, "endurance-preregistration.json")),
    agentTeamPreregistration: readJsonIfPresent(path.join(directory,
      "agent-team-probe-preregistration.json")),
    r4Recovery: readJsonIfPresent(path.join(directory, "r4-recovery-result.json")),
  });
  const target = outFile ?? path.join(directory, "stage05-supervised-experience.json");
  const existing = readJsonIfPresent(target);
  if (existing) {
    const valid = verifySupervisedExperienceV2(existing, { verified: checkedRun });
    if (!valid.ok || existing.recordHash !== record.recordHash) {
      throw new Error(`SUPERVISED_EXPERIENCE_EXISTING_ARTIFACT_CONFLICT:${valid.error ?? "content mismatch"}`);
    }
  } else {
    atomicArtifact(target, JSON.stringify(record, null, 2));
  }
  const corpusRoot = corpusDirectory
    ?? path.join(path.dirname(directory), ".supervised-experience-v2");
  mkdirSync(corpusRoot, { recursive: true, mode: 0o700 });
  const corpusFile = path.join(corpusRoot, `${record.recordHash.slice("sha256:".length)}.json`);
  const existingCorpus = readJsonIfPresent(corpusFile);
  if (existingCorpus) {
    const valid = verifySupervisedExperienceV2(existingCorpus, { verified: checkedRun });
    if (!valid.ok || existingCorpus.recordHash !== record.recordHash) {
      throw new Error(`SUPERVISED_EXPERIENCE_CORPUS_CONFLICT:${valid.error ?? "content mismatch"}`);
    }
  } else {
    atomicArtifact(corpusFile, JSON.stringify(record, null, 2));
  }
  return record;
}

function verifyHashedArtifact(value, field) {
  const body = Object.fromEntries(Object.entries(value).filter(([key]) => key !== field));
  return value[field] === digest(body);
}

export function verifyStage05RunDirectory(directory) {
  try {
    const manifest = readJson(path.join(directory, "stage05-evidence-manifest.json"));
    const projection = readJson(path.join(directory, "stage05-canonical-projection.json"));
    const publicEvidence = readJson(path.join(directory, "stage05-public-evidence.json"));
    const binding = readJson(path.join(directory, "stage05-binding.json"));
    const run = readJson(path.join(directory, "run.json"));
    const contract = readJson(path.join(directory, "contract.json"));
    if (!verifyHashedArtifact(binding, "bindingHash")) throw new Error("BINDING_HASH_BROKEN");
    if (!verifyHashedArtifact(manifest, "manifestHash")) throw new Error("MANIFEST_HASH_BROKEN");
    if (!verifyHashedArtifact(projection, "projectionHash")) throw new Error("PROJECTION_HASH_BROKEN");
    if (!verifyHashedArtifact(publicEvidence, "publicEvidenceHash")) throw new Error("PUBLIC_EVIDENCE_HASH_BROKEN");
    if (manifest.bindingHash !== binding.bindingHash || projection.manifestHash !== manifest.manifestHash) {
      throw new Error("ARTIFACT_IDENTITY_MISMATCH");
    }
    if (manifest.workspaceIdentityHash) {
      const workspaceIdentity = readJson(path.join(directory, "workspace-identity.json"));
      if (!verifyHashedArtifact(workspaceIdentity, "identityHash")
        || workspaceIdentity.identityHash !== manifest.workspaceIdentityHash
        || workspaceIdentity.identityHash !== run.workspaceIdentityHash
        || workspaceIdentity.contractSeal !== contract.seal
        || path.resolve(workspaceIdentity.canonicalCwd ?? "") !== path.resolve(run.cwd ?? "")) {
        throw new Error("WORKSPACE_IDENTITY_BROKEN");
      }
    }
    if (manifest.rawLocalRoot.merkleRoot !== digest(manifest.rawLocalRoot.entries)
      || manifest.publicDerivativeRoot.merkleRoot !== digest(manifest.publicDerivativeRoot.entries)) {
      throw new Error("EVIDENCE_MERKLE_ROOT_BROKEN");
    }
    const actualFiles = walkFiles(directory);
    if (actualFiles.length !== manifest.rawLocalRoot.entries.length) {
      throw new Error("RAW_EVIDENCE_FILE_SET_CHANGED");
    }
    for (const entry of manifest.rawLocalRoot.entries) {
      const found = actualFiles.find(({ relative }) => digest(relative) === entry.privateLocatorHash);
      if (!found || fileDigest(found.absolute) !== entry.contentHash) throw new Error("RAW_EVIDENCE_TAMPERED");
    }
    const events = readFileSync(path.join(directory, "events.jsonl"), "utf8").split("\n")
      .filter(Boolean).map(JSON.parse);
    const eventChain = verifyKernelEventChain(events);
    if (!eventChain.ok || eventChain.chainHash !== manifest.eventChain.chainHash) {
      throw new Error(eventChain.error ?? "EVENT_CHAIN_COMMITMENT_MISMATCH");
    }
    return { ok: true, binding, manifest, projection, publicEvidence };
  } catch (error) {
    return { ok: false, error: String(error?.message ?? error) };
  }
}

function attestationBody(verifiedRuns) {
  const first = verifiedRuns[0];
  const groupKey = {
    extractorId: first.binding.source.extractorId,
    productVersion: first.binding.source.packageVersion,
    controllerImplementationHash: first.binding.source.controllerImplementationHash,
    hostProtocol: first.binding.source.hostProtocol,
    wayHash: first.binding.wayRef.wayHash,
    claimRefHash: digest(first.binding.claimRef),
    worldRefHash: digest(first.binding.worldRef),
    authorityRefHash: digest(first.binding.authority),
  };
  for (const run of verifiedRuns.slice(1)) {
    const next = {
      extractorId: run.binding.source.extractorId,
      productVersion: run.binding.source.packageVersion,
      controllerImplementationHash: run.binding.source.controllerImplementationHash,
      hostProtocol: run.binding.source.hostProtocol,
      wayHash: run.binding.wayRef.wayHash,
      claimRefHash: digest(run.binding.claimRef),
      worldRefHash: digest(run.binding.worldRef),
      authorityRefHash: digest(run.binding.authority),
    };
    if (canonicalizeStrict(next) !== canonicalizeStrict(groupKey)) {
      throw new Error("ATTESTATION_MIXED_EVIDENCE_DOMAIN");
    }
  }
  const seenRunIds = new Map();
  const included = [];
  const duplicates = [];
  for (const run of verifiedRuns) {
    const outcome = run.projection.outcome;
    /* 1.3.5--1.3.7 projections predate the three-dimensional delivery /
       intervention terminal fields.  They remain valid sealed evidence, so an
       ATTEST backfill must normalize absence instead of leaking `undefined`
       into strict canonical JSON.  The supervised sidecar is derived from the
       same sealed event stream and supplies conservative booleans for those
       legacy runs; current projections remain authoritative when present. */
    const legacyLabels = run.supervisedExperience?.modelInput?.verified ?? {};
    const item = {
      runId: run.manifest.sourceRunId,
      manifestHash: run.manifest.manifestHash,
      projectionHash: run.projection.projectionHash,
      supervisedExperienceHash: run.supervisedExperience?.recordHash ?? null,
      evidenceRoot: run.manifest.rawLocalRoot.merkleRoot,
      terminalClass: outcome.terminalClass,
      proofComplete: outcome.proofComplete === true,
      deliveryComplete: outcome.deliveryComplete ?? legacyLabels.deliveryResolved ?? false,
      interventionRequired: outcome.interventionRequired
        ?? legacyLabels.interventionRequired ?? false,
      interventionComplete: outcome.interventionComplete
        ?? legacyLabels.interventionComplete ?? false,
    };
    const prior = seenRunIds.get(item.runId);
    if (prior) {
      if (prior.evidenceRoot !== item.evidenceRoot) throw new Error("ATTESTATION_RUN_ID_CONFLICT");
      duplicates.push(item);
    } else {
      seenRunIds.set(item.runId, item);
      included.push(item);
    }
  }
  const counts = Object.fromEntries(["SAFE_DELIVERY", "VERIFIED_DELIVERY_UNATTRIBUTED",
    "CONTROL_BOUNDARY_CONTAINMENT", "CONSERVATIVE_STOP", "UNFINALIZED"]
    .map((name) => [name, included.filter((item) => item.terminalClass === name).length]));
  return {
    artifactType: "outsider_attestation_v2",
    authority: "none",
    evidenceClass: included.every((item) => item.terminalClass === "CONTROL_BOUNDARY_CONTAINMENT")
      ? "CONTROL_BOUNDARY_CONTAINMENT" : "CONTROLLED_STAGE05",
    groupKey,
    included,
    duplicates,
    nUnique: included.length,
    outcomes: counts,
    correlation: {
      independenceClaimed: false,
      correlationRoots: [groupKey.controllerImplementationHash, groupKey.wayHash],
    },
    validityDomain: {
      claimMode: first.binding.claimRef.mode,
      worldMode: first.binding.worldRef.mode,
      generalizesBeyondIncludedEvidence: false,
    },
    commitment: digest({ groupKey, included, counts }),
  };
}

export function createAttestationV2({ runDirectories, privateKeyPem = null } = {}) {
  if (!Array.isArray(runDirectories) || runDirectories.length === 0) {
    throw new Error("ATTESTATION_RUNS_REQUIRED");
  }
  const verifiedRuns = runDirectories.map((directory) => {
    const verified = verifyStage05RunDirectory(directory);
    if (!verified.ok) throw new Error(`ATTESTATION_RUN_INVALID:${directory}:${verified.error}`);
    const supervisedExperience = exportSupervisedExperienceV2({ directory, verified });
    return { ...verified, supervisedExperience };
  });
  const body = attestationBody(verifiedRuns);
  let record = withHash({ ...body, signature: null }, "attestationHash");
  if (privateKeyPem) {
    const privateKey = createPrivateKey(privateKeyPem);
    const publicKey = createPublicKey(privateKey);
    const publicKeyPem = publicKey.export({ type: "spki", format: "pem" }).toString();
    record = {
      ...record,
      signature: {
        algorithm: "Ed25519",
        keyId: digest(publicKey.export({ type: "spki", format: "der" })),
        publicKeyPem,
        value: cryptoSign(null, Buffer.from(record.attestationHash), privateKey).toString("base64"),
      },
    };
  }
  return record;
}

export function verifyAttestationV2(record) {
  try {
    const { attestationHash, signature, ...unsignedBody } = record;
    if (attestationHash !== digest({ ...unsignedBody, signature: null })) {
      throw new Error("ATTESTATION_HASH_BROKEN");
    }
    if (signature) {
      if (signature.algorithm !== "Ed25519") throw new Error("ATTESTATION_SIGNATURE_ALGORITHM_UNSUPPORTED");
      const publicKey = createPublicKey(signature.publicKeyPem);
      const keyId = digest(publicKey.export({ type: "spki", format: "der" }));
      if (keyId !== signature.keyId) throw new Error("ATTESTATION_KEY_ID_MISMATCH");
      if (!cryptoVerify(null, Buffer.from(attestationHash), publicKey,
        Buffer.from(signature.value, "base64"))) throw new Error("ATTESTATION_SIGNATURE_INVALID");
    }
    return { ok: true, signed: Boolean(signature), attestationHash };
  } catch (error) {
    return { ok: false, error: String(error?.message ?? error) };
  }
}

export { digest as stage05Digest };
