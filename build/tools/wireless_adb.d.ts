/**
 * 📡 Wireless ADB Debugging Tools
 * ─────────────────────────────────────────────────────────────────────────────
 * Alternatif scraping & debug Android app tanpa kabel USB, tanpa emulator.
 * Mendukung dua mode koneksi:
 *
 *   • Mode Legacy  (Android 10-)  : USB sekali, lalu `adb tcpip 5555`, cabut kabel
 *   • Mode Modern  (Android 11+)  : Full wireless, pair via QR/kode 6 digit
 *
 * Semua perintah ADB dijalankan via `runAdbCommand` agar terproteksi oleh
 * global ADB mutex — tidak ada race condition meski dipanggil paralel oleh AI.
 *
 * Cara pakai (Android 11+, tanpa USB sama sekali):
 *   1. Buka Settings → Developer Options → Wireless debugging → ON
 *   2. Ketuk "Pair device with pairing code" → catat HOST:PORT dan 6-digit code
 *   3. Panggil `adb_wifi_pair` dengan host:port dan kode
 *   4. Ketuk kembali di Developer Options → catat IP:PORT untuk koneksi
 *   5. Panggil `adb_wifi_connect`
 *   6. Mulai gunakan `adb_wifi_shell`, `adb_wifi_screenshot`, `adb_wifi_ui_dump`
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
export declare function registerWirelessAdbTools(server: McpServer): void;
//# sourceMappingURL=wireless_adb.d.ts.map