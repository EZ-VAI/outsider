import path from "node:path";
import { createNeonClaimableResource } from "../src/outsider-neon-claimable-resource.js";
import { readPrivateExecutionBytes } from "../src/outsider-user-held-durable-execution-v2.js";
const [action, directory, profileFile, snapshotFile] = process.argv.slice(2);
try {
  if (!["reserve", "restore", "clear"].includes(action) || !path.isAbsolute(profileFile ?? "")) throw new Error("USAGE: action absolute-directory absolute-profile [private-download-file]");
  const profile = JSON.parse(readPrivateExecutionBytes(profileFile));
  const adapter = createNeonClaimableResource({ directory, permissionGrantHash: profile.permissionGrantHash });
  if (action === "restore") {
    const value = JSON.parse(readPrivateExecutionBytes(snapshotFile));
    const { createHash } = await import("node:crypto");
    const bytes = Buffer.from(value.snapshotBytesBase64, "base64");
    if (`sha256:${createHash("sha256").update(bytes).digest("hex")}` !== value.snapshotHash) throw new Error("DOWNLOAD_HASH_MISMATCH");
    const snapshot = JSON.parse(bytes);
    if (snapshot.schema !== "outsider/recoverable-record-snapshot/v1") throw new Error("DOWNLOAD_SCHEMA_INVALID");
    console.log(JSON.stringify(await adapter.restore({ records: snapshot.records, recordSourceRefHash: value.providerReceipt })));
  } else console.log(JSON.stringify(await adapter[action]()));
} catch (error) {
  console.error(JSON.stringify({ error: error.message?.startsWith("OUTSIDER_") ? error.message : "CLAIMABLE_RESOURCE_COMMAND_FAILED" }));
  process.exitCode = 1;
}
