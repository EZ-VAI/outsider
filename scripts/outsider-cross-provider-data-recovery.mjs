import { createHash } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { canonicalizeStrict } from "../src/canonical.js";
import { readPrivateExecutionBytes, writePrivateExecutionRecordOnce } from "../src/outsider-user-held-durable-execution-v2.js";
import { executeCrossProviderDataRecovery } from "../src/outsider-cross-provider-data-recovery-runtime.js";
const digest = v => `sha256:${createHash("sha256").update(canonicalizeStrict(v)).digest("hex")}`;
try {
  const [directory, profileFile] = process.argv.slice(2);
  if (!path.isAbsolute(directory ?? "") || !path.isAbsolute(profileFile ?? "")) throw new Error("ARGUMENT_INVALID");
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const preparationFile = path.join(directory, "command-preparation.json");
  if (!existsSync(preparationFile)) {
    const profile = JSON.parse(readPrivateExecutionBytes(profileFile));
    const now = new Date(); const deadline = new Date(+now + 900_000).toISOString();
    if (profile.syntheticData !== true || profile.zeroCostScope?.confirmed !== true
      || Date.parse(deadline) >= Date.parse(profile.zeroCostScope.expiresAt)) throw new Error("SCOPE_INVALID");
    const body = { schema: "outsider/cross-provider-recovery-rehearsal/v1", directoryHash: digest(directory),
      createdAt: now.toISOString(), completionDeadline: deadline, recordsHash: digest(profile.records) };
    const programHash = digest(body);
    writePrivateExecutionRecordOnce(preparationFile, { profile, records: profile.records,
      retireOwnedPrimaryForRecovery: true,
      program: { body, programHash, programId: `data_${programHash.slice(7,39)}`,
        formationDeadline: new Date(+now + 300_000).toISOString(), completionDeadline: deadline, obligations: [] } });
  }
  const preparation = JSON.parse(readPrivateExecutionBytes(preparationFile));
  console.log(JSON.stringify(await executeCrossProviderDataRecovery({ directory, preparation })));
} catch (error) {
  const message = error.outsiderCode ?? error.message;
  console.error(JSON.stringify({ error: /^[A-Z][A-Z0-9_]{0,160}$/u.test(message ?? "") ? message : "CROSS_PROVIDER_EXECUTION_FAILED" }));
  process.exitCode = 1;
}
