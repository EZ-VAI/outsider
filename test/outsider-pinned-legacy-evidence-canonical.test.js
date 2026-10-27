import assert from "node:assert/strict";
import test from "node:test";

import { canonicalizeStrict } from "../src/canonical.js";
import {
  canonicalizePinnedLegacyEvidence,
  PINNED_LEGACY_EVIDENCE_CANONICAL_LIMITS,
} from "../src/outsider-pinned-legacy-evidence-canonical.js";

test("pinned legacy evidence canonicalization preserves ordinary exact bytes",
  () => {
    const value = { z: [3, { beta: true, alpha: "x" }], a: null };
    assert.equal(canonicalizePinnedLegacyEvidence(value),
      canonicalizeStrict(value));
  });

test("the legacy compatibility lane does not widen ordinary canonical limits",
  () => {
    const historicalShape = Array.from({ length: 140_000 }, (_, index) =>
      index % 7);
    assert.throws(() => canonicalizeStrict(historicalShape),
      /canonical member budget exceeded/);
    const encoded = canonicalizePinnedLegacyEvidence(historicalShape);
    assert.equal(encoded.startsWith("["), true);
    assert.equal(encoded.endsWith("]"), true);
    assert.equal(JSON.parse(encoded).length, historicalShape.length);
  });

test("the legacy evidence exception remains explicitly bounded", () => {
  const overLimit = new Array(
    PINNED_LEGACY_EVIDENCE_CANONICAL_LIMITS.maximumMembers + 1);
  assert.throws(() => canonicalizePinnedLegacyEvidence(overLimit),
    /legacy evidence canonical member budget exceeded/);
});

test("proxy and ambiguous array semantics fail before caller code executes",
  () => {
    let trapCount = 0;
    const proxied = new Proxy([], {
      get() { trapCount += 1; return 0; },
      ownKeys() { trapCount += 1; return []; },
    });
    assert.throws(() => canonicalizePinnedLegacyEvidence(proxied),
      /proxies are unsupported/);
    assert.equal(trapCount, 0);

    const sparse = [];
    sparse.length = 2;
    sparse[1] = "present";
    assert.throws(() => canonicalizePinnedLegacyEvidence(sparse),
      /arrays must be dense/);
  });
