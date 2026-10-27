import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { canonicalizeStrict } from './canonical.js';
import { publishPrivateExecutionBytes } from './outsider-user-held-durable-execution-v2.js';

const digest = value => `sha256:${createHash('sha256').update(canonicalizeStrict(value)).digest('hex')}`;
const validSelector = value => typeof value === 'string' && value.length > 0 && value.length <= 512;

/** A portable, semantic observation of the current browser page. The owner can
 * supply a more selective observation for sites with transient/private content. */
export async function observeBrowserPage(page) {
  return page.evaluate(() => {
    const selectorFor = element => {
      if (element.id) {
        const selector = `#${CSS.escape(element.id)}`;
        if (document.querySelectorAll(selector).length === 1) return selector;
      }
      const parts = [];
      for (let node = element; node && node !== document.documentElement; node = node.parentElement) {
        let index = 1;
        for (let sibling = node.previousElementSibling; sibling; sibling = sibling.previousElementSibling)
          if (sibling.localName === node.localName) index++;
        parts.unshift(`${node.localName}:nth-of-type(${index})`);
      }
      return `html > ${parts.join(' > ')}`;
    };
    const controls = [...document.querySelectorAll('input:not([type=hidden]), textarea, select, button, a[href], [role=button]')]
      .filter(element => element.getClientRects().length > 0).slice(0, 200).map(element => ({
        selector: selectorFor(element), tag: element.localName,
        role: element.getAttribute('role'), label: element.getAttribute('aria-label') || element.getAttribute('placeholder') || '',
        text: (element.innerText || element.value && element.type === 'submit' && element.value || '').slice(0, 500),
        value: element.type === 'password' ? null : typeof element.value === 'string' ? element.value.slice(0, 10_000) : null,
        checked: typeof element.checked === 'boolean' ? element.checked : null, disabled: Boolean(element.disabled),
      }));
    return { url: location.href, title: document.title, text: (document.body?.innerText ?? '').slice(0, 20_000), controls };
  });
}

/** Adapter for a single shared page/resource. resolvePage may choose a different
 * Playwright Page per agent when those browser sessions view the same shared app.
 * Its state/receipts directory is private and must be distinct per resource. */
export function createPlaywrightBrowserAdapter({ directory, page, resolvePage = async () => page,
  observePage = observeBrowserPage, reconcileOperation = async () => ({ status: 'UNKNOWN' }), timeoutMs = 5000 }) {
  if (!path.isAbsolute(directory ?? '') || typeof resolvePage !== 'function' || typeof observePage !== 'function'
    || typeof reconcileOperation !== 'function' || !Number.isSafeInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 30_000)
    throw new Error('SHARED_BROWSER_CONFIGURATION_INVALID');
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const file = path.join(directory, 'browser-operations.json');
  const load = () => existsSync(file) ? JSON.parse(readFileSync(file, 'utf8'))
    : { schema: 'outsider/browser-operations/v1', highestFence: 0, operations: {} };
  const save = state => publishPrivateExecutionBytes(file, Buffer.from(canonicalizeStrict(state) + '\n'), { replace: true });
  const getPage = async input => {
    const target = await resolvePage(input);
    if (!target || typeof target.evaluate !== 'function' || typeof target.locator !== 'function') throw new Error('SHARED_BROWSER_PAGE_UNAVAILABLE');
    return target;
  };
  const validate = action => {
    if (!action || !Array.isArray(action.steps) || !action.steps.length || action.steps.length > 16) return false;
    for (const step of action.steps) {
      if (!validSelector(step.selector) || !['click', 'fill', 'press', 'select', 'check', 'uncheck'].includes(step.type)) return false;
      if (['fill', 'press', 'select'].includes(step.type) && (typeof step.value !== 'string' || step.value.length > 10_000)) return false;
    }
    if (action.waitFor && (!validSelector(action.waitFor.selector) || !['text', 'value', 'checked'].includes(action.waitFor.property)
      || !['string', 'boolean'].includes(typeof action.waitFor.equals))) return false;
    return true;
  };
  async function observe(input) { return observePage(await getPage(input)); }
  return Object.freeze({
    observe,
    async capture(input) {
      const bytes = await (await getPage(input)).screenshot({ type: 'jpeg', quality: 70, timeout: timeoutMs });
      if (bytes.length > 2 * 1024 * 1024) throw new Error('SHARED_BROWSER_IMAGE_TOO_LARGE');
      return { mimeType: 'image/jpeg', data: bytes.toString('base64') };
    },
    async execute(input) {
      const { action, operationId, fencingToken, expectedStateHash } = input;
      const state = load();
      if (state.schema !== 'outsider/browser-operations/v1') throw new Error('SHARED_BROWSER_STATE_INVALID');
      if (Object.hasOwn(state.operations, operationId)) {
        const prior = state.operations[operationId];
        if (prior.actionHash !== digest(action)) throw new Error('SHARED_BROWSER_OPERATION_CONFLICT');
        return prior.status === 'PENDING' ? { status: 'UNKNOWN' } : { status: prior.status, operationId };
      }
      if (!validate(action) || !Number.isSafeInteger(fencingToken) || fencingToken < state.highestFence)
        return { status: 'NOT_APPLIED', reason: 'INVALID_ACTION_OR_FENCE' };
      const target = await getPage(input);
      if (digest(await observePage(target)) !== expectedStateHash) return { status: 'NOT_APPLIED', reason: 'STALE_PAGE' };
      await input.assertCurrentClaim?.();
      state.highestFence = fencingToken;
      state.operations[operationId] = { status: 'PENDING', actionHash: digest(action), fencingToken };
      save(state);
      try {
        for (const step of action.steps) {
          await input.assertCurrentClaim?.();
          const locator = target.locator(step.selector);
          if (step.type === 'fill') await locator.fill(step.value, { timeout: timeoutMs });
          else if (step.type === 'press') await locator.press(step.value, { timeout: timeoutMs });
          else if (step.type === 'select') await locator.selectOption(step.value, { timeout: timeoutMs });
          else await locator[step.type]({ timeout: timeoutMs });
          await input.assertCurrentClaim?.();
        }
        if (action.waitFor) {
          const { selector, property, equals } = action.waitFor;
          await target.waitForFunction(({ selector, property, equals }) => {
            const element = document.querySelector(selector);
            if (!element) return false;
            return (property === 'text' ? element.textContent.trim() : element[property]) === equals;
          }, { selector, property, equals }, { timeout: timeoutMs });
          await input.assertCurrentClaim?.();
        }
        state.operations[operationId].status = 'APPLIED'; save(state);
        return { status: 'APPLIED', operationId };
      } catch { return { status: 'UNKNOWN' }; }
    },
    async reconcile(input) {
      const state = load(), operation = state.operations[input.operationId];
      if (!operation) return { status: 'UNKNOWN' };
      if (operation.status !== 'PENDING') return { status: operation.status, operationId: input.operationId };
      const result = await reconcileOperation({ ...input, actionHash: operation.actionHash });
      if (!['APPLIED', 'NOT_APPLIED'].includes(result?.status)) return { status: 'UNKNOWN' };
      operation.status = result.status; save(state);
      return { status: operation.status, operationId: input.operationId };
    },
  });
}
