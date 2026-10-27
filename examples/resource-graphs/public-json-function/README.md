# Public computation delivery

This example is a **software delivery request**, not a real seller quote, capacity reservation, purchase, or financial commitment. It compares prices, ETA and capacity supplied by the caller. Its JavaScript and SQL implementations are explicit; passing the frozen examples is not a proof of equivalence on arbitrary inputs.

In the connected Outsider workbench, attach `offer-pair-solver.json` under “公开软件或计算附件”, and ask Outsider to deliver that public computation as a live service with a different-provider alternate, exact source copy and external acceptance. Review the formed proposal, then confirm once. This uses the original open-goal → resource graph → OutcomeProgram path. Do not enter provider URLs, write a DAG, create merchant accounts, or paste provider credentials.

After a successful delivery, use “直接使用已交付的计算服务” and paste `new-input.json`. The expected result is `FEASIBLE`, primary `zeta`, alternate `epsilon`, total `3150` minor units, ETA `45` minutes. These are computed from the hypothetical input, **not market facts**.

Alternatively, download the delivery descriptor from the workbench and use it independently:

```sh
node scripts/outsider-json-function-consumer.mjs /absolute/path/delivery.json examples/resource-graphs/public-json-function/new-input.json
```

The consumer calls the delivered Cloudflare endpoint. If that transport is unavailable, it obtains public guest access to the delivered Neon project and calls its SQL implementation. It does not call a model, compute the result locally, allocate resources or use an owner credential. This repeatable operation is limited to the declared public computation contract; **do not use this retry client for purchases, reservations or other mutations**.

The descriptor has an explicit expiration. A past successful task is a historical delivery record, not proof that its temporary endpoints remain available. General Node servers, private inputs, production SLAs, automatic generation of the two implementations, and public multiuser onboarding are not supplied by this example.
