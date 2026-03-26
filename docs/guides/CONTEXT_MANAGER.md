# 🧠 Context Manager Guide

> Session snapshot dan context compaction

---

## 📋 Konsep

Context Manager memungkinkan AI menyimpan "checkpoint" pekerjaan ke disk, sehingga bisa dilanjutkan di sesi berikutnya tanpa kehilangan konteks.

---

## 🚀 Quick Start

### Save Context
```json
{
  "project": "MyAndroidApp",
  "summary": "Sedang fix bug login",
  "current_task": "Debug AuthActivity.kt",
  "next_steps": [
    "Cek validasi input email",
    "Tambah error handling",
    "Test dengan edge cases"
  ],
  "tags": ["kotlin", "bugfix", "auth"]
}
```

### Load Context (Sesi Berikutnya)
```json
{
  "project": "MyAndroidApp"
}
```

---

## 📚 Commands Reference

| Tool | Fungsi |
|------|--------|
| `context_save` | Simpan snapshot konteks |
| `context_load` | Muat snapshot |
| `context_list` | List semua project |
| `context_delete` | Hapus snapshot |
| `context_compact` | Padatkan teks panjang |
| `context_compact_file` | Baca dan padatkan file |
| `context_stats` | Statistik penggunaan |

---

## 🎯 Context Compaction

Gunakan untuk mengurangi token usage:

### Build Log
```json
{
  "text": "...gradle output...",
  "mode": "build_log"
}
```

### ADB Logcat
```json
{
  "text": "...logcat output...",
  "mode": "adb_log",
  "package_filter": "com.myapp"
}
```

### Source Code
```json
{
  "text": "...kotlin code...",
  "mode": "code",
  "language": "Kotlin"
}
```

---

*Storage: `~/.android-expert-mcp/snapshots/`*
