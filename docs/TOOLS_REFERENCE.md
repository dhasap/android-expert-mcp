# 🔧 Tools Reference — Android Expert MCP Server v5.0

Dokumentasi lengkap 97 tools di 12 kategori.

---

## 📂 Kategori 1: Architecture & Planning Tools (6 tools)

### `read_project_structure`
Membaca struktur direktori dalam bentuk tree. Auto-skip `node_modules`, `.git`, `.gradle`, `build`.

| Parameter | Tipe | Default | Deskripsi |
|-----------|------|---------|-----------|
| `project_path` | string | *required* | Path ke root proyek |
| `max_depth` | number | `5` | Kedalaman maksimum (1–10) |

---

### `read_file`
Membaca konten file dengan proteksi path traversal dan batas ukuran.

| Parameter | Tipe | Default | Deskripsi |
|-----------|------|---------|-----------|
| `file_path` | string | *required* | Path ke file |
| `max_size_kb` | number | `1024` | Batas ukuran KB (1–10240) |

> 🔒 Diproteksi `isSafePath()` — blokir `/etc`, `~/.ssh`, `.aws`, dll.

---

### `write_file`
Membuat atau overwrite file. Bisa dibatasi ke CWD saja.

| Parameter | Tipe | Default | Deskripsi |
|-----------|------|---------|-----------|
| `file_path` | string | *required* | Path output |
| `content` | string | *required* | Konten file |
| `create_dirs` | boolean | `true` | Auto-buat parent directory |
| `restrict_to_cwd` | boolean | `false` | Larang write di luar CWD |

---

### `edit_file`
Edit file secara surgical dengan find-and-replace.

| Parameter | Tipe | Default | Deskripsi |
|-----------|------|---------|-----------|
| `file_path` | string | *required* | Path file |
| `search_text` | string | *required* | Teks yang dicari |
| `replace_text` | string | *required* | Teks pengganti |
| `replace_all` | boolean | `false` | Ganti semua kemunculan |

---

### `create_architecture_doc`
Generate dokumentasi arsitektur Markdown terstruktur.

| Parameter | Tipe | Deskripsi |
|-----------|------|-----------|
| `output_path` | string | Path file .md output |
| `project_name` | string | Nama proyek |
| `overview` | string | Deskripsi high-level |
| `tech_stack` | string[] | Teknologi yang dipakai |
| `modules` | object[] | Modul: `{name, description, responsibilities}` |
| `data_flow` | string | Deskripsi alur data |
| `additional_notes` | string? | Catatan tambahan |

---

### `list_files`
Daftar file dalam direktori dengan filter ekstensi.

| Parameter | Tipe | Default | Deskripsi |
|-----------|------|---------|-----------|
| `directory` | string | *required* | Path direktori |
| `extensions` | string[] | `[]` | Filter ekstensi, misal `[".kt", ".xml"]` |
| `recursive` | boolean | `false` | Rekursif ke subdirektori |

---

## 📱 Kategori 2: Android/Kotlin/ADB Tools (8 tools)

Semua perintah ADB dijalankan via `runAdbCommand` — dilindungi global ADB mutex.

### `run_gradle_task`
Jalankan Gradle task dengan streaming output dan ekstraksi stack trace otomatis.

| Parameter | Tipe | Default | Deskripsi |
|-----------|------|---------|-----------|
| `project_path` | string | *required* | Root proyek Android |
| `task` | string | *required* | Task Gradle. Contoh: `assembleDebug`, `test` |
| `extra_args` | string[] | `[]` | Argumen tambahan. Contoh: `["--stacktrace"]` |

---

### `read_build_log`
Parse log build Gradle dan ringkas error/warning penting.

| Parameter | Tipe | Deskripsi |
|-----------|------|-----------|
| `log_path` | string | Path file log build |

---

### `adb_list_devices`
Tampilkan semua perangkat ADB yang terhubung (USB + wireless).

_(Tidak ada parameter)_

---

### `adb_dump_ui`
Dump UI hierarchy dari layar aktif ke file XML lokal.

