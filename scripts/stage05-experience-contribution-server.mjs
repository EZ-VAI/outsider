#!/usr/bin/env node

/* Reference ingress service for the Experience Contribution Gateway.
 * It is intentionally a quarantine edge, not a CURATE/PRICE service. */

import { generateKeyPairSync } from "node:crypto";
import { createServer } from "node:http";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  ExperienceContributionRegistry,
} from "../src/outsider-experience-contribution.js";

function parse(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith("--")) continue;
    const next = argv[index + 1];
    if (next == null || next.startsWith("--")) options[value.slice(2)] = true;
    else { options[value.slice(2)] = next; index += 1; }
  }
  return options;
}

function json(response, status, value) {
  const body = `${JSON.stringify(value, null, 2)}\n`;
  response.writeHead(status, { "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body), "cache-control": "no-store",
    "x-content-type-options": "nosniff" });
  response.end(body);
}

function body(request, maxBytes = 2 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    request.on("data", (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        reject(new Error("CONTRIBUTION_BODY_TOO_LARGE"));
        request.destroy();
      } else chunks.push(chunk);
    });
    request.on("end", () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8"))); }
      catch { reject(new Error("CONTRIBUTION_BODY_INVALID_JSON")); }
    });
    request.on("error", reject);
  });
}

function privateKeyFor(stateRoot, explicit, initialize) {
  const file = explicit ? path.resolve(explicit) : path.join(stateRoot, "server-private.pem");
  if (!existsSync(file)) {
    if (!initialize) throw new Error(`CONTRIBUTION_SERVER_KEY_MISSING:${file}:use --init`);
    mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
    const pair = generateKeyPairSync("ed25519", {
      publicKeyEncoding: { type: "spki", format: "pem" },
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
    });
    writeFileSync(file, pair.privateKey, { mode: 0o600 });
    writeFileSync(path.join(path.dirname(file), "server-public.pem"), pair.publicKey,
      { mode: 0o644 });
  }
  return readFileSync(file, "utf8");
}

const options = parse(process.argv.slice(2));
if (!options["state-root"] || !options.audience) {
  console.error("usage: node scripts/stage05-experience-contribution-server.mjs --state-root <dir> --audience <https-url> [--private-key <pem>] [--accepted-instrument-hashes <csv>] [--host 127.0.0.1] [--port 8787] [--init]");
  process.exitCode = 2;
} else {
  const stateRoot = path.resolve(options["state-root"]);
  const privateKeyPem = privateKeyFor(stateRoot, options["private-key"], options.init === true);
  const acceptedInstrumentHashes = String(options["accepted-instrument-hashes"] ?? "")
    .split(",").map((value) => value.trim()).filter(Boolean);
  const registry = new ExperienceContributionRegistry({ directory: stateRoot, privateKeyPem,
    audience: options.audience, acceptedInstrumentHashes });
  const host = options.host ?? "127.0.0.1";
  const port = Number(options.port ?? 8787);
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url, registry.audience);
      if (request.method === "GET" && url.pathname === "/v1/contributions/info") {
        json(response, 200, registry.serverInfo());
        return;
      }
      if (request.method === "POST" && url.pathname === "/v1/contributions/challenge") {
        const input = await body(request);
        json(response, 200, registry.issueChallenge({
          deviceKeyId: input.deviceKeyId,
          experienceRecordHash: input.experienceRecordHash,
        }));
        return;
      }
      if (request.method === "POST" && url.pathname === "/v1/contributions") {
        const envelope = await body(request);
        json(response, 200, registry.ingest(envelope));
        return;
      }
      json(response, 404, { ok: false, error: "CONTRIBUTION_ROUTE_NOT_FOUND" });
    } catch (error) {
      const code = String(error?.message ?? error).split(":", 1)[0];
      json(response, 400, { ok: false, error: code });
    }
  });
  server.listen(port, host, () => {
    console.log(JSON.stringify({ ok: true, mode: "QUARANTINE_ONLY_REFERENCE_INGRESS",
      host, port, stateRoot, server: registry.serverInfo() }, null, 2));
  });
}
