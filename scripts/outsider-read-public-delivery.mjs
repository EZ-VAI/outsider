/* Consumer-side machine client. Only a public delivery descriptor is needed:
 * no Outsider Node, model, founder account or owner credentials at read time. */
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { canonicalizeStrict } from "../src/canonical.js";
const [descriptorFile, route = "primary"] = process.argv.slice(2);
if (!descriptorFile || !["primary", "alternate"].includes(route)) throw new Error("PUBLIC_DELIVERY_ARGUMENT_INVALID");
const descriptor = JSON.parse(readFileSync(descriptorFile, "utf8"));
if (descriptor.schema !== "outsider/public-dataset-consumer-descriptor/v1" || Date.now() >= Date.parse(descriptor.availableUntil))
  throw new Error("PUBLIC_DELIVERY_DESCRIPTOR_INVALID_OR_EXPIRED");
const target = new URL(descriptor[`${route}Url`]);
const headers = { accept: "application/json" };
if (target.username || target.password || target.protocol !== "https:" || target.port || target.hash) throw new Error("PUBLIC_DELIVERY_TARGET_INVALID");
if (/^ep-[a-z0-9-]+\.apirest\.(?:c-[0-9]+\.)?[a-z0-9-]+\.aws\.neon\.tech$/u.test(target.hostname)
  && target.pathname === "/neondb/rest/v1/outsider_records" && target.search === "?select=id,value&order=id.asc") {
  const url = `https://${target.hostname.replace(".apirest.", ".neonauth.")}/neondb/auth/token/anonymous`;
  const response = await fetch(url, { headers, redirect: "error", signal: AbortSignal.timeout(15000) });
  const guest = await response.json();
  let claims; try { claims = JSON.parse(Buffer.from(guest.token.split(".")[1], "base64url")); } catch {}
  if (!response.ok || claims?.role !== "anonymous") throw new Error("PUBLIC_GUEST_TOKEN_UNAVAILABLE");
  headers.authorization = `Bearer ${guest.token}`;
} else if (!/^[a-z0-9-]+\.[a-z0-9-]+\.workers\.dev$/u.test(target.hostname) || target.pathname !== "/" || target.search)
  throw new Error("PUBLIC_DELIVERY_TARGET_UNSUPPORTED");
const began = Date.now(), response = await fetch(target, { headers, redirect: "error", signal: AbortSignal.timeout(15000) });
const bytes = Buffer.from(await response.arrayBuffer());
if (!response.ok || bytes.length > 16384) throw new Error("PUBLIC_DELIVERY_READ_UNAVAILABLE");
const records = JSON.parse(bytes), hash = `sha256:${createHash("sha256").update(canonicalizeStrict(records)).digest("hex")}`;
if (hash !== descriptor.recordsHash) throw new Error("PUBLIC_DELIVERY_CONTENT_CHANGED");
console.log(JSON.stringify({ route, provider: target.hostname.endsWith(".neon.tech") ? "neon" : "cloudflare",
  state: "READ_CONFIRMED", readMs: Date.now() - began, recordsHash: hash, records,
  outsiderNodeCalled: false, modelCalled: false, ownerCredentialsUsed: false }));
