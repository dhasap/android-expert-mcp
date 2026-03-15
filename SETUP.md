# 📦 SETUP.md — Panduan Instalasi & Konfigurasi v5.0

> Setup lengkap **Android Expert MCP Server** untuk Kimi CLI, Claude Code, atau agen MCP lainnya.

---

## 📋 Prasyarat

| Komponen | Versi Min | Cara Cek |
|----------|-----------|----------|
| Node.js | 18.0+ | `node --version` |
| npm | 8.0+ | `npm --version` |
| Git | any | `git --version` |
| ADB *(opsional)* | Platform Tools r33+ | `adb version` |

```bash
# Install Node.js via nvm (direkomendasikan)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
source ~/.bashrc && nvm install 20 && nvm use 20

# Install ADB (Ubuntu/Debian)
sudo apt install -y android-tools-adb
```

---

## 🔧 Langkah 1 — Clone Project

```bash
<<<<<<< HEAD
# Clone dari GitHub
=======
>>>>>>> d8cdb9c (feat: v5.1 - wireless ADB, GitHub integration, context manager (104 tools))
git clone https://github.com/dhasap/android-expert-mcp.git
cd android-expert-mcp
```

---

## 📦 Langkah 2 — Install & Build

```bash
npm install   # Install dependencies
npm run build
```

| Command | Fungsi |
|---------|--------|
| `npm run build` | Compile TypeScript |
| `npm run build:watch` | Auto-recompile |
| `npm run start` | Jalankan server |
| `npm run typecheck` | Type-check saja |
| `npm run rebuild` | Clean + build ulang |

---

## ⚙️ Langkah 3 — Environment Variables (WAJIB)

Beberapa fitur membutuhkan environment variables untuk berfungsi:

### 🕷️ Puppeteer / Chrome (Wajib untuk Web Scraping, Audit, Browser)

```bash
# Cari lokasi Chrome/Chromium
which chromium
which google-chrome-stable

# Set environment variable
export PUPPETEER_EXECUTABLE_PATH="/usr/bin/chromium"

# Atau otomatis
export PUPPETEER_EXECUTABLE_PATH=$(which chromium || which google-chrome)
```

📖 Lihat **[PUPPETEER_SETUP_GUIDE.md](PUPPETEER_SETUP_GUIDE.md)** untuk detail lengkap.

### 🐙 GitHub Integration (Opsional)

```bash
export GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

### 🔥 Firebase Test Lab (Opsional)

```bash
export TURSO_AUTH_TOKEN=eyJ...
```

### Persistent Environment (tambahkan ke `~/.bashrc` atau `~/.zshrc`)

```bash
echo 'export PUPPETEER_EXECUTABLE_PATH="/usr/bin/chromium"' >> ~/.bashrc
source ~/.bashrc
```

---

## 🔌 Langkah 4 — Pasang ke AI Agent

```bash
# Claude Code CLI
claude mcp add android-expert --transport stdio node /absolute/path/to/android-expert-mcp/build/index.js

# Kimi CLI
kimi mcp add --transport stdio node /absolute/path/to/android-expert-mcp/build/index.js
```

**Konfigurasi manual** (`~/.config/claude/claude_desktop_config.json`):
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

---

## 🐙 Langkah 5 — Setup GitHub Integration (Opsional)

```bash
# Buat token di: github.com → Settings → Developer Settings → Personal access tokens
# Scope yang diperlukan: repo, read:user
export GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Tambahkan ke ~/.bashrc agar permanen:
echo 'export GITHUB_TOKEN=ghp_xxx' >> ~/.bashrc
source ~/.bashrc
```

Default owner sudah dikonfigurasi ke **@dhasap** — bisa di-override di setiap tool call.

---

## 📡 Langkah 6 — Setup Wireless ADB

### Android 11+ (Full Wireless — Tanpa USB)

1. Aktifkan **Developer Options** di HP (tap Build Number 7x)
2. Masuk `Settings → Developer Options → Wireless debugging → ON`
3. Tap **"Pair device with pairing code"** — catat `HOST:PORT` dan 6-digit code
4. Panggil tool:
   ```
   adb_wifi_pair(pair_address="192.168.1.5:37891", pairing_code="482931")
   ```
5. Kembali ke layar Wireless debugging — catat `IP Address` dan `Port`
6. Panggil:
   ```
   adb_wifi_connect(address="192.168.1.5:45123")
   ```
7. Mulai gunakan: `adb_wifi_shell`, `adb_wifi_screenshot`, `adb_wifi_ui_dump`

### Android 10- (Butuh USB Sekali)

```bash
# 1. Sambung HP via USB, aktifkan USB Debugging
# 2. Verifikasi terhubung
adb devices

