/*
 * Framework-neutral core for the DeepSeek Harness plugin adapter.
 *
 * The core is deliberately incapable of judging outcomes or executing a
 * supervisor-provided command. It accepts one content-addressed, audited
 * correction, adds it to an already-entering pre-step, then acknowledges only
 * after the exact message is observed in the durable Harness session log.
 */

import { createHash } from "node:crypto";
import { canonicalizeStrict } from "./canonical.js";
import {
  createDeepSeekHarnessCorrectionAck,
  verifyDeepSeekHarnessCorrection,
} from "./outsider-deepseek-harness-protocol.js";

const digest = (value) => `sha256:${createHash("sha256")
  .update(typeof value === "string" ? value : canonicalizeStrict(value)).digest("hex")}`;

function messageFromEvent(event) {
  if (event?.type !== "user/message" || !Number.isSafeInteger(event.seq)) return null;
  const message = event?.data?.message;
  return message && typeof message.id === "string" ? message : null;
}

export function createDeepSeekHarnessPluginCore({
  handshake,
  gateway,
  createMessage,
  pluginName = "outsider-stage05",
} = {}) {
  if (!gateway || typeof gateway.claimCorrection !== "function"
    || typeof gateway.recordAck !== "function") throw new Error("DEEPSEEK_GATEWAY_REQUIRED");
  if (typeof createMessage !== "function") throw new Error("DEEPSEEK_MESSAGE_FACTORY_REQUIRED");

  const deliveredCorrections = new Set();
  const pendingByMessageId = new Map();
  let latestHarnessEventSeq = -1;

  async function preStep(payload, next) {
    const decision = await next();
    if (decision?.kind !== "enter" || !Array.isArray(decision.messages)) return decision;

    const offered = await gateway.claimCorrection({
      handshakeHash: handshake?.recordHash,
      sessionIdHash: handshake?.sessionIdHash,
      agentIdHash: digest(`agent\0${String(payload?.agent?.id ?? "")}`),
      turn: payload?.turn,
      step: payload?.step,
      harnessEventSeqFloor: latestHarnessEventSeq,
    });
    if (offered == null) return decision;

    const { correction, correctionText } = offered;
    const verified = verifyDeepSeekHarnessCorrection(correction, handshake);
    if (!verified.ok) throw new Error(`DEEPSEEK_CORRECTION_REJECTED:${verified.error}`);
    if (correction.clocks.harnessEventSeqFloor !== latestHarnessEventSeq) {
      throw new Error("DEEPSEEK_CORRECTION_STALE_HARNESS_FLOOR");
    }
    if (typeof correctionText !== "string" || correctionText.length === 0
      || digest(correctionText) !== correction.correctionHash) {
      throw new Error("DEEPSEEK_CORRECTION_TEXT_HASH_INVALID");
    }
    if (deliveredCorrections.has(correction.recordHash)) return decision;

    const message = createMessage({
      content: [{ type: "text", text: correctionText }],
      source: {
        kind: "plugin",
        plugin: pluginName,
        form: "notice",
        summary: "Audited Outsider correction",
      },
    });
    if (!message || typeof message.id !== "string") {
      throw new Error("DEEPSEEK_MESSAGE_ID_REQUIRED");
    }
    pendingByMessageId.set(message.id, {
      correction,
      message,
      contentHash: digest(message.content),
      sourceHash: digest(message.source),
    });
    deliveredCorrections.add(correction.recordHash);
    return { kind: "enter", messages: [...decision.messages, message] };
  }

  async function sessionEvent(event) {
    if (Number.isSafeInteger(event?.seq)) latestHarnessEventSeq = Math.max(latestHarnessEventSeq, event.seq);
    const message = messageFromEvent(event);
    if (!message) return null;
    const pending = pendingByMessageId.get(message.id);
    if (!pending) return null;
    /* A durable id is not proof that the correction bytes survived.  Bind the
       acknowledgement to the exact content and plugin source that entered the
       pre-step; a same-id rewrite remains pending and fails closed. */
    if (digest(message.content) !== pending.contentHash
      || digest(message.source) !== pending.sourceHash) {
      throw new Error("DEEPSEEK_DURABLE_MESSAGE_HASH_INVALID");
    }
    const ack = createDeepSeekHarnessCorrectionAck({
      correction: pending.correction,
      handshake,
      durableEventSeq: event.seq,
      durableEventHash: digest(event),
      injectionPoint: "agent/pre-step",
      decision: "observed",
    });
    await gateway.recordAck(ack);
    pendingByMessageId.delete(message.id);
    return ack;
  }

  return Object.freeze({ preStep, sessionEvent, diagnostics: () => Object.freeze({
    latestHarnessEventSeq,
    deliveredCorrectionCount: deliveredCorrections.size,
    pendingAckCount: pendingByMessageId.size,
    establishesEffect: false,
    establishesOutcome: false,
  }) });
}
