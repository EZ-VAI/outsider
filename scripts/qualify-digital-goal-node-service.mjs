#!/usr/bin/env node
/* A temporary, historical-read-only launchd qualification. The exact owned job
 * is removed in finally. This does not install a login item or execute a task.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { readPrivateExecutionBytes, writePrivateExecutionRecordOnce }
  from "../src/outsider-user-held-durable-execution-v2.js";

const read = file => JSON.parse(readPrivateExecutionBytes(file));
const hash = value => `sha256:${createHash("sha256").update(value).digest("hex")}`;
const run = (args, timeout = 5000) => spawnSync("/bin/launchctl", args, { encoding: "utf8", timeout });
const pidOf = target => {
  const result = run(["print", target]);
  if (result.status !== 0) return null;
  return Number(result.stdout.match(/^\s*pid = (\d+)$/mu)?.[1]) || null;
};
const pause = () => new Promise(resolve => setTimeout(resolve, 300));

export async function qualifyDigitalGoalNodeService({ stagedService, clientConfigFile, outputFile }) {
  const startedAt = new Date().toISOString();
  assert.equal(stagedService.stagedOnly, true);
  assert.match(stagedService.label, /^ai\.outsider\.digital-goal\.node\.[a-f0-9]+$/u);
  const config = read(stagedService.configFile);
  assert.equal(typeof config.readOnlyPreparationFile, "string");
  assert.equal(config.inputFile, undefined); assert.notEqual(config.resumeConfirmedOnStart, true);
  const preparationBytes = readPrivateExecutionBytes(config.readOnlyPreparationFile);
  const preparation = JSON.parse(preparationBytes), clientConfig = read(clientConfigFile);
  assert.equal(clientConfig.origin, `http://127.0.0.1:${config.port}`);
  assert.equal(clientConfig.authorizationTokenFile, config.authorizationTokenFile);
  const token = readPrivateExecutionBytes(config.authorizationTokenFile).toString("utf8").trim();
  const target = `gui/${process.getuid()}/${stagedService.label}`;
  assert.notEqual(run(["print", target]).status, 0, "QUALIFICATION_JOB_ALREADY_EXISTS");
  let bootstrapped = false, bootoutStatus = null, absentAfterBootout = false;
  let first, second, firstPid, secondPid, clientBefore, clientAfter, restartMs;
  async function ready(excludedPid = null) {
    const end = Date.now() + 45000;
    while (Date.now() < end) {
      const pid = pidOf(target);
      if (pid && pid !== excludedPid) {
        try {
          const response = await fetch(`${clientConfig.origin}/v1/session`, {
            headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(700) });
          if (response.status === 200) return { pid, body: await response.json() };
        } catch { /* process may not yet be listening */ }
      }
      await pause();
    }
    throw new Error("NODE_SERVICE_READINESS_TIMEOUT");
  }
  function actualClient() {
    const result = spawnSync(process.execPath,
      [path.resolve("scripts/outsider-digital-goal-session-client.mjs"),
        "--config", clientConfigFile, "status", "--json"],
      { encoding: "utf8", timeout: 15000 });
    assert.equal(result.status, 0, "PRODUCT_CLIENT_FAILED");
    assert.equal(result.stdout.includes(token), false);
    return { outputHash: hash(result.stdout), bytes: Buffer.byteLength(result.stdout),
      json: JSON.parse(result.stdout) };
  }
  try {
    bootstrapped = true;
    assert.equal(run(["bootstrap", `gui/${process.getuid()}`, stagedService.plistFile]).status, 0,
      "NODE_SERVICE_BOOTSTRAP_FAILED");
    ({ pid: firstPid, body: first } = await ready());
    assert.equal(first.session.programHash, preparation.proposal.programHash);
    assert.equal(first.session.historicalReadOnly, true);
    clientBefore = actualClient();
    const crashedAt = Date.now();
    assert.equal(run(["kill", "SIGKILL", target]).status, 0, "OWNED_SERVICE_CRASH_FAILED");
    ({ pid: secondPid, body: second } = await ready(firstPid));
    restartMs = Date.now() - crashedAt;
    clientAfter = actualClient();
    assert.deepEqual(first, second);
    assert.deepEqual(clientBefore.json, clientAfter.json);
    assert.equal(first.session.programHash, preparation.proposal.programHash);
    assert.equal(first.session.state, "SUCCEEDED");
    assert.equal(first.session.historicalReadOnly, true);
    assert.equal(first.executionInProcess, false);
  } finally {
    if (bootstrapped) {
      bootoutStatus = run(["bootout", target], 20000).status;
      // launchd removal can outlive the command's response. Confirm absence
      // over a bounded drain interval, rather than mistaking that race for a
      // retained service or hiding an actually retained job.
      const cleanupDeadline = Date.now() + 6000;
      do {
        absentAfterBootout = run(["print", target]).status !== 0;
        if (!absentAfterBootout) await pause();
      } while (!absentAfterBootout && Date.now() < cleanupDeadline);
      assert.ok(absentAfterBootout, "QUALIFICATION_SERVICE_REQUIRES_CLEANUP");
    }
  }
  const report = { schema: "outsider/digital-goal-node-service-qualification/v1",
    startedAt, completedAt: new Date().toISOString(), scope: "TEMPORARY_READ_ONLY_LAUNCHD_JOB",
    label: stagedService.label, serviceManifestHash: hash(readFileSync(stagedService.manifestFile)),
    priorPreparation: { bytes: preparationBytes.length, hash: hash(preparationBytes) },
    state: first.session.state, programHash: first.session.programHash,
    journalHeadHash: first.session.actualDelivery.journalHeadHash,
    eventCount: first.session.actualDelivery.eventCount,
    firstPid, secondPid, processChanged: firstPid !== secondPid,
    automaticRestartMs: restartMs, sameTaskAfterRestart: true,
    productClientBefore: { bytes: clientBefore.bytes, outputHash: clientBefore.outputHash },
    productClientAfter: { bytes: clientAfter.bytes, outputHash: clientAfter.outputHash },
    sameProductClientView: true, bootoutStatus, absentAfterBootout,
    loginItemInstalled: false, hostRebootTested: false, inFlightProviderCrashTested: false,
    modelInvocations: 0, newProviderExecutions: 0, paymentActions: 0,
    newDeliveryClaimed: false, qualifierRemovedItsService: true };
  writePrivateExecutionRecordOnce(outputFile, report);
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const [stageReportFile, clientConfigFile, outputFile, ...extra] = process.argv.slice(2);
    assert.ok(stageReportFile && clientConfigFile && outputFile && !extra.length);
    console.log(JSON.stringify(await qualifyDigitalGoalNodeService({
      stagedService: read(stageReportFile), clientConfigFile, outputFile }), null, 2));
  } catch (error) {
    console.error(/^[A-Z][A-Z0-9_]{0,95}$/u.test(error.message) ? error.message : "NODE_SERVICE_QUALIFICATION_FAILED");
    process.exitCode = 1;
  }
}
