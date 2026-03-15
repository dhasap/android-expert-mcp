/**
 * 🚀 VPS & Deploy Manager
 * ─────────────────────────────────────────────────────────────────────────────
 * Kelola VPS Alibaba + deploy semua project dari chat AI:
 *
 *   • SSH connection management (simpan profil server)
 *   • Monitor resource: RAM, CPU, disk, network (sadar VPS minim!)
 *   • Deploy: upload file, restart service, nginx config
 *   • Tail logs real-time dari service manapun
 *   • Turso DB: query, migrate, backup via CLI
 *   • Process manager: pm2 / systemd status & control
 *   • Deployment history & rollback
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
export declare function registerVpsTools(server: McpServer): void;
//# sourceMappingURL=vps_deploy.d.ts.map