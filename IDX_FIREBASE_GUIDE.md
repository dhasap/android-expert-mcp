# 🔥 Panduan IDX Firebase Studio + Firebase Test Lab

> Panduan khusus untuk vibe coding di **Firebase IDX Studio** — solusi saat physical device tidak bisa dikoneksikan langsung.

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
│    │(TCP:5554)   │  │Test Lab    │   │         │
│    └─────────────┘  └────────────┘   │         │
└─────────────────────────────────────────────────┘
```

---

## 📱 OPSI 1: Emulator di IDX (Gratis, No Cloud)

### Setup Emulator di IDX

**Langkah 1** — Tambahkan Android tools ke `.idx/dev.nix`:

```nix
{ pkgs, ... }: {
  packages = [
    pkgs.android-tools          # ADB + fastboot
    pkgs.android-studio         # Opsional: GUI AVD Manager  
    pkgs.jdk17                  # Java untuk Gradle
  ];

  # Environment variables
  env = {
    ANDROID_HOME = "${pkgs.android-sdk}";
    ANDROID_SDK_ROOT = "${pkgs.android-sdk}";
  };
}
```

**Langkah 2** — Buat AVD (Android Virtual Device) via terminal IDX:

```bash
# Lihat sistem images yang tersedia
sdkmanager --list | grep "system-images"

# Download system image
sdkmanager "system-images;android-33;google_apis;x86_64"

# Buat AVD
avdmanager create avd \
  --name "Pixel6_API33" \
  --package "system-images;android-33;google_apis;x86_64" \
  --device "pixel_6"

# Lihat AVD yang tersedia
emulator -list-avds
```

**Langkah 3** — Jalankan emulator (headless, tanpa GUI):

```bash
# Di terminal IDX (background)
emulator -avd Pixel6_API33 \
  -no-window \
  -no-audio \
  -no-snapshot \
  -gpu swiftshader_indirect \
  &

# Tunggu boot (sekitar 60-120 detik)
adb wait-for-device
adb shell getprop sys.boot_completed  # Harus "1"
```

**Langkah 4** — Connect via MCP tool:

```
Minta AI Agent: "Deteksi emulator di IDX environment"
→ AI akan memanggil: idx_detect_emulator(auto_connect=true)
```

---

### Cara Pakai MCP Tools di IDX

Setelah emulator running, AI bisa:

```
"Install APK saya ke emulator"
→ idx_install_apk(apk_path="./app/build/outputs/apk/debug/app-debug.apk")

"Screenshot layar emulator sekarang"
→ emulator_screenshot()

"Tap tombol Login di emulator"
→ emulator_ui_dump() → lihat resource_id → emulator_tap(action="tap_by_id", resource_id="com.app:id/btn_login")

"Ketik email di form login"
→ emulator_input_text(resource_id="com.app:id/et_email", text="test@example.com")

"Rekam video 15 detik alur onboarding"
→ emulator_record_screen(duration_seconds=15)
```

---

### Troubleshooting Emulator IDX

| Problem | Solusi |
|---------|--------|
| `adb: command not found` | `sudo apt install android-tools-adb` atau tambahkan ke dev.nix |
| `emulator: command not found` | Gunakan path lengkap: `$ANDROID_HOME/emulator/emulator` |
| Port 5554 tidak bisa diakses | Cek IDX port forwarding settings |
| Emulator lambat | Tambahkan flag `-gpu swiftshader_indirect -no-snapshot` |
| `uiautomator dump` gagal | Pastikan layar tidak terkunci: `adb shell input keyevent KEYCODE_WAKEUP` |

---

## 🔥 OPSI 2: Firebase Test Lab (Cloud, Tanpa Emulator Lokal)

### Prasyarat

```bash
# 1. Install gcloud CLI di IDX
curl https://sdk.cloud.google.com | bash
exec -l $SHELL

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
    android_version="33"
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
"Download dan analisa hasil test dari Test Lab"
→ ftl_download_results(
    gcs_path="gs://my-bucket/results/matrix-xyz",
    download_types=["screenshots", "logcat", "report_xml"]
  )
→ ftl_parse_report(report_path="./ftl_results/report_xml/test_result_1.xml")
```

### Lihat Device yang Tersedia:

```
"Tampilkan device Pixel yang tersedia di Firebase Test Lab"
→ ftl_list_devices(project_id="my-firebase-project", filter_model="Pixel")
```

---

## 💰 Perbandingan Biaya

| | Emulator IDX | Firebase Test Lab |
|---|---|---|
| **Biaya** | Gratis (termasuk IDX quota) | ~$1/device-hour (Spark: gratis 5/hari) |
| **Setup** | 10-15 menit | 5 menit (jika gcloud sudah login) |
| **Device variety** | Satu AVD | 100+ device model |
| **Screenshot** | Real-time via ADB | Setelah test selesai |
| **Internet** | Tidak perlu | Perlu |
| **Test scale** | 1 device | Paralel banyak device |

---

## 🚀 Alur Kerja Rekomendasi untuk Vibe Coding

```
1. DEVELOPMENT (iterasi cepat)
   Build → idx_install_apk → emulator_screenshot → emulator_ui_dump
   
2. DEBUGGING UI
   emulator_ui_dump → emulator_tap/emulator_input_text → emulator_screenshot
   
3. PRE-RELEASE TESTING (quality gate)
   Build Release APK → ftl_run_test (multiple devices) → ftl_parse_report
   
4. CI/CD (GitHub Actions)
   gradle assembleRelease → ftl_run_test → notify hasil
```

---

## ⚡ Quick Commands Cheatsheet

```bash
# Cek emulator running
adb devices

# Wake up layar emulator
adb shell input keyevent KEYCODE_WAKEUP

# Unlock layar
adb shell input keyevent 82

# Force stop app
adb shell am force-stop com.your.package

# Clear app data
adb shell pm clear com.your.package

# Lihat top activity
adb shell dumpsys activity | grep "mResumedActivity"

# Simulate network conditions
adb shell settings put global network_preference 1  # WiFi only
```
