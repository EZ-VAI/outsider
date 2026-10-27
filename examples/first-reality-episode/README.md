# First Reality Episode partner kit

This directory is a minimal, **non-protocol** intake worksheet. It helps a
prospective partner identify facts that Outsider must bind before and after a
remote or physical action. These files are not accepted evidence objects, do not
define a new schema and must not be passed directly to an execution or authority
surface.

## Files

- `remote-action.example.json` is an unexecuted `REMOTE_ACTION` example. It
  contains an out-of-band raw-source reference plus adapter hint and commitment
  slots. It deliberately contains no `makeExecutionTrace` argument object.
- `physical-action.platform-manifest.template.json` contains the exact semantic
  inputs expected by the existing `createDevicePlatformParameterManifest`
  constructor, wrapped as `builderInput`. Its `null` values intentionally make
  it fail until real platform facts are supplied.
- `physical-action.episode-join.template.json` contains only out-of-band artifact
  slots for the existing device-stream replay, delegation envelope, primitive
  attempt and telemetry assessment. It is not input to any of those constructors.
- `prereg-census.template.json` freezes prospective-design inputs and reserves
  only an `attemptCensusSlotCommitmentHash` for the future census join.

## `null`, `UNKNOWN` and `HOLD`

- `null`: no admissible source value has been supplied. Never replace it with
  zero, `false`, an observed envelope or a guessed device/API value.
- `UNKNOWN`: the question is represented but cannot currently be decided.
- `HOLD_*`: the missing or unresolved fact blocks promotion. A HOLD is a valid
  terminal engineering result.

The current main line has an append-only local census in
`src/outsider-run-census.js`; `RunStore` now registers and binds it before the
worker path, and Stage 0.5 sealing settles its exact terminal class. It remains
local tamper-evident coordination with no external authority, and it is not yet
joined to a remote/physical episode adapter or external outcome verifier.
`attemptCensusSlotCommitmentHash:null` is therefore still a reserved join slot.
It is not a census artifact, does not represent attempt rows and does not
establish `ledgerClosed:true` or a complete episode denominator. Populate it only from
an implemented episode projection of a real pre-action census registration and
frozen contract binding; never substitute a ledger head or a retrospective
worksheet hash.

## Raw-source rule

Do not embed raw request/response bodies, prompts, logs, images, video, audio,
joint streams, credentials, personal data or secrets in these JSON files. Keep
raw bytes in an access-governed source store. When an implemented adapter opens
the exact bytes, bind only the immutable object reference, exact byte length and
domain-separated SHA-256 commitment needed by that existing protocol.

A hash proves byte identity only. It does not prove that the bytes are true,
complete, legally usable, independently collected or correctly interpreted.

For remote data, register the source-specific adapter with `registerAdapter`,
then pass the adapter-opened raw source to `normalizeExecution` with the frozen
adapter hint. Never pass this worksheet to `makeExecutionTrace`, and never add
`executor`, `world`, `steps`, `resources` or `outcome` fields merely to make the
worksheet resemble that constructor's input. The adapter owns source parsing;
the worksheet owns no parsing or normalization authority.

## Three immediately usable data lanes

1. **Prospective `REMOTE_ACTION`:** controlled, owner-scoped remote actions can
   exercise provider-native action IDs, idempotency, server acknowledgements,
   before/after state, rollback, delayed outcomes and eventual attempt census.
   They receive no automatic CEU, outcome-independence or authority credit.
2. **Retrospective physical/source data:** DROID and BridgeData may exercise
   physical parsing and provenance; LIBERO retains its own source/simulation
   classification. This lane is descriptive and fixed at
   `causalExperienceUnits:0`.
3. **Synthetic fault injection:** simulation can exercise clock drift, missing
   sensors, duplicate frames, coordinate errors, emergency stop, takeover,
   recovery and reopening. It is fixed at `causalExperienceUnits:0` and cannot
   establish real-device performance.

Do not pool lanes in a way that erases their source class.

## Declared physical joins

The physical profile points to existing maintained constructors; this directory
does not replace their inputs with a second schema:

- `DeviceStreamAdapterRegistry.register` and `.replay` bind the exact adapter
  descriptor, immutable source, platform manifest and replay output.
- `createPhysicalDelegationEnvelope` and `createPrimitiveAttempt` bind the
  pre-action delegation boundary and attempt lineage.
- `createPhysicalTelemetryAssessment` binds attempt-specific calibrated
  measurement; missing telemetry remains `UNKNOWN`, never zero.
- The monitor-regime slots, Reality Stewardship rights/budget/responsibility
  artifacts, Stage 1 ATTEST lifecycle, Stage 1.5 CURATE decisions, delayed
  consequence/challenge/state artifacts and Stage 2 pre-action target contract
  remain separate source-replayable records.

The First Reality Episode plan only declares that a future promotion verifier
must join their exact hashes. It does not construct them, does not treat this
worksheet as one of them and does not grant action or promotion authority.

## Filling the worksheets

1. Copy the applicable file into a private working directory.
2. Preserve every unresolved value as `null`/`UNKNOWN`; do not make the template
   look complete.
3. Freeze Claim, Way, World, cohort/outcome/stopping rules, monitoring regime and
   Stewardship references before action where the prospective design requires
   them.
4. Keep raw objects external and compute commitments only from exact bytes.
5. For a physical platform, pass only the completed `builderInput` object to
   `createDevicePlatformParameterManifest`; the current API will recompute and
   verify the manifest hash.
6. Keep physical delegation, attempt and telemetry artifacts out of the episode
   join worksheet. Populate only their immutable object references, lengths and
   hashes after the existing constructors have emitted them.
7. For a remote source, implement and `registerAdapter` first, then call
   `normalizeExecution` with the exact raw source and adapter hint. An adapter may
   internally call `makeExecutionTrace`; the worksheet may not. Then use the
   existing Stage 0.5, ATTEST/CURATE and Reality Stewardship paths. Do not promote
   this worksheet itself.

## No-authority boundary

Every worksheet fixes `authority:"none"`, all permission bits to `false`, and
`causalExperienceUnits:0`. A signature, a second process, a second model, or two
keys cannot change that. Resource-owner adoption, affected-party standing,
organizational independence, outcome adjudication, rights, price, coverage,
payment and closure require their own source-specific external evidence and
verifiers.
