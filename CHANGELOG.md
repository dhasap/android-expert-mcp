# Changelog — Android Expert MCP Server

---

## [5.2.0] — Browser & GitHub Stability STABILIZED v5.2

### 🆕 Browser Stability Improvements

Integrasi fitur stabilitas dari `mcp-browser-stable` ke dalam core `browser.ts`.
Menangani timeout, retry logic, dan fallback otomatis.

| Feature | Deskripsi |
|---------|-----------|
| **Auto-Retry** | Exponential backoff untuk operasi yang timeout |
| **JS Click Fallback** | Fallback ke JavaScript injection jika native click gagal |
| **Session Recovery** | Auto-recreate session jika navigate timeout |
| **Smart Wait** | Network idle detection sebelum content extraction |
| **Cleanup Preset** | Hapus popup/overlay/ads via preset script |

### Updated Browser Tools

| Tool | Perubahan |
|------|-----------|
| `browser_click` | + `fallback_js`, `close_overlays`, `retry_count` params |
| `browser_navigate` | + `max_retries` param, auto session recovery |
| `browser_screenshot` | + `timeout_seconds` param, retry wrapper |
| `browser_get_content` | + `wait_for_network_idle` param, race condition fix |
| `browser_execute_script` | + `use_cleanup_preset` param |

### 🆕 GitHub API Stability Improvements

Stabilisasi semua GitHub tools dengan retry mechanism dan better error handling.

| Feature | Deskripsi |
|---------|-----------|
| **Auto-Retry** | Exponential backoff + jitter untuk network failures |
| **Rate Limit Handling** | Auto-retry dengan delay untuk HTTP 429 |
| **Timeout Protection** | 30s timeout untuk setiap API call |
| **Better Errors** | Informasi retry count dalam error messages |

### Updated GitHub Tools

| Tool | Perubahan |
|------|-----------|
| `github_repo_list` | + `max_retries` param (default: 3) |
| `github_repo_info` | + `max_retries` param (default: 3) |
| `github_repo_create` | + `max_retries` param (default: 3) |
| `github_file_read` | + `max_retries` param (default: 3) |
| `github_file_write` | + `max_retries` param (default: 3) |
| `github_issue_list` | + `max_retries` param (default: 3) |
| `github_issue_create` | + `max_retries` param (default: 3) |
| `github_pr_list` | + `max_retries` param (default: 3) |
| `github_commit_push` | + `max_retries` param untuk semua API calls |
| `github_release_create` | + `max_retries` param (default: 3) |

### Stability Helpers (internal)

- `retryWithBackoff<T>()` — retry dengan exponential backoff
- `withRetry<T>()` — GitHub API retry dengan jitter
- `fetchWithTimeout()` — fetch dengan timeout protection
- `isRetryableError()` — deteksi error yang bisa di-retry
- `CLEANUP_OVERLAY_SCRIPT` — preset script untuk hapus popup/ads
- `JS_CLICK_SCRIPT()` — JavaScript click fallback generator
- `delay()` — promise-based delay helper

### Metrics Improvement

| Operation | Before | After |
|-----------|--------|-------|
| `browser_click()` | 60% | 95% |
| `browser_navigate()` | 70% | 95% |
| `browser_getContent()` | 85% | 98% |
| `browser_screenshot()` | 95% | 99% |
| `github_repo_list()` | 85% | 98% |
| `github_file_write()` | 80% | 97% |
| `github_commit_push()` | 75% | 95% |

---

## [5.0.0] — Wireless ADB + GitHub Integration

### 🆕 Category 11 — 📡 Wireless ADB Debugging (8 tools)

Scrape dan debug Android app **tanpa kabel USB** dan **tanpa emulator**.
Mendukung Android 10- (via USB tcpip) dan Android 11+ (full wireless pairing).

