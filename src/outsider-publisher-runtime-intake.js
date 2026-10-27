/* Read-only bridge from a seller's observed buyer page to its own runtime
 * assets. No JavaScript is executed, guessed API called, or form submitted.
 * These are interface implementation sources, not offers or accepted terms.
 */
import { interfaceDigest } from "./outsider-openapi-demand-matcher.js";
import { createPublicHttpsReadOnlyFetchTransportV1 } from "./outsider-public-https-read-only-fetch-transport-v1.js";
export function discoverPublisherRuntimeAssets(url, bytes) {
  const page = new URL(url), assets = [];
  for (const match of bytes.toString("utf8").matchAll(/<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/giu)) {
    try {
      const asset = new URL(match[1].replaceAll("&amp;", "&"), page);
      if (asset.origin !== page.origin || asset.username || asset.password || asset.search || !asset.pathname.endsWith(".js")) continue;
      if (!assets.includes(asset.href)) assets.push(asset.href);
    } catch { /* Non-URL source. */ }
  }
  return assets;
}
export async function readPublisherRuntimeInterfaces({ receipt, bytes, writeRecord, maximumAssets = 8, assetOffset = 0,
  fetchImpl = createPublicHttpsReadOnlyFetchTransportV1({ maximumResponseBytes: 2 * 1024 * 1024, timeoutMs: 10000 }) }) {
  if (receipt.status !== 200 || interfaceDigest(bytes) !== receipt.sourceHash) throw new Error("RUNTIME_PARENT_RECEIPT_MISMATCH");
  if (!Number.isInteger(maximumAssets) || maximumAssets < 0 || maximumAssets > 12) throw new Error("RUNTIME_ASSET_BUDGET_INVALID");
  if (!Number.isInteger(assetOffset) || assetOffset < 0 || assetOffset > 100) throw new Error("RUNTIME_ASSET_OFFSET_INVALID");
  const assets = discoverPublisherRuntimeAssets(receipt.url, bytes);
  // Route chunks usually follow the framework/runtime chunks. Keep the budget
  // explicit; a partial source inspection is not a full dependency closure.
  const end = Math.max(0, assets.length - assetOffset), selected = assets.slice(Math.max(0, end - maximumAssets), end), started = Date.now();
  const rows = await Promise.all(selected.map(async (url, index) => {
    try {
      const response = await fetchImpl(url, { method: "GET", headers: { Accept: "application/javascript" },
        credentials: "omit", redirect: "error", signal: AbortSignal.timeout(11000) });
      const body = Buffer.from(await response.arrayBuffer());
      if (body.length > 2 * 1024 * 1024) throw new Error("RUNTIME_ASSET_TOO_LARGE");
      const chunks = [];
      for (let offset = 0; offset < body.length; offset += 384 * 1024) {
        const name = `runtime-${index}-chunk-${chunks.length}`; chunks.push(name);
        await writeRecord(name, { base64: body.subarray(offset, offset + 384 * 1024).toString("base64") });
      }
      const row = { url, status: response.status, bytes: body.length, sourceHash: interfaceDigest(body), chunks,
        observedAt: new Date().toISOString(), parentSourceHash: receipt.sourceHash };
      await writeRecord(`runtime-${index}`, row); return row;
    } catch { return { url, state: "ASSET_READ_FAILED", parentSourceHash: receipt.sourceHash }; }
  }));
  const result = { schema: "outsider/publisher-runtime-intake/v1", parentSourceHash: receipt.sourceHash,
    rows, deferredAssets: assets.filter(url => !selected.includes(url)),
    metrics: { readAttempts: rows.length, successfulReads: rows.filter(r => r.status === 200).length,
      responseBytes: rows.reduce((n, r) => n + (r.bytes ?? 0), 0), elapsedMs: Date.now() - started },
    implementationSourcesAreTransactionAuthority: false, apiInvocations: 0, paymentPerformed: false };
  await writeRecord("runtime-intake", result); return result;
}
