import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import path from "node:path";
import test from "node:test";
import {
  createMemoryUserHeldFormationLeaseBrokerV1,
  createUserHeldFormationPrivateBindingV1,
  deriveUserHeldFormationExecutorCapabilityHashV1,
} from "../src/outsider-user-held-formation-executor-protocol-v1.js";
import { runDurableUserHeldFormationExecutorV2, writePrivateExecutionRecordOnce,replacePrivateExecutionRecord,publishPrivateExecutionBytes,
  withUserHeldExecutionLockV2, executionLockPort, EXECUTION_LOCK_PORTS } from "../src/outsider-user-held-durable-execution-v2.js";
import { createServer } from "node:net";

test('interruption during write or publication leaves absent or complete immutable records', t => {
  const root = mkdtempSync(path.join(tmpdir(), 'outsider-atomic-record-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const moduleUrl = new URL('../src/outsider-user-held-durable-execution-v2.js', import.meta.url).href;
  const value = { taskId: 'recovered-order', amountMinor: '12000', content: 'x'.repeat(65536) };
  for (const phase of ['write', 'sync', 'publish']) {
    const file = path.join(root, phase + '.json');
    const child = spawnSync(process.execPath, ['--input-type=module', '-e', `
      import fs from 'node:fs'; import {syncBuiltinESMExports} from 'node:module';
      const phase=process.argv[1], file=process.argv[2];
      const write=fs.writeSync, sync=fs.fsyncSync, link=fs.linkSync;
      if(phase==='write')fs.writeSync=(fd,b,o,n)=>{write(fd,b,o,Math.min(32,n));process.kill(process.pid,'SIGKILL');};
      if(phase==='sync')fs.fsyncSync=fd=>{sync(fd);process.kill(process.pid,'SIGKILL');};
      if(phase==='publish')fs.linkSync=(a,b)=>{link(a,b);process.kill(process.pid,'SIGKILL');};
      syncBuiltinESMExports();
      const {writePrivateExecutionRecordOnce}=await import(${JSON.stringify(moduleUrl)});
      writePrivateExecutionRecordOnce(file,JSON.parse(process.argv[3]));
    `, phase, file, JSON.stringify(value)]);
    assert.equal(child.signal, 'SIGKILL');
    if (existsSync(file)) assert.deepEqual(JSON.parse(readFileSync(file)), value);
    else assert.notEqual(phase, 'publish');
    writePrivateExecutionRecordOnce(file, value);
    assert.deepEqual(JSON.parse(readFileSync(file)), value);
    assert.throws(() => writePrivateExecutionRecordOnce(file, { ...value, amountMinor: '999' }), /LOCAL_RECORD_MISMATCH/);
  }
});

test('replacement interrupted before publication retains the old whole record; artifact bytes can be replayed at any size',t=>{
  const root=mkdtempSync(path.join(tmpdir(),'outsider-atomic-replace-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
  const moduleUrl=new URL('../src/outsider-user-held-durable-execution-v2.js',import.meta.url).href;
  for(const phase of ['write','publish']){
    const file=path.join(root,phase+'.json'),before={status:'REQUESTED'},after={status:'RECONCILED'};
    replacePrivateExecutionRecord(file,before);
    const child=spawnSync(process.execPath,['--input-type=module','-e',`
      import fs from 'node:fs';import {syncBuiltinESMExports} from 'node:module';
      const phase=process.argv[1],file=process.argv[2],write=fs.writeSync,rename=fs.renameSync;
      if(phase==='write')fs.writeSync=(fd,b,o,n)=>{write(fd,b,o,Math.min(2,n));process.kill(process.pid,'SIGKILL');};
      if(phase==='publish')fs.renameSync=(a,b)=>{rename(a,b);process.kill(process.pid,'SIGKILL');};
      syncBuiltinESMExports();const {replacePrivateExecutionRecord}=await import(${JSON.stringify(moduleUrl)});
      replacePrivateExecutionRecord(file,JSON.parse(process.argv[3]));
    `,phase,file,JSON.stringify(after)]);
    assert.equal(child.signal,'SIGKILL');assert.deepEqual(JSON.parse(readFileSync(file)),phase==='write'?before:after);
    replacePrivateExecutionRecord(file,after);assert.deepEqual(JSON.parse(readFileSync(file)),after);
  }
  for(const length of [0,2*1024*1024]){
    const file=path.join(root,'artifact-'+length),bytes=Buffer.alloc(length,42);
    publishPrivateExecutionBytes(file,bytes);publishPrivateExecutionBytes(file,bytes);assert.deepEqual(readFileSync(file),bytes);
  }
});

const NOW = "2026-09-05T16:00:00.000Z";
const EXPIRES = "2026-09-05T17:00:00.000Z";
const TOKEN = "fixture-durable-executor-token-not-a-real-secret-000001";
const h = (value) => `sha256:${createHash("sha256").update(value).digest("hex")}`;
const result = (state = "COMPLETED") => ({ state,
  reasonCode: state === "HOLD" ? "PROGRAM_AWAITING_NEXT_EVENT" : "PROGRAM_TERMINAL_OBSERVED",
  resultHash: h(`private-result:${state}`), sourceOccurrenceHashes: [h("private-provider-receipt")],
  externalEffect: state === "HOLD" ? "UNKNOWN" : "CONFIRMED", retryDisposition: "DO_NOT_RETRY" });

function fixture(t, { adapterVersion = "2.0.0" } = {}) {
  const root = mkdtempSync(path.join(tmpdir(), "outsider-durable-node-v2-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const key = randomBytes(32);
  const privateBytes = Buffer.from('{"fixture":"durable-private-program"}\n');
  const job = { schema: "outsider/formation-job/v1", orderId: `order:durable:${randomBytes(12).toString("hex")}`,
    planHash: h("private-plan"), parameterEnvelopeHash: h(privateBytes),
    adapterBinding: { adapterId: "user-held-outcome-program", adapterVersion },
    outcomeProgramHash: h("outcome-program"), graphRefs: {
      principalEpochHash: h("principal"), accountableDeploymentHash: h("deployment"),
      runtimeOrEmbodimentHash: h("runtime"), delegationHash: h("delegation"),
      episodeHash: h("episode"), attemptHash: h("attempt"),
    }, issuedAt: "2026-09-05T15:00:00.000Z", expiresAt: EXPIRES };
  const state = { terminal: false, providerCalls: 0, claims: [], receipts: [],
    brokerNow: NOW, executorNow: NOW, loseAcceptedReceipt: false,
    provider: async () => { state.terminal = true; return result(); } };
  function makeBinding() {
    return createUserHeldFormationPrivateBindingV1({
      privateEnvelopeBytes: privateBytes, commitmentKeyBytes: key,
      composition: { job, executor: { async executeFrozenPlan(invocation) {
        state.providerCalls += 1;
        assert.deepEqual(invocation.job, job);
        return state.provider(invocation);
      } } },
    });
  }
  const binding = makeBinding();
  const executorCapabilityHash = deriveUserHeldFormationExecutorCapabilityHashV1({
    bearerToken: TOKEN, jobHash: binding.jobHash,
  });
  const broker = createMemoryUserHeldFormationLeaseBrokerV1({ clock: () => state.brokerNow });
  broker.enqueue(binding.job, executorCapabilityHash);
  const journalDirectory = path.join(root, "journal");
  const input = (selected = binding) => ({ binding: selected, journalDirectory,
    centralOrigin: "https://formation.example", bearerToken: TOKEN, executorCapabilityHash });
  const dependencies = {
    clock: () => state.executorNow,
    isLocalProgramTerminal: () => state.terminal,
    fetchImpl: async (url, init) => {
      assert.equal(new URL(url).origin, "https://formation.example");
      assert.equal(init.method, "POST");
      assert.equal(init.headers.authorization, `Bearer ${TOKEN}`);
      const body = JSON.parse(init.body);
      let value;
      if (new URL(url).pathname === "/v1/client-execution-claims") {
        value = broker.claim(body);
        // Match the deployed broker: repeated claims keep the same lease but
        // expose HOLD without another invocation; Memory broker owns state.
        if (state.claims.length && value.state === "CLAIMED") {
          value = { ...value, state: "HOLD", invocation: null };
        }
        state.claims.push(value);
      } else {
        assert.equal(new URL(url).pathname, `/v1/client-executions/${binding.jobKey}/receipt`);
        state.receipts.push(String(init.body));
        value = broker.complete(body);
        if (state.loseAcceptedReceipt) {
          state.loseAcceptedReceipt = false;
          throw new Error("fixture accepted receipt response lost");
        }
      }
      return new Response(JSON.stringify(value), { status: 200,
        headers: { "content-type": "application/json" } });
    },
  };
  return { root, state, job, binding, broker, journalDirectory, input, dependencies, makeBinding,
    run: (selected) => runDurableUserHeldFormationExecutorV2(input(selected), dependencies) };
}

for (const interrupted of [false, true]) {
  test(`${interrupted ? "interrupted" : "HOLD"} program never completes broker; cold binding continues the same lease`, async (t) => {
    const f = fixture(t);
    f.state.provider = async () => {
      if (interrupted) throw new Error("fixture process interrupted");
      return result("HOLD");
    };
    await assert.rejects(f.run(), /LOCAL_PROGRAM_NOT_TERMINAL/u);
    const claimBefore = f.broker.read(f.binding.jobKey);
    assert.equal(claimBefore.state, "CLAIMED");
    assert.equal(claimBefore.completion, null);
    assert.equal(f.state.receipts.length, 0);
    assert.equal(existsSync(path.join(f.journalDirectory, "result-submission.json")), false);
    const oldClaimBytes = readFileSync(path.join(f.journalDirectory, "claim-binding.json"));
    f.state.provider = async () => { f.state.terminal = true; return result(); };
    const coldBinding = f.makeBinding();
    assert.notEqual(coldBinding, f.binding);
    assert.equal(coldBinding.jobHash, f.binding.jobHash);
    const completed = await f.run(coldBinding);
    assert.equal(completed.state, "COMPLETE");
    assert.equal(completed.authorityMinted, false);
    assert.equal(completed.outcomeCommitted, false);
    assert.equal(f.state.claims[0].state, "CLAIMED");
    assert.equal(f.state.claims[1].state, "HOLD");
    assert.equal(f.state.providerCalls, 2);
    assert.equal(f.state.receipts.length, 1);
    assert.equal(f.broker.read(f.binding.jobKey).leaseHash, claimBefore.leaseHash);
    assert.ok(readFileSync(path.join(f.journalDirectory, "claim-binding.json")).equals(oldClaimBytes));
    for (const name of readdirSync(f.journalDirectory)) {
      assert.equal(statSync(path.join(f.journalDirectory, name)).mode & 0o777, 0o600);
    }
    assert.equal(f.state.receipts[0].includes(f.job.planHash), false);
    assert.equal(f.state.receipts[0].includes(h("private-provider-receipt")), false);
  });
}

test("a completed-looking result with nonterminal local state is not submitted", async (t) => {
  const f = fixture(t);
  f.state.provider = async () => result();
  await assert.rejects(f.run(), /LOCAL_PROGRAM_NOT_TERMINAL/u);
  assert.equal(f.state.receipts.length, 0);
  assert.equal(f.broker.read(f.binding.jobKey).state, "CLAIMED");
});

test("HOLD is not submitted even when the local terminal callback says true", async (t) => {
  const f = fixture(t);
  f.state.provider = async () => { f.state.terminal = true; return result("HOLD"); };
  await assert.rejects(f.run(), /LOCAL_PROGRAM_NOT_TERMINAL/u);
  assert.equal(f.state.receipts.length, 0);
});

test("accepted receipt with lost response replays completion without provider I/O", async (t) => {
  const f = fixture(t);
  f.state.loseAcceptedReceipt = true;
  await assert.rejects(f.run(), /accepted receipt response lost/u);
  assert.equal(f.broker.read(f.binding.jobKey).state, "COMPLETE");
  assert.equal(f.state.providerCalls, 1);
  assert.equal(existsSync(path.join(f.journalDirectory, "completion.json")), false);
  const submissionBefore = readFileSync(path.join(f.journalDirectory, "result-submission.json"));
  f.state.provider = async () => { throw new Error("must not execute provider again"); };
  const completed = await f.run(f.makeBinding());
  assert.equal(completed.state, "COMPLETE");
  assert.equal(completed.replayed, true);
  assert.equal(completed.receiptHash, f.broker.read(f.binding.jobKey).completion.receiptHash);
  assert.equal(f.state.providerCalls, 1);
  assert.equal(f.state.receipts.length, 1);
  assert.ok(readFileSync(path.join(f.journalDirectory, "result-submission.json")).equals(submissionBefore));
  assert.equal(existsSync(path.join(f.journalDirectory, "completion.json")), true);
});

test("lease already expired on the node forbids provider execution", async (t) => {
  const f = fixture(t);
  // Broker observation still falls in its publication window; the node's
  // current clock has reached the returned lease expiry before effect start.
  f.state.executorNow = EXPIRES;
  await assert.rejects(f.run(), /LEASE_EXPIRED_NO_EXECUTION/u);
  assert.equal(f.state.providerCalls, 0);
  assert.equal(f.state.receipts.length, 0);
  assert.equal(f.broker.read(f.binding.jobKey).state, "CLAIMED");
});

test("same-host independent bindings cannot concurrently execute one leased job", async (t) => {
  const f = fixture(t);
  let entered;
  let release;
  const enteredPromise = new Promise((resolve) => { entered = resolve; });
  const continuePromise = new Promise((resolve) => { release = resolve; });
  f.state.provider = async () => {
    entered(); await continuePromise; f.state.terminal = true; return result();
  };
  const first = f.run();
  await enteredPromise;
  try {
    await assert.rejects(f.run(f.makeBinding()), /NODE_ALREADY_RUNNING/u);
    assert.equal(f.state.providerCalls, 1);
    assert.equal(f.state.claims.length, 1);
  } finally { release(); }
  assert.equal((await first).state, "COMPLETE");
  assert.equal(f.state.receipts.length, 1);
});

test("legacy keyed binding is rejected before any broker or provider I/O", async (t) => {
  const f = fixture(t, { adapterVersion: "1.0.0" });
  await assert.rejects(f.run(), /DURABLE_V2_BINDING_REQUIRED/u);
  assert.equal(f.state.claims.length, 0);
  assert.equal(f.state.providerCalls, 0);
});

test("an unrelated socket on an ephemeral port never blocks an execution lock", async (t) => {
  // Lock ports stay below every default ephemeral range, so an outbound
  // connection can never hold one. Before, a socket that happened to own the
  // lock's port (49152 to 65535) made the lock report NODE_ALREADY_RUNNING.
  const ephemeralLow = 32768;
  for (let i = 0; i < 2000; i++) {
    const port = executionLockPort(`sha256:${randomBytes(32).toString("hex")}`);
    assert.ok(port >= EXECUTION_LOCK_PORTS.first && port < EXECUTION_LOCK_PORTS.first + EXECUTION_LOCK_PORTS.count && port < ephemeralLow);
  }
  const oldPort = id => 49152 + createHash("sha256").update(id).digest().readUInt16BE(0) % 16384;
  let id, blocker;
  for (let attempt = 0; attempt < 20 && !blocker; attempt++) {
    id = `sha256:${randomBytes(32).toString("hex")}`;
    const server = createServer(socket => socket.destroy());
    blocker = await new Promise(resolve => { server.once("error", () => resolve(null)); server.listen({ port: oldPort(id), host: "127.0.0.1" }, () => resolve(server)); });
  }
  assert.ok(blocker, "a free port for the simulated unrelated socket");
  t.after(() => new Promise(resolve => blocker.close(resolve)));
  assert.equal(await withUserHeldExecutionLockV2(id, async () => "acquired"), "acquired");
  // Real contention for the same lock id is still refused.
  await withUserHeldExecutionLockV2(id, async () => {
    await assert.rejects(withUserHeldExecutionLockV2(id, async () => "second"), /NODE_ALREADY_RUNNING/u);
  });
});

test("a lock held briefly by another holder is waited for, not reported busy; a lock held too long still is", async () => {
  const id = `sha256:${randomBytes(32).toString("hex")}`;
  let release;const held = withUserHeldExecutionLockV2(id, () => new Promise(resolve => { release = resolve; }));
  await new Promise(resolve => setTimeout(resolve, 20));
  const started = Date.now(), second = withUserHeldExecutionLockV2(id, async () => "second");
  setTimeout(() => release("first"), 150);
  assert.equal(await held, "first");assert.equal(await second, "second");assert.ok(Date.now() - started < 1500);
  await withUserHeldExecutionLockV2(id, async () => {
    await assert.rejects(withUserHeldExecutionLockV2(id, async () => "late", { waitMs: 100 }), /NODE_ALREADY_RUNNING/u);
  });
});
