/*
 * 质检台 — THE INSPECTION BENCH. Checks that cannot run on the line.
 *
 * The foreman's decisions happen between two tool calls, in milliseconds. Some
 * inspections simply cost more than that:
 *
 *   walking to the machine and re-running the test   seconds
 *   building the import graph of a 426-file repo     2886ms, measured
 *
 * Putting either on the line would multiply every tool call by 20x, and a
 * supervisor whose cost grows with the thing it supervises is uninstalled — a
 * bill this repo has already paid once (42s per call at 4000 calls).
 *
 * So they go to a bench beside the line: a detached process does the work, drops
 * a card in `.outsider/`, and a LATER hook call reads it. Arriving one or two
 * tool calls late is fine, because what the card informs — the next edit — has
 * not happened yet.
 *
 * THE FAULT CARD IS BENCH #1. It came first and is load-bearing and tested, so
 * it keeps its own file; this module is the same mechanism generalised, and the
 * next thing that needs a bench should use this rather than copy that. One
 * bench, several inspections — the alternative is how a product quietly becomes
 * two.
 *
 * THREE RULES, INHERITED FROM THE FAULT CARD BECAUSE EACH WAS EARNED
 * ==================================================================
 * 1. A PENDING CARD IS WRITTEN FIRST, SYNCHRONOUSLY. Otherwise the next dozen
 *    hook calls — which happen while the child is still working — each spawn
 *    their own child, and the tool built to price waste becomes the waste.
 * 2. A PENDING CARD EXPIRES. A child that dies leaves a pending card forever,
 *    and one silent failure would blind the bench for the rest of the session.
 * 3. A CARD IS KEYED. It explains one state of the world; when the key changes
 *    the card is simply absent, never reused for something it does not describe.
 */

import { writeFileSync, mkdirSync } from "node:fs";

export const PROBE_DIR = ".outsider";

const probePath = (cwd, name) =>
  `${String(cwd ?? "").replace(/\/+$/, "")}/${PROBE_DIR}/${name}.json`;

/*
 * readProbe — a card is usable only if it explains THIS state and is not stale.
 * Returns null for every other case, including unreadable and malformed, because
 * a bench that guesses is worse than a bench that is empty.
 */
export function readProbe({ cwd, name, key, readFile,
  maxAgeMs = 30 * 60 * 1000, pendingTtlMs = 3 * 60 * 1000, now = null } = {}) {
  if (!cwd || !name || !readFile) return null;
  try {
    const raw = readFile(probePath(cwd, name));
    if (!raw || raw.length > 256 * 1024) return null;
    const card = JSON.parse(raw);
    if (key != null && card?.key !== key) return null;
    if (now != null && card.at && now - card.at > maxAgeMs) return null;
    if (card.pending && now != null && card.at && now - card.at > pendingTtlMs) return null;
    return card;
  } catch { return null; }
}

/*
 * requestProbe — mark the bench busy, then send the work over.
 *
 * `runner` is source, not a file path, so the shipped bundle carries no extra
 * entry point and the operator can read exactly what will run on their machine.
 */
export function requestProbe({ cwd, name, key, runner, args = [], meta = null,
  spawnFn, writeFn = null, now = Date.now }) {
  if (!cwd || !name || !runner || !spawnFn) return false;
  const out = probePath(cwd, name);
  try {
    /*
     * `meta` rides on the PENDING card, which is the only state that survives a
     * child that never comes back. An attempt counter kept anywhere else would
     * be lost on exactly the failure it exists to bound.
     */
    const body = JSON.stringify({ ...(meta ?? {}), key, at: now(), pending: true });
    if (writeFn) writeFn(out, body);
    else {
      mkdirSync(`${String(cwd).replace(/\/+$/, "")}/${PROBE_DIR}`, { recursive: true });
      writeFileSync(out, body);
    }
    const child = spawnFn(process.execPath, ["-e", runner, String(cwd), String(key ?? ""), out, ...args],
      { cwd, detached: true, stdio: "ignore" });
    child.unref?.();
    return true;
  } catch { return false; }
}

/*
 * The architecture inspection. Import-graph work: cycles and layer violations.
 *
 * Calibrated before being given a bench, not after: 1 signal across 426 real
 * files. That base rate is what makes it worth running at all — a check that
 * fires on everything (the level-based complexity check fired on 82.6–92.0% of
 * real files) does not become safe by moving off the line, it just becomes slow
 * and wrong somewhere else.
 *
 * It reads source files and reports; it changes nothing and writes nothing but
 * its own card. `--max-old-space-size` is not set: a repo big enough to need it
 * is a repo where this probe should simply give up, and it does, quietly.
 */
