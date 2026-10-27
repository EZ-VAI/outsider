# Stage 3/4 authority frontier

Status: local zero-authority engineering interface. Its bound inputs include
empirical real-software and real-physical observations as well as controlled,
simulated, generated, and metadata-only evidence. That source reality is
preserved; the interface itself creates no guarantee, coverage, settlement
instruction, custody, payment or closure authority.

`src/outsider-stage34-authority-frontier.js` is the only proposed seam from the
current local evidence tree into Stage 3 and Stage 4. It does not reuse the old
Outsiderf guarantee or settlement state machines.

## What enters the frontier

The canonical builder accepts exactly three evidence graphs:

1. the readiness gap ledger, replayed by
   `verifyReadinessGapLedger`;
2. the exact current Stage 2 quote frontier plus all ATTEST, CURATE, Reality,
   empirical-factor and loss/exposure sources needed by
   `verifyStage2QuoteFrontier`; and
3. the exact Stage 2 `NON_BINDING_ABSTAIN` quote candidate plus its prior quote
   prefix, checked by `verifyStage2QuoteCandidate` against the same frontier
   and source set.

The frontier verifier must return
`FULL_ATTEST_CURATE_REALITY_EMPIRICAL_LOSS_SOURCES_REPLAYED`. The quote verifier
must return `FULL_SOURCE_FRONTIER_AND_LOCAL_PREFIX_REPLAYED`. The two exported
full verifiers must agree on the exact frontier, Claim, Way, World, CURATE
registry, Reality envelope, model domain, factor policy, validity domain,
rights reference and evidence-set hashes. Stage 3 also binds the empirical
ledger and loss/exposure-book hashes from the full frontier verifier.
The Stage 2 frontier in this chain carries the exact
`empiricalSixSourceLedgerReplayed:true` receipt; the legacy five-source key is
schema-invalid and cannot cross this boundary by resealing.

The older factor-predictive report by itself is no longer a Stage 3 input. It
does not carry the exact cross-stage Claim/Way/World, registry, Reality,
rights, loss/exposure and abstaining quote identity required at this boundary.

This proves that the exact local evidence graph was reproduced. It does not
prove legal standing, external truth, resource-owner adoption, affected-party
standing, externally governed pricing evidence, capital, custody or
adjudicator independence.

The builder has no `trusted`, `licensed`, `independent`, `actuaryReviewed`,
`reserve`, `custody`, `bind`, `pay` or `close` switch. Unknown fields are
rejected.

## Stage 3 output

The Stage 3 result is an eligibility/reference candidate with the permanent
decision:

```text
HOLD_EXTERNAL_ISSUER_OWNER_CAPITAL_CONTRACT_AND_EVIDENCE
```

Every authority field is fixed false. In particular, the artifact cannot:

- issue a guarantee or establish coverage;
- authorize the underlying real-world execution;
- assert that a local key or jurisdiction string is a licensed issuer;
- assert that a signature over an amount proves funded custody;
- treat different key IDs as institutional independence; or
- waive recovery when coverage is disputed or a warranty/learning-diet term is
  breached.

The exact issuer, policy, owner gate, capital, custodian, affected-party process
and external evidence remain named readiness gaps. A registered external hash
is copied into the frontier only as
`SUBMITTED_UNVERIFIED/closureCredit:false`; the gap stays open.

An external contract between parties with verified standing must create the
guarantee. Outsider may later serve as a referenced eligibility/evidence
component, never as a synthetic issuer.

## Stage 4 output

`buildStage4SettlementInstructionCandidate` derives the claim identity only
from the frontier's bound Reality envelope, claim, execution, consequence set
and source anchor. It accepts no arbitrary claim or `provenance:"bound"`
object.

It checks a caller-supplied append-only prefix of earlier valid candidates and
refuses a repeated claim identity. This is a local replay defense, not a claim
of global uniqueness: `globalCompletenessVerified` remains false until an
externally governed claims ledger exists.

The candidate has the permanent decision:

```text
HOLD_EXTERNAL_CONTRACT_CLAIM_ADJUDICATION_RESERVE_CUSTODY_AND_RECOVERY
```

The following are independent state cells:

| Cell | Fixed frontier state | What would be required externally |
| --- | --- | --- |
| `coverage` | `NOT_ESTABLISHED` | binding policy and verified issuer standing |
| `reserve` | `NOT_EXTERNALLY_VERIFIED` | atomic aggregate-limit reservation and authorized custodian acknowledgement |
| `financialPayment` | `NOT_AUTHORIZED` | final instruction plus one-use custodian execution acknowledgement |
| `technicalRecovery` | `OPEN_UNVERIFIED` | source-replayed recovery evidence |
| `worldRestoration` | `NOT_ESTABLISHED` | independent affected-world observation |
| `obligationClosure` | `OPEN`, reopenable | mature horizons, affected-party challenge, recovery and an external closure/reopening institution |

Payment cannot set recovery, restoration or closure. A claimed void, coverage
dispute, warranty breach or learning-diet breach cannot erase recovery. Delayed
consequences remain able to reopen the obligation.

## Verification levels

`verifyStage34AuthorityFrontierStructure` verifies the canonical bytes, fixed
no-authority semantics and exact readiness ledger. Its result explicitly says
`sourceArtifactsReverified:false`.

`verifyStage34AuthorityFrontier` invokes both Stage 2 full verifiers, which
reopen the complete Stage 2/Reality source graph, then rebuilds the Stage 3/4
frontier and byte-compares it. Even on success it returns:

- `externalEvidenceVerified:false`;
- `externalInstitutionAuthorityVerified:false`;
- `bindingGuarantee:false`;
- `settlementInstructionEligible:false`;
- `movesFunds:false`; and
- `closesObligation:false`.

`verifyStage4SettlementInstructionCandidate` can replay the exact frontier,
readiness ledger and local prior-candidate prefix. It does not reverify source
bytes and therefore cannot upgrade the frontier.

## Red-team boundary

The test suite covers these attacks that the old prototype did not safely stop:

1. **Stale Stage 2 seam:** a factor-predictive-only input is rejected.
2. **Quote resealing:** replacing a bound model/quote identity and recomputing
   its outer hash fails full quote replay.
3. **Source mismatch:** a Stage 2 frontier presented with different Reality or
   upstream source bytes fails before Stage 3 receives a reference.
4. **Fake PRICE:** non-null price/currency or PRICE/COVERAGE permission cannot
   cross the frontier, even after quote resealing.
5. **Local resealing:** changing authority, removing open gaps or crediting an
   external submission and recomputing the hash is rejected.
6. **Claim replay:** using the same claim identity again in the supplied prefix
   is rejected.
7. **Reserve invention:** caller-supplied reserve/custody fields are rejected;
   resealing them into a candidate also fails.
8. **Void erases recovery:** resealing a void/paid state to erase recovery,
   declare restoration or close the obligation fails.

These defenses establish a safe local frontier. Production Stage 3/4 still
requires the external evidence and institutions listed in
`docs/STAGE-READINESS-GAP-LEDGER.md`.