| Parameter | Tipe | Default | Deskripsi |
|-----------|------|---------|-----------|
| `output_path` | string | `/tmp/ui_dump.xml` | Path output XML |
| `device_serial` | string? | — | Serial device jika lebih dari satu |

---

### `adb_read_logcat`
Baca log ADB dengan filter opsional.

| Parameter | Tipe | Default | Deskripsi |
|-----------|------|---------|-----------|
| `filter` | string | `"*:W"` | Filter logcat. Contoh: `"MyTag:D *:S"` |
| `lines` | number | `100` | Jumlah baris terakhir |
| `device_serial` | string? | — | Serial device |

---

### `adb_extract_apk`
Ekstrak APK dari perangkat ke sistem lokal.

| Parameter | Tipe | Deskripsi |
|-----------|------|-----------|
| `package_name` | string | Package app. Contoh: `com.example.myapp` |
| `output_dir` | string | Direktori output |
| `device_serial` | string? | Serial device |

---

### `adb_run_shell`
Jalankan perintah ADB shell arbitrary.

| Parameter | Tipe | Default | Deskripsi |
|-----------|------|---------|-----------|
| `command` | string | *required* | Shell command |
| `device_serial` | string? | — | Serial device |
| `timeout_seconds` | number | `30` | Timeout (5–120) |

---

### `analyze_kotlin_file`
Analisis file Kotlin: ekstrak class, function, import, anti-pattern.

| Parameter | Tipe | Deskripsi |
|-----------|------|-----------|
| `file_path` | string | Path ke file .kt |

---

## 🕷️ Kategori 3: Web Scraping & DOM Tools (4 tools)

Semua tool menggunakan `puppeteerSemaphore` — max 2 Chromium concurrent.

### `scrape_page_html`
Scrape HTML penuh dari halaman web (termasuk konten dinamis JavaScript).

| Parameter | Tipe | Default | Deskripsi |
|-----------|------|---------|-----------|
| `url` | string | *required* | URL yang di-scrape |
| `wait_for_selector` | string? | — | Tunggu selector sebelum ambil HTML |
| `timeout_ms` | number | `30000` | Timeout muat halaman |

---

### `extract_dom_structure`
Ekstrak struktur DOM: tag, class, ID, teks — tanpa noise HTML mentah.

| Parameter | Tipe | Default | Deskripsi |
|-----------|------|---------|-----------|
| `url` | string | *required* | URL target |
| `selector` | string | `"body"` | Root selector untuk ekstraksi |
| `depth` | number | `3` | Kedalaman DOM (1–10) |

---

### `execute_js_on_page`
Eksekusi JavaScript di halaman dan return hasilnya.

| Parameter | Tipe | Default | Deskripsi |
|-----------|------|---------|-----------|
| `url` | string | *required* | URL target |
| `script` | string | *required* | JavaScript yang dieksekusi |
| `wait_for_load` | boolean | `true` | Tunggu halaman load sempurna |

---

### `monitor_network_requests`
Monitor semua request network yang dibuat halaman (XHR, fetch, resource).

| Parameter | Tipe | Default | Deskripsi |
|-----------|------|---------|-----------|
| `url` | string | *required* | URL target |
| `filter_type` | string | `"all"` | `xhr`, `fetch`, `document`, `all` |
| `timeout_ms` | number | `15000` | Waktu monitoring |

---

## 🔍 Kategori 4: Website Review & Audit Tools (5 tools)

Semua tool menggunakan `puppeteerSemaphore` — max 2 Chromium concurrent.

### `take_screenshot`
Ambil screenshot halaman web (desktop/mobile).

| Parameter | Tipe | Default | Deskripsi |
|-----------|------|---------|-----------|
| `url` | string | *required* | URL target |
| `output_path` | string? | `/tmp/mcp-screenshots/` | Path simpan PNG |
| `full_page` | boolean | `true` | Capture halaman penuh |
| `mobile` | boolean | `false` | Mode viewport mobile |
| `width` | number | `1280` | Lebar viewport px |

---

