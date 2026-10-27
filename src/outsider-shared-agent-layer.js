import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { createSharedGoalCoordinator } from './outsider-shared-goal-coordinator.js';

const fail = (code, statusCode = 400) => { throw Object.assign(new Error(code), { code, statusCode }); };
const goalIdValid = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,100}$/u.test(value);

/** One owner gateway, many providers and goals, one shared resource namespace.
 * authenticate supplies an actor from the owner's transport identity. JSON never
 * selects its own actor. Model APIs and UI/device drivers remain adapters.
 */
export function createSharedAgentLayer({ directory, authorize, verifyTask, verifyGoal, resources = {}, clock = Date.now }) {
  if (!path.isAbsolute(directory ?? '')) fail('SHARED_LAYER_DIRECTORY_INVALID');
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const root = realpathSync(directory), goalsDirectory = path.join(root, 'goals');
  mkdirSync(goalsDirectory, { recursive: true, mode: 0o700 });
  const coordinators = new Map();
  function goal(goalId) {
    if (!goalIdValid(goalId)) fail('SHARED_LAYER_GOAL_ID_INVALID');
    if (!coordinators.has(goalId)) coordinators.set(goalId, createSharedGoalCoordinator({
      directory: path.join(goalsDirectory, createHash('sha256').update(goalId).digest('hex')),
      resourceDirectory: path.join(root, 'resources'), authorize, verifyTask, verifyGoal, resources, clock,
    }));
    return coordinators.get(goalId);
  }
  async function list({ actorId }) {
    const result = [];
    for (const entry of readdirSync(goalsDirectory, { withFileTypes: true })) {
      const file = path.join(goalsDirectory, entry.name, 'shared-goal.json');
      if (!entry.isDirectory() || !existsSync(file)) continue;
      const { definition } = JSON.parse(readFileSync(file, 'utf8'));
      try { result.push(await goal(definition.goalId).inspect({ actorId })); }
      catch (error) { if (error.code !== 'SHARED_GOAL_NOT_AUTHORIZED') throw error; }
    }
    return result;
  }
  function handler({ authenticate }) {
    if (typeof authenticate !== 'function') fail('SHARED_LAYER_AUTHENTICATION_REQUIRED');
    return async (request, response) => {
      const send = (status, value) => {
        response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
        response.end(JSON.stringify(value) + '\n');
      };
      try {
        let actorId;
        try { actorId = await authenticate(request); } catch { fail('SHARED_LAYER_UNAUTHENTICATED', 401); }
        if (typeof actorId !== 'string' || !actorId) fail('SHARED_LAYER_UNAUTHENTICATED', 401);
        const pathname = new URL(request.url, 'http://owner.local').pathname;
        if (request.method === 'GET' && pathname === '/v1/goals') { send(200, { goals: await list({ actorId }) }); return; }
        let body = {};
        if (request.method === 'POST') {
          const chunks = []; let size = 0;
          for await (const chunk of request) {
            size += chunk.length; if (size > 131_072) fail('SHARED_LAYER_BODY_TOO_LARGE', 413);
            chunks.push(chunk);
          }
          try { body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); }
          catch { fail('SHARED_LAYER_JSON_INVALID'); }
          if (!body || Array.isArray(body) || typeof body !== 'object') fail('SHARED_LAYER_BODY_INVALID');
        }
        if (request.method === 'POST' && pathname === '/v1/goals') {
          send(200, await goal(body.goal?.goalId).create({ actorId, goal: body.goal })); return;
        }
        const route = /^\/v1\/goals\/([^/]+)(?:\/(activate|claim|renew|abandon|complete|resume|resources\/(?:observe|capture|perform|reconcile)))?$/u.exec(pathname);
        if (!route) fail('SHARED_LAYER_ROUTE_NOT_FOUND', 404);
        const coordinator = goal(decodeURIComponent(route[1])), operation = route[2];
        if (request.method === 'GET' && !operation) { send(200, await coordinator.inspect({ actorId })); return; }
        if (request.method !== 'POST' || !operation) fail('SHARED_LAYER_ROUTE_NOT_FOUND', 404);
        const method = { 'resources/observe': 'observeResource', 'resources/capture': 'captureResource', 'resources/perform': 'performResource',
          'resources/reconcile': 'reconcileResource' }[operation] ?? operation;
        send(200, await coordinator[method]({ ...body, actorId }));
      } catch (error) {
        const code = error.code ?? error.outsiderCode ?? 'SHARED_LAYER_OWNER_UNAVAILABLE';
        const known = /^(SHARED_(GOAL|RESOURCE|LAYER)_|NODE_ALREADY_RUNNING)/u.test(code);
        const status = error.statusCode ?? (/NOT_AUTHORIZED|NOT_ALLOWED/u.test(code) ? 403
          : /NOT_FOUND/u.test(code) ? 404 : /LOST|CONFLICT|BUSY|STALE|RECONCILIATION_REQUIRED|NODE_ALREADY_RUNNING/u.test(code) ? 409
            : known ? 400 : 503);
        if (!response.headersSent) send(status, { error: known ? code : 'SHARED_LAYER_OWNER_UNAVAILABLE' });
        else response.destroy();
      }
    };
  }
  return Object.freeze({ goal, list, handler });
}
