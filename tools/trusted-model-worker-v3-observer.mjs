import { createHash } from "node:crypto";
import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  opendirSync,
  openSync,
  readSync,
} from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { TextDecoder } from "node:util";

export const TRUSTED_MODEL_WORKER_V3_RAW_MANIFEST_SCHEMA =
  "outsider/trusted-model-worker-v3-child-raw-manifest-observation/v2";
export const TRUSTED_MODEL_WORKER_V3_RAW_SEMANTIC_SCHEMA =
  "outsider/trusted-model-worker-v3-child-raw-semantic-observation/v2";
export const TRUSTED_MODEL_WORKER_V3_RAW_EVIDENCE_CLASS =
  "RAW_OBSERVATION_ONLY";

export const TRUSTED_MODEL_WORKER_V3_OBSERVER_LIMITS = Object.freeze({
  maxFileBytes: 4 * 1024 * 1024,
  maxRootBytes: 8 * 1024 * 1024,
  maxEntries: 512,
  maxDirs: 128,
  maxDepth: 16,
  maxPathBytes: 512,
  maxSerializedBytes: 64 * 1024,
});

const ROOT = "/work/repo";
const VALUE_MODULE_URL = pathToFileURL(path.join(ROOT, "src/value.js")).href;
const UTF8_DECODER = new TextDecoder("utf-8", { fatal: true });
const SafeError = Error;
const jsonStringify = JSON.stringify;
const numberIsSafeInteger = Number.isSafeInteger;
const objectCreate = Object.create;
const objectGetPrototypeOf = Object.getPrototypeOf;
const objectKeys = Object.keys;
const reflectApply = Reflect.apply;
const setHas = Set.prototype.has;
const bufferByteLength = Buffer.byteLength.bind(Buffer);
const writeStdout = process.stdout.write.bind(process.stdout);
const writeStderr = process.stderr.write.bind(process.stderr);
const SAFE_ERROR_MESSAGES = new Set([
  "V3_OBSERVER_ARGUMENT_INVALID",
  "V3_OBSERVER_DIRECTORY_CHANGED",
  "V3_OBSERVER_DIRECTORY_CLOSE_FAILED",
  "V3_OBSERVER_DIRECTORY_COUNT_LIMIT_EXCEEDED",
  "V3_OBSERVER_DIRECTORY_INVALID",
  "V3_OBSERVER_DIRECTORY_READ_FAILED",
  "V3_OBSERVER_DIRECTORY_SCAN_LIMIT_EXCEEDED",
  "V3_OBSERVER_ENTRY_COUNT_LIMIT_EXCEEDED",
  "V3_OBSERVER_ENTRY_INVALID",
  "V3_OBSERVER_FILE_CHANGED",
  "V3_OBSERVER_FILE_INVALID",
  "V3_OBSERVER_FILE_OPEN_FAILED",
  "V3_OBSERVER_FILE_READ_FAILED",
  "V3_OBSERVER_MODULE_IMPORT_FAILED",
  "V3_OBSERVER_MODULE_URL_INVALID",
  "V3_OBSERVER_NOFOLLOW_UNAVAILABLE",
  "V3_OBSERVER_OPERATION_FAILED",
  "V3_OBSERVER_PATH_BYTES_LIMIT_EXCEEDED",
  "V3_OBSERVER_PATH_DEPTH_LIMIT_EXCEEDED",
  "V3_OBSERVER_PATH_ENCODING_INVALID",
  "V3_OBSERVER_PATH_UNSAFE",
  "V3_OBSERVER_ROOT_BYTES_LIMIT_EXCEEDED",
  "V3_OBSERVER_ROOT_CHANGED",
  "V3_OBSERVER_ROOT_INVALID",
  "V3_OBSERVER_SERIALIZATION_FAILED",
  "V3_OBSERVER_SERIALIZED_BYTES_LIMIT_EXCEEDED",
  "V3_OBSERVER_SPECIAL_FILE_FORBIDDEN",
  "V3_OBSERVER_SYMLINK_FORBIDDEN",
  "V3_OBSERVER_VALUE_CALL_FAILED",
  "V3_OBSERVER_VALUE_EXPORT_INVALID",
  "V3_OBSERVER_VALUE_RESULT_INVALID",
]);

function isSafeErrorMessage(message) {
  return typeof message === "string" &&
    reflectApply(setHas, SAFE_ERROR_MESSAGES, [message]);
}

