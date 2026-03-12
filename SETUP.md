# 📦 SETUP.md — Panduan Lengkap Instalasi & Konfigurasi

> Panduan step-by-step untuk men-setup, build, dan mendeploy **Android Expert MCP Server** ke AI Agent Anda (Kimi CLI, Claude CLI, atau agen MCP lainnya).

---

## 📋 Prasyarat

Sebelum memulai, pastikan sistem Anda memiliki:

| Komponen | Versi Minimum | Cara Cek |
|----------|---------------|----------|
| Node.js | 18.0+ | `node --version` |
| npm | 8.0+ | `npm --version` |
| Git | (any) | `git --version` |
| ADB *(opsional)* | Platform Tools r33+ | `adb version` |

### Instalasi Node.js (jika belum ada)

```bash
# Menggunakan nvm (direkomendasikan)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
source ~/.bashrc
nvm install 20
nvm use 20

# Atau via package manager (Ubuntu/Debian)
sudo apt update
sudo apt install -y nodejs npm
# Pastikan versi >= 18: node --version
```

### Instalasi ADB (untuk Android Tools)

```bash
# Ubuntu/Debian
sudo apt install -y android-tools-adb

# Atau download Android SDK Platform Tools
# https://developer.android.com/studio/releases/platform-tools
# Lalu tambahkan ke PATH:
export PATH="$PATH:/path/to/platform-tools"
echo 'export PATH="$PATH:/path/to/platform-tools"' >> ~/.bashrc
```

---

## 🔧 Langkah 1 — Clone / Download Project

```bash
# Clone dari GitHub
git clone https://github.com/dhasap/android-expert-mcp.git
cd android-expert-mcp

# ATAU buat dari awal (jika Anda copy-paste kode manual)
mkdir android-expert-mcp
cd android-expert-mcp
# Kemudian letakkan semua file sesuai struktur di bawah
```

---

## 📂 Struktur File yang Harus Ada

Pastikan struktur direktori Anda persis seperti ini sebelum `npm install`:

```
android-expert-mcp/
├── package.json
├── tsconfig.json
├── README.md
├── SETUP.md
├── .gitignore
└── src/
    ├── index.ts
    ├── utils.ts
    └── tools/
        ├── architecture.ts
        ├── android.ts
        ├── scraping.ts
        └── audit.ts
```

---

## 📦 Langkah 2 — Instalasi Dependencies

```bash
# Di dalam folder android-expert-mcp/
npm install
```

Ini akan menginstall:
- `@modelcontextprotocol/sdk` — MCP protocol SDK
- `puppeteer` — Headless Chromium browser (akan download Chromium ~170MB)
- `lighthouse` — Google Lighthouse audit engine
- `zod` — Schema validation untuk MCP tools
- TypeScript + type definitions

> ⚠️ **Catatan:** Puppeteer akan mendownload Chromium secara otomatis saat `npm install`. Pastikan koneksi internet stabil. Ukuran total ~300–500 MB.

Jika download Chromium gagal atau ingin skip:
```bash
PUPPETEER_SKIP_DOWNLOAD=true npm install
```

---

## 🏗️ Langkah 3 — Build TypeScript

```bash
npm run build
```

Output akan tersimpan di folder `build/`. Setelah berhasil:

```
build/
├── index.js
├── utils.js
└── tools/
    ├── architecture.js
    ├── android.js
    ├── scraping.js
    └── audit.js
```

### Script NPM yang Tersedia

| Command | Fungsi |
|---------|--------|
| `npm run build` | Compile TypeScript → JavaScript |
| `npm run build:watch` | Auto-recompile saat ada perubahan |
| `npm run start` | Jalankan server (setelah build) |
| `npm run typecheck` | Type-check tanpa compile |
| `npm run clean` | Hapus folder `build/` |
| `npm run rebuild` | Clean + build ulang |

---

## 🧪 Langkah 4 — Test Server

### Test Manual (CLI)

```bash
# Jalankan server secara langsung
node build/index.js

# Server akan berjalan dan menunggu input MCP via stdin.
# Jika tidak ada error di stderr, server siap digunakan.
# Tekan Ctrl+C untuk berhenti.
```

### Test dengan MCP Inspector (opsional)

```bash
# Install MCP Inspector globally
npm install -g @modelcontextprotocol/inspector

# Jalankan inspector
npx @modelcontextprotocol/inspector node /path/to/android-expert-mcp/build/index.js
```

Inspector akan membuka browser di `http://localhost:5173` dengan GUI untuk menguji semua tools.

---

## 🔌 Langkah 5 — Pasang ke AI Agent

### Untuk Kimi CLI

```bash
kimi mcp add --transport stdio node /absolute/path/to/android-expert-mcp/build/index.js
```

Contoh nyata:
```bash
kimi mcp add --transport stdio node /home/username/android-expert-mcp/build/index.js
```

Verifikasi pemasangan:
```bash
kimi mcp list
```

### Untuk Claude Code CLI

```bash
claude mcp add android-expert --transport stdio node /absolute/path/to/android-expert-mcp/build/index.js
```

### Untuk Konfigurasi Manual (claude_desktop_config.json / mcp_config.json)

Edit file konfigurasi MCP Anda (lokasi tergantung agen):

```json
{
  "mcpServers": {
    "android-expert": {
      "command": "node",
      "args": ["/absolute/path/to/android-expert-mcp/build/index.js"],
      "transport": "stdio"
    }
  }
}
```

Lokasi file konfigurasi umum:
- **Linux**: `~/.config/kimi/mcp_config.json` atau `~/.config/claude/claude_desktop_config.json`
- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows (WSL2)**: `/mnt/c/Users/YourName/AppData/Roaming/Claude/claude_desktop_config.json`

