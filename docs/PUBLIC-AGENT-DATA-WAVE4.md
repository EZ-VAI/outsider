# Public Agent Data Wave 4: AgentRx τ-retail Failure Traces

Wave 4 adds a bounded failure-debugging corpus to Stage 1.5 / CURATE. Its
trajectories are empirically recorded executions in a controlled tau-bench
sandbox; they are not fabricated rows, although the sandbox is not an organic
customer or physical-world environment. It is a descriptive, quarantined
input: it can support failure-taxonomy and trace-shape analysis, but it cannot
enter causal experience, production modeling, loss,
pricing, guarantee, or settlement paths.

Most importantly, this is a **failed-only sample**. Its 29 failed executions do
not provide a denominator and therefore cannot estimate an agent failure rate.

Wave4 schema v2 embeds the frozen public-evidence ontology reference in every
normalized row and in the manifest, summary, verification, and candidate
decision. The source is classified as `SIMULATION` with
`observationOrigin = RECORDED_EXECUTION` and
`empiricalStatus = EMPIRICAL_RECORDED`. This preserves the fact that the traces
were actually recorded while refusing to mislabel sandbox consequences as
real-world effects. `SHADOW_RESEARCH` is an allowed use, not a reality class.
The full cross-source ontology and rights boundary are documented in
[`PUBLIC-EVIDENCE-ONTOLOGY.md`](PUBLIC-EVIDENCE-ONTOLOGY.md).

## Primary sources and frozen scope

The publisher is Microsoft:

- Research publication: <https://www.microsoft.com/en-us/research/publication/agentrx-diagnosing-ai-agent-failures-from-execution-trajectories/>
- Research blog: <https://www.microsoft.com/en-us/research/blog/systematic-debugging-for-ai-agents-introducing-the-agentrx-framework/>
- Paper: <https://arxiv.org/abs/2602.02475>
- Code and released source objects: <https://github.com/microsoft/AgentRx>
- Dataset card: <https://huggingface.co/datasets/microsoft/AgentRx>

The acquisition is frozen to GitHub commit
`f228165bfec60a801fd5fedd9d8ffe0f9de0c69d` and tree
`d08e8e454cd027aac69f07b172a20cffd9ecd2ff`. The selected scope is exactly:

- the complete `data/tau_retail/tau_dataset_failed.json` container;
- the complete matching `data/ground_truth/tau_ground_truth.json` annotations;
- the τ-retail policy and tool schema;
- the repository README and MIT license declaration;
- Git commit and recursive-tree metadata used to bind every selected GitHub
  object to its blob; and
- the official AgentRx dataset card at Hugging Face revision
  `88e871fecb58b2d090449f37ec80b8865594e0b5`.

The local source snapshot has 9 objects and 1,025,707 bytes. The full trace
container is 900,014 bytes. The adapter rejects extra files, missing files,
same-size byte substitutions, incorrect Git blob bindings, row-count changes,
duplicate IDs, broken tool-call/result joins, and non-exact trajectory-to-label
joins.

## Reproduced evidence

The source replay produces:

- 29 complete selected failed trajectories;
- 29 exactly joined manual annotation rows;
- 29 unique identities and 29 unique task roots;
- 3 publisher-native `info.source` labels/roots (`user`: 24,
  `transfer_to_human_agents`: 4, `exchange_delivered_order_items`: 1), all
  still joined under one common dataset root;
- 1,064 conversation/tool turns;
- 284 paired tool calls and tool results;
- 62 calls to the adapter's bounded write-like tool-name list;
- 39 publisher-annotated failure events;
- 7 trajectories with more than one annotated failure;
- 2 trajectories whose designated root cause follows an earlier annotated
  failure; and
- designated root-cause agent labels of 21 `ASSISTANT` and 8 `USER`.

These are counts inside the selected failed split. They are not population
rates, intervention effects, reliability estimates, or monetary outcomes.

The publisher describes the larger AgentRx benchmark as 115 manually annotated
failed trajectories across τ-bench, Flash, and Magentic-One, and its paper says
the domains were handled by independent annotators. Wave 4 does not ingest the
other domains. The released τ-retail rows do not carry independently verifiable
annotator identities, so Outsider records publisher-declared manual annotation
while leaving row-level annotator identity unverified.

## License boundary

