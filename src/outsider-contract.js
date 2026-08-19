/*
 * Contract auto-proposal.
 *
 * THE CLARIFICATION THIS FILE ANSWERS
 * ===================================
 * The operator must NOT hand-write the supervision contract. We READ the task
 * prompt plus context and PROPOSE a contract, then hand it back for a fast
 * confirm. Filling a config form is exactly the kind of setup friction the
 * autonomous product is supposed to remove.
 *
 * HONESTY OF A PROPOSAL
 * =====================
 * Every field records WHERE it came from: the prompt, the World, or a safe
 * default. An inferred value and a fallback default must never look alike — a
 * proposal that hides which fields it actually had evidence for is worse than a
 * blank form, because the operator would confirm guesses believing they were
 * derived. So `basis` is on every field, and the confirmation text says it out
 * loud.
 *
 * STRUCTURAL FIRST LANDING, NO LLM
 * ================================
 * Coding-task prompts are regular enough that keywords carry the common intents
 * (tests, budgets, step caps, prod/deploy/irreversibility, named files). This
 * proposer is structural. A richer proposer — an LLM reading the prompt — is a
 * drop-in behind this same `proposeContract` interface and the same
 * `outsider/proposed-contract/v1` shape; it would fill more fields from the
 * prompt and shift their `basis` from "default" to "prompt", nothing else. That
 * is the same "structural now, semantic later" line the claim ledger draws.
 */

import { WORLD_KINDS } from "./outsider-execution-trace.js";

