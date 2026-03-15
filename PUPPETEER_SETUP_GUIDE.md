# 🕷️ Puppeteer & Browser Tools Setup Guide

Panduan setup lengkap untuk mengaktifkan fitur browser-based di **Android Expert MCP Server**.

---

## 📋 Fitur yang Membutuhkan Chrome/Chromium

| Kategori | Tools | Keterangan |
|----------|-------|------------|
| 🕷️ **Web Scraping** | `scrape_page_html`, `extract_dom_structure`, `execute_js_on_page`, `monitor_network_requests` | Headless browsing, DOM extraction |
| 🔍 **Website Audit** | `run_lighthouse_audit`, `take_screenshot`, `check_mobile_responsiveness`, `extract_seo_data` | Lighthouse, screenshot, SEO analysis |
| 🖥️ **Browser Control** | `browser_open`, `browser_click`, `browser_type`, `browser_screenshot`, dll | Interactive browser session |

---

## 🔧 Setup Environment Variable

### Linux/macOS

```bash
# Cari lokasi Chrome/Chromium
which chromium
which chromium-browser
which google-chrome
which google-chrome-stable

# Set environment variable (sesuaikan path)
export PUPPETEER_EXECUTABLE_PATH="/usr/bin/chromium"

# Atau untuk Google Chrome
export PUPPETEER_EXECUTABLE_PATH="/usr/bin/google-chrome-stable"

# Verifikasi
echo $PUPPETEER_EXECUTABLE_PATH
```

### Windows (PowerShell)

```powershell
# Cari lokasi Chrome
Get-ChildItem "C:\Program Files\Google\Chrome\Application\chrome.exe"
Get-ChildItem "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"

# Set environment variable
$env:PUPPETEER_EXECUTABLE_PATH = "C:\Program Files\Google\Chrome\Application\chrome.exe"
```

### Windows (CMD)

```cmd
set PUPPETEER_EXECUTABLE_PATH=C:\Program Files\Google\Chrome\Application\chrome.exe
```

---

## 🚀 Setup di Berbagai Platform

### 1. IDX / Nix Environment

```bash
# Chromium biasanya sudah tersedia di path Nix
export PUPPETEER_EXECUTABLE_PATH="/nix/store/lpdrfl6n16q5zdf8acp4bni7yczzcx3h-idx-builtins/bin/chromium"

# Atau gunakan which
export PUPPETEER_EXECUTABLE_PATH=$(which chromium)
```

### 2. Ubuntu/Debian

```bash
# Install Chromium
sudo apt update
sudo apt install -y chromium-browser

# Set path
export PUPPETEER_EXECUTABLE_PATH="/usr/bin/chromium-browser"
```

### 3. Alpine Linux (Docker)

```bash
# Install Chromium
apk add --no-cache chromium

# Set path
export PUPPETEER_EXECUTABLE_PATH="/usr/bin/chromium-browser"
```

### 4. macOS

```bash
# Install via Homebrew
brew install --cask google-chrome

# Set path
export PUPPETEER_EXECUTABLE_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
```

---

## 🧪 Testing Setup

Setelah set environment variable, test dengan:

```bash
cd /path/to/android-expert-mcp
npm run build

# Test dengan Node.js
export PUPPETEER_EXECUTABLE_PATH="/usr/bin/chromium"  # sesuaikan path
node -e "
const { buildPuppeteerLaunchOptions } = require('./build/utils.js');
const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch(buildPuppeteerLaunchOptions());
  const page = await browser.newPage();
  await page.goto('https://example.com');
  console.log('Title:', await page.title());
  await browser.close();
  console.log('✅ Setup berhasil!');
})();
"
```

---

## 🔌 Setup di Kimi CLI

### Opsi 1: Inline Environment Variable

```bash
PUPPETEER_EXECUTABLE_PATH="/usr/bin/chromium" kimi
```

### Opsi 2: Export Sebelum Menjalankan Kimi

```bash
export PUPPETEER_EXECUTABLE_PATH="/usr/bin/chromium"
kimi
```

### Opsi 3: MCP Config dengan Environment

Edit `~/.kimi/mcp.json`:

