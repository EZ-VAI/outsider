/*
 * 冻结的工作合同 —— 被监督者无权改动的那份东西。
 *
 * WHY THIS IS THE FIRST FILE OF THE KERNEL
 * ========================================
 * Every supervision layer before this one judged the run against evidence the
 * RUN produced. The charter was the closest thing to a mandate and it was
 * written by the worker itself — measured on real traffic, nobody ever wrote
 * one, and if they had, a worker that had already drifted would have written a
 * scope that suited it. A supervisor whose standard is authored by the
 * supervised is not a supervisor.
 *
 * So the contract is frozen at t=0 from three sources the worker cannot edit:
 *   · the operator's own words, verbatim
 *   · the repository's baseline at the moment work started
 *   · the acceptance command, named before any work exists to pass it
 *
 * It is sealed with a hash. Every diagnosis, every correction and the final
 * acceptance are stated against THIS object; if the seal does not verify, the
 * run is not supervised and says so rather than pretending.
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

export const CONTRACT_PATH = ".outsider/contract.json";

const sha = (x) => `sha256:${createHash("sha256").update(typeof x === "string" ? x : JSON.stringify(x)).digest("hex")}`;

/* a cheap, deterministic fingerprint of the tree the work starts from */
export function repoBaseline(cwd, { maxFiles = 4000 } = {}) {
  const skip = /(^|[/\\])(node_modules|\.git|dist|build|coverage|\.outsider|__pycache__|\.venv)([/\\]|$)/;
  const files = [];
  const walk = (dir, depth = 0) => {
    if (depth > 8 || files.length >= maxFiles) return;
    let names = [];
    try { names = readdirSync(dir); } catch { return; }
    for (const n of names) {
      const p = path.join(dir, n);
      if (skip.test(p)) continue;
      let st; try { st = statSync(p); } catch { continue; }
      if (st.isDirectory()) walk(p, depth + 1);
      else if (files.length < maxFiles) {
        let digest = null;
        try { digest = sha(readFileSync(p)); } catch { /* unreadable files stay explicit */ }
        files.push({ p: path.relative(cwd, p), size: st.size, digest });
      }
    }
  };
  walk(cwd);
  files.sort((a, b) => (a.p < b.p ? -1 : 1));
  return { nFiles: files.length,
    fingerprint: sha(files.map((f) => `${f.p}:${f.size}:${f.digest ?? "unreadable"}`).join("\n")) };
}

/*
 * `freezeContract` — called once, by the controller, before the worker exists.
 * The `ask` must be the operator's text verbatim; a paraphrase here poisons
 * everything downstream, because every later judgement quotes this field back.
 */
export function freezeContract({ cwd, ask, acceptance = null, semantic = null,
  semanticAudit = null, budget = null, baselineEvidence = null, at = null }) {
  if (!cwd || !ask) throw new Error("CONTRACT_INCOMPLETE: 需要 cwd 和操作方原话");
  const body = {
    schema: "outsider/work-contract/v1",
    frozenAt: at ?? new Date().toISOString(),
    cwd,
    /* 逐字。这是整份合同里唯一不可以被任何人改写的东西。 */
    ask: String(ask),
    /*
     * 验收命令必须在有任何东西可以通过它之前就被命名。事后再选一条能过的命令，
     * 是这个产品要抓的那种病最纯粹的形态。
     */
    acceptance: acceptance ? String(acceptance) : null,
    /* Compiled before the worker exists by an independent, fresh context. */
    semantic: semantic && typeof semantic === "object" ? semantic : null,
    /* A compiler cannot authorize its own paraphrase. Bind the independent
       pre-worker audit to the same seal as the semantic draft it approved. */
    semanticAudit: semanticAudit && typeof semanticAudit === "object" ? semanticAudit : null,
    budget: budget && typeof budget === "object" ? budget : null,
    baseline: repoBaseline(cwd),
    /* The richer content snapshot lives outside the worker workspace. Binding
       its fingerprint into the sealed contract prevents a recovered controller
       from silently grading against a replaced baseline.json. */
    baselineEvidence: baselineEvidence?.fingerprint
      ? { fingerprint: String(baselineEvidence.fingerprint) } : null,
  };
  return { ...body, seal: sha(body) };
}

export function writeContract(cwd, contract) {
  const p = path.join(cwd, CONTRACT_PATH);
  mkdirSync(path.dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify(contract, null, 2));
  return p;
}

/*
 * `readContract` — and VERIFY. A contract whose seal does not match has been
 * edited since it was frozen, which on this product's own terms means the run
 * has no standard. It returns null and the caller must degrade loudly.
 */
export function readContract(cwd, { readFile = (p) => readFileSync(p, "utf8") } = {}) {
  try {
    const c = JSON.parse(readFile(path.join(cwd, CONTRACT_PATH)));
    const { seal, ...body } = c;
    if (seal !== sha(body)) return { contract: null, reason: "SEAL_BROKEN: 合同被改过" };
    return { contract: c, reason: null };
  } catch (e) {
    return { contract: null, reason: `NO_CONTRACT: ${String(e.message).slice(0, 80)}` };
  }
}

/* the worker may never touch it — enforced at the gate, not by convention */
export const CONTRACT_GUARD = /[/\\]\.outsider[/\\]contract\.json$/;
