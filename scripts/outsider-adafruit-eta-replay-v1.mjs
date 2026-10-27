#!/usr/bin/env node
/* Read existing checkout, quote, and public policy files; append ETA planning. */
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync }
  from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { canonicalizeStrict } from "../src/canonical.js";
import { buildAdafruitEtaPlanningV1 } from "../src/outsider-adafruit-eta-planning-v1.js";
import { inspectAdafruitStep3ReceiptContextV9 }
  from "./outsider-adafruit-shipping-application-live-runner-v9.mjs";

export function replayAdafruitEtaPlanningV1(options) {
  const context = inspectAdafruitStep3ReceiptContextV9({
    priorV8RunDirectory: options.priorV8RunDirectory,
  });
  const result = buildAdafruitEtaPlanningV1({
    sourceRouteEvidence: JSON.parse(readFileSync(options.sourceRouteEvidenceFile, "utf8")),
    shippingSourceBytes: readFileSync(options.shippingSourceFile),
    step3SourceBytes: context.step3.bytes,
    step3Projection: context.projection,
    calendar: JSON.parse(readFileSync(options.calendarFile, "utf8")),
    plannedOrderAt: options.plannedOrderAt,
  });
  const output = path.resolve(options.outputDirectory);
  if (existsSync(output)) throw new TypeError("ADAFRUIT_ETA_OUTPUT_ALREADY_EXISTS");
  mkdirSync(output, { recursive: true, mode: 0o700 });
  chmodSync(output, 0o700);
  for (const [name, value] of [["eta-planning.v1.json", result.assessment],
    ["route-evidence.v1.json", result.routeEvidence]]) {
    const file = path.join(output, name);
    writeFileSync(file, `${canonicalizeStrict(value)}\n`, { mode: 0o600, flag: "wx" });
    chmodSync(file, 0o600);
  }
  return { outputDirectory: output, ...result };
}

function args(argv) {
  const fields = new Set(["prior-v8-run", "source-route-evidence", "shipping-source",
    "calendar-file", "planned-order-at", "output"]);
  const result = {};
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i]?.slice(2);
    if (!argv[i]?.startsWith("--") || !fields.has(key) || result[key]
      || !argv[i + 1] || argv[i + 1].startsWith("--")) {
      throw new TypeError("ADAFRUIT_ETA_ARGUMENT_INVALID");
    }
    result[key] = argv[i + 1];
  }
  if ([...fields].some(key => !result[key])) {
    throw new TypeError("ADAFRUIT_ETA_REQUIRED_ARGUMENT_MISSING");
  }
  return result;
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const input = args(process.argv.slice(2));
    const result = replayAdafruitEtaPlanningV1({
      priorV8RunDirectory: input["prior-v8-run"],
      sourceRouteEvidenceFile: input["source-route-evidence"],
      shippingSourceFile: input["shipping-source"], calendarFile: input["calendar-file"],
      plannedOrderAt: input["planned-order-at"], outputDirectory: input.output,
    });
    process.stdout.write(`${canonicalizeStrict({ outputDirectory: result.outputDirectory,
      assessmentHash: result.assessment.assessmentHash,
      nextAction: result.assessment.nextAction,
      selected: result.assessment.planningCandidates.find(candidate => candidate.selectedByProvider),
      alternatives: result.assessment.nextActionCandidates,
      routeEtaStatus: result.routeEvidence.facts.eta.status,
      networkRequestCount: 0 })}\n`);
  } catch (error) {
    process.stderr.write(`${String(error?.message ?? error)}\n`);
    process.exitCode = 1;
  }
}
