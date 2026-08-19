#!/usr/bin/env node
import path from "node:path";
import { generateKeyPairSync } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";

const args = process.argv.slice(2);
const valueAfter = (flag) => {
  const at = args.indexOf(flag);
  return at >= 0 ? args[at + 1] : null;
};
const privateOut = valueAfter("--private-out")
  ? path.resolve(valueAfter("--private-out")) : null;
const publicOut = valueAfter("--public-out")
  ? path.resolve(valueAfter("--public-out")) : null;

if (!privateOut || !publicOut || privateOut === publicOut) {
  process.stderr.write("usage: generate-ed25519-keypair --private-out <private.pem> --public-out <public.pem>\n");
  process.exit(64);
}

const { privateKey, publicKey } = generateKeyPairSync("ed25519", {
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
});

mkdirSync(path.dirname(privateOut), { recursive: true });
mkdirSync(path.dirname(publicOut), { recursive: true });
// wx makes key generation fail closed instead of replacing an existing trust root.
writeFileSync(privateOut, privateKey, { encoding: "utf8", mode: 0o600, flag: "wx" });
try {
  writeFileSync(publicOut, publicKey, { encoding: "utf8", mode: 0o644, flag: "wx" });
} catch (error) {
  process.stderr.write(`public key was not written; private key remains at ${privateOut}: ${error.message}\n`);
  process.exit(1);
}

process.stdout.write(`${JSON.stringify({ ok: true, privateKey: privateOut, publicKey: publicOut }, null, 2)}\n`);
