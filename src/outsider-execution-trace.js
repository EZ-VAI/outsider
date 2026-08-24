/*
 * The canonical Execution Trace — one normalized record for supported machines.
 *
 * THE THESIS THIS FILE MAKES REAL
 * ===============================
 * "The executor is a field, not a schema." A SAT solver, a CI pipeline, a
 * coding agent, a tool-calling LLM, and a machine taking an irreversible
 * physical action can be represented as the same object: a Claim
 * attempted by a Way inside a World, leaving an Experience. This module is the
 * shape supported adapters normalize to.
 *
 * WHAT GENERALIZES, AND WHAT MUST NOT
 * ===================================
 * The MEASUREMENT generalizes: every machine consumes resources, emits
 * error/success signals, and some of its steps touch shared reality
 * irreversibly. Those facts can be measured consistently across Worlds.
 *
 * The JUDGEMENTS do not. "Never ran a test" and "empty submission" are
 * code-specific process facts. Historical v49 corpus rates are quarantined
 * because their claimed derivation is not source-replayable in this tree.
 * Applying them to a robot is meaningless. So the trace carries a `world.kind`,
 * and the World-specific flags are gated on it. Judging a warehouse robot with a
 * coding agent's ruler is exactly the instrument error this project audits out.
 */

import { sha256 } from "./canonical.js";

export const TRACE_SCHEMA = "outsider/execution-trace/v1";

/*
 * Executor kinds are OPEN. These are the ones with adapters today; the registry
 * accepts new ones. The kind is a label for routing measurement, never a
 * closed schema.
 */
export const EXECUTOR_KINDS = Object.freeze([
  "coding-agent", "tool-agent", "ci-pipeline", "solver",
  "robot", "rpa-bot", "db-migrator", "trading-agent", "unknown",
]);

/*
 * World kinds carry the two facts that decide how consequential a step is:
 * whether the World is reversible, and whether a failure lands on someone who
 * did not choose the executor (an externality). These are consequence-relevant
 * properties, not the technology.
 */
export const WORLD_KINDS = Object.freeze({
  "sandbox": { reversible: true, externality: false },
  "workstation": { reversible: false, externality: false }, // a real dev machine — NOT throwaway; the safe default for a live hook
  "code-repo": { reversible: true, externality: false },
  "ci": { reversible: true, externality: false },
  "open-source-pr": { reversible: true, externality: true },
  "prod-db": { reversible: false, externality: true },
  "market": { reversible: false, externality: true },
  "physical": { reversible: false, externality: true },
  "unknown": { reversible: false, externality: true },   // fail safe: assume worst
});

/* The universal step. `actionKind` routes World-specific derivations; the code
 * fields (verb/isTest/…) are populated only when actionKind implies them. */
export function makeStep({
  action = "", actionKind = "unknown", observation = "", exit = null,
  irreversible = false, resourceUnits = null,
  verb = null, isTest = false, isEdit = false, isSubmit = false, obsBytes = null,
} = {}) {
  return {
    action: String(action).slice(0, 800),
    actionKind,
    exit,
    irreversible,
    resourceUnits,
    verb: verb ?? deriveVerb(action, actionKind),
    isTest, isEdit, isSubmit,
    /* retain a truncated observation (LOCAL ONLY — never shipped; telemetry ships
       structural features, not this) so the grounding layer can read the real
       error / traceback text of a failing step */
    observation: observation ? String(observation).slice(0, 1200) : "",
    obsBytes: obsBytes ?? (observation ? String(observation).length : 0),
  };
}

const TEST_RE = /\b(pytest|tox|unittest|nosetests|go test|cargo test|npm test|jest)\b/i;
const EDIT_RE = /\b(sed|patch|apply_patch|edit_file|write_file|tee)\b|cat\s*>/;
const SUBMIT_RE = /\b(submit|finish|complete_task|done)\b/i;