# 3. Aktifkan mode TCP via MCP tool:
# adb_wifi_enable(port=5555)
# ATAU langsung via terminal:
adb tcpip 5555

# 4. Lihat IP HP:
adb shell ip addr show wlan0 | grep "inet "

# 5. Cabut USB, lalu:
# adb_wifi_connect(address="192.168.1.5:5555")
```

> 💡 **Tips**: HP dan laptop harus di jaringan WiFi yang sama!

---

## 🐧 Linux Dependencies (Puppeteer)

```bash
sudo apt install -y \
  libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 \
  libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 \
  libgbm1 libasound2 libpangocairo-1.0-0 libcairo2 libgtk-3-0 \
  libx11-xcb1 libxcb-dri3-0
```

---

## 🔍 Verifikasi Instalasi

```bash
node --version         # >= v18.0.0
ls build/index.js      # Harus ada
node build/index.js    # Harus start tanpa error di stderr

# Test Puppeteer
node -e "import('puppeteer').then(p => p.default.launch({args:['--no-sandbox']}).then(b => { console.log('✅ Puppeteer OK'); b.close(); }))"

# Test ADB (jika dipakai)
adb version

# Test GitHub token
curl -H "Authorization: Bearer $GITHUB_TOKEN" https://api.github.com/user | grep login
```

---

## 🐛 Troubleshooting

### "Cannot find module '@modelcontextprotocol/sdk'"
```bash
rm -rf node_modules package-lock.json && npm install
```

### "Puppeteer failed to launch Chromium"
```bash
sudo apt install -y chromium-browser
export PUPPETEER_EXECUTABLE_PATH=$(which chromium-browser)
```

### Wireless ADB: "failed to connect"
- Pastikan HP dan laptop di WiFi yang sama
- Android 11+: harus pair dulu via `adb_wifi_pair`
- Wireless debugging harus tetap ON (layar tidak boleh terkunci lama)
- Coba restart wireless debugging: matikan → nyalakan kembali

### GitHub: "Bad credentials"
```bash
# Verifikasi token
curl -H "Authorization: Bearer $GITHUB_TOKEN" https://api.github.com/user
# Harus return JSON dengan login, bukan error 401
```

### Error: "EACCES: permission denied" pada temp files
```bash
mkdir -p /tmp/mcp-screenshots /tmp/mcp-audits /tmp/mcp-emulator
chmod 777 /tmp/mcp-screenshots /tmp/mcp-audits /tmp/mcp-emulator
```

---

## 🔄 Update

```bash
cd android-expert-mcp
git pull origin main
npm install
npm run rebuild
# Restart AI agent agar perubahan berlaku
```

---

## 💡 Tips & Best Practices

1. Gunakan **absolute path** saat daftarkan MCP ke CLI agent
2. Set `GITHUB_TOKEN` di `.bashrc` agar permanen
3. Untuk Wireless ADB: sambung ke WiFi 5GHz untuk response lebih cepat
4. `adb_wifi_ui_dump` paling berguna untuk scraping data dari app native
5. `github_commit_push` lebih efisien dari `github_file_write` untuk push banyak file
6. Screenshot disimpan di `/tmp/mcp-emulator/` (auto-cleanup setelah 24 jam)

---

## 📞 Support

- GitHub: [github.com/dhasap/android-expert-mcp](https://github.com/dhasap/android-expert-mcp)
- Buka issue dengan output `npm run typecheck` dan `node build/index.js` (stderr)
