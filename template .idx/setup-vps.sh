#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# setup-vps.sh — Setup SSH Key untuk VPS
# ─────────────────────────────────────────────────────────────────────────────
#
# Script ini akan:
#   1. Generate SSH key pair (ed25519)
#   2. Copy public key ke clipboard untuk paste ke VPS
#   3. Setup SSH config
#
# CARA PAKAI:
#   bash .idx/setup-vps.sh
#
# ─────────────────────────────────────────────────────────────────────────────

set -e

KEY_NAME="idx_vps"
SSH_DIR="$HOME/.ssh"
PROJECT_SSH="/home/user/.idx/../.ssh"

echo "════════════════════════════════════════════════════════════"
echo "  🔑 Setup SSH Key untuk VPS"
echo "════════════════════════════════════════════════════════════"
echo ""

# 1. Buat SSH directory
mkdir -p "$SSH_DIR"
chmod 700 "$SSH_DIR"

# 2. Generate SSH key jika belum ada
if [ -f "$SSH_DIR/$KEY_NAME" ]; then
    echo "✅ SSH key sudah ada: $SSH_DIR/$KEY_NAME"
else
    echo "🔧 Generating SSH key pair (ed25519)..."
    ssh-keygen -t ed25519 -C "idx-vps-key" -f "$SSH_DIR/$KEY_NAME" -N ""
    echo "✅ SSH key generated!"
fi

# 3. Copy ke project folder untuk persistensi
mkdir -p "$PROJECT_SSH"
cp "$SSH_DIR/$KEY_NAME" "$PROJECT_SSH/$KEY_NAME"
cp "$SSH_DIR/$KEY_NAME.pub" "$PROJECT_SSH/$KEY_NAME.pub"
echo "✅ Key copied to project folder (persist after rebuild)"

# 4. Tampilkan public key
echo ""
echo "════════════════════════════════════════════════════════════"
echo "  📋 PUBLIC KEY (Copy ini ke VPS):"
echo "════════════════════════════════════════════════════════════"
echo ""
cat "$SSH_DIR/$KEY_NAME.pub"
echo ""
echo "════════════════════════════════════════════════════════════"
echo ""
echo "📝 CARA SETUP KE VPS:"
echo ""
echo "  1. Login ke VPS (via console/provider)"
echo "  2. Edit authorized_keys:"
echo "     nano ~/.ssh/authorized_keys"
echo ""
echo "  3. Paste public key di atas (satu baris)"
echo "  4. Save & exit (Ctrl+X, Y, Enter)"
echo ""
echo "  5. Set permission:"
echo "     chmod 600 ~/.ssh/authorized_keys"
echo "     chmod 700 ~/.ssh"
echo ""
echo "════════════════════════════════════════════════════════════"
echo ""
echo "🔗 Setelah setup, edit: nano ~/.ssh/config"
echo "   Ganti 'YOUR_VPS_IP' dengan IP VPS kamu"
echo ""
echo "🚀 Test koneksi: ssh vps-production"
echo "════════════════════════════════════════════════════════════"
