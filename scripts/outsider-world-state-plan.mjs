#!/usr/bin/env node
// A stable data-driven entry point. This command plans/compiles; it does not
// contact suppliers, actuate equipment, or manufacture a capacity grant.
import { existsSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { canonicalizeStrict } from "../src/canonical.js";
import { planWorldStateResources } from "../src/outsider-world-state-resource-planner.js";
import { compileWorldStateResourcePlan, compileWorldStateResourcePlanWithPreconditions }
  from "../src/outsider-world-state-program-compiler.js";
import { createWorldStateResourceNetworkExample } from "../examples/world-state-resource-network.mjs";
import { createWorldStateGoalCompiler, validateWorldStateGoalInterpretation }
  from "../src/outsider-world-state-goal-compiler.js";
import { createWorldStateGoalCommandInterpreter } from "../src/outsider-world-state-goal-model.js";
import { createProductionOutcomeRunnerV1 } from "../src/outsider-production-outcome-runner-v1.js";
import { runObservationCapabilityCatalog } from "./outsider-observation-capability-catalog.mjs";

const hash = value => `sha256:${createHash("sha256").update(canonicalizeStrict(value)).digest("hex")}`;
function privateJson(file) {
  const stat = lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o777) !== 0o600
    || stat.size < 2 || stat.size > 1024 * 1024) throw new Error("WORLD_STATE_PRIVATE_INPUT_REQUIRED");
  return JSON.parse(readFileSync(file, "utf8"));
}
function writeOnce(file, value) {
  writeFileSync(file, `${canonicalizeStrict(value)}\n`, { flag: "wx", mode: 0o600 });
}

/** Goal mode deliberately stops at the existing runner's private proposal.
 * No confirmation, procurement or provider execution is exposed here.
 */
export async function runWorldStateGoalCli(argv, dependencies = {}) {
  const args = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    if (!["--goal-input", "--catalog", "--discover-observations", "--opcua-dependencies",
      "--model-command", "--runtime", "--output"].includes(argv[index])
      || !argv[index + 1] || argv[index + 1].startsWith("--") || args.has(argv[index])) {
      throw new Error("WORLD_STATE_GOAL_ARGUMENT_INVALID");
    }
    args.set(argv[index], argv[index + 1]);
  }
  if (["--goal-input", "--runtime", "--output"].some(key => !args.has(key))
    || args.has("--catalog") === args.has("--discover-observations")
    || args.has("--opcua-dependencies") && !args.has("--discover-observations")
    || !dependencies.interpretGoal && !args.has("--model-command")) throw new Error("WORLD_STATE_GOAL_ARGUMENT_REQUIRED");
  if (existsSync(args.get("--output"))) throw new Error("WORLD_STATE_OUTPUT_ALREADY_EXISTS");
  const request = privateJson(args.get("--goal-input"));
  let catalogFile = args.get("--catalog"), discoveryPerformed = false;
  if (args.has("--discover-observations")) {
    catalogFile = path.join(path.resolve(args.get("--discover-observations")), "catalog.json");
    if (!existsSync(catalogFile)) {
      await (dependencies.discoverCatalog ?? runObservationCapabilityCatalog)({
        directory: args.get("--discover-observations"),
        ...(args.has("--opcua-dependencies")
          ? { opcuaDependencyDirectory: args.get("--opcua-dependencies") } : {}),
      });
      discoveryPerformed = true;
    }
  }
  const catalog = privateJson(catalogFile);
  const command = args.has("--model-command") ? privateJson(args.get("--model-command")) : null;
  const interpretGoal = dependencies.interpretGoal ?? createWorldStateGoalCommandInterpreter({
    command: command.argv, timeoutMs: command.timeoutMs ?? 60_000,
    validateResponse: validateWorldStateGoalInterpretation,
  });
  const clock = dependencies.clock ?? (() => new Date().toISOString());
  const compiler = createWorldStateGoalCompiler({ catalog, interpretGoal, clock });
  const runtimeDirectory = path.resolve(args.get("--runtime"));
  mkdirSync(runtimeDirectory, { recursive: true, mode: 0o700 });
  if ((lstatSync(runtimeDirectory).mode & 0o777) !== 0o700) throw new Error("WORLD_STATE_RUNTIME_NOT_PRIVATE");
  const recordDirectory = path.join(runtimeDirectory, "goal-compilations");
  mkdirSync(recordDirectory, { mode: 0o700, recursive: true });
  const requestBindingHash = hash({ requestId: request.requestId, goal: request.goal,
    completionDeadline: request.completionDeadline, budget: request.budget, context: request.context ?? {} });
  const recordFile = path.join(recordDirectory, `${hash(request.requestId).slice(7)}.json`);
  let saved = existsSync(recordFile) ? privateJson(recordFile) : null;
  if (saved && (saved.requestBindingHash !== requestBindingHash
    || saved.catalogHash !== compiler.catalogProjection.catalogHash)) throw new Error("WORLD_STATE_GOAL_REPLAY_MISMATCH");
  let modelInvocations = 0;
  const runner = createProductionOutcomeRunnerV1({ directory: runtimeDirectory,
    composition: { adapters: {} }, clock,
    async compileGoal(normalizedRequest) {
      if (saved?.compilation) return saved.compilation.program;
      modelInvocations += 1;
      try { return await compiler.compileGoal(normalizedRequest); }
      finally {
        const record = compiler.inspectCompilation(normalizedRequest.requestId);
        if (record) {
          saved = { ...record, requestBindingHash };
          // Record interpretation before the runtime persists its proposal:
          // interrupted local proposal persistence need not call the model again.
          writeOnce(recordFile, saved);
        }
      }
    },
  });
  let proposal = null;
  if (!saved || saved.status === "PROPOSED") {
    try { proposal = await runner.requestOutcome(request); }
    catch (error) {
      if (!["GOAL_NEEDS_INFORMATION", "GOAL_UNSUPPORTED"].includes(error.code)) throw error;
    }
  }
  const status = saved?.status ?? "NOT_COMPILED";
  const result = { schema: "outsider/private-world-state-goal-proposal/v1",
    status, proposal, compilationRecord: saved,
    nextAction: status === "NEEDS_INFORMATION" ? "PROVIDE_MISSING_FACTS"
      : status === "UNSUPPORTED" ? "NO_MATCHING_CAPABILITY"
        : "FORM_AND_VERIFY_RESOURCE_ROUTES",
    executionReadiness: catalog.executionReadiness,
    modelInvocations, discoveryPerformed, providerEffectsPerformed: 0, executionAuthorized: false,
    paymentAuthorized: false, guaranteeCreated: false };
  writeOnce(args.get("--output"), result);
  return { status, programHash: proposal?.programHash ?? null,
    proposalId: proposal?.proposalId ?? null,
    selectedTargetIds: saved?.semanticTargetIds ?? [],
    catalogHash: compiler.catalogProjection.catalogHash,
    sourceReferenceCount: catalog.sourceReferences.length,
    executionReady: catalog.executionReadiness.ready,
    nextAction: result.nextAction, modelInvocations, discoveryPerformed, providerEffectsPerformed: 0,
    output: args.get("--output") };
}

