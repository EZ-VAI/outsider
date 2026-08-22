#!/usr/bin/env node

import { createHash } from "node:crypto";
import {
  chmodSync, copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync,
  readdirSync, realpathSync, writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = path.resolve(HERE, "..");
const PROFILE_FILE = "release-public-files.json";
const JS_EXTENSIONS = ["", ".js", ".mjs", ".cjs", ".json"];

function fail(code, detail = null) {
  throw new Error(detail == null ? code : `${code}:${detail}`);
}

function plain(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;
}

function exactKeys(value, keys) {
  return plain(value) && JSON.stringify(Object.keys(value).sort())
    === JSON.stringify([...keys].sort());
}

function within(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function resolveRelativeImport(sourceFile, specifier, root, { optional = false } = {}) {
  if (!specifier.startsWith(".")) return null;
  const base = path.resolve(path.dirname(sourceFile), specifier.split(/[?#]/, 1)[0]);
  if (!within(root, base) && base !== root) fail("PUBLIC_PACKAGE_IMPORT_ESCAPE", specifier);
  const candidates = [];
  for (const extension of JS_EXTENSIONS) candidates.push(`${base}${extension}`);
  for (const extension of [".js", ".mjs", ".cjs", ".json"]) {
    candidates.push(path.join(base, `index${extension}`));
  }
  const target = candidates.find((item) => existsSync(item) && lstatSync(item).isFile()
    && !lstatSync(item).isSymbolicLink());
  if (!target) {
    if (optional) return null;
    fail("PUBLIC_PACKAGE_RELATIVE_IMPORT_NOT_FOUND",
      `${path.relative(root, sourceFile)}:${specifier}`);
  }
  return target;
}

function relativeSpecifiers(source) {
  const found = new Map();
  const patterns = [
    { pattern: /(?:^|\n)\s*(?:import|export)\s+(?:[^;"'`]*?\s+from\s+)?["']([^"']+)["']/g,
      optional: false },
    { pattern: /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g, optional: true },
    { pattern: /\bnew\s+URL\s*\(\s*["']([^"']+)["']\s*,\s*import\.meta\.url\s*\)/g,
      optional: false },
  ];
  for (const { pattern, optional } of patterns) {
    for (const match of source.matchAll(pattern)) {
      if (!match[1].startsWith(".")) continue;
      found.set(match[1], (found.get(match[1]) ?? true) && optional);
    }
  }
  return [...found].map(([specifier, optional]) => ({ specifier, optional }));
}

function dependencyClosure(root, entrypoints) {
  const queue = entrypoints.map((item) => path.resolve(root, item));
  const visited = new Set();
  while (queue.length > 0) {
    const file = queue.shift();
    if (visited.has(file)) continue;
    if (!within(root, file) || !existsSync(file) || !lstatSync(file).isFile()
      || lstatSync(file).isSymbolicLink()) fail("PUBLIC_PACKAGE_ENTRY_INVALID",
      path.relative(root, file));
    visited.add(file);
    if (!/\.(?:[cm]?js|ts)$/.test(file)) continue;
    const source = readFileSync(file, "utf8");
    for (const { specifier, optional } of relativeSpecifiers(source)) {
      const dependency = resolveRelativeImport(file, specifier, root, { optional });
      if (dependency && !visited.has(dependency)) queue.push(dependency);
    }
  }
  return visited;
}

export function publicDependencyFiles({ sourceRoot = DEFAULT_ROOT, entrypoints } = {}) {
  const root = path.resolve(sourceRoot);
  if (!Array.isArray(entrypoints) || entrypoints.length === 0) {
    fail("PUBLIC_PACKAGE_ENTRYPOINTS_REQUIRED");
  }
  return [...dependencyClosure(root, entrypoints)]
    .map((file) => path.relative(root, file).split(path.sep).join("/")).sort();
}

export function assertPublicPackagePaths(paths, profile) {
  if (!Array.isArray(paths) || !profile) fail("PUBLIC_PACKAGE_PATH_AUDIT_INVALID");
  const forbidden = profile.forbiddenPathPatterns.map((item) => new RegExp(item, "i"));
  const violation = paths.find((file) => forbidden.some((pattern) => pattern.test(file)));
  if (violation) fail("PUBLIC_PACKAGE_FORBIDDEN_MEMBER", violation);
  return true;
}

export function assertPublicPackageContents(root, paths, profile) {
  const forbidden = profile.forbiddenContentPatterns.map((item) => Buffer.from(item));
  for (const relative of paths) {
    if (relative === PROFILE_FILE) continue;
    const bytes = readFileSync(path.join(root, relative));
    const violation = forbidden.find((pattern) => bytes.includes(pattern));
    if (violation) fail("PUBLIC_PACKAGE_FORBIDDEN_CONTENT",
      `${relative}:${violation.toString("utf8")}`);
  }
}

function copyBoundFile(sourceRoot, targetRoot, relative) {
  const source = path.resolve(sourceRoot, relative);
  const target = path.resolve(targetRoot, relative);
  if (!within(sourceRoot, source) || !within(targetRoot, target)
    || !existsSync(source)) fail("PUBLIC_PACKAGE_COPY_PATH_INVALID", relative);
  const stat = lstatSync(source);
  if (!stat.isFile() || stat.isSymbolicLink()) fail("PUBLIC_PACKAGE_COPY_SOURCE_INVALID", relative);
  mkdirSync(path.dirname(target), { recursive: true, mode: 0o755 });
  copyFileSync(source, target);
  chmodSync(target, stat.mode & 0o777);
}

export function listPublicPackageFiles(root, directory = root) {
  const output = [];
  for (const name of readdirSync(directory).sort()) {
    const file = path.join(directory, name);
    const stat = lstatSync(file);
    if (stat.isSymbolicLink()) fail("PUBLIC_PACKAGE_SYMLINK_REFUSED", path.relative(root, file));
    if (stat.isDirectory()) output.push(...listPublicPackageFiles(root, file));
    else if (stat.isFile()) output.push(path.relative(root, file).split(path.sep).join("/"));
    else fail("PUBLIC_PACKAGE_MEMBER_TYPE_INVALID", path.relative(root, file));
  }
  return output;
}

function sha256(file) {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

export function readPublicPackageProfile(sourceRoot = DEFAULT_ROOT) {
  const profile = JSON.parse(readFileSync(path.join(sourceRoot, PROFILE_FILE), "utf8"));
  if (!exactKeys(profile, ["schema", "schemaVersion", "boundary", "entrypoints",
    "staticFiles", "forbiddenPathPatterns", "forbiddenContentPatterns"])
    || profile.schema !== "outsider/stage05-public-package-profile/v1"
    || profile.schemaVersion !== "1.0.0"
    || profile.boundary !== "PUBLIC_STAGE05_RUNTIME_ONLY_LOCAL_RESEARCH_EXCLUDED"
    || !Array.isArray(profile.entrypoints) || profile.entrypoints.length === 0
    || !Array.isArray(profile.staticFiles) || !Array.isArray(profile.forbiddenPathPatterns)
    || !Array.isArray(profile.forbiddenContentPatterns)
    || [...profile.entrypoints, ...profile.staticFiles].some((item) =>
      typeof item !== "string" || item.length === 0 || path.isAbsolute(item)
      || item.split(/[\\/]/).includes(".."))
    || [...profile.forbiddenPathPatterns, ...profile.forbiddenContentPatterns].some((item) =>
      typeof item !== "string" || item.length === 0)) fail("PUBLIC_PACKAGE_PROFILE_INVALID");
  return profile;
}

export function stagePublicNpmPackage({ sourceRoot = DEFAULT_ROOT, targetRoot } = {}) {
  if (typeof targetRoot !== "string" || targetRoot.length === 0) {
    fail("PUBLIC_PACKAGE_TARGET_REQUIRED");
  }
  const source = path.resolve(sourceRoot);
  const target = path.resolve(targetRoot);
  if (existsSync(target) && readdirSync(target).length > 0) fail("PUBLIC_PACKAGE_TARGET_NOT_EMPTY");
  mkdirSync(target, { recursive: true, mode: 0o755 });
  const profile = readPublicPackageProfile(source);
  const files = dependencyClosure(source, profile.entrypoints);
  for (const relative of profile.staticFiles) files.add(path.resolve(source, relative));
  for (const file of [...files].sort()) copyBoundFile(source, target, path.relative(source, file));

  const sourcePackage = JSON.parse(readFileSync(path.join(source, "package.json"), "utf8"));
  const publicPackage = {
    name: sourcePackage.name,
    version: sourcePackage.version,
    private: false,
    description: sourcePackage.description,
    license: sourcePackage.license,
    author: sourcePackage.author,
    repository: sourcePackage.repository,
    bugs: sourcePackage.bugs,
    homepage: sourcePackage.homepage,
    keywords: sourcePackage.keywords,
    engines: sourcePackage.engines,
    os: sourcePackage.os,
    type: sourcePackage.type,
    bin: sourcePackage.bin,
    files: [".agents", ".claude-plugin", "bin", "deploy", "docs", "hooks", "integrations",
      "plugins", "references", "scripts", "src", "CONTRIBUTING.md", "LICENSE", "PRIVACY.md",
      "README.md", "README.zh-CN.md", "SECURITY.md", "install.mjs", "try.mjs", "release-public-files.json",
      "public-package-manifest.json"],
    scripts: {
      test: "node scripts/stage05-public-package-smoke.mjs",
      "test:release-package": "node scripts/stage05-public-package-smoke.mjs",
      "test:corpus": "node scripts/outsider-gate-corpus.mjs",
      "plugin:validate": "node scripts/openai-universal-plugin-validate.mjs",
    },
  };
  writeFileSync(path.join(target, "package.json"), `${JSON.stringify(publicPackage, null, 2)}\n`,
    { mode: 0o644, flag: "wx" });
  copyBoundFile(source, target, PROFILE_FILE);

  const members = listPublicPackageFiles(target);
  assertPublicPackagePaths(members, profile);
  assertPublicPackageContents(target, members, profile);
  const manifestMembers = members.filter((file) => file !== "public-package-manifest.json")
    .map((file) => ({ path: file, bytes: lstatSync(path.join(target, file)).size,
      sha256: `sha256:${sha256(path.join(target, file))}` }));
  const manifest = {
    schema: "outsider/stage05-public-package-manifest/v1",
    schemaVersion: "1.0.0",
    package: { name: publicPackage.name, version: publicPackage.version },
    boundary: profile.boundary,
    memberCount: manifestMembers.length,
    members: manifestMembers,
    excluded: {
      localStages1Through4: true,
      realityStewardshipResearch: true,
      governedResponsibilityAndActuarialResearch: true,
      outreachCatalog: true,
      rawAndCanonicalArtifacts: true,
      tests: true,
    },
    included: {
      stage05RuntimePolicyAndHeuristics: true,
      legacyStage05BehaviorUtilities: true,
    },
  };
  writeFileSync(path.join(target, "public-package-manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o644, flag: "wx" });
  return { targetRoot: target, profile, package: publicPackage, manifest };
}

if (process.argv[1]
  && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  if (process.argv.slice(2).some((argument) => ["--help", "-h"].includes(argument))) {
    process.stdout.write("Usage: node scripts/stage05-public-package.mjs --out NEW_DIRECTORY\n"
      + "Stages the exact reviewed public Stage 0.5 dependency closure; the target must not exist.\n");
    process.exit(0);
  }
  const index = process.argv.indexOf("--out");
  if (index < 0 || !process.argv[index + 1]) fail("PUBLIC_PACKAGE_TARGET_REQUIRED");
  const result = stagePublicNpmPackage({ targetRoot: process.argv[index + 1] });
  process.stdout.write(`${JSON.stringify({ ok: true, targetRoot: result.targetRoot,
    memberCount: result.manifest.memberCount, boundary: result.manifest.boundary })}\n`);
}
