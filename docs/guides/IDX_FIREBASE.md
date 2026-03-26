# 🔥 Panduan IDX Firebase Studio + Firebase Test Lab

> Panduan khusus untuk vibe coding di **Firebase IDX Studio** — solusi saat physical device tidak bisa dikoneksikan langsung.
> 
> **📝 Last Updated:** 2026-03-17 | **Changelog:** Update workflow emulator IDX (tidak perlu buat AVD manual)

---

## 🗺️ Gambaran Solusi

```
Firebase IDX Studio
┌─────────────────────────────────────────────────┐
│  VS Code Web + AI Agent (Kimi/Claude)           │
│                                                 │
│  ┌─────────────┐    MCP stdio    ┌───────────┐  │
│  │  AI Agent   │◄───────────────►│ MCP Server│  │
│  └─────────────┘                └─────┬─────┘  │
│                                       │         │
│           ┌───────────────────────────┤         │
│           │               │           │         │
│    ┌──────▼──────┐  ┌─────▼──────┐   │         │
│    │Android Emu  │  │Firebase    │   │         │
│    │(TCP:5555)   │  │Test Lab    │   │         │
│    └─────────────┘  └────────────┘   │         │
└─────────────────────────────────────────────────┘
```

---

## 📱 OPSI 1: Emulator di IDX (Gratis, No Cloud)

### ⚠️ PENTING: Aturan Dasar

| ❌ JANGAN LAKUKAN | ✅ LAKUKAN |
|-------------------|------------|
| `avdmanager create avd` | `adb devices` untuk cek status |
| `sdkmanager "system-images..."` | `adb tcpip 5555` untuk enable TCP mode |
| `emulator -avd ...` command | `adb connect localhost:5555` |
| Download system image baru | Connect ke emulator yang sudah running |

**💡 Di IDX Firebase Studio, emulator sudah dikelola oleh Flutter preview. Kita tinggal connect via ADB!**

---

### Setup Emulator di IDX (Step-by-Step)

**Langkah 1** — Verifikasi Emulator Running

```bash
adb devices -l
```

**Output yang diharapkan:**
```
List of devices attached
emulator-5554          device product:sdk_gphone64_x86_64 model:sdk_gphone64_x86_64
```

**Jika status `unauthorized`:**
> Buka tab **Flutter Preview** di sidebar IDX → Klik **"Allow"** pada dialog "Allow USB debugging?"

**Jika `no devices`:**
> Beritahu AI agent — jangan coba start emulator manual (sudah dikelola IDX)

---

**Langkah 2** — Enable TCP/IP Mode

```bash
# Restart ADB server (jika diperlukan)
adb kill-server && adb start-server

# Enable TCP mode di emulator
adb -s emulator-5554 tcpip 5555

# Connect via TCP
adb connect localhost:5555
```

**Verifikasi:**
```bash
adb devices -l
```

Output harus menunjukkan 2 koneksi:
```
emulator-5554          device product:sdk_gphone64_x86_64...
localhost:5555         device product:sdk_gphone64_x86_64...
```

---

**Langkah 3** — Connect via MCP Tool

```
Minta AI: "Deteksi dan connect ke emulator di IDX"
→ AI akan memanggil: idx_connect_emulator(host="localhost", port=5555)
```

**Verifikasi berhasil:**
```
✅ Terhubung ke localhost:5555
✅ Emulator siap! (boot dalam Xs)
📱 Model   : sdk_gphone64_x86_64
📱 Android : 16 (API 36)
📱 Serial  : localhost:5555
```

---

### Info Emulator Default IDX

| Property | Value |
|----------|-------|
| Device | sdk_gphone64 x86_64 |
| Android | API 36 (Android 16) |
| ADB Local | emulator-5554 |
| ADB TCP | localhost:5555 |
| Resolution | 1080x1920 |
| DPI | 440 |
| Mode | Headless (tanpa GUI window) |

---

### Cara Pakai MCP Tools di IDX

Setelah emulator running dan TCP mode aktif:

