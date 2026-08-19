# Outsider 1.3.30

Remote Claude Desktop Cowork sessions can execute the hosted plugin while being
structurally unable to reach the user's local system helper. Earlier releases
treated plugin installation as proof that every Cowork session was controlled.
When the helper handshake was unavailable, every PreToolUse was denied and Stop
was blocked, reproducing the exact host-bricking failure that transparent
attachment must prevent.

Cowork capability is now established per session by an authenticated helper
handshake:

- a session that has never completed that handshake becomes explicit
  `OUTSIDER_OBSERVER_ONLY_REMOTE_HELPER_UNREACHABLE`; tool calls are allowed and
  Stop is approved with a visible statement that no Stage 0.5 proof exists;
- the observer-only classification is session-scoped and cannot later be
  promoted mid-task merely because a helper appears; a new session is required;
- a session that previously completed the authenticated handshake still fails
  closed if that control plane is later lost; and
- failure to persist observer metadata inside a restricted remote sandbox can
  never turn the observer path back into a deny.

This is a capability-handshake correction, not a relaxation of a controlled
run. An observer-only Cowork task cannot produce controlled evidence,
SAFE_DELIVERY, or a causal contribution label.

The incomplete 1.3.29 R1 batch and completed 1.3.29 R4 lanes remain immutable
version-scoped evidence. They are not pooled into 1.3.30 R1-R5 claims.
