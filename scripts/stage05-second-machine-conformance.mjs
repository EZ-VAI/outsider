#!/usr/bin/env node
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync,
} from "node:fs";
import os, { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  machineIdentity, signSecondMachineConformance,
} from "../src/outsider-second-machine-conformance.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const valueAfter = (flag) => { const at = args.indexOf(flag); return at >= 0 ? args[at + 1] : null; };
const artifact = valueAfter("--artifact") ? path.resolve(valueAfter("--artifact")) : null;
const signingKey = valueAfter("--signing-key") ? path.resolve(valueAfter("--signing-key")) : null;
const output = valueAfter("--out") ? path.resolve(valueAfter("--out")) : null;
if (!artifact || !existsSync(artifact) || !signingKey || !existsSync(signingKey) || !output) {
  process.stderr.write("usage: stage05-second-machine-conformance --artifact <tgz> --signing-key <ed25519-private.pem> --out <record.json>\n");
  process.exit(64);
}

const sha = (value) => `sha256:${createHash("sha256").update(value).digest("hex")}`;
const fileHash = (file) => sha(readFileSync(file));
const boundedCheck = (command, commandArgs, options = {}) => {
  const result = spawnSync(command, commandArgs, {
    encoding: "utf8", stdio: "pipe", timeout: options.timeout ?? 180_000,
    cwd: options.cwd ?? root, env: options.env ?? process.env,
  });
  const stdout = String(result.stdout ?? "");
  const stderr = String(result.stderr ?? "");
  return { ok: result.status === 0 && !result.error, status: result.status,
    signal: result.signal ?? null, error: result.error?.message ?? null,
    stdoutHash: sha(stdout), stderrHash: sha(stderr) };
};

const temporary = mkdtempSync(path.join(tmpdir(), "outsider-second-host-"));
try {
  const installation = path.join(temporary, "install");
  const stateRoot = path.join(temporary, "state");
  const home = path.join(temporary, "home");
  const project = path.join(temporary, "project");
  mkdirSync(home, { recursive: true });
  mkdirSync(project, { recursive: true });
  const cleanInstall = boundedCheck("npm", ["install", "--offline", "--ignore-scripts",
    "--no-audit", "--no-fund", "--prefix", installation, artifact]);
  const installedRoot = path.join(installation, "node_modules", "outsider-guard");
  const pkg = existsSync(path.join(installedRoot, "package.json"))
    ? JSON.parse(readFileSync(path.join(installedRoot, "package.json"), "utf8")) : null;
  const cli = path.join(installation, "node_modules", ".bin", "outsider");
  const version = boundedCheck(cli, ["--version"]);
  version.observedVersion = version.ok ? String(spawnSync(cli, ["--version"], {
    encoding: "utf8", timeout: 30_000 }).stdout ?? "").trim() : null;
  version.ok = version.ok && version.observedVersion === pkg?.version;
  const help = boundedCheck(cli, ["help"]);
  const doctor = boundedCheck(cli, ["doctor", "--json", "--state-root", stateRoot],
    { timeout: 60_000 });
  const packageTests = boundedCheck("npm", ["test"], { cwd: installedRoot });
  const corpus = boundedCheck("npm", ["run", "test:corpus"], { cwd: installedRoot });
  const projectScopedInstall = boundedCheck(cli, ["install", "--scope", "project"], {
    cwd: project, timeout: 60_000,
    env: { ...process.env, HOME: home, OUTSIDER_HOME: path.join(home, ".outsider") },
  });
  const identity = machineIdentity({ platform: process.platform, arch: process.arch,
    release: os.release(), hostname: os.hostname() });
  const body = {
    ...identity,
    artifact: { file: path.basename(artifact), sha256: fileHash(artifact),
      packageName: pkg?.name ?? null, packageVersion: pkg?.version ?? null },
    evaluatorHashes: {
      script: fileHash(fileURLToPath(import.meta.url)),
      library: fileHash(path.join(root, "src", "outsider-second-machine-conformance.js")),
    },
    checks: { cleanInstall, version, help, doctor, packageTests, corpus, projectScopedInstall },
    claimBoundary: "cooperative signed clean-install evidence from a distinct host identity; not hardware remote attestation",
    observedAt: new Date().toISOString(),
  };
  const record = signSecondMachineConformance(body, readFileSync(signingKey));
  mkdirSync(path.dirname(output), { recursive: true });
  writeFileSync(output, `${JSON.stringify(record, null, 2)}\n`, { mode: 0o600 });
  const ok = Object.values(body.checks).every((check) => check.ok === true);
  process.stdout.write(`${JSON.stringify({ ok, output, machineIdentityHash: identity.machineIdentityHash,
    artifactHash: body.artifact.sha256, signerPublicKeyHash: record.signerPublicKeyHash }, null, 2)}\n`);
  process.exitCode = ok ? 0 : 1;
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
