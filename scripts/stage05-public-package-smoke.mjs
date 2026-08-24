#!/usr/bin/env node

import { createHash } from "node:crypto";
import { lstatSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { assertPublicPackageContents, assertPublicPackagePaths, listPublicPackageFiles,
  readPublicPackageProfile } from "./stage05-public-package.mjs";
import { validateOpenAIUniversalPlugin } from "./openai-universal-plugin-validate.mjs";

const root = path.resolve(".");
const profile = readPublicPackageProfile(root);
const manifest = JSON.parse(readFileSync(path.join(root, "public-package-manifest.json"), "utf8"));
if (manifest?.schema !== "outsider/stage05-public-package-manifest/v1"
  || manifest.schemaVersion !== "1.1.0"
  || manifest.boundary !== "PUBLIC_STAGE05_RUNTIME_ONLY_LOCAL_RESEARCH_EXCLUDED"
  || manifest.dependencyPathSetSha256 !== profile.dependencyPathSetSha256
  || JSON.stringify(manifest.excluded) !== JSON.stringify({
    nonStage05Assets: true,
    privateDataAndRuns: true,
    internalPlanning: true,
    tests: true,
  })
  || JSON.stringify(manifest.included) !== JSON.stringify({ stage05Runtime: true })) {
  throw new Error("PUBLIC_PACKAGE_MANIFEST_INVALID");
}
const declaredPaths = manifest.members.map((member) => member.path);
if (manifest.memberCount !== manifest.members.length
  || new Set(declaredPaths).size !== declaredPaths.length
  || JSON.stringify(declaredPaths) !== JSON.stringify([...declaredPaths].sort())) {
  throw new Error("PUBLIC_PACKAGE_MANIFEST_MEMBER_SET_INVALID");
}
for (const member of manifest.members) {
  const file = path.resolve(root, member.path);
  const stat = lstatSync(file);
  const hash = createHash("sha256").update(readFileSync(file)).digest("hex");
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size !== member.bytes
    || `sha256:${hash}` !== member.sha256) throw new Error(`PUBLIC_PACKAGE_MEMBER_INVALID:${member.path}`);
}
const actualPaths = listPublicPackageFiles(root)
  .filter((member) => member !== "public-package-manifest.json").sort();
if (JSON.stringify(actualPaths) !== JSON.stringify(declaredPaths)) {
  throw new Error("PUBLIC_PACKAGE_ACTUAL_MEMBER_SET_MISMATCH");
}
assertPublicPackagePaths(actualPaths, profile);
assertPublicPackageContents(root, actualPaths, profile);
const universalPlugin = validateOpenAIUniversalPlugin({ root });
if (!universalPlugin.ok) throw new Error(`OPENAI_UNIVERSAL_PLUGIN_INVALID:${universalPlugin.errors.join(",")}`);
const forbiddenTop = ["artifacts", "test", "dist", ".outsider"];
for (const name of forbiddenTop) {
  if (readdirSync(root).includes(name)) throw new Error(`PUBLIC_PACKAGE_FORBIDDEN_ROOT:${name}`);
}
for (const args of [["--version"], ["help"]]) {
  const result = spawnSync(process.execPath, ["bin/outsider.mjs", ...args],
    { cwd: root, encoding: "utf8" });
  if (result.status !== 0) throw new Error(`PUBLIC_PACKAGE_CLI_SMOKE_FAILED:${args[0]}`);
}
const unsupportedRoot = mkdtempSync(path.join(tmpdir(), "outsider-public-unsupported-"));
const unsupportedFile = path.join(unsupportedRoot, "local-research.json");
writeFileSync(unsupportedFile, JSON.stringify({ schema: "outsider/local-research/v1" }));
const unsupported = spawnSync(process.execPath,
  ["bin/outsider.mjs", "verify", unsupportedFile], { cwd: root, encoding: "utf8" });
if (unsupported.status !== 1
  || JSON.parse(unsupported.stdout || "null")?.error !== "UNSUPPORTED_SCHEMA") {
  throw new Error("PUBLIC_PACKAGE_UNKNOWN_SCHEMA_FAIL_CLOSED_INVALID");
}
process.stdout.write(`${JSON.stringify({ ok: true, package: manifest.package,
  membersVerified: manifest.members.length, nonStage05AssetsExcluded: true,
  universalPluginValidated: true })}\n`);
