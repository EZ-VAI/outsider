/*
 * Test-validity measurement — engineering module 4.
 *
 * THE FOUNDER'S PAIN THIS ANSWERS
 * ==============================
 * An agent writes a test that PASSES but is shallow — it would pass even if the
 * bug were never fixed. "Tests pass" is then true and worthless. Module 2 catches
 * "claimed pass but the test was red"; this catches the subtler lie: "the test is
 * green, but the test is hollow." Turning a green check into evidence is the
 * whole job.
 *
 * TWO INSTRUMENTS, WEAKEST TO STRONGEST
 * =====================================
 *  (A) STATIC — read the test source, no execution. Assertion-free tests,
 *      tautological assertions (assert True, assertEqual(x, x)), and blanket
 *      `except: pass` that swallows the very failure under test. Cheap, always
 *      available, structural. A miss is a false negative, never a false accusation.
 *
 *  (B) DIFFERENTIAL — the rigorous one, and exactly the founder's "re-run against
 *      a checkpoint" idea. Run the agent's test against a KNOWN-BROKEN version of
 *      the code — the pre-fix checkpoint, or a mutant. A real test FAILS there. A
 *      test that STILL PASSES on broken code does not exercise the fix. This is an
 *      EXECUTION PROOF of shallowness, not a heuristic, so it is the highest
 *      confidence signal the module emits.
 *
 * WHERE EXECUTION LIVES
 * =====================
 * Running code belongs to the caller's sandbox, not here. Module 4 owns the
 * PROTOCOL and the verdict; the caller supplies `runTest` (the agent's test on
 * the current code) and `runTestOnBroken` (the same test on the broken baseline).
 * That is the same honest split the framework adapters use: we define the shape,
 * the environment supplies the run.
 *
 * WHAT A CLEAN RESULT MEANS
 * =========================
 * Absence of these patterns is NOT proof the test is deep. It means these
 * shallowness patterns were not found. The disclaimer says so on every card;
 * over-claiming test quality would be the same instrument error we audit out.
 */