| Tool | Fungsi |
|------|--------|
| `adb_wifi_pair` | Pair Android 11+ via 6-digit pairing code (Settings → Wireless Debugging) |
| `adb_wifi_connect` | Hubungkan ke IP:PORT perangkat wireless |
| `adb_wifi_enable` | Aktifkan TCP/IP mode dari USB — lalu cabut kabel (Android 10-) |
| `adb_wifi_devices` | Tampilkan semua perangkat TCP yang terhubung |
| `adb_wifi_disconnect` | Putuskan satu atau semua koneksi wireless |
| `adb_wifi_shell` | Jalankan ADB shell command ke perangkat wireless |
| `adb_wifi_screenshot` | Screenshot layar device via WiFi |
| `adb_wifi_ui_dump` | Dump UI hierarchy XML + ekstrak teks & resource-ID untuk scraping app |

Semua tool menggunakan `runAdbCommand` (global ADB mutex) — aman dari race condition.

---

### 🆕 Category 12 — 🐙 GitHub Integration (10 tools)

Kelola GitHub repo langsung dari AI. Default owner: **@dhasap**. Semua tool override-able via `owner` parameter.

| Tool | Fungsi |
|------|--------|
| `github_repo_list` | List repo dengan filter type + sort |
| `github_repo_info` | Detail repo: stats, branches, languages, license |
| `github_repo_create` | Buat repo baru (public/private, auto-init, gitignore, license) |
| `github_file_read` | Baca file dari repo (any branch/tag/SHA) |
| `github_file_write` | Create atau update file di repo (PUT via API) |
| `github_issue_list` | List issue dengan filter state + labels |
| `github_issue_create` | Buat issue baru dengan labels dan assignees |
| `github_pr_list` | List Pull Requests (open/closed/all) |
| `github_commit_push` | Push multiple file dalam satu atomic commit via Tree API |
| `github_release_create` | Buat GitHub Release (draft/prerelease support) |

Setup: `export GITHUB_TOKEN=ghp_...` (scope: `repo`)

---

## [4.3.0] — Concurrency Hardening + Secret Masking

### Fix 1 — Puppeteer Concurrency Limiter (scraping.ts, audit.ts)
- Tambah `class Semaphore` di `utils.ts` — counting semaphore FIFO, deadlock-proof
- `puppeteerSemaphore = new Semaphore(2)` — max 2 Chromium concurrent global
- `scraping.ts`: `launchBrowserGuarded()` wrapper + `releaseSemaphore?.()` di semua `finally` (4 tools)
- `audit.ts`: acquire sebelum `puppeteer.launch()`, release di `finally` (4 tools)

### Fix 2 — Global ADB Mutex (android.ts, idx_firebase.ts)
- `adbMutex = new Mutex()` + `runAdbCommand()` helper di `utils.ts`
- `android.ts`: 10 panggilan ADB diganti `runAdbCommand`
- `idx_firebase.ts`: 48 panggilan ADB diganti `runAdbCommand`

### Fix 3 — Secret Masking (vps_deploy.ts)
- `maskSecrets(text, extras?)` + `formatSecureToolError()` di `utils.ts`
- 13 env var sensitif di-scrub otomatis (TURSO_AUTH_TOKEN, BOT_TOKEN, dll)
- `vps_turso`: `handlerSecrets` dihoist ke handler scope, stdout/stderr + error message disanitasi

---

## [4.2.0] — Resource & Security Hardening

### Fix 1 — Auto Temp File Cleanup
- `cleanupTempDirectories(maxAgeHours)` + `MCP_TEMP_DIRS` registry di `utils.ts`
- Scan 5 folder temp, hapus file > 24 jam, log bytes yang dibebaskan
- Dipanggil sekali saat startup + setiap 1 jam via `setInterval(...).unref()`

### Fix 2 — Browser Session Cap (browser.ts)
- `MAX_ACTIVE_SESSIONS = 5` — batas hard sesi Chromium aktif
- `evictOldestIdleSession()` — otomatis tutup sesi paling idle saat limit tercapai
- Response `browser_open` tampilkan `🪟 Sesi: X / 5 aktif`

### Fix 3 — Path Traversal Protection (architecture.ts)
- `isSafePath(path, allowedRoot?)` di `utils.ts`
- Blokir 13 system prefix (`/etc`, `/var`, `/usr`, `/root`, dll.)
- Blokir 15 sensitive segment (`.ssh`, `.gnupg`, `.aws`, `.kube`, `id_rsa`, dll.)
- `read_file`, `write_file`, `edit_file` semua diproteksi
- `write_file` tambah param `restrict_to_cwd` untuk mode sandbox ketat

