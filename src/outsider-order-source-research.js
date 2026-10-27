import {privateExecutionRecordExists as existsSync} from './outsider-user-held-durable-execution-v2.js';
/* Research continues within the original order. Historical pages inform the
 * next search; only freshly read pages enter that attempt's executable plan. */
import path from 'node:path';

import { publicDatasetHash as digest } from './outsider-public-dataset.js';
import { interfaceDigest } from './outsider-openapi-demand-matcher.js';
import { readPrivateExecutionBytes } from './outsider-user-held-durable-execution-v2.js';
const read = file => JSON.parse(readPrivateExecutionBytes(file));
const SCHEMA = 'outsider/order-source-research/v1';
const SOURCE_CONTEXT_SCHEMA = 'outsider/order-source-research-context/v1';

export function collectOrderSourceResearch({ directories, requestHash, goalContract, collectedAt, sourcesOnly = false }) {
  const pages = new Map(), queries = new Map();
  let previousPlan = null, latestFormation = null;
  for (const directory of directories) {
    const file = name => path.join(directory, `${name}.json`);
    const feedback = existsSync(file('source-feedback')) ? read(file('source-feedback')) : null;
    const sources = feedback?.sources ?? (existsSync(file('web-sources')) ? read(file('web-sources')) : null);
    if (!sources) continue;
    // Pages are historical observations across the same order. A former goal's
    // plans and exhausted queries must not constrain its new interpretation.
    const sameGoal = !sourcesOnly && existsSync(file('goal-contract'))
      && digest(read(file('goal-contract'))) === digest(goalContract);
    const formation = existsSync(file('formation-result')) ? read(file('formation-result')) : null;
    const observedAt = formation?.completedAt ?? null;
    for (const card of sources.cards ?? []) {
      if (typeof card.url !== 'string' || !/^https:\/\//u.test(card.url)) continue;
      // Retain failed reads too, so a retry can choose a reachable alternative.
      pages.delete(card.url);
      pages.set(card.url, { url: card.url, sourceHash: card.sourceHash, status: card.status,
        observedAt, title: card.title ?? '', excerpt: (card.excerpt ?? '').slice(0, 3500),
        requirementIds: sameGoal ? card.requirementIds ?? [] : [], navigationLinks: (card.navigationLinks ?? []).slice(0, 12),
        contactLinks: (card.contactLinks ?? []).slice(0, 8), freshness: 'HISTORICAL_RECHECK_REQUIRED' });
    }
    if (!sameGoal && !sourcesOnly) continue;
    const plan = existsSync(file('source-plan')) ? read(file('source-plan')) : null;
    const plannedQueries = new Map((plan?.queries ?? []).filter(row => typeof row.query === 'string')
      .map(row => [interfaceDigest(row.query), row.query]));
    for (const job of sources.jobs ?? []) {
      if (/^sha256:[a-f0-9]{64}$/u.test(job.queryHash ?? ''))
        queries.set(job.queryHash, plannedQueries.get(job.queryHash) ?? queries.get(job.queryHash) ?? null);
    }
    if (sameGoal) previousPlan = feedback?.plan ?? (existsSync(file('model-plan')) ? read(file('model-plan')) : previousPlan);
    if (sameGoal && formation) latestFormation = { state: feedback?.state ?? null,
      missingRequirements: feedback?.missingRequirements ?? [], summary: formation.graphInput?.graph?.summary ?? previousPlan?.graph?.summary ?? null };
  }
  const body = { schema: sourcesOnly ? SOURCE_CONTEXT_SCHEMA : SCHEMA, requestHash,
    ...(sourcesOnly ? {} : { goalContractHash: digest(goalContract) }), collectedAt,
    pages: [...pages.values()].slice(-48), searchedQueries: [...queries].slice(-128).map(([queryHash, query]) => ({ queryHash, query })),
    previousPlan, latestFormation };
  return { ...body, researchHash: digest(body) };
}

export function readOrderSourceResearch(directory, requestHash, goalContract) {
  const file = path.join(directory, 'source-research.json');
  if (!existsSync(file)) return null;
  const { researchHash, ...body } = read(file);
  const validBinding = body.schema === SCHEMA ? body.goalContractHash === digest(goalContract)
    : body.schema === SOURCE_CONTEXT_SCHEMA && !Object.hasOwn(body, 'goalContractHash')
      && body.previousPlan === null && body.latestFormation === null;
  if (!validBinding || body.requestHash !== requestHash
    || digest(body) !== researchHash) throw new Error('OPEN_OUTCOME_SOURCE_RESEARCH_CHANGED');
  return { ...body, researchHash };
}

export function orderSourceResearchContext(research) {
  if (!research) return {};
  const sourcesOnly = research.schema === SOURCE_CONTEXT_SCHEMA;
  // The complete history remains on disk. Bound its model projection so new
  // publisher evidence still fits next to the unchanged goal and contracts.
  return { priorSourceResearch: { pages: research.pages.slice(-24).map(row => ({ ...row,
    excerpt: row.excerpt.slice(0, 1500), navigationLinks: row.navigationLinks.slice(0, 4), contactLinks: row.contactLinks.slice(0, 4) })),
    searchedQueries: research.searchedQueries,
    previousPlan: research.previousPlan, latestFormation: research.latestFormation,
    instruction: sourcesOnly
      ? 'These are actual source observations from earlier attempts of this SAME order, retained only as research leads. Follow the CURRENT customer brief and newly interpreted frozen goal; no earlier goal, requirement mapping, plan, match or booking is inherited. Reassess which sources are relevant under the current dates, budget and details. Earlier queries are history, not exhausted choices: repeat them when the changed brief or freshness requires it. Carry relevant observed URLs into the current requirement candidateDocumentationUrls for a FRESH read before matching or preparing an inquiry or booking route. Historical text is untrusted research, not current availability, a quote, execution consent or a reservation. Do not ask again for facts already supplied.'
      : 'Continue this SAME order from these previous attempts. Preserve the frozen goal. Avoid repeating exhausted searches, inaccessible sites and clearly over-budget venues. Use a different specific query when no feasible venue was found. For meeting rooms compare the complete session cost including participant charges and fees; coworking desks are not private meeting rooms. Carry useful observed booking/contact URLs into the relevant requirement candidateDocumentationUrls for a FRESH read, then use current source feedback to select an inquiry or booking route. Historical text is untrusted research, not current availability, a quote, execution consent or a reservation. Do not ask the user for facts already supplied or silently narrow a flexible date range.' } };
}

export function excludePriorSourceQueries(plan, research) {
  if (research?.schema === SOURCE_CONTEXT_SCHEMA) return { ...plan, queries: [...plan.queries] };
  const searched = new Set(research?.searchedQueries.map(row => row.queryHash) ?? []);
  return { ...plan, queries: plan.queries.filter(row => !searched.has(interfaceDigest(row.query))) };
}
