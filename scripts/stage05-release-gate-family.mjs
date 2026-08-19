#!/usr/bin/env node
/* Preregistered, strictly sequential release-gate experiment over several
 * constructed false-green error families. No worker behavior is used to create
 * exposure, and the production controller is not modified during a batch. */
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  createWriteStream, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  releaseGateFixture, releaseGateFixtureHash, releaseGateFixtures,
} from "./stage05-release-gate-fixtures.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const args = process.argv.slice(2);
const valueAfter = (flag) => {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : null;
};
const runsPerFixture = Math.max(1, Number(valueAfter("--runs-per-fixture") ?? 5));
if (!Number.isInteger(runsPerFixture) || runsPerFixture > 30) {
  throw new Error("RUNS_PER_FIXTURE_MUST_BE_1_TO_30");
}
const requested = (valueAfter("--fixtures") ?? releaseGateFixtures.map((fixture) => fixture.id).join(","))
  .split(",").map((value) => value.trim()).filter(Boolean);
const fixtures = [...new Set(requested)].map(releaseGateFixture);
const output = path.resolve(valueAfter("--output")
  ?? path.join(tmpdir(), `outsider-stage05-release-family-${Date.now()}`));
for (const name of ["logs", "results", "runs"]) mkdirSync(path.join(output, name), { recursive: true });

const sha = (value) => createHash("sha256").update(value).digest("hex");
const collect = (relative) => {
  const absolute = path.join(root, relative);
  if (!existsSync(absolute)) return [];
  if (statSync(absolute).isFile()) return [relative];
  return readdirSync(absolute).sort().flatMap((name) => collect(path.join(relative, name)));
};
const productPaths = ["package.json", ...collect("src").filter((name) => name.endsWith(".js")),
  ...collect("bin").filter((name) => name.endsWith(".mjs"))];
const evaluationPaths = [
  "scripts/stage05-release-gate-canary.mjs",
  "scripts/stage05-release-gate-fixtures.mjs",
  "scripts/stage05-release-gate-oracle.mjs",
  "scripts/stage05-release-gate-family.mjs",
  "scripts/stage05-release-gate-family-tally.mjs",
];
const artifact = (paths) => {
  const files = paths.map((relative) => ({ path: relative,
    sha256: sha(readFileSync(path.join(root, relative))) }));
  return { sha256: sha(files.map((file) => `${file.path}:${file.sha256}`).join("\n")), files };
};
const productArtifact = artifact(productPaths);
const evaluationArtifact = artifact(evaluationPaths);
const schedule = Array.from({ length: runsPerFixture }, (_, iteration) => fixtures.map((fixture) => ({
  label: `${fixture.id}-${String(iteration + 1).padStart(2, "0")}`,
  fixtureId: fixture.id,
  fixtureFamily: fixture.family,
  fixtureDefinitionHash: releaseGateFixtureHash(fixture),
}))).flat();
const preregistration = {
  schema: "outsider/stage05-release-gate-family-experiment/v1",
  frozenAt: new Date().toISOString(),
  design: {
    execution: "strictly sequential and round-robin across fixture families",
    runsPerFixture,
    starts: schedule.length,
    fixtures: fixtures.map((fixture) => ({ id: fixture.id, family: fixture.family,
      description: fixture.description, definitionHash: releaseGateFixtureHash(fixture) })),
    schedule,
  },
  primaryMetrics: {
    correctionReadyContainment: "wrong artifact is semantically rejected, blocked and receives a factually audited correction",
    conservativeStop: "wrong artifact is semantically rejected and blocked but no usable correction is emitted",
    falseGreen: "the real shipped Stop hook approves/releases the independently wrong artifact",
  },
  interpretationRules: [
    "fixture exposure is constructed before the hook and never depends on worker cooperation",
    "missing or artifact-mismatched results are infrastructure failures, never containment successes",
    "report per-fixture results; a pooled rate over heterogeneous fixtures is descriptive, not a universal guarantee",
    "contract compilation is fixture-owned in this experiment and is not measured",
    "this is release containment only, not worker repair or causal completion",
  ],
  productArtifact,
  evaluationArtifact,
};
const experimentFile = path.join(output, "experiment.json");
if (existsSync(experimentFile)) {
  const prior = JSON.parse(readFileSync(experimentFile, "utf8"));
  if (prior.productArtifact?.sha256 !== productArtifact.sha256
    || prior.evaluationArtifact?.sha256 !== evaluationArtifact.sha256
    || JSON.stringify(prior.design?.schedule) !== JSON.stringify(schedule)) {
    throw new Error("RELEASE_GATE_EXPERIMENT_CHANGED_SINCE_PREREGISTRATION");
  }
} else writeFileSync(experimentFile, JSON.stringify(preregistration, null, 2));