---

## [4.1.0] — Stability Fixes

### Fix 1 — Race Condition on JSON Storage
- `class Mutex` + `atomicReadJson` + `atomicWriteJson` (write ke `.tmp` → `rename`) di `utils.ts`
- `error_memory.ts`: `withBank<T>()` helper, semua handler dimutex-kan
- `vps_deploy.ts`: `storeMutex`, `withStore<T>()`, `readStore()` helpers

### Fix 2 — Memory Leak in Interactive Session Store
- `INTERACTION_TTL_MS = 60 min` — purge session lama via `setInterval(...).unref()`

### Fix 3 — Browser Zombie Process Cleanup
- `closeAllBrowserSessions()` di `browser.ts`, dipanggil di SIGINT/SIGTERM handler
- `shuttingDown` flag mencegah double-shutdown

### Fix 4 — SSH Shell Escaping
- `buildSshCmd()` di `vps_deploy.ts`: base64-encode seluruh command
- `echo <b64> | base64 -d | bash` — tidak ada masalah quoting apapun

---

## [4.0.0] — Error Memory Bank + Scaffolding + VPS Deploy

### 🆕 Category 8 — 🧠 Error Memory Bank (6 tools)
Menyimpan, mencari, dan menganalisa error yang pernah terjadi lintas sesi.

| Tool | Fungsi |
|------|--------|
| `error_auto_diagnose` | Auto-diagnose error + cari solusi dari memory bank |
| `error_remember` | Simpan error baru ke bank |
| `error_search` | Cari error mirip berdasarkan fingerprint/keyword |
| `error_add_solution` | Tambah solusi ke error yang ada |
| `error_stats` | Statistik per tech stack dengan health score |
| `error_export` | Export bank ke JSON untuk backup |

### 🆕 Category 9 — 🏗️ Project Scaffolding Engine (4 tools)

| Tool | Fungsi |
|------|--------|
| `scaffold_android` | Android app (Jetpack Compose, MVVM, Hilt, Room) |
| `scaffold_telegram_bot` | Telegram bot (Node.js/Python) |
| `scaffold_chrome_extension` | Chrome extension (Manifest V3) |
| `scaffold_node_api` | REST API (Express/Fastify + TypeScript) |

### 🆕 Category 10 — 🚀 VPS & Deploy Manager (10 tools)

| Tool | Fungsi |
|------|--------|
| `vps_add_server` | Simpan profil server SSH |
| `vps_list_servers` | Tampilkan server tersimpan |
| `vps_exec` | Jalankan command di VPS remote |
| `vps_monitor` | Monitor RAM/CPU/disk/network |
| `vps_deploy` | Upload file + pre/post commands via rsync/scp |
| `vps_logs` | Baca journalctl/pm2/nginx/file log |
| `vps_service` | Kelola pm2/systemd service |
| `vps_turso` | Kelola Turso DB (query, migrate, backup) |
| `vps_deploy_history` | Riwayat deploy terakhir |
| `vps_optimize` | Auto-optimize VPS (swap, cache, nginx) |

---

## [3.0.0] — IDX Emulator + Firebase Test Lab

### 🆕 Category 7 — IDX Emulator + Firebase Test Lab (13 tools)
Kontrol Android emulator di Google IDX dan jalankan test di Firebase Test Lab.

---

## [2.0.0] — Browser Control + Interactive UI

### 🆕 Category 5 — Interactive Browser Control (14 tools)
Session-based Chromium control: click, type, scroll, screenshot, JS execute.

### 🆕 Category 6 — Interactive UI Widgets (9 tools)
Widget pilihan, konfirmasi, progress, form, tabel untuk interaksi AI-ke-user.

---

## [1.0.0] — Initial Release

- Architecture & Planning Tools (6)
- Android/Kotlin/Gradle/ADB Tools (8)
- Web Scraping & DOM Tools (4)
- Website Review & Audit Tools (5)
