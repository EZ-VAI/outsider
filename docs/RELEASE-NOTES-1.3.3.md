# Outsider 1.3.3 private beta notes

This release fixes two failures found by the first real Claude Desktop Cowork
conformance run.

- Cowork runs the Agent SDK from a host-owned `local_<id>/outputs` directory.
  Outsider now resolves the single operator-selected workspace from Claude's
  session metadata and records both the host cwd and the resolution source in
  the attached ledger. It does not guess when more than one folder is selected.
- An attached session without repository-owned acceptance now remains honestly
  observer-only and explicitly allows tool calls. It no longer returns `defer`,
  which can strand an unattended Cowork run at its first tool boundary.

The release remains a private beta. A user should select one repository folder
per Cowork task if they want Stage 0.5 controlled mode and verifiable evidence.
