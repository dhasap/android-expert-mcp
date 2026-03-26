# 🚀 VPS Deploy Guide

> Deploy project ke VPS dengan SSH

---

## 📋 Prasyarat

- SSH key pair (rekomendasi: ed25519)
- Akses root/user ke VPS
- Port SSH terbuka (default: 22)

---

## 🚀 Quick Start

### 1. Tambahkan Server
```json
{
  "name": "vps-production",
  "host": "47.123.45.67",
  "user": "root",
  "port": 22
}
```

### 2. Setup SSH Key (One-time)
```json
{
  "server": "vps-production",
  "password": "your-password"
}
```

### 3. Deploy Project
```json
{
  "server": "vps-production",
  "local_path": "./myapp",
  "remote_path": "/var/www/myapp",
  "post_commands": ["npm install", "pm2 restart myapp"]
}
```

---

## 📚 Commands Reference

| Tool | Fungsi |
|------|--------|
| `vps_add_server` | Tambah server ke profile |
| `vps_list_servers` | List semua server |
| `vps_setup_key` | Setup SSH key authentication |
| `vps_exec` | Jalankan command via SSH |
| `vps_deploy` | Deploy project dengan rsync/scp |
| `vps_monitor` | Monitor server (CPU, RAM, disk) |
| `vps_logs` | Baca logs (journalctl, pm2, nginx) |
| `vps_service` | Manage services (pm2, systemd) |
| `vps_turso` | Turso DB operations |

---

## 🔐 Security Best Practices

1. **Gunakan SSH key**, bukan password
2. **Disable root login** via password
3. **Change default SSH port** (opsional)
4. **Gunakan fail2ban** untuk block brute force

---

*Lihat juga: [Security Reference](../security/SECURITY.md)*
