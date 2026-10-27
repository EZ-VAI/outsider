#!/usr/bin/env node
/* Existing-account, zero-dollar digital OutcomeProgram via the generic broker. */
import { createHash, randomBytes } from "node:crypto";
import { closeSync, existsSync, fsyncSync, lstatSync, mkdirSync,
  openSync, readFileSync, writeSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { canonicalizeStrict } from "../src/canonical.js";
import { createFirstCommittedDigitalRealityProductionLauncher }
  from "../src/outsider-first-committed-digital-reality-production-launcher.js";
import { createUserHeldOutcomeProgramComposition }
  from "../src/outsider-user-held-outcome-program-composition.js";
import { issueUserHeldOutcomeProgramAttempt }
  from "../src/outsider-user-held-outcome-program-attempt.js";
import { publishUserHeldFormationExecutionV1, runUserHeldFormationExecutorOnceV1 }
  from "../src/outsider-user-held-formation-executor-client-v1.js";
import { deriveUserHeldFormationExecutorCapabilityHashV1 }
  from "../src/outsider-user-held-formation-executor-protocol-v1.js";
import { runDurableUserHeldFormationExecutorV2, writePrivateExecutionRecordOnce }
  from "../src/outsider-user-held-durable-execution-v2.js";
import { createOutcomeEconomicContractDraftV1, bindOutcomeEconomicRecordsV1 }
  from "../src/outsider-outcome-economic-contract-v1.js";

const sha = bytes => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
const jsonBytes = value => Buffer.from(`${canonicalizeStrict(value)}\n`);
const DURABLE = "DURABLE_AUTONOMOUS_V2";
const TERMINAL = new Set(["SUCCEEDED", "FAILED", "FAILED_CLOSED", "UNAVAILABLE"]);
const definitionHash = proposal => sha(Buffer.from(
  `outsider/outcome-definition/v1\0${canonicalizeStrict(proposal.outcome)}`));
function privateBytes(file) {
  const stat = lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o777) !== 0o600
    || stat.size < 1 || stat.size > 1024 * 1024) throw new Error("PRIVATE_FILE_INVALID");
  return readFileSync(file);
}
function writeOnce(file, bytes) {
  let fd;
  try {
    fd = openSync(file, "wx", 0o600);
    let offset = 0;
    while (offset < bytes.length) offset += writeSync(fd, bytes, offset);
    fsyncSync(fd);
  } finally { if (fd !== undefined) closeSync(fd); }
}

