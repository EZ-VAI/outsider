# Institutional AI remedy evidence

This lane gives Reality Stewardship a source-replayed record of what happens
*after* a real software system is alleged to harm people.  It is not a loss
book, an insurance pricing dataset, legal advice, or proof that the remedy was
performed.

## Frozen evidence

The first snapshot contains nine official objects (23,294,396 bytes):

- the U.S. Department of Justice case page, complaint, and court-entered
  settlement/final judgment in *United States v. Meta Platforms, Inc.*;
- five published VRS third-party review reports spanning June 2023 through the
  report issued October 2024 and updated December 2024; and
- the EEOC release describing the iTutorGroup automated age-screening case and
  consent-decree obligations.

Every object has an exact URL, byte length, and SHA-256 pin.  Full verification
opens each file without following symlinks, reads one stable descriptor
snapshot, checks the frozen pin, rechecks the two official HTML projections,
and reconstructs the entire evidence book.  PDF legal meaning is not
machine-parsed or independently reviewed; the PDF bytes bind the curated
projection to the named official documents.

Public access is recorded independently from reuse permission.  This snapshot
does not establish training rights for the source set, does not resolve rights
in the third-party review reports, grants no additional rights through the
adapter, and keeps all raw bytes outside the package.

The FTC DoNotPay, Everalbum, and Rite Aid matters remain useful next-wave
sources.  They were not silently substituted into this snapshot because the
FTC download host returned a reproducible 403 to the acquisition client.  A
browser-visible source is not treated as a source-replayed local byte object.

## The responsibility flywheel

The machine model keeps eight states separate:

1. allegation or regulatory charge;
2. institutional resolution;
3. remedy obligation;
4. implementation evidence;
5. monitoring-document publication;
6. independent or affected-party review;
7. delayed consequence monitoring; and
8. recovery and closure review.

The two cases establish two real-software allegation streams, two reported
institutional resolutions, thirteen distinct remedy obligations, and five
published monitoring documents.  Because report conclusions are not parsed in
this lane, those documents are not counted as verified implementation or
delayed-consequence observations.  They establish zero affected-party direct
reports, zero verified payment executions, zero externally verified remedy
performances, zero verified recoveries, and zero closures.

The selected cases are not a complete sampling frame.  The artifact therefore
publishes no stage-transition probability, remedy-performance rate,
time-to-recovery distribution, or recurrence rate.  Its counts describe this
source-bound snapshot only.

This is the missing bridge between “a consequence happened” and “somebody is
still responsible.”  It shows why payment, system redesign, policy change,
training, injunction, monitoring, recovery, and closure cannot be represented
by one settlement boolean.

## Monetary fields

The DOJ page reports a USD 115,054 civil penalty.  The EEOC page reports a USD
365,000 applicant distribution.  The book preserves the exact amounts and
their different remedy classes but refuses to aggregate them.  Neither is
treated as insured loss, claimant economic severity, paid claim, reserve,
frequency denominator, or transferable Stage 2 severity.

## Fixed authority boundary

All artifacts and receipts fix the following to false:

- economic-loss and incident-frequency eligibility;
- causal liability adjudicated on the merits;
- production-model and automatic-training eligibility;
- owner-gate eligibility;
- `PRICE`, `GUARANTEE`, `SETTLE`, and `CONTROL`;
- execution and closure.

Standalone verification is `SELF_SEALED_FIXED_PROJECTION_ONLY` and does not
reverify source bytes. Monitoring rows contain declared byte pins but set
`reportBytesSourceReplayedByBook:false`. Only
`verifyInstitutionalAiRemedyEvidenceAgainstSource`
can return `sourceArtifactsReverified:true`, and even it keeps legal review,
payment, remedy performance, affected-party participation, recovery, and
closure false.

## Commands

```sh
node scripts/acquire-reality-institutional-ai-remedies.mjs
node scripts/reality-institutional-ai-remedies.mjs
node --test test/outsider-institutional-ai-remedy-evidence.test.js
```

Both acquisition and generation refuse to overwrite an existing directory.
Future snapshots should use a new dated path, then run a content-addressed diff
before any new record is admitted.

## Readiness effect

This evidence improves the local vocabulary and required-field design for
Stage 3 recovery continuity and Stage 4 remedy lifecycles.  It does **not**
close the external readiness gaps.  In particular:

- `S3_AFFECTED_PARTY_STANDING_POLICY_TERMS` remains blocked because the source
  set contains no source-replayed affected-party standing or acceptance;
- `S4_PAYMENT_AND_RECOVERY_EVIDENCE` remains blocked because an ordered amount
  is not a payment receipt and an obligation is not completed recovery;
- `S4_LONGITUDINAL_CONSEQUENCE_MATURITY` remains blocked because publishing a
  monitoring report is not the same as a complete longitudinal consequence
  stream; and
- issuer, capital, custody, independent adjudication, appeal, owner adoption,
  execution, and closure authority remain wholly external.

The progress is empirical schema refinement and a better acquisition target,
not readiness credit.
