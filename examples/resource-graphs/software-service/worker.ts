import { schedule } from "./schedule.ts";
const example = [
  { id: "site_ready", minutes: 10, dependsOn: [] },
  { id: "power", minutes: 20, dependsOn: ["site_ready"] },
  { id: "network", minutes: 15, dependsOn: ["power"] },
  { id: "desks", minutes: 30, dependsOn: ["site_ready"] },
  { id: "acceptance", minutes: 5, dependsOn: ["network", "desks"] },
];
export default { async fetch(request: Request) {
  const url = new URL(request.url);
  try {
    if (request.method === "GET" && url.pathname === "/") return Response.json({ service: "outsider-public-schedule-v1",
      ...schedule(example), scope: "DECLARED_DURATIONS_NOT_OBSERVED_REALITY" });
    if (request.method === "POST" && url.pathname === "/plan") return Response.json(schedule((await request.json() as { steps: typeof example }).steps));
    return Response.json({ error: "ROUTE_NOT_FOUND" }, { status: 404 });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "INVALID_REQUEST" }, { status: 400 }); }
} };
