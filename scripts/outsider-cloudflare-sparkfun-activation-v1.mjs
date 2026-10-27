#!/usr/bin/env node

/* Create one short-lived, private Cloudflare activation bundle. */

import { randomBytes, randomUUID } from "node:crypto";
import {
  chmodSync, closeSync, constants, lstatSync, mkdirSync, openSync, readFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import { canonicalizeStrict } from "../src/canonical.js";
import { compileCloudflareSparkFunExecutorDeploymentV1 }
  from "../src/outsider-cloudflare-sparkfun-executor-v1.js";
import { issueFormationTransportValidationAttemptV1 }
  from "../src/outsider-formation-transport-validation-attempt-v1.js";

const envelopePath = path.resolve(process.argv[2]
  ?? ".outsider/private/live-formation-inputs/sparkfun-prepayment-20260904-v2.json");
const unifiedPath = path.resolve(process.argv[3]
  ?? ".outsider/private/first-physical-unified-preflight-20260904-srycpy/unified-result.json");
const root = path.resolve(process.argv[4]
  ?? ".outsider/private/cloudflare-sparkfun-activation-v1");

function privateFile(file) {
  const info = lstatSync(file);
  if (!info.isFile() || info.isSymbolicLink()
    || (info.mode & 0o777) !== 0o600) throw new Error("PRIVATE_INPUT_MODE_INVALID");
  return JSON.parse(readFileSync(file, "utf8"));
}

function writePrivate(file, bytes) {
  const descriptor = openSync(file, constants.O_WRONLY | constants.O_CREAT
    | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
  try { writeFileSync(descriptor, bytes); } finally {
    // writeFileSync does not close a caller-owned descriptor.
    closeSync(descriptor);
  }
  chmodSync(file, 0o600);
  return { name: path.basename(file), bytes: Buffer.byteLength(bytes), mode: "0600" };
}

mkdirSync(root, { recursive: true, mode: 0o700 });
chmodSync(root, 0o700);
const output = path.join(root, `activation-${randomUUID()}`);
mkdirSync(output, { mode: 0o700 });
chmodSync(output, 0o700);

const now = new Date();
const issuedAt = now.toISOString();
const jobExpiresAt = new Date(now.getTime() + 60 * 60 * 1000).toISOString();
const envelopeExpiresAt = new Date(now.getTime() + 70 * 60 * 1000).toISOString();
const sourceEnvelope = privateFile(envelopePath);
const unified = privateFile(unifiedPath);
const privateEnvelope = {
  ...sourceEnvelope,
  formationExpiresAt: envelopeExpiresAt,
  paymentAuthorized: false,
  orderAuthorized: false,
};
if (Date.parse(envelopeExpiresAt) >= Date.parse(privateEnvelope.completionDeadline)) {
  throw new Error("ACTIVATION_WINDOW_EXCEEDS_COMPLETION_DEADLINE");
}
const privateEnvelopeBytes = Buffer.from(`${canonicalizeStrict(privateEnvelope)}\n`,
  "utf8");
const predecessorComposition = unified?.episodeData?.episodeAttemptSetComposition;
const orderId = `order:sparkfun-edge-${issuedAt.slice(0, 10).replaceAll("-", "")}-${randomBytes(8).toString("hex")}`;
const attempt = issueFormationTransportValidationAttemptV1({
  predecessorComposition,
  orderId,
  outcomeProgramHash: unified.programHash,
  adapterId: "sparkfun-magento-cloudflare-no-payment",
  adapterVersion: "1.0.0",
  provider: "SPARKFUN_MAGENTO_GUEST_CART",
  executionSurface: "CLOUDFLARE_WORKERS_SERVICE_BINDING",
  issuedAt,
});
const compiled = compileCloudflareSparkFunExecutorDeploymentV1({
  orderId,
  outcomeProgramHash: unified.programHash,
  graphRefs: attempt.graphRefs,
  privateEnvelopeBytes,
  issuedAt,
  expiresAt: jobExpiresAt,
});
const artifacts = [];
artifacts.push(writePrivate(path.join(output, "private-envelope.json"),
  privateEnvelopeBytes));
artifacts.push(writePrivate(path.join(output, "sparkfun-private-envelope.secret"),
  compiled.privateEnvelopeSecretBase64));
artifacts.push(writePrivate(path.join(output, "sparkfun-registration.secret"),
  canonicalizeStrict(compiled.registration)));
artifacts.push(writePrivate(path.join(output, "formation-executor-allowlist.secret"),
  canonicalizeStrict([{ adapterId: compiled.registration.adapterId,
    adapterVersion: compiled.registration.adapterVersion,
    planHash: compiled.registration.planHash }])));
artifacts.push(writePrivate(path.join(output, "formation-dispatch-token.secret"),
  randomBytes(48).toString("base64url")));
artifacts.push(writePrivate(path.join(output, "formation-job.json"),
  `${canonicalizeStrict(compiled.job)}\n`));
artifacts.push(writePrivate(path.join(output, "formation-attempt.json"),
  `${canonicalizeStrict(attempt.attemptRecord)}\n`));
artifacts.push(writePrivate(path.join(output,
  "episode-attempt-set-composition.json"),
`${canonicalizeStrict(attempt.episodeAttemptSetComposition)}\n`));
const manifest = {
  schema: "outsider/private-cloudflare-sparkfun-activation/v1",
  schemaVersion: "1.0.0",
  issuedAt,
  expiresAt: jobExpiresAt,
  orderId,
  job: compiled.job,
  registration: compiled.registration,
  attemptRecordHash: attempt.attemptRecord.attemptHash,
  predecessorCompositionHash: predecessorComposition.compositionHash,
  descendantCompositionHash:
    attempt.episodeAttemptSetComposition.compositionHash,
  privacy: { containsPrivateEnvelope: true, publicProjectionPermitted: false },
  paymentAuthorized: false,
  orderAuthorized: false,
};
artifacts.push(writePrivate(path.join(output, "activation-private-manifest.json"),
  `${canonicalizeStrict(manifest)}\n`));

process.stdout.write(`${JSON.stringify({
  ok: true,
  schema: manifest.schema,
  outputDirectory: output,
  issuedAt,
  expiresAt: jobExpiresAt,
  attemptOrdinal: attempt.attemptRecord.attemptOrdinal,
  sameEpisode: attempt.attemptRecord.episodeHash
    === predecessorComposition.episodeBinding.episodeHash,
  newAttemptHash: attempt.attemptRecord.attemptHash
    !== predecessorComposition.attempts.at(-1).attemptHash,
  descendantCompositionVerified: attempt.verification.ok,
  graphAncestorsReused: true,
  privateEnvelopeProjected: false,
  paymentAuthorized: false,
  orderAuthorized: false,
  artifacts,
}, null, 2)}\n`);
