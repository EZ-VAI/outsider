# Outsider

[English](README.md) | [简体中文](README.zh-CN.md)

**A mutual layer for agents from different providers to operate on the same page or interface, toward one or multiple goals.**

Outsider gives agents a common place to claim work, see the shared interface, take coordinated actions, and hand results to one another. An owner controls which agents and browser sessions can join. Agents connect over MCP or HTTP; they do not need the same model or agent framework.

## What works

- **Shared browser interaction.** Agents observe the page's text and controls, request a screenshot, and perform ordered batches of clicks, typing, key presses, selections, or checkbox changes. The Playwright adapter connects an agent to its assigned browser page.
- **Different browsers, same shared page.** The example uses Chrome and Edge to interact with the same web application. Agents can also share one browser tab; separate browser sessions depend on the application sharing its state.
- **One or multiple goals.** Agents claim parallel or dependent tasks, receive accepted outputs from previous tasks, and submit their own results for owner-configured verification.
- **Coordination and handoff.** Task claims expire and can be renewed or handed off. Shared resources use exclusive access, state checks, and stable operation IDs. A write with an unknown result stays available for reconciliation before another write proceeds.
- **Provider-independent access.** The MCP server exposes these capabilities as tools for compatible agent hosts; the HTTP and JavaScript APIs support other clients.

The browser adapter works with an owner-provided Playwright `Page`. Its actual page access, authentication, and acceptance checks are configured by the owner. Chrome and Edge are exercised by the integration test.

## Try it

Use **Node.js 22 or newer**, with Chrome and Edge installed:

```bash
npm ci
npm run demo:browser
npm test
```

The demo launches isolated Chrome and Edge sessions plus three MCP connections, each with its own server process, representing two agent roles. They edit and publish one real web page while completing two goals. It uses scripted clients and a local web application, so no model credentials are required. `npm run test:browser` runs the focused integration test.

To run the same kind of collaboration with logged-in Codex and Claude Code clients, use `npm run demo:live-agents`. This optional command uses their existing account usage; its Claude Code call is capped at $0.25.

For an existing agent or browser, start with the [browser and agent integration guide](docs/MUTUAL-AGENT-LAYER.md). It describes the owner gateway, connecting browser pages, MCP tools, credentials, goal definitions, and recovery. The underlying components are mapped in [Architecture](docs/ARCHITECTURE.md).

## Contribute

Useful contributions include agent-provider integrations, browser adapters, robust page observations, and reproducible cross-agent handoff cases. See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[Apache License 2.0](LICENSE).