/* assertion-ish tokens across Python + JS test styles */
const ASSERT_RE = /(\bassert\w*|\bself\.assert\w+|\bpytest\.raises|\bexpect\s*\(|\bEXPECT_[A-Z]+|\bASSERT_[A-Z]+|\.should\b|\.to\.(?:equal|be|deep|throw))/gi;
/* does this even look like a test? (only then is "no assertions" meaningful) */
const LOOKS_LIKE_TEST_RE = /\b(def\s+test\w*|class\s+\w*Test|it\s*\(|test\s*\(|describe\s*\(|@pytest)/i;
/* tautological assertions — always pass regardless of the code */
const ALWAYS_TRUE_RE = [
  /\bassert\s+True\b/i,
  /\bassertTrue\s*\(\s*True\s*\)/i,
  /\bassert\s+1\s*==\s*1\b/,
  /\bassert\s+([A-Za-z_]\w*)\s*==\s*\1\b/,               // assert x == x
  /\bassertEqual\s*\(\s*([^,()]+?)\s*,\s*\1\s*\)/,        // assertEqual(x, x)
  /\bexpect\s*\(\s*true\s*\)\s*\.\s*toBe\s*\(\s*true\s*\)/i,
];
/* blanket exception swallowing around the assertion */
const BLANKET_EXCEPT_RE = [
  /except\s*:\s*(?:pass|\.\.\.|continue)/i,
  /except\s+(?:Exception|BaseException)\s*(?:as\s+\w+)?\s*:\s*(?:pass|\.\.\.|continue)/i,
];

/* strip line comments before counting assertions, so prose like "# asserts
 * nothing" is not miscounted as an assertion. Heuristic (ignores # / // inside
 * string literals), which is fine at this confidence level. */
const stripLineComments = (s) => s.replace(/#[^\n]*/g, "").replace(/\/\/[^\n]*/g, "");

export function analyzeTestStatically(testSource = "") {
  const src = String(testSource || "");
  const code = stripLineComments(src);
  const flags = [];
  const looksLikeTest = LOOKS_LIKE_TEST_RE.test(src);
  const assertions = (code.match(ASSERT_RE) ?? []).length;

  /* only meaningful when it looks like a test — otherwise a false accusation */
  if (looksLikeTest && assertions === 0) {
    flags.push({
      signal: "test-has-no-assertions", confidence: 0.8,
      observed: "the test defines a case but contains no assertion",
      corrective: "this test asserts nothing, so it cannot fail; add assertions that "
        + "check the fixed behaviour against expected values",
    });
  }
  if (ALWAYS_TRUE_RE.some((re) => re.test(code))) {
    flags.push({
      signal: "test-always-true", confidence: 0.75,
      observed: "an assertion is tautological (e.g. assert True / assertEqual(x, x))",
      corrective: "a tautological assertion always passes; assert the real result "
        + "against the expected value instead",
    });
  }
  if (BLANKET_EXCEPT_RE.some((re) => re.test(code))) {
    flags.push({
      signal: "test-swallows-exceptions", confidence: 0.6,
      observed: "a blanket 'except: pass' can swallow the very failure under test",
      corrective: "the test catches and ignores exceptions; let the failure "
        + "propagate, or assert on it explicitly",
    });
  }
  return { schema: "outsider/test-static/v1", looksLikeTest, assertions, flags };
}

/*
 * differentialValidity — the execution proof.
 *
 *   runTest()          -> { passed } on the CURRENT (agent-fixed) code
 *   runTestOnBroken()  -> { passed } on a KNOWN-BROKEN baseline (pre-fix / mutant)
 *
 * Verdict table:
 *   fixed passes + broken FAILS   -> discriminates      -> a real test
 *   fixed passes + broken PASSES  -> does NOT discriminate -> SHALLOW (proof)
 *   fixed FAILS                   -> not a shallowness question; it is the
 *                                    claims-pass-but-test-failed case (module 2)
 */
export async function differentialValidity({ runTest, runTestOnBroken } = {}) {
  if (typeof runTest !== "function" || typeof runTestOnBroken !== "function") {
    return {
      schema: "outsider/test-differential/v1", available: false,
      note: "differential validity needs runTest + runTestOnBroken hooks; without a "
        + "reachable broken baseline, only static analysis applies",
    };
  }
  const onFixed = await runTest();
  const onBroken = await runTestOnBroken();
  const fixedPasses = !!(onFixed && onFixed.passed);
  const brokenPasses = !!(onBroken && onBroken.passed);

  if (fixedPasses && brokenPasses) {
    return {
      schema: "outsider/test-differential/v1", available: true, discriminates: false,
      onFixed, onBroken,
      flag: {
        signal: "shallow-test-does-not-discriminate", confidence: 0.9,
        observed: "the test passes on a KNOWN-BROKEN baseline — it would pass even "
          + "without the fix",
        corrective: "your test passes on the un-fixed code, so it does not exercise "
          + "the bug; add a case that FAILS before the fix and PASSES after it",
      },
    };
  }
  if (fixedPasses && !brokenPasses) {
    return {
      schema: "outsider/test-differential/v1", available: true, discriminates: true,
      onFixed, onBroken,
      note: "the test fails on the broken baseline and passes on the fix — it "
        + "discriminates the fix; this is a real test",
    };
  }
  return {
    schema: "outsider/test-differential/v1", available: true, discriminates: null,
    onFixed, onBroken,
    note: "the test does not pass on the current code — that is a said-vs-did "
      + "concern (claims-pass-but-test-failed), not a shallowness one",
  };
}

/*
 * assessTestValidity — the combined card. Static always; differential when the
 * caller supplies the run hooks. Returns flags in the SAME shape the claim ledger
 * emits ({signal, confidence, observed, corrective}) so the supervisor can union
 * them straight into its decision.
 */
export async function assessTestValidity({ testSource = "", differential = null } = {}) {
  const stat = analyzeTestStatically(testSource);
  const flags = stat.flags.slice();
  let diff = null;
  if (differential) {
    diff = await differentialValidity(differential);
    if (diff.flag) flags.push(diff.flag);
  }
  return {
    schema: "outsider/test-validity/v1",
    assertions: stat.assertions,
    looksLikeTest: stat.looksLikeTest,
    flags,
    static: stat,
    differential: diff,
    disclaimer: "structural + differential test-validity measurement; no verdict. "
      + "A clean result is NOT proof the test is deep — only that these shallowness "
      + "patterns were not found.",
  };
}
