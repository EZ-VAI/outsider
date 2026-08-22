# Outsider reference adapter for DeepSeek Harness

This optional adapter is shipped inside the `outsider-guard` release closure and is pinned to DeepSeek Harness commit
`47f943859bef60e4160492346772ded9b24f765a`. The TypeScript source type-checks against the
immutable public rc.6 Cordis/Agent/LLM/Session packages listed with their npm
integrities in `references/deepseek-harness-compile-profile.json`. The official
repository HEAD still declares rc.5 and the rc.6 npm metadata exposes no
`gitHead`, so this is API-compile evidence, not source-to-binary attestation.

The adapter uses the documented `agent/pre-step` waterfall and
`session/event` feed. It appends one already-audited correction as a plugin
`UserMessage`, then acknowledges delivery only after the exact message appears
as a durable `user/message` event. The adapter never executes supervisor text,
never grants new tool authority, and never declares effect, outcome, loss, or
liability.

If the controller/gateway is unavailable, a stale or altered correction is
received, or a durable message fails verification, the plugin adds one bounded
`OUTSIDER_UNSUPERVISED` notice and lets Harness continue under its native policy.
It does not turn an unsupported integration into a host-wide fail-closed block.

The reference adapter can use an injected gateway for tests or the authenticated
local socket client in `src/outsider-deepseek-harness-gateway.js`. The socket
token only authenticates transport; the gateway independently verifies the
handshake, audited correction, Harness clock floor, and durable ack. Raw session
and agent ids do not cross the boundary.

Run `npm run canary:deepseek` from an installation that also provides the four exact
DeepSeek peers. The deterministic canary uses the real Cordis waterfall and the
official message factory but never calls a model. It produces research-lane
observation and durable-delivery evidence only. The rc.5-source/rc.6-package
equivalence remains explicitly unproven; a real Harness work session and an
independent effect/outcome chain remain required before any authority promotion.
Even full protocol replay assumes a cooperative pinned host: the content-addressed
handshake and ack are not independently signed controller or OS attestations.
Behavioral effects therefore remain quarantine/shadow learning evidence until a
sealed controller run or trusted ingress policy accepts them.
