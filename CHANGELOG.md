# Changelog

## [2.0.0] — Browser Control & Interactive UI

### 🆕 Ditambahkan: Category 5 — Interactive Browser Control (14 tools)

Tools baru yang memungkinkan AI **benar-benar membuka dan mengontrol browser**
dalam sesi persisten, bukan hanya scraping satu kali.

| Tool | Fungsi |
|------|--------|
| `browser_open` | Buka browser + navigasi URL, buat session persisten |
| `browser_screenshot` | Ambil screenshot kondisi browser saat ini |
| `browser_click` | Klik elemen via CSS selector |
| `browser_type` | Ketik teks ke input field (simulasi manusia) |
| `browser_navigate` | goto / back / forward / reload / new_tab |
| `browser_scroll` | Scroll up/down/top/bottom/to_element |
| `browser_get_content` | Ambil HTML/teks/links/inputs dari halaman aktif |
| `browser_wait` | Tunggu selector/network_idle/waktu tertentu |
| `browser_select` | Pilih dropdown, toggle checkbox/radio |
| `browser_execute_script` | Jalankan JS arbitrary di halaman |
| `browser_close` | Tutup session dan bebaskan memori |
| `browser_list_sessions` | Lihat semua sesi browser aktif |
| `browser_hover` | Hover untuk trigger tooltip/dropdown |
| `browser_keyboard` | Tekan key khusus: Enter, Tab, Ctrl+A, dll |

**Fitur utama session-based browser:**
- Session persisten — buka sekali, gunakan berkali-kali
- Multi-tab support
- Auto-cleanup session setelah 30 menit idle
- Stealth mode (anti-bot detection)
- Screenshot otomatis setelah setiap aksi untuk verifikasi

---

### 🆕 Ditambahkan: Category 6 — Interactive UI Widgets (9 tools)

Tools untuk AI mempresentasikan pilihan dan mengumpulkan input secara visual.

| Tool | Fungsi |
|------|--------|
| `ui_single_choice` | Widget pilihan tunggal (radio button style) |
| `ui_multi_choice` | Widget pilihan berganda (checkbox style) |
| `ui_confirm` | Dialog konfirmasi sebelum aksi berbahaya |
| `ui_menu` | Menu navigasi berjenjang |
| `ui_progress` | Progress tracker untuk task multi-step |
| `ui_info_card` | Kartu informasi key-value terstruktur |
| `ui_input_form` | Form multi-field terstruktur |
| `ui_table` | Tabel ASCII dari data dinamis |
| `ui_notification` | Notifikasi success/error/warning/info/tip |

---

### 🔧 Diperbaiki (v1 → v2)

- `index.ts`: Tambah `unhandledRejection` handler agar server tidak crash dari error async
- `index.ts`: Log jumlah tools saat startup untuk verifikasi
- Semua tools: Konsistensi format error message dengan `formatToolError()`
- Browser tools: Auto-cleanup Chromium instance di finally block mencegah memory leak

---

## [1.0.0] — Initial Release

- Architecture & Planning Tools (6 tools)
- Android/Kotlin/Gradle/ADB Tools (8 tools)
- Web Scraping & DOM Extraction Tools (4 tools)
- Website Review & Audit Tools (5 tools)
