# Codex Stage 0.5 control boundary

## Current, claimable state

Outsider's direct Codex runtime is no longer only an installable hook candidate.
An isolated, project-local live task using the exact 1.3.99 source runtime
closed one consequential Stage 0.5 loop:

1. the first `Stop` found red acceptance and kept the task open;
2. a fact-audited, bounded correction was emitted and observed;
3. the worker changed only the fixture's permitted source file;
4. the preregistered test turned green;
5. the outcome-approval audit passed and the intervention resolved;
6. the repaired `Stop` continued, the run finalized as `SAFE_DELIVERY` with
   `proofComplete=true`, `deliveryComplete=true`, and
   `interventionComplete=true`, and the 63-event hash chain verified.

Run `6c28e828-0f23-4340-a87a-424c88dfbdd4` also bound one read-only child
Agent to its delegated task, exact observed read, and transcript-bound report
before recording `task_completed`. The sealed event-chain commitment is
`sha256:77eb3315c5072db8ab32d61e602601c21a8472f70ceea2adbaa730c75e737740`;
the manifest hash is
`sha256:3f77f1cafb71be6e488839b355d86980045aaab0b484e1eec5153e730dba58e0`.

Worker prose was not accepted as outcome evidence. The final allow was first
persisted as a signed canonical controller receipt and was then projected to the
native Codex empty-success envelope. The controller stopped and its socket was
gone after the run.

This is a bounded live result for that consequential hook path. It is not a
claim that every lifecycle event fired, every Codex tool is hookable, every
long-running or multi-agent task is correct, or the worker is contained by an
operating-system sandbox. The run binds the exact 1.3.99 runtime source; the
tagged archive remains a separately rebuilt and certified distribution
artifact rather than something inferred from the live task.

## Ten core events, plus one advisory event