export async function runUserHeldDigitalProduction(input, dependencies = {}) {
  const clock = dependencies.clock ?? (() => new Date().toISOString());
  const fetchImpl = dependencies.fetchImpl ?? globalThis.fetch;
  const output = path.resolve(input.activationDirectory);
  if (existsSync(output)) throw new Error("ACTIVATION_ALREADY_EXISTS");
  mkdirSync(output, { recursive: true, mode: 0o700 });
  const request = JSON.parse(privateBytes(input.requestFile));
  if (request.budget?.currency !== "USD"
    || request.budget.maximumAmountMinor !== "0") throw new Error("ZERO_BUDGET_REQUIRED");
  const durable = input.executionMode === DURABLE;
  if (input.executionMode !== undefined && !durable) throw new Error("EXECUTION_MODE_INVALID");
  const driver = (dependencies.createDriver ?? createFirstCommittedDigitalRealityProductionLauncher)({
    profileDirectory: input.profileDirectory, runtimeDirectory: input.runtimeDirectory,
    clock, ...(dependencies.providerIO ? { providerIO: dependencies.providerIO } : {}),
  });
  const proposal = await driver.requestOutcome(request);
  const confirmation = { requestId: proposal.requestId, programHash: proposal.programHash };
  const ancestry = JSON.parse(privateBytes(input.ancestryCompositionFile));
  const source = ancestry.episodeBinding;
  const authorizationBytes = privateBytes(input.authorizationSourceFile);
  const issuedAt = clock();
  const attempt = issueUserHeldOutcomeProgramAttempt({
    identityBinding: {
      principalEpochHash: source.principalEpochProjectionHash,
      accountableDeploymentHash: source.accountableDeploymentSubjectHash,
      runtimeOrEmbodimentHash: source.embodimentRevisionHash ?? source.runtimeInstanceHash,
      sourceRefHash: ancestry.compositionHash,
    }, request, proposal, confirmation, recordedAt: issuedAt,
    authorizationRefHash: sha(authorizationBytes),
  });
  const profileFile = path.join(input.profileDirectory, "outsider-first-reality-profile-v1.json");
  const profileHash = sha(privateBytes(profileFile));
  const contractDraft = durable ? createOutcomeEconomicContractDraftV1({
    contractVersion: 1, supersedesContractHash: null,
    outcomeProgramHash: proposal.programHash, outcomeDefinitionHash: definitionHash(proposal),
    episodeRefHash: attempt.graphRefs.episodeHash, compensationTerms: [],
  }) : null;
  const envelope = jsonBytes({ schema: `outsider/private-digital-program-instruction/v${durable ? 2 : 1}`,
    request, proposal, confirmation, profileHash, lineageHash: attempt.artifactHash,
    authoritySourceHash: sha(authorizationBytes),
    ...(durable ? { economicContractHash: contractDraft.contractHash, executionMode: DURABLE } : {}),
    scope: "EXISTING_ACCOUNTS_ZERO_DOLLAR_TEMPORARY_RESOURCES_AND_CLEANUP",
    paymentAuthorized: false, accountUpgradeAuthorized: false });
  const node = createUserHeldOutcomeProgramComposition({
    requestId: request.requestId, outcomeProgramHash: proposal.programHash,
    graphRefs: attempt.graphRefs, privateEnvelopeBytes: envelope,
    privateRoot: input.privateRoot, issuedAt, expiresAt: input.expiresAt,
    ...(durable ? { executionMode: DURABLE } : {}),
  }, { driver });
  const key = randomBytes(32), bearer = randomBytes(48).toString("base64url");
  const binding = node.createUserHeldBinding(key);
  const executorCapabilityHash = deriveUserHeldFormationExecutorCapabilityHashV1({
    bearerToken: bearer, jobHash: binding.jobHash });
  writeOnce(path.join(output, "program-proposal.json"), jsonBytes(proposal));
  writeOnce(path.join(output, "program-lineage.json"), jsonBytes(attempt));
  if (durable) writePrivateExecutionRecordOnce(path.join(output, "economic-contract-draft.json"), contractDraft);
  writeOnce(path.join(output, "private-instruction.json"), envelope);
  writeOnce(path.join(output, "commitment-key.secret"), Buffer.from(`${key.toString("base64url")}\n`));
  writeOnce(path.join(output, "executor-bearer-token.secret"), Buffer.from(`${bearer}\n`));
  const localActivation = { ...input, schema: `outsider/private-user-held-digital-activation/v${durable ? 2 : 1}`,
    issuedAt, jobHash: binding.jobHash, jobKey: binding.jobKey,
    executorCapabilityHash, programId: proposal.programId,
    programHash: proposal.programHash, attemptHash: attempt.graphRefs.attemptHash };
  writeOnce(path.join(output, "activation.json"), jsonBytes(localActivation));
  if (durable) {
    key.fill(0);
    return superviseUserHeldDigitalProduction(output, dependencies);
  }
  const published = await publishUserHeldFormationExecutionV1({
    centralOrigin: input.centralOrigin,
    publicationBearerToken: privateBytes(input.formationDispatchTokenFile).toString().trim(),
    executorCapabilityHash, binding,
  }, { fetchImpl, clock });
  dependencies.onProgress?.({ stage: "PUBLISHED", jobHash: binding.jobHash,
    jobKey: binding.jobKey, programId: proposal.programId,
    programHash: proposal.programHash, attemptHash: attempt.graphRefs.attemptHash });
  const executed = await runUserHeldFormationExecutorOnceV1({
    centralOrigin: input.centralOrigin, bearerToken: bearer,
    executorCapabilityHash, binding,
  }, { fetchImpl, clock });
  const programView = node.inspectLocalProgram();
  const result = {
    schema: "outsider/user-held-digital-production-result/v1",
    jobKey: executed.jobKey, jobHash: executed.jobHash,
    centralReceiptHash: executed.receiptHash,
    publishedState: published.state, brokerState: executed.state,
    executionPerformed: executed.executionPerformed,
    program: programView, attemptHash: attempt.graphRefs.attemptHash,
    privateCredentialsProjected: false, rawProviderJournalProjected: false,
    providerIssuedCapacityEstablished: false, commercialCommitmentIssued: false,
    paymentActions: 0, accountUpgradeActions: 0,
  };
  writeOnce(path.join(output, "safe-result.json"), jsonBytes(result));
  key.fill(0);
  return result;
}

/** Rehydrate one already-authorized activation, not another order or Attempt.
 * Provider work stays on this credential-holding node, not the broker/chat.
 */
