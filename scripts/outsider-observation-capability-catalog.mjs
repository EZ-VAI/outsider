#!/usr/bin/env node
// Native read-only capability discovery. Outputs a proposal catalog, not a
// completed future report. No reservation, invitation, device actuation or pay.
import { createHash, randomBytes } from "node:crypto";
import { chmodSync, mkdirSync, writeFileSync, readdirSync, readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { acquireObservationCapabilityCatalog } from "../src/outsider-observation-capability-catalog.js";
import { createNodeOpcUaReadTransport } from "../src/outsider-opcua-resource-node.js";

const digest = bytes => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;

/** Product-callable acquisition; importing this module performs no operation. */
export async function runObservationCapabilityCatalog(input = {}, deps = {}) {
  if (typeof input.directory !== "string" || !input.directory
    || input.opcuaDependencyDirectory !== undefined
      && (typeof input.opcuaDependencyDirectory !== "string" || !input.opcuaDependencyDirectory)) {
    throw new TypeError("OUTSIDER_OBSERVATION_CATALOG_RUN_INPUT_INVALID");
  }
  const clock = deps.clock ?? (() => new Date().toISOString());
  const directory = path.resolve(input.directory);
  mkdirSync(directory, { recursive: false, mode: 0o700 });
  const start = new Date(Date.parse(clock()) + 3 * 86_400_000); start.setUTCHours(0, 0, 0, 0);
  const config = { directory, clock, ...(deps.fetchImpl ? { fetchImpl: deps.fetchImpl } : {}),
    calcom: { eventTypeId: 6, start: start.toISOString(),
      end: new Date(start.getTime() + 7 * 86_400_000).toISOString(), timeZone: "UTC" } };
  if (input.opcuaDependencyDirectory) {
    const require = createRequire(path.join(path.resolve(input.opcuaDependencyDirectory), "package.json"));
    config.opcua = { endpointUrl: "opc.tcp://opcua.demo-this.com:51210/UA/SampleServer",
      officialSourceUrl: "https://www.opclabs.com/forum/quickopc-net/1863-browsing-your-public-server",
      nodeIds: ["i=2258", "i=2261"],
      transport: createNodeOpcUaReadTransport({ opcua: require("node-opcua"),
        pkiDirectory: path.join(directory, "pki"), allowUnsecuredDemo: true,
        clientOptions: { endpointMustExist: false } }),
    };
  }
  // Avoid changing the caller's process-global umask. The root is private
  // from creation; normalize optional native-client PKI files before return.
  const protect = root => {
    chmodSync(root, 0o700);
    for (const name of readdirSync(root)) {
      const file = path.join(root, name);
      if (statSync(file).isDirectory()) protect(file); else chmodSync(file, 0o600);
    }
  };
  let result;
  try { result = await acquireObservationCapabilityCatalog(config); }
  finally { protect(directory); }
  const store = (name, value) => {
    const bytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
    writeFileSync(path.join(directory, name), bytes, { mode: 0o600, flag: "wx" });
    return { name, bytes: bytes.length, sourceHash: digest(bytes) };
  };
  const catalogReceipt = store("catalog.json", result.catalog);
  const inventory = root => readdirSync(root).flatMap(name => {
    const file = path.join(root, name), stat = statSync(file);
    return stat.isDirectory() ? inventory(file) : [{ path: path.relative(directory, file),
      bytes: stat.size, sourceHash: digest(readFileSync(file)), mode: (stat.mode & 0o777).toString(8) }];
  });
  const manifest = store("acquisition.json", { ...result.acquisition, catalog: catalogReceipt,
    runNonce: randomBytes(8).toString("hex"), sourceFiles: inventory(directory) });
  const summary = { directory, catalog: catalogReceipt, manifest,
    targetIds: result.catalog.semanticTargets.map(item => item.targetId),
    acquisition: result.acquisition, executionReadiness: result.catalog.executionReadiness };
  return { catalog: result.catalog, acquisition: result.acquisition,
    catalogFile: path.join(directory, "catalog.json"), summary };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.length !== 2 && args.length !== 4 || args[0] !== "--output"
    || args.length === 4 && args[2] !== "--opcua-dependencies") {
    throw new Error("Usage: node scripts/outsider-observation-capability-catalog.mjs --output NEW_PRIVATE_DIRECTORY [--opcua-dependencies DEPENDENCY_DIRECTORY]");
  }
  process.umask(0o077);
  const result = await runObservationCapabilityCatalog({ directory: args[1],
    ...(args.length === 4 ? { opcuaDependencyDirectory: args[3] } : {}) });
  console.log(JSON.stringify(result.summary, null, 2));
}
