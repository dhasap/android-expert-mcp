# Connect Android Emulator di IDX Firebase Studio

> Dokumentasi cara menghubungkan Android Emulator yang sudah berjalan di IDX Firebase Studio (Flutter workspace) menggunakan ADB.

---

## 🎯 Overview

Di IDX Firebase Studio, emulator Android sudah dikelola oleh Flutter preview. Kita TIDAK perlu membuat AVD baru atau start emulator manual. Cukup connect via ADB ke emulator yang sudah running.

---

## ⚠️ ATURAN PENTING

| ❌ JANGAN | ✅ LAKUKAN |
|-----------|-----------|
| `avdmanager` | `adb devices` untuk cek status |
| `sdkmanager` | `adb kill-server && adb start-server` jika unauthorized |
| `emulator` command | `adb tcpip 5555` untuk enable TCP mode |
| Install system image | Connect via `localhost:5555` setelah TCP mode aktif |

**⚡ Disk space di IDX terbatas (~4-5GB), jangan download image baru!**

---

## 📋 Step-by-Step

### Step 1: Verifikasi Emulator Running

```bash
adb devices -l
```

**Yang diharapkan:**
```
List of devices attached
emulator-5554          device product:sdk_gphone64_x86_64 model:sdk_gphone64_x86_64
```

