import path from "node:path";
import { mkdirSync } from "node:fs";
import { readPrivateExecutionBytes, writePrivateExecutionRecordOnce as writeOnce } from "../src/outsider-user-held-durable-execution-v2.js";
import { readPublisherRuntimeInterfaces } from "../src/outsider-publisher-runtime-intake.js";
const [receiptFile, directory, offset = "0"] = process.argv.slice(2);
if (![receiptFile, directory].every(p => path.isAbsolute(p ?? ""))) throw new Error("RUNTIME_INTAKE_PATH_INVALID");
mkdirSync(directory, { recursive: true, mode: 0o700 });
const read = file => JSON.parse(readPrivateExecutionBytes(file)), receipt = read(receiptFile);
const bytes = Buffer.concat(receipt.chunks.map(n => Buffer.from(read(path.join(path.dirname(receiptFile), `${n}.json`)).base64, "base64")));
const result = await readPublisherRuntimeInterfaces({ receipt, bytes, assetOffset: Number(offset),
  writeRecord: (name, value) => writeOnce(path.join(directory, `${name}.json`), value) });
console.log(JSON.stringify({ metrics: result.metrics, rows: result.rows.map(({ chunks, ...row }) => row) }));
