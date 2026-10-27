/* A consumer can use the delivered software without a model, Outsider Node or
 * any provider/owner credential. Uses a NEW input, not the formation fixture. */
import { createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { writePrivateExecutionRecordOnce as writeOnce } from "../src/outsider-user-held-durable-execution-v2.js";
const [inputUrl, outputDirectory] = process.argv.slice(2), url = new URL(inputUrl);
if (url.protocol !== "https:" || !/^outsider-app-[a-f0-9]{32}\.outsider-guard\.workers\.dev$/u.test(url.hostname)
  || !path.isAbsolute(outputDirectory ?? "")) throw new Error("SOFTWARE_CONSUMER_TARGET_INVALID");
const body = { steps: [{ id: "a", minutes: 7, dependsOn: [] }, { id: "b", minutes: 4, dependsOn: [] },
  { id: "handoff", minutes: 3, dependsOn: ["a", "b"] }] };
const started = Date.now();
const response = await fetch(new URL("/plan", url), { method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify(body), redirect: "error", signal: AbortSignal.timeout(15000) });
const bytes = Buffer.from(await response.arrayBuffer()), result = JSON.parse(bytes);
assert.equal(response.status, 200);
assert.deepEqual(result, { completionMinutes: 10, criticalPath: ["a", "handoff"], schedule: [
  { id: "a", start: 0, finish: 7 }, { id: "b", start: 0, finish: 4 }, { id: "handoff", start: 7, finish: 10 }] });
const evidence = { schema: "outsider/software-consumer/v1", observedAt: new Date().toISOString(), targetUrl: url.href,
  method: "POST", path: "/plan", request: body, result, responseBytes: bytes.length,
  responseHash: `sha256:${createHash("sha256").update(bytes).digest("hex")}`, elapsedMs: Date.now() - started,
  correctnessScope: "THIS_NEW_DECLARED_DEPENDENCY_COMPUTATION", modelCalls: 0, outsiderNodeCalls: 0,
  ownerCredentialsUsed: false, independentlyOperatedConsumer: false, source: "ENGINEERING_CONSUMER_CLIENT_OF_ACTUAL_REMOTE_SERVICE" };
mkdirSync(outputDirectory, { recursive: true, mode: 0o700 });
writeOnce(path.join(outputDirectory, "consumer.json"), evidence);
console.log(JSON.stringify(evidence));
