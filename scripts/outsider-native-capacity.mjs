#!/usr/bin/env node
import path from "node:path";
import { runNativeCapacityProductionAction, runNativeCapacityCycle } from "../src/outsider-native-capacity-production.js";

const args = process.argv.slice(2);
const usage = "node scripts/outsider-native-capacity.mjs <discover|reserve|reconcile|read|release|cycle> --profile <private-json> --resource <id> --directory <private-task-dir> [--context <private-operation-json>] [--start <UTC>] [--end <UTC>] [--slot-duration <minutes>]";
if (args.length === 0 || args.includes("--help")) {
  console.log(usage); process.exitCode = 0;
} else {
  try {
    const [action, ...flags] = args; const values = {};
    for (let i = 0; i < flags.length; i += 2) {
      const key = flags[i]; const value = flags[i + 1];
      if (!["--profile", "--resource", "--directory", "--context", "--start", "--end", "--slot-duration"].includes(key)
        || !value || value.startsWith("--") || Object.hasOwn(values, key)) throw Object.assign(new Error(), { outsiderCode: "CLI_ARGUMENT_INVALID" });
      values[key] = value;
    }
    if (!values["--profile"] || !values["--resource"] || !values["--directory"]) throw Object.assign(new Error(), { outsiderCode: "CLI_REQUIRED_ARGUMENT_MISSING" });
    const result = await (action === "cycle" ? runNativeCapacityCycle : runNativeCapacityProductionAction)({ action,
      profileFile: path.resolve(values["--profile"]), resourceId: values["--resource"],
      directory: path.resolve(values["--directory"]),
      ...(values["--context"] ? { contextFile: path.resolve(values["--context"]) } : {}),
      start: values["--start"] ?? null, end: values["--end"] ?? null,
      slotDuration: values["--slot-duration"] ? Number(values["--slot-duration"]) : undefined });
    console.log(JSON.stringify(result));
    process.exitCode = result.status === "BLOCKED" ? 2 : 0;
  } catch (error) {
    console.log(JSON.stringify({ status: "BLOCKED", code: error.outsiderCode ?? "PRIVATE_CONFIG_OR_PROVIDER_OPERATION_ERROR",
      externalCapacityEstablished: false, paymentPerformed: false }));
    process.exitCode = 2;
  }
}