### `run_lighthouse_audit`
Audit lengkap Lighthouse: performance, accessibility, best practices, SEO.

| Parameter | Tipe | Default | Deskripsi |
|-----------|------|---------|-----------|
| `url` | string | *required* | URL target |
| `categories` | string[] | semua | `performance`, `accessibility`, `best-practices`, `seo` |
| `mobile` | boolean | `false` | Mode mobile |
| `output_path` | string? | `/tmp/mcp-audits/` | Simpan laporan JSON |

---

### `parse_audit_report`
Parse laporan Lighthouse JSON yang sudah ada menjadi ringkasan.

| Parameter | Tipe | Deskripsi |
|-----------|------|-----------|
| `report_path` | string | Path ke file JSON Lighthouse |

---

### `check_mobile_responsiveness`
Cek tampilan website di beberapa breakpoint mobile sekaligus.

| Parameter | Tipe | Default | Deskripsi |
|-----------|------|---------|-----------|
| `url` | string | *required* | URL target |
| `viewports` | object[]? | 4 preset | Array `{width, height, label}` |

---

### `extract_seo_data`
Ekstrak semua data SEO: meta tags, OpenGraph, structured data, heading hierarchy.

| Parameter | Tipe | Deskripsi |
|-----------|------|-----------|
| `url` | string | URL target |

---

## 🖥️ Kategori 5: Interactive Browser Control (14 tools)

Session persisten — buka sekali, gunakan berkali-kali. Max 5 sesi aktif (otomatis evict sesi idle terlama). Auto-cleanup 30 menit idle.

### `browser_open`
Buka browser dan navigasi ke URL. Buat session persisten.

| Parameter | Tipe | Default | Deskripsi |
|-----------|------|---------|-----------|
| `url` | string | *required* | URL awal |
| `session_id` | string? | auto-generate | ID sesi (reuse untuk sesi lama) |
| `headless` | boolean | `true` | Mode headless |
| `viewport_width` | number | `1280` | Lebar viewport |
| `viewport_height` | number | `800` | Tinggi viewport |

---

### `browser_screenshot` / `browser_click` / `browser_type` / `browser_navigate` / `browser_scroll` / `browser_get_content` / `browser_wait` / `browser_select` / `browser_execute_script` / `browser_close` / `browser_list_sessions` / `browser_hover` / `browser_keyboard`

Semua tool browser memerlukan `session_id` (kecuali `browser_list_sessions`). Dapatkan dari `browser_open`.

| Tool | Parameter Utama |
|------|-----------------|
| `browser_screenshot` | `session_id`, `full_page?`, `output_path?` |
| `browser_click` | `session_id`, `selector` |
| `browser_type` | `session_id`, `selector`, `text`, `clear_first?` |
| `browser_navigate` | `session_id`, `action` (goto/back/forward/reload/new_tab), `url?` |
| `browser_scroll` | `session_id`, `direction` (up/down/top/bottom/to_element), `selector?`, `amount?` |
| `browser_get_content` | `session_id`, `content_type` (html/text/links/inputs/all) |
| `browser_wait` | `session_id`, `wait_type` (selector/network_idle/timeout), `value?` |
| `browser_select` | `session_id`, `selector`, `value`, `action` (select/check/uncheck) |
| `browser_execute_script` | `session_id`, `script` |
| `browser_close` | `session_id` |
| `browser_hover` | `session_id`, `selector` |
| `browser_keyboard` | `session_id`, `key` (Enter/Tab/Escape/Ctrl+A/dll) |

---

## 🎨 Kategori 6: Interactive UI Widgets (9 tools)

TTL 60 menit per interaksi. Semua tool menghasilkan output teks terformat untuk ditampilkan ke user.

