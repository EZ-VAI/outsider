# Real-device stream and physics frontier

This Stage 1.5 frontier completes the local adapter interface without claiming
that a live device, a prospective experiment, an independently sensed outcome,
or externally reviewed physical parameters exist.

The crucial distinction is:

- DROID is empirical evidence from real physical executions. It is not made
  synthetic or unreal by retrospective use.
- The present DROID replay is retrospective and descriptive. That limits its
  authority and permitted use; it does not change the reality of its source.
- A complete local interface is not a live evidence record. The report therefore
  keeps `realProspectiveExecutions`, causal experience units, and independently
  adjudicated outcomes at zero.

The implementation is in
`src/outsider-device-stream-physics-frontier.js`. Its standalone verifier CLI is
`scripts/stage15-device-stream-physics-frontier.mjs`.

## Implemented interface

The frontier defines and enforces five separately hashed layers:

1. A source-adapter descriptor binds the adapter ID and version, format family,
   actual in-process JavaScript entrypoint source, source schema, and the fixed
   normalized output contract. Registration recomputes both implementation and
   schema hashes.
2. An immutable source-object manifest is derived from the exact object bytes.
   Replay requires the exact object ID, immutable version, length, and
   domain-separated SHA-256 for every object.
3. A platform parameter manifest requires explicit units, coordinate-frame
   topology and transform commitments, joint limits, workspace bounds, control
   rate/period, sensor modalities, sensor calibration commitments, and fusion
   tolerances.
4. Normalized frames require a gap-free sequence, unique action-observation pair
   ID, unique sensor frame ID, one explicit entry per declared sensor, and
   source-native outcome commitments with non-consequence semantics.
5. A same-process replay receipt summarizes sensor missingness, timing and
   fusion checks, action-observation pairing, and joint/workspace bound checks.

When source timestamps exist, the verifier checks strict monotonicity, expected
control period, per-sensor skew, action-observation skew, and cross-sensor fusion
spread. A missing sensor is not silently deleted: it must have an explicit
missing flag and reason, and appears in the missingness ledger.

The platform parameter manifest is deliberately a local declaration. Its
`physicsTruthExternallyVerified` value must be `false`; a caller cannot set it to
`true`. The manifest lets the software enforce dimensional and geometric
consistency while leaving engineer review and external attestation open.

## Full-source trust boundary

There are only two accepted replay paths:

- `DeviceStreamAdapterRegistry.replay(...)` calls an adapter registered in the
  current process after recomputing its implementation/schema descriptor and
  reopening every immutable source object.
- `replayDroid100RetrospectiveDeviceEvidence(...)` reads all four existing DROID
  source objects itself and invokes `verifyDroid100PilotArtifactDirectory(...)`
  at `FULL_SOURCE_REPRODUCED`.

Replay receipts are accepted by object identity only in the process that did the
replay. A copied or re-sealed JSON receipt is not trusted. There is no
`verified` input, and the CLI explicitly rejects `--verified`.

This protects against caller-asserted full-source status, post-replay sensor-hash
replacement, and adapter implementation/schema re-sealing.

## DROID conformance result

The checked-in DROID pilot contains two decoded real-robot episodes and 404
action-observation frames. The frontier reopens the original object list,
dataset descriptor, feature descriptor, and first TFRecord shard before adapting
them.

The verified DROID projection does not contain source timestamps
(`tOffsetMs` is `null`). It therefore proves gap-free source ordinals and exact
action-observation pairing, but reports timing and fusion as
`NOT_CHECKABLE_SOURCE_TIMESTAMPS_ABSENT`. It does not synthesize timestamps.

Each DROID `reward`/`discount` object is retained only through a commitment with
the semantic boundary
`SOURCE_NATIVE_OUTCOME_NOT_INDEPENDENT_CONSEQUENCE`. The report contains:

- `sourceNativeOutcomeRecords: 404`
- `independentOutcomes: 0`
- `realProspectiveExecutions: 0`
- `causalExperienceUnits: 0`
- `physicsTruthExternallyVerified: false`
- automatic training, `PRICE`, and production eligibility all `false`

