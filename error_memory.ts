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
import { z } from "zod";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import * as crypto from "crypto";
import { formatToolError, ensureDir } from "../utils.js";

// ─── Types ────────────────────────────────────────────────────────────────────

type TechStack =
  | "kotlin"
  | "java"
  | "javascript"
  | "typescript"
  | "python"
  | "firebase"
  | "turso"
  | "gradle"
  | "adb"
  | "npm"
  | "git"
  | "other";

type ErrorStatus = "solved" | "workaround" | "unsolved" | "investigating";

interface Solution {
  id: string;
  description: string;
  code_snippet?: string;
  worked: boolean;
  added_at: string;
  notes?: string;
}

interface ErrorEntry {
  id: string;
  fingerprint: string;
  title: string;
  raw_error: string;
  normalized_error: string;
  tech_stack: TechStack;
  error_type: string;
  file_context?: string;
  project_context?: string;
  status: ErrorStatus;
  solutions: Solution[];
  tags: string[];
  occurrences: number;
  first_seen: string;
  last_seen: string;
  related_ids: string[];
}

interface MemoryBank {
  version: string;
  created_at: string;
  updated_at: string;
  entries: ErrorEntry[];
  stats: {
    total_entries: number;
    solved: number;
    unsolved: number;
    total_occurrences: number;
  };
}

// ─── Storage ──────────────────────────────────────────────────────────────────

const BANK_DIR = path.join(os.homedir(), ".android-expert-mcp");
const BANK_FILE = path.join(BANK_DIR, "error_memory_bank.json");

async function loadBank(): Promise<MemoryBank> {
  await ensureDir(BANK_DIR);
  try {
    const raw = await fs.readFile(BANK_FILE, "utf-8");
    return JSON.parse(raw) as MemoryBank;
  } catch {
    return {
      version: "1.0",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      entries: [],
      stats: { total_entries: 0, solved: 0, unsolved: 0, total_occurrences: 0 },
    };
  }
}

async function saveBank(bank: MemoryBank): Promise<void> {
  // Recompute stats
  bank.stats = {
    total_entries: bank.entries.length,
    solved: bank.entries.filter((e) => e.status === "solved").length,
    unsolved: bank.entries.filter((e) => e.status === "unsolved").length,
    total_occurrences: bank.entries.reduce((s, e) => s + e.occurrences, 0),
  };
  bank.updated_at = new Date().toISOString();
  await fs.writeFile(BANK_FILE, JSON.stringify(bank, null, 2), "utf-8");
}

// ─── Error Fingerprinting ─────────────────────────────────────────────────────

/**
 * Normalisasi error message agar hal-hal yang berubah tiap run
 * (line numbers, temp paths, hex addresses, timestamps) dihapus.
 * Sisanya di-hash untuk fingerprint unik.
 */
function normalizeError(raw: string): string {
  return raw
    .replace(/\b0x[0-9a-fA-F]+\b/g, "0xADDR")           // hex addresses
    .replace(/:\d+:\d+/g, ":L:C")                         // line:col
    .replace(/line \d+/gi, "line N")                       // "line 42"
    .replace(/\bat line \d+\b/gi, "at line N")
    .replace(/\/tmp\/[^\s]*/g, "/tmp/PATH")                // temp paths
    .replace(/\/home\/[^/\s]+/g, "/home/USER")             // user home
    .replace(/pid=\d+/gi, "pid=N")                         // process IDs
    .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/g, "TIMESTAMP")
    .replace(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/gi, "UUID")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500); // cap untuk konsistensi
}

function fingerprintError(normalized: string): string {
  return crypto.createHash("sha256").update(normalized).digest("hex").slice(0, 16);
}

// ─── Error Parser ─────────────────────────────────────────────────────────────

interface ParsedError {
  tech_stack: TechStack;
  error_type: string;
  title: string;
  key_lines: string[];
}

