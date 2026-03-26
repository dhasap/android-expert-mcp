# 🤖 Android Expert MCP Server

> Production-grade **Model Context Protocol (MCP) Server** — **v5.3**  
> 100+ tools untuk Android/Kotlin development, web scraping, browser control, VPS deploy, dan banyak lagi.

[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18.0-green)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.5-blue)](https://typescriptlang.org)
[![MCP SDK](https://img.shields.io/badge/MCP%20SDK-1.x-purple)](https://github.com/modelcontextprotocol/sdk)
[![Version](https://img.shields.io/badge/version-5.3.0-orange)](./CHANGELOG.md)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow)](LICENSE)

---

## ✨ Features

| Kategori | Tools | Deskripsi |
|----------|-------|-----------|
| 📱 Android / Kotlin / ADB | 8 | Gradle, logcat, UI dump, APK extract, Kotlin analyzer |
| 🕷️ Web Scraping & DOM | 4 | Puppeteer scraping, DOM extract, JS execute, network monitor |
| 🔍 Website Audit | 5 | Lighthouse, screenshot, SEO, mobile responsiveness |
| 🖥️ Browser Control | 14 | Session browser: click, type, scroll, screenshot, JS |
| 🔥 IDX Emulator + Firebase Test Lab | 13 | Emulator control, install APK, FTL test, screenshot, record |
| 🧠 Context Manager | 7 | Session snapshot, context save/load, context compaction |
| 🚀 VPS & Deploy Manager | 10 | SSH exec, monitor, deploy, logs, Turso, history |
| 📡 Wireless ADB | 8 | Pair, connect, shell, screenshot, UI dump via WiFi |
| 🐙 GitHub Integration | 10 | Repo, issues, PRs, file read/write, commit, release |
| 🧪 Advanced Testing | 10 | API testing, Performance profiling, Security audit, Push notification |

---

## 🚀 Quick Start

```bash
# Install dependencies
npm install

# Build
npm run build

# Run
npm start
```

📖 **[Setup Lengkap →](docs/SETUP.md)**

---

## 📚 Dokumentasi

### Getting Started
- [Setup & Instalasi](docs/SETUP.md)
- [IDX Template](docs/IDX_TEMPLATE.md) — Template `.idx/dev.nix`
- [Tools Reference](docs/TOOLS_REFERENCE.md)

### Guides
- [IDX Firebase & Emulator](docs/guides/IDX_FIREBASE.md)
- [Puppeteer & Browser](docs/guides/PUPPETEER.md)
- [VPS Deploy](docs/guides/VPS_DEPLOY.md)
- [Context Manager](docs/guides/CONTEXT_MANAGER.md)

### Security
- [Keamanan & Best Practices](docs/security/SECURITY.md)

---

## 🎯 Use Cases

### Android Development
```typescript
// Build APK
run_gradle_task(project_path="/path/to/project", task="assembleDebug")

// Install ke emulator
idx_install_apk(apk_path="./app-debug.apk", launch_after=true, package_name="com.myapp")

// Debug dengan logcat
adb_read_logcat(duration_seconds=10, package_name="com.myapp")
```

### Web Scraping
```typescript
// Scraping dengan stealth mode
scrape_page_html(url="https://example.com", stealth_mode=true)

// Screenshot
browser_open(url="https://example.com", screenshot=true)
```

### VPS Deploy
```typescript
// Deploy ke VPS
vps_deploy(
  server="production",
  local_path="./myapp",
  remote_path="/var/www/myapp",
  post_commands=["npm install", "pm2 restart myapp"]
)
```

---

## 📝 Changelog

Lihat [CHANGELOG.md](./CHANGELOG.md) untuk riwayat perubahan lengkap.

---

## 🤝 Contributing

Contributions welcome! Lihat [CONTRIBUTING.md](docs/development/CONTRIBUTING.md).

---

## 📄 License

[MIT License](LICENSE)

---

<div align="center">
  <sub>Built with ❤️ for the AI development community</sub>
</div>
