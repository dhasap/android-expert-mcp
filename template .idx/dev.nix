# ─────────────────────────────────────────────────────────────────────────────
# .idx/dev.nix — Android Native + MCP Server + VPS Workspace
# ─────────────────────────────────────────────────────────────────────────────
#
# Template ini dioptimalkan untuk workflow:
#   1. Build Android Native App (Kotlin)
#   2. MCP Server untuk automation (scraping, deploy, dll)
#   3. Koneksi ke VPS via SSH
#
# CARA PAKAI:
#   1. Copy file ini ke .idx/dev.nix di root project
#   2. Di IDX: klik "Rebuild Environment" (Ctrl+Shift+P → Rebuild)
#
# PROJECT STRUCTURE:
#   • <project-folder>/    → Project Android Native (Kotlin + Gradle)
#   • .ssh/                → SSH keys untuk VPS (jangan di-commit!)
#
# ─────────────────────────────────────────────────────────────────────────────

{ pkgs, ... }: {

  channel = "stable-25.05";

  # ── Packages sistem ─────────────────────────────────────────────────────────
  packages = [
    # Java 17 (wajib untuk Android Gradle Plugin 8.x)
    pkgs.jdk17

    # Android SDK tools
    pkgs.android-tools

    # Node.js untuk MCP Server
    pkgs.nodejs_20

    # Firebase CLI
    pkgs.nodePackages.firebase-tools

    # Python (untuk script automation)
    pkgs.python311
    pkgs.python311Packages.pip

    # Chromium (untuk Puppeteer/Headless Browser di MCP)
    pkgs.chromium

    # SSH & VPS Tools
    pkgs.openssh       # ssh, ssh-keygen, ssh-copy-id
    pkgs.sshpass       # koneksi VPS pakai password (untuk setup awal)
    pkgs.rsync         # sinkronisasi file ke/dari VPS

    # Tools pendukung
    pkgs.nano
    pkgs.curl
    pkgs.git
    pkgs.unzip
    pkgs.wget
  ];

  # ── Environment variables ────────────────────────────────────────────────────
  env = {
    ANDROID_ADB_SERVER_ADDRESS = "localhost";
    JAVA_HOME = "${pkgs.jdk17}";

    # Puppeteer Chromium path
    PUPPETEER_SKIP_CHROMIUM_DOWNLOAD = "true";
    PUPPETEER_EXECUTABLE_PATH = "${pkgs.chromium}/bin/chromium";

    # Firebase host
    HOST = "0.0.0.0";

    # Gradle memory limit
    GRADLE_OPTS = "-Dorg.gradle.jvmargs=-Xmx2048m -Dorg.gradle.daemon=false";

    # SSH config dir
    SSH_CONFIG_DIR = "$HOME/.ssh";
  };

  # ── IDX-specific config ──────────────────────────────────────────────────────
  idx = {
    extensions = [
      "mathiasfrohlich.Kotlin"
      "vscjava.vscode-gradle"
      "tamasfe.even-better-toml"
      "redhat.vscode-xml"
    ];

    # ── Previews ────────────────────────────────────────────────────────────────
    previews = {
      enable = true;
      previews = {
        android = {
          command = [
            "bash" "-c"
            ''
              echo "⏳ Waiting for Android emulator..." &&
              adb wait-for-device &&
              echo "✅ Emulator is ready!" &&
              echo "📱 Connected devices:" &&
              adb devices &&
              tail -f /dev/null
            ''
          ];
          manager = "flutter";
        };
      };
    };

    # ── Lifecycle hooks ────────────────────────────────────────────────────────
    workspace = {
      onCreate = {
        # Buat folder yang dibutuhkan MCP
        mcp-dirs = "mkdir -p /tmp/mcp-screenshots /tmp/mcp-audits /tmp/mcp-emulator";

        # Setup SSH
        setup-ssh = ''
          echo "🔑 Setting up SSH..."
          mkdir -p ~/.ssh
          chmod 700 ~/.ssh

          # Restore SSH key dari folder project
          PROJECT_SSH="/home/user/.idx/../.ssh"
          if [ -f "$PROJECT_SSH/idx_vps" ]; then
            cp "$PROJECT_SSH/idx_vps" ~/.ssh/idx_vps
            cp "$PROJECT_SSH/idx_vps.pub" ~/.ssh/idx_vps.pub
            chmod 600 ~/.ssh/idx_vps
            chmod 644 ~/.ssh/idx_vps.pub
            echo "✅ SSH key restored"
          else
            echo "⚠️  SSH key belum ada. Generate: ssh-keygen -t ed25519 -f ~/.ssh/idx_vps"
          fi

          # Buat SSH config
          if [ ! -f ~/.ssh/config ]; then
            cat > ~/.ssh/config << 'SSHCONF'
Host vps-production
    HostName YOUR_VPS_IP
    User root
    Port 22
    IdentityFile ~/.ssh/idx_vps
    ServerAliveInterval 60
    ServerAliveCountMax 3
    StrictHostKeyChecking no
SSHCONF
            chmod 600 ~/.ssh/config
            echo "✅ SSH config dibuat. Edit: nano ~/.ssh/config"
          fi
        '';
      };

      onStart = {
        start-adb = "adb start-server 2>/dev/null || true";

        project-info = ''
          echo "════════════════════════════════════════════════════════════"
          echo "  🤖 Android Expert MCP Workspace"
          echo "════════════════════════════════════════════════════════════"
          echo ""
          echo "  📱 Android : ./gradlew assembleDebug"
          echo "  🔥 Firebase: firebase --version"
          echo "  🖥️  VPS     : ssh vps-production"
          echo ""
          echo "  MCP Tools available:"
          echo "    • Android (gradle, adb, logcat)"
          echo "    • Browser (puppeteer, scraping)"
          echo "    • VPS (ssh, deploy, monitoring)"
          echo "════════════════════════════════════════════════════════════"
        '';
      };
    };
  };
}