**Jika status "unauthorized":**
> ⚠️ **Ini berarti dialog "Allow USB debugging?" muncul di layar emulator tapi belum diklik!**
>
> Lihat bagian [🔐 USB Debugging Authorization](#-usb-debugging-authorization) di bawah.

**Jika status "offline":**
- Tunggu 30 detik, emulator mungkin masih booting
- Jika tetap offline, restart ADB server

**Jika "no devices":**
- STOP, beritahu developer - jangan coba start emulator manual

---

### 🔐 USB Debugging Authorization (PENTING!)

Emulator di IDX berjalan **headless** (`-no-window`), jadi dialog "Allow USB debugging" tidak terlihat langsung.

#### Cara Mengakses Layar Emulator:

**Opsi 1: Via Tab Flutter Preview (Recommended)**
1. Di sidebar kiri IDX, cari tab **"Flutter"** atau **"Flutter Preview"**
2. Klik icon **📱 Device** atau **"Open Emulator"**
3. Akan muncul preview layar emulator
4. Klik tombol **"Allow"** pada dialog "Allow USB debugging?"

**Opsi 2: Via Port Forwarding**
1. Buka tab **"Ports"** di panel bawah IDX
2. Forward port `5554` (emulator console) atau cari port VNC
3. Buka URL-nya untuk melihat layar emulator
4. Klik **"Allow"** pada dialog USB debugging

**Opsi 3: Via IDX Preview Panel**
1. Tekan `Cmd/Ctrl + Shift + P` → ketik "Flutter: Open DevTools"
2. Atau cari panel preview di sebelah kanan editor

#### Verifikasi Setelah Klik Allow:

```bash
adb devices -l
```

Harus menunjukkan status `device` (bukan `unauthorized`):
```
emulator-5554          device product:sdk_gphone64_x86_64 model:sdk_gphone64_x86_64
```

---

### Step 2: Enable TCP/IP Mode

MCP Tools memerlukan koneksi TCP/IP (bukan local socket). Aktifkan TCP mode:

```bash
# Enable TCP mode di port 5555
adb -s emulator-5554 tcpip 5555

# Connect ke port TCP
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

### Step 3: Connect via MCP Tools

Setelah TCP aktif, gunakan MCP tools:

```bash
# Via terminal
idx_connect_emulator(host="localhost", port=5555)

# Atau auto-detect (jika tersedia)
idx_detect_emulator(auto_connect=true)
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

### Step 4: Verifikasi dengan Screenshot/UI Dump

```bash
# Screenshot via ADB
adb -s localhost:5555 shell screencap -p /sdcard/screen.png
adb -s localhost:5555 pull /sdcard/screen.png ./screenshot.png

# UI Dump via ADB
adb -s localhost:5555 shell uiautomator dump /sdcard/ui.xml
adb -s localhost:5555 shell cat /sdcard/ui.xml
```

**Atau pakai MCP Tools:**
```bash
# Screenshot
emulator_screenshot(device_serial="localhost:5555")

# UI Dump
adb_dump_ui(device_serial="localhost:5555")
```

---

## 🔧 Troubleshooting

| Error | Solusi |
|-------|--------|
| `unauthorized` | **Buka tab Flutter Preview di IDX → Klik "Allow" pada dialog USB debugging** |
| `failed to authenticate to localhost:5555` | Emulator perlu di-klik "Allow USB debugging" dulu (lihat bagian [🔐 USB Debugging Authorization](#-usb-debugging-authorization)) |
| `offline` | Tunggu 30s (booting), lalu coba lagi |
| `failed to connect to localhost:5554` | Port tertutup, gunakan `adb tcpip 5555` dulu |
| `no devices/emulator` | Emulator belum di-enable TCP mode |
| `null root node returned` | Animasi loading, tunggu 3-5 detik lalu retry |

### Masalah Umum: Status Selalu "unauthorized"

Jika setelah `adb kill-server && adb start-server` status tetap `unauthorized`:

1. **Pastikan dialog USB debugging sudah diklik "Allow"**
   - Buka tab Flutter Preview di sidebar IDX
   - Dialog akan muncul di sana

2. **Cek dengan shell command:**
   ```bash
   adb -s emulator-5554 shell whoami
   # Harus return: shell
   ```

3. **Jika masih unauthorized**, kemungkinan:
   - Belum klik Allow di dialog → Buka Flutter Preview
   - Suruh user melakukan klik "Allow" terlebih dahulu di emulator, pasti ada pop up yang muncul dengan tulisan Allow Debugging, tinggal klik "Allow" selesai

---

## 📝 Perintah ADB Berguna

```bash
# Info device
adb -s localhost:5555 shell getprop ro.product.model
adb -s localhost:5555 shell getprop ro.build.version.release

# Install APK
adb -s localhost:5555 install path/to/app.apk

# Install XAPK (multiple APKs)
adb -s localhost:5555 install-multiple base.apk config.arm64_v8a.apk ...

# Launch app
adb -s localhost:5555 shell monkey -p com.package.name -c android.intent.category.LAUNCHER 1

# Force stop & clear data
adb -s localhost:5555 shell am force-stop com.package.name
adb -s localhost:5555 shell pm clear com.package.name

# Tap koordinat
adb -s localhost:5555 shell input tap X Y

# Swipe
adb -s localhost:5555 shell input swipe X1 Y1 X2 Y2 DURATION_MS

# Input text
adb -s localhost:5555 shell input text "Hello World"

# Back button
adb -s localhost:5555 shell input keyevent 4

# Screenshot
adb -s localhost:5555 shell screencap -p /sdcard/screen.png
```

---

## 🏗️ Info Emulator Default IDX

| Property | Value |
|----------|-------|
| Device | sdk_gphone64 x86_64 |
| Android | API 36 (Android 16) |
| ADB Address | emulator-5554 (local) / localhost:5555 (TCP) |
| Resolution | 1080x1920 |
| DPI | 440 |
| Mode | Headless (`-no-window`) |

---

## 🔗 Referensi

- [ADB Documentation](https://developer.android.com/studio/command-line/adb)
- [IDX Documentation](https://firebase.google.com/docs/studio)
- MCP Tools: `idx_connect_emulator`, `idx_detect_emulator`, `adb_dump_ui`, `emulator_screenshot`

---

*Last updated: 2026-03-14*
*Changelog: Tambahkan bagian USB Debugging Authorization untuk emulator headless di IDX*
