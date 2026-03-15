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
import { z } from "zod";
import * as path from "path";
import * as os from "os";
import * as fs from "fs/promises";
import {
  atomicReadJson,
  atomicWriteJson,
  ensureDir,
  formatToolError,
  truncateOutput,
  Mutex,
} from "../utils.js";

// ─── Constants ────────────────────────────────────────────────────────────────

const SNAPSHOT_DIR = path.join(os.homedir(), ".android-expert-mcp", "snapshots");
const MAX_SNAPSHOTS_PER_PROJECT = 20;
const SNAPSHOT_MUTEX = new Mutex();

// ─── Types ────────────────────────────────────────────────────────────────────

interface SessionSnapshot {
  id: string;           // nanoid-style, e.g. "snap_1711234567_abc"
  name: string;         // user-defined or "default"
  project: string;      // project name/path for grouping
  summary: string;      // AI-generated summary of current state
  current_task: string; // what was being done
  next_steps: string[]; // what still needs to be done
  context_data: Record<string, unknown>; // arbitrary structured data
  tags: string[];
  created_at: string;   // ISO
  updated_at: string;
  message_count: number; // approx messages in session when saved
}

interface SnapshotIndex {
  snapshots: SessionSnapshot[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getSnapshotPath(name: string): Promise<string> {
  await ensureDir(SNAPSHOT_DIR);
  const safe = name.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64);
  return path.join(SNAPSHOT_DIR, `${safe}.json`);
}

async function withSnapshots<T>(
  name: string,
  fn: (index: SnapshotIndex) => T | Promise<T>
): Promise<T> {
  const release = await SNAPSHOT_MUTEX.acquire();
  try {
    const filePath = await getSnapshotPath(name);
    const index = await atomicReadJson<SnapshotIndex>(filePath, { snapshots: [] });
    const result = await fn(index);
    await atomicWriteJson(filePath, index);
    return result;
  } finally {
    release();
  }
}

function makeId(): string {
  return `snap_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

/** Rough token estimate: ~4 chars per token */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// ─── COMPACTOR ENGINES ────────────────────────────────────────────────────────

/**
 * Compact a Gradle / Maven build log.
 * Keeps: errors, warnings, stack traces, task names, final summary.
 * Drops: download progress, incremental compilation noise, blank lines.
 */
function compactBuildLog(text: string): string {
  const lines = text.split("\n");
  const kept: string[] = [];
  let inStackTrace = false;

  for (const raw of lines) {
    const line = raw.trimEnd();

    // Always keep errors and warnings
    if (/\berror\b|\bfailure\b|\bFAILED\b/i.test(line)) {
      kept.push(line);
      inStackTrace = false;
      continue;
    }
    if (/\bwarning\b|\bwarn\b/i.test(line)) {
      kept.push(line);
      continue;
    }
    // Stack traces
    if (/^\s+at [\w.$]+/.test(line) || /^Caused by:/.test(line)) {
      if (kept.length < 150) kept.push(line); // limit stack trace depth
      inStackTrace = true;
      continue;
    }
    inStackTrace = false;
    // Task execution lines
    if (/^> Task :/.test(line)) { kept.push(line); continue; }
    // BUILD SUCCESS / FAILED
    if (/^BUILD (SUCCESS|FAILED)/.test(line)) { kept.push(line); continue; }
    // Exception class names
    if (/Exception|Error:/.test(line) && line.trim().length < 120) {
      kept.push(line); continue;
    }
    // Kotlin/Java compile errors  e.g. "e: file.kt:42:10: error: unresolved"
    if (/^[ew]: /.test(line)) { kept.push(line); continue; }
  }

  // Deduplicate adjacent identical lines
  const deduped = kept.filter((l, i) => i === 0 || l !== kept[i - 1]);

  const original = estimateTokens(text);
  const compacted = estimateTokens(deduped.join("\n"));
  const saved = Math.round((1 - compacted / original) * 100);

  return (
    `[BUILD LOG — compacted ${saved}% | ${original}→${compacted} tokens]\n` +
    `${"─".repeat(60)}\n` +
    deduped.join("\n")
  );
}

/**
 * Compact an ADB / Android logcat output.
 * Keeps: crashes, exceptions, ANR, E/ and W/ tagged lines, your app package.
 */
function compactAdbLog(text: string, packageFilter?: string): string {
  const lines = text.split("\n");
  const kept: string[] = [];
  let inCrash = false;

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line) continue;

    // Fatal / crash
    if (/FATAL EXCEPTION|ANR|CRASH|Process:.+has died/i.test(line)) {
      kept.push(line); inCrash = true; continue;
    }
    // Error / warning logcat tags
    if (/^\d+\s+\d+\s+[EW]\s/.test(line) || /\s+[EW]\//.test(line)) {
      kept.push(line); continue;
    }
    // Stack trace lines in crash
    if (inCrash && /^\s+at /.test(line)) {
      kept.push(line); continue;
    }
    inCrash = false;
    // Package filter
    if (packageFilter && line.includes(packageFilter)) {
      kept.push(line); continue;
    }
  }

  const original = estimateTokens(text);
  const compacted = estimateTokens(kept.join("\n"));
  const saved = Math.round((1 - compacted / original) * 100);

  return (
    `[ADB LOG — compacted ${saved}% | ${original}→${compacted} tokens]\n` +
    `${"─".repeat(60)}\n` +
    kept.join("\n")
  );
}

/**
 * Compact server/application logs (nginx, pm2, journalctl, etc.).
 * Keeps: errors (5xx), warnings, exceptions, startup/shutdown events.
 * Drops: health checks, static asset 200s, routine access logs.
 */
function compactServerLog(text: string): string {
  const lines = text.split("\n");
  const kept: string[] = [];

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line) continue;
    // HTTP 5xx errors
    if (/\b5\d{2}\b/.test(line)) { kept.push(line); continue; }
    // ERROR / WARN level
    if (/\b(ERROR|WARN|FATAL|CRITICAL|EXCEPTION)\b/i.test(line)) {
      kept.push(line); continue;
    }
    // Stack traces
    if (/^\s+at [\w.$]/.test(line)) { kept.push(line); continue; }
    // Service started/stopped/crashed
    if (/started|stopped|restarted|crashed|killed|OOM/i.test(line)) {
      kept.push(line); continue;
    }
  }

  const original = estimateTokens(text);
  const compacted = estimateTokens(kept.join("\n"));
  const saved = Math.round((1 - compacted / original) * 100);

  return (
    `[SERVER LOG — compacted ${saved}% | ${original}→${compacted} tokens]\n` +
    `${"─".repeat(60)}\n` +
    kept.join("\n")
  );
}

/**
 * Compact source code — keep structure, strip comments and blank lines.
 * Returns: imports, class/function signatures, key const/val declarations.
 * Preserves logic inside functions at reduced verbosity.
 */
function compactCode(text: string, lang?: string): string {
  const lines = text.split("\n");
  const kept: string[] = [];
  let blankRun = 0;

  for (const raw of lines) {
    const line = raw.trimEnd();

    // Skip pure comment lines
    if (/^\s*(\/\/|\/\*|\*|#)/.test(line) && !/\/\/ TODO|\/\/ FIXME|\/\/ NOTE/.test(line)) {
      continue;
    }
    // Collapse multiple blank lines into one
    if (!line.trim()) {
      blankRun++;
      if (blankRun === 1) kept.push("");
      continue;
    }
    blankRun = 0;

    // Always keep: imports, class/object/interface/enum declarations
    if (/^\s*(import|package|class |object |interface |enum |data class|sealed class)/.test(line)) {
      kept.push(line); continue;
    }
    // Function/method signatures
    if (/^\s*(fun |async function|function |def |public |private |protected |override |suspend )/.test(line)) {
      kept.push(line); continue;
    }
    // Kotlin/JS val/var/const at top-level
    if (/^\s*(val |var |const |let |export )/.test(line)) {
      kept.push(line); continue;
    }
    // Annotations
    if (/^\s*@/.test(line)) { kept.push(line); continue; }
    // Keep everything else but truncate very long lines
    kept.push(line.length > 120 ? line.slice(0, 117) + "..." : line);
  }

  const original = estimateTokens(text);
  const compacted = estimateTokens(kept.join("\n"));
  const saved = Math.round((1 - compacted / original) * 100);

  return (
    `[CODE${lang ? ` (${lang})` : ""} — compacted ${saved}% | ${original}→${compacted} tokens]\n` +
    `${"─".repeat(60)}\n` +
    kept.join("\n")
  );
}

/**
 * Generic compactor: remove blank lines, deduplicate, truncate very long lines.
 * Less aggressive than specialized modes.
 */
function compactGeneric(text: string): string {
  const lines = text.split("\n");
  const kept: string[] = [];
  let blankRun = 0;
  const seen = new Set<string>();

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      blankRun++;
      if (blankRun <= 1) kept.push("");
      continue;
    }
    blankRun = 0;
    const normalized = line.trim();
    if (seen.has(normalized)) continue; // skip exact duplicate lines
    seen.add(normalized);
    kept.push(line.length > 200 ? line.slice(0, 197) + "..." : line);
  }

  const original = estimateTokens(text);
  const compacted = estimateTokens(kept.join("\n"));
  const saved = Math.round((1 - compacted / original) * 100);

  return (
    `[GENERIC — compacted ${saved}% | ${original}→${compacted} tokens]\n` +
    `${"─".repeat(60)}\n` +
    kept.join("\n")
  );
}

// ─── Tool registration ────────────────────────────────────────────────────────

export function registerContextManagerTools(server: McpServer): void {

  // ── 1. context_save ───────────────────────────────────────────────────────
  server.tool(
    "context_save",
    "Simpan snapshot konteks sesi saat ini ke disk. " +
      "Gunakan tool ini kapan saja saat progres kerja perlu diingat untuk sesi berikutnya — " +
      "mirip 'checkpoint' atau 'save game'. " +
      "Di sesi berikutnya, panggil context_load() dan AI langsung tahu konteks tanpa harus diceritakan ulang. " +
      "Snapshot disimpan per 'project' sehingga beberapa proyek bisa ditrack terpisah.",
    {
      project: z
        .string()
        .describe(
          "Nama proyek atau identifier. Contoh: 'MyAndroidApp', 'tokopedia-scraper', 'vps-setup'. " +
            "Dipakai sebagai nama file. Gunakan nama yang konsisten antar sesi."
        ),
      summary: z
        .string()
        .describe(
          "Ringkasan LENGKAP state saat ini dalam 2-5 kalimat. " +
            "Apa yang sedang dibangun? Di tahap mana? Ada masalah yang belum selesai? " +
            "Tulis seperti memo untuk diri sendiri di sesi berikutnya."
        ),
      current_task: z
        .string()
        .describe("Task yang sedang dikerjakan saat ini. Satu kalimat singkat."),
      next_steps: z
        .array(z.string())
        .min(1)
        .describe(
          "Langkah-langkah yang HARUS dilakukan di sesi berikutnya. " +
            "Urutan penting — item pertama = hal pertama yang harus dikerjakan."
        ),
      context_data: z
        .record(z.unknown())
        .default({})
        .describe(
          "Data terstruktur bebas untuk disimpan. Contoh: " +
            '{"package": "com.dhasap.app", "last_error": "...", "branch": "feature/login", ' +
            '"files_modified": ["MainActivity.kt", "build.gradle"]}'
        ),
      tags: z
        .array(z.string())
        .default([])
        .describe("Tag opsional untuk pencarian. Contoh: ['kotlin', 'bug', 'firebase']"),
      message_count: z
        .number()
        .int()
        .default(0)
        .describe(
          "Perkiraan jumlah pesan dalam sesi ini (opsional, untuk tracking kapan snapshot dibuat)."
        ),
    },
    async ({ project, summary, current_task, next_steps, context_data, tags, message_count }) => {
      try {
        const newSnapshot: SessionSnapshot = {
          id: makeId(),
          name: project,
          project,
          summary,
          current_task,
          next_steps,
          context_data,
          tags,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          message_count,
        };

        await withSnapshots(project, (index) => {
          // Prepend new snapshot
          index.snapshots.unshift(newSnapshot);
          // Keep max N snapshots per project
          if (index.snapshots.length > MAX_SNAPSHOTS_PER_PROJECT) {
            index.snapshots = index.snapshots.slice(0, MAX_SNAPSHOTS_PER_PROJECT);
          }
        });

        return {
          content: [
            {
              type: "text",
              text:
                `✅ Context snapshot disimpan!\n` +
                `${"─".repeat(60)}\n` +
                `ID      : ${newSnapshot.id}\n` +
                `Project : ${project}\n` +
                `Task    : ${current_task}\n` +
                `Steps   : ${next_steps.length} langkah tersimpan\n` +
                `Tags    : ${tags.length > 0 ? tags.join(", ") : "(none)"}\n` +
                `Saved   : ${SNAPSHOT_DIR}/${project}.json\n\n` +
                `📌 Di sesi berikutnya ketik:\n` +
                `  context_load(project="${project}")`,
            },
          ],
        };
      } catch (error) {
        return { content: [{ type: "text", text: formatToolError("context_save", error) }] };
      }
    }
  );

  // ── 2. context_load ───────────────────────────────────────────────────────
  server.tool(
    "context_load",
    "Muat snapshot konteks sesi yang tersimpan. " +
      "Panggil tool ini di AWAL sesi baru untuk langsung tahu konteks dari sesi sebelumnya. " +
      "Mengembalikan ringkasan, task yang sedang dikerjakan, dan langkah-langkah berikutnya.",
    {
      project: z
        .string()
        .describe(
          "Nama proyek. Harus sama dengan nama yang dipakai saat context_save. " +
            "Gunakan context_list() jika tidak ingat nama proyeknya."
        ),
      snapshot_id: z
        .string()
        .optional()
        .describe(
          "ID snapshot spesifik (opsional). Kosongkan untuk load snapshot TERBARU. " +
            "Dapatkan ID dari context_list()."
        ),
    },
    async ({ project, snapshot_id }) => {
      try {
        const filePath = await getSnapshotPath(project);
        const index = await atomicReadJson<SnapshotIndex>(filePath, { snapshots: [] });

        if (index.snapshots.length === 0) {
          return {
            content: [
              {
                type: "text",
                text:
                  `❌ Tidak ada snapshot untuk project "${project}".\n\n` +
                  `Gunakan context_list() untuk lihat semua project yang tersimpan.`,
              },
            ],
          };
        }

        const snap = snapshot_id
          ? index.snapshots.find((s) => s.id === snapshot_id)
          : index.snapshots[0]; // latest

        if (!snap) {
          return {
            content: [
              {
                type: "text",
                text: `❌ Snapshot "${snapshot_id}" tidak ditemukan di project "${project}".`,
              },
            ],
          };
        }

        const age = Math.round(
          (Date.now() - new Date(snap.updated_at).getTime()) / (1000 * 60)
        );
        const ageStr =
          age < 60
            ? `${age} menit lalu`
            : age < 1440
            ? `${Math.round(age / 60)} jam lalu`
            : `${Math.round(age / 1440)} hari lalu`;

        const lines = [
          `📂 Context Loaded — ${project}`,
          "═".repeat(60),
          `Snapshot : ${snap.id}`,
          `Disimpan : ${ageStr} (${snap.updated_at.slice(0, 16).replace("T", " ")})`,
          snap.message_count
            ? `Messages : ~${snap.message_count} pesan di sesi tersebut`
            : "",
          `Tags     : ${snap.tags.join(", ") || "(none)"}`,
          "",
          "📋 RINGKASAN SESI SEBELUMNYA:",
          snap.summary,
          "",
          `⚡ SEDANG DIKERJAKAN:`,
          `  ${snap.current_task}`,
          "",
          "📝 LANGKAH BERIKUTNYA:",
          ...snap.next_steps.map((s, i) => `  ${i + 1}. ${s}`),
        ];

        if (Object.keys(snap.context_data).length > 0) {
          lines.push("", "🗃️  DATA KONTEKS:");
          for (const [key, val] of Object.entries(snap.context_data)) {
            const valStr =
              typeof val === "string"
                ? val
                : JSON.stringify(val);
            lines.push(`  ${key}: ${valStr}`);
          }
        }

        if (index.snapshots.length > 1) {
          lines.push(
            "",
            `💡 Ada ${index.snapshots.length - 1} snapshot lama lainnya — lihat dengan context_list(project="${project}")`
          );
        }

        return { content: [{ type: "text", text: lines.filter(Boolean).join("\n") }] };
      } catch (error) {
        return { content: [{ type: "text", text: formatToolError("context_load", error) }] };
      }
    }
  );

  // ── 3. context_list ───────────────────────────────────────────────────────
  server.tool(
    "context_list",
    "Tampilkan semua project yang memiliki snapshot tersimpan, " +
      "atau tampilkan riwayat snapshot dalam satu project.",
    {
      project: z
        .string()
        .optional()
        .describe(
          "Nama project untuk tampilkan riwayat snapshots-nya. " +
            "Kosongkan untuk tampilkan semua project."
        ),
    },
    async ({ project }) => {
      try {
        await ensureDir(SNAPSHOT_DIR);

        if (project) {
          // List snapshots within a specific project
          const filePath = await getSnapshotPath(project);
          const index = await atomicReadJson<SnapshotIndex>(filePath, { snapshots: [] });

          if (index.snapshots.length === 0) {
            return {
              content: [{ type: "text", text: `📭 Tidak ada snapshot untuk project "${project}".` }],
            };
          }

          const lines = [
            `🗂️  Snapshots — ${project} (${index.snapshots.length})`,
            "═".repeat(60),
          ];

          for (const s of index.snapshots) {
            const age = Math.round(
              (Date.now() - new Date(s.updated_at).getTime()) / (1000 * 60 * 60)
            );
            const ageStr = age < 24 ? `${age}j lalu` : `${Math.round(age / 24)}hr lalu`;
            lines.push(`📌 ${s.id}  [${ageStr}]`);
            lines.push(`   Task: ${s.current_task}`);
            lines.push(`   ${s.summary.slice(0, 100)}${s.summary.length > 100 ? "..." : ""}`);
            if (s.tags.length) lines.push(`   🏷️  ${s.tags.join(", ")}`);
            lines.push("");
          }

          return { content: [{ type: "text", text: lines.join("\n") }] };
        }

        // List all projects
        let files: string[];
        try {
          files = await fs.readdir(SNAPSHOT_DIR);
        } catch {
          return {
            content: [{ type: "text", text: "📭 Belum ada snapshot tersimpan. Gunakan context_save() untuk mulai." }],
          };
        }

        const jsonFiles = files.filter((f) => f.endsWith(".json"));
        if (jsonFiles.length === 0) {
          return {
            content: [{ type: "text", text: "📭 Belum ada snapshot tersimpan." }],
          };
        }

        const lines = [`🗂️  Semua Projects (${jsonFiles.length})`, "═".repeat(60)];

        for (const file of jsonFiles) {
          const projName = file.replace(".json", "");
          const index = await atomicReadJson<SnapshotIndex>(
            path.join(SNAPSHOT_DIR, file),
            { snapshots: [] }
          );
          if (index.snapshots.length === 0) continue;
          const latest = index.snapshots[0]!;
          const age = Math.round(
            (Date.now() - new Date(latest.updated_at).getTime()) / (1000 * 60 * 60)
          );
          const ageStr = age < 24 ? `${age}j lalu` : `${Math.round(age / 24)}hr lalu`;
          lines.push(
            `📁 ${projName}  (${index.snapshots.length} snapshot, terakhir ${ageStr})`
          );
          lines.push(`   ${latest.current_task}`);
          lines.push("");
        }

        lines.push(`💡 Load project: context_load(project="<nama>")`);

        return { content: [{ type: "text", text: lines.join("\n") }] };
      } catch (error) {
        return { content: [{ type: "text", text: formatToolError("context_list", error) }] };
      }
    }
  );

  // ── 4. context_delete ─────────────────────────────────────────────────────
  server.tool(
    "context_delete",
    "Hapus snapshot tertentu atau semua snapshot dalam sebuah project.",
    {
      project: z.string().describe("Nama project"),
      snapshot_id: z
        .string()
        .optional()
        .describe(
          "ID snapshot yang akan dihapus. Kosongkan untuk hapus SEMUA snapshot project ini."
        ),
    },
    async ({ project, snapshot_id }) => {
      try {
        if (!snapshot_id) {
          // Delete entire project file
          const filePath = await getSnapshotPath(project);
          await fs.unlink(filePath).catch(() => null);
          return {
            content: [{ type: "text", text: `🗑️  Semua snapshot project "${project}" dihapus.` }],
          };
        }

        // Delete specific snapshot
        let deleted = false;
        await withSnapshots(project, (index) => {
          const before = index.snapshots.length;
          index.snapshots = index.snapshots.filter((s) => s.id !== snapshot_id);
          deleted = index.snapshots.length < before;
        });

        return {
          content: [
            {
              type: "text",
              text: deleted
                ? `🗑️  Snapshot "${snapshot_id}" dihapus dari project "${project}".`
                : `❌ Snapshot "${snapshot_id}" tidak ditemukan.`,
            },
          ],
        };
      } catch (error) {
        return { content: [{ type: "text", text: formatToolError("context_delete", error) }] };
      }
    }
  );

  // ── 5. context_compact ────────────────────────────────────────────────────
  server.tool(
    "context_compact",
    "Padatkan teks panjang (log, output Gradle, kode, dsb.) menjadi versi yang jauh lebih ringkas " +
      "sebelum dimasukkan ke context AI. " +
      "Mengurangi token yang terpakai secara signifikan tanpa kehilangan informasi penting. " +
      "Pilih 'mode' yang sesuai dengan jenis teks untuk hasil terbaik.",
    {
      text: z
        .string()
        .describe("Teks yang akan dipadatkan. Bisa sangat panjang — tidak ada batas ukuran."),
      mode: z
        .enum(["build_log", "adb_log", "server_log", "code", "generic"])
        .default("generic")
        .describe(
          "Mode pemadatan:\n" +
            "  build_log  — Log Gradle/Maven: simpan hanya error, warning, stack trace, task names\n" +
            "  adb_log    — Output ADB/logcat: simpan crash, exception, E/ W/ lines\n" +
            "  server_log — Log server (nginx/pm2/journalctl): simpan 5xx, ERROR, WARN, crash\n" +
            "  code       — Source code: simpan struktur (import, class, fun), hilangkan komentar\n" +
            "  generic    — Umum: hapus duplikat, blank line berlebihan, truncate baris sangat panjang"
        ),
      package_filter: z
        .string()
        .optional()
        .describe("Khusus mode 'adb_log': filter log dari package tertentu. Contoh: 'com.dhasap.app'"),
      language: z
        .string()
        .optional()
        .describe("Khusus mode 'code': nama bahasa untuk ditampilkan di header. Contoh: 'Kotlin', 'TypeScript'"),
      max_output_chars: z
        .number()
        .int()
        .min(500)
        .max(50_000)
        .default(8_000)
        .describe("Batas karakter output setelah dipadatkan (default: 8000)"),
    },
    async ({ text, mode, package_filter, language, max_output_chars }) => {
      try {
        if (!text.trim()) {
          return {
            content: [{ type: "text", text: "❌ Input teks kosong." }],
          };
        }

        let compacted: string;
        switch (mode) {
          case "build_log":
            compacted = compactBuildLog(text);
            break;
          case "adb_log":
            compacted = compactAdbLog(text, package_filter);
            break;
          case "server_log":
            compacted = compactServerLog(text);
            break;
          case "code":
            compacted = compactCode(text, language);
            break;
          default:
            compacted = compactGeneric(text);
        }

        return { content: [{ type: "text", text: truncateOutput(compacted, max_output_chars) }] };
      } catch (error) {
        return { content: [{ type: "text", text: formatToolError("context_compact", error) }] };
      }
    }
  );

  // ── 6. context_compact_file ───────────────────────────────────────────────
  server.tool(
    "context_compact_file",
    "Baca file dari disk dan langsung padatkan isinya. " +
      "Shortcut dari: read_file → context_compact. " +
      "Berguna untuk membaca file log atau source code yang sangat besar tanpa memenuhi context.",
    {
      file_path: z
        .string()
        .describe("Path ke file yang akan dibaca dan dipadatkan."),
      mode: z
        .enum(["build_log", "adb_log", "server_log", "code", "generic"])
        .default("generic")
        .describe("Mode pemadatan. Lihat context_compact untuk deskripsi lengkap."),
      package_filter: z.string().optional(),
      language: z.string().optional().describe("Nama bahasa untuk mode 'code'"),
      max_output_chars: z.number().int().min(500).max(50_000).default(8_000),
    },
    async ({ file_path, mode, package_filter, language, max_output_chars }) => {
      try {
        let text: string;
        try {
          const raw = await fs.readFile(file_path, "utf-8");
          text = raw;
        } catch {
          return {
            content: [{ type: "text", text: `❌ Tidak bisa membaca file: ${file_path}` }],
          };
        }

        const fileSizeKb = Buffer.byteLength(text, "utf-8") / 1024;

        let compacted: string;
        switch (mode) {
          case "build_log": compacted = compactBuildLog(text); break;
          case "adb_log": compacted = compactAdbLog(text, package_filter); break;
          case "server_log": compacted = compactServerLog(text); break;
          case "code": compacted = compactCode(text, language); break;
          default: compacted = compactGeneric(text);
        }

        const header =
          `📄 File: ${file_path} (${fileSizeKb.toFixed(1)} KB)\n` +
          `Mode: ${mode}\n` +
          `${"─".repeat(60)}\n`;

        return {
          content: [{ type: "text", text: header + truncateOutput(compacted, max_output_chars) }],
        };
      } catch (error) {
        return { content: [{ type: "text", text: formatToolError("context_compact_file", error) }] };
      }
    }
  );

  // ── 7. context_stats ──────────────────────────────────────────────────────
  server.tool(
    "context_stats",
    "Tampilkan statistik penggunaan Context Manager: " +
      "jumlah project tersimpan, total snapshots, ukuran storage, " +
      "dan tips untuk menghemat context window.",
    {},
    async () => {
      try {
        await ensureDir(SNAPSHOT_DIR);

        let files: string[] = [];
        try {
          files = (await fs.readdir(SNAPSHOT_DIR)).filter((f) => f.endsWith(".json"));
        } catch { /* empty */ }

        let totalSnapshots = 0;
        let totalSizeBytes = 0;
        const projectSummaries: Array<{ name: string; count: number; lastSaved: string }> = [];

        for (const file of files) {
          const filePath = path.join(SNAPSHOT_DIR, file);
          const stat = await fs.stat(filePath).catch(() => null);
          if (stat) totalSizeBytes += stat.size;

          const index = await atomicReadJson<SnapshotIndex>(filePath, { snapshots: [] });
          totalSnapshots += index.snapshots.length;
          if (index.snapshots.length > 0) {
            const latest = index.snapshots[0]!;
            projectSummaries.push({
              name: file.replace(".json", ""),
              count: index.snapshots.length,
              lastSaved: latest.updated_at.slice(0, 16).replace("T", " "),
            });
          }
        }

        const storageSizeStr =
          totalSizeBytes < 1024
            ? `${totalSizeBytes} B`
            : `${(totalSizeBytes / 1024).toFixed(1)} KB`;

        const lines = [
          `🧠 Context Manager — Stats`,
          "═".repeat(55),
          `Projects    : ${files.length}`,
          `Total snaps : ${totalSnapshots}`,
          `Storage dir : ${SNAPSHOT_DIR}`,
          `Storage size: ${storageSizeStr}`,
          "",
        ];

        if (projectSummaries.length > 0) {
          lines.push("📁 Projects:");
          for (const p of projectSummaries) {
            lines.push(`  • ${p.name}  (${p.count} snap, last: ${p.lastSaved})`);
          }
          lines.push("");
        }

        lines.push(
          "💡 Tips hemat context window:",
          "  1. Panggil context_save() sebelum sesi panjang berakhir",
          "  2. Di sesi baru, mulai dengan context_load() — hemat puluhan pesan penjelasan ulang",
          "  3. Pakai context_compact(mode='build_log') untuk log Gradle — hemat 70-90% tokens",
          "  4. Pakai context_compact(mode='code') sebelum paste file .kt/.ts besar",
          "  5. Gunakan context_compact_file() untuk file log > 100KB langsung dari path",
          "  6. Simpan error penting ke error_remember() — bisa dicari di sesi lain tanpa paste ulang"
        );

        return { content: [{ type: "text", text: lines.join("\n") }] };
      } catch (error) {
        return { content: [{ type: "text", text: formatToolError("context_stats", error) }] };
      }
    }
  );
}