Outsider installs all eleven lifecycle names in the current
[official Codex Hooks documentation](https://learn.chatgpt.com/docs/hooks):

| Stage 0.5 role | Event |
|---|---|
| establish or resume session identity | `SessionStart` |
| freeze the operator contract | `UserPromptSubmit` |
| evaluate a local tool action before execution | `PreToolUse` |
| observe or decide a native approval boundary | `PermissionRequest` |
| bind the result of an observed local tool action | `PostToolUse` |
| persist contract and state before compaction | `PreCompact` |
| check continuity after compaction | `PostCompact` |
| bind a delegated worker to the task graph | `SubagentStart` |
| audit a delegated worker's terminal handoff | `SubagentStop` |
| independently verify and allow or block completion | `Stop` |

Those ten events are the required Codex Stage 0.5 core inventory. Their exact
Outsider command hashes must be reviewed in `/hooks`; a missing, disabled,
untrusted, ambiguous, or detached core entry keeps the core inventory red.

`SessionEnd` is installed as an eleventh, best-effort event with Codex's
three-second maximum timeout. It can seal notes after a main thread ends, but
the official contract defines it as advisory: its output cannot steer Codex or
keep the thread open. The tested Desktop host exposed and trusted the ten core
project hooks but did not expose `SessionEnd`. Outsider reports that as an
advisory capability gap; the absence does not invalidate a consequential loop
that was already controlled at `Stop`.

## Two evidence levels that must not be conflated

### Product doctor and a verified attached run

`outsider doctor --json` reports what the installed product can establish from
its local configuration and Stage 0.5 run directories. For Codex it keeps these
facts separate:

- the ten core hooks are configured;
- the advisory `SessionEnd` hook is configured or absent;
- a Codex runtime has been observed;
- a source-verifiable Stage 0.5 run directory closed a consequential loop;
- complete hosted/specialized tool coverage has not been established.

A verified run can therefore set `consequentialClosedLoopRunSeen=true` and
`consequentialControlEvidenceVerification=FULL_STAGE05_RUN_DIRECTORY_VERIFIED`
without setting `controlledRunSeen=true`. The doctor deliberately does not
launder a run-ledger completion into strict host-control proof.

### Strict source-bound Codex control assessment

`src/outsider-codex-control-evidence.js` answers a narrower and stricter
question: can the exact native Codex host action be cross-bound to Outsider's
decision using independently replayable sources? It requires all of the
following:

1. replay of the exact Codex binary, generated schemas, and same-connection
   `hooks/list` response;
2. a canonical app-server duplex source signed by an allow-listed recorder;
3. mode-0600 canonical hook payload/result sources and independently signed,
   hash-only controller receipts;
4. matching session, thread, turn, hook hash, and exact action identity across
   the host trace and controller receipts;
5. the required pre-action, intervention, post-result, Stop, and fail-visible
   availability chain.

Only that source set can yield the strict `ACTION_CONTROLLED_PARTIAL` or
`LIFECYCLE_CONTROLLED` assessment. The app-server schema used by the existing
strict verifier did not expose an exact tool item identity in
`HookRunSummary`, so temporal adjacency alone is rejected. The bounded direct
live result remains real consequential evidence; it simply answers a different
question from exact app-server item cross-binding.

## Source-bound evidence design

The strict verifier separates three authorities:

1. provider capability metadata: binary, generated schema, and `hooks/list`;
2. host behavior: a hash-only projection of the canonical app-server stream,
   signed by an allow-listed recorder and replayed byte-for-byte;
3. controller behavior: Ed25519-signed receipts binding hashed session, thread,
   turn, item, hook hash, input, decision, output, and outcome fields.

The public trace contains no prompt, command, cwd, or tool-output text. Those
bytes remain in local mode-0600 canonical sources and are needed only for local
replay. A caller-created trace, an assistant statement, hook configuration on
disk, or a discovered hook is not accepted as provider delivery proof.

The packaged attached hook persists its canonical controller decision before
returning the native Codex output. `PreToolUse` and `Stop` fail closed when the
consequential decision or receipt cannot be persisted. Passive lifecycle
failures remain visible instead of silently becoming green. A missing
`SessionEnd`, however, cannot retroactively steer or reopen a completed thread
and is therefore reported separately from the ten-event core inventory.

For app-server clients, the packaged `outsider-codex-app-server` executable is
a transparent stdio bridge. It injects one `hooks/list` request after the
client's `initialized` notification, proxies every other message unchanged,
and seals the duplex source at exit:

```sh
outsider-codex-app-server \
  --source ./private/codex-duplex.jsonl \
  --trace ./codex-control-trace.json \
  --signing-key ./private/recorder-ed25519.pem \
  --probe ./codex-worker-capability-probe.json \
  --native-binary /exact/path/to/native/codex \
  --schema ./codex-worker-capability-probe.json.schema.json \
  --app-server-schema ./codex-worker-capability-probe.json.app-server-schema.json
```

The bridge refuses to seal when the binary/schema/hook-list replay differs from
the probe, the same-connection hook list is missing, or an output path already
exists. It never passes `--dangerously-bypass-hook-trust`, never starts a thread
or model itself, and never gives the model or Codex process the recorder private
key.

## Tool-path boundary

The official hook path currently covers shell calls, unified `exec_command`,
`apply_patch`, MCP tools, and most other local function tools. It does not imply
complete tool control:

- hosted tools such as `WebSearch` do not traverse the local function-tool hook
  path;
- specialized tools can opt out of the default path;
- `write_stdin` is transport for an existing unified-exec session and does not
  trigger a second `PreToolUse`; its eventual completion may deliver the
  original command's `PostToolUse`;
- hook trust is a user decision bound to the exact command hash, and installing
  or enabling a plugin does not automate that consent;
- a same-UID process that can read arbitrary user-private files is outside the
  local receipt trust boundary.

Accordingly, Codex hooks are a consequential workflow guardrail, not a complete
tool-enforcement boundary, a universal correctness guarantee, or OS
containment.

## Zero-model audit

Run:

```sh
npm run canary:codex:probe
```

The probe hashes the installed native binary, generates the experimental
app-server schema, calls `hooks/list`, replays its metadata sources, and writes
a machine-readable control-readiness record. It does not start a thread, send a
prompt, invoke a model, or bypass hook trust. Metadata success establishes the
installed capability inventory; it does not replace either a bounded live run
or the separate strict source-bound assessment.
