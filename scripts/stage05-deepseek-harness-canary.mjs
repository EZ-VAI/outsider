#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Context } from "@deepseek-ai/cordis";
import { apply as outsiderPlugin } from
  "../integrations/deepseek-harness-outsider-plugin/index.js";
import { createDeepSeekHarnessObservation, deepSeekHarnessActionRef,
  verifyDeepSeekHarnessObservation } from "../src/outsider-deepseek-harness-adapter.js";
import { createDeepSeekHarnessCorrection, createDeepSeekHarnessHandshake,
  createDeepSeekHarnessEffectEvidence, deepSeekHarnessWayBinding,
  verifyDeepSeekHarnessCorrectionAck,
  verifyDeepSeekHarnessEffectEvidence } from
  "../src/outsider-deepseek-harness-protocol.js";
import { canonicalizeStrict } from "../src/canonical.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const args = process.argv.slice(2);
const valueAfter = (flag) => {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : null;
};
const output = path.resolve(valueAfter("--out")
  ?? path.join(root, "artifacts", "deepseek-harness-protocol-canary.json"));
const hash = (value) => `sha256:${createHash("sha256")
  .update(typeof value === "string" || Buffer.isBuffer(value) ? value : canonicalizeStrict(value))
  .digest("hex")}`;
const runtimeProfile = JSON.parse(readFileSync(path.join(root,
  "references", "deepseek-harness-compile-profile.json"), "utf8"));
const sourcePin = JSON.parse(readFileSync(path.join(root,
  "references", "deepseek-harness-source-pin.json"), "utf8"));
const adapterClosure = [
  "integrations/deepseek-harness-outsider-plugin/index.ts",
  "integrations/deepseek-harness-outsider-plugin/index.js",
  "src/outsider-deepseek-harness-plugin-core.js",
  "src/outsider-deepseek-harness-gateway.js",
  "src/outsider-deepseek-harness-protocol.js",
  "src/outsider-deepseek-harness-adapter.js",
  "src/canonical.js",
].map((name) => ({ path: name, sha256: hash(readFileSync(path.join(root, name))) }));
const adapterClosureHash = hash(adapterClosure);
const observedPackages = {};
for (const [name, pinned] of Object.entries(runtimeProfile.packages)) {
  const packageFile = fileURLToPath(import.meta.resolve(`${name}/package.json`));
  const packageJson = JSON.parse(readFileSync(packageFile, "utf8"));
  const packageRoot = path.dirname(packageFile);
  const mainFile = path.resolve(packageRoot, packageJson.main);
  observedPackages[name] = { version: packageJson.version, integrity: pinned.integrity,
    packageJsonSha256: hash(readFileSync(packageFile)),
    main: path.relative(packageRoot, mainFile).replaceAll("\\", "/"),
    mainSha256: hash(readFileSync(mainFile)) };
}
const runtimeClosureHash = hash({ packages: observedPackages,
  adapterClosureHash, sourcePinHash: sourcePin.recordHash });
const privateSessionId = "private-canary-session";
const handshake = createDeepSeekHarnessHandshake({
  sessionIdHash: hash(privateSessionId),
  profileClosureHash: runtimeClosureHash,
  bundleClosureHash: runtimeClosureHash,
  pluginClosureHash: adapterClosureHash,
  modelProviderHash: hash("no-model-provider-used"),
  subagentProviderHash: hash("no-subagent-provider-used"),
  sandboxProviderHash: hash("no-execution-provider-used"),
});
const correctionText = "Apply only the already-audited correction, then await independent verification.";
const actionArguments = '{"command":"npm test"}';
const expectedActionRef = deepSeekHarnessActionRef("shell", actionArguments);
const correction = createDeepSeekHarnessCorrection({
  handshakeHash: handshake.recordHash,
  contractSeal: hash("deepseek-protocol-canary-contract"),
  interventionId: "deepseek-protocol-canary-intervention",
  correctionAuthorityHash: hash("deepseek-protocol-canary-authority"),
  correctionHash: hash(correctionText),
  expectedActionRefs: [expectedActionRef],
  controllerIssuedAtEventSeq: 1,
  harnessEventSeqFloor: 1,
});
const acknowledgements = [];
let offerCount = 0;
const gateway = {
  async claimCorrection(request) {
    offerCount += 1;
    if (request.handshakeHash !== handshake.recordHash || request.harnessEventSeqFloor !== 1) {
      throw new Error("DEEPSEEK_CANARY_CLAIM_BINDING_INVALID");
    }
    return { correction, correctionText };
  },
  async recordAck(ack) { acknowledgements.push(ack); },
};
const ctx = new Context();
await ctx.plugin((pluginContext) => outsiderPlugin(pluginContext, { handshake, gateway }));
const events = [
  { type: "turn/start", seq: 0, time: 1, data: { turn: 1 } },
  { type: "step/start", seq: 1, time: 2, data: { turn: 1, step: 1 } },
];
for (const event of events) await ctx.parallel("session/event", {}, event);
const decision = await ctx.waterfall("agent/pre-step", {
  agent: { id: "private-agent-id" }, turn: 1, step: 1,
}, async () => ({ kind: "enter", messages: [] }));
if (decision?.kind !== "enter" || decision.messages?.length !== 1) {
  throw new Error("DEEPSEEK_CANARY_INJECTION_MISSING");
}
const durable = { type: "user/message", seq: 2, time: 3,
  data: { message: decision.messages[0] } };
