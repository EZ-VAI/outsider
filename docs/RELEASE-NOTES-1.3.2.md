# Outsider 1.3.2 private beta notes

This packaging-only release makes the Claude Desktop/Cowork artifact conform to
the hosted-plugin approval surface.

- The plugin archive no longer contains a top-level `bin/` directory.
- Hook commands explicitly reference `runtime/bin/outsider-hook.mjs`, so the
  executable entry point remains visible in `hooks/hooks.json`.
- Only the hook, attached daemon, and recoverable controller host are shipped in
  the plugin runtime. The CLI executables remain exclusive to the npm artifact.
- Release construction now extracts and validates the final zip and smoke-runs
  its real hook entry before declaring the artifact built.

No Stage 0.5 detector, semantic judge, controller policy, or claim boundary was
changed. Existing 1.3.1 runtime evidence therefore remains evidence for that
runtime, not a retroactive certification of this new archive.