export function runWorldStatePlanCli(argv) {
  if (argv.includes("--help")) return {
    help: "Usage: node scripts/outsider-world-state-plan.mjs (--input INPUT.json | --example) --output NEW_OUTPUT.json [--compile [--compile-preconditions]]\nGoal mode: --goal-input PRIVATE_REQUEST.json (--catalog PRIVATE_CATALOG.json | --discover-observations NEW_PRIVATE_DIRECTORY [--opcua-dependencies DIRECTORY]) --model-command PRIVATE_ARGV.json --runtime PRIVATE_DIRECTORY --output NEW_PRIVATE_OUTPUT.json\nWithout --compile: INPUT is a planning input. With --compile: INPUT contains planningInput, optional planId, programInput and actionBindings. --compile-preconditions requires explicit preconditionObservation and action preconditionObserverRequirementId bindings; it does not grant observation authority. Goal mode calls one configured interpreter and creates an existing-runtime proposal only; no supplier execution or confirmation. --discover-observations makes explicit read-only native discovery calls. --example uses fictional resources, costs and durations, never a real work order. Output is local 0600.",
  };
  const args = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (["--compile", "--compile-preconditions", "--example"].includes(key)) {
      if (args.has(key)) throw new TypeError("OUTSIDER_WORLD_STATE_CLI_ARGUMENT_INVALID");
      args.set(key, true); continue;
    }
    if (!["--input", "--output"].includes(key) || !argv[index + 1]
      || argv[index + 1].startsWith("--") || args.has(key)) {
      throw new TypeError("OUTSIDER_WORLD_STATE_CLI_ARGUMENT_INVALID");
    }
    args.set(key, argv[++index]);
  }
  if (args.has("--input") === args.has("--example") || !args.has("--output")) {
    throw new TypeError("OUTSIDER_WORLD_STATE_CLI_INPUT_OUTPUT_REQUIRED");
  }
  if (args.has("--compile-preconditions") && (!args.has("--compile") || args.has("--example"))) {
    throw new TypeError("OUTSIDER_WORLD_STATE_CLI_PRECONDITION_INPUT_REQUIRED");
  }
  const example = args.has("--example") ? createWorldStateResourceNetworkExample() : null;
  const input = example
    ? args.get("--compile") ? example : example.planningInput
    : JSON.parse(readFileSync(args.get("--input"), "utf8"));
  const output = args.get("--compile")
    ? (args.has("--compile-preconditions") ? compileWorldStateResourcePlanWithPreconditions
      : compileWorldStateResourcePlan)(input) : planWorldStateResources(input);
  writeFileSync(args.get("--output"), `${canonicalizeStrict(output)}\n`,
    { flag: "wx", mode: 0o600 });
  const planning = output.planningResult ?? output;
  return {
    status: planning.status, alternativePlans: planning.plans.length,
    planningHash: planning.planningHash,
    programHash: output.program?.programHash ?? null,
    output: args.get("--output"), syntheticExample: example !== null,
    externalEffectsPerformed: 0,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const argv = process.argv.slice(2);
    const result = argv.includes("--goal-input")
      ? await runWorldStateGoalCli(argv) : runWorldStatePlanCli(argv);
    process.stdout.write(`${result.help ?? JSON.stringify(result)}\n`);
  } catch (error) {
    process.stderr.write(`${process.argv.includes("--goal-input")
      ? error.code ?? "WORLD_STATE_GOAL_COMPILATION_FAILED" : error.message}\n`);
    process.exitCode = 1;
  }
}