This is real physical retrospective adapter conformance. It is not a live device
trial, causal adjudication, loss fact, guarantee, price, or production approval.

## ROSBAG2 and MCAP contract

The generic interface can host future ROSBAG2 or MCAP implementations, but this
change does not decode either format and does not connect to a live stream.
The satisfied `S15_DEVICE_STREAM_AND_PHYSICS_FRONTIER` v1 definition of done is
limited to the format-neutral contract and the DROID retrospective adapter.
Concrete ROSBAG2 and MCAP parsers are separate, uncommitted future adapters;
their absence is not silently counted as completed parser work or as a current
v1 internal gap.

```sh
node scripts/stage15-device-stream-physics-frontier.mjs --future-contract ROSBAG2
node scripts/stage15-device-stream-physics-frontier.mjs --future-contract MCAP
```

Both contracts state exactly:

- `parserStatus: PARSER_NOT_IMPLEMENTED`
- `liveStreamStatus: NO_LIVE_STREAM`
- `fullSourceClaimAvailable: false`
- `productionReady: false`

Attempting `--require-live ROSBAG2` or `--require-live MCAP` fails with
`NO_LIVE_STREAM`; supplying a handle to the module-level future replay contract
then fails with `PARSER_NOT_IMPLEMENTED`.

## Replaying the existing DROID pilot

DROID mode requires a complete platform parameter manifest supplied as a JSON
file. Requiring that input avoids inventing robot limits, units, frame transforms,
control rate, or calibration truth from the trajectory values themselves.
The DROID adapter requires seven explicit joint IDs (`droid-joint-0` through
`droid-joint-6`) and binds sensors by the source-channel names
`DROID_PROPRIOCEPTION`, `DROID_EXTERIOR_IMAGE_1_LEFT`,
`DROID_EXTERIOR_IMAGE_2_LEFT`, and `DROID_WRIST_IMAGE_LEFT`. This prevents an
implicit joint permutation or camera-order guess.

```sh
node scripts/stage15-device-stream-physics-frontier.mjs \
  --droid-artifacts artifacts/curate-droid100-20260820/real-pilot-v2-registry-final \
  --droid-source artifacts/curate-droid100-20260819/source \
  --platform-manifest /absolute/path/to/local-platform-manifest.json
```

Even when the local manifest encloses every observed DROID value, the output
keeps external physics truth false because observed envelopes are not certified
hardware limits or calibration attestations.

## Fail-closed attacks covered

The dedicated tests reject:

- missing units, coordinate frames, joint/workspace limits, or calibration
  commitments;
- coordinate-frame parent errors and externally verified truth asserted by a
  local caller;
- timestamp reversal, control-period gaps, sequence gaps, duplicate sensor
  frames, broken action-observation pairs, excessive sensor skew, and bounds
  violations;
- immutable-source byte changes;
- adapter implementation/schema substitution;
- caller `verified: true`, cloned/re-sealed receipts, and sensor-output hash
  replacement;
- promotion of a source-native reward to an independent consequence.

Run the focused suite with:

```sh
node --test test/outsider-device-stream-physics-frontier.test.js
```

## Readiness recommendation

Mark `S15_DEVICE_STREAM_AND_PHYSICS_FRONTIER` as
`SATISFIED_INTERNAL`, with wording limited to the format-neutral adapter,
immutable replay, timing/fusion/missingness checks, platform-parameter interface,
and DROID retrospective conformance.

Keep the following evidence or authority gaps blocked:

- `S15_REAL_PROSPECTIVE_DEVICE_CONTROLS`
- `S15_INDEPENDENT_OUTCOME_SENSING_AND_PLATFORM_PARAMETERS`
- `S15_DEVICE_ACQUISITION_ROOT`
- `S15_OWNER_AFFECTED_PARTY_EXPERIMENT_GOVERNANCE`

The readiness description should not say that a live ROSBAG2/MCAP pipeline now
exists. Only their future adapter contract exists; both concrete parsers remain
explicitly unimplemented.
