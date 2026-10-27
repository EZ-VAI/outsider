#!/usr/bin/env node
import path from "node:path";
import { pathToFileURL } from "node:url";
import { startNativeCapacityOnboarding }
  from "../src/outsider-native-capacity-onboarding.js";
import { readPrivateExecutionBytes } from "../src/outsider-user-held-durable-execution-v2.js";
const read = file => JSON.parse(readPrivateExecutionBytes(file));
export async function runNativeCapacityOnboardingCli(argv, dependencies = {}) {
  const [flag, requestFile] = argv;
  if (flag !== "--serve" || argv.length !== 2 || !path.isAbsolute(requestFile ?? "")) throw Object.assign(new Error("ARGUMENT_INVALID"), { code: "ARGUMENT_INVALID" });
  const request = read(requestFile);
  if (request.schema !== "outsider/native-capacity-onboarding-request/v1") throw Object.assign(new Error("REQUEST_INVALID"), { code: "REQUEST_INVALID" });
  const { schema, ...options } = request;
  const server = await startNativeCapacityOnboarding(options, dependencies);
  process.stdout.write(`${server.origin}${server.pathname}\n`);
  return server.captured;
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try { process.stdout.write(`${JSON.stringify(await runNativeCapacityOnboardingCli(process.argv.slice(2)))}\n`); }
  catch (error) { process.stderr.write(`${error?.code ?? "CAPACITY_ONBOARDING_FAILED"}\n`); process.exitCode = 1; }
}
