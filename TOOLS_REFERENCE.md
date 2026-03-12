# 🔧 Tools Reference — Android Expert MCP Server

Dokumentasi lengkap semua tools yang tersedia, parameter input, dan contoh penggunaan.

---

## 📂 Kategori 1: Architecture & Planning Tools

### `read_project_structure`
Membaca dan menampilkan struktur direktori proyek dalam bentuk tree.

**Input:**
| Parameter | Tipe | Default | Deskripsi |
|-----------|------|---------|-----------|
| `project_path` | string | *required* | Path absolut/relatif ke root proyek |
| `max_depth` | number | `5` | Kedalaman maksimum traversal (1–10) |

**Contoh penggunaan:**
```
"Tolong baca struktur proyek saya di /home/user/MyAndroidApp"
```

**Output:** Tree direktori dengan ikon 📁/📄, otomatis mengabaikan `node_modules`, `.git`, `.gradle`, `build`.

---

### `read_file`
Membaca konten file apapun dengan perlindungan ukuran.

**Input:**
| Parameter | Tipe | Default | Deskripsi |
|-----------|------|---------|-----------|
| `file_path` | string | *required* | Path ke file |
| `max_size_kb` | number | `1024` | Batas ukuran dalam KB (1–10240) |

---

### `write_file`
Membuat file baru atau overwrite file yang ada.

**Input:**
| Parameter | Tipe | Default | Deskripsi |
|-----------|------|---------|-----------|
| `file_path` | string | *required* | Path output file |
| `content` | string | *required* | Konten yang akan ditulis |
| `create_dirs` | boolean | `true` | Auto-buat parent directory |

---

### `edit_file`
Edit file secara surgical dengan find-and-replace.

**Input:**
| Parameter | Tipe | Default | Deskripsi |
|-----------|------|---------|-----------|
| `file_path` | string | *required* | Path file yang akan diedit |
| `search_text` | string | *required* | Teks yang akan diganti (exact match) |
| `replace_text` | string | *required* | Teks pengganti |
| `replace_all` | boolean | `false` | Ganti semua kemunculan |

---

### `create_architecture_doc`
Generate dokumentasi arsitektur Markdown terstruktur.

**Input:**
| Parameter | Tipe | Deskripsi |
|-----------|------|-----------|
| `output_path` | string | Path file .md output |
| `project_name` | string | Nama proyek |
| `overview` | string | Deskripsi high-level |
| `tech_stack` | string[] | Daftar teknologi |
| `modules` | object[] | Modul dengan nama, deskripsi, tanggung jawab |
| `data_flow` | string | Deskripsi alur data |
| `additional_notes` | string? | Catatan tambahan (opsional) |

---

### `list_files`
Daftar file dalam direktori dengan filter ekstensi.

**Input:**
| Parameter | Tipe | Default | Deskripsi |
|-----------|------|---------|-----------|
| `dir_path` | string | *required* | Path direktori |
| `extension` | string? | - | Filter ekstensi, misal `.kt`, `.xml` |
| `recursive` | boolean | `false` | List rekursif |

---

## 📱 Kategori 2: Android/Kotlin/ADB Tools

### `run_gradle_task`
Eksekusi Gradle task dengan ekstraksi otomatis stack trace saat gagal.

**Input:**
| Parameter | Tipe | Default | Deskripsi |
|-----------|------|---------|-----------|
| `project_path` | string | *required* | Root proyek Android (tempat gradlew) |
| `task` | string | *required* | Task Gradle, misal `assembleDebug`, `test` |
| `extra_args` | string? | - | Flag tambahan, misal `--stacktrace --info` |
| `timeout_seconds` | number | `300` | Timeout (30–1800 detik) |

**Contoh tasks:**
```
assembleDebug          # Build APK debug
assembleRelease        # Build APK release
test                   # Semua unit test
testDebugUnitTest      # Unit test untuk variant debug
lint                   # Lint check
clean                  # Bersihkan build artifacts
:app:dependencies      # Tampilkan dependency tree
```

---

### `read_build_log`
Parse file log build dan ekstrak error/stack trace.

**Input:**
| Parameter | Tipe | Default | Deskripsi |
|-----------|------|---------|-----------|
| `log_path` | string | *required* | Path ke file log |
| `extract_only_errors` | boolean | `true` | Hanya tampilkan error (bukan full log) |

---

### `adb_list_devices`
List semua device/emulator Android yang terkoneksi.

**Input:** Tidak ada parameter.

---

### `adb_dump_ui`
Dump hierarki UI dari device Android menggunakan `uiautomator`.

