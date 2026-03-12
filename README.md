# 🤖 Android Expert MCP Server

> A production-grade **Model Context Protocol (MCP) Server** — v2.0 — that gives your AI Agent expert-level capabilities in Android/Kotlin development, web scraping, professional website auditing, **full browser control**, and **interactive UI widgets**.

[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18.0-green)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.5-blue)](https://typescriptlang.org)
[![MCP SDK](https://img.shields.io/badge/MCP%20SDK-1.x-purple)](https://github.com/modelcontextprotocol/sdk)
[![Version](https://img.shields.io/badge/version-2.0.0-orange)]()
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow)](LICENSE)

---

## ✨ Features — 46 Tools, 6 Categories

### 🏗️ Architecture & Planning Tools (6)
File system traversal, read/write/edit files, generate architecture docs.

### 📱 Kotlin, Gradle & Android ADB Tools (8)
Gradle task runner with stack trace extraction, ADB UI dump, logcat, APK extraction, Kotlin analyzer.

### 🕷️ Web Scraping & DOM Extraction (4)
Puppeteer-powered headless scraping, DOM extraction, JS execution, network monitor.

### 🔍 Website Review & Audit (5)
Full-page screenshots, Lighthouse audit, SEO analysis, mobile responsiveness check.

### 🖥️ Interactive Browser Control (14) 🆕
| Tool | Fungsi |
|------|--------|
| `browser_open` | Buka browser + URL, buat session persisten dengan session_id |
| `browser_screenshot` | Screenshot kondisi browser saat ini |
| `browser_click` | Klik elemen via CSS selector |
| `browser_type` | Ketik teks ke form field |
| `browser_navigate` | goto / back / forward / reload / new_tab |
| `browser_scroll` | Scroll up/down/top/bottom/to_element |
| `browser_get_content` | Ambil HTML/teks/links/inputs halaman |
| `browser_wait` | Tunggu selector/network/waktu |
| `browser_select` | Pilih dropdown, toggle checkbox |
| `browser_execute_script` | Eksekusi JS di halaman |
| `browser_close` | Tutup session |
| `browser_list_sessions` | Lihat semua sesi aktif |
| `browser_hover` | Hover untuk tooltip/dropdown |
| `browser_keyboard` | Key khusus: Enter, Tab, Ctrl+A, dll |

### 🎨 Interactive UI Widgets (9) 🆕
| Tool | Fungsi |
|------|--------|
| `ui_single_choice` | Widget pilihan tunggal (seperti radio button) |
| `ui_multi_choice` | Widget pilihan berganda (seperti checkbox) |
| `ui_confirm` | Dialog konfirmasi sebelum aksi berbahaya |
| `ui_menu` | Menu navigasi berjenjang |
| `ui_progress` | Progress tracker untuk task multi-step |
| `ui_info_card` | Kartu informasi key-value |
| `ui_input_form` | Form multi-field terstruktur |
| `ui_table` | Tabel ASCII dari data dinamis |
| `ui_notification` | Notifikasi success/error/warning/tip |

---

## 🚀 Quick Start

```bash
git clone https://github.com/dhasap/android-expert-mcp.git
cd android-expert-mcp
npm install
npm run build

# Daftarkan ke Kimi CLI
kimi mcp add --transport stdio node /absolute/path/to/android-expert-mcp/build/index.js
```

Lihat **[SETUP.md](SETUP.md)** untuk panduan lengkap.

---

## 💡 Contoh Penggunaan Browser Tools

```
# AI akan melakukan urutan operasi ini:
"Login ke github.com dengan username saya"
→ browser_open(url="https://github.com/login")
→ browser_type(selector="#login_field", text="username")
→ browser_type(selector="#password", text="***")
→ browser_click(selector="[type=submit]")
→ browser_screenshot() ← verifikasi berhasil login

"Isi form registrasi di example.com"
→ browser_open(url="https://example.com/register")
→ browser_get_content(content_type="all_inputs") ← analisis form dulu
→ browser_type + browser_select + browser_click
→ browser_screenshot() ← konfirmasi
```

## 💡 Contoh Penggunaan UI Widgets

```
# AI meminta user memilih sebelum lanjut:
→ ui_single_choice(options=["assembleDebug","assembleRelease","test"])
→ ui_confirm(question="Yakin jalankan build release?", warning="Akan upload ke Play Store")
→ ui_progress(steps=[{name:"Build",status:"active"}, {name:"Sign",status:"pending"}])
```

---

## 📁 Project Structure

```
android-expert-mcp/
├── src/
│   ├── index.ts              # Server bootstrap (v2: 46 tools)
│   ├── utils.ts              # Shared utilities
│   └── tools/
│       ├── architecture.ts   # File & docs tools
│       ├── android.ts        # Gradle, ADB, Kotlin
│       ├── scraping.ts       # Puppeteer scraping
│       ├── audit.ts          # Lighthouse & SEO
│       ├── browser.ts        # 🆕 Session-based browser control
│       └── interactive.ts    # 🆕 UI widgets & choices
├── SETUP.md                  # Panduan setup lengkap
├── TOOLS_REFERENCE.md        # Dokumentasi semua tools
├── CHANGELOG.md              # Riwayat perubahan
└── README.md
```

---

## 📄 License

MIT — see [LICENSE](LICENSE).
