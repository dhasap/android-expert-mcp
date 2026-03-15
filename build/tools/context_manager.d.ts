/**
 * 🧠 Context Manager — Session Snapshot + Context Compactor
 * ─────────────────────────────────────────────────────────────────────────────
 * Dua fitur dalam satu kategori untuk mengatasi context window yang panjang:
 *
 * ┌─ SESSION SNAPSHOT ──────────────────────────────────────────────────────┐
 * │ AI menyimpan "checkpoint" progres kerja ke disk. Di sesi berikutnya,   │
 * │ load snapshot dan AI langsung tahu konteks tanpa perlu diceritakan     │
 * │ ulang. Mirip dengan fitur "memadatkan percakapan" di Claude AI,        │
 * │ tapi dikendalikan oleh AI itu sendiri secara eksplisit.                │
 * │                                                                         │
 * │  Tools: context_save, context_load, context_list, context_delete       │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ CONTEXT COMPACTOR ─────────────────────────────────────────────────────┐
 * │ Tool yang meringkas teks panjang (log, output Gradle, kode, dsb.)      │
 * │ menjadi versi padat sebelum dimasukkan ke context AI. Tujuannya        │
 * │ mengurangi token yang terpakai, bukan kehilangan informasi penting.    │
 * │                                                                         │
 * │  Tools: context_compact, context_compact_file, context_stats           │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * Storage: ~/.android-expert-mcp/snapshots/<name>.json
 * Semua file I/O menggunakan atomicWriteJson (Mutex-protected).
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
export declare function registerContextManagerTools(server: McpServer): void;
//# sourceMappingURL=context_manager.d.ts.map