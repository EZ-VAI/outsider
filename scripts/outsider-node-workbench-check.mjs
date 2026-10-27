#!/usr/bin/env node
/* Non-browser verification of the deployed workbench and browser-session API.
 * Reads existing task records only. Does not create tasks, call suppliers,
 * inspect browser state, or record cookies / owner credentials. */
import path from "node:path";
import { createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import { readPrivateExecutionBytes, writePrivateExecutionRecordOnce as writeOnce } from "../src/outsider-user-held-durable-execution-v2.js";
const [configFile, outputDirectory, taskId] = process.argv.slice(2);
if (![configFile, outputDirectory].every(v => path.isAbsolute(v ?? "")) || !/^task_[a-f0-9]{32}$/u.test(taskId ?? "")) throw new Error("WORKBENCH_CHECK_ARGUMENT_INVALID");
const config = JSON.parse(readPrivateExecutionBytes(configFile)), origin = config.origin;
const token = readPrivateExecutionBytes(config.authorizationTokenFile).toString("utf8").trim();
const began = Date.now(), assets = [];
let ready = false;
for (let attempt = 0; attempt < 20; attempt++) {
  try { ready = (await fetch(origin + "/app", { signal: AbortSignal.timeout(1000) })).status === 200; } catch {}
  if (ready) break;
  await new Promise(resolve => setTimeout(resolve, 250));
}
if (!ready) throw new Error("WORKBENCH_NOT_READY");
for (const route of ["/app", "/app/app.js", "/app/app.css"]) {
  const response = await fetch(origin + route), bytes = Buffer.from(await response.arrayBuffer());
  if (response.status !== 200 || bytes.includes(Buffer.from(token))) throw new Error("WORKBENCH_ASSET_INVALID");
  assets.push({ route, httpStatus: response.status, bodyBytes: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"), contentType: response.headers.get("content-type") });
}
const anonymousTasksStatus = (await fetch(origin + "/v1/tasks")).status;
const linkResponse = await fetch(origin + "/v1/app/session-link", { method: "POST", headers: {
  authorization: `Bearer ${token}`, origin, "content-type": "application/json" }, body: "{}" });
if (linkResponse.status !== 200) throw new Error("WORKBENCH_PAIRING_LINK_FAILED");
const link = await linkResponse.json();
if (link.url.includes(token)) throw new Error("WORKBENCH_PAIRING_CONTAINS_OWNER_CREDENTIAL");
const ticket = new URLSearchParams(new URL(link.url).hash.slice(1)).get("connect");
const login = await fetch(origin + "/v1/app/session-from-link", { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify({ticket}) });
if (login.status !== 200) throw new Error("WORKBENCH_LOGIN_FAILED");
const cookieHeader = login.headers.get("set-cookie"), cookie = cookieHeader.split(";")[0];
const headers = { cookie, origin, "content-type": "application/json" };
const taskResponse = await fetch(`${origin}/v1/tasks/${taskId}`, { headers });
if (taskResponse.status !== 200) throw new Error("WORKBENCH_TASK_READ_FAILED");
const task = await taskResponse.json(), listResponse = await fetch(origin + "/v1/tasks", { headers }), list = await listResponse.json();
const logout = await fetch(origin + "/v1/app/logout", { method: "POST", headers, body: "{}" });
const result = { schema: "outsider/deployed-workbench-check/v1", observedAt: new Date().toISOString(), origin,
  assets, anonymousTasksStatus, authenticatedTaskStatus: taskResponse.status, listedTasks: list.tasks.length,
  session: { pairingUsed: true, ownerCredentialEnteredInBrowser: false, httpOnly: cookieHeader.includes("HttpOnly"), sameSiteStrict: cookieHeader.includes("SameSite=Strict"),
    logoutStatus: logout.status, expiresBrowserCookieOnLogout: logout.headers.get("set-cookie")?.includes("Max-Age=0") },
  task: { taskId: task.taskId, state: task.session.state,
    historicalRetailCandidates: (task.session.formation?.retailResources?.demands ?? []).reduce((n, d) => n + (d.candidates?.length ?? 0), 0),
    historicalCartStates: task.session.retailLifecycle?.transactions?.map(t => t.state) ?? [] },
  elapsedMs: Date.now() - began, browserUiVisuallyTested: false, supplierCalls: 0, newOrders: 0, paymentPerformed: false };
mkdirSync(outputDirectory, { recursive: true, mode: 0o700 });
writeOnce(path.join(outputDirectory, "workbench-check.json"), result);
console.log(JSON.stringify(result));
