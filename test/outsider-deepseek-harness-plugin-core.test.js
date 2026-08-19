import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createDeepSeekHarnessHandshake, createDeepSeekHarnessCorrection,
  verifyDeepSeekHarnessCorrectionAck } from "../src/outsider-deepseek-harness-protocol.js";
import { createDeepSeekHarnessPluginCore } from "../src/outsider-deepseek-harness-plugin-core.js";

const H = (value) => `sha256:${createHash("sha256").update(value).digest("hex")}`;
const makeHandshake = () => createDeepSeekHarnessHandshake({
  sessionIdHash: H("session"), profileClosureHash: H("profile"),
  bundleClosureHash: H("bundle"), pluginClosureHash: H("plugin"),
  modelProviderHash: H("model"), subagentProviderHash: H("subagent"),
  sandboxProviderHash: H("sandbox"),
});

test("a correction is added after downstream pre-step policy and acked only from its durable event", async () => {
  const handshake = makeHandshake();
  const text = "Re-check the tenant key before editing; then run the frozen acceptance.";
  const correction = createDeepSeekHarnessCorrection({
    handshakeHash: handshake.recordHash, contractSeal: H("contract"),
    interventionId: "intervention-deepseek-001", correctionAuthorityHash: H("authority"),
    correctionHash: H(text), expectedActionRefs: [H("acceptance")],
    controllerIssuedAtEventSeq: 88, harnessEventSeqFloor: 2,
  });
  const acks = [];
  const core = createDeepSeekHarnessPluginCore({
    handshake,
    gateway: { async claimCorrection(request) {
      assert.equal(request.harnessEventSeqFloor, 2);
      assert.equal(request.sessionIdHash, handshake.sessionIdHash);
      assert.match(request.agentIdHash, /^sha256:[a-f0-9]{64}$/);
      assert.equal(Object.hasOwn(request, "sessionId"), false);
      return { correction, correctionText: text };
    }, async recordAck(ack) { acks.push(ack); } },
    createMessage: (input) => ({ ...input, id: "message-outsider-001", role: "user" }),
  });
  await core.sessionEvent({ type: "step/start", seq: 2, time: 2, data: {} });
  const decision = await core.preStep({ agent: { id: "session-a" }, turn: 1, step: 2 },
    async () => ({ kind: "enter", messages: [{ id: "existing" }] }));
  assert.deepEqual(decision.messages.map((m) => m.id), ["existing", "message-outsider-001"]);
  assert.equal(acks.length, 0);
  await core.sessionEvent({ type: "user/message", seq: 3, time: 3,
    data: { message: { id: "unrelated" } } });
  assert.equal(acks.length, 0);
  const ack = await core.sessionEvent({ type: "user/message", seq: 4, time: 4,
    data: { message: decision.messages[1] } });
  assert.equal(acks.length, 1);
  assert.equal(verifyDeepSeekHarnessCorrectionAck(ack, { correction, handshake }).ok, true);
  assert.equal(ack.authority.establishesEffect, false);
  assert.equal(core.diagnostics().pendingAckCount, 0);
});

test("a same-id durable message rewrite cannot acknowledge a correction", async () => {
  const handshake = makeHandshake();
  const text = "Use the audited tenant-scoped repair.";
  const correction = createDeepSeekHarnessCorrection({
    handshakeHash: handshake.recordHash, contractSeal: H("contract"),
    interventionId: "intervention-deepseek-003", correctionAuthorityHash: H("authority"),
    correctionHash: H(text), controllerIssuedAtEventSeq: 9, harnessEventSeqFloor: -1,
  });
  const acks = [];
  const core = createDeepSeekHarnessPluginCore({ handshake,
    gateway: { async claimCorrection() { return { correction, correctionText: text }; },
      async recordAck(ack) { acks.push(ack); } },
    createMessage: (input) => ({ ...input, id: "same-id", role: "user" }) });
  const entered = await core.preStep({}, async () => ({ kind: "enter", messages: [] }));
  const durable = entered.messages[0];
  await assert.rejects(() => core.sessionEvent({ type: "user/message", seq: 0, time: 0,
    data: { message: { ...durable, content: [{ type: "text", text: `${text} altered` }] } } }),
  /DURABLE_MESSAGE_HASH_INVALID/);
  assert.equal(acks.length, 0);
  assert.equal(core.diagnostics().pendingAckCount, 1);
  const ack = await core.sessionEvent({ type: "user/message", seq: 1, time: 1,
    data: { message: durable } });
  assert.equal(acks.length, 1);
  assert.equal(verifyDeepSeekHarnessCorrectionAck(ack, { correction, handshake }).ok, true);
});

test("stale floors, altered text and downstream rejection fail closed", async () => {
  const handshake = makeHandshake();
  const text = "audited correction";
  const base = (overrides = {}) => createDeepSeekHarnessCorrection({
    handshakeHash: handshake.recordHash, contractSeal: H("contract"),
    interventionId: "intervention-deepseek-002", correctionAuthorityHash: H("authority"),
    correctionHash: H(text), controllerIssuedAtEventSeq: 4, harnessEventSeqFloor: -1,
    ...overrides,
  });
  const build = (offered) => createDeepSeekHarnessPluginCore({ handshake,
    gateway: { async claimCorrection() { return offered; }, async recordAck() {} },
    createMessage: (input) => ({ ...input, id: "m", role: "user" }) });

  const rejected = build({ correction: base(), correctionText: text });
  assert.deepEqual(await rejected.preStep({}, async () => ({ kind: "reject" })), { kind: "reject" });
  const altered = build({ correction: base(), correctionText: `${text}!` });
  await assert.rejects(() => altered.preStep({}, async () => ({ kind: "enter", messages: [] })),
    /TEXT_HASH_INVALID/);
  const stale = build({ correction: base({ harnessEventSeqFloor: 0 }), correctionText: text });
  await assert.rejects(() => stale.preStep({}, async () => ({ kind: "enter", messages: [] })),
    /STALE_HARNESS_FLOOR/);
});
