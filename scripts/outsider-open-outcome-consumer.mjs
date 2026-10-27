/* Follow a delivered public resource directory to the actual executable
 * service, without a model, product Node, or supplier-account credential. */
import { mkdirSync } from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { publicDatasetHash as digest } from "../src/outsider-public-dataset.js";
import { readPrivateExecutionBytes, writePrivateExecutionRecordOnce as writeOnce } from "../src/outsider-user-held-durable-execution-v2.js";
const [resultFile, directory] = process.argv.slice(2);
if (![resultFile, directory].every(p => path.isAbsolute(p ?? ""))) throw new Error("OPEN_CONSUMER_PATH_REQUIRED");
const result = JSON.parse(readPrivateExecutionBytes(resultFile)).session.actualDelivery;
assert.equal(result.state, "SUCCEEDED");
const deliveries = Object.values(result.deliveries), software = deliveries.find(row => row.executionMode), data = deliveries.find(row => row.recordsHash);
if (!software || !data || Date.now() >= Date.parse(data.availableUntil)) throw new Error("OPEN_CONSUMER_DELIVERY_UNAVAILABLE");
const started = Date.now();
const response = await fetch(data.primaryUrl, { redirect: "error", signal: AbortSignal.timeout(10000) });
assert.equal(response.status, 200);
const records = await response.json(); assert.equal(digest(records), data.recordsHash);
const values = Object.fromEntries(records.map(row => [row.id, row.value]));
assert.equal(values.primary_url, software.primaryUrl); assert.equal(values.alternate_url, software.alternateUrl);
assert.equal(values.source_url, software.portableCopyUrl);
const target = new URL(values.primary_url);
assert.match(target.hostname, /^outsider-app-[a-f0-9]{32}\.outsider-guard\.workers\.dev$/u);
assert.equal(target.protocol, "https:");
const body = { steps: [{ id: "work", minutes: 11, dependsOn: [] }, { id: "prepare", minutes: 6, dependsOn: [] },
  { id: "deliver", minutes: 2, dependsOn: ["work", "prepare"] }] };
const computed = await fetch(new URL("/plan", target), { method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify(body), redirect: "error", signal: AbortSignal.timeout(10000) });
assert.equal(computed.status, 200); const value = await computed.json();
assert.deepEqual(value, { completionMinutes: 13, criticalPath: ["work", "deliver"], schedule: [
  { id: "work", start: 0, finish: 11 }, { id: "prepare", start: 0, finish: 6 }, { id: "deliver", start: 11, finish: 13 }] });
const evidence = { schema: "outsider/open-outcome-consumer/v1", observedAt: new Date().toISOString(),
  directoryUrl: data.primaryUrl, records, serviceDiscoveredFromDeliveredDirectory: true, targetUrl: target.href,
  request: body, response: value, responseHash: digest(value), elapsedMs: Date.now() - started,
  modelCalls: 0, outsiderNodeCalls: 0, ownerCredentialsUsed: false,
  independentlyOperatedConsumer: false, scope: "ENGINEERING_USE_OF_DELIVERED_REMOTE_RESOURCES" };
mkdirSync(directory, { recursive: true, mode: 0o700 }); writeOnce(path.join(directory, "consumer.json"), evidence);
console.log(JSON.stringify(evidence));
