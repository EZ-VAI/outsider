import { setTimeout as delay } from 'node:timers/promises';

/** Provider-independent HTTP client. Mutations are never retried automatically:
 * reuse a submission/step ID, or reconcile an uncertain resource operation.
 */
export function createSharedAgentClient({ origin, token, fetchImpl = fetch, timeoutMs = 30_000 }) {
  const base = new URL(origin);
  if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password
    || base.pathname !== '/' || base.search || base.hash || typeof token !== 'string' || !token) throw new Error('SHARED_CLIENT_CONFIGURATION_INVALID');
  async function request(route, body, { signal } = {}) {
    const response = await fetchImpl(new URL(route, base), { method: body === undefined ? 'GET' : 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.any([AbortSignal.timeout(timeoutMs), ...(signal ? [signal] : [])]),
    });
    const result = await response.json();
    if (!response.ok) throw Object.assign(new Error(result.error ?? 'SHARED_CLIENT_REQUEST_FAILED'),
      { code: result.error, statusCode: response.status });
    return result;
  }
  function goal(goalId) {
    const route = `/v1/goals/${encodeURIComponent(goalId)}`;
    const methods = Object.fromEntries(['activate', 'claim', 'renew', 'abandon', 'complete', 'resume'].map(name =>
      [name, (body = {}, options) => request(`${route}/${name}`, body, options)]));
    return Object.freeze({ ...methods, inspect: options => request(route, undefined, options),
      observeResource: (body, options) => request(`${route}/resources/observe`, body, options),
      performResource: (body, options) => request(`${route}/resources/perform`, body, options),
      reconcileResource: (body, options) => request(`${route}/resources/reconcile`, body, options) });
  }
  return Object.freeze({ goal, createGoal: (definition, options) => request('/v1/goals', { goal: definition }, options),
    listGoals: options => request('/v1/goals', undefined, options) });
}

/** Run a worker supplied by any agent provider. Task work occurs outside owner
 * locks. Keep its claim alive; signal cancellation when ownership is lost.
 * A task with inherited uncertain effects must reconcile them before completion.
 */
export async function runSharedGoalWorker({ goal, executeTask, ttlMs = 30_000, pollMs = 100, signal }) {
  if (typeof executeTask !== 'function' || !Number.isSafeInteger(ttlMs) || ttlMs < 300 || ttlMs > 300_000
    || !Number.isSafeInteger(pollMs) || pollMs < 10) throw new Error('SHARED_WORKER_CONFIGURATION_INVALID');
  while (!signal?.aborted) {
    let next;
    try { next = await goal.claim({ ttlMs }, { signal }); }
    catch (error) {
      // This explicit owner-busy result means the request never acquired its
      // lock. Unknown network outcomes still propagate without an automatic retry.
      if (error.code !== 'NODE_ALREADY_RUNNING') throw error;
      await delay(pollMs, undefined, { signal }); continue;
    }
    if (!next.claim) {
      if (next.goal.state !== 'ACTIVE') return next.goal;
      await delay(pollMs, undefined, { signal }); continue;
    }
    const { claim } = next, identity = { taskId: claim.task.taskId, leaseId: claim.leaseId, generation: claim.generation };
    const controller = new AbortController(), taskSignal = AbortSignal.any([controller.signal, ...(signal ? [signal] : [])]);
    let renewal = null, leaseError = null;
    const timer = setInterval(() => {
      if (renewal) return;
      renewal = goal.renew({ ...identity, ttlMs }, { signal: taskSignal })
        .catch(error => { leaseError = error; controller.abort(error); }).finally(() => { renewal = null; });
    }, Math.floor(ttlMs / 3));
    const stop = async () => { clearInterval(timer); await renewal; };
    try {
      const resource = Object.fromEntries(['observe', 'perform', 'reconcile'].map(method => [method,
        input => goal[`${method}Resource`]({ ...input, ...identity }, { signal: taskSignal })]));
      const output = await executeTask({ ...claim, resource, signal: taskSignal });
      if (leaseError) throw leaseError; taskSignal.throwIfAborted();
      const result = await goal.complete({ ...identity, submissionId: `submission-${claim.generation}`, output }, { signal });
      await stop();
      if (!result.accepted) { await goal.abandon(identity, { signal }); return { state: 'TASK_REJECTED', taskId: identity.taskId, result }; }
    } catch (error) {
      await stop();
      try { await goal.abandon(identity); } catch { /* Already handed off, accepted or expired. */ }
      throw error;
    }
  }
  signal.throwIfAborted();
}
