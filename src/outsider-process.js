/*
 * World-aware measurement over an Execution Trace.
 *
 * The card produced here has the same shape as the coding-agent process card,
 * but the FLAG SET is gated by World, because that is the honest thing to do:
 *
 *   - UNIVERSAL flags apply to every machine — a robot, a CI run, a coding
 *     agent all consume resources and can error, and some steps are
 *     irreversible. The irreversible-errored step is the highest-consequence
 *     universal signal and the reason a physical World is priced differently
 *     from a sandbox.
 *
 *   - CODE flags (empty submission, never-ran-a-test) are code-specific process
 *     facts. The historical v49 corpus constants are not source-replayable in
 *     the current tree, so no base rate is attached or transferred to another
 *     World.
 */

import { sha256 } from "./canonical.js";
import { processReportCardV49 } from "./v49-agent-pathology.js";

const CODE_WORLDS = new Set(["code-repo", "sandbox", "ci", "open-source-pr"]);

function r3(x) { return x == null ? null : Number(Number(x).toFixed(3)); }

export function measureExecutionTrace(trace, peers = {}) {
  if (trace?.schema !== "outsider/execution-trace/v1") {
    throw new Error("MEASURE_BAD_TRACE: expected an outsider/execution-trace/v1");
  }
  const steps = trace.steps ?? [];
  const errored = steps.filter((s) => s.exit != null && s.exit !== 0);
  const errorRate = steps.length ? errored.length / steps.length : null;
  const irreversibleErrored = steps.filter((s) => s.irreversible && s.exit).length;
  const cost = trace.resources?.costUsd ?? null;
  const costVsPeer = (cost != null && peers.peerCostMedianUsd)
    ? Number((cost / peers.peerCostMedianUsd).toFixed(2)) : null;

  const facts = {
    executor: trace.executor,
    world: trace.world,
    waste: { steps: trace.nSteps, costUsd: cost, costVsPeerMedian: costVsPeer,
      apiCalls: trace.resources?.apiCalls ?? null, tokens: trace.resources?.tokens ?? null,
      energyJoules: trace.resources?.energyJoules ?? null },
    reliability: { errorRate: r3(errorRate), erroredSteps: errored.length },
    consequence: { irreversibleSteps: trace.irreversibleSteps ?? 0,
      irreversibleErroredSteps: irreversibleErrored,
      worldReversible: trace.world?.reversible, worldExternality: trace.world?.externality },
  };

  const flags = [];

  /* UNIVERSAL — the irreversible-errored step. In a non-reversible World this is
     the signal that matters most: an action that both went wrong AND cannot be
     undone. Fires for any machine. */
  if (irreversibleErrored > 0) {
    flags.push({ kind: "consequence", signal: "irreversible-step-errored",
      observed: `${irreversibleErrored} step(s) errored on an irreversible action`,
      scope: "all worlds",
      reads: `in a ${trace.world?.reversible === false ? "non-reversible" : "this"} `
        + `World this is the highest-consequence signal — a wrong action that cannot be undone` });
  }
  /* UNIVERSAL — waste vs peers. In code Worlds the v49 delegate already raises
     the same caller-denominator fact, so it is added here only for the Worlds
     v49 does not cover, avoiding a double flag. */
  const isCodeWorld = CODE_WORLDS.has(trace.world?.kind);
  if (!isCodeWorld && costVsPeer && costVsPeer >= 3) {
    flags.push({ kind: "waste", signal: "cost-far-above-peers",
      observed: `${costVsPeer}x the median cost for this task`, scope: "all worlds",
      reads: "resource use far above peers on the same Claim" });
  }
  /* UNIVERSAL — high error rate, honestly weak */
  if (errorRate != null && errorRate > 0.5) {
    flags.push({ kind: "reliability", signal: "high-error-rate",
      observed: `${Math.round(errorRate * 100)}% of steps errored`, scope: "all worlds", weak: true,
      reads: "a weak signal on its own; strong only combined with irreversibility" });
  }

  /* CODE-ONLY — delegate coding-agent process facts, gated on World */
  let codeCard = null;
  if (isCodeWorld) {
    codeCard = processReportCardV49({
      instanceId: trace.claim?.id ?? null, system: trace.executor?.id,
      steps, submissionBytes: trace.outcome?.submissionBytes,
      emptySubmission: trace.outcome?.emptySubmission,
      instanceCost: cost, apiCalls: trace.resources?.apiCalls,
    }, peers);
    for (const f of codeCard.flags) {
      flags.push({ ...f, scope: "code worlds; descriptive current-run fact only" });
    }
  }

  const card = {
    schema: "outsider/execution-card/v1",
    executor: trace.executor, world: trace.world, claim: trace.claim,
    facts, flags,
    worldGate: isCodeWorld
      ? "code World — coding-agent pathology applied"
      : `non-code World (${trace.world?.kind}) — coding-specific process findings do NOT `
        + "apply and are withheld; only universal resource/error/irreversibility signals shown",
    disclaimer: "measurement of this run only; no verdict, replayable corpus base rate, "
      + "outcome probability, or authority",
  };
  return card;
}

/*
 * Stage 0.5 record for ANY machine — the protocol envelope around the
 * world-aware card. Same schema role as measureStage05, works for a robot or a
 * CI run, carries no authority.
 */
/*
 * WHICH INSTRUMENT READ THE TRACE — the field that makes a Stage 0.5 card
 * actually climb the ladder rather than merely resemble something that could.
 *
 * Found by feeding real hook-minted cards to `attestTrackRecord` instead of
 * assuming the join worked: Stage 1 threw NO_INSTRUMENT and refused all three.
 * Every adapter in outsider-framework-adapters.js has stamped an extractorId
 * since the beginning; the hook — the one path a user actually runs — never did.
 * So "Stage 0.5 feeds Stage 1" was true of the card SHAPE and false of the card.
 *
 * The D2 rule is why this matters and why the id must be versioned: a track
 * record may not mix instruments, because a distribution assembled from two
 * different readings of "the same" thing is not a distribution. A hook that
 * changes how it reads a trajectory must change this string, or it will silently
 * pool old and new measurements.
 */
export const STAGE05_EXTRACTOR = "outsider/hook-trajectory/1.0";

export function measureTraceStage05({ trace, peers = {}, extractorId = STAGE05_EXTRACTOR }) {
  const card = measureExecutionTrace(trace, peers);
  const body = {
    schema: "outsider/process-card/v1",
    stage: 0.5, authority: "none",
    extractorId,
    traceHash: trace.traceHash ?? sha256(trace),
    executorKind: trace.executor?.kind, worldKind: trace.world?.kind,
    card,
  };
  return { ...body, recordHash: sha256(body) };
}
