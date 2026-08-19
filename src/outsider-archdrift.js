/*
 * Architectural drift (架构偏离) — the delivery still passes its tests, but the
 * SHAPE of the code has slid away from the intended architecture. This is the one
 * pathology that needs a BASELINE: "drift" is meaningless without a declared
 * architecture to drift FROM. So the detector takes a declared layering and checks
 * the real import graph against it — plus one baseline-free signal (import cycles)
 * that is drift under any architecture.
 *
 * DETERMINISTIC and located: every finding is a concrete edge in the real
 * dependency graph (fileA imports fileB, which the rules forbid), not a judgment.
 *
 * Declared architecture (subject.architecture):
 *   {
 *     layers: [ { name, match:"<regex on path>" }, ... ],   // ordered HIGH → LOW
 *     forbid: [ ["fromLayer","toLayer"], ... ]              // optional extra bans
 *   }
 * Rule: a file may import its own layer or a LOWER one; importing a HIGHER layer is
 * an upward-dependency violation (the classic drift — a core module reaching back
 * up into UI/CLI). Cycles are flagged regardless of any declaration.
 */

/*
 * THE PARSER IS OPTIONAL, AND HAS TO BE.
 *
 * `outsider-ast.js` needs @babel/parser. The user edition ships as ONE directory
 * with zero external dependencies — that is the whole install story — and a
 * static import here quietly broke it: packaging a real zip and running it in a
 * stranger's repo produced `Cannot find package '@babel/parser'`, written into a
 * card nobody read.
 *
 * `imports()` below already carries a complete regex fallback (it was written
 * for parse errors). So the parser becomes a nicety: used when present, absent
 * without consequence. An import graph does not need a full JS parser, and a
 * supervisor should not make its host install one.
 */
let analyze = null;
try { ({ analyze } = await import("./outsider-ast.js")); } catch { analyze = null; }
const langOf = (p) => /\.(py)$/.test(p || "") ? "py" : /\.(jsx?|tsx?|mjs|cjs)$/.test(p || "") ? "js" : "other";

/* ---------- import graph ---------- */

/* extract the import specifiers from one file — from the AST (handles dynamic
   import(), require, export-from, TS/JSX) with a regex fallback if a parse fails */
