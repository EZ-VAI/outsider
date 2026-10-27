/* Reuse already-public source bytes; this request contains NO task graph,
 * capability IDs, supplier selections or fabricated future output values. */
import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { writePrivateExecutionRecordOnce as writeOnce } from "../src/outsider-user-held-durable-execution-v2.js";
const [directory, publicSoftwareTemplate, revision = "r48"] = process.argv.slice(2);
if (![directory, publicSoftwareTemplate].every(p => path.isAbsolute(p ?? "")) || !/^r[0-9]+$/u.test(revision))
  throw new Error("OPEN_OUTCOME_REQUEST_ARGUMENT_INVALID");
const software = JSON.parse(readFileSync(publicSoftwareTemplate, "utf8")).taskInput.operationInputs.software;
const template = { requestId: `${revision}-open-goal-to-resource-delivery`, completionWithinMs: 600000,
  goal: "Deliver my attached public scheduling API as a working online service, using its supplied request/response checks. Also deliver a public, independently queryable handoff directory containing its real primary URL, alternate runtime URL, and portable source URL in the three matching records. The directory must use the actual deployed allocations, not placeholders. The API must meet its checks before the dependent directory and the whole result are accepted. Use temporary free resources retained for the configured two-hour handoff; same-provider alternate runtime and the existing independent spot-check scope are acceptable. Do not book meetings, install physical infrastructure, add paid services, or promise continuous uptime.",
  taskInput: { publicDiscoveryApproved: true, assets: [
    { id: "schedule_source", kind: "PUBLIC_SOFTWARE_PACKAGE", description: "The exact public TypeScript API and HTTP checks to deliver; do not change or invent code.", value: software },
    { id: "handoff_directory", kind: "PUBLIC_RECORDS", description: "Fill these records with the runtime allocation outputs of the deployed scheduling service.",
      value: { visibility: "PUBLIC", records: [{ id: "primary_url", value: "UNASSIGNED" }, { id: "alternate_url", value: "UNASSIGNED" }, { id: "source_url", value: "UNASSIGNED" }] } } ] } };
mkdirSync(directory, { recursive: true, mode: 0o700 }); writeOnce(path.join(directory, "template.json"), template);
console.log(JSON.stringify({ templateFile: path.join(directory, "template.json"), clientSuppliedGraph: false,
  clientSelectedProviders: false, publicAttachments: 2, paymentAuthorized: false }));
