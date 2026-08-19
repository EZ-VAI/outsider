/*
 * Intervention — the part the tech-bro was right about. Detecting that an agent
 * is wrong is table stakes; the hard, valuable question is "改成什么，细致到什么
 * 地步" — WHAT to send back, and how far we can be trusted to go.
 *
 * THE TIER LADDER (what "how deep" means, made concrete)
 * ------------------------------------------------------
 *   T0  block / allow                 (the safety gate — outsider-supervisor)
 *   T1  templated nudge               ("run the tests" — a canned string; WHERE
 *                                       the old code stopped)
 *   T2  GROUNDED nudge                cites THIS run's real error + assertion
 *   T3  root-cause localization       "you are not on the failing path; the
 *                                       failure is in config.py, you edited pool.py"
 *   T4  prescriptive patch            an actual edit — ONLY if a substrate proposes
 *                                       it AND the verifier proves red→green
 *
 * WHY THIS IS NOT AN LLM WRAPPER
 * ------------------------------
 * Three of the four layers are ours and use NO model:
 *   (1) Grounding  (outsider-grounding.js) — turns the run into precise evidence.
 *   (2) Reasoning  — pluggable. A no-LLM STRUCTURAL reasoner ships today and hits
 *       T2/T3 from evidence alone. A model substrate (the ONE choice we leave to
 *       the operator) plugs in here to reach T4. It is the only replaceable part.
 *   (3) Verification (this file) — the moat. EVERY correction, ours or a model's,
 *       must survive: it may only cite files/symbols that appear in the real run
 *       (anti-hallucination), its expected/actual must match the parsed assertion,
 *       and any patch must be proven to turn the failing test red→green with no
 *       regression. An unverifiable patch is never delivered as fact.
 *   (4) Policy — learns state→intervention→outcome (minimal effective dose). Real
 *       mechanism, honestly gated: until real outcomes accumulate it says so and
 *       uses a transparent default, exactly like the behavior model.
 *
 * A correction the structural reasoner emits cannot hallucinate — every clause is
 * a fact lifted from evidence. A correction a language model emits can; that is
 * precisely why it goes through the same verifier and is thrown out if it invents
 * a symbol or its patch does not go green. The moat is the verifier, not the model.
 */

import { groundRun } from "./outsider-grounding.js";

/* Tier ordering for "prefer the deepest correction we can PROVE". */
const TIER_RANK = { T1: 1, T2: 2, T3: 3, T4: 4 };

/* ------------------------------------------------------------------ *
 * Layer 2 — the reasoner interface + a no-LLM structural baseline
 * ------------------------------------------------------------------ *
 * A Reasoner is  (evidence, ctx) => Correction | null .
 * A Correction is a STRUCTURED, CHECKABLE proposal — not just prose:
 *   { tier, reasoner, dose, message, cites:{files,symbols,expected,actual}, patch }
 * `cites` is what the verifier audits against the real run; `patch` (T4 only) is
 * what the verifier runs red→green.  `dose` is the actuation weight: "nudge" =
 * text back to the agent; "gate" = stop the step; "patch" = a concrete edit.
 */

/*
 * structuralReasoner — NO LLM. Reads the grounding evidence and states, in plain
 * language, exactly what the run shows: the failing test, the real expected-vs-
 * actual, and — the high-value move — whether the agent's edits are even on the
 * failing path. Everything it says is a fact from `evidence`, so it is grounded
 * by construction (and still re-checked by the verifier; we trust no reasoner).
 */