/* keyword evidence for each inferable field */
const SIGNAL = {
  wantsTests: [
    /\btests?\b/i, /\b(pytest|unittest|nose|tox|jest|go test|cargo test)\b/i,
    /\bmust pass\b/i, /\ball tests?\b/i, /\bgreen\b/i, /\bregression\b/i,
    /\bCI\b/, /\bcoverage\b/i,
  ],
  noTests: [/\bno tests?\b/i, /\bskip(ping)? tests?\b/i, /\bwithout tests?\b/i,
    /\bdon'?t (write|run) tests?\b/i],
  budget: [/\$\s?(\d+(?:\.\d+)?)/, /\b(\d+(?:\.\d+)?)\s?(?:usd|dollars?)\b/i,
    /\bbudget[^.\d]{0,20}(\d+(?:\.\d+)?)/i],
  stepCap: [/\b(?:at most|max(?:imum)?|up to)\s+(\d{1,4})\s?steps?\b/i,
    /\b(\d{1,4})\s?steps? (?:max|limit|ceiling)\b/i],
  irreversibleMention: [/\bprod(uction)?\b/i, /\bdeploy(ing|ment)?\b/i,
    /\bmigrat\w+\b/i, /\b(payment|charge|refund|invoice)\b/i,
    /\b(delete|drop|truncate|rm -rf)\b/i, /\bmerge (to|into) (main|master)\b/i],
};
const TARGET_RE = /\b([\w./-]+\.(?:py|js|ts|tsx|go|rs|java|rb|c|cpp|h))\b/g;

function firstCapture(text, regexes) {
  for (const re of regexes) {
    const m = re.exec(text);
    if (m && m[1] != null) return m[1];
  }
  return null;
}

function extractTargets(text) {
  const out = new Set();
  let m;
  TARGET_RE.lastIndex = 0;
  while ((m = TARGET_RE.exec(text))) out.add(m[1]);
  return [...out].slice(0, 12);
}

/*
 * proposeContract — the whole point. Returns a contract of the exact shape
 * createSupervisionSession accepts, plus a per-field rationale and a
 * ready-to-show confirmation the operator approves or tweaks.
 */
export function proposeContract({
  prompt = "", world = { kind: "sandbox" }, executor = null, context = {},
  behaviorForecast = null,
} = {}) {
  const text = String(prompt || "");
  const worldKind = world?.kind ?? "sandbox";
  const worldProps = WORLD_KINDS[worldKind] ?? WORLD_KINDS.unknown;
  const rationale = [];
  const contract = {};

  const note = (field, value, basis, evidence) => {
    rationale.push({ field, value, basis, evidence });
    return value;
  };

  /* requireTestBeforeDone — the anchor of the whole "done means tested" contract */
  if (SIGNAL.noTests.some((re) => re.test(text))) {
    contract.requireTestBeforeDone = note("requireTestBeforeDone", false, "prompt",
      "the prompt explicitly opts out of tests");
  } else if (SIGNAL.wantsTests.some((re) => re.test(text))) {
    contract.requireTestBeforeDone = note("requireTestBeforeDone", true, "prompt",
      "the prompt asks for tests / passing / regression / CI");
  } else {
    contract.requireTestBeforeDone = note("requireTestBeforeDone", true, "default",
      "no signal in the prompt; the safe default is to require a real test before 'done'");
  }

  /* maxCostUsd */
  const budget = firstCapture(text, SIGNAL.budget);
  if (budget != null) {
    contract.maxCostUsd = note("maxCostUsd", Number(budget), "prompt",
      `the prompt names a spend budget (${budget})`);
  } else if (context.defaultMaxCostUsd != null) {
    contract.maxCostUsd = note("maxCostUsd", Number(context.defaultMaxCostUsd), "context",
      "no budget in the prompt; using the operator's account default");
  } else {
    contract.maxCostUsd = note("maxCostUsd", null, "default",
      "no budget stated; no hard cost ceiling set (waste still surfaces vs peers)");
  }

  /* maxSteps */
  const stepCap = firstCapture(text, SIGNAL.stepCap);
  contract.maxSteps = stepCap != null
    ? note("maxSteps", Number(stepCap), "prompt", `the prompt caps steps (${stepCap})`)
    : note("maxSteps", null, "default", "no step cap stated");

  /* blockIrreversibleUntilContractMet — the World is the strongest fact here, and
     it is a safe default even in a reversible World (there is nothing to block). */
  const nonReversible = worldProps.reversible === false;
  const mentionsIrreversible = SIGNAL.irreversibleMention.some((re) => re.test(text));
  contract.blockIrreversibleUntilContractMet = note(
    "blockIrreversibleUntilContractMet", true,
    nonReversible ? "world" : (mentionsIrreversible ? "prompt" : "default"),
    nonReversible ? `World '${worldKind}' is non-reversible — gating irreversible steps is mandatory`
      : mentionsIrreversible ? "the prompt mentions prod / deploy / migrate / payment / delete"
      : "safe default: hold any irreversible step until the contract is met");

  /* autonomousConfidenceThreshold — raise the bar to act autonomously (i.e.
     escalate sooner) when a failure would land on someone who did not choose the
     agent. Externality, not technology, is what earns caution. */
  const externality = worldProps.externality === true;
  contract.autonomousConfidenceThreshold = externality
    ? note("autonomousConfidenceThreshold", 0.9, "world",
      `World '${worldKind}' carries externality — raise the autonomy bar; escalate to a human sooner`)
    : note("autonomousConfidenceThreshold", 0.8, "default",
      "sandbox / no externality — the standard autonomy threshold");

  /* close the loop with engineering module 5: if the behavior model has enough
     supervised history to say this executor fakes success often, tighten the
     proposal — the model we built from watching it now supervises it harder. */
  let recommendDifferentialTest = false;
  const fake = behaviorForecast?.forecasts?.find((f) => f.signal === "fakedSuccess");
  if (fake && fake.pHat >= 0.25 && fake.credibility >= 0.3) {
    contract.requireTestBeforeDone = true;
    rationale.push({ field: "requireTestBeforeDone", value: true, basis: "behavior-model",
      evidence: `this executor faked success in ${Math.round(fake.pHat * 100)}% of `
        + `${fake.ownN} supervised runs (credibility ${fake.credibility}) — keep the test gate on` });
    recommendDifferentialTest = true;
  }

  return {
    schema: "outsider/proposed-contract/v1",
    world: { kind: worldKind, reversible: worldProps.reversible, externality: worldProps.externality },
    executor: executor ? { id: executor.id ?? null, kind: executor.kind ?? "unknown" } : null,
    contract,
    rationale,
    recommendDifferentialTest,
    inferredTargets: extractTargets(text),
    confirmation: buildConfirmation(contract, rationale, worldKind),
    needsConfirmation: true,
    note: "proposed from the task prompt and World; every field states whether it "
      + "came from the prompt, the World, the account context, or a safe default. "
      + "Confirm or tweak before the run — nothing here is applied without approval.",
  };
}

/* the fast-confirm view: one line per field, each ending in where it came from */
function buildConfirmation(contract, rationale, worldKind) {
  const byField = new Map(rationale.map((r) => [r.field, r]));
  const tag = (b) => ({ prompt: "来自你的 prompt", world: `来自 World '${worldKind}'`,
    context: "来自账户默认", default: "默认" }[b] ?? b);
  const line = (field, human) => {
    const r = byField.get(field);
    return `  • ${human}：${fmt(r?.value)} —— ${tag(r?.basis)}`;
  };
  return {
    title: "建议的监督合同（请确认，可改任意一项）",
    lines: [
      line("requireTestBeforeDone", "完成前必须有真实绿测"),
      line("maxCostUsd", "成本上限"),
      line("maxSteps", "步数上限"),
      line("blockIrreversibleUntilContractMet", "不可逆步先于绿测则拦截"),
      line("autonomousConfidenceThreshold", "自主干预阈值(≥即自主, 低于则升级给你)"),
    ],
  };
}

function fmt(v) {
  if (v === true) return "是";
  if (v === false) return "否";
  if (v === null || v === undefined) return "不设";
  return String(v);
}

/*
 * applyConfirmation — the operator's edits win over the proposal. Pass the
 * proposal and an { field: value } patch (empty if they accept as-is); returns
 * the final contract to hand to createSupervisionSession, with an audit of what
 * the human changed.
 */
export function applyConfirmation(proposal, patch = {}) {
  const final = { ...proposal.contract };
  const overrides = [];
  for (const [k, v] of Object.entries(patch)) {
    if (!(k in final)) continue;
    if (final[k] !== v) overrides.push({ field: k, from: final[k], to: v });
    final[k] = v;
  }
  return {
    contract: final,
    overrides,
    confirmedFromProposal: proposal.schema === "outsider/proposed-contract/v1",
    note: overrides.length
      ? "operator adjusted the proposal; their values win and are recorded"
      : "operator accepted the proposed contract unchanged",
  };
}
