# 🚀 IDX Template Guide

> Template `.idx/dev.nix` untuk Android Expert MCP Server

---

## 📋 Daftar Template

| Template | Use Case | Size |
|----------|----------|------|
| [`dev.nix`](#template-android-native) | Android Native + MCP + VPS | ~2GB |
| [`dev.nix.flutter`](#template-flutter) | Flutter + Firebase + MCP | ~3GB |
| [`dev.nix.minimal`](#template-minimal) | MCP Server only | ~500MB |

---

## 🚀 Template: Android Native

**File:** `template .idx/dev.nix`

### Use Case
- Android Native development (Kotlin + Gradle)
- MCP Server untuk automation
- VPS deploy via SSH

### Features
- ✅ Java 17 (Android Gradle Plugin 8.x)
- ✅ Android SDK Tools (adb, fastboot)
- ✅ Node.js 20 (MCP Server)
- ✅ Firebase CLI
- ✅ Chromium (Puppeteer)
- ✅ SSH Tools (ssh, sshpass, rsync)
- ✅ Python 3.11

### Install
```bash
cp "android-expert-mcp/template .idx/dev.nix" .idx/dev.nix
# Rebuild environment di IDX
```

---

## 🚀 Template: Flutter

**File:** `template .idx/dev.nix.flutter`

### Use Case
- Flutter development
- Firebase Emulator Suite
- MCP Server untuk automation

### Features
- ✅ Flutter SDK
- ✅ Dart SDK
- ✅ Android SDK
- ✅ Firebase CLI
- ✅ MCP Server ready

### Install
```bash
cp "android-expert-mcp/template .idx/dev.nix.flutter" .idx/dev.nix
# Rebuild environment di IDX
```

---

## 🚀 Template: Minimal

**File:** `template .idx/dev.nix.minimal`

### Use Case
- Hanya MCP Server (tanpa Android SDK)
- Web scraping & browser control
- VPS deploy & GitHub integration

### Features
- ✅ Node.js 20
- ✅ Chromium
- ✅ SSH Tools
- ✅ Python 3.11
- ❌ No Android SDK (lebih ringan)

### Install
```bash
cp "android-expert-mcp/template .idx/dev.nix.minimal" .idx/dev.nix
# Rebuild environment di IDX
```

---

## 🔑 Setup SSH untuk VPS

### 1. Generate SSH Key
```bash
bash android-expert-mcp/template".idx/setup-vps.sh"
```

Atau manual:
```bash
ssh-keygen -t ed25519 -f ~/.ssh/idx_vps -C "idx-vps-key"
```

### 2. Copy Public Key ke VPS
```bash
# Tampilkan public key
cat ~/.ssh/idx_vps.pub

# Copy ke clipboard, lalu paste ke VPS di:
# ~/.ssh/authorized_keys
```

### 3. Edit SSH Config
```bash
nano ~/.ssh/config
```

Isi:
```
Host vps-production
    HostName YOUR_VPS_IP
    User root
    Port 22
    IdentityFile ~/.ssh/idx_vps
    ServerAliveInterval 60
    ServerAliveCountMax 3
    StrictHostKeyChecking no
```

### 4. Test Koneksi
```bash
ssh vps-production
```

---

## 🛠️ Environment Variables

| Variable | Value | Keterangan |
|----------|-------|------------|
| `JAVA_HOME` | JDK 17 path | Android build |
| `PUPPETEER_EXECUTABLE_PATH` | Chromium path | Browser automation |
| `GRADLE_OPTS` | JVM args | Memory limit |
| `ANDROID_ADB_SERVER_ADDRESS` | localhost | ADB connection |
| `HOST` | 0.0.0.0 | Firebase UI access |

---

## 📁 Folder Structure

```
.idx/
├── dev.nix              # Template config
├── setup-vps.sh         # Helper script
└── README.md            # This file

~/.ssh/
├── idx_vps              # Private key
├── idx_vps.pub          # Public key
└── config               # SSH config
```

---

## 🔧 Customization

### Tambah Package
Edit `dev.nix`:
```nix
packages = [
  # ... existing packages
  pkgs.your-package-name
];
```

### Tambah Environment Variable
Edit `dev.nix`:
```nix
env = {
  # ... existing vars
  MY_VAR = "value";
};
```

### Tambah VS Code Extension
Edit `dev.nix`:
```nix
idx.extensions = [
  # ... existing extensions
  "publisher.extension-name"
];
```

---

## 🆘 Troubleshooting

### SSH Key Tidak Persist
```bash
# Copy ke project folder
cp ~/.ssh/idx_vps /home/user/.idx/../.ssh/
cp ~/.ssh/idx_vps.pub /home/user/.idx/../.idx/../.ssh/
```

### ADB Tidak Terdeteksi
```bash
adb kill-server
adb start-server
adb devices
```

### Chromium Not Found
```bash
# Cek path
echo $PUPPETEER_EXECUTABLE_PATH

# Test
$PUPPETEER_EXECUTABLE_PATH --version
```

### Rebuild Environment
```
Ctrl+Shift+P → "IDX: Rebuild Environment"
```

---

## 📚 Lihat Juga

- [SETUP.md](./SETUP.md) — Setup lengkap MCP Server
- [VPS Deploy Guide](./guides/VPS_DEPLOY.md) — Deploy ke VPS
- [Security](./security/SECURITY.md) — Keamanan & best practices
