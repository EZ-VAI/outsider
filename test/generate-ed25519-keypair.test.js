import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { createPrivateKey, createPublicKey, sign, verify } from "node:crypto";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("portable Ed25519 generator creates a usable pair and refuses overwrite", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "outsider-keygen-"));
  try {
    const privateKey = path.join(directory, "private.pem");
    const publicKey = path.join(directory, "public.pem");
    const args = [path.join(root, "scripts", "generate-ed25519-keypair.mjs"),
      "--private-out", privateKey, "--public-out", publicKey];
    const first = spawnSync(process.execPath, args, { encoding: "utf8" });
    assert.equal(first.status, 0, first.stderr);
    const privateObject = createPrivateKey(readFileSync(privateKey));
    const publicObject = createPublicKey(readFileSync(publicKey));
    const message = Buffer.from("outsider-second-host-witness");
    assert.equal(verify(null, message, publicObject, sign(null, message, privateObject)), true);
    assert.equal(statSync(privateKey).mode & 0o777, 0o600);

    const second = spawnSync(process.execPath, args, { encoding: "utf8" });
    assert.notEqual(second.status, 0);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