export function structuralReasoner(evidence, _ctx = {}) {
  if (!evidence || !evidence.hasFailure) return null;

  const { error, assertion, localization, failingTest } = evidence;
  const loc = localization || {};
  const testName = shortTest(failingTest);
  const cites = {
    files: (loc.sourceFilesInTrace || []).slice(0, 6),
    symbols: [],
    expected: assertion ? assertion.rhs : null,
    actual: assertion ? assertion.lhs : null,
  };
  if (assertion) { cites.symbols.push(assertion.lhs, assertion.rhs); }
  if (error && error.type) cites.symbols.push(error.type);

  const parts = [];
  // the failure, in real numbers
  if (assertion) {
    parts.push(`Test ${testName} expected ${assertion.rhs} but got ${assertion.actual ?? assertion.lhs}.`);
  } else if (error && error.type) {
    parts.push(`Test ${testName} failed with ${error.type}${error.message ? `: ${error.message}` : ""}.`);
  } else {
    parts.push(`Test ${testName} failed.`);
  }

  let tier = "T2";
  // the root-cause localization — the T3 signal
  const failFrame = (evidence.frames || []).find((f) => f.file && !/test/i.test(f.file));
  const at = failFrame ? ` (${failFrame.file}${failFrame.line ? `:${failFrame.line}` : ""})` : "";
  if (loc.onFailingPath === false && (loc.unaddressed || []).length) {
    tier = "T3";
    const edited = (loc.editedFiles || []).slice(0, 3).join(", ") || "(nothing on this path)";
    const target = loc.unaddressed.slice(0, 3).join(", ");
    parts.push(
      `The failure is raised in ${target}${at}, which your run did not edit — your `
      + `edits touched ${edited}. Changing those files cannot affect this test; the `
      + `fix belongs in ${target} (or whatever feeds the asserted value).`);
  } else if (loc.onFailingPath === true) {
    tier = "T3";
    const f = (loc.sourceFilesInTrace || [])[0] || "the edited file";
    parts.push(`The failure is raised in ${f}${at} — a file you did edit. Re-check the change at that point against what the test asserts.`);
  } else {
    parts.push(`Do not report success: re-run and fix the real failure above before claiming the tests pass.`);
  }

  return {
    tier,
    reasoner: "structural-baseline",
    dose: "nudge",
    message: parts.join(" "),
    cites,
    patch: null,
  };
}

/*
 * A model substrate is wrapped to this same interface. `modelFn(prompt)` returns
 * text or a { message, cites, patch } object; either way it becomes a Correction
 * and goes through the identical verifier. The prompt we hand it is BUILT FROM
 * EVIDENCE, so even the substrate reasons over ground truth, not raw scrollback.
 * This is the single pluggable seam — LLM / local model / your own — and nothing
 * it returns is delivered without passing verification.
 */
export function modelReasoner(modelFn, { name = "model-substrate" } = {}) {
  return async function (evidence, ctx = {}) {
    if (!evidence || !evidence.hasFailure) return null;
    const prompt = buildEvidencePrompt(evidence, ctx);
    let raw;
    try { raw = await modelFn(prompt, { evidence, ctx }); } catch { return null; }
    if (raw == null) return null;
    const obj = typeof raw === "string" ? { message: raw } : raw;
    return {
      tier: obj.patch ? "T4" : "T2",
      reasoner: name,
      dose: obj.patch ? "patch" : "nudge",
      message: String(obj.message || "").slice(0, 1200),
      cites: normalizeCites(obj.cites),
      patch: obj.patch ?? null,
    };
  };
}

/* the evidence-grounded prompt a substrate sees — never the raw transcript */
export function buildEvidencePrompt(evidence, _ctx = {}) {
  const e = evidence;
  const L = e.localization || {};
  return [
    "A coding agent's test is failing. Propose the SMALLEST correction.",
    `failing_test: ${shortTest(e.failingTest)}`,
    e.error ? `error: ${e.error.type ?? ""} ${e.error.message ?? ""}`.trim() : "",
    e.assertion ? `expected: ${e.assertion.rhs}\nactual: ${e.assertion.lhs}` : "",
    `traceback_files: ${(e.tracebackFiles || []).join(", ")}`,
    `edited_files: ${(e.editedFiles || []).join(", ")}`,
    `on_failing_path: ${L.onFailingPath}`,
    (L.unaddressed || []).length ? `unaddressed_source: ${L.unaddressed.join(", ")}` : "",
    "Rules: only reference files/symbols that appear above. If you propose a patch,",
    "it must make the failing test pass without breaking others.",
  ].filter(Boolean).join("\n");
}

