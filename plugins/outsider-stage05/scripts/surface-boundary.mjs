#!/usr/bin/env node
import { readFileSync } from "node:fs";

function input() {
  try { return JSON.parse(readFileSync(0, "utf8") || "{}"); }
  catch { return {}; }
}

const value = input();
const event = value.hook_event_name ?? value.hookEventName ?? null;
if (event !== "SessionStart") process.exit(0);

const additionalContext = [
  "Outsider universal plugin detected on Codex.",
  "Plugin discovery alone is not Stage 0.5 control.",
  "The companion outsider-guard runtime, exact /hooks trust, and a real surface conformance receipt are still required.",
  "Codex hooks do not cover hosted tools and some specialized paths, so treat them as a guardrail rather than an OS sandbox.",
  "For a privacy-minimized check that can be shared, run: outsider doctor --share-json. Keep raw doctor --json local.",
].join(" ");

process.stdout.write(`${JSON.stringify({
  hookSpecificOutput: { hookEventName: "SessionStart", additionalContext },
})}\n`);
