import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { canonicalizeStrict } from "../src/canonical.js";

export const R1_FIXTURE_ID = "missing-role-default";
export const R1_RUN_COUNT = 5;
export const R1_MIN_RECOVERY_WINDOW_MS = 120_000;

export function r1Digest(value) {
  const bytes = Buffer.isBuffer(value) || typeof value === "string"
    ? value : canonicalizeStrict(value);
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

export function r1FileDigest(file) {
  return r1Digest(readFileSync(file));
}

export function r1Record(body, field = "recordHash") {
  return { ...body, [field]: r1Digest(body) };
}

export function verifyR1Record(record, field = "recordHash") {
  if (!record || typeof record !== "object") return false;
  const body = Object.fromEntries(Object.entries(record).filter(([key]) => key !== field));
  return record[field] === r1Digest(body);
}

const chainTypes = [
  "boundary_paused",
  "supervisor_verdict",
  "correction_factual_audit",
  "correction_emitted",
  "correction_observed",
  "effect_observed",
  "acceptance_finished",
  "outcome_verdict",
  "intervention_resolved",
  "run_finalized",
];

/**
 * R1 is deliberately stricter than "these event names appeared somewhere".
 * It requires one resolved intervention, one authority and a strictly ordered
 * chain. The terminal event is global; all other causal events bind the same
 * intervention ID. Authority is required on the four delivery/effect links
 * and every authority-bearing link must agree.
 */
export function assessR1CausalChain(events) {
  const errors = [];
  if (!Array.isArray(events)) return { ok: false, errors: ["EVENTS_NOT_ARRAY"] };
  const matching = (type, predicate = () => true) => events.filter((event) =>
    event.type === type && predicate(event));
  const candidates = matching("correction_emitted", (event) => event.interventionId
    && (event.correctionAuthorityHash ?? event.authorityHash));
  const chains = candidates.map((emitted) => {
    const interventionId = emitted.interventionId;
    const authorityHash = emitted.correctionAuthorityHash ?? emitted.authorityHash;
    const byIdentityAndAuthority = (event) => event.interventionId === interventionId
      && (event.correctionAuthorityHash ?? event.authorityHash ?? null) === authorityHash;
    const observed = matching("correction_observed", byIdentityAndAuthority)
      .find((event) => event.seq > emitted.seq) ?? null;
    const effect = matching("effect_observed", byIdentityAndAuthority)
      .find((event) => event.seq > (observed?.seq ?? Infinity)) ?? null;
    const pause = [...matching("boundary_paused", (event) =>
      event.interventionId === interventionId && event.seq < emitted.seq)].at(-1) ?? null;
    const verdict = matching("supervisor_verdict", (event) =>
      event.interventionId === interventionId && event.onTrack === false
        && (event.correctionAuthorityHash ?? event.authorityHash ?? null) === authorityHash
        && event.seq > (pause?.seq ?? Infinity) && event.seq < emitted.seq)[0] ?? null;
    const audit = [...matching("correction_factual_audit", (event) =>
      byIdentityAndAuthority(event) && event.passed === true
        && event.seq > (verdict?.seq ?? Infinity) && event.seq < emitted.seq)].at(-1) ?? null;
    const acceptance = matching("acceptance_finished", (event) =>
      event.interventionId === interventionId && event.phase === "stop"
        && event.ran === true && event.passed === true
        && event.seq > (effect?.seq ?? Infinity))[0] ?? null;
    const outcome = matching("outcome_verdict", (event) =>
      event.interventionId === interventionId && event.phase === "stop"
        && event.passed === true && event.seq > (acceptance?.seq ?? Infinity))[0] ?? null;
    const resolved = matching("intervention_resolved", byIdentityAndAuthority)
      .find((event) => event.seq > (outcome?.seq ?? Infinity)) ?? null;
    const links = { boundary_paused: pause, supervisor_verdict: verdict,
      correction_factual_audit: audit, correction_emitted: emitted,
      correction_observed: observed, effect_observed: effect,
      acceptance_finished: acceptance, outcome_verdict: outcome,
      intervention_resolved: resolved };
    const ordered = chainTypes.slice(0, -1).map((type) => links[type]?.seq ?? null);
    const complete = ordered.every(Number.isInteger)
      && ordered.every((seq, index) => index === 0 || seq > ordered[index - 1]);
    return { interventionId, authorityHash, links, complete };
  });
  const completeChains = chains.filter((chain) => chain.complete);
  if (completeChains.length !== 1) {
    errors.push(`COMPLETE_CAUSAL_CHAIN_COUNT:${completeChains.length}`);
  }
  const selected = completeChains.length === 1 ? completeChains[0] : null;
  const interventionId = selected?.interventionId ?? null;
  const authorityHash = selected?.authorityHash ?? null;
  const { boundary_paused: pause = null, supervisor_verdict: verdict = null,
    correction_factual_audit: audit = null, correction_emitted: emitted = null,
    correction_observed: observed = null, effect_observed: effect = null,
    acceptance_finished: acceptance = null, outcome_verdict: outcome = null,
    intervention_resolved: resolved = null } = selected?.links ?? {};
  const finalizedMatches = matching("run_finalized");
  if (finalizedMatches.length !== 1) errors.push(`RUN_FINALIZED_COUNT:${finalizedMatches.length}`);
  const finalized = finalizedMatches[0] ?? null;
  const links = {
    boundary_paused: pause,
    supervisor_verdict: verdict,
    correction_factual_audit: audit,
    correction_emitted: emitted,
    correction_observed: observed,
    effect_observed: effect,
    acceptance_finished: acceptance,
    outcome_verdict: outcome,
    intervention_resolved: resolved,
    run_finalized: finalized,
  };
  for (const type of chainTypes) {
    if (!links[type]) errors.push(`${type.toUpperCase()}_MISSING`);
  }
  if (links.run_finalized?.proofComplete !== true) errors.push("FINAL_PROOF_INCOMPLETE");
  const ordered = chainTypes.map((type) => links[type]?.seq ?? null);
  if (ordered.some((seq) => !Number.isInteger(seq))
    || ordered.some((seq, index) => index > 0 && seq <= ordered[index - 1])) {
    errors.push("CAUSAL_CHAIN_NOT_STRICTLY_ORDERED");
  }
  const authorityRequired = ["correction_factual_audit", "correction_emitted",
    "correction_observed", "effect_observed", "intervention_resolved"];
  const authorityHashes = authorityRequired.map((type) =>
    links[type]?.correctionAuthorityHash ?? links[type]?.authorityHash ?? null);
  if (authorityHashes.some((value) => !/^sha256:[a-f0-9]{64}$/.test(String(value ?? "")))) {
    errors.push("CAUSAL_AUTHORITY_HASH_MISSING");
  }
  const distinctAuthority = new Set(authorityHashes.filter(Boolean));
  if (distinctAuthority.size !== 1) errors.push(`CAUSAL_AUTHORITY_HASH_COUNT:${distinctAuthority.size}`);
  return {
    ok: errors.length === 0,
    errors,
    interventionId,
    correctionAuthorityHash: distinctAuthority.size === 1 ? [...distinctAuthority][0] : null,
    sequence: Object.fromEntries(chainTypes.map((type) => [type, links[type]?.seq ?? null])),
  };
}

export function makeR1CanonicalCase({ artifactHash, evaluatorHash, fixtureHash,
  contractHash, hiddenAcceptanceHash, runtimeIdentityHash = null }) {
  return {
    claim: { claimHash: r1Digest({ schema: "outsider/r1-claim/v1",
      fixtureId: R1_FIXTURE_ID, contractHash }) },
    way: { wayHash: r1Digest({ schema: "outsider/r1-way/v1", host: "claude-code",
      artifactHash, evaluatorHash, runtimeIdentityHash }) },
    world: { worldHash: r1Digest({ schema: "outsider/r1-world/v1",
      fixtureId: R1_FIXTURE_ID, fixtureHash, hiddenAcceptanceHash }) },
  };
}
