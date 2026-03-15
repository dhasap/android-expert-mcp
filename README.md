# 🤖 Android Expert MCP Server

> Production-grade **Model Context Protocol (MCP) Server** — **v5.0** — yang memberikan kemampuan expert-level kepada AI Agent Anda untuk Android/Kotlin development, web scraping, website auditing, browser control, interactive UI, emulator Firebase, error memory, scaffolding, VPS deploy, **wireless ADB debugging**, dan **GitHub integration**.

[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18.0-green)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.5-blue)](https://typescriptlang.org)
[![MCP SDK](https://img.shields.io/badge/MCP%20SDK-1.x-purple)](https://github.com/modelcontextprotocol/sdk)
[![Version](https://img.shields.io/badge/version-5.0.0-orange)](https://github.com/dhasap/android-expert-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow)](LICENSE)

---

## ✨ Features — 97 Tools, 12 Categories

| # | Kategori | Tools | Deskripsi |
|---|----------|-------|-----------|
| 1 | 🏗️ Architecture & Planning | 6 | File system, read/write/edit, arsitektur docs |
| 2 | 📱 Android / Kotlin / ADB | 8 | Gradle, logcat, UI dump, APK extract, Kotlin analyzer |
| 3 | 🕷️ Web Scraping & DOM | 4 | Puppeteer scraping, DOM extract, JS execute, network monitor |
| 4 | 🔍 Website Audit | 5 | Lighthouse, screenshot, SEO, mobile responsiveness |
| 5 | 🖥️ Browser Control | 14 | Session browser: click, type, scroll, screenshot, JS |
| 6 | 🎨 Interactive UI Widgets | 9 | Choice, confirm, form, progress, table, notification |
| 7 | 🔥 IDX Emulator + Firebase Test Lab | 13 | Emulator control, install APK, FTL test, screenshot, record |
| 8 | 🧠 Error Memory Bank | 6 | Auto-diagnose, remember, search, stats, export |
| 9 | 🏗️ Project Scaffolding | 4 | Android, Telegram bot, Chrome extension, Node API |
| 10 | 🚀 VPS & Deploy Manager | 10 | SSH exec, monitor, deploy, logs, Turso, history |
| 11 | 📡 Wireless ADB | 8 | **Baru!** Pair, connect, shell, screenshot, UI dump via WiFi |
| 12 | 🐙 GitHub Integration | 10 | **Baru!** Repo, issues, PRs, file read/write, commit, release |

---

## 📡 Category 11 — Wireless ADB Debugging (Baru!)

Debug dan scrape Android app **tanpa kabel USB**, tanpa emulator. Mendukung dua mode:

| Mode | Android | Cara |
|------|---------|------|
| Legacy | Android 10- | Sambung USB sekali → `adb_wifi_enable` → cabut USB → `adb_wifi_connect` |
| Modern | Android 11+ | Full wireless — `adb_wifi_pair` → `adb_wifi_connect` |

| Tool | Fungsi |
|------|--------|
| `adb_wifi_pair` | Pair perangkat Android 11+ dengan 6-digit pairing code |
| `adb_wifi_connect` | Hubungkan ke perangkat via IP:PORT |
| `adb_wifi_enable` | Aktifkan TCP mode via USB (untuk Android 10-) |
| `adb_wifi_devices` | Tampilkan semua perangkat wireless yang terhubung |
| `adb_wifi_disconnect` | Putuskan koneksi wireless |
| `adb_wifi_shell` | Jalankan shell command di perangkat wireless |
| `adb_wifi_screenshot` | Ambil screenshot layar via WiFi ADB |
| `adb_wifi_ui_dump` | Dump UI hierarchy untuk scraping app native |

**Contoh: Scrape data dari app Android via WiFi**
```
1. adb_wifi_pair(pair_address="192.168.1.5:37891", pairing_code="482931")
2. adb_wifi_connect(address="192.168.1.5:45123")
3. adb_wifi_ui_dump(address="192.168.1.5:45123", filter_package="com.tokopedia.tkpd")
   → Dapat semua teks produk, harga, ID elemen yang tampil di layar
4. adb_wifi_shell(address="192.168.1.5:45123", command="am start -n com.app/.MainActivity")
   → Navigasi antar halaman app untuk scraping berikutnya
```

---

## 🐙 Category 12 — GitHub Integration (Baru!)

Kelola repository GitHub langsung dari chat AI. Default owner: **@dhasap**.

| Tool | Fungsi |
|------|--------|
| `github_repo_list` | List semua repository (default: @dhasap) |
| `github_repo_info` | Detail repo: stats, branches, languages, topics |
| `github_repo_create` | Buat repository baru |
| `github_file_read` | Baca file dari repo (branch apapun) |
| `github_file_write` | Buat/update file di repo |
| `github_issue_list` | List issues (open/closed) |
| `github_issue_create` | Buat issue baru |
| `github_pr_list` | List Pull Requests |
| `github_commit_push` | Push beberapa file dalam satu commit (Tree API) |
| `github_release_create` | Buat GitHub Release / tag |

**Setup:**
```bash
export GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

---

## 🔒 Production Hardening (v4.x → v5.x)

| Fix | Deskripsi |
|-----|-----------|
| Atomic JSON writes | Mutex + .tmp rename — data tidak corrupt jika crash |
| Puppeteer Semaphore | Max 2 Chromium concurrent — mencegah RAM/CPU spike |
| Global ADB Mutex | 48 ADB calls serialised — mencegah ADB server crash |
| Secret masking | Token tidak pernah muncul di error output |
| Path traversal protection | Blokir akses `/etc`, `~/.ssh`, dll |
| Browser session cap | Max 5 sesi, otomatis evict yang paling idle |
| Temp file cleanup | Auto-delete file > 24 jam setiap 1 jam |
| TTL session cleanup | Interactive store 60 min, browser 30 min |
| Graceful shutdown | Chromium ditutup dulu sebelum exit |
| base64 SSH | Command kompleks tidak rusak oleh shell escaping |

---

## 🚀 Quick Start

```bash
git clone https://github.com/dhasap/android-expert-mcp.git
cd android-expert-mcp
npm install
npm run build

# Setup environment (wajib untuk Web Scraping, Audit, Browser)
export PUPPETEER_EXECUTABLE_PATH=$(which chromium || which google-chrome)

# Daftarkan ke Claude Code CLI
claude mcp add android-expert --transport stdio node /absolute/path/to/android-expert-mcp/build/index.js

# Atau Kimi CLI
kimi mcp add --transport stdio node /absolute/path/to/android-expert-mcp/build/index.js
```

Lihat **[SETUP.md](SETUP.md)** untuk panduan lengkap termasuk setup GITHUB_TOKEN dan Wireless ADB.  
Lihat **[PUPPETEER_SETUP_GUIDE.md](PUPPETEER_SETUP_GUIDE.md)** untuk setup Chrome/Chromium (Web Scraping, Audit, Browser Control).

---

## 📁 Project Structure

```
android-expert-mcp/
├── src/
│   ├── index.ts              # Bootstrap — 97 tools, 12 categories
│   ├── utils.ts              # Mutex, Semaphore, AdbMutex, maskSecrets,
│   │                         # isSafePath, cleanupTempDirectories, atomicJSON
│   └── tools/
│       ├── architecture.ts   # Cat 1 — File & docs (path protection)
│       ├── android.ts        # Cat 2 — Gradle, ADB (global ADB mutex)
│       ├── scraping.ts       # Cat 3 — Puppeteer (semaphore guarded)
│       ├── audit.ts          # Cat 4 — Lighthouse (semaphore guarded)
│       ├── browser.ts        # Cat 5 — Session browser (max 5 sessions)
│       ├── interactive.ts    # Cat 6 — UI widgets (TTL 60 min)
│       ├── idx_firebase.ts   # Cat 7 — IDX emulator + FTL (ADB mutex)
│       ├── error_memory.ts   # Cat 8 — Error bank (atomic writes)
│       ├── scaffolding.ts    # Cat 9 — Project templates
│       ├── vps_deploy.ts     # Cat 10 — VPS SSH (base64, secret mask)
│       ├── wireless_adb.ts   # Cat 11 — 🆕 Wireless ADB debugging
│       └── github.ts         # Cat 12 — 🆕 GitHub REST API integration
├── CHANGELOG.md
├── SETUP.md
├── TOOLS_REFERENCE.md
├── IDX_FIREBASE_GUIDE.md
├── PUPPETEER_SETUP_GUIDE.md  # 🆕 Setup Chrome/Chromium
└── README.md
```

---

## 📄 License

MIT — see [LICENSE](LICENSE). Made with ❤️ by [@dhasap](https://github.com/dhasap).