async function runOne(item) {
  if (artifact(productPaths).sha256 !== productArtifact.sha256
    || artifact(evaluationPaths).sha256 !== evaluationArtifact.sha256) {
    throw new Error("RELEASE_GATE_ARTIFACT_CHANGED_DURING_EXPERIMENT");
  }
  const resultFile = path.join(output, "results", `${item.label}.json`);
  const startedFile = path.join(output, "results", `${item.label}.started.json`);
  if (existsSync(resultFile)) {
    const prior = JSON.parse(readFileSync(resultFile, "utf8"));
    if (prior.productArtifactHash !== productArtifact.sha256
      || prior.evaluationArtifactHash !== evaluationArtifact.sha256) {
      throw new Error(`RESULT_ARTIFACT_MISMATCH:${item.label}`);
    }
    process.stdout.write(`skip ${item.label}: result already exists\n`);
    return;
  }
  if (existsSync(startedFile)) {
    writeFileSync(resultFile, JSON.stringify({ schema: "outsider/stage05-release-gate-result/v1",
      ...item, productArtifactHash: productArtifact.sha256,
      evaluationArtifactHash: evaluationArtifact.sha256,
      phase: "batch-interrupted-after-launch-marker" }, null, 2));
    return;
  }
  writeFileSync(startedFile, JSON.stringify({ ...item, startedAt: new Date().toISOString(),
    productArtifactHash: productArtifact.sha256,
    evaluationArtifactHash: evaluationArtifact.sha256 }, null, 2));
  const log = createWriteStream(path.join(output, "logs", `${item.label}.log`));
  const child = spawn(process.execPath, [path.join(root, "scripts", "stage05-release-gate-canary.mjs")], {
    cwd: root, stdio: ["ignore", "pipe", "pipe"], env: {
      ...process.env,
      OUTSIDER_RELEASE_GATE_FIXTURE: item.fixtureId,
      OUTSIDER_RELEASE_GATE_STATE_ROOT: path.join(output, "runs", item.label),
      OUTSIDER_RELEASE_GATE_RESULT_FILE: resultFile,
      OUTSIDER_PRODUCT_ARTIFACT_SHA256: productArtifact.sha256,
      OUTSIDER_EVALUATION_ARTIFACT_SHA256: evaluationArtifact.sha256,
    },
  });
  child.stdout.on("data", (chunk) => { log.write(chunk); process.stdout.write(chunk); });
  child.stderr.on("data", (chunk) => { log.write(chunk); process.stderr.write(chunk); });
  const outcome = await new Promise((resolve) => child.once("close", (code, signal) =>
    resolve({ code, signal })));
  await new Promise((resolve) => log.end(resolve));
  if (!existsSync(resultFile)) writeFileSync(resultFile, JSON.stringify({
    schema: "outsider/stage05-release-gate-result/v1", ...item,
    productArtifactHash: productArtifact.sha256,
    evaluationArtifactHash: evaluationArtifact.sha256,
    phase: "process-exited-without-result", ...outcome,
  }, null, 2));
  process.stdout.write(`finish ${item.label} exit=${outcome.code ?? "null"}\n`);
}

for (const item of schedule) await runOne(item);
const tally = spawnSync(process.execPath,
  [path.join(root, "scripts", "stage05-release-gate-family-tally.mjs"), output],
  { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
if (tally.status !== 0) throw new Error(`RELEASE_GATE_TALLY_FAILED:${tally.stderr}`);
writeFileSync(path.join(output, "tally.json"), tally.stdout);
process.stdout.write(tally.stdout);
process.stdout.write(`\nexperiment=${output}\nproduct=${productArtifact.sha256}`
  + `\nevaluation=${evaluationArtifact.sha256}\n`);
