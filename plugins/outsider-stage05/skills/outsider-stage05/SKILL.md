---
name: outsider-stage05
description: Install, diagnose, and verify Outsider Stage 0.5 on Claude, Codex, and ChatGPT while preserving the exact surface-specific control, privacy, and evidence boundaries.
---

# Outsider Stage 0.5

Use this skill when the user asks to install Outsider, check whether it is
running, interpret an Outsider receipt, or compare support across Claude,
Codex, and ChatGPT.

## Non-negotiable capability boundary

Treat these as different claims:

1. **Plugin installed** means the host can discover this skill.
2. **Runtime installed** means the reviewed `outsider-guard` Stage 0.5 runtime
   is present.
3. **Hook configured** means the relevant lifecycle hook exists.
4. **Hook trusted and seen** means the exact current hook hash was trusted by
   the operator and the host emitted a real runtime event.
5. **Controlled** requires the exact surface-specific conformance receipt and
   all required controller, identity, acceptance, privacy, and fail-closed
   gates. Never infer it from installation alone.

The plugin is shared by ChatGPT and Codex, but its capabilities are not
identical on those surfaces:

- **Codex:** the plugin can provide this skill and a boundary-notice lifecycle
  hook. The companion runtime installs the actual Outsider hooks. The operator
  must review and trust the exact hook definitions in `/hooks`. Codex tool
  hooks are a guardrail: hosted tools and specialized paths may not traverse
  them.
- **ChatGPT Chat/Work:** the plugin provides guidance and can interpret a
  privacy-minimized diagnostic supplied by the user. It does not receive a
  universal ChatGPT pre-tool/post-tool/stop lifecycle and therefore cannot
  claim global Stage 0.5 interception. MCP-routed operations, if added later,
  would cover only those routed calls.
- **Claude Code/Desktop Code:** use the companion runtime's Claude hooks.
- **Claude Cowork:** additionally requires the reviewed plugin archive and the
  local helper handshake.
- **Ordinary Claude Chat:** unsupported because it does not run the hooks.

## Installation workflow

1. Ask which surface and operating system the user is installing on.
2. Use only the artifact and checksum from the same GitHub release.
3. Install the Stage 0.5 runtime from the reviewed public package, not from the
   mixed research workspace root.
4. Run `outsider install --scope user` from an independent terminal.
5. Keep the default local-only/read-only boundary unless the user explicitly
   supplies both a supervisor command and separate external-disclosure consent.
6. For Codex, install this plugin from the repository marketplace, restart the
   app, inspect `/hooks`, and trust only the exact reviewed hook definitions.
7. Run `outsider doctor --json` locally after a real host session. Installation
   alone is not a runtime conformance result. If the output must be shared with
   ChatGPT or another person, use `outsider doctor --share-json` instead.

Never request API keys, tokens, private keys, raw transcripts, raw prompts, or
unredacted source just to diagnose installation. Never ask the user to paste
raw `outsider doctor --json`, which intentionally includes local operator paths.
Ask only for `outsider doctor --share-json` or a privacy-reviewed sealed receipt.

## Verification workflow

When local shell access exists, prefer these read-only checks:

```bash
outsider --version
outsider doctor --share-json
codex plugin list
codex plugin marketplace list
```

In Codex, ask the operator to inspect `/hooks`; do not bypass hook trust and do
not count `--dangerously-bypass-hook-trust` as production readiness.

Report a matrix with separate rows for plugin discovery, runtime install, hook
configuration, exact hook trust, runtime event seen, controlled status, and
known tool-coverage exceptions. If evidence is missing, return `UNKNOWN` or
`NOT_ESTABLISHED`, never `PASS` by assumption.

## Safe wording

Allowed:

- "Outsider has a universal ChatGPT/Codex plugin package."
- "Codex can load an Outsider skill and plugin-bundled lifecycle notice."
- "Full Codex control requires the companion runtime, exact hook trust, and a
  real conformance receipt."
- "ChatGPT can use the Outsider skill; ordinary ChatGPT conversations are not
  globally intercepted by Stage 0.5."

Disallowed without exact evidence:

- "Installing the plugin makes ChatGPT fully controlled."
- "Outsider intercepts every Codex tool."
- "Plugin visible" therefore "Stage 0.5 active."
- "Public data" therefore "training rights established."
