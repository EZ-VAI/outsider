# Reality consequence evidence flywheel

## What this lane adds

`src/outsider-reality-consequence-evidence.js` adds a source-replayed empirical
consequence lane for Reality Stewardship.  Its first frozen source is OSHA's
Severe Injury Report (SIR) download.  OSHA describes these as employer reports
of work-related in-patient hospitalizations, amputations and eye losses under
federal OSHA jurisdiction.  The dashboard excludes fatalities and incidents
under State Plan jurisdiction and is periodically updated:

- <https://www.osha.gov/severe-injury-reports>
- <https://www.osha.gov/severeinjury>
- <https://www.bls.gov/iif/definitions/occupational-injuries-and-illnesses-classification-manual.htm>

These are real physical workplace reports. `DESCRIPTIVE` limits what Outsider
may infer from them; it does not make the underlying events synthetic or a
simulation.

## Frozen source

The 2026-08-21 pin is the complete OSHA download advertised as covering
2015-01-01 through 2025-11-30:

| Object | Bytes | SHA-256 |
|---|---:|---|
| `January2015toNovember2025.zip` | 16,224,511 | `a3f7f434e200fb956131f12277378e592993a25db3f328716fbece106f846bb0` |
| contained CSV | 57,403,269 | `406ffe7bc0758a447ad1650171b9c3f6990f901e8b73f167dad7cf60a97f13cd` |

The adapter parses the ZIP central directory itself, permits exactly one CSV,
checks decompressed size and CRC32, parses all 105,996 source rows, and commits
the exact archive, CSV and projected rows.  Five native `ID` values are reused
for different source rows, so the implementation does not silently treat the
native field as globally unique.  It uses a source-correlation key over the
native ID and UPA, and keeps the full row hash as a separate content identity.

The generated local artifact is:

```text
artifacts/reality-consequence-osha-20260821/
  January2015toNovember2025.zip
  artifact-index.json
  evidence-book-v1-canonical-p2-origin.json
```

`artifact-index.json` is the machine-readable authority for local artifact
selection.  It marks the older `evidence-book.json`,
`evidence-book-v1-source-correlation.json`, `evidence-book-v1-replay-2.json`, and
`evidence-book-v1-canonical-p1.json` files `SUPERSEDED`; only
`evidence-book-v1-canonical-p2-origin.json` is canonical.

Artifact hash:

```text
sha256:93b030c608f0534b5a655bc784d67b63b975755b122f64c4571bb7ab8127c3c0
```

Source commitment:

```text
sha256:0e3a4b6a28a8306f91ac2e132561b4675713d64427aa6ba0e8a3708db81c65df
```

Canonical artifact file hash:

```text
281,924 bytes
sha256:70347a3adc1e6450d989d0b8931b7536f56fdbf6f32f59b92f530f05191c535c
```

## Bounded robot-associated projection

The selection rule is deliberately exact and reviewable:

```text
explicit robot/robotic token, excluding the Robot Coupe product-name phrase
OR automated/automatic/autonomous guided vehicle or AGV token
```

It selects 116 report rows:

| Observation | Count |
|---|---:|
| Explicit robot-token report rows | 104 |
| Guided-vehicle-token report rows | 12 |
| Rows with an OSHA inspection reference | 64 |
| Rows reporting one or more hospitalizations | 77 |
| Reported hospitalizations summed from source flags | 79 |
| Rows reporting one or more amputations | 46 |
| Reported amputations summed from source flags | 46 |
| Reported eye losses | 0 |

The projection retains only hashes, event month, two-digit NAICS, source-native
OIICS codes/titles, reported consequence counts and deterministic context tags.
It does not persist employer name, UPA, narrative, address, city/state/ZIP,
coordinates, exact event date or inspection identifier.

The machine association is not a causal label.  Some selected reports describe
an injury near a robot or during work on a robot cell rather than a robot causing
the injury.  Every row therefore fixes all of the following to false:

- direct affected-party report;
- independent observation or adjudication;
- observed economic loss;
- recovery or longitudinal consequence observation; and
- closure.

The report row is also not asserted to be an independent event or person unit.
One OSHA row can describe more than one worker or event.

## What the data can change

For a taxonomy field `T` inside the selected report set `M=1`, Outsider may
compute only the empirical composition

```text
q_hat(k | M=1) = count(T = k and M = 1) / count(M = 1)
```

This can propose consequence channels and factor-schema candidates such as:

- source-native nature, body-part, event/exposure and equipment-source codes;
- maintenance/troubleshooting context;
- robot-cell or guarded-area context;
- energy-isolation/lockout context;
- manual intervention or jam-clearing context;
- mobile-robot/AGV context; and
- training/setup/installation context.

All context tags are post-outcome narrative matches.  They cannot be admitted as
pre-action predictors without a separate prospective instrument.

The source cannot estimate any of the following:

```text
P(injury | robot exposure)
P(injury | factor, exposure)
causal effect of a robot or intervention
monetary severity
recovery probability or time
PRICE / GUARANTEE / SETTLE authority
```

There is no complete robot-operation denominator, fatalities are absent, State
Plan jurisdictions are excluded, reporting is employer-originated, and the
selected keyword set is both post-outcome and incomplete.

## Rights and authority

Official public download is recorded as an access fact, not a blanket rights
grant.  No dataset license was established for the employer-submitted record
content.  The adapter grants no reuse or training rights and makes no legal
conclusion.  The derived artifact therefore permits descriptive composition,
factor-schema candidates, consequence-channel discovery and affected-party
class discovery only.  It permanently refuses automatic training, frequency,
causality, economic loss, pricing, guarantee, settlement, recovery and closure.