```json
{
  "mcpServers": {
    "android-expert": {
      "command": "node",
      "args": ["/absolute/path/to/android-expert-mcp/build/index.js"],
      "env": {
        "PUPPETEER_EXECUTABLE_PATH": "/usr/bin/chromium"
      }
    }
  }
}
```

### Opsi 4: Wrapper Script

Buat file `~/bin/mcp-android-expert`:

```bash
#!/bin/bash
export PUPPETEER_EXECUTABLE_PATH="/usr/bin/chromium"
exec node /absolute/path/to/android-expert-mcp/build/index.js
```

Jadikan executable:
```bash
chmod +x ~/bin/mcp-android-expert
```

Daftarkan ke Kimi CLI:
```bash
kimi mcp add --transport stdio android-expert -- ~/bin/mcp-android-expert
```

---

## 🐳 Docker Setup

### Dockerfile

```dockerfile
FROM node:18-alpine

# Install Chromium
RUN apk add --no-cache chromium nss freetype harfbuzz ca-certificates ttf-freefont

# Set environment variable
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

# Copy project
WORKDIR /app
COPY . .
RUN npm ci && npm run build

CMD ["node", "build/index.js"]
```

### docker-compose.yml

```yaml
version: '3.8'
services:
  android-expert-mcp:
    build: .
    environment:
      - PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
      - GITHUB_TOKEN=${GITHUB_TOKEN}
    volumes:
      - ./temp:/tmp
```

---

## 🛠️ Troubleshooting

### Error: "Could not find Chrome executable"

**Solusi:**
```bash
# Verifikasi Chrome terinstall
which chromium || which google-chrome

# Set path yang benar
export PUPPETEER_EXECUTABLE_PATH=$(which chromium)
```

### Error: "No usable sandbox"

**Solusi:**
- Sudah ditangani oleh helper `buildPuppeteerLaunchOptions()` dengan flag `--no-sandbox`
- Jika masih error, pastikan menggunakan kode terbaru:
  ```bash
  npm run build
  ```

### Error: "Failed to launch the browser process"

**Solusi:**
```bash
# Cek missing dependencies
ldd $(which chromium) | grep not

# Install dependencies yang missing (Ubuntu/Debian)
sudo apt install -y libnss3 libatk-bridge2.0-0 libxss1 libgtk-3-0
```

### Chrome Crash di Docker/Container

**Solusi:**
```bash
# Tambah flag tambahan
export PUPPETEER_EXECUTABLE_PATH="/usr/bin/chromium"
export PUPPETEER_ARGS="--no-sandbox --disable-dev-shm-usage"
```

---

## 📊 Verifikasi Semua Fitur Berfungsi

Setelah setup, verifikasi dengan tools berikut:

```bash
# Di dalam Kimi CLI, jalankan:

# 1. Test scraping
scrape_page_html url="https://example.com"

# 2. Test screenshot
take_screenshot url="https://example.com"

# 3. Test Lighthouse
run_lighthouse_audit url="https://example.com"

# 4. Test browser session
browser_open url="https://example.com"
```

---

## 📝 Ringkasan Environment Variables

| Variable | Deskripsi | Contoh |
|----------|-----------|--------|
| `PUPPETEER_EXECUTABLE_PATH` | Path ke Chrome/Chromium | `/usr/bin/chromium` |
| `GITHUB_TOKEN` | Token untuk GitHub integration | `ghp_xxxxxxxxxxxx` |
| `TURSO_AUTH_TOKEN` | Token untuk Turso DB | `eyJ...` |

---

## ✅ Checklist Setup

- [ ] Chrome/Chromium terinstall
- [ ] `PUPPETEER_EXECUTABLE_PATH` di-set
- [ ] Project di-build (`npm run build`)
- [ ] MCP server terdaftar di Kimi CLI
- [ ] Test scraping berhasil
- [ ] Test screenshot berhasil
- [ ] Test Lighthouse berhasil (opsional)

---

## 🔗 Referensi

- [Puppeteer Documentation](https://pptr.dev/)
- [Lighthouse Documentation](https://developer.chrome.com/docs/lighthouse/)
- [MCP SDK](https://github.com/modelcontextprotocol/sdk)

---

**Versi Dokumen:** 1.0  
**Terakhir Update:** 2026-03-15