export function imports(code, lang) {
  const path = lang === "py" ? "x.py" : "x.js";
  const parsed = analyze ? analyze(path, code) : { error: "no-parser" };
  if (parsed.imports && !parsed.error) return parsed.imports;
  const s = String(code || ""); const out = [];   // fallback only when the parser errored
  if (lang === "js") {
    for (const m of s.matchAll(/(?:from|require\(|import\()\s*["'`]([^"'`]+)["'`]/g)) out.push(m[1]);
  } else if (lang === "py") {
    for (const m of s.matchAll(/^\s*from\s+([.\w]+)\s+import\b/gm)) out.push(m[1]);
    for (const m of s.matchAll(/^\s*import\s+([.\w]+)/gm)) out.push(m[1]);
  }
  return [...new Set(out)];
}

/*
 * buildGraph(files) — resolve intra-repo imports to a file→file edge list. Only
 * edges WITHIN the delivered set are kept (external packages are not drift).
 */
export function buildGraph(files) {
  const paths = new Set(files.map((f) => norm(f.path)));
  const byBase = new Map();
  for (const p of paths) { byBase.set(baseNoExt(p), p); }
  const edges = [];
  for (const f of files) {
    const L = langOf(f.path);
    if (L === "other") continue;
    const from = norm(f.path);
    for (const spec of imports(f.content, L)) {
      const target = resolveSpec(spec, from, paths, byBase);
      if (target && target !== from) edges.push([from, target]);
    }
  }
  return { nodes: [...paths], edges };
}

function resolveSpec(spec, fromFile, paths, byBase) {
  if (!spec.startsWith(".")) {
    // python dotted intra-package (e.g. "pkg.mod") — try base match
    const base = spec.replace(/^\.+/, "").replace(/\./g, "/");
    if (byBase.has(base)) return byBase.get(base);
    return null;                                   // external package — not drift
  }
  const dir = fromFile.split("/").slice(0, -1).join("/");
  let p = norm(joinPath(dir, spec));
  for (const cand of [p, p + ".js", p + ".mjs", p + ".ts", p + ".py", p + "/index.js"]) {
    if (paths.has(norm(cand))) return norm(cand);
  }
  const base = baseNoExt(p);
  if (byBase.has(base)) return byBase.get(base);
  return null;
}

/* ---------- cycle detection (Tarjan SCC) ---------- */

export function cycles(graph) {
  const adj = new Map();
  for (const n of graph.nodes) adj.set(n, []);
  for (const [a, b] of graph.edges) if (adj.has(a)) adj.get(a).push(b);
  let idx = 0; const stack = [], onStack = new Set(), index = new Map(), low = new Map(), sccs = [];
  const strongconnect = (v) => {
    index.set(v, idx); low.set(v, idx); idx++; stack.push(v); onStack.add(v);
    for (const w of adj.get(v) || []) {
      if (!index.has(w)) { strongconnect(w); low.set(v, Math.min(low.get(v), low.get(w))); }
      else if (onStack.has(w)) low.set(v, Math.min(low.get(v), index.get(w)));
    }
    if (low.get(v) === index.get(v)) {
      const comp = []; let w;
      do { w = stack.pop(); onStack.delete(w); comp.push(w); } while (w !== v);
      if (comp.length > 1) sccs.push(comp);
    }
  };
  for (const v of graph.nodes) if (!index.has(v)) strongconnect(v);
  return sccs;
}

/* ---------- layer violations ---------- */

function layerOf(path, layers) {
  for (let i = 0; i < layers.length; i++) {
    try { if (new RegExp(layers[i].match).test(path)) return i; } catch { /* bad pattern */ }
  }
  return -1;
}

export function layerViolations(graph, architecture) {
  if (!architecture || !Array.isArray(architecture.layers) || !architecture.layers.length) return [];
  const layers = architecture.layers;
  const forbid = new Set((architecture.forbid || []).map(([a, b]) => `${a}>${b}`));
  const viol = [];
  for (const [from, to] of graph.edges) {
    const lf = layerOf(from, layers), lt = layerOf(to, layers);
    if (lf < 0 || lt < 0) continue;
    // layers are HIGH→LOW; importing a HIGHER layer (smaller index) is upward drift
    if (lt < lf) viol.push({ kind: "upward-dependency", from, to, fromLayer: layers[lf].name, toLayer: layers[lt].name });
    else if (forbid.has(`${layers[lf].name}>${layers[lt].name}`)) viol.push({ kind: "forbidden-dependency", from, to, fromLayer: layers[lf].name, toLayer: layers[lt].name });
  }
  return viol;
}

/* ---------- assess ---------- */

export function assessArchDrift(subject, _ctx = {}) {
  const files = (subject && subject.files) || [];
  const arch = subject && subject.architecture;
  const graph = buildGraph(files);
  const viol = layerViolations(graph, arch);
  const cyc = cycles(graph);

  const signals = [];
  if (viol.length) {
    const byKind = {};
    for (const v of viol) (byKind[v.kind] = byKind[v.kind] || []).push(v);
    for (const [kind, list] of Object.entries(byKind)) {
      signals.push({
        signal: `archdrift-${kind}`, confidence: kind === "upward-dependency" ? 0.9 : 0.85,
        said: "the change respects the architecture",
        observed: `${list.length} ${kind} edge(s), e.g. ${short(list[0].from)}→${short(list[0].to)} (${list[0].fromLayer}→${list[0].toLayer})`,
        corrective: `${kind === "upward-dependency" ? "a lower layer imports a higher one" : "a forbidden dependency exists"}: `
          + list.slice(0, 4).map((v) => `${short(v.from)}→${short(v.to)}`).join(", ")
          + " — invert the dependency (depend on an abstraction, not the higher layer)",
        evidence: list.slice(0, 10), basis: "import-graph",
      });
    }
  }
  if (cyc.length) {
    signals.push({
      signal: "archdrift-import-cycle", confidence: 0.8,
      said: "modules are cleanly layered",
      observed: `${cyc.length} import cycle(s), e.g. ${cyc[0].map(short).join(" → ")} → ${short(cyc[0][0])}`,
      corrective: "break the cycle: extract the shared piece, or invert one edge — cyclic modules cannot be understood or tested in isolation",
      evidence: cyc.slice(0, 5).map((c) => c.map(short)), basis: "import-graph",
    });
  }

  const declared = !!(arch && arch.layers && arch.layers.length);
  // score: violations are strong drift; cycles moderate. Normalize by graph size.
  const denom = Math.max(graph.edges.length, 8);
  const score = Math.max(0, Math.min(1, +(
    (viol.length / denom) * 3 + Math.min(0.4, cyc.length * 0.2)).toFixed(3)));
  return { score, signals,
    facts: { declaredArchitecture: declared, nodes: graph.nodes.length, edges: graph.edges.length,
      violations: viol.length, cycles: cyc.length,
      note: declared ? undefined : "no architecture declared — only cycle detection ran (baseline-free)" } };
}

/* verifiable probe: assert the import graph has NO forbidden edge and NO cycle */
export function archDriftProbes(subject) {
  return [{
    kind: "graph", text: "no upward/forbidden import and no cycle",
    check: () => {
      const files = (subject && subject.files) || [];
      const g = buildGraph(files);
      const v = layerViolations(g, subject && subject.architecture);
      const c = cycles(g);
      return { passed: v.length === 0 && c.length === 0, detail: `${v.length} violations, ${c.length} cycles` };
    },
  }];
}

export const archDriftPathology = {
  name: "architectural-drift", dimension: "archdrift",
  standard: "no upward/forbidden cross-layer imports; no import cycles",
  assess: assessArchDrift, probes: archDriftProbes,
};

/* ---------- helpers ---------- */
function norm(p) { return String(p || "").replace(/^\.\//, "").replace(/\/+/g, "/"); }
function baseNoExt(p) { return norm(p).replace(/\.(jsx?|tsx?|mjs|cjs|py)$/, ""); }
function short(p) { return norm(p).split("/").slice(-2).join("/"); }
function joinPath(dir, rel) {
  const parts = (dir ? dir.split("/") : []);
  for (const seg of rel.split("/")) {
    if (seg === "." || seg === "") continue;
    if (seg === "..") parts.pop(); else parts.push(seg);
  }
  return parts.join("/");
}
