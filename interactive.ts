/**
 * Interactive UI Tools — AI-to-User Interaction Widgets
 * ─────────────────────────────────────────────────────────────────────────────
 * Tools yang memungkinkan AI untuk mempresentasikan pilihan interaktif,
 * mengumpulkan input user, dan mengelola state percakapan yang lebih kaya.
 *
 *   • Sajikan pilihan tunggal / multi-select
 *   • Konfirmasi aksi sebelum eksekusi
 *   • Input form terstruktur
 *   • Progress tracker untuk task panjang
 *   • Menu navigasi berjenjang
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import { formatToolError, ensureDir } from "../utils.js";

// ─── State store untuk tracking session interaksi ────────────────────────────

interface InteractionSession {
  id: string;
  type: string;
  question: string;
  options: string[];
  createdAt: Date;
  response?: string | string[];
}

const interactionStore = new Map<string, InteractionSession>();

function generateId(): string {
  return `ui_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

// ─── ASCII/Unicode UI Renderers ───────────────────────────────────────────────

function renderSingleChoice(
  title: string,
  question: string,
  options: string[],
  descriptions?: string[]
): string {
  const width = 60;
  const border = "─".repeat(width);

  const lines: string[] = [
    `╭${border}╮`,
    `│  🤔  ${title.slice(0, width - 6).padEnd(width - 4)}│`,
    `├${border}┤`,
    `│  ${question.slice(0, width - 2).padEnd(width - 2)}│`,
    `├${border}┤`,
  ];

  options.forEach((opt, i) => {
    const num = `${i + 1}.`;
    const desc = descriptions?.[i] ? `\n│     ${descriptions[i]!.slice(0, width - 5).padEnd(width - 5)}│` : "";
    lines.push(`│  ${num.padEnd(3)} ${opt.slice(0, width - 8).padEnd(width - 6)}│${desc}`);
  });

  lines.push(`╰${border}╯`);
  lines.push(`\n💬 Ketik nomor pilihan (1–${options.length}) atau nama opsinya.`);

  return lines.join("\n");
}

function renderMultiChoice(
  title: string,
  question: string,
  options: string[]
): string {
  const width = 60;
  const border = "─".repeat(width);

  const lines: string[] = [
    `╭${border}╮`,
    `│  ☑️   ${title.slice(0, width - 6).padEnd(width - 4)}│`,
    `├${border}┤`,
    `│  ${question.slice(0, width - 2).padEnd(width - 2)}│`,
    `│  (Bisa pilih lebih dari satu)${" ".repeat(width - 30)}│`,
    `├${border}┤`,
  ];

  options.forEach((opt, i) => {
    lines.push(`│  [ ] ${i + 1}. ${opt.slice(0, width - 10).padEnd(width - 8)}│`);
  });

  lines.push(`╰${border}╯`);
  lines.push(`\n💬 Ketik nomor-nomor pilihan dipisah koma, misal: 1,3,4`);
  lines.push(`   Atau ketik 'semua' untuk memilih semua opsi.`);

  return lines.join("\n");
}

function renderConfirm(question: string, detail?: string): string {
  const width = 60;
  const border = "─".repeat(width);

  return [
    `╭${border}╮`,
    `│  ⚠️   KONFIRMASI${" ".repeat(width - 17)}│`,
    `├${border}┤`,
    `│  ${question.slice(0, width - 2).padEnd(width - 2)}│`,
    ...(detail
      ? [`│  ${detail.slice(0, width - 2).padEnd(width - 2)}│`]
      : []),
    `├${border}┤`,
    `│  [Y] Ya, lanjutkan     [N] Tidak, batalkan${" ".repeat(width - 43)}│`,
    `╰${border}╯`,
    `\n💬 Ketik 'y' atau 'ya' untuk lanjut, 'n' atau 'tidak' untuk batalkan.`,
  ].join("\n");
}

function renderMenu(title: string, items: Array<{ label: string; description?: string; icon?: string }>): string {
  const width = 60;
  const border = "─".repeat(width);

  const lines: string[] = [
    `╭${border}╮`,
    `│  ${(items[0]?.icon ?? "📋")}   ${title.slice(0, width - 6).padEnd(width - 4)}│`,
    `├${border}┤`,
  ];

  items.forEach((item, i) => {
    const num = `${i + 1}.`;
    const icon = item.icon ?? "  ";
    lines.push(`│  ${num.padEnd(3)} ${icon} ${item.label.slice(0, width - 11).padEnd(width - 9)}│`);
    if (item.description) {
      lines.push(`│       ${item.description.slice(0, width - 7).padEnd(width - 7)}│`);
    }
  });

  lines.push(`├${border}┤`);
  lines.push(`│  0. ← Kembali / Batalkan${" ".repeat(width - 25)}│`);
  lines.push(`╰${border}╯`);

  return lines.join("\n");
}

function renderProgress(
  title: string,
  steps: Array<{ name: string; status: "done" | "active" | "pending" | "error" }>,
  currentMessage?: string
): string {
  const statusIcon = {
    done: "✅",
    active: "⏳",
    pending: "⬜",
    error: "❌",
  };

  const width = 60;
  const border = "─".repeat(width);

  const doneCount = steps.filter((s) => s.status === "done").length;
  const pct = Math.round((doneCount / steps.length) * 100);
  const barWidth = 40;
  const filled = Math.round((pct / 100) * barWidth);
  const bar = "█".repeat(filled) + "░".repeat(barWidth - filled);

  const lines: string[] = [
    `╭${border}╮`,
    `│  🔄  ${title.slice(0, width - 6).padEnd(width - 4)}│`,
    `├${border}┤`,
    `│  [${bar}] ${pct}%${" ".repeat(width - barWidth - 8)}│`,
    `├${border}┤`,
  ];

  steps.forEach((step) => {
    const icon = statusIcon[step.status];
    lines.push(`│  ${icon} ${step.name.slice(0, width - 6).padEnd(width - 4)}│`);
  });

  if (currentMessage) {
    lines.push(`├${border}┤`);
    lines.push(`│  💬 ${currentMessage.slice(0, width - 5).padEnd(width - 3)}│`);
  }

  lines.push(`╰${border}╯`);
  return lines.join("\n");
}

function renderInfoCard(
  title: string,
  fields: Array<{ key: string; value: string; highlight?: boolean }>,
  footer?: string
): string {
  const width = 60;
  const border = "─".repeat(width);

  const lines: string[] = [
    `╭${border}╮`,
    `│  ℹ️   ${title.slice(0, width - 6).padEnd(width - 4)}│`,
    `├${border}┤`,
  ];

  fields.forEach((f) => {
    const prefix = f.highlight ? "🔸" : "  ";
    const key = f.key.padEnd(18);
    const value = f.value.slice(0, width - 22);
    lines.push(`│ ${prefix} ${key}: ${value.padEnd(width - key.length - 5)}│`);
  });

  if (footer) {
    lines.push(`├${border}┤`);
    lines.push(`│  ${footer.slice(0, width - 2).padEnd(width - 2)}│`);
  }

  lines.push(`╰${border}╯`);
  return lines.join("\n");
}

// ─── Tool registration ────────────────────────────────────────────────────────

export function registerInteractiveTools(server: McpServer): void {
  // ── 1. ui_single_choice ───────────────────────────────────────────────────
  server.tool(
    "ui_single_choice",
    "Tampilkan UI pilihan tunggal (radio button style) ke user. " +
      "Gunakan ini ketika AI perlu user memilih SATU opsi sebelum melanjutkan. " +
      "Contoh: pilih environment (dev/staging/prod), pilih module yang ingin dibuild, " +
      "pilih tipe file yang ingin dibuat.",
    {
      title: z.string().describe("Judul widget pilihan, misal 'Pilih Build Variant'"),
      question: z.string().describe("Pertanyaan yang ingin diajukan ke user"),
      options: z
        .array(z.string())
        .min(2)
        .max(10)
        .describe("Daftar opsi yang tersedia (2–10 pilihan)"),
      descriptions: z
        .array(z.string())
        .optional()
        .describe("Deskripsi tambahan untuk tiap opsi (opsional, harus sama panjang dengan options)"),
      default_option: z
        .number()
        .int()
        .min(1)
        .optional()
        .describe("Indeks opsi default yang disarankan (1-based)"),
      context: z
        .string()
        .optional()
        .describe("Konteks tambahan untuk membantu user memilih"),
    },
    async ({ title, question, options, descriptions, default_option, context }) => {
      try {
        const sessionId = generateId();
        interactionStore.set(sessionId, {
          id: sessionId,
          type: "single_choice",
          question,
          options,
          createdAt: new Date(),
        });

        let output = renderSingleChoice(title, question, options, descriptions);

        if (default_option && default_option <= options.length) {
          output += `\n\n💡 Rekomendasi: Opsi ${default_option} (${options[default_option - 1]})`;
        }

        if (context) {
          output += `\n\n📌 Konteks: ${context}`;
        }

        return { content: [{ type: "text", text: output }] };
      } catch (error) {
        return {
          content: [{ type: "text", text: formatToolError("ui_single_choice", error) }],
        };
      }
    }
  );

  // ── 2. ui_multi_choice ────────────────────────────────────────────────────
  server.tool(
    "ui_multi_choice",
    "Tampilkan UI pilihan berganda (checkbox style) ke user. " +
      "Gunakan ketika user boleh memilih LEBIH DARI SATU opsi. " +
      "Contoh: pilih fitur yang ingin diaktifkan, pilih tools yang ingin di-install, " +
      "pilih kategori audit yang ingin dijalankan.",
    {
      title: z.string().describe("Judul widget"),
      question: z.string().describe("Pertanyaan ke user"),
      options: z
        .array(z.string())
        .min(2)
        .max(15)
        .describe("Daftar opsi tersedia"),
      min_select: z
        .number()
        .int()
        .min(1)
        .default(1)
        .describe("Minimum pilihan yang harus dipilih"),
      max_select: z
        .number()
        .int()
        .optional()
        .describe("Maksimum pilihan (kosong = tidak terbatas)"),
      preselected: z
        .array(z.number().int())
        .optional()
        .describe("Indeks opsi yang sudah tercentang by default (1-based)"),
    },
    async ({ title, question, options, min_select, max_select, preselected }) => {
      try {
        let output = renderMultiChoice(title, question, options);

        if (preselected && preselected.length > 0) {
          const names = preselected.map((i) => options[i - 1]).filter(Boolean).join(", ");
          output += `\n\n💡 Saran: ${names}`;
        }

        if (min_select > 1 || max_select) {
          output += `\n\n📏 Pilih antara ${min_select}–${max_select ?? options.length} opsi.`;
        }

        return { content: [{ type: "text", text: output }] };
      } catch (error) {
        return {
          content: [{ type: "text", text: formatToolError("ui_multi_choice", error) }],
        };
      }
    }
  );

  // ── 3. ui_confirm ─────────────────────────────────────────────────────────
  server.tool(
    "ui_confirm",
    "Tampilkan dialog konfirmasi sebelum AI melakukan aksi yang tidak bisa di-undo. " +
      "WAJIB digunakan sebelum: menghapus file, overwrite data penting, " +
      "menjalankan build release, deploy ke production.",
    {
      question: z.string().describe("Pertanyaan konfirmasi"),
      detail: z
        .string()
        .optional()
        .describe("Detail aksi yang akan dilakukan"),
      warning: z
        .string()
        .optional()
        .describe("Peringatan khusus jika aksi ini berbahaya"),
      action_label: z
        .string()
        .default("Lanjutkan")
        .describe("Label tombol aksi positif"),
    },
    async ({ question, detail, warning, action_label }) => {
      try {
        let output = renderConfirm(question, detail);

        if (warning) {
          output += `\n\n⚠️  PERINGATAN: ${warning}`;
        }

        output += `\n\n✅ Ketik 'y' atau '${action_label.toLowerCase()}' untuk melanjutkan.`;
        output += `\n❌ Ketik 'n' atau 'batal' untuk membatalkan.`;

        return { content: [{ type: "text", text: output }] };
      } catch (error) {
        return {
          content: [{ type: "text", text: formatToolError("ui_confirm", error) }],
        };
      }
    }
  );

  // ── 4. ui_menu ────────────────────────────────────────────────────────────
  server.tool(
    "ui_menu",
    "Tampilkan menu navigasi berjenjang. Berguna untuk mengekspos fitur-fitur " +
      "MCP secara terorganisir, atau membuat wizard setup step-by-step.",
    {
      title: z.string().describe("Judul menu"),
      items: z
        .array(
          z.object({
            label: z.string().describe("Teks menu item"),
            description: z.string().optional().describe("Deskripsi singkat"),
            icon: z.string().optional().describe("Emoji icon, misal '🔧', '📱', '🌐'"),
          })
        )
        .min(1)
        .max(15)
        .describe("Daftar item menu"),
      show_back: z
        .boolean()
        .default(true)
        .describe("Tampilkan opsi 'Kembali' (0)"),
      footer_text: z
        .string()
        .optional()
        .describe("Teks footer di bawah menu"),
    },
    async ({ title, items, footer_text }) => {
      try {
        let output = renderMenu(title, items);

        if (footer_text) {
          output += `\n\n📌 ${footer_text}`;
        }

        return { content: [{ type: "text", text: output }] };
      } catch (error) {
        return {
          content: [{ type: "text", text: formatToolError("ui_menu", error) }],
        };
      }
    }
  );

  // ── 5. ui_progress ────────────────────────────────────────────────────────
  server.tool(
    "ui_progress",
    "Tampilkan progress tracker untuk task multi-step yang panjang. " +
      "Update status setiap langkah agar user tahu apa yang sedang terjadi. " +
      "Contoh: proses build → test → deploy.",
    {
      title: z.string().describe("Judul task"),
      steps: z
        .array(
          z.object({
            name: z.string().describe("Nama langkah"),
            status: z
              .enum(["done", "active", "pending", "error"])
              .describe("Status: done=selesai, active=sedang berjalan, pending=belum, error=gagal"),
          })
        )
        .min(1)
        .max(20)
        .describe("Daftar langkah dengan statusnya"),
      current_message: z
        .string()
        .optional()
        .describe("Pesan status terkini yang ditampilkan di bawah progress"),
      show_eta: z
        .boolean()
        .default(false)
        .describe("Tampilkan estimasi waktu (jika tersedia)"),
    },
    async ({ title, steps, current_message }) => {
      try {
        const output = renderProgress(title, steps, current_message);
        return { content: [{ type: "text", text: output }] };
      } catch (error) {
        return {
          content: [{ type: "text", text: formatToolError("ui_progress", error) }],
        };
      }
    }
  );

  // ── 6. ui_info_card ───────────────────────────────────────────────────────
  server.tool(
    "ui_info_card",
    "Tampilkan kartu informasi terstruktur dengan key-value pairs. " +
      "Gunakan untuk menampilkan hasil analisis, ringkasan konfigurasi, " +
      "atau informasi device/project secara rapi.",
    {
      title: z.string().describe("Judul kartu info"),
      fields: z
        .array(
          z.object({
            key: z.string().describe("Label field"),
            value: z.string().describe("Nilai field"),
            highlight: z
              .boolean()
              .default(false)
              .describe("Tandai field ini sebagai penting"),
          })
        )
        .min(1)
        .max(20),
      footer: z.string().optional().describe("Teks footer"),
    },
    async ({ title, fields, footer }) => {
      try {
        const output = renderInfoCard(title, fields, footer);
        return { content: [{ type: "text", text: output }] };
      } catch (error) {
        return {
          content: [{ type: "text", text: formatToolError("ui_info_card", error) }],
        };
      }
    }
  );

  // ── 7. ui_input_form ──────────────────────────────────────────────────────
  server.tool(
    "ui_input_form",
    "Tampilkan form terstruktur untuk mengumpulkan beberapa input sekaligus " +
      "dari user. Lebih efisien daripada tanya satu per satu.",
    {
      title: z.string().describe("Judul form"),
      description: z
        .string()
        .optional()
        .describe("Deskripsi form"),
      fields: z
        .array(
          z.object({
            name: z.string().describe("Nama field (identifier)"),
            label: z.string().describe("Label yang ditampilkan"),
            type: z
              .enum(["text", "number", "path", "url", "password", "choice", "boolean"])
              .default("text")
              .describe("Tipe input"),
            required: z.boolean().default(true),
            default_value: z.string().optional().describe("Nilai default"),
            hint: z.string().optional().describe("Hint/placeholder"),
            choices: z.array(z.string()).optional().describe("Opsi untuk tipe 'choice'"),
          })
        )
        .min(1)
        .max(10),
    },
    async ({ title, description, fields }) => {
      try {
        const width = 60;
        const border = "─".repeat(width);

        const lines: string[] = [
          `╭${border}╮`,
          `│  📋  ${title.slice(0, width - 6).padEnd(width - 4)}│`,
        ];

        if (description) {
          lines.push(`├${border}┤`);
          lines.push(`│  ${description.slice(0, width - 2).padEnd(width - 2)}│`);
        }

        lines.push(`├${border}┤`);

        fields.forEach((field, i) => {
          const req = field.required ? " *" : "";
          const def = field.default_value ? ` [default: ${field.default_value}]` : "";
          const hint = field.hint ? ` (${field.hint})` : "";

          lines.push(`│  ${i + 1}. ${field.label}${req}${" ".repeat(Math.max(0, width - 5 - field.label.length - req.length))}│`);

          if (field.type === "choice" && field.choices) {
            const choiceStr = field.choices.map((c, ci) => `${ci + 1})${c}`).join(", ");
            lines.push(`│     Pilih: ${choiceStr.slice(0, width - 12).padEnd(width - 10)}│`);
          } else {
            lines.push(`│     Tipe: ${field.type}${def}${hint}${" ".repeat(Math.max(0, width - 10 - field.type.length - def.length - hint.length))}│`);
          }
        });

        lines.push(`╰${border}╯`);
        lines.push(`\n💬 Balas dengan format:`);
        lines.push(`   1: [nilai field 1]`);
        lines.push(`   2: [nilai field 2]`);
        lines.push(`   ... dst`);
        lines.push(`\n   Atau tulis semuanya sekaligus dalam satu pesan.`);

        return { content: [{ type: "text", text: lines.join("\n") }] };
      } catch (error) {
        return {
          content: [{ type: "text", text: formatToolError("ui_input_form", error) }],
        };
      }
    }
  );

  // ── 8. ui_table ───────────────────────────────────────────────────────────
  server.tool(
    "ui_table",
    "Render data dalam bentuk tabel ASCII yang rapi. " +
      "Ideal untuk menampilkan hasil audit, daftar device, atau perbandingan opsi.",
    {
      title: z.string().describe("Judul tabel"),
      headers: z.array(z.string()).min(1).max(8).describe("Header kolom"),
      rows: z
        .array(z.array(z.string()))
        .min(1)
        .max(50)
        .describe("Data baris (array of arrays)"),
      highlight_row: z
        .number()
        .int()
        .optional()
        .describe("Indeks baris yang di-highlight (0-based)"),
      footer: z.string().optional().describe("Teks footer tabel"),
    },
    async ({ title, headers, rows, highlight_row, footer }) => {
      try {
        // Hitung lebar tiap kolom
        const colWidths = headers.map((h, i) => {
          const maxRowLen = Math.max(...rows.map((r) => (r[i] ?? "").length));
          return Math.min(30, Math.max(h.length, maxRowLen));
        });

        const renderRow = (cells: string[], isHeader = false, highlight = false): string => {
          const sep = isHeader ? "│" : "│";
          const prefix = highlight ? "►" : " ";
          return (
            `│${prefix}` +
            cells
              .map((c, i) => (c ?? "").slice(0, colWidths[i]!).padEnd(colWidths[i]!))
              .join(" │ ") +
            " │"
          );
        };

        const borderLine = (left: string, mid: string, right: string): string =>
          left + colWidths.map((w) => "─".repeat(w + 2)).join(mid) + right;

        const lines: string[] = [
          `📊 ${title}`,
          borderLine("┌", "┬", "┐"),
          renderRow(headers, true),
          borderLine("├", "┼", "┤"),
          ...rows.map((row, i) =>
            renderRow(
              headers.map((_, ci) => row[ci] ?? ""),
              false,
              i === highlight_row
            )
          ),
          borderLine("└", "┴", "┘"),
        ];

        if (footer) lines.push(`\n📌 ${footer}`);

        return { content: [{ type: "text", text: lines.join("\n") }] };
      } catch (error) {
        return {
          content: [{ type: "text", text: formatToolError("ui_table", error) }],
        };
      }
    }
  );

  // ── 9. ui_notification ───────────────────────────────────────────────────
  server.tool(
    "ui_notification",
    "Tampilkan notifikasi/alert bergaya ke user. " +
      "Berguna untuk memberikan feedback hasil operasi, warning, atau info penting.",
    {
      type: z
        .enum(["success", "error", "warning", "info", "tip"])
        .describe("Jenis notifikasi"),
      title: z.string().describe("Judul notifikasi"),
      message: z.string().describe("Isi pesan"),
      action_hint: z
        .string()
        .optional()
        .describe("Saran aksi selanjutnya"),
    },
    async ({ type, title, message, action_hint }) => {
      try {
        const styles = {
          success: { icon: "✅", border: "═", prefix: "SUKSES" },
          error: { icon: "❌", border: "═", prefix: "ERROR" },
          warning: { icon: "⚠️ ", border: "─", prefix: "PERINGATAN" },
          info: { icon: "ℹ️ ", border: "─", prefix: "INFO" },
          tip: { icon: "💡", border: "─", prefix: "TIP" },
        };

        const style = styles[type];
        const width = 58;
        const top = `╔${"═".repeat(width)}╗`;
        const bot = `╚${"═".repeat(width)}╝`;
        const mid = `╠${"═".repeat(width)}╣`;
        const row = (text: string) =>
          `║  ${text.slice(0, width - 2).padEnd(width - 2)}║`;

        const lines = [
          top,
          row(`${style.icon}  ${style.prefix}: ${title}`),
          mid,
          row(message),
        ];

        if (action_hint) {
          lines.push(`║${"─".repeat(width)}║`);
          lines.push(row(`➤ ${action_hint}`));
        }

        lines.push(bot);

        return { content: [{ type: "text", text: lines.join("\n") }] };
      } catch (error) {
        return {
          content: [{ type: "text", text: formatToolError("ui_notification", error) }],
        };
      }
    }
  );
}