/* ------------------------------------------------------------------ *
 * Layer 3 — verification (the moat)
 * ------------------------------------------------------------------ */

/*
 * verifyCorrection — refuse to deliver anything we cannot ground.
 *   grounded:   every cited file/symbol appears in the real run (anti-hallucination)
 *   consistent: any expected/actual it states matches the parsed assertion
 *   proven:     any PATCH is run — the failing test must go red→green with no
 *               regression; with no runner, a patch is UNPROVEN (not delivered as
 *               a patch — at most downgraded to advice)
 * Returns { verified, tier, reasons[], downgradedTo }.
 */
/*
 * verifyGrounding — the SYNCHRONOUS core: anti-hallucination + assertion
 * consistency. No runner, no patch execution, so it needs no I/O. This is the
 * single source of truth for "does this correction only say true things about
 * THIS run", shared by the async verifier and the sync (local, no-substrate) path.
 * Returns { grounded, reasons[] }.
 */
export function verifyGrounding(correction, evidence, trace) {
  const reasons = [];
  if (!correction) return { grounded: false, reasons: ["no correction"] };
  const hay = haystack(trace, evidence);

  // 1) grounded — cited files must appear in the run
  const knownFiles = new Set([...(evidence.tracebackFiles || []), ...(evidence.editedFiles || [])]);
  for (const f of correction.cites?.files || []) {
    const ok = knownFiles.has(f) || [...knownFiles].some((k) => k.endsWith(f) || f.endsWith(k)) || hay.includes(f);
    if (!ok) { reasons.push(`cites file not in run: ${f}`); }
  }
  // 2) grounded — cited symbols must textually appear in the run
  for (const s of correction.cites?.symbols || []) {
    if (!s) continue;
    if (!hay.includes(String(s))) reasons.push(`cites symbol not in run: ${clip(s)}`);
  }
  // 3) consistent — stated expected/actual must match the parsed assertion
  if (evidence.assertion) {
    const { lhs, rhs } = evidence.assertion;
    if (correction.cites?.expected != null && !eqLoose(correction.cites.expected, rhs))
      reasons.push(`stated expected ${clip(correction.cites.expected)} ≠ asserted ${clip(rhs)}`);
    if (correction.cites?.actual != null && !eqLoose(correction.cites.actual, lhs))
      reasons.push(`stated actual ${clip(correction.cites.actual)} ≠ observed ${clip(lhs)}`);
  }
  return { grounded: reasons.length === 0, reasons };
}

export async function verifyCorrection(correction, evidence, opts = {}) {
  if (!correction) return { verified: false, tier: null, reasons: ["no correction"], downgradedTo: null };
  const g = verifyGrounding(correction, evidence, opts.trace);
  const reasons = g.reasons.slice();
  const grounded = g.grounded;

  // 4) proven — a patch must be run red→green
  let tier = correction.tier;
  let downgradedTo = null;
  if (correction.patch) {
    if (typeof opts.runner === "function") {
      let res;
      try { res = await opts.runner(correction.patch, { evidence }); } catch (e) { res = { error: String(e && e.message || e) }; }
      const proven = res && res.redToGreen === true && res.noRegression !== false;
      if (!proven) {
        reasons.push(`patch not proven red→green${res && res.error ? ` (${res.error})` : ""}`);
        // a failed patch falls back to its grounded advice, if any
        tier = grounded ? "T3" : tier; downgradedTo = "T3";
        return { verified: false, tier, reasons, downgradedTo, ranPatch: true };
      }
    } else {
      // no runner: we will not present an unproven patch AS a patch
      reasons.push("patch proposed but no runner to prove red→green");
      tier = grounded ? "T3" : tier; downgradedTo = "T3";
      return { verified: false, tier, reasons, downgradedTo, ranPatch: false };
    }
  }

  return { verified: grounded, tier, reasons, downgradedTo: null };
}