export async function resumeUserHeldDigitalProduction(activationDirectory, dependencies = {}) {
  const output = path.resolve(activationDirectory);
  const read = name => JSON.parse(privateBytes(path.join(output, name)));
  const activation = read("activation.json");
  if (activation.schema !== "outsider/private-user-held-digital-activation/v2"
    || activation.executionMode !== DURABLE) throw new Error("DURABLE_ACTIVATION_REQUIRED");
  const envelopeBytes = privateBytes(path.join(output, "private-instruction.json"));
  const envelope = JSON.parse(envelopeBytes);
  const attempt = read("program-lineage.json"), proposal = read("program-proposal.json");
  const contractDraft = read("economic-contract-draft.json");
  const economicRecords = bindOutcomeEconomicRecordsV1({ contractDraft,
    predictedLosses: [], observedLosses: [], transactions: [] });
  if (envelope.schema !== "outsider/private-digital-program-instruction/v2"
    || envelope.executionMode !== DURABLE
    || envelope.request.budget.currency !== "USD"
    || envelope.request.budget.maximumAmountMinor !== "0"
    || envelope.paymentAuthorized !== false || envelope.accountUpgradeAuthorized !== false
    || canonicalizeStrict(envelope.proposal) !== canonicalizeStrict(proposal)
    || envelope.lineageHash !== attempt.artifactHash
    || activation.attemptHash !== attempt.graphRefs.attemptHash
    || activation.programId !== proposal.programId || activation.programHash !== proposal.programHash
    || envelope.economicContractHash !== contractDraft.contractHash
    || contractDraft.outcomeProgramHash !== proposal.programHash
    || contractDraft.outcomeDefinitionHash !== definitionHash(proposal)
    || contractDraft.episodeRefHash !== attempt.graphRefs.episodeHash
    || contractDraft.compensationTerms.length !== 0) throw new Error("ACTIVATION_BINDING_MISMATCH");
  const replayedAttempt = issueUserHeldOutcomeProgramAttempt({
    identityBinding: attempt.ancestry, request: envelope.request,
    proposal, confirmation: envelope.confirmation, recordedAt: activation.issuedAt,
    authorizationRefHash: envelope.authoritySourceHash,
  });
  if (canonicalizeStrict(replayedAttempt) !== canonicalizeStrict(attempt)) throw new Error("ATTEMPT_REPLAY_MISMATCH");
  const profileFile = path.join(activation.profileDirectory, "outsider-first-reality-profile-v1.json");
  if (sha(privateBytes(profileFile)) !== envelope.profileHash) throw new Error("PROFILE_CHANGED_REQUIRES_NEW_ACTIVATION");
  const clock = dependencies.clock ?? (() => new Date().toISOString());
  const fetchImpl = dependencies.fetchImpl ?? globalThis.fetch;
  const driver = (dependencies.createDriver ?? createFirstCommittedDigitalRealityProductionLauncher)({
    profileDirectory: activation.profileDirectory, runtimeDirectory: activation.runtimeDirectory,
    clock, ...(dependencies.providerIO ? { providerIO: dependencies.providerIO } : {}),
  });
  const node = createUserHeldOutcomeProgramComposition({
    requestId: proposal.requestId, outcomeProgramHash: proposal.programHash,
    graphRefs: attempt.graphRefs, privateEnvelopeBytes: envelopeBytes,
    privateRoot: activation.privateRoot, issuedAt: activation.issuedAt,
    expiresAt: activation.expiresAt, executionMode: DURABLE,
  }, { driver });
  const key = Buffer.from(privateBytes(path.join(output, "commitment-key.secret")).toString().trim(), "base64url");
  try {
    const binding = node.createUserHeldBinding(key);
    if (binding.jobHash !== activation.jobHash || binding.jobKey !== activation.jobKey) throw new Error("JOB_REPLAY_MISMATCH");
    const publicationFile = path.join(output, "publication.json");
    if (!existsSync(publicationFile)) {
      await publishUserHeldFormationExecutionV1({ centralOrigin: activation.centralOrigin,
        publicationBearerToken: privateBytes(activation.formationDispatchTokenFile).toString().trim(),
        executorCapabilityHash: activation.executorCapabilityHash, binding,
      }, { fetchImpl, clock });
      writePrivateExecutionRecordOnce(publicationFile, { state: "PUBLISHED",
        jobKey: binding.jobKey, jobHash: binding.jobHash });
    }
    dependencies.onProgress?.({ stage: "RUNNING_DURABLE_NODE", jobHash: binding.jobHash,
      programHash: proposal.programHash, contractHash: contractDraft.contractHash });
    const executed = await runDurableUserHeldFormationExecutorV2({
      centralOrigin: activation.centralOrigin,
      bearerToken: privateBytes(path.join(output, "executor-bearer-token.secret")).toString().trim(),
      executorCapabilityHash: activation.executorCapabilityHash, binding,
      journalDirectory: path.join(output, "transport"),
    }, { fetchImpl, clock, isLocalProgramTerminal: () => {
      try { return TERMINAL.has(node.inspectLocalProgram().state); } catch { return false; }
    } });
    const result = { schema: "outsider/user-held-digital-production-result/v2",
      jobKey: executed.jobKey, jobHash: executed.jobHash,
      centralReceiptHash: executed.receiptHash, brokerState: executed.state,
      program: node.inspectLocalProgram(), attemptHash: attempt.graphRefs.attemptHash,
      economicContract: { contractHash: contractDraft.contractHash,
        status: contractDraft.status, capitalSupport: contractDraft.capitalSupport,
        compensationTermCount: contractDraft.compensationTerms.length,
        economicRecordBindingHash: economicRecords.recordBindingHash },
      privateCredentialsProjected: false, rawProviderJournalProjected: false,
      providerIssuedCapacityEstablished: false, commercialCommitmentIssued: false,
      paymentActions: 0, accountUpgradeActions: 0 };
    writePrivateExecutionRecordOnce(path.join(output, "economic-records.json"), economicRecords);
    writePrivateExecutionRecordOnce(path.join(output, "safe-result.json"), result);
    return result;
  } finally { key.fill(0); }
}

