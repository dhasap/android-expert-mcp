#!/usr/bin/env node

/**
 * Android Expert MCP Server — v2.0
 * ─────────────────────────────────────────────────────────────────────────────
 * Comprehensive Model Context Protocol server providing expert-level
 * capabilities for:
 *   • Architecture & Planning (file system, markdown docs)
 *   • Android/Kotlin/Gradle automation + ADB interaction
 *   • Web Scraping & DOM extraction via Puppeteer
 *   • Website Review & Audit via Lighthouse
 *   • 🆕 Interactive Browser Control (full session-based browser automation)
 *   • 🆕 Interactive UI Widgets (choices, menus, progress, forms, tables)
 *
 * Transport: stdio (for Kimi CLI, Claude CLI, or any MCP-compatible agent)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

// Tool category registrars
import { registerArchitectureTools } from "./tools/architecture.js";
import { registerAndroidTools } from "./tools/android.js";
import { registerScrapingTools } from "./tools/scraping.js";
import { registerAuditTools } from "./tools/audit.js";
import { registerBrowserTools } from "./tools/browser.js";
import { registerInteractiveTools } from "./tools/interactive.js";
import { registerIdxFirebaseTools } from "./tools/idx_firebase.js";
import { registerErrorMemoryTools } from "./tools/error_memory.js";
import { registerScaffoldingTools } from "./tools/scaffolding.js";
import { registerVpsTools } from "./tools/vps_deploy.js";

// ─── Server bootstrap ────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const server = new McpServer({
    name: "android-expert-mcp",
    version: "2.0.0",
    description:
      "Expert MCP: Android/Kotlin dev, web scraping, website auditing, " +
      "interactive browser control, and UI interaction widgets",
  });

  // Category 1: Architecture & Planning (6 tools)
  registerArchitectureTools(server);

  // Category 2: Android/Kotlin/Gradle/ADB (8 tools)
  registerAndroidTools(server);

  // Category 3: Web Scraping & DOM (4 tools)
  registerScrapingTools(server);

  // Category 4: Website Review & Audit (5 tools)
  registerAuditTools(server);

  // Category 5: 🆕 Interactive Browser Control (14 tools)
  registerBrowserTools(server);

  // Category 6: 🆕 Interactive UI Widgets (9 tools)
  registerInteractiveTools(server);

  // Category 7: IDX Emulator + Firebase Test Lab (13 tools)
  registerIdxFirebaseTools(server);

  // Category 8: 🧠 Error Memory Bank (6 tools)
  registerErrorMemoryTools(server);

  // Category 9: 🏗️ Project Scaffolding Engine (4 tools)
  registerScaffoldingTools(server);

  // Category 10: 🚀 VPS & Deploy Manager (10 tools)
  registerVpsTools(server);

  // Connect via stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);

  process.stderr.write(
    `[android-expert-mcp v4.0] Server started\n` +
    `[android-expert-mcp v4.0] 79 tools across 10 categories\n` +
    `  Arch(6) Android(8) Scraping(4) Audit(5) Browser(14) UI(9)\n` +
    `  IDX+FTL(13) ErrorMemory(6) Scaffold(4) VPS(10)\n`
  );

  // Graceful shutdown
  const shutdown = async () => {
    process.stderr.write("[android-expert-mcp] Shutting down...\n");
    await server.close();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  // Keep server alive — log unhandled rejections but don't crash
  process.on("unhandledRejection", (reason) => {
    process.stderr.write(
      `[android-expert-mcp] Unhandled rejection: ${String(reason)}\n`
    );
  });
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`[android-expert-mcp] Fatal error: ${message}\n`);
  process.exit(1);
});
