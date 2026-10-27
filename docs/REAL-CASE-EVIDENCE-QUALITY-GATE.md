# Real-case evidence quality gate

Real-world cases and real-world experience are not “research data” in the
sense of being less real. They remain real cases. `research`, `shadow`, and
`production` describe a permitted use or an inference boundary, not whether an
event happened.

The reverse rule is equally important: data collected by Outsider is not
better merely because Outsider collected it. Public regulator data is not
worse merely because it was downloaded. Both pass the same claim-specific
quality gate in `src/outsider-real-case-quality-gate.js`.

## Four independent questions

1. **Reality:** is this a recorded real case, aggregate real experience, a real
   institutional operation, a controlled real execution, a simulation, or
   generated synthetic data?
2. **Quality:** which claims survive source provenance, byte identity,
   population-frame, completeness, revision/dedup, measurement, denominator,
   temporal, outcome, adjudication, dependence, and missingness checks?
3. **Rights:** may the bytes and derived experience be copied, reused, or used
   for a model update? Rights do not rewrite the historical fact.
4. **Authority:** does Outsider or a named counterparty have standing to price,
   guarantee, move funds, adjudicate, or close an obligation? Reality does not
   create that authority.

There is no global quality score. A source can be strong evidence that cases
exist and weak evidence for incidence. It can contain independently adjudicated
amounts while lacking a target-domain transfer argument. Each capability has
its own explicit required dimensions.

## Pollution controls

- Rows that fail a required capability gate remain available to lower-level
  factual/taxonomy lanes but do not enter the stronger model lane.
- Missing denominators cannot become zero denominators.
- Multiple versions, reporters, devices, claims, parties, or correlated rows
  are retained as dependence roots rather than silently multiplied.
- Source replay verifies bytes and derivation; it does not certify that the
  original reporter was correct.
- A caller-sealed quality assessment is always declared-facts only. Only a
  source-aware adapter that reopens the pinned source and exact-compares the
  derived assessment may authenticate those facts downstream.
- Collector relationship is recorded for audit, but the policy never uses it.

## Capability vector

The gate evaluates separate evidence capabilities for real-case recognition,
taxonomy, selected-scope composition, reported and independent outcome
sensing, exposure frequency, economic severity, reserve development, causal
effect, capital adequacy, custody execution, adjudication finality, and
longitudinal recovery.

Those entries say whether declared quality facts satisfy the requirements.
They are not source-authentication receipts: actual admission requires a
source-aware adapter to reopen pinned bytes and exact-compare the assessment.

It separately evaluates operational capabilities for automatic training,
target-domain price, guarantee issuance, claim settlement, and closure or
reopening. The policy always leaves these unauthorized; it only records
whether declared quality prerequisites are present. A real case can pass the
first group without creating target-specific operational authority.