events.push(durable,
  { type: "tool/call", seq: 3, time: 4, data: { turn: 1, step: 1,
    callId: "canary-action", name: "shell", arguments: actionArguments } },
  { type: "tool/result", seq: 4, time: 5, data: { turn: 1, step: 1,
    message: { id: "canary-result", role: "user",
      source: { kind: "tool", callId: "canary-action" }, content: [{
        type: "tool-result", toolCallId: "canary-action",
        content: [{ type: "text", text: "ok" }] }] } } },
  { type: "step/end", seq: 5, time: 6, data: { turn: 1, step: 1 } },
  { type: "turn/end", seq: 6, time: 7, data: { turn: 1, reason: { kind: "stop" } } });
await ctx.parallel("session/event", {}, durable);
await ctx.fiber.dispose();
const ack = acknowledgements[0];
const ackVerification = verifyDeepSeekHarnessCorrectionAck(ack, { correction, handshake });
const observation = createDeepSeekHarnessObservation(events, {
  sessionId: privateSessionId,
});
const observationVerification = verifyDeepSeekHarnessObservation(observation);
const effect = createDeepSeekHarnessEffectEvidence({ correction, handshake, ack,
  afterObservation: observation });
const effectVerification = verifyDeepSeekHarnessEffectEvidence(effect, { correction,
  handshake, ack, afterObservation: observation });
const way = deepSeekHarnessWayBinding(handshake);
const result = {
  schema: "outsider/deepseek-harness-protocol-canary/v1",
  recordedAt: new Date().toISOString(),
  upstream: { sourcePinHash: sourcePin.recordHash,
    sourceBinaryEquivalence: sourcePin.sourceBinaryEquivalence,
    runtimeProfileHash: runtimeProfile.recordHash,
    runtimeClosureHash, adapterClosureHash, packages: observedPackages },
  protocol: { realCordisWaterfall: true, officialMessageFactory: true,
    offerCount, injectedMessageSource: decision.messages[0]?.source,
    correctionRecordHash: correction.recordHash,
    ackRecordHash: ack?.recordHash ?? null,
    observationRecordHash: observation.recordHash,
    effectRecordHash: effect.recordHash },
  authority: { lane: "RESEARCH", establishesObservedDelivery: ackVerification.ok,
    establishesEffect: effectVerification.ok, establishesOutcome: false,
    establishesLossOrLiability: false, clearingAuthority: "none" },
  way,
  checks: { ack: ackVerification, observation: observationVerification,
    effect: effectVerification,
    runtimeClosureMatches: runtimeClosureHash === runtimeProfile.runtimeClosureHash,
    adapterClosureMatches: adapterClosureHash === runtimeProfile.adapterClosureHash,
    sourcePinMatches: sourcePin.recordHash === runtimeProfile.sourcePinHash,
    sourceBinaryEquivalenceProven: false },
};
result.ok = ackVerification.ok && observationVerification.ok
  && effectVerification.ok && offerCount === 1
  && result.authority.establishesEffect === true
  && result.authority.establishesOutcome === false
  && result.checks.runtimeClosureMatches === true
  && result.checks.adapterClosureMatches === true
  && result.checks.sourcePinMatches === true
  && result.checks.sourceBinaryEquivalenceProven === false
  && sourcePin.sourceBinaryEquivalence === "UNPROVEN";
result.recordHash = hash(result);
writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({ ok: result.ok, output,
  recordHash: result.recordHash }, null, 2)}\n`);
if (!result.ok) process.exitCode = 1;
