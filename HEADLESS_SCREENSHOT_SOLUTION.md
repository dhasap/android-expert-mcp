# 📱 Solusi Screenshot Emulator Headless

## Masalah
Emulator di IDX Firebase Studio berjalan dalam mode **headless** (tanpa GPU/display), sehingga:
- `screencap` ❌ tidak berfungsi
- `emulator_screenshot` ❌ return error

## Solusi yang Tersedia

### 1️⃣ UI Hierarchy Dump (Rekomendasi)
```bash
# Ambil struktur UI lengkap dengan koordinat
docker exec -it android-emulator adb -s emulator-5554 shell uiautomator dump /dev/tty

# Atau gunakan tool:
emulator_ui_dump --parse_mode=full_xml
```

**Output:** XML dengan bounds `[x1,y1][x2,y2]` untuk setiap elemen

### 2️⃣ Screenrecord (Video → Frame)
```bash
# Record 5 detik, lalu extract frame pertama
adb shell screenrecord /sdcard/video.mp4 --time-limit 5
adb pull /sdcard/video.mp4
ffmpeg -i video.mp4 -ss 00:00:01 -vframes 1 screenshot.png
```
**Catatan:** Headless emulator mungkin tidak support video encoding.

### 3️⃣ Layout Inspector via ADB
```bash
# Dumpsys window untuk info aktivitas
adb shell dumpsys window displays
adb shell dumpsys activity top
```

### 4️⃣ Firebase Test Lab (Best untuk Screenshot Nyata)
```bash
# Upload APK dan dapatkan screenshot dari device nyata
ftl_run_test --apk_path=app.apk --test_type=robo
```

## Implementasi di MCP

### Update `emulator_screenshot` untuk Headless

```typescript
// Deteksi mode headless dan fallback ke UI dump
async function emulatorScreenshot(deviceSerial?: string) {
  // Coba screenshot normal
  const result = await exec(`adb -s ${deviceSerial} shell screencap -p`);
  
  if (result.failed || result.stdout === '') {
    // Headless mode - fallback ke UI dump
    console.log('📱 Mode headless terdeteksi, menggunakan UI dump...');
    return await emulatorUiDump(deviceSerial, 'interactive_only');
  }
  
  return result;
}
```

## Visualisasi UI dari XML Dump

Konversi bounds `[x1,y1][x2,y2]` menjadi ASCII art:

```
Bounds: [468,272][1062,862]
→ x1=468, y1=272 (top-left)
→ x2=1062, y2=862 (bottom-right)
→ Width=594, Height=590
```

Gunakan untuk membuat "ASCII Screenshot":
```
┌────────────────────────────────────┐
│  Wallpaper & style                 │
├────────────────────────────────────┤
│  Widgets                           │
├────────────────────────────────────┤
│  Apps list                         │
├────────────────────────────────────┤
│  Home settings                     │
└────────────────────────────────────┘
```

## Perbaikan MCP Tools

### 1. `emulator_screenshot` → Auto-fallback
### 2. `emulator_ui_dump` → Tambah mode "ascii_visual"
### 3. `idx_detect_emulator` → Deteksi headless flag
