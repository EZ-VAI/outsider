import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-session'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { createDeepSeekHarnessPluginCore } from '../../src/outsider-deepseek-harness-plugin-core.js'
import { createDeepSeekHarnessGatewayClient } from '../../src/outsider-deepseek-harness-gateway.js'

export const name = 'outsider-stage05'

export interface OutsiderGateway {
  claimCorrection(request: unknown): Promise<unknown>
  recordAck(ack: unknown): Promise<void>
}

export interface Config {
  handshake?: unknown
  gateway?: OutsiderGateway
  gatewaySocketPath?: string
  gatewayToken?: string
}

/**
 * Optional adapter pinned to DeepSeek Harness commit 47f9438 and the separately
 * recorded rc.6 npm runtime closure.
 * The gateway transport is deliberately injected: this package does not
 * invent socket authority, execute correction text, or declare outcomes.
 */
export function apply(ctx: Context, config: Config = {}) {
  const gateway = config.gateway ?? (() => {
    if (!config.gatewaySocketPath || !config.gatewayToken) {
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
  ctx.on('agent/pre-step', async (payload, next) => (
    await core.preStep(payload, next) as Awaited<ReturnType<typeof next>>
  ))
  ctx.on('session/event', async (_session, event) => { await core.sessionEvent(event) })
}
