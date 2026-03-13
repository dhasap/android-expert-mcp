# 🔥 Panduan IDX Firebase Studio + Firebase Test Lab

> Panduan untuk scraping & testing Android app di **Google IDX** — solusi saat physical device tidak bisa dikoneksikan langsung.

---

## 🗺️ Gambaran Solusi

```
Google IDX (browser-based)
┌──────────────────────────────────────────────────────┐
│  VS Code Web + AI Agent (Kimi/Claude)                │
│                                                      │
│  ┌─────────────┐    MCP stdio    ┌────────────────┐  │
│  │  AI Agent   │◄───────────────►│  MCP Server    │  │
│  └─────────────┘                └───────┬────────┘  │
│                                         │            │
│           ┌─────────────────────────────┤            │
│           │                 │           │            │
│   ┌───────▼──────┐  ┌───────▼──────┐   │            │
│   │ Android Emu  │  │Firebase      │   │            │
│   │ (via Flutter │  │Test Lab      │   │            │
│   │  Preview)    │  │(Cloud)       │   │            │
│   └──────────────┘  └──────────────┘   │            │
└──────────────────────────────────────────────────────┘
```

---

## ⚠️ Masalah: Android Studio IDX Butuh Whitelist

Workspace **Android Studio** di IDX memerlukan akses whitelist khusus dari Google
yang tidak tersedia untuk semua user.

**Solusinya: Gunakan workspace Flutter** — tersedia untuk semua user,
tetap include Android emulator yang bisa diakses via ADB, dan bisa dipakai
untuk scrape app apapun (native Android, Flutter, app pihak ketiga).

---

## 📱 OPSI 0: Flutter IDX Workspace (Tanpa Whitelist) ✅ Recommended

### Kenapa Flutter IDX Bisa Dipakai untuk Scraping App Native?

Flutter IDX menggunakan infrastruktur emulator yang sama dengan Android Studio IDX.
Emulatornya tetap Android biasa yang bisa:
- Menerima install APK arbitrary (`adb install app.apk`)
- Diakses via ADB dari MCP Server
- Menjalankan app native Kotlin/Java maupun Flutter
- Dipakai oleh semua tools MCP: `idx_connect_emulator`, `adb_wifi_shell`, `idx_install_apk`, dll.

---

### 🔧 Setup: 2 Langkah

#### Langkah 1 — Buat workspace Flutter di IDX

