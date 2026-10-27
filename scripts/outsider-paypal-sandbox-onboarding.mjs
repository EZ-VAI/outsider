#!/usr/bin/env node
import path from "node:path";
import { pathToFileURL } from "node:url";
import { startPayPalSandboxOnboarding } from "../src/outsider-paypal-sandbox-onboarding.js";
import { readPrivateExecutionBytes } from "../src/outsider-user-held-durable-execution-v2.js";

const fail = code => { const error = new Error(code); error.code = code; throw error; };
export async function runPayPalSandboxOnboardingCli(argv, dependencies = {}) {
  if (argv.length !== 1 || !path.isAbsolute(argv[0] ?? "")) fail("PAYPAL_ONBOARDING_REQUEST_REQUIRED");
  let request;
  try { request = JSON.parse(readPrivateExecutionBytes(argv[0])); } catch { fail("PAYPAL_ONBOARDING_PRIVATE_REQUEST_REQUIRED"); }
  if (request?.schema !== "outsider/paypal-sandbox-onboarding-request/v1"
    || ![request.directory, request.resultFile, request.authorizationSourceFile].every(value => typeof value === "string" && path.isAbsolute(value)))
    fail("PAYPAL_ONBOARDING_REQUEST_INVALID");
  return startPayPalSandboxOnboarding({ directory: request.directory, resultFile: request.resultFile,
    authorizationSourceFile: request.authorizationSourceFile, port: request.port ?? 0 }, dependencies);
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const onboarding = await runPayPalSandboxOnboardingCli(process.argv.slice(2));
    process.stdout.write(`${JSON.stringify({ origin: onboarding.origin, pathname: onboarding.pathname,
      secretProjected: false, payoutSubmitted: false, realMoneyAuthorized: false })}\n`);
    process.stdout.write(`${JSON.stringify(await onboarding.captured)}\n`);
  } catch (error) {
    process.stderr.write(`${/^[A-Z0-9_]+$/u.test(error?.code ?? "") ? error.code : "PAYPAL_ONBOARDING_FAILED"}\n`);
    process.exitCode = 1;
  }
}