/* ------------------------------------------------------------------ *
 * intervene() — propose → verify → deliver the deepest PROVEN correction
 * ------------------------------------------------------------------ */

/*
 * intervene(trace, mismatch, opts)
 *   opts.reasoners : ordered Reasoner[] (default: [structuralReasoner]); a model
 *                    substrate, if the operator plugs one in, goes FIRST so its
 *                    deeper (T4) proposal is tried, then verified, then preferred
 *                    only if it actually proves out.
 *   opts.runner    : (patch,ctx)=>{redToGreen,noRegression} — enables T4 proof.
 *   opts.trace     : defaults to the trace arg (used for symbol grounding).
 *
 * Returns an Intervention:
 *   { tier, reasoner, message, dose, cites, patch, verified, alternatives, evidence, fallback }
 * Guarantees: `message` is grounded in THIS run whenever a failure is parseable;
 * if nothing verifies, it falls back to the mismatch's own corrective, HONESTLY
 * labeled T1 (a canned nudge), never dressed up as grounded.
 */
export async function intervene(trace, mismatch = null, opts = {}) {
  const evidence = groundRun(trace);
  const reasoners = opts.reasoners && opts.reasoners.length ? opts.reasoners : [structuralReasoner];
  const trials = [];

  for (const r of reasoners) {
    let c = null;
    try { c = await r(evidence, { mismatch, trace }); } catch { c = null; }
    if (!c) continue;
    const v = await verifyCorrection(c, evidence, { trace, runner: opts.runner });
    trials.push({ correction: c, verify: v });
  }

  const verified = trials.filter((t) => t.verify.verified)
    .sort((a, b) => (TIER_RANK[b.correction.tier] || 0) - (TIER_RANK[a.correction.tier] || 0));

  if (verified.length) {
    const best = verified[0];
    return {
      tier: best.correction.tier,
      reasoner: best.correction.reasoner,
      message: best.correction.message,
      dose: best.correction.dose,
      cites: best.correction.cites,
      patch: best.correction.patch,
      verified: true,
      evidence,
      alternatives: trials.filter((t) => t !== best).map(summarizeTrial),
      fallback: false,
    };
  }

  // nothing verified. If we at least have evidence, the structural reasoner's
  // grounded diagnosis is itself trace-only facts and self-verifies; try it alone.
  if (evidence.hasFailure) {
    const s = structuralReasoner(evidence, { mismatch, trace });
    const v = await verifyCorrection(s, evidence, { trace });
    if (s && v.verified) {
      return { tier: s.tier, reasoner: s.reasoner, message: s.message, dose: s.dose,
        cites: s.cites, patch: null, verified: true, evidence,
        alternatives: trials.map(summarizeTrial), fallback: false };
    }
  }

  // honest last resort: the canned template, labeled for what it is
  return {
    tier: "T1",
    reasoner: "template-fallback",
    message: mismatch?.corrective || "Stop and re-verify: the run does not support the claimed success.",
    dose: "nudge",
    cites: null,
    patch: null,
    verified: false,
    evidence,
    alternatives: trials.map(summarizeTrial),
    fallback: true,
    fallbackReason: evidence.hasFailure
      ? "a correction was proposed but did not verify against the run"
      : "no parseable failure in the run to ground a correction",
  };
}

/*
 * interveneSync — the DEFAULT local-first path: structural reasoner only, no
 * substrate, no runner, fully synchronous, so it drops straight into the sync
 * hook (`decideToolCall`). It still runs the grounding verifier on its own output
 * (we trust no reasoner, including ours). Returns the same Intervention shape as
 * `intervene`, minus patch execution. When there is no parseable failure it hands
 * back the mismatch's canned corrective, honestly labeled T1.
 */