The selected GitHub bytes are accompanied by the repository's pinned MIT
license and README declaration. The separately pinned Hugging Face dataset card
declares `cc-by-4.0`.

The registry intake lists **MIT only** for this artifact set because the
ingested trajectory and annotation bytes came from the GitHub commit. It records
the CC-BY-4.0 card as linked publisher evidence, but it does not claim that the
gated Hugging Face data objects are byte-equivalent to the selected GitHub
objects. The adapter grants no rights and makes no legal conclusion.

## Quarantine boundary

The traces are executions in the τ-bench structured API sandbox. A tool call in
this source is not proof of an external real-world side effect. A publisher
root-cause chain is not a causal-effect estimate. The native `reward` value is a
benchmark field, and `user_cost`, refunds, prices, and product values inside the
sandbox are not verified economic loss.

The enforced result is therefore:

| Field | Admitted value |
| --- | ---: |
| Full selected trace rows | 29 |
| Failure rate estimable from this failed-only scope | false |
| Causal experience units | 0 |
| Economic-loss rows | 0 |
| Pricing-eligible rows | 0 |
| Production-model-eligible rows | 0 |
| Automatic training | false |
| `CEU`, `MODEL`, `LOSS`, `PRICE`, `GUARANTEE`, `SETTLE` | all false |

The normalized registry projection stores hashes, counts, bounded publisher
failure categories, and root-cause agent labels. It does not store raw prompts,
trace text, tool arguments/results, or annotation prose.

The canonical `2026-08-21T00:00:00.000Z` replay freezes these commitments:

- ontology classification:
  `sha256:7f14602316d46b8d61f339a56ba468091c6bfd944d53862ed446ebfcea37977c`
- ontology rights boundary:
  `sha256:0fdcf8f34841e969ae4fbe542f032c4622a3a132fdcacd5bac5fdd2131b4af20`
- ontology reference:
  `sha256:38f2f382e5bfe2cb86929e07c5176838db94b5a529f9f99a61d7f2028bf40380`
- manifest: `sha256:51655643a52b6a6ed0ae4f68ec824bb5a7e42d963f55912a08d1ea5dcb2c3144`
- record set: `sha256:a25d706cd2dc6099de6c2aea3bd09e729422296a9c4300ca23014c2fe37f76c0`
- summary: `sha256:16132e04e94a9dceda578d6b6bf3b1d983003a42048dcc5345cac2e45519a3ea`
- verification: `sha256:e892d5440542b7d6a233c3dafa166070be2327441515469b6d5729bdd0e61724`
- candidate decision:
  `sha256:c60932a9d78f445431f8b0ae99415832338d137c81ed428392ffae6cf13b7ea2`
- run receipt: `sha256:4e1e3af969c33eda8d9fe0103f9c8870b4f8e8e133861e8b620386db845178bf`

## Deferred candidates

- `microsoft/CUAVerifierBench` is a strong human-reviewed CUA source, but its
  complete trajectory objects exceed this wave's 256 MiB per-object ceiling;
  importing its small annotation metadata alone would add no trace bytes.
- `SALT-NLP/SWE-chat` is deferred because its distribution is gated/contact
  sharing and downstream records require per-repository license treatment.
- `microsoft/STATE-Bench` is MIT-licensed but its available learning
  trajectories are synthetic sandbox runs without matching manual root-cause
  labels or real economic consequence, so it was lower priority than AgentRx.
- `CUADebug/CUAErrorBench` is deferred because no official, revision-pinned data
  release with a verified data license was found. Public mention is not treated
  as permission.

## Reproduction

```sh
node scripts/acquire-stage15-public-agent-wave4.mjs \
  --output artifacts/public-agent-wave4-20260821/source/agentrx-tau

node scripts/stage15-public-agent-wave4.mjs \
  --source-dir artifacts/public-agent-wave4-20260821/source/agentrx-tau \
  --output-dir artifacts/public-agent-wave4-20260821/final-v2
```

Registry ingestion and independent source replay use:

```sh
node scripts/stage1-curate-corpus-registry.mjs \
  ingest-public-agent-wave4-failure-traces \
  --dir <registry> --signing-key <private.pem> --source-root <wave4-source>

node scripts/stage1-curate-corpus-registry.mjs \
  verify-wave4-failure-trace-source \
  --dir <registry> --source-root <wave4-source>
```