1. Buka [idx.google.com](https://idx.google.com)
2. Klik **"New workspace"**
3. Pilih template **Flutter**
4. Tunggu workspace siap (~1-2 menit)

> Jangan pilih Android Studio — butuh whitelist.
> Flutter IDX sudah cukup untuk scraping app apapun.

---

#### Langkah 2 — Copy `.idx/dev.nix` yang sudah dikonfigurasi

**Untuk develop Flutter app + scraping (paling umum):**

```nix
{ pkgs, ... }: {
  channel = "stable";

  packages = [
    pkgs.jdk17          # Java untuk Gradle
    pkgs.android-tools  # ADB + fastboot
    pkgs.nodejs_20      # MCP Server
    pkgs.curl
    pkgs.git
    pkgs.unzip
  ];

  env = {
    ANDROID_ADB_SERVER_ADDRESS = "localhost";
    PUPPETEER_SKIP_CHROMIUM_DOWNLOAD = "true";
    PUPPETEER_EXECUTABLE_PATH = "/usr/bin/google-chrome-stable";
  };

  idx = {
    extensions = [
      "Dart-Code.flutter"
      "Dart-Code.dart-code"
    ];

    previews = {
      enable = true;
      previews = {
        android = {
          command = [
            "flutter" "run"
            "--machine"
            "-d" "android"
            "--pid-file" "/tmp/flutter-android-pid"
          ];
          manager = "flutter";
        };
      };
    };

    workspace = {
      onCreate = {
        flutter-pub-get = "[ -f pubspec.yaml ] && flutter pub get || true";
        mcp-dirs = "mkdir -p /tmp/mcp-screenshots /tmp/mcp-audits /tmp/mcp-emulator";
      };
      onStart = {
        start-adb = "adb start-server 2>/dev/null || true";
        build-mcp = "[ -f tsconfig.json ] && npm run build 2>/dev/null || true";
      };
    };
  };
}
```

**Untuk scraping-only (tanpa develop Flutter app):**

```nix
{ pkgs, ... }: {
  channel = "stable";

  packages = [
    pkgs.jdk17
    pkgs.android-tools
    pkgs.nodejs_20
    pkgs.curl
    pkgs.git
    pkgs.unzip
  ];

  env = {
    ANDROID_ADB_SERVER_ADDRESS = "localhost";
    PUPPETEER_SKIP_CHROMIUM_DOWNLOAD = "true";
    PUPPETEER_EXECUTABLE_PATH = "/usr/bin/google-chrome-stable";
  };

  idx = {
    extensions = [
      "Dart-Code.flutter"
      "Dart-Code.dart-code"
    ];

    previews = {
      enable = true;
      previews = {
        android = {
          # Booting emulator tanpa run Flutter app
          command = [
            "bash" "-c"
            "adb wait-for-device && echo 'Emulator ready' && tail -f /dev/null"
          ];
          manager = "flutter";
        };
      };
    };

    workspace = {
      onCreate = {
        mcp-setup = "mkdir -p /tmp/mcp-screenshots /tmp/mcp-audits /tmp/mcp-emulator";
        mcp-install = "[ -f package.json ] && npm install || true";
      };
      onStart = {
        start-adb = "adb start-server 2>/dev/null || true";
        build-mcp = "[ -f tsconfig.json ] && npm run build 2>/dev/null || true";
      };
    };
  };
}
```

> 📁 File template lengkap tersedia di folder `idx-templates/` di repo MCP server ini.

---

#### Langkah 3 — Rebuild & Connect

```bash
# 1. Setelah ganti dev.nix, rebuild environment:
#    IDX: Ctrl+Shift+P → "Project IDX: Rebuild Environment"
#    Atau klik notifikasi "Rebuild" yang muncul otomatis

# 2. Emulator akan muncul di panel kanan IDX (Android preview)

# 3. Dari terminal IDX, verifikasi ADB:
adb devices
# Output yang diharapkan:
# List of devices attached
# emulator-5554   device

# 4. Connect MCP via idx_connect_emulator:
```

```
Minta AI: "Connect ke emulator IDX"
→ idx_connect_emulator(auto_detect=true)
```

---

### 📱 Scraping App di Flutter IDX

#### Scrape app Flutter yang sedang berjalan

```
# 1. Run Flutter app via Android preview (panel kanan IDX)
#    atau via terminal: flutter run -d emulator-5554

# 2. Dump UI hierarchy
→ idx_emulator_ui_dump()
   # Menampilkan semua widget Flutter yang ada di layar

# 3. Tap elemen
→ idx_emulator_screenshot()
→ idx_emulator_ui_dump()
→ emulator_tap(resource_id="com.myapp:id/btn_login")
```

#### Scrape app native Android di emulator Flutter IDX

```
# 1. Install APK (native Android, bukan Flutter)
→ idx_install_apk(apk_path="./app-debug.apk")

# 2. Launch app
→ idx_launch_app(package_name="com.target.app")

# 3. Scraping seperti biasa
→ idx_emulator_screenshot()
→ idx_emulator_ui_dump()
```

#### Scrape app pihak ketiga (download dari internet)

```bash
# Download APK via terminal IDX
wget https://example.com/app.apk -O /tmp/target-app.apk

# Install via ADB langsung
adb install /tmp/target-app.apk

# Atau via MCP:
# idx_install_apk(apk_path="/tmp/target-app.apk")
```

---

### 🔄 Perbedaan Flutter IDX vs Android Studio IDX

| Fitur | Flutter IDX ✅ | Android Studio IDX ⚠️ |
|-------|---------------|----------------------|
| Ketersediaan | Semua user | Butuh whitelist Google |
| Android emulator | ✅ Ada (via Flutter preview) | ✅ Ada (langsung) |
| ADB access | ✅ Full | ✅ Full |
| Install APK arbitrary | ✅ | ✅ |
| Develop Flutter app | ✅ Native | ⚠️ Bisa tapi tidak optimal |
| Develop native Android | ⚠️ Bisa (pakai terminal + ADB) | ✅ Native |
| MCP tools compatibility | ✅ Semua tools compatible | ✅ Semua tools compatible |

> **Kesimpulan**: Untuk keperluan scraping app, keduanya identik.
> Gunakan Flutter IDX karena tidak butuh whitelist.

---

### Troubleshooting Flutter IDX + Emulator

| Problem | Solusi |
|---------|--------|
| Emulator tidak muncul di panel kanan | Pastikan `previews.enable = true` di dev.nix, lalu Rebuild |
| `adb devices` kosong | Jalankan `adb start-server` di terminal, tunggu emulator fully boot |
| `uiautomator dump` gagal | Wake up layar: `adb shell input keyevent KEYCODE_WAKEUP` |
| Flutter preview error `No connected device` | Tunggu emulator fully boot (~60-90 detik setelah Rebuild) |
| `npm: command not found` | Cek `pkgs.nodejs_20` ada di `packages` di dev.nix |
| MCP server tidak bisa start | Build dulu: `npm run build` di terminal |
| APK tidak bisa diinstall | Cek: `adb devices` harus tampilkan `device`, bukan `offline` |

---

## 📱 OPSI 1: Emulator di IDX Manual (Tanpa Flutter Preview)

Jika tidak mau pakai Flutter preview system dan lebih suka kontrol manual:

### dev.nix untuk emulator manual

```nix
{ pkgs, ... }: {
  channel = "stable";

  packages = [
    pkgs.jdk17
    pkgs.android-tools
    pkgs.nodejs_20
  ];

  idx = {
    extensions = [ "Dart-Code.flutter" "Dart-Code.dart-code" ];

    # Tidak pakai previews — start emulator manual via onStart
    workspace = {
      onCreate = {
        mcp-dirs = "mkdir -p /tmp/mcp-screenshots /tmp/mcp-audits /tmp/mcp-emulator";
      };
      onStart = {
        start-emulator = ''
          adb start-server
          # Emulator akan distart manual atau via MCP idx_start_emulator
        '';
      };
    };
  };
}
```

### Start emulator via MCP tools

```
→ idx_start_emulator(avd_name="auto")
→ idx_connect_emulator(auto_detect=true)
```

Atau via terminal:

```bash
# Lihat AVD yang tersedia
emulator -list-avds

# Start (headless, background)
emulator -avd <nama-avd> -no-window -no-audio -no-snapshot -gpu swiftshader_indirect &

# Tunggu boot
adb wait-for-device
adb shell getprop sys.boot_completed  # Tunggu sampai "1"
```

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

# 3. Enable API
gcloud services enable testing.googleapis.com
gcloud services enable toolresults.googleapis.com
```

### Cara Pakai via MCP

**Robo Test** (otomatis, tanpa kode test):

```
→ ftl_run_test(
    project_id="my-firebase-project",
    apk_path="./app-debug.apk",
    test_type="robo",
    device_model="Pixel6",
    android_version="33"
  )
```

**Instrumentation Test** (Espresso):

```
→ ftl_run_test(
    project_id="my-firebase-project",
    apk_path="./app-debug.apk",
    test_apk_path="./app-debug-androidTest.apk",
    test_type="instrumentation"
  )
```

---

## 💰 Perbandingan Tiga Opsi

| | Flutter IDX (Opsi 0) | Emulator Manual (Opsi 1) | Firebase Test Lab (Opsi 2) |
|---|---|---|---|
| **Whitelist** | Tidak perlu ✅ | Tidak perlu ✅ | Tidak perlu ✅ |
| **Biaya** | Gratis | Gratis | ~$1/device-hour |
| **Setup** | 5 menit | 15 menit | 10 menit |
| **Realtime scraping** | ✅ | ✅ | ❌ |
| **Multi-device** | ❌ | ❌ | ✅ 100+ device |
| **App pihak ketiga** | ✅ Install APK | ✅ Install APK | ✅ |
| **Flutter app** | ✅ Native | ✅ | ✅ |
| **Rekomendasi** | **Mulai dari sini** | Jika perlu kontrol penuh | Untuk QA/release |

---

## 🚀 Alur Kerja Rekomendasi

```
1. SETUP SEKALI:
   Buat Flutter IDX workspace → copy dev.nix → Rebuild

2. SCRAPING / DEBUGGING (iterasi cepat):
   idx_connect_emulator
   → idx_install_apk (jika app baru)
   → idx_launch_app
   → idx_emulator_screenshot + idx_emulator_ui_dump
   → (navigasi) emulator_tap / emulator_input_text
   → Loop

3. PRE-RELEASE TESTING:
   Build release APK
   → ftl_run_test (multiple real devices di cloud)
   → ftl_parse_report
```

---

## ⚡ Quick Commands Cheatsheet

```bash
# Status emulator
adb devices

# Wake up / unlock layar
adb shell input keyevent KEYCODE_WAKEUP
adb shell input keyevent 82

# Install APK
adb install /path/to/app.apk

# Launch app
adb shell am start -n com.package/.MainActivity

# Force stop
adb shell am force-stop com.package

# Clear data
adb shell pm clear com.package

# Screenshot manual
adb shell screencap -p /sdcard/ss.png && adb pull /sdcard/ss.png ./ss.png

# UI dump manual
adb shell uiautomator dump /sdcard/ui.xml && adb pull /sdcard/ui.xml ./ui.xml

# Top activity
adb shell dumpsys activity | grep "mResumedActivity"
```
