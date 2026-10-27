import assert from "node:assert/strict";
import { lstatSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const declaration = JSON.parse(readFileSync(path.resolve("local-canonical-artifacts.json"), "utf8"));
const ROOTS = [
  ...declaration.entries.map((entry) => path.resolve("artifacts", entry.family)),
  path.resolve("artifact-index", "local-canonical-index-20260822"),
];

function walkPrivateTree(root, errors = []) {
  const stat = lstatSync(root);
  if (stat.isSymbolicLink()) {
    errors.push(`symlink:${root}`);
    return errors;
  }
  const mode = stat.mode & 0o777;
  if (stat.isDirectory()) {
    if (mode !== 0o700) errors.push(`directory:${mode.toString(8)}:${root}`);
    for (const entry of readdirSync(root)) walkPrivateTree(path.join(root, entry), errors);
  } else if (stat.isFile()) {
    if (mode !== 0o600) errors.push(`file:${mode.toString(8)}:${root}`);
  } else {
    errors.push(`non-regular:${root}`);
  }
  return errors;
}

test("all declared canonical-family releases, markers, and index artifacts remain private", () => {
  const errors = ROOTS.flatMap((root) => walkPrivateTree(root));
  assert.deepEqual(errors, []);
});