function fail(code) {
  throw new SafeError(`V3_OBSERVER_${code}`);
}

function observerError(error) {
  let message = "";
  try {
    if (error instanceof SafeError && typeof error.message === "string") {
      message = error.message;
    }
  } catch {
    message = "";
  }
  return new SafeError(
    isSafeErrorMessage(message) ? message : "V3_OBSERVER_OPERATION_FAILED",
  );
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function compareUtf8(left, right) {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}

function decodeName(nameBytes) {
  let name;
  try {
    name = UTF8_DECODER.decode(nameBytes);
  } catch {
    fail("PATH_ENCODING_INVALID");
  }
  if (!Buffer.from(name, "utf8").equals(nameBytes)) {
    fail("PATH_ENCODING_INVALID");
  }
  return name;
}

function validateRelative(relative) {
  if (
    typeof relative !== "string" ||
    relative.length === 0 ||
    path.posix.isAbsolute(relative) ||
    relative.includes("\\") ||
    /[\u0000-\u001f\u007f]/u.test(relative) ||
    relative.normalize("NFC") !== relative
  ) {
    fail("PATH_UNSAFE");
  }

  const segments = relative.split("/");
  if (
    segments.some(
      (segment) =>
        segment.length === 0 ||
        segment === "." ||
        segment === ".." ||
        segment === ".git",
    )
  ) {
    fail("PATH_UNSAFE");
  }
  if (segments.length > TRUSTED_MODEL_WORKER_V3_OBSERVER_LIMITS.maxDepth) {
    fail("PATH_DEPTH_LIMIT_EXCEEDED");
  }
  if (
    Buffer.byteLength(relative, "utf8") >
    TRUSTED_MODEL_WORKER_V3_OBSERVER_LIMITS.maxPathBytes
  ) {
    fail("PATH_BYTES_LIMIT_EXCEEDED");
  }
}

function stableStat(left, right) {
  return (
    left.dev === right.dev &&
    left.ino === right.ino &&
    left.mode === right.mode &&
    left.nlink === right.nlink &&
    left.uid === right.uid &&
    left.gid === right.gid &&
    left.rdev === right.rdev &&
    left.size === right.size &&
    left.mtimeNs === right.mtimeNs &&
    left.ctimeNs === right.ctimeNs
  );
}

function assertDirectory(stat) {
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    fail("DIRECTORY_INVALID");
  }
}

function readStableFile(absolute, beforePath, remainingBytes) {
  if (
    !beforePath.isFile() ||
    beforePath.isSymbolicLink() ||
    beforePath.nlink !== 1n ||
    beforePath.size < 0n ||
    beforePath.size >
      BigInt(TRUSTED_MODEL_WORKER_V3_OBSERVER_LIMITS.maxFileBytes) ||
    beforePath.size > BigInt(remainingBytes)
  ) {
    fail(
      beforePath.size > BigInt(remainingBytes)
        ? "ROOT_BYTES_LIMIT_EXCEEDED"
        : "FILE_INVALID",
    );
  }

  if (typeof constants.O_NOFOLLOW !== "number") {
    fail("NOFOLLOW_UNAVAILABLE");
  }

  let descriptor;
  try {
    descriptor = openSync(
      absolute,
      constants.O_RDONLY | constants.O_NOFOLLOW,
    );
  } catch {
    fail("FILE_OPEN_FAILED");
  }

  try {
    const beforeFd = fstatSync(descriptor, { bigint: true });
    if (
      !beforeFd.isFile() ||
      beforeFd.nlink !== 1n ||
      !stableStat(beforePath, beforeFd)
    ) {
      fail("FILE_CHANGED");
    }

    const expectedSize = Number(beforeFd.size);
    const bytes = Buffer.alloc(expectedSize);
    try {
      let offset = 0;
      while (offset < expectedSize) {
        const count = readSync(
          descriptor,
          bytes,
          offset,
          expectedSize - offset,
          offset,
        );
        if (count === 0) {
          fail("FILE_CHANGED");
        }
        offset += count;
      }
      const overflowProbe = Buffer.alloc(1);
      if (readSync(descriptor, overflowProbe, 0, 1, expectedSize) !== 0) {
        fail("FILE_CHANGED");
      }
    } catch (error) {
      if (error instanceof SafeError && isSafeErrorMessage(error.message)) {
        throw error;
      }
      fail("FILE_READ_FAILED");
    }
    const afterFd = fstatSync(descriptor, { bigint: true });
    if (
      BigInt(expectedSize) !== beforeFd.size ||
      !stableStat(beforeFd, afterFd)
    ) {
      fail("FILE_CHANGED");
    }

    let afterPath;
    try {
      afterPath = lstatSync(absolute, { bigint: true });
    } catch {
      fail("FILE_CHANGED");
    }
    if (!stableStat(afterFd, afterPath)) {
      fail("FILE_CHANGED");
    }

    return { bytes, stat: afterFd };
  } finally {
    closeSync(descriptor);
  }
}

