/**
 * 🧠 Error Memory Bank
 * ─────────────────────────────────────────────────────────────────────────────
 * AI punya "memori" jangka panjang tentang error dan solusinya.
 * Setiap error yang pernah ditemui + cara fixnya disimpan ke JSON lokal.
 * Saat error baru muncul, AI otomatis cari apakah pernah terjadi sebelumnya.
 *
 * Features:
 *   • Parse error dari berbagai sumber: Kotlin/Java, JS/TS, Python, Firebase,
 *     Turso, Gradle, logcat, npm, adb
 *   • Fingerprint error (normalisasi line numbers, paths, IDs) agar
 *     error yang "sama tapi beda file" tetap terdeteksi sebagai satu entri
 *   • Simpan solusi yang berhasil, solusi yang gagal, dan konteks
 *   • Search by keyword, tech stack, atau fingerprint
 *   • Export/import knowledge base untuk backup atau sharing
 *   • Stats: error paling sering, tech stack paling bermasalah
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
export declare function registerErrorMemoryTools(server: McpServer): void;
//# sourceMappingURL=error_memory.d.ts.map