| Tool | Fungsi | Parameter Utama |
|------|--------|-----------------|
| `ui_single_choice` | Pilihan tunggal | `question`, `options[]` |
| `ui_multi_choice` | Pilihan berganda | `question`, `options[]`, `min_selections?` |
| `ui_confirm` | Konfirmasi ya/tidak | `question`, `warning?`, `context?` |
| `ui_menu` | Menu berjenjang | `title`, `items[]` (nested) |
| `ui_progress` | Progress tracker | `title`, `steps[]` ({name, status, detail?}) |
| `ui_info_card` | Kartu info | `title`, `fields[]` ({key, value, icon?}) |
| `ui_input_form` | Form multi-field | `title`, `fields[]` ({name, label, type, required?}) |
| `ui_table` | Tabel ASCII | `title`, `headers[]`, `rows[][]` |
| `ui_notification` | Notifikasi | `type` (success/error/warning/info/tip), `message`, `details?` |

---

## 🔥 Kategori 7: IDX Emulator + Firebase Test Lab (13 tools)

Semua perintah ADB menggunakan `runAdbCommand` (global ADB mutex).

| Tool | Fungsi |
|------|--------|
| `idx_check_environment` | Cek status IDX, ADB, emulator |
| `idx_start_emulator` | Start/restart emulator di IDX |
| `idx_connect_emulator` | Connect ADB ke emulator (ADB kill-server + restart otomatis) |
| `idx_install_apk` | Install APK ke emulator |
| `idx_launch_app` | Launch app di emulator |
| `idx_emulator_screenshot` | Screenshot emulator |
| `idx_emulator_ui_dump` | Dump UI hierarchy emulator |
| `idx_get_device_info` | Info hardware emulator (model, SDK, RAM, storage) |
| `idx_run_ui_test` | Jalankan UI test (Espresso/UIAutomator) |
| `ftl_run_robo_test` | Firebase Test Lab — Robo test (auto-explore) |
| `ftl_run_instrumented_test` | Firebase Test Lab — instrumented test |
| `ftl_get_results` | Ambil hasil test dari FTL |
| `ftl_list_devices` | List perangkat yang tersedia di FTL |

---

## 🧠 Kategori 8: Error Memory Bank (6 tools)

Persistent cross-session error learning. Semua operasi file menggunakan Mutex (atomic writes).

| Tool | Fungsi | Parameter Utama |
|------|--------|-----------------|
| `error_auto_diagnose` | Diagnosa error + cari solusi dari bank | `error_text`, `context?`, `tech_stack?` |
| `error_remember` | Simpan error baru | `error_text`, `solution`, `tech_stack`, `tags?` |
| `error_search` | Cari error mirip | `query`, `tech_stack?`, `limit?` |
| `error_add_solution` | Tambah solusi ke error | `error_id`, `solution`, `notes?` |
| `error_stats` | Statistik bank per tech stack | `tech_stack?` |
| `error_export` | Export bank ke JSON | `output_path?` |

---

## 🏗️ Kategori 9: Project Scaffolding Engine (4 tools)

| Tool | Template | Parameter Utama |
|------|----------|-----------------|
| `scaffold_android` | Android app (Compose, MVVM, Hilt, Room) | `project_path`, `package_name`, `app_name`, `min_sdk?`, `features?` |
| `scaffold_telegram_bot` | Telegram bot (Node.js atau Python) | `project_path`, `bot_name`, `language`, `features?` |
| `scaffold_chrome_extension` | Chrome Extension Manifest V3 | `project_path`, `extension_name`, `features?` |
| `scaffold_node_api` | REST API (Express/Fastify + TypeScript) | `project_path`, `api_name`, `framework?`, `features?` |

---

## 🚀 Kategori 10: VPS & Deploy Manager (10 tools)

SSH command menggunakan base64 encoding (tidak ada shell escaping issue). Secret di-mask otomatis di output error.

