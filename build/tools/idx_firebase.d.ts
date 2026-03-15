/**
 * IDX Emulator & Firebase Test Lab Tools
 * ─────────────────────────────────────────────────────────────────────────────
 * Solusi lengkap untuk vibe coding di Firebase IDX Studio:
 *
 * BAGIAN A — IDX Emulator Connection
 *   • Deteksi otomatis emulator Android di IDX (port 5554, 5556, 5558, dll)
 *   • Koneksi ADB over TCP/IP (workaround physical device)
 *   • Port forwarding helper untuk IDX environment
 *   • Health check & reconnect otomatis
 *
 * BAGIAN B — Firebase Test Lab Integration
 *   • Upload APK ke Firebase Test Lab via gcloud CLI
 *   • Jalankan Robo Test & Instrumentation Test
 *   • Poll status test run sampai selesai
 *   • Download screenshot, video, logcat dari GCS bucket
 *   • Parse hasil test report (XML JUnit + JSON summary)
 *
 * BAGIAN C — UI Scraping via Emulator (tanpa physical device)
 *   • Screenshot emulator via ADB
 *   • uiautomator dump + parsing
 *   • Interaksi UI otomatis (tap, swipe, input teks) di emulator
 *   • Screen recording clip
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
export declare function registerIdxFirebaseTools(server: McpServer): void;
//# sourceMappingURL=idx_firebase.d.ts.map