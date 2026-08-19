import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync,
  rmSync, statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const digest = (value) => `sha256:${createHash("sha256").update(value).digest("hex")}`;

function manifest(directory) {
  const entries = [];
  const visit = (current, prefix = "") => {
    for (const name of readdirSync(current).sort()) {
      const absolute = path.join(current, name);
      const relative = path.posix.join(prefix, name);
      const stat = statSync(absolute);
      if (stat.isDirectory()) visit(absolute, relative);
      else if (stat.isFile()) entries.push({ path: relative,
        sha256: digest(readFileSync(absolute)) });
      else throw new Error(`RELEASE_ARTIFACT_ENTRY_UNSUPPORTED:${relative}`);
    }
  };
  visit(directory);
  return entries;
}

export function freezeReleaseArtifact({ artifact, runtimeRoot, outputRoot, gate }) {
  if (!artifact) throw new Error(`${gate}_FORMAL_RELEASE_ARTIFACT_REQUIRED`);
  const source = path.resolve(artifact);
  if (!existsSync(source)) throw new Error(`${gate}_RELEASE_ARTIFACT_MISSING:${source}`);
  const temporary = mkdtempSync(path.join(tmpdir(), "outsider-release-artifact-"));
  try {
    const extracted = spawnSync("tar", ["-xzf", source, "-C", temporary], {
      encoding: "utf8", stdio: "pipe",
    });
    if (extracted.status !== 0) {
      throw new Error(`${gate}_ARTIFACT_EXTRACT_FAILED:${extracted.stderr || extracted.stdout}`);
    }
    const packageRoot = path.join(temporary, "package");
    const packageJson = JSON.parse(readFileSync(path.join(packageRoot, "package.json"), "utf8"));
    const entries = manifest(packageRoot);
    for (const entry of entries) {
      const runtimeFile = path.join(path.resolve(runtimeRoot), entry.path);
      if (!existsSync(runtimeFile) || digest(readFileSync(runtimeFile)) !== entry.sha256) {
        throw new Error(`${gate}_RUNTIME_ARTIFACT_MISMATCH:${entry.path}`);
      }
    }
    const artifactDirectory = path.join(path.resolve(outputRoot), "artifact");
    mkdirSync(artifactDirectory, { recursive: true });
    const copy = path.join(artifactDirectory, path.basename(source));
    copyFileSync(source, copy);
    const sha256 = digest(readFileSync(source));
    if (digest(readFileSync(copy)) !== sha256) {
      throw new Error(`${gate}_FROZEN_ARTIFACT_COPY_MISMATCH`);
    }
    return {
      file: path.relative(path.resolve(outputRoot), copy),
      sha256,
      byteLength: statSync(copy).size,
      packageName: packageJson.name,
      packageVersion: packageJson.version,
      fileCount: entries.length,
      contentManifestHash: digest(JSON.stringify(entries)),
    };
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}

