import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  chmodSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  statSync,
  symlinkSync,
  truncateSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";

import {
  observeTrustedModelWorkerV3RawManifest,
  observeTrustedModelWorkerV3RawSemantic,
  TRUSTED_MODEL_WORKER_V3_OBSERVER_LIMITS,
  TRUSTED_MODEL_WORKER_V3_RAW_EVIDENCE_CLASS,
  TRUSTED_MODEL_WORKER_V3_RAW_MANIFEST_SCHEMA,
  TRUSTED_MODEL_WORKER_V3_RAW_SEMANTIC_SCHEMA,
} from "../tools/trusted-model-worker-v3-observer.mjs";

const OBSERVER_PATH = fileURLToPath(
  new URL("../tools/trusted-model-worker-v3-observer.mjs", import.meta.url),
);

async function withFixture(run) {
  const root = mkdtempSync(path.join(tmpdir(), "outsider-v3-observer-"));
  try {
    return await run(root);
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
}

function moduleUrl(file, discriminator) {
  const url = pathToFileURL(file);
  url.searchParams.set("fixture", discriminator);
  return url.href;
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function runSemanticInIsolatedChild(targetUrl) {
  const observerUrl = pathToFileURL(OBSERVER_PATH).href;
  const program = `
    const stringify = JSON.stringify;
    const write = process.stdout.write.bind(process.stdout);
    const observer = await import(${JSON.stringify(observerUrl)});
    try {
      const observation = await observer.observeTrustedModelWorkerV3RawSemantic(process.argv[1]);
      write(stringify(observation) + "\\n");
    } catch (error) {
      write("ERROR:" + error.message + "\\n");
    }
  `;
  return spawnSync(
    process.execPath,
    ["--input-type=module", "--eval", program, targetUrl],
    { encoding: "utf8", env: {} },
  );
}

function assertManifestFailure(root, code, secret = "") {
  assert.throws(
    () => observeTrustedModelWorkerV3RawManifest(root),
    (error) => {
      assert.equal(error.message, code);
      assert.equal(error.message.includes(root), false);
      if (secret !== "") {
        assert.equal(error.message.includes(secret), false);
      }
      return true;
    },
  );
}

test("semantic observer records both 41 and 42 as bounded raw values", async () => {
  await withFixture(async (root) => {
    for (const value of [41, 42]) {
      const file = path.join(root, `value-${value}.mjs`);
      writeFileSync(file, `export function value() { return ${value}; }\n`);
      const observation = await observeTrustedModelWorkerV3RawSemantic(
        moduleUrl(file, String(value)),
      );

      assert.deepEqual(Object.keys(observation).sort(), [
        "evidenceClass",
        "exportName",
        "observation",
        "schema",
        "value",
      ]);
      assert.deepEqual({ ...observation }, {
        schema: TRUSTED_MODEL_WORKER_V3_RAW_SEMANTIC_SCHEMA,
        evidenceClass: TRUSTED_MODEL_WORKER_V3_RAW_EVIDENCE_CLASS,
        observation: "VALUE_EXPORT_CALL",
        exportName: "value",
        value,
      });
      assert.equal("result" in observation, false);
      assert.equal("receipt" in observation, false);
      assert.equal("signature" in observation, false);
      assert.equal("authority" in observation, false);
      assert.equal("accepted" in observation, false);
    }
  });
});

test("semantic namespace permits only Object.keys ['value'] and ignores Symbol.toStringTag", async () => {
  await withFixture(async (root) => {
    const valid = path.join(root, "valid.mjs");
    writeFileSync(valid, "export function value() { return 41; }\n");
    const validUrl = moduleUrl(valid, "symbol-tag");
    const namespace = await import(validUrl);
    assert.deepEqual(Object.keys(namespace), ["value"]);
    assert.equal(
      Reflect.ownKeys(namespace).includes(Symbol.toStringTag),
      true,
      "ESM namespaces include the built-in Symbol.toStringTag key",
    );
    assert.equal(
      (await observeTrustedModelWorkerV3RawSemantic(validUrl)).value,
      41,
    );

    const extra = path.join(root, "extra.mjs");
    writeFileSync(
      extra,
      "export const extra = 1; export function value() { return 41; }\n",
    );
    await assert.rejects(
      observeTrustedModelWorkerV3RawSemantic(moduleUrl(extra, "extra")),
      { message: "V3_OBSERVER_VALUE_EXPORT_INVALID" },
    );

    const unsafeInteger = path.join(root, "unsafe-integer.mjs");
    writeFileSync(
      unsafeInteger,
      "export function value() { return 9007199254740992; }\n",
    );
    await assert.rejects(
      observeTrustedModelWorkerV3RawSemantic(
        moduleUrl(unsafeInteger, "unsafe-integer"),
      ),
      { message: "V3_OBSERVER_VALUE_RESULT_INVALID" },
    );
  });
});

test("semantic import and call errors do not expose fixture paths or contents", async () => {
  await withFixture(async (root) => {
    const importFailure = path.join(root, "import-secret.mjs");
    writeFileSync(importFailure, "throw new Error('content-secret');\n");
    await assert.rejects(
      observeTrustedModelWorkerV3RawSemantic(
        moduleUrl(importFailure, "import-failure"),
      ),
      (error) => {
        assert.equal(error.message, "V3_OBSERVER_MODULE_IMPORT_FAILED");
        assert.equal(error.message.includes(root), false);
        assert.equal(error.message.includes("content-secret"), false);
        return true;
      },
    );

    const callFailure = path.join(root, "call-secret.mjs");
    writeFileSync(
      callFailure,
      "export function value() { throw new Error('content-secret'); }\n",
    );
    await assert.rejects(
      observeTrustedModelWorkerV3RawSemantic(
        moduleUrl(callFailure, "call-failure"),
      ),
      (error) => {
        assert.equal(error.message, "V3_OBSERVER_VALUE_CALL_FAILED");
        assert.equal(error.message.includes(root), false);
        assert.equal(error.message.includes("content-secret"), false);
        return true;
      },
    );
  });
});

test("semantic raw value resists same-realm intrinsic and prototype poisoning", async () => {
  await withFixture(async (root) => {
    const poisoned = path.join(root, "poisoned.mjs");
    writeFileSync(
      poisoned,
      [
        "Object.keys = () => [];",
        "Object.getPrototypeOf = () => Object.prototype;",
        "Reflect.apply = () => 42;",
        "Number.isSafeInteger = () => true;",
        "JSON.stringify = () => '{\\\"value\\\":42}';",
        "Object.prototype.toJSON = () => ({ value: 42 });",
        "Object.prototype.then = (resolve) => resolve({ value: 42 });",
        "process.stdout.write = () => true;",
        "process.stderr.write = () => true;",
        "export function value() { return 41; }",
        "",
      ].join("\n"),
    );
    const child = runSemanticInIsolatedChild(
      moduleUrl(poisoned, "intrinsic-poisoning"),
    );
    assert.equal(child.status, 0, child.stderr);
    assert.equal(child.stderr, "");
    assert.deepEqual(JSON.parse(child.stdout), {
      schema: TRUSTED_MODEL_WORKER_V3_RAW_SEMANTIC_SCHEMA,
      evidenceClass: TRUSTED_MODEL_WORKER_V3_RAW_EVIDENCE_CLASS,
      observation: "VALUE_EXPORT_CALL",
      exportName: "value",
      value: 41,
    });

    const hiddenExtra = path.join(root, "hidden-extra.mjs");
    writeFileSync(
      hiddenExtra,
      [
        "Object.keys = () => ['value'];",
        "export const extra = 1;",
        "export function value() { return 41; }",
        "",
      ].join("\n"),
    );
    const rejected = runSemanticInIsolatedChild(
      moduleUrl(hiddenExtra, "hidden-extra"),
    );
    assert.equal(rejected.status, 0, rejected.stderr);
    assert.equal(rejected.stderr, "");
    assert.equal(rejected.stdout, "ERROR:V3_OBSERVER_VALUE_EXPORT_INVALID\n");
  });
});

test("manifest is a closed bounded raw full-root observation", async () => {
  await withFixture(async (root) => {
    mkdirSync(path.join(root, "empty"));
    mkdirSync(path.join(root, "src"));
    writeFileSync(path.join(root, "README.md"), "fixture readme\n");
    writeFileSync(path.join(root, "src", "value.js"), "export const n = 41;\n");
    chmodSync(path.join(root, "src", "value.js"), 0o640);

    const observation = observeTrustedModelWorkerV3RawManifest(root);
    assert.deepEqual(Object.keys(observation).sort(), [
      "directories",
      "directoryCount",
      "entries",
      "entryCount",
      "evidenceClass",
      "gitMetadataAbsent",
      "hardlinksAbsent",
      "limits",
      "observation",
      "root",
      "schema",
      "specialFilesAbsent",
      "symlinksAbsent",
      "totalBytes",
    ]);
    assert.equal(observation.schema, TRUSTED_MODEL_WORKER_V3_RAW_MANIFEST_SCHEMA);
    assert.equal(
      observation.evidenceClass,
      TRUSTED_MODEL_WORKER_V3_RAW_EVIDENCE_CLASS,
    );
    assert.equal(observation.observation, "FULL_ROOT_MANIFEST");
    assert.equal(observation.root, path.resolve(root));
    assert.deepEqual(observation.directories, ["empty", "src"]);
    assert.equal(observation.directoryCount, 2);
    assert.equal(observation.entryCount, 2);
    assert.deepEqual(observation.limits, TRUSTED_MODEL_WORKER_V3_OBSERVER_LIMITS);
    assert.deepEqual(
      observation.entries.map((entry) => entry.path),
      ["README.md", "src/value.js"],
    );

    for (const entry of observation.entries) {
      const absolute = path.join(root, ...entry.path.split("/"));
      const bytes = entry.path === "README.md"
        ? Buffer.from("fixture readme\n")
        : Buffer.from("export const n = 41;\n");
      assert.equal(entry.size, bytes.length);
      assert.equal(entry.bytesSha256, sha256(bytes));
      assert.equal(entry.mode, statSync(absolute).mode & 0o777);
    }
    assert.equal(
      observation.totalBytes,
      Buffer.byteLength("fixture readme\nexport const n = 41;\n"),
    );
    assert.equal(observation.gitMetadataAbsent, true);
    assert.equal(observation.symlinksAbsent, true);
    assert.equal(observation.specialFilesAbsent, true);
    assert.equal(observation.hardlinksAbsent, true);
    for (const forbidden of [
      "accepted",
      "authority",
      "diff",
      "manifestHash",
      "receipt",
      "signature",
    ]) {
      assert.equal(forbidden in observation, false);
    }
  });
});

test("manifest caps a large number of zero-byte files", async () => {
  await withFixture(async (root) => {
    for (
      let index = 0;
      index < TRUSTED_MODEL_WORKER_V3_OBSERVER_LIMITS.maxEntries + 1;
      index += 1
    ) {
      writeFileSync(path.join(root, `${String(index).padStart(4, "0")}.txt`), "");
    }
    assertManifestFailure(root, "V3_OBSERVER_ENTRY_COUNT_LIMIT_EXCEEDED");
  });
});

test("manifest caps a large number of zero-byte directories", async () => {
  await withFixture(async (root) => {
    for (
      let index = 0;
      index < TRUSTED_MODEL_WORKER_V3_OBSERVER_LIMITS.maxDirs + 1;
      index += 1
    ) {
      mkdirSync(path.join(root, `d-${String(index).padStart(4, "0")}`));
    }
    assertManifestFailure(root, "V3_OBSERVER_DIRECTORY_COUNT_LIMIT_EXCEEDED");
  });
});

test("manifest caps path depth and UTF-8 path bytes", async () => {
  await withFixture(async (root) => {
    let current = root;
    for (
      let depth = 0;
      depth < TRUSTED_MODEL_WORKER_V3_OBSERVER_LIMITS.maxDepth + 1;
      depth += 1
    ) {
      current = path.join(current, "d");
      mkdirSync(current);
    }
    assertManifestFailure(root, "V3_OBSERVER_PATH_DEPTH_LIMIT_EXCEEDED");
  });

  await withFixture(async (root) => {
    let current = root;
    for (let index = 0; index < 3; index += 1) {
      const component = `p${index}-${"x".repeat(210)}`;
      current = path.join(current, component);
      mkdirSync(current);
    }
    assertManifestFailure(root, "V3_OBSERVER_PATH_BYTES_LIMIT_EXCEEDED");
  });
});

test("manifest caps serialized bytes independently of file bytes", async () => {
  await withFixture(async (root) => {
    for (let index = 0; index < 300; index += 1) {
      const name = `${String(index).padStart(4, "0")}-${"x".repeat(180)}`;
      writeFileSync(path.join(root, name), "");
    }
    assertManifestFailure(root, "V3_OBSERVER_SERIALIZED_BYTES_LIMIT_EXCEEDED");
  });
});

test("manifest caps each file and aggregate file bytes", async () => {
  await withFixture(async (root) => {
    writeFileSync(path.join(root, "large.bin"), "");
    truncateSync(
      path.join(root, "large.bin"),
      TRUSTED_MODEL_WORKER_V3_OBSERVER_LIMITS.maxFileBytes + 1,
    );
    assertManifestFailure(root, "V3_OBSERVER_FILE_INVALID");
  });

  await withFixture(async (root) => {
    const size = 3 * 1024 * 1024;
    for (const name of ["a.bin", "b.bin", "c.bin"]) {
      writeFileSync(path.join(root, name), "");
      truncateSync(path.join(root, name), size);
    }
    assertManifestFailure(root, "V3_OBSERVER_ROOT_BYTES_LIMIT_EXCEEDED");
  });
});

test("manifest rejects .git, symlinks, special files, and hardlinks without leaks", async () => {
  await withFixture(async (root) => {
    mkdirSync(path.join(root, ".git"));
    assertManifestFailure(root, "V3_OBSERVER_PATH_UNSAFE", ".git");
  });

  await withFixture(async (root) => {
    writeFileSync(path.join(root, "target-secret.txt"), "not-for-errors\n");
    symlinkSync("target-secret.txt", path.join(root, "link-secret.txt"));
    assertManifestFailure(root, "V3_OBSERVER_SYMLINK_FORBIDDEN", "link-secret");
  });

  await withFixture(async (root) => {
    const fifo = path.join(root, "fifo-secret");
    const made = spawnSync("mkfifo", [fifo], { encoding: "utf8", env: {} });
    assert.equal(made.status, 0, made.stderr);
    assertManifestFailure(root, "V3_OBSERVER_SPECIAL_FILE_FORBIDDEN", "fifo-secret");
  });

  await withFixture(async (root) => {
    writeFileSync(path.join(root, "first-secret.txt"), "not-for-errors\n");
    linkSync(
      path.join(root, "first-secret.txt"),
      path.join(root, "second-secret.txt"),
    );
    assertManifestFailure(root, "V3_OBSERVER_FILE_INVALID", "first-secret");
  });
});

test("CLI rejects extra arguments and unsupported commands with a closed error", () => {
  for (const argv of [
    [],
    ["--diff"],
    ["--acceptance"],
    ["--manifest", "extra"],
    ["--semantic", "extra"],
  ]) {
    const child = spawnSync(process.execPath, [OBSERVER_PATH, ...argv], {
      encoding: "utf8",
      env: {},
    });
    assert.equal(child.status, 2, JSON.stringify({ argv, child }));
    assert.equal(child.stdout, "");
    assert.equal(child.stderr, "V3_OBSERVER_ARGUMENT_INVALID\n");
  }
});
