# 🤝 Contributing Guide

> Panduan kontribusi untuk Android Expert MCP Server

---

## 🚀 Getting Started

1. **Fork** repository
2. **Clone** ke local machine
3. **Install dependencies**: `npm install`
4. **Build**: `npm run build`

---

## 📝 Code Style

### TypeScript
- Gunakan **strict TypeScript**
- Hindari `any` type
- Gunakan `unknown` dengan type guards jika perlu

### Security
- **Selalu escape** user input yang masuk ke shell commands
- Gunakan `shellEscape()` dari `utils.ts`
- Validasi input dengan Zod schema

### Error Handling
- Gunakan `try-catch` untuk semua async operations
- Return error messages yang informatif
- Gunakan `formatToolError()` untuk consistency

---

## 🧪 Testing

```bash
# Build
npm run build

# Check for TypeScript errors
npx tsc --noEmit
```

---

## 📋 Pull Request Process

1. **Buat branch** dari `main`
2. **Commit** dengan message yang jelas
3. **Push** ke fork
4. **Buat PR** dengan deskripsi yang lengkap

### PR Checklist
- [ ] Build berhasil (`npm run build`)
- [ ] Tidak ada TypeScript errors
- [ ] Security: Semua user input di-escape
- [ ] Error handling: try-catch untuk async
- [ ] Dokumentasi diupdate jika perlu

---

## 🔒 Security Reporting

Jika menemukan vulnerability:
1. **Jangan** buat public issue
2. Email ke maintainer secara private
3. Tunggu patch sebelum disclose

---

## 📄 License

By contributing, you agree that your contributions will be licensed under the MIT License.