```
"Install APK ke emulator"
→ idx_install_apk(
    apk_path="./app/build/outputs/apk/debug/app-debug.apk",
    device_serial="localhost:5555"
  )

"Screenshot layar emulator"
→ adb -s localhost:5555 shell screencap -p /sdcard/screen.png
→ adb -s localhost:5555 pull /sdcard/screen.png ./screen.png

"Dump UI hierarchy"
→ adb -s localhost:5555 shell uiautomator dump /sdcard/ui.xml
→ adb -s localhost:5555 shell cat /sdcard/ui.xml

"Tap tombol dengan resource ID"
→ adb -s localhost:5555 shell input tap X Y

"Ketik teks"
→ adb -s localhost:5555 shell input text "Hello World"

"Rekam video"
→ emulator_record_screen(device_serial="localhost:5555", duration_seconds=15)
```

---

### Troubleshooting Emulator IDX

| Problem | Solusi |
|---------|--------|
| `unauthorized` | **Buka tab Flutter Preview → Klik "Allow" pada dialog USB debugging** |
| `failed to authenticate to localhost:5555` | Belum klik "Allow USB debugging" di Flutter Preview |
| `offline` | Tunggu 30s (booting), lalu coba lagi |
| `no devices/emulator` | Emulator belum di-enable TCP mode. Jalankan `adb tcpip 5555` dulu |
| `emulator: command not found` | **Normal di IDX** — jangan coba start emulator manual |
| `uiautomator dump` gagal | Layar mungkin terkunci: `adb shell input keyevent 82` (unlock) |
| Screenshot hitam/emulator tidak merespons | Wake up: `adb shell input keyevent KEYCODE_WAKEUP` |

---

## 🔥 OPSI 2: Firebase Test Lab (Cloud, Tanpa Emulator Lokal)

### Prasyarat

```bash
# 1. Install gcloud CLI di IDX
apt-get update && apt-get install -y google-cloud-sdk

# 2. Login dan setup project
gcloud auth login
gcloud config set project YOUR_PROJECT_ID

# 3. Enable Firebase Test Lab API
gcloud services enable testing.googleapis.com
gcloud services enable toolresults.googleapis.com

# 4. Buat GCS bucket untuk hasil (opsional)
gsutil mb -p YOUR_PROJECT_ID gs://YOUR_PROJECT_ID-test-results
```

### Cara Pakai Firebase Test Lab via MCP

**Robo Test** (otomatis, tanpa kode test):

```
"Jalankan Robo Test APK saya di Firebase Test Lab"
→ ftl_run_test(
    project_id="my-firebase-project",
    apk_path="./app/build/outputs/apk/debug/app-debug.apk",
    test_type="robo",
    device_model="Pixel6",
    android_version="33",
    timeout_minutes=10
  )
```

**Instrumentation Test** (dengan Espresso):

```
"Jalankan Espresso test di Test Lab"
→ ftl_run_test(
    project_id="my-firebase-project",
    apk_path="./app-debug.apk",
    test_apk_path="./app-debug-androidTest.apk",
    test_type="instrumentation",
    device_model="Pixel6",
    android_version="33"
  )
```

**Download & Analisa Hasil:**

```
"Download hasil test dari Test Lab"
→ ftl_download_results(
    gcs_path="gs://my-bucket/results/matrix-xyz",
    download_types=["screenshots", "logcat", "report_xml"]
  )

"Parse report test"
→ ftl_parse_report(report_path="./ftl_results/report_xml/test_result_1.xml")
```

### Lihat Device yang Tersedia

```
"Tampilkan device Pixel yang tersedia"
→ ftl_list_devices(project_id="my-firebase-project", filter_model="Pixel")
```

---

## 💰 Perbandingan Biaya