/** A node service can call this under its OS supervisor. Every retry constructs
 * fresh bindings, honors the original expiry, and keeps the same job/Attempt.
 * There is no provider-write retry loop here: only the durable driver may
 * reconcile/resume its already frozen program.
 */
export async function superviseUserHeldDigitalProduction(directory, dependencies = {}) {
  const clock = dependencies.clock ?? (() => new Date().toISOString());
  const wait = dependencies.wait ?? (ms => new Promise(resolve => setTimeout(resolve, ms)));
  const activation = JSON.parse(privateBytes(path.join(directory, "activation.json")));
  let retry = 0;
  while (true) {
    try { return await resumeUserHeldDigitalProduction(directory, dependencies); }
    catch (error) {
      const code = error?.outsiderCode ?? "";
      const retryable = ["LOCAL_PROGRAM_NOT_TERMINAL", "NODE_ALREADY_RUNNING"].includes(code)
        || /^(?:BROKER|PUBLISH)_HTTP_(?:408|429|5\d\d)$/u.test(code)
        || error?.name === "TimeoutError" || error?.name === "AbortError"
        || error?.cause?.code === "ECONNRESET" || error?.cause?.code === "ENOTFOUND";
      if (!retryable || Date.parse(clock()) >= Date.parse(activation.expiresAt)) throw error;
      const delayMs = Math.min(30_000, 1000 * 2 ** Math.min(retry++, 5),
        Date.parse(activation.expiresAt) - Date.parse(clock()));
      dependencies.onProgress?.({ stage: "AUTOMATIC_NODE_CONTINUATION", retry, delayMs, reasonCode: code || error.name });
      await wait(delayMs);
    }
  }
}

if (process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  if (process.argv.length !== 4 || !["--input", "--durable-input", "--resume", "--supervise"].includes(process.argv[2])) {
    throw new Error("Usage: outsider-user-held-digital-production.mjs --input|--durable-input PRIVATE_JSON_FILE OR --resume|--supervise ACTIVATION_DIRECTORY");
  }
  const options = {
    onProgress: progress => process.stdout.write(`${canonicalizeStrict(progress)}\n`),
  };
  const mode = process.argv[2];
  const action = mode === "--resume" ? resumeUserHeldDigitalProduction(process.argv[3], options)
    : mode === "--supervise" ? superviseUserHeldDigitalProduction(process.argv[3], options)
      : runUserHeldDigitalProduction({ ...JSON.parse(privateBytes(process.argv[3])),
        ...(mode === "--durable-input" ? { executionMode: DURABLE } : {}) }, options);
  action.then(result => process.stdout.write(`${canonicalizeStrict(result)}\n`))
    .catch(error => {
      const code = typeof error?.outsiderCode === "string" ? error.outsiderCode
        : /^[A-Z0-9_]+$/u.test(error?.message ?? "") ? error.message : "EXECUTION_FAILED";
      process.stderr.write(`OUTSIDER_USER_HELD_DIGITAL_PRODUCTION_ERROR:${code}\n`);
      process.exitCode = 1;
    });
}
