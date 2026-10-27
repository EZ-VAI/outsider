/*
 * Versioned descendant of the first committed-reality provider composition.
 *
 * The frozen v1 Cloudflare primary and UptimeRobot/Globalping route-witness
 * wiring are reused unchanged. Only the recovery implementation is replaced:
 * a GitHub Release Asset v2 adapter receives a separately constructed,
 * same-token Administration:read policy probe before it may mutate GitHub.
 *
 * The two credential fields are explicit capability slots. They must contain
 * the exact same token because the policy preflight is evidence about the
 * credential that will create/delete the release, not transferable authority.
 * Construction itself performs no provider request.
 */

import { createFirstCommittedDigitalRealityProductionCompositionV1 }
  from "./outsider-first-committed-digital-reality-production-composition-v1.js";
import { createGitHubImmutableReleasePolicyProductionProbeV1 }
  from "./outsider-github-immutable-release-policy-production-probe-v1.js";
import { createGitHubReleaseAssetProductionRecoveryAdapterV2 }
  from "./outsider-github-release-asset-production-recovery-adapter-v2.js";

const PREFIX
  = "OUTSIDER_FIRST_COMMITTED_REALITY_PRODUCTION_COMPOSITION_V2_";
const REPOSITORY_PART = /^[A-Za-z0-9_.-]{1,100}$/u;

function fail(code) {
  const error = new TypeError(`${PREFIX}${code}`);
  error.outsiderCode = code;
  throw error;
}

function optionalFunction(value) {
  return value === undefined || typeof value === "function";
}

function checkedGitHub(input) {
  if (input === null || typeof input !== "object" || Array.isArray(input)
    || typeof input.contentsWriteApiToken !== "string"
    || input.contentsWriteApiToken.length < 20
    || typeof input.administrationReadApiToken !== "string"
    || input.administrationReadApiToken.length < 20
    || input.contentsWriteApiToken !== input.administrationReadApiToken
    || input.administrationReadCapabilityConfirmed !== true
    || typeof input.owner !== "string" || !REPOSITORY_PART.test(input.owner)
    || typeof input.repository !== "string"
    || !REPOSITORY_PART.test(input.repository)
    || (input.baseBranch !== undefined
      && (typeof input.baseBranch !== "string"
        || input.baseBranch.length < 1 || input.baseBranch.length > 200
        || /[\u0000-\u001f\u007f]/u.test(input.baseBranch)))
    || !Buffer.isBuffer(input.artifactBytes) || input.artifactBytes.length < 1
    || !optionalFunction(input.contentsFetchImpl)
    || !optionalFunction(input.administrationFetchImpl)) {
    fail("GITHUB_CAPABILITY_CONFIG_INVALID");
  }
  return input;
}

/**
 * Create the first-reality production federation with Release Asset recovery.
 * Provider credentials remain inside the two GitHub adapter closures and are
 * never added to the returned federation or reservation state.
 */
export function createFirstCommittedDigitalRealityProductionCompositionV2(
  input = {}) {
  if (input.recoveryAdapter !== undefined) {
    fail("RECOVERY_OVERRIDE_FORBIDDEN");
  }
  const github = checkedGitHub(input.githubReleaseAsset);
  const policyProbe = createGitHubImmutableReleasePolicyProductionProbeV1({
    apiToken: github.administrationReadApiToken,
    administrationReadCapabilityConfirmed:
      github.administrationReadCapabilityConfirmed,
    owner: github.owner,
    repository: github.repository,
    ...(github.policyProbeId === undefined
      ? {} : { probeId: github.policyProbeId }),
    ...(github.policyRequestTimeoutMs === undefined
      ? {} : { requestTimeoutMs: github.policyRequestTimeoutMs }),
    ...(github.administrationFetchImpl === undefined
      ? {} : { fetchImpl: github.administrationFetchImpl }),
  });
  const recoveryAdapter =
    createGitHubReleaseAssetProductionRecoveryAdapterV2({
      apiToken: github.contentsWriteApiToken,
      owner: github.owner,
      repository: github.repository,
      ...(github.baseBranch === undefined
        ? {} : { baseBranch: github.baseBranch }),
      artifactBytes: github.artifactBytes,
      immutableReleasePolicyProbe: policyProbe,
      ...(github.adapterId === undefined ? {} : { adapterId: github.adapterId }),
      ...(github.requestTimeoutMs === undefined
        ? {} : { requestTimeoutMs: github.requestTimeoutMs }),
      ...(github.routeVerificationTimeoutMs === undefined
        ? {} : { routeVerificationTimeoutMs:
          github.routeVerificationTimeoutMs }),
      ...(github.routePollIntervalMs === undefined
        ? {} : { routePollIntervalMs: github.routePollIntervalMs }),
      ...(github.contentsFetchImpl === undefined
        ? {} : { fetchImpl: github.contentsFetchImpl }),
      ...(github.now === undefined ? {} : { now: github.now }),
      ...(github.wait === undefined ? {} : { wait: github.wait }),
    });

  return createFirstCommittedDigitalRealityProductionCompositionV1({
    ...input,
    recoveryAdapter,
  });
}