| | Emulator IDX | Firebase Test Lab |
|---|---|---|
| **Biaya** | Gratis (termasuk IDX quota) | ~$1/device-hour (Spark: 5 test/hari gratis) |
| **Setup** | 2 menit (TCP mode) | 5 menit (jika gcloud sudah login) |
| **Device variety** | 1 AVD (Android 16) | 100+ device model |
| **Real-time** | ✅ Screenshot/UI dump real-time | ⏱️ Setelah test selesai |
| **Internet** | Tidak perlu | Diperlukan |
| **Parallel test** | 1 device | Banyak device parallel |

---

## 🚀 Alur Kerja Rekomendasi untuk Vibe Coding

### 1. DEVELOPMENT (iterasi cepat)
```
Build APK → idx_install_apk → Screenshot → UI Dump → Fix → Repeat
```

### 2. DEBUGGING UI
```
emulator_ui_dump → Tap/Input → Screenshot → Verifikasi
```

### 3. PRE-RELEASE TESTING (quality gate)
```
Build Release APK → ftl_run_test (multiple devices) → Parse Report
```

### 4. CI/CD (GitHub Actions)
```
gradle assembleRelease → ftl_run_test → Notifikasi hasil ke Discord/Slack
```

---

## ⚡ Quick Commands Cheatsheet

```bash
# ═══════════════════════════════════════════════════
# INFO DEVICE
# ═══════════════════════════════════════════════════
adb -s localhost:5555 shell getprop ro.product.model
adb -s localhost:5555 shell getprop ro.build.version.release
adb -s localhost:5555 shell getprop ro.build.version.sdk

# ═══════════════════════════════════════════════════
# LAYAR & INTERAKSI
# ═══════════════════════════════════════════════════
adb -s localhost:5555 shell input keyevent KEYCODE_WAKEUP  # Wake up
adb -s localhost:5555 shell input keyevent 82               # Unlock
adb -s localhost:5555 shell input tap X Y                   # Tap koordinat
adb -s localhost:5555 shell input swipe X1 Y1 X2 Y2         # Swipe
adb -s localhost:5555 shell input text "Hello"              # Input teks
adb -s localhost:5555 shell input keyevent 4                # Back button
adb -s localhost:5555 shell input keyevent 3                # Home button

# ═══════════════════════════════════════════════════
# SCREENSHOT & SCREEN RECORD
# ═══════════════════════════════════════════════════
adb -s localhost:5555 shell screencap -p /sdcard/screen.png
adb -s localhost:5555 pull /sdcard/screen.png ./screen.png
adb -s localhost:5555 shell screenrecord /sdcard/video.mp4  # Stop: Ctrl+C

# ═══════════════════════════════════════════════════
# UI DUMP (SCRAPING)
# ═══════════════════════════════════════════════════
adb -s localhost:5555 shell uiautomator dump /sdcard/ui.xml
adb -s localhost:5555 shell cat /sdcard/ui.xml

# ═══════════════════════════════════════════════════
# APP MANAGEMENT
# ═══════════════════════════════════════════════════
adb -s localhost:5555 install app-debug.apk
adb -s localhost:5555 install -r app-debug.apk              # Replace
adb -s localhost:5555 uninstall com.package.name
adb -s localhost:5555 shell am force-stop com.package.name
adb -s localhost:5555 shell pm clear com.package.name       # Clear data
adb -s localhost:5555 shell pm list packages                # List apps

# ═══════════════════════════════════════════════════
# ACTIVITY & LOG
# ═══════════════════════════════════════════════════
adb -s localhost:5555 shell dumpsys activity | grep "mResumedActivity"
adb -s localhost:5555 logcat -d | grep "AndroidRuntime"     # Crash log
adb -s localhost:5555 logcat -c                             # Clear log
```

---

## 📚 Referensi

- [Dokumentasi ADB](https://developer.android.com/studio/command-line/adb)
- [Firebase Test Lab](https://firebase.google.com/docs/test-lab)
- [IDX Documentation](https://firebase.google.com/docs/studio)
- Panduan Lanjutan: `idx-emulator-connect.md`

---

*Last updated: 2026-03-17*
*Changelog: Simplify workflow — tidak perlu buat AVD manual, emulator sudah tersedia di IDX Flutter workspace*
