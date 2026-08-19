#!/usr/bin/env node
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { buildRiskFactorShadowMeasurement,
  verifyRiskFactorShadowMeasurement } from "../src/outsider-risk-factor-shadow.js";

const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, item, index, all) => {
  if (item.startsWith("--")) pairs.push([item.slice(2), all[index + 1]]);
  return pairs;
}, []));
const input = path.resolve(args.input ?? ".outsider-supervised-experience-v2");
const output = path.resolve(args.output ?? "risk-factor-shadow-report.json");
const records = readdirSync(input).filter((name) => name.endsWith(".json")).sort()
  .map((name) => JSON.parse(readFileSync(path.join(input, name), "utf8")));
const report = buildRiskFactorShadowMeasurement(records);
const verified = verifyRiskFactorShadowMeasurement(report);
if (!verified.ok) throw new Error(verified.error);
mkdirSync(path.dirname(output), { recursive: true });
writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, { flag: "wx" });
process.stdout.write(`${JSON.stringify({ ok: true, output, reportHash: report.reportHash,
  accepted: report.corpus.accepted, uniqueCorrelationGroups: report.corpus.uniqueCorrelationGroups,
  measuredFactors: report.factorCoverage.measuredFactorIds.length,
  productionDecision: report.boundary.decision, financialEffect: report.boundary.financialEffect })}\n`);

