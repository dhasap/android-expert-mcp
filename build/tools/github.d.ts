/**
 * 🐙 GitHub Integration Tools
 * ─────────────────────────────────────────────────────────────────────────────
 * Kelola repository GitHub langsung dari chat AI.
 * Menggunakan GitHub REST API v3 via Node.js built-in `fetch` (Node 18+).
 *
 * Setup — set environment variable:
 *   export GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
 *
 * Cara buat token: github.com → Settings → Developer Settings →
 *   Personal access tokens → Tokens (classic) → Generate new token
 *   Scopes yang diperlukan: repo, read:user, read:org
 *
 * Default owner: dhasap (bisa di-override per tool)
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
export declare function registerGithubTools(server: McpServer): void;
//# sourceMappingURL=github.d.ts.map