function parseError(raw: string): ParsedError {
  const lower = raw.toLowerCase();

  // Kotlin / Java
  if (/exception|error:.*\.kt|\.java/.test(lower) || /at com\.|at org\.|at java\./.test(lower)) {
    const typeMatch = raw.match(/([A-Z][a-zA-Z]*(?:Exception|Error|Failure))/);
    const msgMatch = raw.match(/(?:Exception|Error)[:\s]+([^\n]+)/);
    return {
      tech_stack: raw.includes(".kt") ? "kotlin" : "java",
      error_type: typeMatch?.[1] ?? "RuntimeException",
      title: msgMatch?.[1]?.trim().slice(0, 80) ?? typeMatch?.[1] ?? "Kotlin/Java Error",
      key_lines: raw.split("\n").filter((l) => /exception|error|caused by/i.test(l)).slice(0, 5),
    };
  }

  // Gradle build
  if (/gradle|build failed|task.*failed|could not resolve/i.test(lower)) {
    const taskMatch = raw.match(/task[:\s]+['"]?([^'">\n]+)/i);
    const errMatch = raw.match(/(?:error|failed)[:\s]+([^\n]+)/i);
    return {
      tech_stack: "gradle",
      error_type: raw.includes("Could not resolve") ? "DependencyResolution" : "BuildFailure",
      title: errMatch?.[1]?.trim().slice(0, 80) ?? "Gradle Build Failed",
      key_lines: raw.split("\n").filter((l) => /^e:|error:|build failed|failed/i.test(l.trim())).slice(0, 5),
    };
  }

  // JavaScript / TypeScript
  if (/typeerror|referenceerror|syntaxerror|uncaught|cannot read|is not a function|\.ts\(|\.js:/i.test(lower)) {
    const typeMatch = raw.match(/(TypeError|ReferenceError|SyntaxError|RangeError|URIError)/);
    const msgMatch = raw.match(/(TypeError|ReferenceError|SyntaxError)[:\s]+([^\n]+)/);
    return {
      tech_stack: raw.includes(".ts") ? "typescript" : "javascript",
      error_type: typeMatch?.[1] ?? "RuntimeError",
      title: msgMatch?.[2]?.trim().slice(0, 80) ?? "JavaScript Error",
      key_lines: raw.split("\n").filter((l) => /error|at /i.test(l)).slice(0, 5),
    };
  }

  // Python
  if (/traceback|syntaxerror|indentationerror|nameerror|importerror|modulenotfounderror/i.test(lower)) {
    const typeMatch = raw.match(/(Traceback.*most recent|[A-Z][a-zA-Z]*Error)[:\s]+([^\n]*)/);
    const lastLine = raw.trim().split("\n").reverse().find((l) => /error:/i.test(l));
    return {
      tech_stack: "python",
      error_type: typeMatch?.[1]?.split(":")[0] ?? "PythonError",
      title: lastLine?.replace(/^[A-Za-z]+Error:\s*/i, "").trim().slice(0, 80) ?? "Python Error",
      key_lines: raw.split("\n").filter((l) => /error|file "|line \d/i.test(l)).slice(0, 5),
    };
  }

  // Firebase
  if (/firebase|firestore|auth\/|storage\/|functions\//i.test(lower)) {
    const codeMatch = raw.match(/([a-z-]+\/[a-z-]+)/);
    return {
      tech_stack: "firebase",
      error_type: codeMatch?.[1] ?? "FirebaseError",
      title: raw.split("\n")[0]?.slice(0, 80) ?? "Firebase Error",
      key_lines: raw.split("\n").slice(0, 4),
    };
  }

  // Turso / SQLite / libSQL
  if (/turso|libsql|sqlite|hrana/i.test(lower)) {
    return {
      tech_stack: "turso",
      error_type: "DatabaseError",
      title: raw.split("\n")[0]?.slice(0, 80) ?? "Turso/SQLite Error",
      key_lines: raw.split("\n").slice(0, 3),
    };
  }

  // npm
  if (/npm err|npm warn|enoent|eacces|peer dep|package.json/i.test(lower)) {
    const codeMatch = raw.match(/npm error code ([^\s]+)/i);
    return {
      tech_stack: "npm",
      error_type: codeMatch?.[1] ?? "NpmError",
      title: raw.split("\n").find((l) => /npm error/i.test(l))?.slice(0, 80) ?? "npm Error",
      key_lines: raw.split("\n").filter((l) => /npm error/i.test(l)).slice(0, 4),
    };
  }

  // ADB
  if (/adb|device not found|offline|unauthorized/i.test(lower)) {
    return {
      tech_stack: "adb",
      error_type: "AdbError",
      title: raw.split("\n")[0]?.slice(0, 80) ?? "ADB Error",
      key_lines: raw.split("\n").slice(0, 3),
    };
  }

  // Default
  return {
    tech_stack: "other",
    error_type: "UnknownError",
    title: raw.split("\n")[0]?.slice(0, 80) ?? "Unknown Error",
    key_lines: raw.split("\n").slice(0, 3),
  };
}

// ─── Similarity Search ────────────────────────────────────────────────────────

function similarity(a: string, b: string): number {
  const wordsA = new Set(a.toLowerCase().split(/\W+/).filter((w) => w.length > 3));
  const wordsB = new Set(b.toLowerCase().split(/\W+/).filter((w) => w.length > 3));
  const intersection = [...wordsA].filter((w) => wordsB.has(w)).length;
  const union = new Set([...wordsA, ...wordsB]).size;
  return union === 0 ? 0 : intersection / union;
}

function findSimilar(
  bank: MemoryBank,
  normalized: string,
  fingerprint: string,
  limit: number = 5
): Array<ErrorEntry & { match_score: number; match_type: string }> {
  return bank.entries
    .map((entry) => {
      let score = 0;
      let matchType = "keyword";

      if (entry.fingerprint === fingerprint) {
        score = 1.0;
        matchType = "exact";
      } else {
        score = similarity(normalized, entry.normalized_error);
        if (score > 0.7) matchType = "high_similarity";
        else if (score > 0.4) matchType = "partial";
      }

      return { ...entry, match_score: score, match_type: matchType };
    })
    .filter((e) => e.match_score > 0.2)
    .sort((a, b) => b.match_score - a.match_score)
    .slice(0, limit);
}

// ─── Formatters ───────────────────────────────────────────────────────────────

function formatEntry(entry: ErrorEntry, verbose = false): string {
  const statusIcon = {
    solved: "✅",
    workaround: "🔧",
    unsolved: "❌",
    investigating: "🔍",
  }[entry.status];

  const lines = [
    `${statusIcon} [${entry.id.slice(0, 8)}] ${entry.title}`,
    `   Stack : ${entry.tech_stack} | Type: ${entry.error_type}`,
    `   Status: ${entry.status} | Seen: ${entry.occurrences}x | Last: ${entry.last_seen.slice(0, 10)}`,
  ];

  if (entry.tags.length > 0) {
    lines.push(`   Tags  : ${entry.tags.join(", ")}`);
  }

  if (verbose && entry.solutions.length > 0) {
    lines.push(`   💡 Solutions (${entry.solutions.length}):`);
    entry.solutions.forEach((s, i) => {
      lines.push(`      ${i + 1}. ${s.worked ? "✅" : "❌"} ${s.description}`);
      if (s.code_snippet) {
        lines.push(`         \`\`\`\n         ${s.code_snippet.slice(0, 200)}\n         \`\`\``);
      }
    });
  }

  return lines.join("\n");
}

// ─── Tool Registration ────────────────────────────────────────────────────────

export function registerErrorMemoryTools(server: McpServer): void {

  // ── 1. error_remember ────────────────────────────────────────────────────
  server.tool(
    "error_remember",
    "Simpan error baru ke Memory Bank. AI akan otomatis parse tech stack, " +
      "error type, dan fingerprint-nya. Jika error yang sama pernah ada, " +
      "tambahkan occurrence count dan return solusi yang sudah diketahui. " +
      "PANGGIL INI setiap kali menemukan error baru.",
    {
      raw_error: z
        .string()
        .describe("Teks error lengkap: stack trace, error message, log output"),
      project_context: z
        .string()
        .optional()
        .describe("Nama/deskripsi project, misal 'MyApp Android' atau 'bot-telegram'"),
      file_context: z
        .string()
        .optional()
        .describe("File yang bermasalah, misal 'MainActivity.kt' atau 'index.ts'"),
      tags: z
        .array(z.string())
        .default([])
        .describe("Tag tambahan, misal ['login', 'network', 'database']"),
      force_new: z
        .boolean()
        .default(false)
        .describe("Paksa buat entri baru meski sudah ada yang mirip"),
    },
    async ({ raw_error, project_context, file_context, tags, force_new }) => {
      try {
        const bank = await loadBank();
        const parsed = parseError(raw_error);
        const normalized = normalizeError(raw_error);
        const fingerprint = fingerprintError(normalized);

        // Cari apakah error ini sudah ada
        const existing = bank.entries.find((e) => e.fingerprint === fingerprint);

        if (existing && !force_new) {
          // Update occurrence
          existing.occurrences++;
          existing.last_seen = new Date().toISOString();
          if (project_context && !existing.project_context?.includes(project_context)) {
            existing.project_context =
              (existing.project_context ? existing.project_context + ", " : "") + project_context;
          }
          await saveBank(bank);

          const lines = [
            `🔁 Error ini PERNAH TERJADI SEBELUMNYA (${existing.occurrences}x)`,
            "═".repeat(55),
            formatEntry(existing, true),
          ];

          if (existing.solutions.length === 0) {
            lines.push("\n⚠️  Belum ada solusi tersimpan. Gunakan error_add_solution untuk menambahkan.");
          }

          return { content: [{ type: "text", text: lines.join("\n") }] };
        }

        // Cari yang mirip tapi bukan exact match
        const similar = findSimilar(bank, normalized, fingerprint, 3).filter(
          (e) => e.fingerprint !== fingerprint
        );

        // Buat entri baru
        const newEntry: ErrorEntry = {
          id: crypto.randomUUID(),
          fingerprint,
          title: parsed.title,
          raw_error: raw_error.slice(0, 2000),
          normalized_error: normalized,
          tech_stack: parsed.tech_stack,
          error_type: parsed.error_type,
          file_context,
          project_context,
          status: "unsolved",
          solutions: [],
          tags: [...new Set([...tags, parsed.tech_stack, parsed.error_type.toLowerCase()])],
          occurrences: 1,
          first_seen: new Date().toISOString(),
          last_seen: new Date().toISOString(),
          related_ids: similar.map((s) => s.id),
        };

        bank.entries.push(newEntry);
        await saveBank(bank);

        const lines = [
          `🆕 Error baru disimpan ke Memory Bank`,
          "═".repeat(55),
          formatEntry(newEntry),
          `\n🔑 ID: ${newEntry.id}`,
          `   Gunakan ID ini untuk menambahkan solusi dengan error_add_solution`,
        ];

        if (similar.length > 0) {
          lines.push("\n🔍 Error serupa yang pernah ada:");
          similar.forEach((s) => {
            lines.push(`   ${formatEntry(s, true)}`);
          });
        }

        return { content: [{ type: "text", text: lines.join("\n") }] };
      } catch (error) {
        return {
          content: [{ type: "text", text: formatToolError("error_remember", error) }],
        };
      }
    }
  );

  // ── 2. error_search ───────────────────────────────────────────────────────
  server.tool(
    "error_search",
    "Cari error di Memory Bank berdasarkan keyword, tech stack, atau status. " +
      "Gunakan ini SEBELUM debugging — mungkin AI sudah punya solusinya!",
    {
      query: z
        .string()
        .optional()
        .describe("Keyword pencarian: nama error, pesan, atau deskripsi"),
      tech_stack: z
        .enum(["kotlin", "java", "javascript", "typescript", "python",
               "firebase", "turso", "gradle", "adb", "npm", "git", "other", "all"])
        .default("all")
        .describe("Filter by tech stack"),
      status: z
        .enum(["solved", "workaround", "unsolved", "investigating", "all"])
        .default("all")
        .describe("Filter by status"),
      tags: z
        .array(z.string())
        .default([])
        .describe("Filter by tags"),
      limit: z
        .number()
        .int()
        .min(1)
        .max(50)
        .default(10)
        .describe("Jumlah hasil maksimum"),
      verbose: z
        .boolean()
        .default(true)
        .describe("Tampilkan solusi di hasil"),
    },
    async ({ query, tech_stack, status, tags, limit, verbose }) => {
      try {
        const bank = await loadBank();

        if (bank.entries.length === 0) {
          return {
            content: [
              {
                type: "text",
                text:
                  "📭 Memory Bank masih kosong.\n" +
                  "Gunakan error_remember untuk mulai menyimpan error.",
              },
            ],
          };
        }

        let results = bank.entries;

        // Filter tech stack
        if (tech_stack !== "all") {
          results = results.filter((e) => e.tech_stack === tech_stack);
        }

        // Filter status
        if (status !== "all") {
          results = results.filter((e) => e.status === status);
        }

        // Filter tags
        if (tags.length > 0) {
          results = results.filter((e) =>
            tags.some((t) => e.tags.includes(t.toLowerCase()))
          );
        }

        // Keyword search + similarity scoring
        if (query) {
          const normalized = normalizeError(query);
          const fingerprint = fingerprintError(normalized);

          results = results
            .map((e) => ({
              entry: e,
              score:
                e.fingerprint === fingerprint
                  ? 1.0
                  : similarity(query.toLowerCase(), (e.title + " " + e.raw_error).toLowerCase()),
            }))
            .filter((r) => r.score > 0.1)
            .sort((a, b) => b.score - a.score)
            .map((r) => r.entry);
        } else {
          // Sort by last seen jika tidak ada query
          results = results.sort(
            (a, b) => new Date(b.last_seen).getTime() - new Date(a.last_seen).getTime()
          );
        }

        results = results.slice(0, limit);

        if (results.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: `🔍 Tidak ada error ditemukan untuk query: "${query ?? "(semua)"}"`,
              },
            ],
          };
        }

        const lines = [
          `🔍 Memory Bank Search Results (${results.length} ditemukan)`,
          "═".repeat(55),
          "",
        ];

        results.forEach((e, i) => {
          lines.push(`${i + 1}. ${formatEntry(e, verbose)}`);
          lines.push("");
        });

        return { content: [{ type: "text", text: lines.join("\n") }] };
      } catch (error) {
        return {
          content: [{ type: "text", text: formatToolError("error_search", error) }],
        };
      }
    }
  );

  // ── 3. error_add_solution ─────────────────────────────────────────────────
  server.tool(
    "error_add_solution",
    "Tambahkan solusi ke error yang ada di Memory Bank. " +
      "Tandai apakah solusi berhasil atau tidak. " +
      "AI akan belajar dari ini untuk suggest fix di masa depan.",
    {
      error_id: z
        .string()
        .describe("ID error dari error_remember atau error_search (bisa pakai 8 karakter pertama)"),
      solution_description: z
        .string()
        .describe("Deskripsi solusi yang diterapkan"),
      code_snippet: z
        .string()
        .optional()
        .describe("Kode yang digunakan untuk fix (opsional tapi sangat membantu)"),
      worked: z
        .boolean()
        .describe("Apakah solusi ini berhasil menyelesaikan error?"),
      new_status: z
        .enum(["solved", "workaround", "unsolved", "investigating"])
        .optional()
        .describe("Update status error (otomatis 'solved' jika worked=true)"),
      notes: z
        .string()
        .optional()
        .describe("Catatan tambahan, konteks, atau side effects"),
    },
    async ({ error_id, solution_description, code_snippet, worked, new_status, notes }) => {
      try {
        const bank = await loadBank();

        // Cari entry by ID (full atau 8 char prefix)
        const entry = bank.entries.find(
          (e) => e.id === error_id || e.id.startsWith(error_id)
        );

        if (!entry) {
          return {
            content: [
              {
                type: "text",
                text:
                  `❌ Error dengan ID '${error_id}' tidak ditemukan.\n` +
                  "Gunakan error_search untuk mencari ID yang benar.",
              },
            ],
          };
        }

        const solution: Solution = {
          id: crypto.randomUUID().slice(0, 8),
          description: solution_description,
          code_snippet,
          worked,
          added_at: new Date().toISOString(),
          notes,
        };

        entry.solutions.push(solution);

        // Update status otomatis
        if (new_status) {
          entry.status = new_status;
        } else if (worked) {
          entry.status = "solved";
        }

        await saveBank(bank);

        return {
          content: [
            {
              type: "text",
              text:
                `${worked ? "✅" : "❌"} Solusi ditambahkan!\n` +
                "═".repeat(55) +
                `\nError  : ${entry.title}\n` +
                `Status : ${entry.status}\n` +
                `Solusi : ${solution_description}\n` +
                (code_snippet ? `Kode   :\n\`\`\`\n${code_snippet.slice(0, 500)}\n\`\`\`` : "") +
                `\n\nTotal solusi untuk error ini: ${entry.solutions.length}`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: formatToolError("error_add_solution", error) }],
        };
      }
    }
  );

  // ── 4. error_auto_diagnose ────────────────────────────────────────────────
  server.tool(
    "error_auto_diagnose",
    "Analisis error baru secara otomatis: parse, cari di Memory Bank, " +
      "dan suggest solusi yang relevan sekaligus. " +
      "ALL-IN-ONE tool — pakai ini sebagai first response saat ada error.",
    {
      raw_error: z
        .string()
        .describe("Error message / stack trace lengkap"),
      project_context: z
        .string()
        .optional()
        .describe("Konteks project"),
      also_remember: z
        .boolean()
        .default(true)
        .describe("Simpan juga ke Memory Bank (default: true)"),
    },
    async ({ raw_error, project_context, also_remember }) => {
      try {
        const bank = await loadBank();
        const parsed = parseError(raw_error);
        const normalized = normalizeError(raw_error);
        const fingerprint = fingerprintError(normalized);

        const lines: string[] = [
          "🧠 Error Auto-Diagnosis",
          "═".repeat(55),
          `📋 Tech Stack : ${parsed.tech_stack}`,
          `🏷️  Error Type : ${parsed.error_type}`,
          `📝 Title      : ${parsed.title}`,
          "",
          "🔑 Key Lines:",
          ...parsed.key_lines.map((l) => `   ${l.trim()}`),
          "",
        ];

        // Cari di memory bank
        const matches = findSimilar(bank, normalized, fingerprint, 5);

        if (matches.length > 0) {
          const exactMatch = matches.find((m) => m.fingerprint === fingerprint);

          if (exactMatch) {
            lines.push(`🎯 EXACT MATCH — Error ini pernah terjadi ${exactMatch.occurrences}x!`);
            lines.push("─".repeat(55));
            lines.push(formatEntry(exactMatch, true));

            // Update occurrence
            if (also_remember) {
              const entry = bank.entries.find((e) => e.id === exactMatch.id);
              if (entry) {
                entry.occurrences++;
                entry.last_seen = new Date().toISOString();
                await saveBank(bank);
              }
            }
          } else {
            lines.push(`🔍 Ditemukan ${matches.length} error serupa:`);
            matches.forEach((m, i) => {
              lines.push(`\n${i + 1}. Similarity: ${Math.round(m.match_score * 100)}%`);
              lines.push(formatEntry(m, true));
            });
          }
        } else {
          lines.push("🆕 Error baru — belum ada di Memory Bank.");

          if (also_remember) {
            const newEntry: ErrorEntry = {
              id: crypto.randomUUID(),
              fingerprint,
              title: parsed.title,
              raw_error: raw_error.slice(0, 2000),
              normalized_error: normalized,
              tech_stack: parsed.tech_stack,
              error_type: parsed.error_type,
              project_context,
              status: "unsolved",
              solutions: [],
              tags: [parsed.tech_stack, parsed.error_type.toLowerCase()],
              occurrences: 1,
              first_seen: new Date().toISOString(),
              last_seen: new Date().toISOString(),
              related_ids: [],
            };
            bank.entries.push(newEntry);
            await saveBank(bank);
            lines.push(`✅ Disimpan ke Memory Bank. ID: ${newEntry.id.slice(0, 8)}`);
          }
        }

        // Suggest debugging approach berdasarkan tech stack
        lines.push("\n💡 Suggested Debugging Approach:");
        const suggestions: Record<TechStack, string[]> = {
          kotlin: [
            "Cek baris yang ditunjuk stack trace dengan adb_read_logcat",
            "Tambahkan try-catch di sekitar kode yang crash",
            "Cek null safety — gunakan ?. dan ?: operator",
          ],
          java: ["Cek NullPointerException — tambahkan null check", "Review stack trace dari bawah ke atas"],
          gradle: [
            "Coba: ./gradlew clean build --stacktrace",
            "Hapus .gradle/caches dan rebuild",
            "Sync Gradle di Android Studio",
          ],
          javascript: [
            "Cek undefined/null sebelum akses property",
            "Review async/await error handling",
            "Tambahkan console.error di catch block",
          ],
          typescript: [
            "Perhatikan type mismatch di kompiler error",
            "Cek apakah ada 'as any' yang menyembunyikan error",
          ],
          python: [
            "Cek indentasi dan sintaks",
            "Verifikasi semua import tersedia",
            "Gunakan traceback.print_exc() untuk detail",
          ],
          firebase: [
            "Cek Firebase Console untuk error detail",
            "Verifikasi rules Firestore/Storage",
            "Cek koneksi dan autentikasi token",
          ],
          turso: [
            "Cek koneksi URL dan auth token Turso",
            "Verifikasi schema tabel",
            "Coba query langsung via Turso CLI",
          ],
          npm: [
            "Hapus node_modules dan package-lock.json, lalu npm install",
            "Cek kompatibilitas versi Node.js",
            "Gunakan npm install --legacy-peer-deps jika peer dep conflict",
          ],
          adb: [
            "adb kill-server && adb start-server",
            "Cabut dan pasang kembali kabel USB",
            "Cek USB debugging aktif di device",
          ],
          git: ["Cek status dengan git status", "Review conflict markers"],
          other: ["Review error message dengan teliti", "Cari di Stack Overflow"],
        };

        const tips = suggestions[parsed.tech_stack] ?? suggestions.other;
        tips.forEach((tip, i) => lines.push(`   ${i + 1}. ${tip}`));

        return { content: [{ type: "text", text: lines.join("\n") }] };
      } catch (error) {
        return {
          content: [{ type: "text", text: formatToolError("error_auto_diagnose", error) }],
        };
      }
    }
  );

  // ── 5. error_stats ────────────────────────────────────────────────────────
  server.tool(
    "error_stats",
    "Tampilkan statistik Memory Bank: error paling sering, " +
      "tech stack paling bermasalah, tren, dan health score project.",
    {
      project_filter: z
        .string()
        .optional()
        .describe("Filter statistik untuk project tertentu"),
    },
    async ({ project_filter }) => {
      try {
        const bank = await loadBank();

        let entries = bank.entries;
        if (project_filter) {
          entries = entries.filter((e) =>
            e.project_context?.toLowerCase().includes(project_filter.toLowerCase())
          );
        }

        if (entries.length === 0) {
          return {
            content: [{ type: "text", text: "📭 Memory Bank kosong." }],
          };
        }

        // Stats per tech stack
        const byStack = entries.reduce<Record<string, { count: number; solved: number; total_occ: number }>>(
          (acc, e) => {
            if (!acc[e.tech_stack]) acc[e.tech_stack] = { count: 0, solved: 0, total_occ: 0 };
            acc[e.tech_stack]!.count++;
            if (e.status === "solved") acc[e.tech_stack]!.solved++;
            acc[e.tech_stack]!.total_occ += e.occurrences;
            return acc;
          },
          {}
        );

        // Top recurring errors
        const topRecurring = [...entries]
          .sort((a, b) => b.occurrences - a.occurrences)
          .slice(0, 5);

        // Health score (% solved)
        const solved = entries.filter((e) => e.status === "solved").length;
        const healthPct = Math.round((solved / entries.length) * 100);
        const healthEmoji =
          healthPct >= 80 ? "🟢" : healthPct >= 50 ? "🟡" : "🔴";

        const lines = [
          "📊 Error Memory Bank — Statistics",
          "═".repeat(55),
          `Total Entries : ${entries.length}`,
          `Total Ocurr.  : ${entries.reduce((s, e) => s + e.occurrences, 0)}`,
          `Solved        : ${solved} / ${entries.length}`,
          `${healthEmoji} Health Score : ${healthPct}%`,
          "",
          "📚 BY TECH STACK:",
        ];

        Object.entries(byStack)
          .sort(([, a], [, b]) => b.total_occ - a.total_occ)
          .forEach(([stack, data]) => {
            const solveRate = Math.round((data.solved / data.count) * 100);
            const bar = "█".repeat(Math.round(solveRate / 10)) + "░".repeat(10 - Math.round(solveRate / 10));
            lines.push(
              `   ${stack.padEnd(12)} [${bar}] ${solveRate}% solved | ${data.count} unique | ${data.total_occ}x occurred`
            );
          });

        lines.push("");
        lines.push("🔁 TOP RECURRING ERRORS:");
        topRecurring.forEach((e, i) => {
          lines.push(
            `   ${i + 1}. (${e.occurrences}x) ${e.title.slice(0, 60)} [${e.status}]`
          );
        });

        return { content: [{ type: "text", text: lines.join("\n") }] };
      } catch (error) {
        return {
          content: [{ type: "text", text: formatToolError("error_stats", error) }],
        };
      }
    }
  );

  // ── 6. error_export / import ──────────────────────────────────────────────
  server.tool(
    "error_export",
    "Export Memory Bank ke file JSON untuk backup atau sharing antar device.",
    {
      output_path: z
        .string()
        .optional()
        .describe("Path output. Default: ~/error_bank_export_<timestamp>.json"),
      filter_status: z
        .enum(["solved", "all"])
        .default("all")
        .describe("Export semua atau hanya yang solved"),
    },
    async ({ output_path, filter_status }) => {
      try {
        const bank = await loadBank();
        const toExport = {
          ...bank,
          entries:
            filter_status === "solved"
              ? bank.entries.filter((e) => e.status === "solved")
              : bank.entries,
        };

        const ts = Date.now();
        const outPath =
          output_path ??
          path.join(os.homedir(), `error_bank_export_${ts}.json`);
        await fs.writeFile(outPath, JSON.stringify(toExport, null, 2), "utf-8");

        return {
          content: [
            {
              type: "text",
              text:
                `✅ Memory Bank exported!\n` +
                `   File   : ${outPath}\n` +
                `   Entries: ${toExport.entries.length}`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: formatToolError("error_export", error) }],
        };
      }
    }
  );
}