**Input:**
| Parameter | Tipe | Default | Deskripsi |
|-----------|------|---------|-----------|
| `device_serial` | string? | - | Serial device ADB (kosongkan jika hanya 1 device) |
| `include_invisible` | boolean | `false` | Sertakan elemen tidak terlihat |

**Output:** XML hierarki UI dengan semua elemen, bounds, resource ID, text, class name.

---

### `adb_read_logcat`
Capture output logcat dengan filter.

**Input:**
| Parameter | Tipe | Default | Deskripsi |
|-----------|------|---------|-----------|
| `device_serial` | string? | - | Serial device |
| `duration_seconds` | number | `5` | Durasi capture (1–60 detik) |
| `filter_tag` | string? | - | Filter by tag, misal `MainActivity` |
| `package_name` | string? | - | Filter by package, misal `com.example.app` |
| `level` | enum | `W` | Level minimum: V/D/I/W/E/F |
| `clear_before_capture` | boolean | `true` | Bersihkan buffer sebelum capture |

---

### `adb_extract_apk`
Ekstrak APK dari device yang terkoneksi.

**Input:**
| Parameter | Tipe | Default | Deskripsi |
|-----------|------|---------|-----------|
| `package_name` | string | *required* | Package name, misal `com.example.app` |
| `output_dir` | string | `./apk_extracts` | Direktori output lokal |
| `device_serial` | string? | - | Serial device |

---

### `adb_run_shell`
Jalankan perintah shell arbitrary di device Android.

**Input:**
| Parameter | Tipe | Default | Deskripsi |
|-----------|------|---------|-----------|
| `command` | string | *required* | Shell command, misal `dumpsys battery` |
| `device_serial` | string? | - | Serial device |
| `timeout_seconds` | number | `15` | Timeout (1–60 detik) |

**Contoh commands:**
```bash
ls /sdcard/                           # List file di storage
dumpsys battery                       # Info baterai
dumpsys activity                      # Info activity
am start -n com.pkg/.MainActivity     # Launch activity
pm list packages                      # List installed packages
settings get secure android_id        # Get Android ID
```

---

### `analyze_kotlin_file`
Analisis struktural file Kotlin: classes, functions, coroutines, code smells.

**Input:**
| Parameter | Tipe | Deskripsi |
|-----------|------|-----------|
| `file_path` | string | Path ke file .kt |

**Output:** Package name, classes, functions (max 30), coroutine usages, code smell detection.

---

## 🕷️ Kategori 3: Web Scraping & DOM Tools

### `scrape_page_html`
Ambil HTML halaman setelah JavaScript dieksekusi (fully rendered).