---

## 🐧 Konfigurasi Linux Tambahan

### Izin Puppeteer di Linux

Puppeteer memerlukan beberapa dependencies sistem agar Chromium bisa berjalan:

```bash
# Ubuntu/Debian
sudo apt install -y \
  libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 \
  libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 \
  libgbm1 libasound2 libpangocairo-1.0-0 libpango-1.0-0 \
  libcairo2 libgtk-3-0 libx11-xcb1 libxcb-dri3-0

# Jika menggunakan Fedora/CentOS/RHEL
sudo dnf install -y \
  nss atk at-spi2-atk cups-libs libdrm libxkbcommon libXcomposite \
  libXdamage libXrandr mesa-libgbm alsa-lib pango cairo gtk3
```

### Puppeteer sebagai non-root user

Jika menjalankan sebagai root (tidak direkomendasikan), tambahkan flag ini:
```bash
# Tambahkan ke node command (HANYA jika benar-benar diperlukan sebagai root)
# Edit src/tools/scraping.ts dan src/tools/audit.ts, tambahkan '--no-sandbox' ke args
# (sudah termasuk dalam kode, jadi ini seharusnya OK)
```

### Konfigurasi ADB untuk USB Debugging

```bash
# Tambahkan udev rules untuk Android devices
wget -O /tmp/51-android.rules https://raw.githubusercontent.com/M0Rf30/android-udev-rules/main/51-android.rules
sudo cp /tmp/51-android.rules /etc/udev/rules.d/
sudo chmod a+r /etc/udev/rules.d/51-android.rules
sudo udevadm control --reload-rules
sudo service udev restart

# Tambahkan user ke plugdev group
sudo usermod -aG plugdev $USER
# LOGOUT lalu LOGIN ulang agar perubahan group berlaku
```

---

## 🔍 Verifikasi Instalasi

Jalankan checklist ini setelah setup:

```bash
# 1. Node version
node --version    # Harus >= v18.0.0

# 2. Build output ada
ls build/index.js  # Harus ada

# 3. Server bisa dijalankan
node build/index.js &
sleep 1
kill %1  # Tidak ada error = OK

# 4. ADB (jika digunakan)
adb version       # Harus menampilkan versi

# 5. Puppeteer Chromium
node -e "const p = require('puppeteer'); p.launch({args:['--no-sandbox']}).then(b => { console.log('✅ Puppeteer OK'); b.close(); })"
```

---

## 🐛 Troubleshooting

### Error: "Cannot find module '@modelcontextprotocol/sdk'"
```bash
rm -rf node_modules package-lock.json
npm install
```

### Error: "Puppeteer failed to launch Chromium"
```bash
# Install dependencies Linux
sudo apt install -y chromium-browser
# Atau set PUPPETEER_EXECUTABLE_PATH
export PUPPETEER_EXECUTABLE_PATH=$(which chromium-browser)
```

### Error: "adb: command not found"
```bash
# Install platform tools
sudo apt install -y android-tools-adb
# Tambahkan ke PATH
echo 'export PATH="$PATH:/usr/lib/android-sdk/platform-tools"' >> ~/.bashrc
source ~/.bashrc
```

### Error: TypeScript compilation errors
```bash
npm run typecheck  # Lihat error detail
# Pastikan TypeScript versi >= 5.5
npx tsc --version
```

### Error: "EACCES: permission denied" pada screenshot/audit output
```bash
mkdir -p /tmp/mcp-screenshots /tmp/mcp-audits
chmod 777 /tmp/mcp-screenshots /tmp/mcp-audits
```

### Lighthouse tidak bisa connect ke Chrome
Lighthouse memerlukan port 9222 untuk remote debugging. Pastikan tidak ada proses lain yang menggunakan port tersebut:
```bash
lsof -i :9222
# Jika ada proses lain, kill dulu atau ganti port di audit.ts
```

---

## 🔄 Update Server

Saat ada update kode:

```bash
cd android-expert-mcp
git pull origin main      # Jika dari GitHub
npm install               # Update dependencies jika ada yang baru
npm run rebuild           # Rebuild
# Restart AI agent Anda agar perubahan berlaku
```

---

## 📊 Penggunaan di AI Agent

Setelah terpasang, Anda bisa menggunakan tools seperti ini di chat dengan AI Agent:

```
# Contoh prompt ke AI Agent:
"Tolong baca struktur proyek Android saya di /home/user/MyApp"
"Jalankan gradlew assembleDebug pada proyek di /home/user/MyApp"
"Ambil screenshot website https://example.com dalam mode mobile"
"Audit website https://example.com menggunakan Lighthouse"
"Scrape halaman https://example.com dan ekstrak semua link"
"Analisis file Kotlin di /home/user/MyApp/app/src/main/java/MainActivity.kt"
```

---

## 💡 Tips & Best Practices

1. **Gunakan absolute path** saat mendaftarkan MCP ke CLI agent
2. **Rebuild setelah setiap perubahan** dengan `npm run rebuild`
3. **Cek stderr** jika tools tidak berespons — log error ditulis ke stderr
4. **Screenshot disimpan** di `/tmp/mcp-screenshots/` secara default
5. **Audit report JSON** disimpan di `/tmp/mcp-audits/` secara default
6. **ADB tools** membutuhkan device yang terhubung dan USB debugging aktif
7. **Lighthouse audit** bisa memakan 30–90 detik tergantung kecepatan jaringan dan kompleksitas halaman

---

## 📞 Support

Jika ada masalah:
1. Buka issue di GitHub repository
2. Sertakan output dari `npm run typecheck` dan `node build/index.js` (stderr)
3. Sertakan versi Node.js (`node --version`) dan OS Anda