| Tool | Fungsi | Parameter Utama |
|------|--------|-----------------|
| `vps_add_server` | Tambah profil server | `name`, `host`, `user`, `port?`, `ssh_key_path?`, `password?` |
| `vps_list_servers` | Tampilkan server tersimpan | — |
| `vps_exec` | Jalankan command di VPS | `server`, `command`, `timeout?` |
| `vps_monitor` | Monitor CPU/RAM/disk/network | `server`, `metrics?` |
| `vps_deploy` | Deploy files via rsync/scp | `server`, `local_path`, `remote_path`, `pre_commands?`, `post_commands?` |
| `vps_logs` | Baca log journalctl/pm2/nginx | `server`, `service`, `lines?`, `since?` |
| `vps_service` | Kelola pm2/systemd service | `server`, `action` (start/stop/restart/status), `service_name` |
| `vps_turso` | Kelola Turso database | `action`, `sql?`, `database_url?`, `auth_token?` |
| `vps_deploy_history` | Riwayat deploy | `server?`, `limit?` |
| `vps_optimize` | Auto-optimize VPS | `server`, `optimizations?` |

---

## 📡 Kategori 11: Wireless ADB Debugging (8 tools)

Debug dan scrape Android app **tanpa kabel USB** — via WiFi. Semua tool menggunakan `runAdbCommand` (global ADB mutex).

### `adb_wifi_pair`
Pair perangkat Android 11+ dengan kode 6 digit. Hanya perlu dilakukan SEKALI per perangkat.

| Parameter | Tipe | Deskripsi |
|-----------|------|-----------|
| `pair_address` | string | `HOST:PORT` dari layar "Pair with pairing code". Contoh: `192.168.1.5:37891` |
| `pairing_code` | string | Kode 6 digit dari layar HP. Contoh: `482931` |

**Flow Android 11+:**
```
Settings → Developer Options → Wireless debugging → ON
→ "Pair device with pairing code"
→ Catat HOST:PORT dan 6-digit code
→ adb_wifi_pair(pair_address, pairing_code)
→ adb_wifi_connect(address dari halaman Wireless debugging)
```

---

### `adb_wifi_connect`
Hubungkan ke perangkat Android via wireless ADB.

| Parameter | Tipe | Deskripsi |
|-----------|------|-----------|
| `address` | string | `IP:PORT`. Contoh: `192.168.1.5:5555` atau `192.168.1.5:45123` |

---

### `adb_wifi_enable`
Aktifkan TCP/IP mode pada perangkat yang terhubung via USB (Android 10-).

| Parameter | Tipe | Default | Deskripsi |
|-----------|------|---------|-----------|
| `port` | number | `5555` | Port TCP yang dibuka di device |
| `device_serial` | string? | — | Serial USB device jika >1 perangkat |

**Flow Android 10-:**
```
Sambung USB → aktifkan USB Debugging
→ adb_wifi_enable(port=5555)
→ Catat IP device dari output
→ Cabut USB
→ adb_wifi_connect(address="192.168.1.X:5555")
```

---

### `adb_wifi_devices`
Tampilkan semua perangkat wireless (TCP) yang aktif.

_(Tidak ada parameter)_

---

### `adb_wifi_disconnect`
Putuskan koneksi wireless ADB.

| Parameter | Tipe | Deskripsi |
|-----------|------|-----------|
| `address` | string? | `IP:PORT`. Kosongkan untuk disconnect semua. |

---

### `adb_wifi_shell`
Jalankan ADB shell command ke perangkat wireless.

| Parameter | Tipe | Default | Deskripsi |
|-----------|------|---------|-----------|
| `address` | string | *required* | `IP:PORT` device |
| `command` | string | *required* | Shell command. Contoh: `pm list packages -3`, `dumpsys activity top` |
| `timeout_seconds` | number | `30` | Timeout (5–120) |

**Contoh command berguna:**
```bash
pm list packages -3              # List app non-sistem
am start -n com.app/.MainActivity  # Launch activity
dumpsys activity top             # Info activity foreground
input keyevent 4                 # Tekan tombol Back
settings get secure android_id   # Baca Android ID
```

---

### `adb_wifi_screenshot`
Ambil screenshot layar device via WiFi ADB.

| Parameter | Tipe | Default | Deskripsi |
|-----------|------|---------|-----------|
| `address` | string | *required* | `IP:PORT` device |
| `output_path` | string? | `/tmp/mcp-emulator/wifi_ss_*.png` | Path simpan PNG |
| `display_id` | number | `0` | ID display (0 = layar utama) |

