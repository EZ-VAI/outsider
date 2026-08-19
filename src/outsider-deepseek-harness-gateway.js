/*
 * Authenticated out-of-process gateway for the DeepSeek Harness plugin.
 *
 * The gateway transports an already-audited correction and a durable delivery
 * acknowledgement.  It cannot run a command, grant a tool, decide an outcome,
 * or turn a delivery ack into effect evidence.  The local token is transport
 * authentication only and is never part of the durable record.
 */

import { createHash, randomUUID } from "node:crypto";
import {
  startControllerRpc, requestController,
} from "./outsider-controller-rpc.js";
import {
  verifyDeepSeekHarnessCorrection, verifyDeepSeekHarnessCorrectionAck,
  verifyDeepSeekHarnessHandshake,
} from "./outsider-deepseek-harness-protocol.js";

const HASH = /^sha256:[a-f0-9]{64}$/;
const digest = (value) => `sha256:${createHash("sha256").update(String(value)).digest("hex")}`;
const plain = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

function validateClaimRequest(request, handshake) {
  if (!plain(request)
    || request.handshakeHash !== handshake.recordHash
    || request.sessionIdHash !== handshake.sessionIdHash
    || !HASH.test(String(request.agentIdHash ?? ""))
    || !Number.isSafeInteger(request.harnessEventSeqFloor)
    || request.harnessEventSeqFloor < -1
    || !Number.isSafeInteger(request.turn ?? 0)
    || !Number.isSafeInteger(request.step ?? 0)
    || Object.hasOwn(request, "sessionId") || Object.hasOwn(request, "agentId")) {
    throw new Error("DEEPSEEK_GATEWAY_CLAIM_REQUEST_INVALID");
  }
}

export function createDeepSeekHarnessGatewayController({
  handshake,
  claimCorrection,
  recordAck,
} = {}) {
  const verifiedHandshake = verifyDeepSeekHarnessHandshake(handshake);
  if (!verifiedHandshake.ok) {
    throw new Error(`DEEPSEEK_GATEWAY_HANDSHAKE_INVALID:${verifiedHandshake.error}`);
  }
  if (typeof claimCorrection !== "function" || typeof recordAck !== "function") {
    throw new Error("DEEPSEEK_GATEWAY_HANDLERS_REQUIRED");
  }
  const offeredByCorrectionHash = new Map();
  const ackByCorrectionHash = new Map();

  return Object.freeze({
    async handleHook(payload) {
      if (payload?.gatewayOperation === "claim-correction") {
        validateClaimRequest(payload.request, handshake);
        const offered = await claimCorrection(Object.freeze({ ...payload.request }));
        if (offered == null) return null;
        const correction = offered?.correction;
        const verified = verifyDeepSeekHarnessCorrection(correction, handshake);
        if (!verified.ok
          || correction.clocks.harnessEventSeqFloor !== payload.request.harnessEventSeqFloor
          || typeof offered.correctionText !== "string"
          || offered.correctionText.length < 1 || offered.correctionText.length > 16_384
          || digest(offered.correctionText) !== correction.correctionHash) {
          throw new Error(`DEEPSEEK_GATEWAY_CORRECTION_INVALID:${verified.error ?? "binding"}`);
        }
        offeredByCorrectionHash.set(correction.recordHash, { correction });
        return { correction, correctionText: offered.correctionText };
      }
      if (payload?.gatewayOperation === "record-ack") {
        const ack = payload.ack;
        const offered = offeredByCorrectionHash.get(ack?.correctionRecordHash);
        if (!offered) throw new Error("DEEPSEEK_GATEWAY_ACK_WITHOUT_OFFER");
        const verified = verifyDeepSeekHarnessCorrectionAck(ack, {
          correction: offered.correction, handshake,
        });
        if (!verified.ok) throw new Error(`DEEPSEEK_GATEWAY_ACK_INVALID:${verified.error}`);
        const prior = ackByCorrectionHash.get(ack.correctionRecordHash);
        if (prior && prior !== ack.recordHash) throw new Error("DEEPSEEK_GATEWAY_ACK_CONFLICT");
        if (prior) return { accepted: true, duplicate: true, ackHash: prior };
        await recordAck(ack);
        ackByCorrectionHash.set(ack.correctionRecordHash, ack.recordHash);
        return { accepted: true, duplicate: false, ackHash: ack.recordHash };
      }
      throw new Error("DEEPSEEK_GATEWAY_OPERATION_INVALID");
    },
    diagnostics() {
      return Object.freeze({ offered: offeredByCorrectionHash.size,
        acknowledged: ackByCorrectionHash.size });
    },
  });
}

export async function startDeepSeekHarnessGateway({
  socketPath,
  token = randomUUID(),
  handshake,
  claimCorrection,
  recordAck,
} = {}) {
  if (!socketPath || typeof token !== "string" || token.length < 24) {
    throw new Error("DEEPSEEK_GATEWAY_TRANSPORT_INVALID");
  }
  const controller = createDeepSeekHarnessGatewayController({
    handshake, claimCorrection, recordAck,
  });
  const rpc = await startControllerRpc({ controller, socketPath, token });
  return Object.freeze({ socketPath: rpc.socketPath, token, close: rpc.close,
    diagnostics: controller.diagnostics });
}

export function createDeepSeekHarnessGatewayClient({
  socketPath,
  token,
  timeoutMs = 30_000,
} = {}) {
  if (!socketPath || typeof token !== "string" || token.length < 24
    || !Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 120_000) {
    throw new Error("DEEPSEEK_GATEWAY_CLIENT_CONFIG_INVALID");
  }
  return Object.freeze({
    claimCorrection(request) {
      return requestController({ socketPath, token, timeoutMs,
        payload: { gatewayOperation: "claim-correction", request } });
    },
    recordAck(ack) {
      return requestController({ socketPath, token, timeoutMs,
        payload: { gatewayOperation: "record-ack", ack } });
    },
  });
}