function readBoundedDirectoryNames(absoluteDirectory) {
  let directory;
  try {
    directory = opendirSync(absoluteDirectory, { encoding: "buffer" });
  } catch {
    fail("DIRECTORY_READ_FAILED");
  }

  const rawNames = [];
  let pendingError;
  try {
    for (;;) {
      const entry = directory.readSync();
      if (entry === null) {
        break;
      }
      rawNames.push(entry.name);
      if (
        rawNames.length >
        TRUSTED_MODEL_WORKER_V3_OBSERVER_LIMITS.maxEntries +
          TRUSTED_MODEL_WORKER_V3_OBSERVER_LIMITS.maxDirs
      ) {
        fail("DIRECTORY_SCAN_LIMIT_EXCEEDED");
      }
    }
  } catch (error) {
    pendingError = error;
  } finally {
    try {
      directory.closeSync();
    } catch {
      if (pendingError === undefined) {
        pendingError = new SafeError("V3_OBSERVER_DIRECTORY_CLOSE_FAILED");
      }
    }
  }
  if (pendingError !== undefined) {
    throw pendingError;
  }

  rawNames.sort(Buffer.compare);
  return rawNames;
}

function serializedLine(observation) {
  let line;
  try {
    line = `${jsonStringify(observation)}\n`;
  } catch {
    fail("SERIALIZATION_FAILED");
  }
  if (
    bufferByteLength(line, "utf8") >
    TRUSTED_MODEL_WORKER_V3_OBSERVER_LIMITS.maxSerializedBytes
  ) {
    fail("SERIALIZED_BYTES_LIMIT_EXCEEDED");
  }
  return line;
}

function buildRawManifest(root) {
  const absoluteRoot = path.resolve(root);
  let rootBefore;
  try {
    rootBefore = lstatSync(absoluteRoot, { bigint: true });
  } catch {
    fail("ROOT_INVALID");
  }
  assertDirectory(rootBefore);

  const entries = [];
  const directories = [];
  let totalBytes = 0;

  function walk(absoluteDirectory, relativeDirectory) {
    let directoryBefore;
    try {
      directoryBefore = lstatSync(absoluteDirectory, { bigint: true });
    } catch {
      fail("DIRECTORY_INVALID");
    }
    assertDirectory(directoryBefore);

    const rawNames = readBoundedDirectoryNames(absoluteDirectory);

    for (const rawName of rawNames) {
      const name = decodeName(rawName);
      const relative = relativeDirectory
        ? `${relativeDirectory}/${name}`
        : name;
      validateRelative(relative);
      const absolute = path.join(absoluteDirectory, name);

      let beforePath;
      try {
        beforePath = lstatSync(absolute, { bigint: true });
      } catch {
        fail("ENTRY_INVALID");
      }
      if (beforePath.isSymbolicLink()) {
        fail("SYMLINK_FORBIDDEN");
      }
      if (beforePath.isDirectory()) {
        if (
          directories.length >=
          TRUSTED_MODEL_WORKER_V3_OBSERVER_LIMITS.maxDirs
        ) {
          fail("DIRECTORY_COUNT_LIMIT_EXCEEDED");
        }
        directories.push(relative);
        walk(absolute, relative);
        continue;
      }
      if (!beforePath.isFile()) {
        fail("SPECIAL_FILE_FORBIDDEN");
      }
      if (
        entries.length >= TRUSTED_MODEL_WORKER_V3_OBSERVER_LIMITS.maxEntries
      ) {
        fail("ENTRY_COUNT_LIMIT_EXCEEDED");
      }

      const { bytes, stat } = readStableFile(
        absolute,
        beforePath,
        TRUSTED_MODEL_WORKER_V3_OBSERVER_LIMITS.maxRootBytes - totalBytes,
      );
      totalBytes += bytes.length;
      entries.push({
        path: relative,
        mode: Number(stat.mode & 0o777n),
        size: bytes.length,
        bytesSha256: sha256(bytes),
      });
    }

    let directoryAfter;
    try {
      directoryAfter = lstatSync(absoluteDirectory, { bigint: true });
    } catch {
      fail("DIRECTORY_CHANGED");
    }
    if (!stableStat(directoryBefore, directoryAfter)) {
      fail("DIRECTORY_CHANGED");
    }
  }

  walk(absoluteRoot, "");
  let rootAfter;
  try {
    rootAfter = lstatSync(absoluteRoot, { bigint: true });
  } catch {
    fail("ROOT_CHANGED");
  }
  if (!stableStat(rootBefore, rootAfter)) {
    fail("ROOT_CHANGED");
  }

  entries.sort((left, right) => compareUtf8(left.path, right.path));
  directories.sort(compareUtf8);

  return {
    schema: TRUSTED_MODEL_WORKER_V3_RAW_MANIFEST_SCHEMA,
    evidenceClass: TRUSTED_MODEL_WORKER_V3_RAW_EVIDENCE_CLASS,
    observation: "FULL_ROOT_MANIFEST",
    root: absoluteRoot,
    entries,
    directories,
    entryCount: entries.length,
    directoryCount: directories.length,
    totalBytes,
    limits: { ...TRUSTED_MODEL_WORKER_V3_OBSERVER_LIMITS },
    gitMetadataAbsent: true,
    symlinksAbsent: true,
    specialFilesAbsent: true,
    hardlinksAbsent: true,
  };
}

