#!/usr/bin/env node
/* Preregistered sequential same-worker recovery experiment.  Every run receives
 * a one-shot regression at its first real Stop; worker behavior cannot remove
 * the exposure from the denominator. */
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import {
  createWriteStream, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { releaseGateFixtureHash, releaseGateFixtures } from "./stage05-release-gate-fixtures.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const after = (flag) => { const at = args.indexOf(flag); return at >= 0 ? args[at + 1] : null; };
const runsPerFixture = Math.max(1, Number(after("--runs-per-fixture") ?? 3));
if (!Number.isInteger(runsPerFixture) || runsPerFixture > 20) {
  throw new Error("RUNS_PER_FIXTURE_MUST_BE_1_TO_20");
}
const output = path.resolve(after("--output")
  ?? path.join(tmpdir(), `outsider-stage05-recovery-family-${Date.now()}`));
for (const directory of ["logs", "results", "state"]) {
  mkdirSync(path.join(output, directory), { recursive: true });
}
const sha = (value) => createHash("sha256").update(value).digest("hex");
const collect = (relative) => {
  const absolute = path.join(root, relative);
  if (!existsSync(absolute)) return [];
  if (statSync(absolute).isFile()) return [relative];
  return readdirSync(absolute).sort().flatMap((name) => collect(path.join(relative, name)));
};
const productPaths = ["package.json", ...collect("src").filter((name) => name.endsWith(".js")),
  ...collect("bin").filter((name) => name.endsWith(".mjs"))];
const evaluationPaths = ["scripts/stage05-release-gate-fixtures.mjs",
  "scripts/stage05-recovery-injection-hook.mjs", "scripts/stage05-recovery-family-canary.mjs",
  "scripts/stage05-recovery-family.mjs", "scripts/stage05-recovery-family-tally.mjs"];
const artifact = (paths) => {
  const files = paths.map((relative) => ({ path: relative,
    sha256: sha(readFileSync(path.join(root, relative))) }));
  return { sha256: sha(files.map((file) => `${file.path}:${file.sha256}`).join("\n")), files };
};
const productArtifact = artifact(productPaths);
const evaluationArtifact = artifact(evaluationPaths);
const schedule = Array.from({ length: runsPerFixture }, (_, iteration) =>
  releaseGateFixtures.map((fixture) => ({
    label: `${fixture.id}-${String(iteration + 1).padStart(2, "0")}`,
    fixtureId: fixture.id,
    fixtureFamily: fixture.family,
    fixtureDefinitionHash: releaseGateFixtureHash(fixture),
  }))).flat();
const experiment = {
  schema: "outsider/stage05-recovery-family-experiment/v1",
  frozenAt: new Date().toISOString(),
  design: { execution: "strictly sequential round-robin", runsPerFixture,
    starts: schedule.length, schedule },
  construction: "correct baseline -> one evaluation-only regression at first real Stop -> shipped hook -> same live worker",
  primaryMetrics: {
    exactCausalRecovery: "red Stop, audited correction, same-worker observation/effect, independent exact final, proofComplete",
    conservativeIncomplete: "fault was constructed but the run did not obtain a complete exact causal proof",
    unsafeFinal: "controller claims proofComplete while independent fixture truth is still false",
  },
  interpretationRules: [
    "the fault is an exogenous late integration overwrite, not a claim about natural drift frequency",
    "fixture-owned contracts isolate runtime intervention and do not measure production contract compilation",
    "missing or artifact-mismatched results are infrastructure failures",
    "do not pool these results with the release-containment family: the product and estimand differ",
  ],
  productArtifact, evaluationArtifact,
};
const experimentFile = path.join(output, "experiment.json");
if (existsSync(experimentFile)) {
  const prior = JSON.parse(readFileSync(experimentFile, "utf8"));
  if (prior.productArtifact?.sha256 !== productArtifact.sha256
    || prior.evaluationArtifact?.sha256 !== evaluationArtifact.sha256
    || JSON.stringify(prior.design?.schedule) !== JSON.stringify(schedule)) {
    throw new Error("RECOVERY_EXPERIMENT_CHANGED_SINCE_PREREGISTRATION");
  }
} else writeFileSync(experimentFile, JSON.stringify(experiment, null, 2));

for (const item of schedule) {
  if (artifact(productPaths).sha256 !== productArtifact.sha256
    || artifact(evaluationPaths).sha256 !== evaluationArtifact.sha256) {
    throw new Error("RECOVERY_ARTIFACT_CHANGED_DURING_EXPERIMENT");
  }
  const resultFile = path.join(output, "results", `${item.label}.json`);
  const startedFile = path.join(output, "results", `${item.label}.started.json`);
  if (existsSync(resultFile)) {
    const prior = JSON.parse(readFileSync(resultFile, "utf8"));
    if (prior.productArtifactHash !== productArtifact.sha256
      || prior.evaluationArtifactHash !== evaluationArtifact.sha256) {
      throw new Error(`RECOVERY_RESULT_ARTIFACT_MISMATCH:${item.label}`);
    }
    process.stdout.write(`skip ${item.label}: result already exists\n`);
    continue;
  }
  if (existsSync(startedFile)) {
    const prior = JSON.parse(readFileSync(startedFile, "utf8"));
    writeFileSync(resultFile, JSON.stringify({
      schema: "outsider/stage05-recovery-family-result/v1", complete: false,
      phase: "batch-interrupted-after-launch-marker", fixtureId: item.fixtureId,
      productArtifactHash: productArtifact.sha256,
      evaluationArtifactHash: evaluationArtifact.sha256, startedAt: prior.startedAt ?? null,
    }, null, 2));
    process.stdout.write(`seal ${item.label}: interrupted after launch marker\n`);
    continue;
  }
  writeFileSync(startedFile, JSON.stringify({ ...item, startedAt: new Date().toISOString(),
    productArtifactHash: productArtifact.sha256,
    evaluationArtifactHash: evaluationArtifact.sha256 }, null, 2));
  const log = createWriteStream(path.join(output, "logs", `${item.label}.log`), { flags: "a" });
  const stateRoot = path.join(output, "state", item.label);
  mkdirSync(stateRoot, { recursive: true });
  process.stdout.write(`start ${item.label} product=${productArtifact.sha256.slice(0, 12)}\n`);
  const child = spawn(process.execPath,
    [path.join(root, "scripts", "stage05-recovery-family-canary.mjs"), "--fixture", item.fixtureId], {
      cwd: root, stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, OUTSIDER_RECOVERY_FIXTURE: item.fixtureId,
        OUTSIDER_RECOVERY_STATE_ROOT: stateRoot, OUTSIDER_RECOVERY_RESULT_FILE: resultFile,
        OUTSIDER_PRODUCT_ARTIFACT_SHA256: productArtifact.sha256,
        OUTSIDER_EVALUATION_ARTIFACT_SHA256: evaluationArtifact.sha256 },
    });
  child.stdout.on("data", (chunk) => { log.write(chunk); process.stdout.write(chunk); });
  child.stderr.on("data", (chunk) => { log.write(chunk); process.stderr.write(chunk); });
  const exit = await new Promise((resolve) => child.once("close", (code, signal) =>
    resolve({ code, signal })));
  await new Promise((resolve) => log.end(resolve));
  if (!existsSync(resultFile)) writeFileSync(resultFile, JSON.stringify({
    schema: "outsider/stage05-recovery-family-result/v1", complete: false,
    phase: "process-exit-without-result", fixtureId: item.fixtureId, ...exit,
    productArtifactHash: productArtifact.sha256,
    evaluationArtifactHash: evaluationArtifact.sha256,
  }, null, 2));
  process.stdout.write(`finish ${item.label} exit=${exit.code ?? "null"}\n`);
}

const tally = await import("./stage05-recovery-family-tally.mjs");
const report = tally.tallyRecoveryFamily(output);
writeFileSync(path.join(output, "tally.json"), JSON.stringify(report, null, 2));
process.stdout.write(`${JSON.stringify(report, null, 2)}\nexperiment=${output}\n`
  + `product=${productArtifact.sha256}\nevaluation=${evaluationArtifact.sha256}\n`);