Standalone verification is `SELF_SEALED_STRUCTURE_ONLY`.  It enforces exact
schemas for the root, source profile, evidence authority, rights, selection
policy, every projected row and every nested consequence, taxonomy and privacy
object.  It also fixes all 14 counts for the official snapshot and binds source,
counts, taxonomy composition and row hashes into the source commitment.  Extra
top-level authority, row-level monetary loss, publisher/URL/coverage
substitution and count resealing are rejected.  It still cannot reverify source
bytes.

Official identity is now origin-bound, not shape-bound.  Only the exact frozen
ZIP and contained CSV, replayed through the source-aware builder, may receive
`OFFICIAL_OSHA_FROZEN_SOURCE_REPLAY`, OSHA publisher/URLs,
`ORGANIC`/`REAL_PHYSICAL`, `SOURCE_REPLAYED`, or
`OFFICIAL_PUBLIC_DOWNLOAD`.  A well-shaped caller fixture receives
`CALLER_ASSERTED_SHAPED_FIXTURE`, no OSHA publisher or URL, no real-public
environment class, no source-replayed authority, and no official access claim.
Copied source metadata cannot promote it.

Verification with the exact official ZIP rebuilds the entire book as
`FULL_OFFICIAL_OSHA_SOURCE_REPRODUCED` and returns both
`sourceArtifactsReverified:true` and `officialFrozenSourceReproduced:true`.
Replaying a generic fixture can establish only
`CALLER_ASSERTED_FIXTURE_BYTES_REPRODUCED`; it reports
`sourceArtifactsReverified:false` and `officialFrozenSourceReproduced:false`.
A second official build was byte-identical.

## The repeatable flywheel

`buildRealityConsequenceEvidenceDiff` compares two source-replayed books using
stable source-correlation keys and emits added, removed, changed and unchanged
sets.  A diff is always `SOURCE_DISCOVERY_AND_TAXONOMY_REVIEW_ONLY` and never
promotes rows automatically.

```text
new official snapshot
-> exact bytes + hash
-> full source replay
-> privacy projection
-> content-addressed snapshot diff
-> review new/changed consequence and affected-party categories
-> revise prospective measurement schema
-> collect owner-bound pre-action + delayed observations
-> independent review
-> only then reconsider an evidence ceiling
```

This is the Reality Stewardship flywheel: retrospective reality improves what
Outsider knows to measure next, while only prospective, rights-cleared and
independently governed observations can raise responsibility authority.

## Evaluated next sources

### AI Incident Database — licensed-collection lane now admitted descriptively

The Responsible AI Collaborative publishes weekly point-in-time snapshots and
an Excel export.  The latest source visible during this pass was the 2026-08-17
snapshot/export.  The terms license the `incidents`, `quickadd`, `duplicates`,
`taxa`, `classifications`, `entities`, and `entity_relationships` collections
under CC BY-SA, while expressly excluding `submissions` and the `reports.text`
field:

- <https://incidentdatabase.ai/research/snapshots/>
- <https://incidentdatabase.ai/terms-of-use/>

The independent AIID adapter now pins the complete 2026-08-17 Mongo snapshot
and a 2026-08-21 Terms capture, extracts only `incidents`, `taxa`,
`classifications`, `entities` and their metadata, and proves zero extraction or
parsing of report/submission members.  See
[`AIID-LICENSED-SNAPSHOT-EVIDENCE.md`](./AIID-LICENSED-SNAPSHOT-EVIDENCE.md).
The repository's software license is not substituted for the database-content
license.  AIID incident summaries/classifications remain publisher-curated
alleged incident evidence, not independent adjudication, denominator, monetary
loss or closure.

### California DMV standardized AV reporting — machine watch

California DMV's adopted 2026 framework adds standardized CSV templates for
vehicle miles traveled, collisions, braking events, immobilizations and Dynamic
Driving Task failures.  This is materially stronger than trying to join the old
annual self-reported disengagement files across companies:

- <https://www.dmv.ca.gov/portal/news-and-media/new-autonomous-vehicle-regulations-strengthen-oversight-and-enforcement-authorize-trucks-and-transit/>
- <https://qr.dmv.ca.gov/portal/vehicle-industry-services/autonomous-vehicles/autonomous-vehicles-program-permit-resources/>

Outsider should ingest the first stable published reporting windows once actual
source files exist, with exact permit-holder, operating-mode, ODD, geography,
time-window and reporting-regime joins.  Templates alone are schema evidence,
not observed exposure or outcome rows.

### Institutional action and remedy lane

Official complaints, orders and consent decrees are a distinct next lane.  They
can separate allegation from institutional disposition and distinguish payment
from deletion, notice, monitoring and other recovery obligations.  They must not
be merged with the employer-report lane or treated as proof that affected parties
were restored.  The independent institutional-action adapter owns that work.

## CLI

```bash
node scripts/reality-consequence-evidence.mjs \
  --osha-zip artifacts/reality-consequence-osha-20260821/January2015toNovember2025.zip \
  --out artifacts/reality-consequence-osha-20260821/evidence-book-v1-canonical-p2-origin.json \
  --generated-at 2026-08-21T00:00:00.000Z
```

Output uses exclusive-create semantics and will not overwrite an existing file.
