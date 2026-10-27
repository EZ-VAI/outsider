#!/usr/bin/env node
/* Capture existing, direct workers.dev measurements; never signed redirects. */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { canonicalizeStrict } from "../src/canonical.js";
const sha = value => `sha256:${createHash("sha256").update(value).digest("hex")}`;
const [runtime, output] = process.argv.slice(2);
if (!runtime || !output) throw new Error("RUNTIME_AND_NEW_PRIVATE_OUTPUT_REQUIRED");
if (existsSync(output)) throw new Error("SOURCE_OUTPUT_ALREADY_EXISTS");
mkdirSync(output, { recursive: true, mode: 0o700 });
const measurements = [];
function walk(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(file);
    else if (entry.name.endsWith(".globalping-redirect.jsonl")) {
      const events = readFileSync(file, "utf8").trim().split("\n").map(JSON.parse);
      const prepared = events.find(event => event.eventType === "PREPARED");
      if (prepared?.payload.maximumRedirects !== 0) continue;
      for (const event of events.filter(event => event.eventType === "HOP_MEASUREMENT_CREATED")) {
        measurements.push({ measurementId: event.payload.measurementId,
          targetHash: event.payload.targetHash, journalEventHash: event.eventHash,
          preparedAt: prepared.recordedAt });
      }
    }
  }
}
walk(path.join(runtime, "provider-state"));
const sources = [];
for (const measurement of measurements) {
  if (!/^[A-Za-z0-9_-]{6,160}$/u.test(measurement.measurementId)) throw new Error("MEASUREMENT_ID_INVALID");
  const response = await fetch(`https://api.globalping.io/v1/measurements/${measurement.measurementId}`,
    { headers: { accept: "application/json" }, signal: AbortSignal.timeout(15000) });
  const bytes = Buffer.from(await response.arrayBuffer());
  if (response.status !== 200 || bytes.length > 256 * 1024) throw new Error("SOURCE_READ_FAILED");
  const source = JSON.parse(bytes);
  if (source.id !== measurement.measurementId || source.type !== "http"
    || !/^[a-z0-9-]+\.[a-z0-9-]+\.workers\.dev$/u.test(source.target)
    || (source.measurementOptions?.request?.path ?? "/") !== "/"
    || sha(`outsider/globalping-target/v2\0${canonicalizeStrict(`https://${source.target}/`)}`)
      !== measurement.targetHash) throw new Error("DIRECT_SOURCE_BINDING_MISMATCH");
  const file = `${measurement.measurementId}.source.json`;
  writeFileSync(path.join(output, file), bytes, { mode: 0o600, flag: "wx" });
  sources.push({ ...measurement, file, byteLength: bytes.length, sourceHash: sha(bytes),
    capturedAt: new Date().toISOString(), sourceState: source.status,
    sourceCreatedAt: source.createdAt, resultStatuses: source.results?.map(x => x.result?.statusCode ?? null),
    observedBodyHashes: source.results?.map(x => typeof x.result?.rawBody === "string"
      ? sha(x.result.rawBody) : null) });
}
const manifest = { schema: "outsider/private-direct-preflight-source-capture/v1", sources,
  createdNewMeasurements: false, sourceEventsRewritten: false, signedRedirectSourcesStored: false };
writeFileSync(path.join(output, "manifest.json"), `${canonicalizeStrict(manifest)}\n`, { mode: 0o600, flag: "wx" });
process.stdout.write(`${canonicalizeStrict({ measurementCount: sources.length,
  sourceBytes: sources.reduce((n, source) => n + source.byteLength, 0),
  sourceStatuses: sources.map(source => source.resultStatuses),
  sourceHashes: sources.map(source => source.sourceHash) })}\n`);
