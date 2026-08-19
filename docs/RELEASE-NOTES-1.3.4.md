# Outsider 1.3.4 private beta notes

This release adds the upgrade boundary discovered while installing 1.3.3 in a
real Claude Desktop Cowork session.

The hosted plugin sidecar is detached and may outlive the Desktop window. A new
plugin package now reuses a daemon only when its authenticated descriptor points
to the same package root as the currently executing hook. A live daemon from an
older package is terminated gracefully and replaced before the hook request is
served. A stale pid without a successful authenticated ping is never signalled.

It also contains the 1.3.3 Cowork workspace resolution and observer-only
unattended-mode fixes.