---

### `adb_wifi_ui_dump`
**Tool utama untuk scraping app Android native.** Dump UI hierarchy XML, ekstrak semua teks dan resource-ID yang tampil di layar.

| Parameter | Tipe | Default | Deskripsi |
|-----------|------|---------|-----------|
| `address` | string | *required* | `IP:PORT` device |
| `output_path` | string? | `/tmp/mcp-emulator/wifi_ui_*.xml` | Path simpan XML |
| `include_raw_xml` | boolean | `false` | Sertakan raw XML dalam response |
| `filter_package` | string? | — | Filter elemen dari package tertentu. Contoh: `com.tokopedia.tkpd` |

**Output:** Summary jumlah node, daftar semua teks terdeteksi, daftar resource-ID unik.

**Contoh alur scraping app:**
```
1. Buka app di HP
2. adb_wifi_ui_dump → dapat semua teks & ID elemen di layar
3. adb_wifi_shell(command="input tap 540 960") → tap elemen
4. adb_wifi_screenshot → verifikasi state
5. adb_wifi_ui_dump lagi → scrape halaman berikutnya
```

---

## 🐙 Kategori 12: GitHub Integration (10 tools)

Gunakan GitHub REST API v3. Default owner: **@dhasap**. Setup: `export GITHUB_TOKEN=ghp_...`

### `github_repo_list`
Tampilkan daftar repository GitHub.

| Parameter | Tipe | Default | Deskripsi |
|-----------|------|---------|-----------|
| `owner` | string | `dhasap` | Username GitHub |
| `type` | enum | `owner` | `all`, `owner`, `member`, `public`, `private` |
| `sort` | enum | `updated` | `created`, `updated`, `pushed`, `full_name` |
| `per_page` | number | `30` | Jumlah hasil (max 100) |

---

### `github_repo_info`
Detail lengkap satu repository: statistik, branches, languages, topics, license.

| Parameter | Tipe | Default | Deskripsi |
|-----------|------|---------|-----------|
| `repo` | string | *required* | Nama repo. Contoh: `android-expert-mcp` |
| `owner` | string | `dhasap` | Owner repo |

---

### `github_repo_create`
Buat repository GitHub baru. Memerlukan GITHUB_TOKEN.

| Parameter | Tipe | Default | Deskripsi |
|-----------|------|---------|-----------|
| `name` | string | *required* | Nama repo baru |
| `description` | string | `""` | Deskripsi |
| `private` | boolean | `false` | Private repo |
| `auto_init` | boolean | `true` | Inisialisasi dengan README |
| `gitignore_template` | string? | — | `Android`, `Node`, `Python`, dll |
| `license_template` | string? | — | `mit`, `apache-2.0`, `gpl-3.0` |

---

### `github_file_read`
Baca konten file dari repository (mendukung semua branch/tag/SHA).

| Parameter | Tipe | Default | Deskripsi |
|-----------|------|---------|-----------|
| `repo` | string | *required* | Nama repo |
| `file_path` | string | *required* | Path file di repo. Contoh: `src/main/AndroidManifest.xml` |
| `ref` | string | `HEAD` | Branch, tag, atau commit SHA |
| `owner` | string | `dhasap` | Owner |

---

### `github_file_write`
Buat atau update satu file di repository. Untuk update, sertakan `sha`.

| Parameter | Tipe | Default | Deskripsi |
|-----------|------|---------|-----------|
| `repo` | string | *required* | Nama repo |
| `file_path` | string | *required* | Path target. Contoh: `docs/GUIDE.md` |
| `content` | string | *required* | Konten file |
| `commit_message` | string | *required* | Pesan commit |
| `sha` | string? | — | SHA file lama (wajib untuk UPDATE) — dari `github_file_read` |
| `branch` | string | `main` | Target branch |
| `owner` | string | `dhasap` | Owner |

---

### `github_issue_list`
Tampilkan daftar issue dengan filter.

