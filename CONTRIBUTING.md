# Contributing

Outsider's core invariant is simple: never turn missing evidence into a stronger
claim. Changes that affect supervision, proof, identity, contribution, or
release certification must preserve that fail-closed boundary.

## Before opening a pull request

```bash
npm ci
npm test
npm run test:corpus
npm run experience:deploy:cloudflare:dry
npm run demo:deploy:dry
```

Never commit real run directories, raw event streams, prompts, transcripts,
credentials, private keys, local paths, model account state, or generated
release archives. Tests must use synthetic fixtures or explicitly public,
privacy-projected evidence.

Pull requests should state the claim being changed, the evidence that supports
it, the new failure mode being tested, and whether older sealed artifacts remain
verifiable. New model judges must not receive execution authority or bypass a
deterministic audit.
