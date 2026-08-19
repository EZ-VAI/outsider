#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalizeStrict } from "../src/canonical.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "references", "deepseek-harness-compile-profile.json");
const prior = JSON.parse(readFileSync(out, "utf8"));
const sourcePin = JSON.parse(readFileSync(path.join(root,
  "references", "deepseek-harness-source-pin.json"), "utf8"));
const digest = (value) => `sha256:${createHash("sha256").update(value).digest("hex")}`;
const adapterPaths = [
  "integrations/deepseek-harness-outsider-plugin/index.ts",
  "integrations/deepseek-harness-outsider-plugin/index.js",
  "src/outsider-deepseek-harness-plugin-core.js",
  "src/outsider-deepseek-harness-gateway.js",
  "src/outsider-deepseek-harness-protocol.js",
  "src/outsider-deepseek-harness-adapter.js",
  "src/canonical.js",
];
const adapterClosure = adapterPaths.map((name) => ({ path: name,
  sha256: digest(readFileSync(path.join(root, name))) }));
const packages = {};
for (const [name, pinned] of Object.entries(prior.packages)) {
  const packageFile = fileURLToPath(import.meta.resolve(`${name}/package.json`));
  const packageJson = JSON.parse(readFileSync(packageFile, "utf8"));
  if (packageJson.version !== pinned.version) {
    throw new Error(`DEEPSEEK_RUNTIME_VERSION_MISMATCH:${name}:${packageJson.version}`);
  }
  const packageRoot = path.dirname(packageFile);
  const mainFile = path.resolve(packageRoot, packageJson.main);
  if (!existsSync(mainFile)) throw new Error(`DEEPSEEK_RUNTIME_MAIN_MISSING:${name}`);
  packages[name] = { version: pinned.version, integrity: pinned.integrity,
    packageJsonSha256: digest(readFileSync(packageFile)),
    main: path.relative(packageRoot, mainFile).replaceAll("\\", "/"),
    mainSha256: digest(readFileSync(mainFile)) };
}
const profile = {
  schema: "outsider/external-runtime-closure/v2",
  compiledAt: new Date().toISOString(),
  adapter: "integrations/deepseek-harness-outsider-plugin/index.ts",
  command: "tsc -p integrations/deepseek-harness-outsider-plugin/tsconfig.json",
  result: "PASS",
  typescript: "5.9.2",
  packages,
  adapterClosure,
  adapterClosureHash: digest(canonicalizeStrict(adapterClosure)),
  sourcePinHash: sourcePin.recordHash,
  sourceReviewCommit: sourcePin.commit.oid,
  sourceReviewPackageVersion: sourcePin.sourcePackageVersion,
  sourceBinaryEquivalence: "UNPROVEN",
  claimBoundary: "The official rc.5 source bytes and publicly installed rc.6 package bytes are independently content-addressed. rc.6 exposes no gitHead, so no source-to-binary equivalence is claimed.",
};
profile.runtimeClosureHash = digest(canonicalizeStrict({ packages: profile.packages,
  adapterClosureHash: profile.adapterClosureHash, sourcePinHash: profile.sourcePinHash }));
profile.recordHash = digest(canonicalizeStrict(profile));
writeFileSync(out, `${JSON.stringify(profile, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({ ok: true, out,
  runtimeClosureHash: profile.runtimeClosureHash, recordHash: profile.recordHash })}\n`);
