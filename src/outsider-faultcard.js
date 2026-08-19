/*
 * FAULT CARD — the foreman walks to the machine and reads the whole ticket.
 *
 * THE MEASUREMENT THAT FORCED THIS
 * ================================
 * Across 27 real failing test steps in a real multi-hour session, the traceback
 * named a source file in ONE of them. 4%. In 93% the agent's own command had
 * piped the output through grep/head and thrown the traceback away before it
 * ever reached us:
 *
 *     npm run test:supervision 2>&1 | grep -E "^# (tests|pass|fail)|^not ok"
 *
 * So the flagship intervention — "the failure is in src/pool.js, you edited
 * pool.py, go there" — had nothing to say 96% of the time. Every argument about
 * whether an injected correction changes behaviour is downstream of that: the
 * channel does not matter while the payload is empty.
 *
 * The supervisor was reading the report the worker chose to hand in. The machine
 * is in the next room.
 *
 * WHAT THIS IS NOT
 * ================
 * It does not write the fix. Outsider is local-first and would be reaching for a
 * small local model to out-code the frontier model the operator is already paying
 * for — measured in this repo: Qwen2.5-Coder-1.5B scored a novel yield of 0% on
 * the one real Phase-1 run. The worker makes the part. The foreman reads the
 * ticket.
 *
 * THREE CONSTRAINTS, EACH LOAD-BEARING
 * ====================================
 * 1. ONLY WHEN BLIND. If the agent's own output already names the failing file,
 *    re-running is pure duplicated spend — the exact waste this product prices.
 * 2. NEVER GUESS THE COMMAND. The rule in this repo is absolute: guessing means
 *    running something the operator never approved. We take the command the agent
 *    JUST RAN and remove only the output filter it piped into. Nothing invented.
 * 3. NEVER IN THE HOT PATH. A test run is seconds; the hook's budget is
 *    milliseconds. The card is produced by a detached process and read by a LATER
 *    hook call. Arriving one tool call late is fine — the edit we want to
 *    influence has not happened yet.
 */

export const FAULTCARD_PATH = ".outsider/faultcard.json";

/* pure output filters — cutting at one of these loses no side effect */
const FILTER = /^\s*(?:grep|egrep|fgrep|rg|ag|head|tail|awk|sed|cut|wc|sort|uniq|column|jq|tr|tee|less|more|cat)\b/i;
/* proven test invocations. Anything not on this list is never re-run. */
const RERUNNABLE = /^\s*(?:cd\s|export\s|[A-Z_][A-Z0-9_]*=)|^\s*(?:npm|yarn|pnpm|bun)\s+(?:run\s+)?[\w:.-]*test|^\s*(?:pytest|py\.test|tox|jest|vitest|mocha|rspec|phpunit)\b|^\s*(?:go|cargo|swift|dotnet|mvn)\s+test\b|^\s*node\s+--test\b|^\s*python3?\s+-m\s+(?:unittest|pytest)\b/i;

/*
 * Cut the command at the first TOP-LEVEL pipe that feeds an output filter.
 * Quote-aware, because `grep "a|b"` must not be treated as a pipe. `2>&1` is
 * deliberately kept: stderr is where the traceback usually is.
 */
export function stripOutputFilters(cmd) {
  const src = String(cmd ?? "");
  let quote = null;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quote) {
      if (c === "\\" && quote !== "'") i += 1;
      else if (c === quote) quote = null;
      continue;
    }
    if (c === "'" || c === '"') { quote = c; continue; }
    if (c === "\\") { i += 1; continue; }
    if (c === "|" && src[i + 1] !== "|" && src[i - 1] !== "|") {
      if (FILTER.test(src.slice(i + 1))) return src.slice(0, i).trim();
    }
  }
  return src.trim();
}

/*
 * TRANSPARENT PREFIXES — wrappers that bound or annotate a command without
 * changing what runs.
 *
 * Measured over this session's whole fleet: 33 of 35 failing test steps were
 * blind, and the whitelist could re-run only 12 of them. The refusals were not
 * dangerous commands — they were `timeout 540 npm run test:supervision` and
 * `cd /repo; timeout 300 npm test`. A supervisor that cannot recognise its own
 * agent's most common way of invoking a test is blind for a reason that has
 * nothing to do with safety.
 *
 * Stripped, never guessed: the rule that the re-run is the agent's own command
 * minus its output filter still holds exactly. `timeout` only makes a command
 * finish sooner, which for a re-run is strictly safer than not having it.
 */
const TRANSPARENT = /^\s*(?:timeout\s+(?:-k\s+\S+\s+)?-?\S+\s+|time\s+|nice\s+(?:-n\s+-?\d+\s+)?|env\s+(?:[A-Za-z_][A-Za-z0-9_]*=\S*\s+)*|command\s+|stdbuf\s+\S+\s+)/i;
/* prints and nothing else — cannot alter state, so it never blocks a re-run */
const HARMLESS = /^\s*(?:echo|printf|:)\b/i;

const unwrap = (part) => {
  let p = String(part);
  for (let i = 0; i < 4 && TRANSPARENT.test(p); i++) p = p.replace(TRANSPARENT, "");
  return p.trim();
};

