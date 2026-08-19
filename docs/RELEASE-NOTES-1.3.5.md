# Outsider 1.3.5 private beta notes

This release fixes a Claude Desktop host-loop race found by the first real
1.3.4 Cowork run.  `UserPromptSubmit` may arrive before Claude writes
`userSelectedFolders` into its local session metadata.  Outsider now permits a
single, host-authenticated promotion from the temporary `local_<id>/outputs`
directory to the one selected folder at a pre-action boundary.  It then
resolves the operator-named nested repository and freezes acceptance before the
first tool action.

The promotion is not a general cwd relaxation.  It is accepted only for Claude
Desktop, only from the original host cwd and matching session metadata, only
when exactly one selected folder exists, only before an attached controller has
started, and only on SessionStart, UserPromptSubmit, or PreToolUse.  Ordinary
inherited-session cwd collisions still fail closed.
