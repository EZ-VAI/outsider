#!/usr/bin/env node

/* One-shot Target implementation behind the seller-neutral user-held broker job. */
import { createHash, randomBytes } from "node:crypto";
import { chmodSync, closeSync, constants, fsyncSync, lstatSync, mkdirSync,
  openSync, readFileSync, realpathSync, readdirSync, writeSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { canonicalizeStrict } from "../src/canonical.js";
import { issueUserHeldRouteObservationAttemptV1 } from
  "../src/outsider-user-held-route-observation-attempt-v1.js";
import { createUserHeldReadOnlyRouteObservationCompositionV1,
  createUserHeldReadOnlyRouteObservationMachineAdapterV1 } from
  "../src/outsider-user-held-read-only-route-observation-executor-v1.js";
import { publishUserHeldFormationExecutionV1,
  runUserHeldFormationExecutorOnceV1 } from
  "../src/outsider-user-held-formation-executor-client-v1.js";
import { deriveUserHeldFormationExecutorCapabilityHashV1 } from
  "../src/outsider-user-held-formation-executor-protocol-v1.js";
import { runTargetRedskyReadOnlyLiveV3 } from
  "./outsider-target-redsky-read-only-live-v3.mjs";

const PREFIX = "OUTSIDER_TARGET_USER_HELD_ROUTE_OBSERVATION_PRODUCTION_V1_";
const ORIGIN = "https://outsider-formation-job-worker.outsider-guard.workers.dev";
const sha = bytes => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
const digest = (domain, value) => sha(Buffer.from(`${domain}\0${canonicalizeStrict(value)}`));
function fail(code) { throw new TypeError(`${PREFIX}${code}`); }
function privateFile(root, file, maximum = 1024 * 1024) {
  const base = realpathSync(path.resolve(root)), absolute = realpathSync(path.resolve(file));
  if (!absolute.startsWith(`${base}${path.sep}`)) fail("PRIVATE_FILE_OUTSIDE_ROOT");
  const stat = lstatSync(absolute);
  if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o777) !== 0o600
    || stat.size < 1 || stat.size > maximum) fail("PRIVATE_FILE_INVALID");
  return { absolute, bytes: readFileSync(absolute) };
}
function directory(dir) { mkdirSync(dir, { recursive: true, mode: 0o700 });
  chmodSync(dir, 0o700); const stat = lstatSync(dir);
  if (!stat.isDirectory() || stat.isSymbolicLink()
    || (stat.mode & 0o777) !== 0o700) fail("PRIVATE_DIRECTORY_INVALID"); }
