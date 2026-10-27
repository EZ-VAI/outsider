import { createHash } from "node:crypto";
import { canonicalizeStrict } from "./canonical.js";

export const publicDatasetHash = value => `sha256:${createHash("sha256").update(canonicalizeStrict(value)).digest("hex")}`;
export function normalizePublicDataset(input) {
  if (!input || Object.keys(input).sort().join(",") !== "records,visibility"
    || input.visibility !== "PUBLIC" || !Array.isArray(input.records)
    || input.records.length < 1 || input.records.length > 100
    || input.records.some(row => !row || Object.keys(row).sort().join(",") !== "id,value"
      || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(row.id ?? "")
      || typeof row.value !== "string" || Buffer.byteLength(row.value) > 1024)
    || new Set(input.records.map(row => row.id)).size !== input.records.length)
    throw new TypeError("PUBLIC_DATASET_INPUT_INVALID");
  const records = input.records.map(({ id, value }) => ({ id, value }))
    .sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  // One exact independent HTTP measurement must contain the whole result.
  if (Buffer.byteLength(canonicalizeStrict(records)) > 8192)
    throw new TypeError("PUBLIC_DATASET_OBSERVATION_BOUND_EXCEEDED");
  return { visibility: "PUBLIC", records };
}
