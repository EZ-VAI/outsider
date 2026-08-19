/*
 * Grounding — turn a run into PRECISE EVIDENCE, so an intervention can be about
 * THIS failure, not a canned nudge.
 *
 * The audit-and-critique both landed here: our correctives were static strings
 * that never read the run's actual error, diff, or test. This layer reads them:
 * it parses the real traceback (file/line/function, error type, the failing
 * assertion's expected-vs-actual), pulls the files the agent actually edited, and
 * — the key structural move — localizes the failure: is the agent's change even
 * ON the failing path, or is it patching a file the traceback never mentions?
 *
 * No LLM. This is deterministic parsing + set intersection. It cannot say WHY the
 * code is wrong or WHAT to write (that is the reasoning layer). It CAN say, with
 * evidence: "test X asserted expected 30, got 60; the failure is in config.py:8;
 * your edits touched pool.py but not config.py — you are not on the failing
 * path." That is a real T2.5 diagnosis, and it is the ground truth the reasoner
 * builds on and the verifier checks against.
 */

const FILE_RE = /[\w./\-]+\.(?:py|js|jsx|ts|tsx|go|rs|java|rb|c|cc|cpp|h|hpp|cs|kt|php|scala|swift)/g;
const isTestFile = (p) => /(^|\/)(tests?|spec|__tests__)\//i.test(p) || /(_test\.|\.test\.|\.spec\.|test_)/i.test(p);

/* pull file paths out of a blob (edit-command text, traceback, etc.) */
export function filesIn(text) {
  const out = new Set();
  const s = String(text || "");
  let m; FILE_RE.lastIndex = 0;
  while ((m = FILE_RE.exec(s))) out.add(m[0]);
  return [...out];
}

/*
 * parseTraceback — best-effort, multi-language. Returns
 * { frames:[{file,line,func}], errorType, errorMessage, assertion:{lhs,rhs} }.
 */
