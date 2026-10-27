#!/usr/bin/env node
let input = "";
const hooks = JSON.parse(process.env.OUTSIDER_FAKE_CODEX_HOOKS ?? "{\"data\":[]}");
const consume = () => {
  let newline;
  while ((newline = input.indexOf("\n")) >= 0) {
    const line = input.slice(0, newline).trim();
    input = input.slice(newline + 1);
    if (!line) continue;
    const message = JSON.parse(line);
    if (message.method === "initialize") {
      process.stdout.write(`${JSON.stringify({ id: message.id, result: {
        userAgent: "fake-codex", serverInfo: { name: "fake", version: "0.144.5" },
      } })}\n`);
    } else if (message.method === "hooks/list") {
      process.stdout.write(`${JSON.stringify({ id: message.id, result: hooks })}\n`);
    } else if (message.method === "initialized" && process.env.OUTSIDER_FAKE_CODEX_THREAD_ID) {
      const id = process.env.OUTSIDER_FAKE_CODEX_THREAD_ID;
      process.stdout.write(`${JSON.stringify({ method: "thread/started", params: { thread: {
        id, sessionId: id, parentThreadId: null, cwd: process.cwd(), cliVersion: "0.144.5",
        createdAt: 1, updatedAt: 1, ephemeral: false, modelProvider: "fake",
        preview: "", source: "appServer", status: "idle", turns: [],
      } } })}\n`);
    }
  }
};
process.stdin.on("data", (chunk) => { input += chunk.toString("utf8"); consume(); });
process.stdin.on("end", () => { consume(); process.exit(input.trim() ? 2 : 0); });
