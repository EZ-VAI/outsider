# Outsider Cloudflare SparkFun Executor v1

This is a service-only deterministic executor for the frozen SparkFun/Magento
guest-cart route. It performs direct HTTPS requests at machine speed:

`catalog -> isolated cart -> full-address rates -> apply shipping -> totals`

It has no browser/model/manual path and contains no payment-information or
order endpoint. Provider acknowledgements remain private source occurrences;
they do not establish authority, capacity, delivery, or independent outcome.

## Private deployment binding

Compile one exact job with
`compileCloudflareSparkFunExecutorDeploymentV1`. Store both the canonical
registration and the private envelope as Worker secrets; neither belongs in
the checked-in Wrangler configuration:

```sh
npx wrangler secret put SPARKFUN_EXECUTOR_REGISTRATION_JSON \
  --config deploy/cloudflare-sparkfun-executor-v1/wrangler.jsonc
npx wrangler secret put SPARKFUN_PRIVATE_ENVELOPE_BASE64 \
  --config deploy/cloudflare-sparkfun-executor-v1/wrangler.jsonc
```

Never commit or print that value. It contains the exact canonical private
destination/contact envelope. The Worker checks its byte hash against the
hash-only Formation Job before any provider request. Exact request/response
bytes are chunked into the job-keyed Durable Object and have no read route.

## Formation Worker service binding

Deploy this service first, then add the following service binding to the
Formation Job Worker environment:

```json
{
  "binding": "DETERMINISTIC_EXECUTOR",
  "service": "outsider-cloudflare-sparkfun-executor-v1"
}
```

The Formation Worker allowlist must contain the compiler-returned exact
`{adapterId, adapterVersion, planHash}` triple. Do not broaden the allowlist.
The checked-in configuration intentionally contains no private envelope and is
not production-ready on its own.
