# 🔒 Keamanan Android Expert MCP

> Dokumentasi keamanan dan best practices

---

## ✅ Security Features

### Input Validation
- Semua input divalidasi menggunakan Zod schema
- Type checking strict dengan TypeScript
- Path traversal protection di semua file operations

### Shell Command Security
- `shellEscape()` function untuk semua user input yang masuk ke shell
- Command injection prevention via proper escaping
- Validation untuk host, port, dan path

### Authentication & Secrets
- SSH key support untuk VPS (lebih aman dari password)
- Secrets masking di logs (`maskSecrets()`)
- Environment variable untuk sensitive data

---

## 🛡️ Security Best Practices

### 1. VPS & SSH
```typescript
// ✅ Gunakan SSH key, bukan password
vps_add_server(
  name="my-server",
  host="47.123.45.67",
  identity_file="~/.ssh/id_ed25519"  // Lebih aman
)

// ❌ Hindari password di production
```

### 2. Browser & Scraping
```typescript
// ✅ Stealth mode untuk anti-detection
scrape_page_html(
  url="https://example.com",
  stealth_mode=true
)
```

### 3. ADB Commands
```typescript
// ✅ Package name selalu divalidasi
// Format: com.example.app
```

---

## 🔍 Security Audit History

| Date | Scope | Status |
|------|-------|--------|
| 2026-03-26 | VPS Tools | ✅ All Fixed |
| 2026-03-26 | Browser Tools | ✅ All Fixed |
| 2026-03-26 | Scraping Tools | ✅ All Fixed |
| 2026-03-26 | Android Tools | ✅ All Fixed |
| 2026-03-26 | Context Manager | ✅ All Fixed |
| 2026-03-26 | IDX Firebase | ✅ All Fixed |

---

## 🚨 Reporting Security Issues

Jika menemukan vulnerability:
1. Jangan buat public issue
2. Hubungi maintainer secara private
3. Berikan POC (Proof of Concept)

---

*Last updated: 2026-03-26*
