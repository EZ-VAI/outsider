import path from "node:path";
import { mkdirSync } from "node:fs";
import { createPublicHttpsReadOnlyFetchTransportV1 } from "../src/outsider-public-https-read-only-fetch-transport-v1.js";
import { writePrivateExecutionRecordOnce as writeOnce } from "../src/outsider-user-held-durable-execution-v2.js";
import { interfaceDigest } from "../src/outsider-openapi-demand-matcher.js";
const [url, directory, accept = "text/html"] = process.argv.slice(2);
if (!["text/html", "application/javascript", "application/json"].includes(accept)) throw new Error("BUYER_SOURCE_ACCEPT_INVALID");
if (!path.isAbsolute(directory ?? "")) throw new Error("BUYER_PAGE_DIRECTORY_INVALID");
mkdirSync(directory, { recursive: true, mode: 0o700 });
const transport = createPublicHttpsReadOnlyFetchTransportV1({ maximumResponseBytes: 2 * 1024 * 1024, timeoutMs: 10000 });
const response = await transport(url, { method: "GET", headers: { Accept: accept }, credentials: "omit", redirect: "error", signal: AbortSignal.timeout(11000) });
const bytes = Buffer.from(await response.arrayBuffer()), chunks = [];
for (let offset = 0; offset < bytes.length; offset += 384 * 1024) {
  const name = `page-${chunks.length}`; chunks.push(name); writeOnce(path.join(directory, `${name}.json`), { base64: bytes.subarray(offset, offset + 384 * 1024).toString("base64") });
}
const receipt = { url, status: response.status, sourceHash: interfaceDigest(bytes), bytes: bytes.length, chunks, observedAt: new Date().toISOString() };
writeOnce(path.join(directory, "page.json"), receipt); console.log(JSON.stringify(receipt));