/* is this safe to run a second time? every segment must be glue or a test */
export function rerunnable(cmd) {
  const bare = stripOutputFilters(cmd);
  if (!bare || bare.length > 400) return null;
  const parts = bare.split(/&&|;/).map((s) => s.trim()).filter(Boolean).map(unwrap);
  const isGlue = (p) => /^\s*(?:cd|export)\s/i.test(p) || HARMLESS.test(p);
  if (!parts.length || !parts.some((p) => RERUNNABLE.test(p) && !isGlue(p))) return null;
  if (!parts.every((p) => RERUNNABLE.test(p) || HARMLESS.test(p))) return null;
  return bare;
}

/* the identity of a failure, so a card can be matched to the failure it explains
   and never reused for a different one */
export const failureKey = (step) =>
  `${String(step?.action ?? "").replace(/\s+/g, " ").trim().slice(0, 160)}`;

/*
 * blindFailure — the last red test whose output names no source file, i.e. the
 * case where the supervisor has nothing to say and a fault card would give it
 * something. Returns null when the agent's own output was already enough.
 */
export function blindFailure(steps = [], { parseTraceback, isTestFile }) {
  const i = steps.findLastIndex((s) => s.isTest && s.exit != null);
  if (i < 0 || steps[i].exit === 0) return null;              // green: nothing to explain
  const step = steps[i];
  const tb = parseTraceback(step.observation ?? "");
  const named = [...new Set(tb.frames.map((f) => f.file))].filter((f) => f && !isTestFile(f));
  if (named.length) return null;                              // already has a nameable file
  const cmd = rerunnable(step.action);
  if (!cmd) return null;                                      // will not guess, will not re-run
  return { step, cmd, key: failureKey(step) };
}

/* a card is usable only if it explains THIS failure and is not stale */
export function readFaultCard({ cwd, key, readFile, maxAgeMs = 30 * 60 * 1000,
  pendingTtlMs = 3 * 60 * 1000, now = null }) {
  if (!cwd || !readFile) return null;
  try {
    const raw = readFile(`${String(cwd).replace(/\/+$/, "")}/${FAULTCARD_PATH}`);
    if (!raw || raw.length > 256 * 1024) return null;
    const card = JSON.parse(raw);
    if (card?.key !== key) return null;                       // explains a different failure
    if (now != null && card.at && now - card.at > maxAgeMs) return null;
    /* a PENDING card that never resolved means the child died. Treat it as absent
       after a short window so the request can be made again — otherwise one silent
       failure blinds the supervisor for the rest of the session. */
    if (card.pending && now != null && card.at && now - card.at > pendingTtlMs) return null;
    return card;
  } catch { return null; }
}

/*
 * The child that actually walks over. Kept as a string so the plugin bundle
 * carries no extra entry point, and so the operator can read exactly what will
 * run on their machine.
 */
export const FAULTCARD_RUNNER = `
const { execSync, } = require("node:child_process");
const { writeFileSync, mkdirSync } = require("node:fs");
/* node -e CODE a b c puts the args at argv[1..], NOT argv[2..]: there is no
   script path to skip. Reading from the front silently shifted every argument
   by one, so the child wrote nothing — and because it runs detached with stdio
   ignored, it failed in complete silence. Read from the END; the count is fixed.
   (No backticks in here: this whole runner lives inside a template literal.) */
const [cwd, key, cmd, outPath] = process.argv.slice(-4);
let output = "", status = null;
try {
  output = execSync(cmd, { cwd, encoding: "utf8", timeout: 120000,
    maxBuffer: 4 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] });
  status = 0;
} catch (e) {
  output = String(e.stdout ?? "") + "\\n" + String(e.stderr ?? "");
  status = e.status ?? 1;
}
try {
  mkdirSync(cwd + "/.outsider", { recursive: true });
  /*
   * WHERE THE FAILURE DETAIL LIVES DEPENDS ON THE RUNNER, and taking the tail is
   * wrong for the one this repo uses. pytest/jest/go print the failure summary
   * last; node --test prints the per-test YAML block (file, stack, assertion)
   * FIRST and finishes with a count block that names nothing. Slicing the tail
   * returned "# fail 1 / # duration_ms 53" — a fault card with no fault on it.
   * The same dialect trap as the result parser, one layer over.
   *
   * So: start at the first failure marker if there is one, and only fall back to
   * the tail when the output contains no marker at all.
   */
  const CAP = 8000;
  const FAIL_MARK = /^(?:#?\s*)(?:not ok |✖ |FAILED\b|FAIL\b|--- FAIL|Traceback |Error:|AssertionError)/m;
  const hit = output.search(FAIL_MARK);
  /* under the cap, keep ALL of it. The whole reason this card exists is that
     someone else's slicing threw the traceback away; doing our own slicing on
     output that fits is inviting the same defect back in. */
  const observation = output.length <= CAP ? output
    : (hit >= 0 ? output.slice(Math.max(0, hit - 1000), hit + CAP) : output.slice(-CAP));
  writeFileSync(outPath, JSON.stringify({ key, at: Date.now(), cmd, status, observation }));
} catch { /* the card is best effort; never break the run */ }
`;
