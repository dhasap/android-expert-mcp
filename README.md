# 🤖 Android Expert MCP Server

> A production-grade **Model Context Protocol (MCP) Server** that gives your AI Agent expert-level capabilities in Android/Kotlin development, web scraping, and professional website auditing.

[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18.0-green)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.5-blue)](https://typescriptlang.org)
[![MCP SDK](https://img.shields.io/badge/MCP%20SDK-1.x-purple)](https://github.com/modelcontextprotocol/sdk)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow)](LICENSE)

---

## ✨ Features

### 🏗️ Architecture & Planning Tools
| Tool | Description |
|------|-------------|
| `read_project_structure` | Tree view of any project directory (ignores build artifacts) |
| `read_file` | Read any file with size guard + truncation notice |
| `write_file` | Create/overwrite files, auto-creates parent directories |
| `edit_file` | Surgical find-and-replace edits on any file |
| `create_architecture_doc` | Generate structured Markdown architecture documentation |
| `list_files` | List files in a directory with optional extension filter |

### 📱 Kotlin, Gradle & Android ADB Tools
| Tool | Description |
|------|-------------|
| `run_gradle_task` | Execute `./gradlew` tasks with stack trace extraction on failure |
| `read_build_log` | Parse saved build logs and extract Kotlin/Java error traces |
| `adb_list_devices` | List all connected Android devices/emulators |
| `adb_dump_ui` | Dump UI hierarchy via `uiautomator` — analyze on-screen elements |
| `adb_read_logcat` | Capture logcat with tag/package/level filters |
| `adb_extract_apk` | Pull APKs from connected devices |
| `adb_run_shell` | Execute arbitrary ADB shell commands |
| `analyze_kotlin_file` | Structural analysis: classes, functions, coroutines, code smells |

### 🕷️ Web Scraping & DOM Extraction
| Tool | Description |
|------|-------------|
| `scrape_page_html` | Full rendered HTML extraction via headless Puppeteer |
| `extract_dom_structure` | Structured DOM summary: headings, links, forms, meta, OG tags |
| `execute_js_on_page` | Run custom JavaScript on any webpage and return results |
| `monitor_network_requests` | Capture all network requests (great for reverse-engineering SPAs) |

### 🔍 Website Review & Audit
| Tool | Description |
|------|-------------|
| `take_screenshot` | Full-page PNG screenshots (desktop/mobile/tablet viewports) |
| `run_lighthouse_audit` | Full Lighthouse audit: Performance, Accessibility, SEO, Best Practices |
| `parse_audit_report` | Parse saved Lighthouse JSON into human-readable report + recommendations |
| `check_mobile_responsiveness` | Multi-viewport responsiveness check with issue detection |
| `extract_seo_data` | Deep SEO analysis: titles, meta, headings, alt texts, structured data |

---

## 🚀 Quick Start

See **[SETUP.md](SETUP.md)** for detailed installation and configuration instructions.

**TL;DR:**
```bash
git clone https://github.com/yourusername/android-expert-mcp.git
cd android-expert-mcp
npm install
npm run build
```

Then register with your AI agent:
```bash
kimi mcp add --transport stdio node /path/to/android-expert-mcp/build/index.js
```

---

## 📁 Project Structure

```
android-expert-mcp/
├── src/
│   ├── index.ts              # Server bootstrap & transport setup
│   ├── utils.ts              # Shared utilities (exec, file ops, formatters)
│   └── tools/
│       ├── architecture.ts   # File system & documentation tools
│       ├── android.ts        # Gradle, ADB, Kotlin analysis tools
│       ├── scraping.ts       # Puppeteer web scraping tools
│       └── audit.ts          # Lighthouse audit & screenshot tools
├── build/                    # Compiled JS output (after npm run build)
├── package.json
├── tsconfig.json
├── SETUP.md                  # Detailed setup guide
└── README.md
```

---

## 🛠️ Requirements

- **Node.js** ≥ 18.0 (ESM support required)
- **npm** ≥ 8.0
- **ADB tools** — for Android device tools (install Android SDK Platform Tools)
- **Linux/macOS** recommended (Windows via WSL2 also works)

---

## ⚙️ Configuration

The server uses stdio transport and requires no environment variables by default.

For ADB tools to work:
1. Install Android SDK Platform Tools
2. Add `adb` to your system PATH
3. Enable USB Debugging on your Android device

---

## 🧪 Testing

```bash
# Build first
npm run build

# Run the server directly (will wait for MCP client connection via stdio)
node build/index.js

# Type-check without building
npm run typecheck
```

---

## 📄 License

MIT — see [LICENSE](LICENSE) for details.
