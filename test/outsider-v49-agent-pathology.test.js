import assert from "node:assert/strict";
import test from "node:test";

import {
  PATHOLOGY_BASE_RATES_V49,
  agentProcessFactsV49,
  flagPathologiesV49,
  processReportCardV49,
} from "../src/v49-agent-pathology.js";
import { assessHookWaste } from "../src/outsider-hook-waste.js";

test("unreplayable v49 corpus constants are quarantined from product findings", () => {
  assert.equal(PATHOLOGY_BASE_RATES_V49.status,
    "QUARANTINED_UNREPLAYABLE_LEGACY_REFERENCE");
  assert.equal(PATHOLOGY_BASE_RATES_V49.sourceReplayEstablished, false);
  assert.equal(PATHOLOGY_BASE_RATES_V49.decisionUseEligible, false);
  assert.equal(PATHOLOGY_BASE_RATES_V49.corpusRuns, null);
  assert.equal(PATHOLOGY_BASE_RATES_V49.emptySubmission.failRate, null);

  const facts = agentProcessFactsV49({ steps: [
    { verb: "read", exit: 1 },
    { verb: "submit", exit: 0, isSubmit: true },
  ], submissionBytes: 0, costUsd: 9 }, { peerCostMedianUsd: 1 });
  const flags = flagPathologiesV49(facts);
  assert(flags.length > 0);
  assert(flags.every((flag) => flag.corpusBaseRate === null
    || flag.corpusBaseRate === undefined));
  assert.doesNotMatch(JSON.stringify(flags), /22871|0\.99|73\.7|far more often/i);

  const card = processReportCardV49({ steps: [], submissionBytes: 0 });
  assert.equal(card.referenceBoundary, "QUARANTINED_UNREPLAYABLE_LEGACY_REFERENCE");
  assert.match(card.disclaimer, /no replayable corpus base rate/);
});

test("the live hook cites only the operator's frozen acceptance command", () => {
  const steps = [
    { action: "read a", isTest: false },
    { action: "edit a", isTest: false },
    { action: "read b", isTest: false },
  ];
  const proposed = { isSubmit: true };
  const withoutContract = assessHookWaste({ steps, proposed });
  assert.equal(withoutContract.findings.some((item) =>
    item.kind === "never-ran-a-test"), false);

  const withContract = assessHookWaste({ steps, proposed,
    acceptanceCommand: "node --test" });
  const finding = withContract.findings.find((item) => item.kind === "never-ran-a-test");
  assert(finding);
  assert.match(finding.corrective, /frozen acceptance command \(node --test\)/);
  assert.doesNotMatch(finding.corrective, /base rate|far more often|corpus/i);
});
