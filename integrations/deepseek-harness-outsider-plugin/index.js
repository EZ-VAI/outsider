import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { createDeepSeekHarnessPluginCore } from '../../src/outsider-deepseek-harness-plugin-core.js'
import { createDeepSeekHarnessGatewayClient } from '../../src/outsider-deepseek-harness-gateway.js'

export const name = 'outsider-stage05'

/**
 * Attach an audited Outsider correction transport to DeepSeek Harness.
 * The plugin can establish durable delivery only. It cannot execute the
 * correction or declare an effect, outcome, loss, or liability.
 * @param {import('@deepseek-ai/cordis').Context} ctx
 * @param {{handshake?: unknown, gateway?: object, gatewaySocketPath?: string, gatewayToken?: string}} [config]
 */
export function apply(ctx, config = {}) {
  const gateway = config.gateway ?? (() => {
    if (!config.gatewaySocketPath || !config.gatewayToken) {
      /* Plugin discovery is not proof that the local controller is reachable.
         Keep Harness usable and let the core inject one durable, visible
         UNSUPERVISED notice at the first boundary. */
      return {
        async claimCorrection() { throw new Error('OUTSIDER_DEEPSEEK_GATEWAY_CONFIG_REQUIRED') },
        async recordAck() { throw new Error('OUTSIDER_DEEPSEEK_GATEWAY_CONFIG_REQUIRED') },
      }
    }
    return createDeepSeekHarnessGatewayClient({
      socketPath: config.gatewaySocketPath,
      token: config.gatewayToken,
    })
  })()
  const core = createDeepSeekHarnessPluginCore({
    handshake: config.handshake,
    gateway,
    createMessage: createUserMessage,
  })
  ctx.on('agent/pre-step', async (payload, next) => core.preStep(payload, next))
  ctx.on('session/event', async (_session, event) => { await core.sessionEvent(event) })
}
