/* Native public CI allocation, source build and actual output retrieval. The
 * provider's success flag is necessary, but the result must also name the exact
 * source packet and satisfy the caller's HTTP checks. No model or local build. */
import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { readPrivateExecutionBytes, writePrivateExecutionRecordOnce as writeOnce } from "./outsider-user-held-durable-execution-v2.js";
export const softwareBytesHash = data => `sha256:${createHash("sha256").update(data).digest("hex")}`;
const read = file => JSON.parse(readPrivateExecutionBytes(file));
export function normalizePublicSoftwareInput(input) {
  if (!input || Object.keys(input).sort().join(",") !== "checks,entry,files,visibility" || input.visibility !== "PUBLIC"
    || !input.files || typeof input.files !== "object" || Array.isArray(input.files)
    || Object.keys(input.files).length < 1 || Object.keys(input.files).length > 12
    || Object.entries(input.files).some(([name, source]) => !/^[a-zA-Z0-9_-]+\.(ts|js|mjs)$/u.test(name) || typeof source !== "string")
    || !Object.hasOwn(input.files, input.entry) || !Array.isArray(input.checks) || input.checks.length < 2 || input.checks.length > 8)
    throw new Error("PUBLIC_SOFTWARE_INPUT_INVALID");
  const checks = input.checks.map(test => {
    if (Object.keys(test).sort().join(",") !== "body,expectedBody,expectedStatus,method,path"
      || !["GET", "POST"].includes(test.method) || !/^\/[A-Za-z0-9/_-]*$/u.test(test.path)
      || !Number.isInteger(test.expectedStatus) || test.expectedStatus < 200 || test.expectedStatus > 499
      || !(test.body === null || typeof test.body === "string") || test.method === "GET" && test.body !== null
      || typeof test.expectedBody !== "string") throw new Error("PUBLIC_SOFTWARE_CHECK_INVALID");
    JSON.parse(test.expectedBody); if (test.body !== null) JSON.parse(test.body);
    return { method: test.method, path: test.path, body: test.body, expectedStatus: test.expectedStatus, expectedBody: test.expectedBody };
  });
  if (!checks.some(test => test.method === "GET" && test.path === "/" && test.expectedStatus === 200))
    throw new Error("PUBLIC_SOFTWARE_ROOT_ACCEPTANCE_REQUIRED");
  const packet = { visibility: "PUBLIC", files: Object.fromEntries(Object.entries(input.files).sort(([a], [b]) => a.localeCompare(b))), entry: input.entry, checks };
  if (Buffer.byteLength(JSON.stringify(packet)) > 48000) throw new Error("PUBLIC_SOFTWARE_TOO_LARGE");
  return packet;
}
export function createGitHubPublicBuild({ directory, profile, packet, programHash, fetchImpl = fetch, clock = () => new Date().toISOString(), wait = ms => new Promise(resolve => setTimeout(resolve, ms)) }) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const file = name => path.join(directory, `${name}.json`);
  const bytes = Buffer.from(JSON.stringify(normalizePublicSoftwareInput(packet))), sourceHash = softwareBytesHash(bytes);
  const ticket = softwareBytesHash(Buffer.from(`${programHash}\0${sourceHash}`)).slice(7, 39);
  const repo = `/repos/${profile.owner}/${profile.repository}`, workflow = `${repo}/actions/workflows/${profile.workflowFile}`;
  const credentials = () => read(profile.credentialsFile).githubReleaseAsset;
  async function exchange(method, route, body) {
    const r = await fetchImpl(`https://api.github.com${route}`, { method, headers: {
      authorization: `Bearer ${credentials().actionsWriteApiToken ?? credentials().contentsWriteApiToken}`,
      accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2026-03-10", ...(body ? { "content-type": "application/json" } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}), redirect: "manual", signal: AbortSignal.timeout(20000) });
    const responseBytes = Buffer.from(await r.arrayBuffer());
    if (responseBytes.length > 2 * 1024 * 1024) throw new Error("PUBLIC_BUILD_RESPONSE_TOO_LARGE");
    writeOnce(file(`source-${randomUUID()}`), { method, route, observedAt: clock(), status: r.status, bodyBase64: responseBytes.toString("base64") });
    let json; try { json = JSON.parse(responseBytes); } catch {}
    return { status: r.status, json, bytes: responseBytes, location: r.headers.get("location"), receiptHash: softwareBytesHash(responseBytes) };
  }
  return { sourceHash, ticket,
    async build() {
      if (existsSync(file("result"))) return read(file("result"));
      if (!existsSync(file("dispatch-attempt"))) {
        const repoInfo = await exchange("GET", repo), definition = await exchange("GET", `${repo}/contents/.github/workflows/${profile.workflowFile}?ref=${encodeURIComponent(profile.workflowRef)}`);
        if (repoInfo.json?.visibility !== "public" || repoInfo.json?.archived !== false
          || definition.status !== 200 || softwareBytesHash(Buffer.from(definition.json?.content ?? "", "base64")) !== profile.workflowHash)
          throw new Error("PUBLIC_BUILD_APPROVED_WORKFLOW_NOT_AVAILABLE");
        writeOnce(file("dispatch-attempt"), { ticket, sourceHash, workflowCommit: profile.workflowCommit, startedAt: clock(), priceMinor: "0", standardPublicRunner: true });
        const dispatched = await exchange("POST", `${repo}/dispatches`, { event_type: "outsider-public-build-v1",
          client_payload: { ticket, packet: bytes.toString("base64") } });
        if (![200, 201, 204].includes(dispatched.status)) throw new Error(`PUBLIC_BUILD_DISPATCH_HTTP_${dispatched.status}`);
        writeOnce(file("dispatch-ack"), { receiptHash: dispatched.receiptHash, status: dispatched.status });
      }
      let selected;
      for (let attempt = 0; attempt < 48; attempt++) {
        const runs = await exchange("GET", `${workflow}/runs?event=repository_dispatch&per_page=50`);
        selected = runs.json?.workflow_runs?.find(row => row.display_title === `outsider-build-${ticket}`);
        if (selected?.status === "completed") break;
        await wait(2500);
      }
      if (!selected || selected.status !== "completed") throw new Error("PUBLIC_BUILD_STILL_PENDING");
      if (selected.conclusion !== "success") throw new Error(`PUBLIC_BUILD_${String(selected.conclusion).toUpperCase()}`);
      const executedDefinition = await exchange("GET", `${repo}/contents/.github/workflows/${profile.workflowFile}?ref=${selected.head_sha}`);
      if (executedDefinition.status !== 200 || hashDefinition(executedDefinition.json) !== profile.workflowHash)
        throw new Error("PUBLIC_BUILD_EXECUTED_WORKFLOW_CHANGED");
      const jobs = await exchange("GET", `${repo}/actions/runs/${selected.id}/jobs`);
      const job = jobs.json?.jobs?.find(row => row.name === "build" && row.conclusion === "success");
      if (!job) throw new Error("PUBLIC_BUILD_JOB_NOT_SUCCEEDED");
      const logRoute = await exchange("GET", `${repo}/actions/jobs/${job.id}/logs`);
      let logs = logRoute.bytes;
      if (logRoute.status === 302) {
        const target = new URL(logRoute.location);
        if (target.protocol !== "https:" || !target.hostname.endsWith(".blob.core.windows.net")) throw new Error("PUBLIC_BUILD_LOG_ROUTE_INVALID");
        const r = await fetchImpl(target, { redirect: "error", signal: AbortSignal.timeout(20000) });
        logs = Buffer.from(await r.arrayBuffer());
        if (!r.ok || logs.length > 2 * 1024 * 1024) throw new Error("PUBLIC_BUILD_LOG_READ_FAILED");
        writeOnce(file("job-log"), { sourceKind: "GITHUB_JOB_LOG", jobId: job.id, observedAt: clock(), bodyBase64: logs.toString("base64") });
      }
      const match = logs.toString().match(/OUTSIDER_BUILD_RESULT ([A-Za-z0-9+/=]+)\s*$/mu);
      if (!match) throw new Error("PUBLIC_BUILD_OUTPUT_MISSING");
      const result = JSON.parse(Buffer.from(match[1], "base64"));
      if (result.ticket !== ticket || result.sourceHash !== sourceHash
        || result.artifactHash !== softwareBytesHash(Buffer.from(result.artifactBase64, "base64"))
        || result.checks?.length !== packet.checks.length || result.compiler !== "esbuild@0.25.10") throw new Error("PUBLIC_BUILD_OUTPUT_MISMATCH");
      const body = { ...result, runId: selected.id, jobId: job.id, runUrl: selected.html_url,
        workflowCommit: selected.head_sha, completedAt: clock(), logsHash: softwareBytesHash(logs),
        buildLocation: "GITHUB_HOSTED_UBUNTU_24_04", localCompilationUsed: false, providerClaimsNotIndependentDeploymentTruth: true };
      writeOnce(file("result"), body); return body;
    },
  };
}
function hashDefinition(definition) { return softwareBytesHash(Buffer.from(definition?.content ?? "", "base64")); }