function write0600(file, bytes) { let fd; try { fd = openSync(file,
  constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
  let offset = 0; while (offset < bytes.length) {
    offset += writeSync(fd, bytes, offset, bytes.length - offset);
  }
  fsyncSync(fd); } finally { if (fd !== undefined) closeSync(fd); }
  chmodSync(file, 0o600); return { byteLength: bytes.length, bytesHash: sha(bytes) }; }
function graphRefs(attempt) { const binding = attempt.descendantComposition.episodeBinding;
  return { principalEpochHash: binding.principalEpochProjectionHash,
    accountableDeploymentHash: binding.accountableDeploymentSubjectHash,
    runtimeOrEmbodimentHash: binding.embodimentRevisionHash ?? binding.runtimeInstanceHash,
    delegationHash: binding.delegationEdgeHash, episodeHash: binding.episodeHash,
    attemptHash: attempt.attempt.attemptHash }; }
function uint32(value) { const bytes = Buffer.alloc(4); bytes.writeUInt32BE(value); return bytes; }
function exactTargetSourceReplayBundle(runDirectory) {
  const responses = path.join(runDirectory, "runtime");
  const sourceFiles = [];
  const visit = directoryName => { for (const name of readdirSync(directoryName)) {
    const file = path.join(directoryName, name), stat = lstatSync(file);
    if (stat.isDirectory()) visit(file);
    else if (name.endsWith(".source-v2.bin")) sourceFiles.push(file);
  } };
  visit(responses); sourceFiles.sort();
  if (sourceFiles.length !== 2) fail("TARGET_SOURCE_RESPONSE_COUNT_INVALID");
  const sources = sourceFiles.map(file => privateFile(runDirectory, file));
  const manifest = { schema: "outsider/private-target-two-response-source-replay-bundle/v1",
    responseCount: 2, entries: sources.map((source, ordinal) => ({ ordinal: ordinal + 1,
      byteLength: source.bytes.length, sourceBytesHash: sha(source.bytes) })) };
  const manifestBytes = Buffer.from(canonicalizeStrict(manifest));
  return Buffer.concat([Buffer.from("OUTSIDER_TARGET_SOURCE_REPLAY_BUNDLE_V1\0"),
    uint32(manifestBytes.length), manifestBytes,
    ...sources.flatMap(source => [uint32(source.bytes.length), source.bytes])]);
}

export async function runTargetUserHeldRouteObservationProductionV1(input = {}, deps = {}) {
  const required = ["privateRoot", "predecessorCompositionFile", "outcomeProgramHash", "outcomeInputFile",
    "priorRouteBindingFile", "frozenProductStateFile", "formationDispatchTokenFile",
    "outputRoot", "issuedAt", "expiresAt"];
  if (input === null || typeof input !== "object" || Reflect.ownKeys(input).length !== required.length
    || required.some(key => !Object.hasOwn(input, key))) fail("INPUT_INVALID");
  if (typeof deps.fetchImpl !== "function" || typeof deps.clock !== "function") fail("DEPENDENCIES_INVALID");
  const root = realpathSync(path.resolve(input.privateRoot));
  const predecessorSource = privateFile(root, input.predecessorCompositionFile);
  const predecessor = JSON.parse(predecessorSource.bytes);
  const outcome = privateFile(root, input.outcomeInputFile, 64 * 1024);
  const route = privateFile(root, input.priorRouteBindingFile, 64 * 1024);
  const product = privateFile(root, input.frozenProductStateFile, 64 * 1024);
  const dispatch = privateFile(root, input.formationDispatchTokenFile, 4096);
  const attempt = issueUserHeldRouteObservationAttemptV1({ predecessor,
    occurredAt: input.issuedAt, recordedAt: input.issuedAt,
    attemptActorSubjectHash: predecessor.attempts.at(-1).attemptActorSubjectHash,
    brokerInstructionRefHash: digest("outsider/target-observation-broker-instruction/v1",
      { predecessorCompositionHash: predecessor.compositionHash }),
    sourceInterfaceRefHash: digest("outsider/private-target-redsky-interface/v1",
      { routeFileHash: sha(route.bytes) }),
    idempotencyKeyHash: digest("outsider/target-observation-idempotency/v1",
      { predecessorCompositionHash: predecessor.compositionHash, issuedAt: input.issuedAt }) });
  const envelopeValue = { schema: "outsider/private-target-route-observation-envelope/v1",
    outcomeInputFile: outcome.absolute, priorRouteBindingFile: route.absolute,
    frozenProductStateFile: product.absolute };
  const envelope = Buffer.from(`${canonicalizeStrict(envelopeValue)}\n`);
  const adapter = createUserHeldReadOnlyRouteObservationMachineAdapterV1({
    adapterInstanceRefHash: digest("outsider/private-target-redsky-machine-adapter/v1", {}),
    async observeReadOnly(command) {
      const value = JSON.parse(command.privateEnvelopeBytes.toString("utf8"));
      const result = await runTargetRedskyReadOnlyLiveV3({
        outcomeInputFile: value.outcomeInputFile,
        priorRouteBindingFile: value.priorRouteBindingFile,
        frozenProductStateFile: value.frozenProductStateFile,
        privateRoot: root, observedAt: deps.clock(), fetchImpl: deps.fetchImpl });
      return { rawSourceBytes: exactTargetSourceReplayBundle(result.runDirectory),
        sourceState: "OBSERVED", sourceDeclarationClass: "OTHER_SOURCE_DECLARATION",
        sourceExpiresAt: null };
    } });
  const composition = createUserHeldReadOnlyRouteObservationCompositionV1({
    orderId: `order:route-observation:${attempt.attempt.attemptHash.slice(7)}`,
    outcomeProgramHash: input.outcomeProgramHash,
    graphRefs: graphRefs(attempt), privateEnvelopeBytes: envelope,
    privateRoot: root, issuedAt: input.issuedAt, expiresAt: input.expiresAt,
  }, { machineAdapter: adapter, clock: deps.clock });
  const requestedRoot = path.resolve(input.privateRoot);
  const requestedOutput = path.resolve(input.outputRoot);
  const outputRelative = path.relative(requestedRoot, requestedOutput);
  if (outputRelative === "" || outputRelative.startsWith(`..${path.sep}`)
    || path.isAbsolute(outputRelative)) fail("OUTPUT_OUTSIDE_PRIVATE_ROOT");
  directory(requestedOutput);
  const output = realpathSync(requestedOutput);
  if (!output.startsWith(`${root}${path.sep}`)) {
    fail("OUTPUT_OUTSIDE_PRIVATE_ROOT");
  }
  const activation = path.join(output, `activation-${attempt.attempt.attemptHash.slice(7, 39)}`);
  directory(activation);
  const bearerBytes = (deps.randomBytes ?? randomBytes)(48);
  const key = (deps.randomBytes ?? randomBytes)(32);
  const bearer = Buffer.from(bearerBytes).toString("base64url");
  const binding = composition.createUserHeldBinding(Buffer.from(key));
  const capabilityHash = deriveUserHeldFormationExecutorCapabilityHashV1({
    bearerToken: bearer, jobHash: binding.jobHash });
  const artifacts = [];
  artifacts.push(write0600(path.join(activation, "executor-bearer-token.secret"),
    Buffer.from(`${bearer}\n`)));
  artifacts.push(write0600(path.join(activation, "commitment-key.secret"),
    Buffer.from(`${Buffer.from(key).toString("base64url")}\n`)));
  artifacts.push(write0600(path.join(activation, "episode-attempt-set-composition.json"),
    Buffer.from(`${canonicalizeStrict(attempt.descendantComposition)}\n`)));
  const publicationToken = dispatch.bytes.toString("utf8").trim();
  const published = await publishUserHeldFormationExecutionV1({ centralOrigin: ORIGIN,
    publicationBearerToken: publicationToken, executorCapabilityHash: capabilityHash,
    binding }, { fetchImpl: deps.fetchImpl, clock: deps.clock });
  const executed = await runUserHeldFormationExecutorOnceV1({ centralOrigin: ORIGIN,
    bearerToken: bearer, executorCapabilityHash: capabilityHash, binding },
  { fetchImpl: deps.fetchImpl, clock: deps.clock });
  bearerBytes.fill(0); key.fill(0); envelope.fill(0);
  const safe = { schema: "outsider/target-user-held-route-observation-production-result/v1",
    adapterBinding: composition.localProjection.adapterBinding,
    jobKey: executed.jobKey, jobHash: executed.jobHash,
    centralReceiptHash: executed.receiptHash,
    attemptHash: attempt.attempt.attemptHash,
    descendantCompositionHash: attempt.descendantComposition.compositionHash,
    publishedState: published.state, executionState: executed.state,
    executionPerformed: executed.executionPerformed,
    paymentActions: 0, orderActions: 0, cartActions: 0,
    contactSubmissions: 0, addressSubmissions: 0,
    providerProjectedToCentral: false, destinationProjectedToCentral: false,
    rawSourceProjectedToCentral: false, externalEffect: "READ_ONLY",
    sellerSourceValidityClaimed: false, authorityMinted: false,
    capacityEstablished: false, independentOutcomeTruthEstablished: false,
    outcomeCommitted: false };
  artifacts.push(write0600(path.join(activation, "activation-safe-receipt.json"),
    Buffer.from(`${canonicalizeStrict(safe)}\n`)));
  return { activation, safe, artifacts };
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const args = new Map(); for (let i = 2; i < process.argv.length; i += 2) args.set(process.argv[i], process.argv[i + 1]);
  const get = key => { const value = args.get(key); if (!value) fail("CLI_ARGUMENTS_INVALID"); return value; };
  const result = await runTargetUserHeldRouteObservationProductionV1({
    privateRoot: get("--private-root"), predecessorCompositionFile: get("--predecessor"),
    outcomeProgramHash: get("--outcome-program-hash"),
    outcomeInputFile: get("--outcome"), priorRouteBindingFile: get("--route"),
    frozenProductStateFile: get("--product-state"),
    formationDispatchTokenFile: get("--dispatch-token"), outputRoot: get("--output-root"),
    issuedAt: get("--issued-at"), expiresAt: get("--expires-at") },
  { fetchImpl: globalThis.fetch, clock: () => new Date().toISOString() });
  process.stdout.write(`${canonicalizeStrict(result.safe)}\n`);
}