function deriveVerb(action, actionKind) {
  const a = String(action || "").trim();
  if (actionKind === "tool-call" || actionKind === "actuation") {
    return a.split(/[\s(]/)[0].slice(0, 40);   // tool/actuator name
  }
  const tok = a.split(/\s+/);
  let v = tok[0] || "";
  if (["sudo", "time", "env", "nohup"].includes(v) && tok[1]) v = tok[1];
  return v.split("/").pop().slice(0, 32);
}

/*
 * Build a trace from already-parsed parts. Adapters call this; it computes the
 * universal resource/irreversibility rollups every World needs.
 */
export function makeExecutionTrace({
  executor, world, claim = null, steps = [], resources = {}, outcome = null,
  extractorId = "outsider-adapter/1.0",
}) {
  if (!executor || !executor.id) throw new Error("TRACE_NO_EXECUTOR: a trace must name its Way");
  const worldKind = world?.kind ?? "unknown";
  const worldProps = WORLD_KINDS[worldKind] ?? WORLD_KINDS.unknown;
  const normSteps = steps.map((s) => (s.actionKind ? s : makeStep(s)));
  const irreversibleSteps = normSteps.filter((s) => s.irreversible).length;
  const trace = {
    schema: TRACE_SCHEMA,
    executor: { id: executor.id, kind: executor.kind ?? "unknown" },
    world: { id: world?.id ?? null, kind: worldKind,
      reversible: world?.reversible ?? worldProps.reversible,
      externality: world?.externality ?? worldProps.externality },
    claim: claim ? { id: claim.id ?? null, description: claim.description ?? null } : null,
    nSteps: normSteps.length,
    steps: normSteps,
    resources: {
      costUsd: resources.costUsd ?? null,
      apiCalls: resources.apiCalls ?? null,
      tokens: resources.tokens ?? null,
      wallSeconds: resources.wallSeconds ?? null,
      energyJoules: resources.energyJoules ?? null,   // room for physical machines
    },
    irreversibleSteps,
    outcome: outcome ? { resolved: outcome.resolved ?? null, ...outcome } : null,
    extractorId,
  };
  trace.traceHash = sha256(trace);
  return trace;
}

/* ------------------------------------------------------------------ *
 * THE LIVE SESSION JOIN
 * ------------------------------------------------------------------ *
 * The shipping Stage 0.5 surface is the PreToolUse hook, and until now it
 * produced no protocol record at all: `grep -c "measureStage05\|ProcessCard"
 * src/outsider-hook.js` returned 0. That left attached supervision without the
 * evidence record used by the rest of the Stage 0.5 product.
 *
 * These two helpers are the join. The SAME merged trajectory the foreman used
 * to make a decision becomes the trace a ProcessCard is computed from, so the
 * record and the intervention can never describe different runs.
 */

/* fleetSummary — pure counting over a provenance-tagged trajectory. Counting is
   Stage 0.5's entire mandate: it describes, it does not judge. */
const ZERO = () => ({ in: 0, out: 0, cacheRead: 0, cacheCreate: 0 });
const addUsage = (a, b) => {
  if (!b) return a;
  a.in += b.in ?? 0; a.out += b.out ?? 0;
  a.cacheRead += b.cacheRead ?? 0; a.cacheCreate += b.cacheCreate ?? 0;
  return a;
};
const roundUsage = (t) => ({ in: Math.round(t.in), out: Math.round(t.out),
  cacheRead: Math.round(t.cacheRead), cacheCreate: Math.round(t.cacheCreate) });

export function fleetSummary(steps = [], { usageByOrigin = null } = {}) {
  const byOrigin = new Map();
  const sigOrigins = new Map();
  const ensure = (o) => {
    if (!byOrigin.has(o)) {
      byOrigin.set(o, { origin: o, steps: 0, tests: 0, edits: 0, red: 0,
        tokens: ZERO(), turns: 0 });
    }
    return byOrigin.get(o);
  };
  /* an agent that spent tokens without producing a single readable step still
     spent them, and hiding it would reproduce the exact undercount this whole
     accounting was added to fix */
  for (const o of Object.keys(usageByOrigin ?? {})) {
    const a = ensure(o);
    addUsage(a.tokens, usageByOrigin[o].usage);
    a.turns = usageByOrigin[o].turns ?? 0;
  }
  for (const s of steps) {
    const o = s.origin ?? "main";
    const a = ensure(o);
    a.steps += 1;
    if (s.isTest) a.tests += 1;
    if (s.isEdit) a.edits += 1;
    if (s.exit != null && s.exit !== 0) a.red += 1;
    if (s.sig) {
      if (!sigOrigins.has(s.sig)) sigOrigins.set(s.sig, new Set());
      sigOrigins.get(s.sig).add(o);
    }
  }
  /* the same identical call made by two different agents. Not an accusation —
     a fan-out may legitimately have several workers read the same file — but it
     is the countable shape of duplicated spend in a multi-agent run, and it is
     invisible to anything reading a single transcript. */
  const duplicated = [...sigOrigins.entries()]
    .filter(([, set]) => set.size > 1)
    .map(([sig, set]) => ({ sig: String(sig).slice(0, 120), origins: [...set].sort() }))
    .sort((a, b) => b.origins.length - a.origins.length)
    .slice(0, 20);

  const agents = [...byOrigin.values()].sort((a, b) => b.steps - a.steps);
  for (const a of agents) a.tokens = roundUsage(a.tokens);
  const total = agents.reduce((n, a) => n + a.steps, 0);
  const main = byOrigin.get("main")?.steps ?? 0;
  const tokens = roundUsage(agents.reduce((acc, a) => addUsage(acc, a.tokens), ZERO()));
  const mainTok = byOrigin.get("main")?.tokens ?? ZERO();
  return {
    agents,
    tokens,
    /* GENERATED tokens are the honest denominator for "did this run waste
       money": input is mostly cache re-reads of the same context and moves with
       session length rather than with effort. */
    generated: tokens.out,
    offMainGenerated: Math.max(0, tokens.out - (mainTok.out ?? 0)),
    nAgents: agents.length,
    totalSteps: total,
    /*
     * How much of the run a single-transcript supervisor would not have seen.
     *
     * NAMED FOR ITS DENOMINATOR ON PURPOSE. Each log is read as a bounded tail,
     * and the parent is usually far larger than any child — so a big parent gets
     * proportionally more truncated and this ratio overstates the children. The
     * session-level figure that has no window in it (375 parent calls vs 326
     * child calls on this repo's own run) comes from whole-file counting in
     * `tools/outsider-fleet-audit.mjs`. A ratio whose denominator is an
     * implementation detail must carry that in its name, or it will be quoted
     * as if it were the session.
     */
    offMainShareInWindow: total ? Number(((total - main) / total).toFixed(3)) : 0,
    duplicated,
  };
}

/*
 * sessionTraceFromSteps — a live hook trajectory, in the canonical shape every
 * later stage already consumes. `verb` is why this goes through makeStep:
 * makeExecutionTrace passes any step that already has an `actionKind` straight
 * through, and hook steps have one — so they would have arrived at the v49 card
 * with no verb, silently zeroing its destructive-step count.
 */
export function sessionTraceFromSteps({
  steps = [], executor = null, world = null, claim = null, resources = {},
  usageByOrigin = null, extractorId = "outsider-hook/1.0",
} = {}) {
  const norm = steps.map((s) => makeStep({
    action: s.action ?? "", actionKind: s.actionKind ?? "unknown",
    observation: s.observation ?? "", exit: s.exit ?? null,
    irreversible: Boolean(s.irreversible),
    isTest: Boolean(s.isTest), isEdit: Boolean(s.isEdit), isSubmit: Boolean(s.isSubmit),
  }));
  const fleet = fleetSummary(steps, { usageByOrigin });
  const trace = makeExecutionTrace({
    executor: executor ?? { id: "hooked-agent", kind: "coding-agent" },
    world: world ?? { kind: "workstation" },
    claim, steps: norm, extractorId,
    resources: {
      ...resources,
      /* `tokens` is a single number in the schema and every consumer downstream
         treats it as spend, so it gets the GENERATED count — the one figure that
         means the same thing for a coding agent and for anything else that
         bills. The four-way split rides on `fleet.tokens` for anyone who needs
         to tell a cache read from a fresh one. */
      apiCalls: resources.apiCalls ?? steps.length,
      tokens: resources.tokens ?? (fleet.generated || null),
    },
  });
  /* provenance travels WITH the trace, not beside it: a card computed from a
     six-agent floor must never be readable as a card about one worker */
  trace.fleet = fleet;
  trace.traceHash = sha256(trace);
  return trace;
}

/* ------------------------------------------------------------------ *
 * The adapter registry
 * ------------------------------------------------------------------ */

const REGISTRY = [];

/*
 * register an adapter: { name, kind, detect(raw)->bool, normalize(raw, hint)->trace }.
 * `detect` should be cheap and specific. Order of registration is priority.
 */
export function registerAdapter(adapter) {
  if (!adapter || !adapter.name || typeof adapter.detect !== "function"
      || typeof adapter.normalize !== "function") {
    throw new Error("BAD_ADAPTER: need { name, detect, normalize }");
  }
  REGISTRY.push(adapter);
  return adapter;
}

export function listAdapters() {
  return REGISTRY.map((a) => ({ name: a.name, kind: a.kind ?? "unknown" }));
}

/*
 * normalizeExecution — detect the format and normalize to an Execution Trace.
 * `hint.adapter` forces a named adapter; `hint.executor` / `hint.world` fill
 * fields the raw input cannot supply (a robot log rarely says which robot).
 */
export function normalizeExecution(raw, hint = {}) {
  if (hint.adapter) {
    const forced = REGISTRY.find((a) => a.name === hint.adapter);
    if (!forced) throw new Error(`UNKNOWN_ADAPTER: ${hint.adapter}`);
    return forced.normalize(raw, hint);
  }
  for (const adapter of REGISTRY) {
    let ok = false;
    try { ok = adapter.detect(raw); } catch { ok = false; }
    if (ok) return adapter.normalize(raw, hint);
  }
  throw new Error("NO_ADAPTER_MATCHED: no registered adapter recognized this input; "
    + "pass hint.adapter, or register one. Known: "
    + REGISTRY.map((a) => a.name).join(", "));
}
