/* Public consumer path: no Node owner token, SQL password, model or browser UI.
 * Only a declared PUBLIC, side-effect-free computation is safe to repeat on the
 * other provider. This transport must not be used for purchases or mutations. */
export function createOutsiderJsonFunctionClient(delivery, { fetchImpl = fetch, timeoutMs = 15000 } = {}) {
  if (!["PUBLIC_JSON_FUNCTION_SERVICE_V1", "PUBLIC_JSON_FUNCTION_SERVICE_V2"].includes(delivery?.capability) || delivery.recoveryProviderIndependent !== true
    || !delivery.invocation?.primary || !delivery.invocation?.alternate
    || !Number.isFinite(Date.parse(delivery.availableUntil))) throw new Error("JSON_FUNCTION_DELIVERY_INVALID");
  const { primary, alternate } = delivery.invocation;
  const url = value => { const u = new URL(value); if (u.protocol !== "https:" || u.username || u.password || u.hash || u.port)
    throw new Error("JSON_FUNCTION_ROUTE_INVALID"); return u; };
  const p = url(primary.url), a = url(alternate.url), deno = delivery.capability === "PUBLIC_JSON_FUNCTION_SERVICE_V2";
  const tokenUrl = deno ? null : url(alternate.publicAnonymousTokenUrl);
  if (!p.hostname.endsWith(".workers.dev") || p.pathname !== "/evaluate" || p.search
    || primary.bodyMode !== "DIRECT_JSON" || primary.providerRef !== "cloudflare") throw new Error("JSON_FUNCTION_ROUTE_INVALID");
  if (deno ? (!a.hostname.endsWith(".deno.net") || a.pathname !== "/evaluate" || a.search
      || alternate.providerRef !== "deno" || alternate.bodyMode !== "DIRECT_JSON" || alternate.publicAnonymousTokenUrl !== undefined)
    : (!a.hostname.endsWith(".aws.neon.tech") || a.pathname !== "/neondb/rest/v1/rpc/outsider_evaluate" || a.search
    || tokenUrl.hostname !== a.hostname.replace(".apirest.", ".neonauth.") || tokenUrl.pathname !== "/neondb/auth/token/anonymous"
    || tokenUrl.search || alternate.bodyMode !== "INPUT_FIELD")) throw new Error("JSON_FUNCTION_ROUTE_INVALID");
  return { async invoke(input) {
    if (Date.now() >= Date.parse(delivery.availableUntil)) throw new Error("JSON_FUNCTION_DELIVERY_EXPIRED");
    const serialized = JSON.stringify(input);
    if (serialized === undefined || new TextEncoder().encode(serialized).length > 3000) throw new Error("PUBLIC_JSON_INPUT_TOO_LARGE");
    const attempts = [];
    for (const route of [primary, alternate]) {
      try {
        const headers = { "content-type": "application/json" };
        if (route.publicAnonymousTokenUrl) {
          const response = await fetchImpl(route.publicAnonymousTokenUrl, { redirect: "error", signal: AbortSignal.timeout(timeoutMs) });
          const guest = await response.json(); if (!response.ok || typeof guest.token !== "string") throw new Error("GUEST_ACCESS_UNAVAILABLE");
          headers.authorization = `Bearer ${guest.token}`;
        }
        const response = await fetchImpl(route.url, { method: "POST", headers,
          body: route.bodyMode === "INPUT_FIELD" ? JSON.stringify({ input }) : serialized,
          redirect: "error", signal: AbortSignal.timeout(timeoutMs) });
        attempts.push({ providerRef: route.providerRef, status: response.status });
        if (response.status === 400 || response.status === 422) throw Object.assign(new Error("FUNCTION_INPUT_REJECTED"), { inputRejected: true });
        if (!response.ok) continue;
        const value = await response.json();
        return { value, providerRef: route.providerRef, switchedProvider: attempts.length > 1, attempts,
          functionHash: delivery.functionHash, localComputationUsed: false };
      } catch (error) {
        if (error.inputRejected) throw error;
        if (attempts.at(-1)?.providerRef !== route.providerRef) attempts.push({ providerRef: route.providerRef, status: "TRANSPORT_UNAVAILABLE" });
      }
    }
    throw Object.assign(new Error("JSON_FUNCTION_PROVIDERS_UNAVAILABLE"), { attempts });
  } };
}
