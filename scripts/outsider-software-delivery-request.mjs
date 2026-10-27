/* Create a public client packet from these two NEW public example files only.
 * Does not execute or compile submitted code, contact suppliers, or load keys. */
import { readFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { writePrivateExecutionRecordOnce as writeOnce } from "../src/outsider-user-held-durable-execution-v2.js";
const directory = process.argv[2], revision = process.argv[3] ?? "r45";
if (!path.isAbsolute(directory ?? "")) throw new Error("SOFTWARE_REQUEST_DIRECTORY_REQUIRED");
if (!/^r[0-9]+$/u.test(revision)) throw new Error("SOFTWARE_REQUEST_REVISION_INVALID");
mkdirSync(directory, { recursive: true, mode: 0o700 });
const packet = { visibility: "PUBLIC", entry: "worker.ts", files: Object.fromEntries(["worker.ts", "schedule.ts"].map(name =>
  [name, readFileSync(path.join(process.cwd(), "examples/resource-graphs/software-service", name), "utf8")])), checks: [
  { method: "GET", path: "/", body: null, expectedStatus: 200, expectedBody: JSON.stringify({ service: "outsider-public-schedule-v1",
    completionMinutes: 50, criticalPath: ["site_ready", "power", "network", "acceptance"], schedule: [
      { id: "site_ready", start: 0, finish: 10 }, { id: "power", start: 10, finish: 30 }, { id: "network", start: 30, finish: 45 },
      { id: "desks", start: 10, finish: 40 }, { id: "acceptance", start: 45, finish: 50 }], scope: "DECLARED_DURATIONS_NOT_OBSERVED_REALITY" }) },
  { method: "POST", path: "/plan", body: JSON.stringify({ steps: [{ id: "a", minutes: 20, dependsOn: [] },
    { id: "b", minutes: 10, dependsOn: [] }, { id: "join", minutes: 5, dependsOn: ["a", "b"] }] }), expectedStatus: 200,
    expectedBody: JSON.stringify({ completionMinutes: 25, criticalPath: ["a", "join"], schedule: [
      { id: "a", start: 0, finish: 20 }, { id: "b", start: 0, finish: 10 }, { id: "join", start: 20, finish: 25 }] }) },
  { method: "POST", path: "/plan", body: JSON.stringify({ steps: [{ id: "a", minutes: 1, dependsOn: ["b"] },
    { id: "b", minutes: 2, dependsOn: ["a"] }] }), expectedStatus: 400, expectedBody: JSON.stringify({ error: "DEPENDENCY_CYCLE" }) },
] };
const goal = "Deliver the attached PUBLIC TypeScript scheduling API: compile its two modules on external build infrastructure, deploy functioning HTTPS runtimes, pass these three frozen request/response cases, and provide the exact portable source. The API computes timelines from declared dependencies; this order does not install an office or claim physical completion.";
const template = { requestId: `${revision}-public-software-native-delivery`, goal, completionWithinMs: 360000,
  taskInput: { publicDiscoveryApproved: true, graph: { summary: goal, missingFacts: [], requirements: [{ id: "software",
    capability: "PUBLIC_SOFTWARE_SERVICE_V1", outcome: goal, acceptance: ["Executable endpoints pass exact HTTP cases; independent root/source reads"],
    recoveryNeeds: ["Second runtime instance; shared provider, not independent cloud replacement"], resourceKinds: ["BUILD_COMPUTE", "HTTP_RUNTIME", "SOURCE_DISTRIBUTION"],
    discoveryQueries: ["Public source build and HTTP module deployment"], candidateDocumentationUrls: [], dependsOn: [] }] },
    operationInputs: { software: packet } } };
writeOnce(path.join(directory, "template.json"), template);
console.log(JSON.stringify({ templateFile: path.join(directory, "template.json"), sourceFiles: Object.keys(packet.files), checks: packet.checks.length,
  sourceExecutedLocally: false, modelOrSupplierCalls: 0 }));
