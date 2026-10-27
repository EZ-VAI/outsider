/* Optional evidence gathering for a ready digital executor. This never
 * selects or books a supplier and never makes local execution depend on it. */
import { readPrivateExecutionBytes } from './outsider-user-held-durable-execution-v2.js';
import { discoverDemandWebSources } from './outsider-open-web-demand-sources.js';
import { createPublicHttpsReadOnlyFetchTransportV1 } from './outsider-public-https-read-only-fetch-transport-v1.js';
const read = file => JSON.parse(readPrivateExecutionBytes(file));
export async function discoverDigitalPreparationSources({ graph, plan, discovery, publicDiscoveryApproved,
  cachedSources, writeRecord }, { discoverSources = discoverDemandWebSources } = {}) {
  const requirements = graph.requirements.filter(row => row.capability === 'GENERAL_DIGITAL_AGENT_TASK_V1');
  const ids = new Set(requirements.map(row => row.id));
  const queries = plan.queries.filter(row => ids.has(row.requirementId));
  if (!requirements.length || !queries.length && !requirements.some(row => row.candidateDocumentationUrls?.length)
    || publicDiscoveryApproved !== true) return { sources: null, issue: null };
  if (!discovery) return { sources: null,
    issue: { scope: 'PUBLIC_SOURCE_DISCOVERY', reason: 'OPEN_OUTCOME_DISCOVERY_NOT_CONNECTED' } };
  try {
    if (cachedSources) return { sources: cachedSources, issue: null };
    const deadline = AbortSignal.timeout(20000);
    const publisherFetch = createPublicHttpsReadOnlyFetchTransportV1({ maximumResponseBytes: 2 * 1024 * 1024, timeoutMs: 10000 });
    const signal = options => AbortSignal.any([deadline, ...(options.signal ? [options.signal] : []), AbortSignal.timeout(10000)]);
    const sources = await discoverSources({ graph: { ...graph, requirements }, plan: { ...plan, queries },
      reference: read(discovery.referenceFile), apiToken: read(discovery.capabilityFile).apiToken,
      maximumSearches: 2, maximumObservationsPerSource: 2, includeDocumentationUrls: true,
      prioritizeUnmetWork: true, writeRecord,
      publisherFetch: (url, options) => publisherFetch(url, { ...options, signal: signal(options) }),
      searchFetch: (url, options = {}) => globalThis.fetch(url, { ...options,
        signal: signal(options) }) });
    return { sources, issue: null };
  } catch {
    return { sources: null, issue: { scope: 'PUBLIC_SOURCE_DISCOVERY', reason: 'PUBLIC_SOURCE_DISCOVERY_UNAVAILABLE' } };
  }
}