export function parseTraceback(text) {
  const s = String(text || "");
  const frames = [];
  let m;

  // Python: File "x.py", line 12, in func
  const py = /File\s+"([^"]+)",\s+line\s+(\d+),\s+in\s+(\S+)/g;
  while ((m = py.exec(s))) frames.push({ file: m[1], line: Number(m[2]), func: m[3] });

  // pytest short:  path/to/test.py:12: AssertionError    /   FAILED path::case
  const pt = /^([\w./\-]+\.\w+):(\d+):/gm;
  while ((m = pt.exec(s))) frames.push({ file: m[1], line: Number(m[2]), func: null });
  const failed = /FAILED\s+([\w./\-]+\.\w+)::(\S+)/g;
  while ((m = failed.exec(s))) frames.push({ file: m[1], line: null, func: m[2] });

  // JS/TS:  at fn (src/x.ts:12:5)   or   src/x.ts:12
  const js = /at\s+(?:\S+\s+\()?([\w./\-]+\.(?:jsx?|tsx?)):(\d+)(?::\d+)?\)?/g;
  while ((m = js.exec(s))) frames.push({ file: m[1], line: Number(m[2]), func: null });

  // Go:  file.go:12
  const go = /([\w./\-]+\.go):(\d+)/g;
  while ((m = go.exec(s))) frames.push({ file: m[1], line: Number(m[2]), func: null });

  /*
   * TAP / `node --test` — added after replaying real sessions, where it was the
   * ONLY thing that failed and nothing above could read it.
   *
   *     not ok 18 - a read is a read whether it is a shell command or …
   *       ---
   *       location: '/tmp/ot/test/outsider-hook-waste.test.js:54:1'
   *       failureType: 'testCodeFailure'
   *       expected: true
   *       actual: false
   *       operator: '=='
   *       ...
   *
   * Measured on three real failing runs, errorSignature() returned NULL twice and
   * once returned `testCodeFailure||'` — a YAML KEY scraped by the generic
   * `\w*Failure` pattern, with zero frames. So on any Node repo using the built-in
   * runner, whack-a-mole could not identify the error, could not tell one attempt
   * from another, and therefore could never fire. It reported a clean run because
   * it was blind, which is the failure mode that does not announce itself. This
   * repository is itself such a repo — the flagship detector did not work on the
   * codebase it was written in.
   */
  /*
   * The `stack:` block is the valuable half and it is ordered culprit-first:
   *
   *     stack: |-
   *       rate (file:///repo/src/rate.js:4:23)      ← where it actually threw
   *       TestContext.<anonymous> (…/test/rate.test.js:4:41)
   *
   * The JS pattern above cannot see these: it requires an `at ` prefix, which
   * V8 emits and node's TAP writer strips, and it does not expect a file:// URL.
   * So the one line naming the real culprit was the one line being skipped, and
   * the only frame left was `location:` — which points at the TEST. Hence
   * "the failure is in: test/rate.test.js", i.e. go edit the test.
   * Frames are pushed BEFORE the location line so culprit-first order survives.
   */
  const tapStack = /^\s{2,}(?:[\w.<>[\]$]+\s+)?\(?(?:file:\/\/)?(\/?[\w./\-]+\.(?:[cm]?jsx?|tsx?)):(\d+):(\d+)\)?\s*$/gm;
  while ((m = tapStack.exec(s))) {
    if (/^node:/.test(m[1])) continue;                     // runtime internals are not the user's code
    frames.push({ file: m[1], line: Number(m[2]), func: null });
  }
  const tapLoc = /^\s*location:\s*'([^']+):(\d+):\d+'/gm;
  while ((m = tapLoc.exec(s))) frames.push({ file: m[1], line: Number(m[2]), func: null });
  const tapName = s.match(/^\s*not ok\s+\d+\s*-\s*(.+)$/m);

  // prefer a real exception type (FooError / BarException / panic) over the
  // generic pytest status word "FAILED", which is a result label, not a cause.
  const exc = s.match(/\b(\w*(?:Error|Exception)|panic)\b\s*:?\s*([^\n]*)/);
  const errM = exc || s.match(/\b(\w*Failure|FAILED)\b\s*:?\s*([^\n]*)/);
  let errorType = errM ? errM[1] : null;
  let errorMessage = errM ? (errM[2] || "").trim().slice(0, 240) : null;
  /*
   * A TAP failure's identity is the TEST NAME, not the YAML key that happened to
   * match. The name is what stays constant while the agent attacks the same
   * failure over and over — which is exactly what an error signature must key on.
   */
  if (tapName) {
    /* TAP states both explicitly — `name:` is the exception class, `error:` the
       message. Reading them beats scraping, which was returning the lone quote
       character after `name: 'TypeError'` as the entire error message. */
    const tapErr = s.match(/^\s*error:\s*(?:'([^']*)'|"([^"]*)"|(.+))$/m);
    const tapType = s.match(/^\s*name:\s*'([^']+)'/m);
    const msg = (tapErr?.[1] ?? tapErr?.[2] ?? tapErr?.[3] ?? "").trim();
    if (tapType) { errorType = tapType[1]; errorMessage = (msg || tapName[1]).slice(0, 240); }
    else if (!exc || /^testCodeFailure$/i.test(errorType ?? "")) {
      errorType = "TestFailure";
      errorMessage = (msg || tapName[1] || "").trim().slice(0, 240);
    }
  }

  // failing assertion's two sides (expected vs actual), several shapes.
  // For `assert X == Y` there are often two: the SOURCE line (`assert cfg.max == 30`)
  // and the EVALUATED line (`assert 60 == 30`). The evaluated one — concrete
  // literals on both sides — is the actionable one, so prefer it.
  let assertion = null;
  const isLiteral = (x) => /^-?[\d.]+$|^["'].*["']$|^(?:True|False|None|null|true|false|nil)$|^[\[{(]/.test(x.trim());
  const eqAll = [...s.matchAll(/assert(?:Equal\(|\s+)\s*([^\n=]+?)\s*==\s*([^\n)]+)/gi)]
    .map((m) => ({ lhs: m[1].trim().slice(0, 80), rhs: m[2].trim().slice(0, 80) }));
  const concrete = eqAll.find((e) => isLiteral(e.lhs) && isLiteral(e.rhs));
  const a2 = s.match(/[Ee]xpected[:\s]+(.+?)[,;]?\s+(?:but\s+)?got[:\s]+(.+)/);
  const a3 = s.match(/expected\s+(.+?)\s+to\s+(?:be|equal)\s+(.+)/i);
  // jest / vitest, on separate lines:  Expected: 5   \n   Received: 6
  const aJest = s.match(/Expected:\s*(.+)[\s\S]*?Received:\s*(.+)/);
  // Go table tests:  got 6, want 5   /   got: 6 want: 5
  const aGo = s.match(/\bgot[:\s]+(.+?)[,;]?\s+want[:\s]+(.+)/i);
  if (concrete) assertion = concrete;
  else if (eqAll.length) assertion = eqAll[0];
  else if (aJest) assertion = { lhs: aJest[2].trim().slice(0, 80), rhs: aJest[1].trim().slice(0, 80) };
  else if (aGo) assertion = { lhs: aGo[1].trim().slice(0, 80), rhs: aGo[2].trim().slice(0, 80) };
  else if (a2) assertion = { lhs: a2[2].trim().slice(0, 80), rhs: a2[1].trim().slice(0, 80) };
  else if (a3) assertion = { lhs: a3[1].trim().slice(0, 80), rhs: a3[2].trim().slice(0, 80) };

  // de-dup frames
  const seen = new Set(), uniq = [];
  for (const f of frames) { const k = `${f.file}:${f.line}:${f.func}`; if (!seen.has(k)) { seen.add(k); uniq.push(f); } }
  return { frames: uniq, errorType, errorMessage, assertion };
}