async function buildRawSemantic(moduleUrl) {
  let parsed;
  try {
    parsed = new URL(moduleUrl);
  } catch {
    fail("MODULE_URL_INVALID");
  }
  if (
    parsed.protocol !== "file:" ||
    parsed.username !== "" ||
    parsed.password !== "" ||
    parsed.host !== "" ||
    parsed.hash !== ""
  ) {
    fail("MODULE_URL_INVALID");
  }

  let namespace;
  try {
    namespace = await import(parsed.href);
  } catch {
    fail("MODULE_IMPORT_FAILED");
  }

  const keys = objectKeys(namespace);
  if (
    objectGetPrototypeOf(namespace) !== null ||
    keys.length !== 1 ||
    keys[0] !== "value" ||
    typeof namespace.value !== "function" ||
    namespace.value.length !== 0
  ) {
    fail("VALUE_EXPORT_INVALID");
  }

  let value;
  try {
    value = reflectApply(namespace.value, undefined, []);
  } catch {
    fail("VALUE_CALL_FAILED");
  }
  if (!numberIsSafeInteger(value)) {
    fail("VALUE_RESULT_INVALID");
  }

  const observation = objectCreate(null);
  observation.schema = TRUSTED_MODEL_WORKER_V3_RAW_SEMANTIC_SCHEMA;
  observation.evidenceClass = TRUSTED_MODEL_WORKER_V3_RAW_EVIDENCE_CLASS;
  observation.observation = "VALUE_EXPORT_CALL";
  observation.exportName = "value";
  observation.value = value;
  return observation;
}

// These exports are fixture-testable raw observers. Their output is deliberately
// unsigned and carries no receipt, authority, diff, or acceptance decision.
export function observeTrustedModelWorkerV3RawManifest(root) {
  try {
    const observation = buildRawManifest(root);
    serializedLine(observation);
    return observation;
  } catch (error) {
    throw observerError(error);
  }
}

export async function observeTrustedModelWorkerV3RawSemantic(moduleUrl) {
  try {
    const observation = await buildRawSemantic(moduleUrl);
    serializedLine(observation);
    return observation;
  } catch (error) {
    throw observerError(error);
  }
}

async function main(argv) {
  if (argv.length !== 1) {
    fail("ARGUMENT_INVALID");
  }

  let observation;
  if (argv[0] === "--manifest") {
    observation = observeTrustedModelWorkerV3RawManifest(ROOT);
  } else if (argv[0] === "--semantic") {
    observation = await observeTrustedModelWorkerV3RawSemantic(VALUE_MODULE_URL);
  } else {
    fail("ARGUMENT_INVALID");
  }
  writeStdout(serializedLine(observation));
}

const invokedAsMain =
  typeof process.argv[1] === "string" &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (invokedAsMain) {
  main(process.argv.slice(2)).catch((error) => {
    const safe = observerError(error);
    writeStderr(`${safe.message}\n`);
    process.exitCode = 2;
  });
}
