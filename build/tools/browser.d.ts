/**
 * Browser Control Tools — Full Interactive Browser Session (STABILIZED v5.2)
 * ─────────────────────────────────────────────────────────────────────────────
 * Persistent browser sessions yang bisa dikendalikan step-by-step oleh AI:
 *   • Buka URL, navigasi, back/forward
 *   • Klik elemen via CSS selector atau XPath (dengan auto-retry & JS fallback)
 *   • Isi form, type text, select dropdown, checkbox
 *   • Scroll halaman atau elemen tertentu
 *   • Ambil screenshot saat ini (dengan timeout protection)
 *   • Tunggu elemen muncul / menghilang
 *   • Eksekusi JavaScript arbitrary
 *   • Kelola multiple tab
 *   • Download file
 *   • Handle dialog (alert, confirm, prompt)
 *
 * STABILITY FEATURES (v5.2):
 *   • Auto-retry dengan exponential backoff
 *   • Fallback ke JavaScript injection untuk click
 *   • Smart wait untuk navigasi
 *   • Session auto-recovery pada timeout
 *   • Chunked screenshot untuk halaman panjang
 *   • Auto-cleanup overlay/popup
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
/**
 * Close every open Chromium instance and clear the session map.
 * Called during SIGINT / SIGTERM in index.ts to prevent zombie processes.
 */
export declare function closeAllBrowserSessions(): Promise<void>;
export declare function registerBrowserTools(server: McpServer): void;
//# sourceMappingURL=browser.d.ts.map