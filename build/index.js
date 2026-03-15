#!/usr/bin/env node
/**
 * Android Expert MCP Server — v5.1.0
 * ─────────────────────────────────────────────────────────────────────────────
 * 104 tools across 13 categories.
 *
 * v5.1 additions:
 *   • Category 13 — 🧠 Context Manager (7 tools)
 *       Session Snapshot : context_save/load/list/delete
 *       Context Compactor: context_compact/compact_file/stats
 *
 * v5.0: Wireless ADB (cat 11) + GitHub Integration (cat 12)
 * v4.x: Semaphore, ADB Mutex, secret masking, path protection, session caps
 *
 * Transport: stdio
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerArchitectureTools } from "./tools/architecture.js";
import { registerAndroidTools } from "./tools/android.js";
import { registerScrapingTools } from "./tools/scraping.js";
import { registerAuditTools } from "./tools/audit.js";
import { registerBrowserTools, closeAllBrowserSessions } from "./tools/browser.js";
import { registerInteractiveTools } from "./tools/interactive.js";
import { registerIdxFirebaseTools } from "./tools/idx_firebase.js";
import { registerErrorMemoryTools } from "./tools/error_memory.js";
import { registerScaffoldingTools } from "./tools/scaffolding.js";
import { registerVpsTools } from "./tools/vps_deploy.js";
import { registerWirelessAdbTools } from "./tools/wireless_adb.js";
import { registerGithubTools } from "./tools/github.js";
import { registerContextManagerTools } from "./tools/context_manager.js";
import { registerAdvancedTestingTools } from "./tools/advanced_testing.js";
import { cleanupTempDirectories } from "./utils.js";
async function main() {
    const server = new McpServer({
        name: "android-expert-mcp",
        version: "5.3.0",
        description: "Expert MCP: Android/Kotlin dev, web scraping, website auditing, " +
            "browser control, UI widgets, IDX/Firebase, Error Memory, Scaffolding, " +
            "VPS Deploy, Wireless ADB, GitHub Integration, Context Manager, " +
            "Advanced Testing (API, Performance, Security, Push Notification)",
    });
    registerArchitectureTools(server); // Cat 1  — 6 tools
    registerAndroidTools(server); // Cat 2  — 8 tools
    registerScrapingTools(server); // Cat 3  — 4 tools
    registerAuditTools(server); // Cat 4  — 5 tools
    registerBrowserTools(server); // Cat 5  — 14 tools
    registerInteractiveTools(server); // Cat 6  — 9 tools
    registerIdxFirebaseTools(server); // Cat 7  — 13 tools
    registerErrorMemoryTools(server); // Cat 8  — 6 tools
    registerScaffoldingTools(server); // Cat 9  — 4 tools
    registerVpsTools(server); // Cat 10 — 10 tools
    registerWirelessAdbTools(server); // Cat 11 — 8 tools
    registerGithubTools(server); // Cat 12 — 10 tools
    registerContextManagerTools(server); // Cat 13 — 7 tools
    registerAdvancedTestingTools(server); // Cat 14 — 10 tools
    const transport = new StdioServerTransport();
    await server.connect(transport);
    process.stderr.write(`[android-expert-mcp v5.1] Server started — 13 categories, 104 tools\n` +
        `  Arch(6) Android(8) Scraping(4) Audit(5) Browser(14) UI(9)\n` +
        `  IDX+FTL(13) ErrorMemory(6) Scaffold(4) VPS(10)\n` +
        `  WirelessADB(8) GitHub(10) ContextManager(7)\n`);
    const runCleanup = () => {
        cleanupTempDirectories(24)
            .then((s) => { if (!s.includes("No files"))
            process.stderr.write(`[mcp] ${s}\n`); })
            .catch((e) => process.stderr.write(`[mcp] cleanup error: ${String(e)}\n`));
    };
    runCleanup();
    setInterval(runCleanup, 60 * 60 * 1000).unref();
    let shuttingDown = false;
    const shutdown = async () => {
        if (shuttingDown)
            return;
        shuttingDown = true;
        process.stderr.write("[android-expert-mcp] Shutting down...\n");
        try {
            await closeAllBrowserSessions();
        }
        catch { /* non-fatal */ }
        try {
            await server.close();
        }
        catch { /* non-fatal */ }
        process.exit(0);
    };
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
    process.on("unhandledRejection", (r) => process.stderr.write(`[android-expert-mcp] Unhandled rejection: ${String(r)}\n`));
}
main().catch((e) => {
    process.stderr.write(`[android-expert-mcp] Fatal: ${e instanceof Error ? e.message : String(e)}\n`);
    process.exit(1);
});
//# sourceMappingURL=index.js.map