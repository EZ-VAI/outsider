# Outsider 1.3.99

Status: **open-source beta release**.

1.3.99 is the open-source beta identity for the direct Codex Stage 0.5 work
that followed 1.3.98. It does not replace or mutate the tagged 1.3.98 source
or artifacts.

## Direct Codex control

- Handles the eleven lifecycle event names in the current Codex hook contract
  explicitly. Passive lifecycle events cannot fall through the `PreToolUse`
  policy path, and an unknown event fails closed instead of inheriting an
  action default.
- Records a source-bound, signed receipt for the canonical controller decision
  before projecting it into the current Codex native envelope. In particular,
  an allowed `PreToolUse` returns no unsupported `permissionDecision: allow`,
  while a denial remains an exact native denial.
- Keeps the frozen contract active after a red terminal verification. An
  unchanged Stop cannot become falsely green; a bounded replacement controller
  generation must observe an authorized repair action and its result before
  another terminal attempt.
- Binds final approval review to the exact persisted correction text,
  correction authority, factual audit, emission, and observation events.
  Worker final-report text may satisfy an operator-required report shape, but
  it is never accepted as proof that the implementation or tests are correct.
- Distinguishes a real `apply_patch` edit from Codex Desktop's generic custom
  `exec` transport wrapper, preventing wrapper traffic from inventing file
  changes.
- Allows the universal plugin's boundary-notice hook to coexist with one exact
  attached controller hook without treating the notice as controller
  authority.

## Live result and exact boundary

In isolated project-local Codex task
`6c28e828-0f23-4340-a87a-424c88dfbdd4`, the exact 1.3.99 source runtime closed
the consequential control chain. One read-only child Agent was bound to its
delegated task and independently cleared. An acceptance-red first `Stop` was
denied; a fact-audited bounded correction was emitted and observed; only the
permitted source file changed; repository acceptance turned green; and the
repaired `Stop` continued. The run finalized as `SAFE_DELIVERY` with
`proofComplete=true`, `deliveryComplete=true`, and
`interventionComplete=true`.

The schema-specific verifier replayed the sealed 63-event chain successfully.
Its event-chain commitment is
`sha256:77eb3315c5072db8ab32d61e602601c21a8472f70ceea2adbaa730c75e737740`
and its manifest hash is
`sha256:3f77f1cafb71be6e488839b355d86980045aaab0b484e1eec5153e730dba58e0`.
This binds the tested runtime source and behavior; release archives are
separately rebuilt and certified from the frozen publication tree.

The tested host exposed ten project hook definitions and did not expose
`SessionEnd`. That documented event is advisory—its output cannot steer Codex
or keep a task open—so it was not counted as a passed hook. Outsider reports
the omission as a host capability gap, and this release does **not** claim that
all eleven documented lifecycle events, hosted tools, specialized paths, or
`write_stdin` on an existing exec session are controlled. The live task proves
the exact fixture and consequential hook path, not universal model correctness
or operating-system containment.

ChatGPT remains a skill/plugin surface: live ChatGPT Desktop installation and
new-chat evaluation are not established, and ordinary ChatGPT conversations
do not gain a universal lifecycle interceptor. Existing Claude Code/Desktop
Code and Cowork paths are retained; this Codex result is not presented as a new
Claude host certification.

## Public release boundary

The public package contains the Stage 0.5 runtime modules required by the
installed controller, bilingual install documentation, the Claude plugin, and
the ChatGPT/Codex repo-marketplace plugin. The reviewed public staging profile
continues to exclude non-Stage-0.5 local research, internal planning assets,
tests, raw runs, private evidence, and private data.

Required release assets are:

- `outsider-guard-1.3.99.tgz`
- `outsider-guard-1.3.99-claude.plugin.zip`
- `release-certificate-public-1.3.99.json`
- `SHA256SUMS`

The tag, archives, public certificate, and checksums are rebuilt and bound from
the same frozen 1.3.99 publication tree by the release workflow.
