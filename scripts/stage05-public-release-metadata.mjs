#!/usr/bin/env node
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { writePublicReleaseMetadata } from "../src/outsider-public-release-metadata.js";

function parse(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith("--")) continue;
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) throw new Error(`OPTION_VALUE_REQUIRED:${value}`);
    options[value.slice(2)] = next;
    index += 1;
  }
  return options;
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
const options = parse(process.argv.slice(2));
const directory = path.resolve(options["out-dir"] ?? path.join(root, "dist"));
const result = writePublicReleaseMetadata({
  certificatePath: path.resolve(options.certificate
    ?? path.join(directory, `release-certificate-${pkg.version}.json`)),
  npmArtifactPath: path.resolve(options.artifact
    ?? path.join(directory, `${pkg.name}-${pkg.version}.tgz`)),
  pluginArtifactPath: path.resolve(options.plugin
    ?? path.join(directory, `${pkg.name}-${pkg.version}-claude.plugin.zip`)),
  outputDirectory: directory,
  expectedProduct: { name: pkg.name, version: pkg.version },
});

process.stdout.write(`${JSON.stringify({
  publicCertificate: result.publicCertificate,
  publicCertificateSha256: result.publicCertificateSha256,
  sha256Sums: result.sha256Sums,
  releaseDecision: result.projection.releaseDecision,
  stablePublicReleaseReady: result.projection.stablePublicReleaseReady,
}, null, 2)}\n`);