| Parameter | Tipe | Default | Deskripsi |
|-----------|------|---------|-----------|
| `repo` | string | *required* | Nama repo |
| `state` | enum | `open` | `open`, `closed`, `all` |
| `labels` | string? | — | Filter label, pisah koma. Contoh: `bug,help wanted` |
| `per_page` | number | `20` | Jumlah hasil |
| `owner` | string | `dhasap` | Owner |

---

### `github_issue_create`
Buat issue baru. Memerlukan GITHUB_TOKEN.

| Parameter | Tipe | Default | Deskripsi |
|-----------|------|---------|-----------|
| `repo` | string | *required* | Nama repo |
| `title` | string | *required* | Judul issue |
| `body` | string | `""` | Deskripsi (Markdown) |
| `labels` | string[] | `[]` | Label. Contoh: `["bug", "priority: high"]` |
| `assignees` | string[] | `[]` | Username yang di-assign |
| `owner` | string | `dhasap` | Owner |

---

### `github_pr_list`
Tampilkan daftar Pull Request.

| Parameter | Tipe | Default | Deskripsi |
|-----------|------|---------|-----------|
| `repo` | string | *required* | Nama repo |
| `state` | enum | `open` | `open`, `closed`, `all` |
| `per_page` | number | `15` | Jumlah hasil |
| `owner` | string | `dhasap` | Owner |

---

### `github_commit_push`
Push beberapa file dalam satu atomic commit via GitHub Tree API. **Tidak perlu git lokal.**

| Parameter | Tipe | Default | Deskripsi |
|-----------|------|---------|-----------|
| `repo` | string | *required* | Nama repo |
| `files` | object[] | *required* | Array `[{path, content}, ...]` |
| `commit_message` | string | *required* | Pesan commit |
| `branch` | string | `main` | Target branch |
| `owner` | string | `dhasap` | Owner |

**Contoh:**
```json
{
  "repo": "my-android-app",
  "files": [
    {"path": "README.md", "content": "# My App"},
    {"path": "app/src/main/res/values/strings.xml", "content": "<resources>..."}
  ],
  "commit_message": "chore: update README and strings"
}
```

---

### `github_release_create`
Buat GitHub Release. Memerlukan GITHUB_TOKEN.

| Parameter | Tipe | Default | Deskripsi |
|-----------|------|---------|-----------|
| `repo` | string | *required* | Nama repo |
| `tag_name` | string | *required* | Tag. Contoh: `v1.2.0` |
| `name` | string | *required* | Nama release. Contoh: `Release v1.2.0` |
| `body` | string | `""` | Release notes (Markdown) |
| `draft` | boolean | `false` | Simpan sebagai draft |
| `prerelease` | boolean | `false` | Tandai sebagai pre-release |
| `target_commitish` | string | `main` | Branch/SHA target |
| `owner` | string | `dhasap` | Owner |

---

## 🔗 Integrasi dengan AI Agent

### Alur Scraping App Android via Wireless

```
"Scrape data produk dari app Tokopedia di HP saya via WiFi"
→ adb_wifi_devices()                                    ← cek device
→ adb_wifi_ui_dump(address, filter_package="com.tokopedia.tkpd")  ← dump layar
→ adb_wifi_shell(address, command="input swipe 540 1600 540 400")  ← scroll
→ adb_wifi_ui_dump lagi                                  ← scrape lebih banyak
```

### Alur GitHub: Scaffold → Commit → Release

```
"Buat proyek Android baru dan push ke GitHub"
→ scaffold_android(project_path="/tmp/MyApp", package_name="com.dhasap.myapp")
→ github_repo_create(name="my-android-app", gitignore_template="Android")
→ github_commit_push(repo="my-android-app", files=[...semua file scaffold])
→ github_release_create(repo="my-android-app", tag_name="v0.1.0", name="Initial Release")
```

### Alur Debug Error Cross-Session

```
"App crash dengan NPE, ingat untuk nanti"
→ error_auto_diagnose(error_text="NullPointerException at MainActivity.kt:42")
→ error_remember(error_text, solution="Gunakan ?.let {}", tech_stack="kotlin")
```