export function interveneSync(trace, mismatch = null) {
  const evidence = groundRun(trace);
  if (evidence.hasFailure) {
    const s = structuralReasoner(evidence, { mismatch, trace });
    if (s) {
      const g = verifyGrounding(s, evidence, trace);
      if (g.grounded) {
        return { tier: s.tier, reasoner: s.reasoner, message: s.message, dose: s.dose,
          cites: s.cites, patch: null, verified: true, evidence, alternatives: [], fallback: false };
      }
    }
  }
  return {
    tier: "T1", reasoner: "template-fallback",
    message: mismatch?.corrective || "Stop and re-verify: the run does not support the claimed success.",
    dose: "nudge", cites: null, patch: null, verified: false, evidence, alternatives: [], fallback: true,
    fallbackReason: evidence.hasFailure
      ? "a correction was proposed but did not verify against the run"
      : "no parseable failure in the run to ground a correction",
  };
}

/* ------------------------------------------------------------------ *
 * Layer 4 — policy: learn the minimal effective dose from real outcomes
 * ------------------------------------------------------------------ *
 * This is the flywheel's real job: not "did we detect" but "did the intervention
 * WORK, and was it the smallest one that would". It needs outcome data that only
 * real runs produce, so — exactly like the behavior model — the mechanism is real
 * and it REFUSES to pretend when the data is not yet there.
 */

/* the record the flywheel accumulates: state → intervention → what happened */
export function makeInterventionOutcome({ evidence, intervention, outcome }) {
  return {
    state: interventionFeatures(evidence, intervention),
    tier: intervention?.tier ?? null,
    dose: intervention?.dose ?? null,
    reasoner: intervention?.reasoner ?? null,
    outcome: {
      accepted: outcome?.accepted ?? null,        // did the agent act on it
      resolvedAfter: outcome?.resolvedAfter ?? null, // did the test go green after
      stepsAfter: outcome?.stepsAfter ?? null,
      tokensAfter: outcome?.tokensAfter ?? null,
    },
  };
}

/* features of a (state, intervention) pair for the policy model */
export function interventionFeatures(evidence, intervention) {
  const L = (evidence && evidence.localization) || {};
  return {
    tierRank: TIER_RANK[intervention?.tier] || 0,
    offPath: L.onFailingPath === false ? 1 : 0,
    hasAssertion: evidence && evidence.assertion ? 1 : 0,
    hasPatch: intervention && intervention.patch ? 1 : 0,
    nUnaddressed: (L.unaddressed || []).length,
  };
}

/*
 * learnInterventionPolicy — train P(resolvedAfter | state, dose) on real outcome
 * records with the SAME logistic machine the behavior model uses, and derive a
 * policy that picks the minimal dose whose predicted resolution clears a bar.
 * Refuses (trained:false) below minRecords or when outcomes are one-class — no
 * fabricated policy. Import is lazy so this file has no hard model dependency.
 */
export async function learnInterventionPolicy(records, { minRecords = 40, testFrac = 0.25, seed = 7 } = {}) {
  const usable = (records || []).filter((r) => r && r.outcome && r.outcome.resolvedAfter != null);
  if (usable.length < minRecords) {
    return { trained: false, reason: `insufficient outcomes (${usable.length}<${minRecords})`,
      policy: (evidence, correction) => defaultPolicy(evidence, correction), n: usable.length };
  }
  const y = usable.map((r) => (r.outcome.resolvedAfter ? 1 : 0));
  if (y.every((v) => v === y[0])) {
    return { trained: false, reason: "one-class outcomes (all resolved or all not)",
      policy: (evidence, correction) => defaultPolicy(evidence, correction), n: usable.length };
  }
  const keys = ["tierRank", "offPath", "hasAssertion", "hasPatch", "nUnaddressed"];
  const X = usable.map((r) => keys.map((k) => Number(r.state?.[k] ?? 0)));
  const { trainLogistic, predictProba, auc, fitStandardizer, applyStandardizer } = await import("./outsider-model.js");
  const std = fitStandardizer(X);
  const Xs = applyStandardizer(X, std);
  // held-out split for an honest AUC
  const nTest = Math.max(1, Math.floor(usable.length * testFrac));
  const idx = shuffleIdx(usable.length, seed);
  const test = new Set(idx.slice(0, nTest));
  const trX = [], trY = [], teX = [], teY = [];
  Xs.forEach((row, i) => { if (test.has(i)) { teX.push(row); teY.push(y[i]); } else { trX.push(row); trY.push(y[i]); } });
  const model = trainLogistic(trX, trY, { l2: 1e-2, lr: 0.1, epochs: 300, seed });
  const pred = teX.map((r) => predictProba(model, r));
  const heldAuc = teY.length && !teY.every((v) => v === teY[0]) ? auc(pred, teY) : null;
  const score = (evidence, correction) => {
    const f = interventionFeatures(evidence, correction);
    return predictProba(model, applyStandardizer([keys.map((k) => f[k])], std)[0]);
  };
  return { trained: true, n: usable.length, heldAuc, keys, weights: model.weights, bias: model.bias,
    score, policy: makeLearnedPolicy(score) };
}

