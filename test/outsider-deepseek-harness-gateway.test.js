import test from "node:test";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  createDeepSeekHarnessCorrection, createDeepSeekHarnessCorrectionAck,
  createDeepSeekHarnessHandshake,
} from "../src/outsider-deepseek-harness-protocol.js";
import {
  createDeepSeekHarnessGatewayClient, createDeepSeekHarnessGatewayController,
  startDeepSeekHarnessGateway,
} from "../src/outsider-deepseek-harness-gateway.js";

const H = (value) => `sha256:${createHash("sha256").update(value).digest("hex")}`;
const handshake = () => createDeepSeekHarnessHandshake({
  sessionIdHash: H("session"), profileClosureHash: H("profile"),
  bundleClosureHash: H("bundle"), pluginClosureHash: H("plugin"),
  modelProviderHash: H("model"), subagentProviderHash: H("subagent"),
  sandboxProviderHash: H("sandbox"),
});

function correctionFor(h, text = "Apply the audited tenant-key repair.") {
  return createDeepSeekHarnessCorrection({ handshakeHash: h.recordHash,
    contractSeal: H("contract"), interventionId: "intervention-gateway-0001",
    correctionAuthorityHash: H("authority"), correctionHash: H(text),
    controllerIssuedAtEventSeq: 10, harnessEventSeqFloor: 4 });
}

test("gateway refuses raw identities and unaudited correction bytes", async () => {
  const h = handshake();
  const correction = correctionFor(h);
  const controller = createDeepSeekHarnessGatewayController({ handshake: h,
    async claimCorrection() { return { correction, correctionText: "altered" }; },
    async recordAck() {} });
  await assert.rejects(controller.handleHook({ gatewayOperation: "claim-correction",
    request: { handshakeHash: h.recordHash, sessionIdHash: h.sessionIdHash,
      sessionId: "raw", agentIdHash: H("agent"), turn: 1, step: 1,
      harnessEventSeqFloor: 4 } }), /CLAIM_REQUEST_INVALID/);
  await assert.rejects(controller.handleHook({ gatewayOperation: "claim-correction",
    request: { handshakeHash: h.recordHash, sessionIdHash: h.sessionIdHash,
      agentIdHash: H("agent"), turn: 1, step: 1, harnessEventSeqFloor: 4 } }),
  /CORRECTION_INVALID/);
});

test("authenticated local gateway binds one offer to one durable ack", async () => {
  const h = handshake();
  const text = "Apply the audited tenant-key repair.";
  const correction = correctionFor(h, text);
  const acks = [];
  const socketPath = join(tmpdir(), `outsider-dsh-${process.pid}-${Date.now()}.sock`);
  const gateway = await startDeepSeekHarnessGateway({ socketPath,
    token: randomUUID(), handshake: h,
    async claimCorrection() { return { correction, correctionText: text }; },
    async recordAck(ack) { acks.push(ack); } });
  const client = createDeepSeekHarnessGatewayClient(gateway);
  try {
    const offered = await client.claimCorrection({ handshakeHash: h.recordHash,
      sessionIdHash: h.sessionIdHash, agentIdHash: H("agent"), turn: 1, step: 1,
      harnessEventSeqFloor: 4 });
    assert.equal(offered.correction.recordHash, correction.recordHash);
    const ack = createDeepSeekHarnessCorrectionAck({ correction, handshake: h,
      durableEventSeq: 5, durableEventHash: H("event"),
      injectionPoint: "agent/pre-step", decision: "observed" });
    assert.deepEqual(await client.recordAck(ack), {
      accepted: true, duplicate: false, ackHash: ack.recordHash,
    });
    assert.equal(acks.length, 1);
    assert.equal((await client.recordAck(ack)).duplicate, true);
    assert.equal(acks.length, 1);
  } finally {
    await gateway.close();
  }
});
