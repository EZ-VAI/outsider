/*
 * The actuation layer — engineering module 3.
 *
 * The session (module 1) DECIDES. This carries the decision out. Policy and
 * mechanism are kept apart on purpose: the actuator holds NO policy of its own,
 * it dispatches a decision to a hook the caller registered for its agent
 * framework, and records what actually happened.
 *
 * THE HONEST ENFORCEMENT STATUS
 * =============================
 * If a hook is missing or throws, the actuator does NOT pretend the action was
 * carried out. A `gate` with no working `onGate` is recorded as DECIDED-BUT-NOT-
 * ENFORCED, loudly. An un-enforced gate that reported success would let an
 * irreversible action through while the dashboard said it was blocked — the most
 * dangerous possible lie for this system to tell. Same lesson as the extractor
 * cohort: a missing result must look missing, never like a real one.
 *
 * WHAT IS AND IS NOT HERE
 * =======================
 * Here: dispatch, enforcement bookkeeping, a ready-made local actuator, and a
 * reference supervised-run loop that shows modules 1–4 driving an agent. NOT
 * here: the policy for when to gate/correct/escalate (that is the session), and
 * the framework-specific act of injecting text into a particular agent loop
 * (that is the hook the integrator writes — deliberately small).
 */

/*
 * makeActuator — dispatch a decision to the matching hook.
 *
 * hooks: { onGate, onCorrect, onEscalate, onContinue } — each (decision, ctx) =>
 * anything (the effect). A returned value is recorded as the effect; a throw is
 * recorded as an error and the action is marked NOT enforced.
 */
export function makeActuator({ onGate, onCorrect, onEscalate, onContinue } = {}) {
  const effects = [];
  const HOOKS = {
    gate: onGate, "auto-correct": onCorrect,
    escalate: onEscalate, continue: onContinue,
  };
  const SAFETY_ACTIONS = new Set(["gate", "auto-correct"]);

  function actuate(decision = {}, ctx = {}) {
    const hook = HOOKS[decision.action];
    let carriedOut = false, effect = null, error = null;
    if (typeof hook === "function") {
      try { effect = hook(decision, ctx) ?? null; carriedOut = true; }
      catch (e) { error = String(e?.message ?? e); }
    }
    const enforced = carriedOut && !error;
    const record = {
      schema: "outsider/actuation/v1",
      action: decision.action ?? "continue",
      stepIndex: ctx.stepIndex ?? null,
      phase: ctx.phase ?? "ingest",
      corrective: decision.corrective ?? null,
      enforced,
      effect,
      error,
      /* a safety-relevant action that could not be carried out is surfaced as a
         warning, never swallowed */
      warning: (!enforced && SAFETY_ACTIONS.has(decision.action))
        ? `${decision.action} was DECIDED but NOT enforced (`
          + `${error ? "hook threw: " + error : "no hook registered"}) — the `
          + "intervention did not reach the agent; treat this step as UN-supervised"
        : null,
    };
    effects.push(record);
    return record;
  }

  return {
    actuate,
    effects: () => effects.slice(),
    /* the list a dashboard must show in red: decided-but-not-enforced safety actions */
    unenforced: () => effects.filter((e) => e.warning),
  };
}

/*
 * makeQueueActuator — the out-of-the-box local-first actuator.
 *
 * Correctives are queued for the agent loop to drain, gates return a hard block,
 * escalations collect for the human. A real framework wires its own hooks
 * instead; this is the default so the local product does something correct
 * without any integration code.
 */
export function makeQueueActuator() {
  const correctives = [];
  const escalations = [];
  const gates = [];
  const base = makeActuator({
    onGate: (d, ctx) => { gates.push({ ...d, ctx }); return { blocked: true }; },
    onCorrect: (d) => { if (d.corrective) correctives.push(d.corrective); return { queued: true }; },
    onEscalate: (d) => { escalations.push(d); return { raised: true }; },
    onContinue: () => ({ noop: true }),
  });
  return {
    ...base,
    /* the agent loop drains these and feeds them back as its next instruction */
    drainCorrectives: () => correctives.splice(0),
    pendingCorrectives: () => correctives.slice(),
    escalations: () => escalations.slice(),
    gates: () => gates.slice(),
  };
}

/*
 * driveSupervised — a REFERENCE loop showing modules 1–4 turning detection into
 * outcome-oriented delivery: it does not just watch, it drives the agent.
 *
 * `driver` is the adapter to one agent framework:
 *   propose()            -> the next step the agent WANTS to take (pre-execution)
 *   execute(step)        -> run it, return the supervision event {action,exit,...}
 *   applyCorrective(text)-> feed a corrective back into the agent loop
 *   isDone()             -> the agent has finished
 *
 * The loop authorizes BEFORE executing (so an irreversible step is caught before
 * it happens, not after), then ingests AFTER, actuating each decision. It is a
 * documented reference — a real integration lives in the framework adapter — but
 * it runs, and the tests exercise it end to end.
 */
export async function driveSupervised({ session, actuator, driver, maxSteps = 1000 } = {}) {
  if (!session || typeof session.authorize !== "function" || typeof session.ingest !== "function") {
    throw new Error("DRIVE_NO_SESSION: need a supervision session with authorize()+ingest()");
  }
  if (!driver || typeof driver.execute !== "function") {
    throw new Error("DRIVE_NO_DRIVER: need a driver with propose/execute/applyCorrective/isDone");
  }
  const act = actuator ?? makeQueueActuator();
  let n = 0;
  while (!(driver.isDone?.() ?? false) && n < maxSteps) {
    n += 1;
    const proposed = (await driver.propose?.()) ?? {};

    /* PRE-EXECUTION gate — the only place an irreversible action can truly be stopped */
    const auth = session.authorize(proposed);
    if (auth.allow === false) {
      act.actuate(auth.decision, { phase: "authorize", stepIndex: n });
      await driver.applyCorrective?.(auth.decision.corrective);
      continue;   // the step is NOT executed
    }

    /* execute, then supervise the result */
    const event = await driver.execute(proposed);
    const r = session.ingest(event);
    const eff = act.actuate(r.decision, { phase: "ingest", stepIndex: r.stepIndex });
    if (r.decision.action === "auto-correct" && eff.enforced) {
      await driver.applyCorrective?.(r.decision.corrective);
    }
  }
  return { state: session.state(), actuations: act.effects(),
    unenforced: act.unenforced(), steps: n };
}