export const ARCHDRIFT_RUNNER = `
const { readdirSync, readFileSync, writeFileSync, mkdirSync, statSync } = require("node:fs");
/* the module URL is passed IN rather than guessed: the bench must work whether
   Outsider is running from this repo, from dist-user/, or from wherever a
   plugin manager put it. Guessing an install path is how a detached child fails
   in complete silence. */
const [cwd, key, outPath, modUrl, srcDir] = process.argv.slice(-5);
(async () => {
const dir = cwd + "/" + (srcDir || "src");
const MAX_FILES = 1200, MAX_BYTES = 24 * 1024 * 1024;
let files = [], bytes = 0, truncated = false;
try {
  for (const f of readdirSync(dir)) {
    if (!/[.](js|mjs|cjs|ts|tsx|jsx)$/.test(f)) continue;
    if (files.length >= MAX_FILES) { truncated = true; break; }
    const p = dir + "/" + f;
    let sz = 0; try { sz = statSync(p).size; } catch { continue; }
    if (bytes + sz > MAX_BYTES) { truncated = true; break; }
    bytes += sz;
    files.push({ path: "src/" + f, content: readFileSync(p, "utf8") });
  }
} catch { files = []; }
let signals = [], error = null;
if (files.length) {
  try {
    const mod = await import(modUrl);
    signals = (mod.assessArchDrift({ files }).signals) || [];
  } catch (e) { error = String(e && e.message || e); }
}
try {
  mkdirSync(cwd + "/.outsider", { recursive: true });
  /*
   * A BASELINE, SO THE NEXT SWEEP CAN BE A DELTA.
   *
   * Level-based architecture reporting has the same defect the level-based
   * complexity check had: a repo with one pre-existing import cycle says "1
   * cycle" forever, on every sweep, whatever the agent does. The operator's
   * complaint was never "this repo has cycles" — it was 架构一点一点做偏, a
   * PROCESS. So each card records the fingerprint set, and the reader compares
   * it against the previous one: what is NEW is what this run did.
   */
  const fingerprints = signals.map(function (s) {
    return (s.signal || "") + "|" + JSON.stringify((s.evidence || []).slice(0, 10));
  });
  /*
   * "HAS A BASELINE" IS NOT "THE BASELINE IS NON-EMPTY".
   *
   * The first version used baseline.length as the proxy, so a repo that started
   * CLEAN could never report anything: the clean sweep wrote an empty list, the
   * next sweep read it as "no baseline yet", and a freshly introduced cycle was
   * filed as pre-existing. The one case the delta exists for was the one case it
   * could not see.
   */
  let baseline = [], hasBaseline = false;
  try {
    baseline = JSON.parse(readFileSync(cwd + "/.outsider/archbase.json", "utf8")).fingerprints || [];
    hasBaseline = true;
  } catch (e) { baseline = []; hasBaseline = false; }
  const introduced = fingerprints.filter(function (f) { return baseline.indexOf(f) < 0; });
  const resolved = baseline.filter(function (f) { return fingerprints.indexOf(f) < 0; });
  writeFileSync(outPath, JSON.stringify({ key, at: Date.now(),
    nFiles: files.length, truncated, error,
    /* NO SILENT TRUNCATION: if the sweep stopped early the card says so, and
       whoever reads it can tell "no violations" from "did not look at all". */
    signals: signals.slice(0, 20),
    /* the first sweep has no baseline, so it reports NOTHING as introduced —
       inheriting someone's existing cycles as "you just did this" would be the
       level check wearing a delta's clothes */
    firstSweep: !hasBaseline,
    introduced: hasBaseline ? introduced.slice(0, 10) : [],
    resolved: hasBaseline ? resolved.slice(0, 10) : [],
    introducedSignals: hasBaseline
      ? signals.filter(function (s, i) { return introduced.indexOf(fingerprints[i]) >= 0; }).slice(0, 10)
      : [] }));
  writeFileSync(cwd + "/.outsider/archbase.json",
    JSON.stringify({ at: Date.now(), fingerprints: fingerprints.slice(0, 200) }));
} catch { /* best effort; never break the run */ }
})();
`;