**Input:**
| Parameter | Tipe | Default | Deskripsi |
|-----------|------|---------|-----------|
| `url` | string | *required* | URL target (https://) |
| `wait_for` | enum | `networkidle2` | Kondisi wait: load/domcontentloaded/networkidle0/networkidle2 |
| `wait_selector` | string? | - | Tunggu CSS selector muncul |
| `stealth_mode` | boolean | `true` | Aktifkan anti-bot bypass |
| `timeout_seconds` | number | `30` | Timeout (5–120 detik) |
| `scroll_to_bottom` | boolean | `false` | Scroll untuk trigger lazy-load content |

---

### `extract_dom_structure`
Ekstrak ringkasan terstruktur DOM: headings, links, images, forms, meta.

**Input:**
| Parameter | Tipe | Default | Deskripsi |
|-----------|------|---------|-----------|
| `url` | string | *required* | URL target |
| `include_links` | boolean | `true` | Sertakan semua hyperlink |
| `include_images` | boolean | `true` | Sertakan data gambar |
| `include_forms` | boolean | `true` | Sertakan struktur form |
| `include_meta` | boolean | `true` | Sertakan meta tags & OG data |
| `include_text` | boolean | `true` | Sertakan teks utama (tanpa HTML) |
| `stealth_mode` | boolean | `true` | Anti-bot mode |
| `timeout_seconds` | number | `30` | Timeout |

---

### `execute_js_on_page`
Eksekusi JavaScript kustom di halaman dan kembalikan hasilnya.

**Input:**
| Parameter | Tipe | Default | Deskripsi |
|-----------|------|---------|-----------|
| `url` | string | *required* | URL target |
| `js_code` | string | *required* | Kode JS yang dieksekusi |
| `wait_for_selector` | string? | - | Tunggu selector sebelum eksekusi |
| `stealth_mode` | boolean | `true` | Anti-bot mode |
| `timeout_seconds` | number | `30` | Timeout |

**Contoh js_code:**
```javascript
// Hitung produk
return document.querySelectorAll('.product-item').length

// Ekstrak semua harga
return Array.from(document.querySelectorAll('.price')).map(el => el.textContent.trim())

// Ambil data dari window object
return window.__NEXT_DATA__
```

---

### `monitor_network_requests`
Monitor semua network request saat halaman dimuat (untuk reverse-engineering API).

**Input:**
| Parameter | Tipe | Default | Deskripsi |
|-----------|------|---------|-----------|
| `url` | string | *required* | URL target |
| `filter_type` | enum | `xhr` | Filter: all/xhr/fetch/document/script/stylesheet/image |
| `timeout_seconds` | number | `15` | Timeout |
| `stealth_mode` | boolean | `true` | Anti-bot mode |

---

## 🔍 Kategori 4: Website Review & Audit Tools

### `take_screenshot`
Ambil screenshot full-page website.

**Input:**
| Parameter | Tipe | Default | Deskripsi |
|-----------|------|---------|-----------|
| `url` | string | *required* | URL target |
| `output_path` | string? | `/tmp/mcp-screenshots/` | Path output PNG |
| `full_page` | boolean | `true` | Screenshot seluruh halaman |
| `device` | enum | `desktop` | Viewport: desktop/mobile/tablet |
| `wait_seconds` | number | `2` | Tunggu X detik setelah load |
| `timeout_seconds` | number | `30` | Timeout |

**Viewport sizes:**
- `desktop`: 1920×1080
- `mobile`: 390×844 (iPhone 14 Pro)
- `tablet`: 768×1024

---

### `run_lighthouse_audit`
Jalankan audit Lighthouse lengkap (Performance, Accessibility, SEO, Best Practices).

**Input:**
| Parameter | Tipe | Default | Deskripsi |
|-----------|------|---------|-----------|
| `url` | string | *required* | URL target |
| `categories` | string[] | semua | Kategori audit |
| `device` | enum | `mobile` | mobile/desktop |
| `output_dir` | string? | `/tmp/mcp-audits/` | Direktori simpan JSON report |
| `timeout_seconds` | number | `120` | Timeout (30–300 detik) |

**Output:** Skor per kategori, Core Web Vitals (LCP, CLS, TBT, FCP), issues kritis, opportunities, rekomendasi.

---

### `parse_audit_report`
Parse file JSON Lighthouse yang sudah tersimpan menjadi ringkasan.

**Input:**
| Parameter | Tipe | Default | Deskripsi |
|-----------|------|---------|-----------|
| `report_path` | string | *required* | Path ke file JSON Lighthouse |
| `focus` | enum | `all` | Focus: all/performance/accessibility/seo/best-practices/opportunities |

---

### `check_mobile_responsiveness`
Cek responsivitas di multiple viewport sizes.

**Input:**
| Parameter | Tipe | Default | Deskripsi |
|-----------|------|---------|-----------|
| `url` | string | *required* | URL target |
| `viewports` | object[] | 5 preset | Custom viewport list |
| `timeout_seconds` | number | `30` | Timeout |

**Deteksi otomatis:**
- Horizontal overflow/scroll
- Missing meta viewport
- Teks terlalu kecil (< 12px)
- Touch targets terlalu kecil (< 44×44px)

---

### `extract_seo_data`
Analisis SEO mendalam suatu halaman web.

**Input:**
| Parameter | Tipe | Default | Deskripsi |
|-----------|------|---------|-----------|
| `url` | string | *required* | URL target |
| `timeout_seconds` | number | `30` | Timeout |

**Analisis meliputi:**
- Title & meta description (panjang optimal)
- Canonical URL, robots meta
- Open Graph & Twitter Card tags
- Struktur heading (H1–H3)
- Images alt text
- Internal vs external links
- JSON-LD structured data
- Word count
- Lang attribute

---

## 🔗 Integrasi dengan AI Agent

Semua tools ini tersedia secara otomatis setelah MCP server didaftarkan. AI Agent Anda dapat memanggil tools ini dengan instruksi natural language. Contoh:

```
"Audit website https://tokopedia.com dan berikan rekomendasi perbaikan performance"
→ AI akan memanggil: run_lighthouse_audit + parse_audit_report

"Debug kenapa build Gradle saya gagal di /home/user/MyApp"
→ AI akan memanggil: run_gradle_task, lalu menganalisis stack trace

"Scrape semua harga produk dari https://shop.example.com/products"
→ AI akan memanggil: scrape_page_html + execute_js_on_page

"Cek apakah website klien saya mobile-friendly"
→ AI akan memanggil: check_mobile_responsiveness + take_screenshot (mobile)
```