/*
 * defaultPolicy — transparent, no data required. Encodes "minimal effective dose":
 * an off-path failure needs the T3 localization (a nudge to the right file);
 * an on-path failure with a clear assertion needs the T2 grounded nudge; a proven
 * patch (T4) is the deepest and is preferred when present. Returns a dose choice.
 */
export function defaultPolicy(evidence, correction) {
  const L = (evidence && evidence.localization) || {};
  if (correction && correction.tier === "T4" && correction.patch) return { dose: "patch", why: "a proven patch is the most decisive minimal fix" };
  if (L.onFailingPath === false) return { dose: "nudge", tier: "T3", why: "off-path: point the agent at the unaddressed source file" };
  if (evidence && evidence.assertion) return { dose: "nudge", tier: "T2", why: "on-path: cite the exact expected-vs-actual" };
  return { dose: "nudge", tier: "T2", why: "ground the agent in the real error before it reports success" };
}

function makeLearnedPolicy(score) {
  return (evidence, correction) => {
    const p = score(evidence, correction);
    const base = defaultPolicy(evidence, correction);
    return { ...base, predictedResolution: p,
      why: `${base.why} (learned P(resolve)=${p.toFixed(2)})` };
  };
}

/* ------------------------------------------------------------------ *
 * small helpers
 * ------------------------------------------------------------------ */
function shortTest(t) {
  const s = String(t || "the test").trim();
  const m = s.match(/([\w./\-]+::[\w.\[\]-]+|[\w./\-]+\.\w+)/);
  return (m ? m[1] : s).slice(0, 80);
}
function haystack(trace, evidence) {
  let s = evidence?.failingObservation || "";
  for (const st of (trace?.steps || [])) s += "\n" + (st.action || "") + "\n" + (st.observation || "");
  return s;
}
function normalizeCites(c) {
  if (!c || typeof c !== "object") return { files: [], symbols: [], expected: null, actual: null };
  return {
    files: Array.isArray(c.files) ? c.files.map(String).slice(0, 12) : [],
    symbols: Array.isArray(c.symbols) ? c.symbols.map(String).slice(0, 24) : [],
    expected: c.expected ?? null,
    actual: c.actual ?? null,
  };
}
function summarizeTrial(t) {
  return { reasoner: t.correction.reasoner, tier: t.correction.tier,
    verified: t.verify.verified, reasons: t.verify.reasons, downgradedTo: t.verify.downgradedTo };
}
function eqLoose(a, b) {
  const na = String(a).trim(), nb = String(b).trim();
  if (na === nb) return true;
  const fa = parseFloat(na), fb = parseFloat(nb);
  if (!Number.isNaN(fa) && !Number.isNaN(fb)) return fa === fb;
  return na.replace(/["']/g, "") === nb.replace(/["']/g, "");
}
function clip(x) { return String(x).slice(0, 40); }
function shuffleIdx(n, seed) {
  const a = Array.from({ length: n }, (_, i) => i);
  let s = seed >>> 0;
  for (let i = n - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) >>> 0;
    const j = s % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
