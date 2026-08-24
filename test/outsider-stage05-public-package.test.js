import assert from "node:assert/strict";
import { existsSync, mkdtempSync, mkdirSync, readFileSync,
  rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import { assertPublicPackageContents, assertPublicPackagePaths, dependencyPathSetSha256,
  listPublicPackageFiles, publicDependencyFiles, publicReleaseForbiddenContentPatterns,
  publicReleaseForbiddenPathPatterns, stagePublicNpmPackage,
} from "../scripts/stage05-public-package.mjs";

const ROOT = path.resolve(".");

test("public package CLI executes through a symlinked script path", (t) => {
  const temporary = mkdtempSync(path.join(tmpdir(), "outsider-public-package-link-"));
  t.after(() => rmSync(temporary, { recursive: true, force: true }));
  const alias = path.join(temporary, "stage-public.mjs");
  symlinkSync(path.join(ROOT, "scripts", "stage05-public-package.mjs"), alias);
  const result = spawnSync(process.execPath, [alias, "--help"],
    { cwd: ROOT, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /Usage: node scripts\/stage05-public-package\.mjs/u);
});

test("public npm staging contains only the reviewed Stage 0.5 dependency closure", (t) => {
  const temporary = mkdtempSync(path.join(tmpdir(), "outsider-public-package-test-"));
  const stage = path.join(temporary, "stage");
  t.after(() => rmSync(temporary, { recursive: true, force: true }));
  const staged = stagePublicNpmPackage({ sourceRoot: ROOT, targetRoot: stage });
  assert.equal(staged.package.private, false);
  assert.equal(staged.manifest.boundary,
    "PUBLIC_STAGE05_RUNTIME_ONLY_LOCAL_RESEARCH_EXCLUDED");
  assert.deepEqual(staged.manifest.excluded, {
    nonStage05Assets: true,
    privateDataAndRuns: true,
    internalPlanning: true,
    tests: true,
  });
  assert.deepEqual(staged.manifest.included, { stage05Runtime: true });
  const dependencies = publicDependencyFiles({ sourceRoot: ROOT,
    entrypoints: staged.profile.entrypoints });
  assert.equal(staged.profile.dependencyPathSetSha256,
    dependencyPathSetSha256(dependencies));
  assert.equal(staged.manifest.dependencyPathSetSha256,
    staged.profile.dependencyPathSetSha256);
  const paths = staged.manifest.members.map((item) => item.path);
  assert(paths.includes("bin/outsider.mjs"));
  assert(paths.includes("src/outsider-kernel-controller.js"));
  assert(paths.includes("src/outsider-federation-producers.js"));
  assert.equal(existsSync(path.join(stage, "test")), false);
  assert.equal(existsSync(path.join(stage, "artifacts")), false);

  const smoke = spawnSync("npm", ["test", "--silent"], { cwd: stage, encoding: "utf8" });
  assert.equal(smoke.status, 0, smoke.stderr || smoke.stdout);
  const corpus = spawnSync("npm", ["run", "test:corpus", "--silent"],
    { cwd: stage, encoding: "utf8" });
  assert.equal(corpus.status, 0, corpus.stderr || corpus.stdout);
  const packed = spawnSync("npm", ["pack", "--dry-run", "--json", "--cache",
    path.join(temporary, "npm-cache")], { cwd: stage, encoding: "utf8" });
  assert.equal(packed.status, 0, packed.stderr);
  const members = JSON.parse(packed.stdout)[0].files.map((item) => item.path).sort();
  const expectedMembers = [...staged.manifest.members.map((item) => item.path),
    "public-package-manifest.json"].sort();
  assert.deepEqual(members, expectedMembers,
    "the npm archive must contain exactly the hash-manifested staging set");
  assert.equal(members.some((item) => /^(?:artifacts|test|dist)\//.test(item)), false);
  assert.equal(members.some((item) =>
    /(?:^|\/)[^/]*(?:private|internal|confidential|secret|research|roadmap|dataset)[^/]*$/i
      .test(item)), false);
});

test("the reviewed dependency path set is fixed and rejects a synthetic private import", (t) => {
  const temporary = mkdtempSync(path.join(tmpdir(), "outsider-public-closure-"));
  const source = path.join(temporary, "source");
  t.after(() => rmSync(temporary, { recursive: true, force: true }));
  mkdirSync(source, { recursive: true });
  writeFileSync(path.join(source, "entry.mjs"), "export const publicValue = true;\n");
  writeFileSync(path.join(source, "package.json"), `${JSON.stringify({
    name: "synthetic-public-closure", version: "1.0.0", private: true,
    license: "MIT", type: "module", engines: { node: ">=20" },
  }, null, 2)}\n`);
  const profile = {
    schema: "outsider/stage05-public-package-profile/v1",
    schemaVersion: "1.1.0",
    boundary: "PUBLIC_STAGE05_RUNTIME_ONLY_LOCAL_RESEARCH_EXCLUDED",
    dependencyPathSetSha256: dependencyPathSetSha256(["entry.mjs"]),
    entrypoints: ["entry.mjs"],
    staticFiles: [],
    forbiddenPathPatterns: [...publicReleaseForbiddenPathPatterns],
    forbiddenContentPatterns: [...publicReleaseForbiddenContentPatterns],
  };
  writeFileSync(path.join(source, "release-public-files.json"),
    `${JSON.stringify(profile, null, 2)}\n`);
  stagePublicNpmPackage({ sourceRoot: source, targetRoot: path.join(temporary, "clean") });

  writeFileSync(path.join(source, "entry.mjs"),
    "import './private-data.mjs';\nexport const publicValue = true;\n");
  writeFileSync(path.join(source, "private-data.mjs"),
    "export const syntheticFixture = true;\n");
  assert.throws(() => stagePublicNpmPackage({ sourceRoot: source,
    targetRoot: path.join(temporary, "drift") }),
  /PUBLIC_PACKAGE_DEPENDENCY_PATH_SET_MISMATCH/);
});

test("generic path and content policy rejects synthetic private fixtures", (t) => {
  const temporary = mkdtempSync(path.join(tmpdir(), "outsider-public-policy-"));
  t.after(() => rmSync(temporary, { recursive: true, force: true }));
  const profile = {
    forbiddenPathPatterns: publicReleaseForbiddenPathPatterns,
    forbiddenContentPatterns: publicReleaseForbiddenContentPatterns,
  };
  assert.throws(() => assertPublicPackagePaths(["src/private-data.mjs"], profile),
    /PUBLIC_PACKAGE_FORBIDDEN_MEMBER/);
  writeFileSync(path.join(temporary, "fixture.txt"), "INTERNAL_ONLY synthetic fixture\n");
  assert.throws(() => assertPublicPackageContents(temporary, ["fixture.txt"], profile),
    /PUBLIC_PACKAGE_FORBIDDEN_CONTENT/);
});

test("the actual public archive replays its smoke and isolated stage-only install", (t) => {
  const temporary = mkdtempSync(path.join(tmpdir(), "outsider-public-archive-test-"));
  const stage = path.join(temporary, "stage");
  const packDirectory = path.join(temporary, "pack");
  const extractDirectory = path.join(temporary, "extract");
  const installHome = path.join(temporary, "install-home");
  t.after(() => rmSync(temporary, { recursive: true, force: true }));
  mkdirSync(packDirectory);
  mkdirSync(extractDirectory);
  mkdirSync(installHome);
  mkdirSync(path.join(installHome, ".codex"));
  mkdirSync(path.join(installHome, ".claude"));

  const staged = stagePublicNpmPackage({ sourceRoot: ROOT, targetRoot: stage });
  const packed = spawnSync("npm", ["pack", "--json", "--pack-destination", packDirectory,
    "--cache", path.join(temporary, "npm-cache")], { cwd: stage, encoding: "utf8" });
  assert.equal(packed.status, 0, packed.stderr || packed.stdout);
  const packReport = JSON.parse(packed.stdout)[0];
  const archive = path.join(packDirectory, packReport.filename);
  const extracted = spawnSync("tar", ["-xzf", archive, "-C", extractDirectory],
    { encoding: "utf8" });
  assert.equal(extracted.status, 0, extracted.stderr || extracted.stdout);
  const packageRoot = path.join(extractDirectory, "package");
  const expectedMembers = [...staged.manifest.members.map((item) => item.path),
    "public-package-manifest.json"].sort();
  assert.deepEqual(listPublicPackageFiles(packageRoot), expectedMembers);

  const smoke = spawnSync("npm", ["test", "--silent"],
    { cwd: packageRoot, encoding: "utf8", timeout: 30_000 });
  assert.equal(smoke.status, 0, smoke.stderr || smoke.stdout);

  const install = spawnSync(process.execPath,
    ["bin/outsider.mjs", "install", "--stage-only"], {
      cwd: packageRoot, encoding: "utf8", timeout: 30_000,
      env: { ...process.env, HOME: installHome,
        OUTSIDER_HOME: path.join(installHome, ".outsider") },
    });
  assert.equal(install.status, 0, install.stderr || install.stdout);
  const doctor = spawnSync(process.execPath,
    ["bin/outsider.mjs", "doctor", "--json", "--worker", "/bin/true",
      "--state-root", path.join(installHome, ".outsider", "runs")], {
      cwd: packageRoot, encoding: "utf8", timeout: 30_000,
      env: { ...process.env, HOME: installHome, CODEX_HOME: path.join(installHome, ".codex"),
        OUTSIDER_HOME: path.join(installHome, ".outsider") },
    });
  assert.equal(doctor.status, 0, doctor.stderr || doctor.stdout);
  const diagnostic = JSON.parse(doctor.stdout);
  assert.equal(diagnostic.surfaces.nativeClaudeCode.installed, true);
  assert.deepEqual(diagnostic.surfaces.nativeClaudeCode.installedEvents.slice(-3),
    ["TaskCreated", "TaskCompleted", "TeammateIdle"]);
  assert.equal(diagnostic.surfaces.codex.hooksConfigured, true);
  assert.deepEqual(diagnostic.surfaces.codex.installedEvents,
    ["SessionStart", "UserPromptSubmit", "PreToolUse", "PermissionRequest", "PostToolUse",
      "PreCompact", "PostCompact", "SubagentStart", "SubagentStop", "Stop"]);
  assert.deepEqual(diagnostic.surfaces.codex.installedAdvisoryEvents, ["SessionEnd"]);
  assert.equal(diagnostic.surfaces.codex.hookTrustStatus,
    "UNKNOWN_REQUIRES_CODEX_HOOKS_REVIEW");
  assert.equal(diagnostic.surfaces.codex.runtimeConformanceSeen, false);
  assert.equal(diagnostic.surfaces.chatgpt.universalPluginPackagePresent, true);
  assert.equal(diagnostic.surfaces.chatgpt.livePluginInstallSeen, false);
  assert.equal(existsSync(path.join(installHome, ".outsider", "plugin", "outsider-guard",
    "public-plugin-manifest.json")), true);
  if (process.platform === "darwin") {
    assert.equal(existsSync(path.join(installHome, ".outsider", "system-helper", "releases",
      staged.package.version, "bin", "outsider-attached-daemon.mjs")), true);
  }
});

test("public package smoke rejects an unmanifested private-category file", (t) => {
  const temporary = mkdtempSync(path.join(tmpdir(), "outsider-public-package-extra-"));
  const stage = path.join(temporary, "stage");
  t.after(() => rmSync(temporary, { recursive: true, force: true }));
  stagePublicNpmPackage({ sourceRoot: ROOT, targetRoot: stage });
  mkdirSync(path.join(stage, "src"), { recursive: true });
  writeFileSync(path.join(stage, "src", "private-data.mjs"),
    "export const syntheticPrivateMember = true;\n");
  const smoke = spawnSync(process.execPath, ["scripts/stage05-public-package-smoke.mjs"],
    { cwd: stage, encoding: "utf8" });
  assert.notEqual(smoke.status, 0);
  assert.match(`${smoke.stdout}\n${smoke.stderr}`,
    /PUBLIC_PACKAGE_ACTUAL_MEMBER_SET_MISMATCH|PUBLIC_PACKAGE_FORBIDDEN_MEMBER/);
});

test("the mixed research workspace cannot be packed or published directly", () => {
  const pkg = JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf8"));
  assert.equal(pkg.private, true);
  assert.equal(pkg.scripts.prepack, "node scripts/refuse-root-pack.mjs");
  const temporary = mkdtempSync(path.join(tmpdir(), "outsider-root-pack-refusal-"));
  try {
    const packed = spawnSync("npm", ["pack", "--dry-run", "--json", "--cache", temporary],
      { cwd: ROOT, encoding: "utf8" });
    assert.notEqual(packed.status, 0);
    assert.match(`${packed.stdout}\n${packed.stderr}`, /ROOT_RESEARCH_WORKSPACE_NOT_PACKABLE/);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});
