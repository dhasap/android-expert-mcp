#!/usr/bin/env node

/**
 * Android Expert MCP Server
 * ─────────────────────────────────────────────────────────────────────────────
 * A comprehensive Model Context Protocol server providing expert-level
 * capabilities for:
 *   • Architecture & Planning (file system, markdown docs)
 *   • Android/Kotlin/Gradle automation + ADB interaction
 *   • Web Scraping & DOM extraction via Puppeteer
 *   • Website Review & Audit via Lighthouse
 *
 * Transport: stdio (for use with Kimi CLI, Claude CLI, or any MCP-compatible agent)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

// Tool category registrars
import { registerArchitectureTools } from "./tools/architecture.js";
import { registerAndroidTools } from "./tools/android.js";
import { registerScrapingTools } from "./tools/scraping.js";
import { registerAuditTools } from "./tools/audit.js";

// ─── Server bootstrap ────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const server = new McpServer({
    name: "android-expert-mcp",
    version: "1.0.0",
    description:
      "Expert MCP server for Android/Kotlin dev, web scraping, and website auditing",
  });

  // Register all tool categories
  registerArchitectureTools(server);
  registerAndroidTools(server);
  registerScrapingTools(server);
  registerAuditTools(server);

  // Connect via stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Graceful shutdown
  process.on("SIGINT", async () => {
    await server.close();
    process.exit(0);
  });

  process.on("SIGTERM", async () => {
    await server.close();
    process.exit(0);
  });
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  // Write to stderr so it does NOT corrupt the stdio MCP channel
  process.stderr.write(`[android-expert-mcp] Fatal error: ${message}\n`);
  process.exit(1);
});