/*
 * localizeFailure — the structural root-cause signal. Given the traceback's files
 * and the files the agent EDITED, decide whether the change is on the failing
 * path. Returns { onFailingPath, sourceFilesInTrace, editedFiles, unaddressed }.
 */
export function localizeFailure(tracebackFiles, editedFiles) {
  const src = tracebackFiles.filter((f) => !isTestFile(f));
  const edited = new Set(editedFiles);
  const onFailingPath = src.some((f) => [...edited].some((e) => e === f || e.endsWith(f) || f.endsWith(e)));
  const unaddressed = src.filter((f) => ![...edited].some((e) => e === f || e.endsWith(f) || f.endsWith(e)));
  return { onFailingPath, sourceFilesInTrace: src, editedFiles: [...edited], unaddressed };
}

/*
 * groundRun — the whole evidence object from a trace (steps carry `observation`).
 * Focuses on the LAST failing test, the natural intervention trigger.
 */
export function groundRun(trace) {
  const steps = trace?.steps ?? [];
  const editedFiles = [];
  for (const s of steps) if (s.isEdit) editedFiles.push(...filesIn(s.action));

  const failing = [...steps].reverse().find((s) => s.isTest && s.exit != null && s.exit !== 0);
  if (!failing) {
    return { hasFailure: false, editedFiles: [...new Set(editedFiles)],
      note: "no failing test step with a readable result" };
  }
  const tb = parseTraceback(failing.observation || "");
  const tracebackFiles = [...new Set(tb.frames.map((f) => f.file))];
  const localization = localizeFailure(tracebackFiles, editedFiles);
  return {
    hasFailure: true,
    failingTest: failing.action,
    error: { type: tb.errorType, message: tb.errorMessage },
    assertion: tb.assertion,
    frames: tb.frames.slice(0, 8),
    tracebackFiles,
    editedFiles: [...new Set(editedFiles)],
    localization,
    /* the raw failing text (LOCAL ONLY — never shipped). The verifier reads it to
       confirm a proposed correction only cites symbols that actually appear in the
       real run — the anti-hallucination check. */
    failingObservation: failing.observation || "",
  };
}
