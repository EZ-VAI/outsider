/* Runs the existing Node maintenance phases. Each phase retains its own
 * original persistence/retry behavior; one unavailable provider cannot skip
 * unrelated due orders. The caller owns the existing interval. */
import { setImmediate as yieldToRequests } from 'node:timers/promises';
export function createOutcomeNodeMaintenance({ phases, onFailure = () => {} }) {
  if (!Array.isArray(phases) || !phases.length || phases.some(phase =>
    !/^[A-Z][A-Z0-9_]{1,63}$/u.test(phase?.name ?? '') || typeof phase.run !== 'function'))
    throw new Error('NODE_MAINTENANCE_CONFIGURATION_INVALID');
  let flight = null, closing = false;
  return Object.freeze({
    run() {
      if (closing) return Promise.resolve([]);
      if (flight) return flight;
      flight = (async () => {
        const results = [];
        for (const [index, phase] of phases.entries()) {
          if (index) await yieldToRequests();
          // Do not begin another operation once shutdown has started. The
          // operation already in progress finishes before the Node is closed.
          if (closing) break;
          try { await phase.run(); results.push({ phase: phase.name, ok: true }); }
          catch {
            results.push({ phase: phase.name, ok: false });
            // Never log a provider exception: it may contain private request
            // values. A logging failure must not skip remaining maintenance.
            try { onFailure(phase.name); } catch {}
          }
        }
        return results;
      })().finally(() => { flight = null; });
      return flight;
    },
    async close() { closing = true; await flight; },
  });
}
