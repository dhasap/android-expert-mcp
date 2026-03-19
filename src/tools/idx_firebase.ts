/**
 * IDX Emulator & Firebase Test Lab Tools
 * ─────────────────────────────────────────────────────────────────────────────
 * Solusi lengkap untuk vibe coding di Firebase IDX Studio:
 *
 * BAGIAN A — IDX Emulator Connection
 *   • Deteksi otomatis emulator Android di IDX (port 5554, 5556, 5558, dll)
 *   • Koneksi ADB over TCP/IP (workaround physical device)
 *   • Port forwarding helper untuk IDX environment
 *   • Health check & reconnect otomatis
 *
 * BAGIAN B — Firebase Test Lab Integration
 *   • Upload APK ke Firebase Test Lab via gcloud CLI
 *   • Jalankan Robo Test & Instrumentation Test
 *   • Poll status test run sampai selesai
 *   • Download screenshot, video, logcat dari GCS bucket
 *   • Parse hasil test report (XML JUnit + JSON summary)
 *
 * BAGIAN C — UI Scraping via Emulator (tanpa physical device)
 *   • Screenshot emulator via ADB
 *   • uiautomator dump + parsing
 *   • Interaksi UI otomatis (tap, swipe, input teks) di emulator
 *   • Screen recording clip
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import {
  runCommand,
  runAdbCommand,
  formatToolError,
  ensureDir,
  truncateOutput,
  extractStackTrace,
} from "../utils.js";

// ─── Konstanta IDX ────────────────────────────────────────────────────────────

// Port default emulator Android (biasanya 5554, 5556, dst per instance)
const EMULATOR_PORTS = [5554, 5555, 5556, 5557, 5558, 5559, 5560, 5562];

// IDX biasanya expose emulator di localhost dengan port ini
const IDX_ADB_HOST = "localhost";

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function isAdbAvailable(): Promise<boolean> {
  const r = await runAdbCommand("adb version", undefined, 5000);
  return r.exitCode === 0;
}

// ═══════════════════════════════════════════════════════════════════════════
// STABILIZATION HELPERS for Tap/Input (v5.2)
// ═══════════════════════════════════════════════════════════════════════════

/** Delay helper */
function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Retry wrapper with exponential backoff */
async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelayMs: number = 500
): Promise<T> {
  let lastError: Error | undefined;
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (i < maxRetries - 1) {
        const waitMs = baseDelayMs * Math.pow(2, i); // exponential backoff
        await delay(waitMs);
      }
    }
  }
  throw lastError ?? new Error("Retry failed");
}

/** Wait for UI to be idle (no ongoing animations) */
async function waitForUiIdle(
  deviceSerial: string | undefined,
  timeoutMs: number = 5000
): Promise<void> {
  const flag = deviceSerial ? `-s ${deviceSerial}` : "";
  const start = Date.now();
  
  // Try using window animation scale check
  while (Date.now() - start < timeoutMs) {
    const result = await runAdbCommand(
      `adb ${flag} shell dumpsys window animations | grep -E "AnimationState|mAnimating" | head -5`,
      undefined,
      3000
    );
    // If no animation detected or command failed, assume idle
    if (result.exitCode !== 0 || !result.stdout.includes("RUNNING")) {
      return;
    }
    await delay(200);
  }
}

/** Get element info from UI dump */
async function findElementInUi(
  deviceSerial: string | undefined,
  searchType: "text" | "resource-id",
  searchValue: string
): Promise<{ x: number; y: number; bounds: string; clickable: boolean } | null> {
  const flag = deviceSerial ? `-s ${deviceSerial}` : "";
  const remotePath = `/sdcard/ui_find_${Date.now()}.xml`;
  
  try {
    // Dump UI with retry
    await withRetry(async () => {
      const dumpResult = await runAdbCommand(
        `adb ${flag} shell uiautomator dump --compressed ${remotePath}`,
        undefined,
        15000
      );
      if (dumpResult.exitCode !== 0) throw new Error("UI dump failed");
    }, 3, 300);

    const localPath = path.join(os.tmpdir(), `ui_find_${Date.now()}.xml`);
    await runAdbCommand(
      `adb ${flag} pull ${remotePath} "${localPath}"`,
      undefined,
      5000
    );
    await runAdbCommand(`adb ${flag} shell rm ${remotePath}`, undefined, 3000);

    const xmlContent = await fs.readFile(localPath, "utf-8").catch(() => "");
    await fs.unlink(localPath).catch(() => {});

    const searchAttr = searchType === "text" 
      ? `text="${searchValue}"` 
      : `resource-id="${searchValue}"`;
    
    const nodePattern = new RegExp(
      `<node[^>]*${searchAttr.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[^>]*clickable="([^"]*)"[^>]*bounds="\\[(\\d+),(\\d+)\\]\\[(\\d+),(\\d+)\\]"`
    );
    
    const match = xmlContent.match(nodePattern);
    if (!match) return null;

    const [, clickable, x1, y1, x2, y2] = match;
    const cx = Math.round((parseInt(x1!) + parseInt(x2!)) / 2);
    const cy = Math.round((parseInt(y1!) + parseInt(y2!)) / 2);
    
    return {
      x: cx,
      y: cy,
      bounds: `[${x1},${y1}][${x2},${y2}]`,
      clickable: clickable === "true",
    };
  } catch {
    return null;
  }
}

/** Verify element still exists at coordinates before tapping */
async function verifyElementAtCoords(
  deviceSerial: string | undefined,
  x: number,
  y: number,
  expectedText?: string
): Promise<boolean> {
  if (!expectedText) return true; // Skip verification if no text to match
  
  const flag = deviceSerial ? `-s ${deviceSerial}` : "";
  const remotePath = `/sdcard/ui_verify_${Date.now()}.xml`;
  
  try {
    await runAdbCommand(
      `adb ${flag} shell uiautomator dump --compressed ${remotePath}`,
      undefined,
      10000
    );
    
    const localPath = path.join(os.tmpdir(), `ui_verify_${Date.now()}.xml`);
    await runAdbCommand(
      `adb ${flag} pull ${remotePath} "${localPath}"`,
      undefined,
      5000
    );
    await runAdbCommand(`adb ${flag} shell rm ${remotePath}`, undefined, 3000);

    const xmlContent = await fs.readFile(localPath, "utf-8").catch(() => "");
    await fs.unlink(localPath).catch(() => {});

    // Check if element with expected text is still near those coordinates
    const escapedText = expectedText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(
      `<node[^>]*text="${escapedText}"[^>]*bounds="\\[(\\d+),(\\d+)\\]\\[(\\d+),(\\d+)\\]"`
    );
    const match = xmlContent.match(pattern);
    
    if (!match) return false;
    
    const [, x1, y1, x2, y2] = match;
    const centerX = Math.round((parseInt(x1!) + parseInt(x2!)) / 2);
    const centerY = Math.round((parseInt(y1!) + parseInt(y2!)) / 2);
    
    // Allow 50px tolerance
    const tolerance = 50;
    return (
      Math.abs(centerX - x) <= tolerance &&
      Math.abs(centerY - y) <= tolerance
    );
  } catch {
    return true; // Assume OK if verification fails
  }
}

/** Smart tap with retry and verification */
async function smartTap(
  deviceSerial: string | undefined,
  x: number,
  y: number,
  expectedText?: string,
  maxRetries: number = 3
): Promise<{ success: boolean; attempts: number; message: string }> {
  const flag = deviceSerial ? `-s ${deviceSerial}` : "";
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // Pre-tap: wait for UI idle
      await waitForUiIdle(deviceSerial, 2000);
      
      // Verify element still there (if we know what to look for)
      if (expectedText && attempt > 1) {
        const stillThere = await verifyElementAtCoords(deviceSerial, x, y, expectedText);
        if (!stillThere) {
          // Try to find element again
          const elem = await findElementInUi(deviceSerial, "text", expectedText);
          if (elem) {
            x = elem.x;
            y = elem.y;
          }
        }
      }
      
      // Execute tap
      const result = await runAdbCommand(
        `adb ${flag} shell input tap ${x} ${y}`,
        undefined,
        5000
      );
      
      if (result.exitCode === 0) {
        // Post-tap: short delay for UI to respond
        await delay(300);
        return { success: true, attempts: attempt, message: "Tap executed" };
      }
    } catch (err) {
      if (attempt === maxRetries) {
        return { 
          success: false, 
          attempts: attempt, 
          message: `Failed after ${maxRetries} attempts: ${err}` 
        };
      }
      await delay(500 * attempt); // Increasing delay between retries
    }
  }
  
  return { success: false, attempts: maxRetries, message: "Max retries reached" };
}

/** Smart swipe with velocity calculation */
async function smartSwipe(
  deviceSerial: string | undefined,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  durationMs?: number
): Promise<{ success: boolean; message: string }> {
  const flag = deviceSerial ? `-s ${deviceSerial}` : "";
  
  // Calculate optimal duration based on distance if not specified
  let duration = durationMs;
  if (!duration) {
    const distance = Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
    // 1ms per 2 pixels, min 200ms, max 1000ms
    duration = Math.min(Math.max(Math.round(distance / 2), 200), 1000);
  }
  
  try {
    await waitForUiIdle(deviceSerial, 1000);
    
    const result = await runAdbCommand(
      `adb ${flag} shell input swipe ${x1} ${y1} ${x2} ${y2} ${duration}`,
      undefined,
      5000
    );
    
    if (result.exitCode === 0) {
      await delay(duration + 100); // Wait for swipe to complete
      return { success: true, message: `Swiped in ${duration}ms` };
    }
    return { success: false, message: result.stderr };
  } catch (err) {
    return { success: false, message: String(err) };
  }
}

/** Smart text input with field focus verification */
async function smartInputText(
  deviceSerial: string | undefined,
  text: string,
  options: {
    tapX?: number;
    tapY?: number;
    resourceId?: string;
    clearFirst?: boolean;
    pressEnter?: boolean;
  }
): Promise<{ success: boolean; message: string }> {
  const flag = deviceSerial ? `-s ${deviceSerial}` : "";
  
  try {
    // Tap to focus field if coordinates provided
    if (options.tapX !== undefined && options.tapY !== undefined) {
      await waitForUiIdle(deviceSerial, 1000);
      
      const tapResult = await runAdbCommand(
        `adb ${flag} shell input tap ${options.tapX} ${options.tapY}`,
        undefined,
        5000
      );
      
      if (tapResult.exitCode !== 0) {
        return { success: false, message: "Failed to tap input field" };
      }
      
      await delay(300); // Wait for field to focus
    }
    
    // Clear field if requested
    if (options.clearFirst) {
      // Try multiple methods to clear
      await runAdbCommand(`adb ${flag} shell input keyevent KEYCODE_CTRL_A`, undefined, 2000);
      await delay(100);
      await runAdbCommand(`adb ${flag} shell input keyevent KEYCODE_DEL`, undefined, 2000);
      await delay(100);
    }
    
    // Type text with retry for long text
    const chunks = text.match(/.{1,100}/g) || [text]; // Split into 100-char chunks
    for (const chunk of chunks) {
      const escaped = chunk.replace(/ /g, "%s").replace(/&/g, "\\&");
      await withRetry(async () => {
        const result = await runAdbCommand(
          `adb ${flag} shell input text "${escaped}"`,
          undefined,
          5000
        );
        if (result.exitCode !== 0) throw new Error("Input failed");
      }, 3, 200);
    }
    
    // Press enter if requested
    if (options.pressEnter) {
      await delay(100);
      await runAdbCommand(
        `adb ${flag} shell input keyevent KEYCODE_ENTER`,
        undefined,
        3000
      );
    }
    
    await delay(200);
    return { success: true, message: `Typed ${text.length} characters` };
  } catch (err) {
    return { success: false, message: String(err) };
  }
}

async function isGcloudAvailable(): Promise<boolean> {
  const r = await runCommand("gcloud version", undefined, 5000);
  return r.exitCode === 0;
}

async function getConnectedDevicesList(): Promise<
  Array<{ serial: string; state: string; isEmulator: boolean }>
> {
  const r = await runAdbCommand("adb devices -l", undefined, 10000);
  return r.stdout
    .split("\n")
    .slice(1)
    .filter((l) => l.trim().length > 0 && !l.startsWith("*"))
    .map((l) => {
      const parts = l.trim().split(/\s+/);
      const serial = parts[0] ?? "";
      const state = parts[1] ?? "unknown";
      return {
        serial,
        state,
        isEmulator: serial.startsWith("emulator-") || serial.includes(":5"),
      };
    })
    .filter((d) => d.serial && (d.state === "device" || d.state === "emulator"));
}

async function waitForTestLabOperation(
  operationId: string,
  maxWaitSeconds: number,
  projectId: string
): Promise<{ done: boolean; result?: string; error?: string }> {
  const deadline = Date.now() + maxWaitSeconds * 1000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 10000)); // poll tiap 10 detik
    const r = await runCommand(
      `gcloud firebase test android operations describe ${operationId} --project ${projectId} --format=json`,
      undefined,
      15000
    );
    if (r.exitCode === 0) {
      try {
        const data = JSON.parse(r.stdout);
        if (data.done) {
          return {
            done: true,
            result: JSON.stringify(data.response ?? data.error ?? {}, null, 2),
          };
        }
      } catch {
        // continue polling
      }
    }
  }
  return { done: false, error: `Timeout after ${maxWaitSeconds}s` };
}

// ─── Tool Registration ────────────────────────────────────────────────────────

export function registerIdxFirebaseTools(server: McpServer): void {

  // ════════════════════════════════════════════════════════════════════════════
  // BAGIAN A — IDX EMULATOR CONNECTION
  // ════════════════════════════════════════════════════════════════════════════

  // ── A1. idx_detect_emulator ───────────────────────────────────────────────
  server.tool(
    "idx_detect_emulator",
    "Deteksi otomatis emulator Android yang berjalan di environment IDX Firebase Studio. " +
      "Scan port ADB standar (5554–5562) dan coba koneksi TCP/IP. " +
      "Gunakan ini PERTAMA KALI saat physical device tidak tersedia.",
    {
      host: z
        .string()
        .default("localhost")
        .describe(
          "Host emulator. Di IDX: 'localhost' atau '127.0.0.1'. " +
            "Jika emulator di container lain, isi IP-nya."
        ),
      ports: z
        .array(z.number().int())
        .default(EMULATOR_PORTS)
        .describe("Port yang akan di-scan (default: 5554–5562)"),
      auto_connect: z
        .boolean()
        .default(true)
        .describe("Otomatis connect ke emulator yang ditemukan"),
    },
    async ({ host, ports, auto_connect }) => {
      try {
        if (!(await isAdbAvailable())) {
          return {
            content: [
              {
                type: "text",
                text:
                  "❌ ADB tidak tersedia.\n\n" +
                  "Di IDX Firebase Studio, install dengan:\n" +
                  "  sudo apt-get install -y android-tools-adb\n\n" +
                  "Atau tambahkan ke .idx/dev.nix:\n" +
                  "  packages = [ pkgs.android-tools ];",
              },
            ],
          };
        }

        // Cek device yang sudah terkoneksi dulu
        const existing = await getConnectedDevicesList();
        const existingEmulators = existing.filter((d) => d.isEmulator);

        const found: Array<{ address: string; port: number; connected: boolean }> = [];
        const lines: string[] = [
          "🔍 IDX Emulator Detection",
          "─".repeat(55),
          `Host yang di-scan : ${host}`,
          `Port yang di-scan : ${ports.join(", ")}`,
          "",
        ];

        if (existingEmulators.length > 0) {
          lines.push("✅ Emulator sudah terkoneksi sebelumnya:");
          existingEmulators.forEach((e) => {
            lines.push(`   • ${e.serial} (${e.state})`);
          });
          lines.push("");
        }

        // Scan port TCP
        lines.push("🔌 Scanning port TCP...");
        for (const port of ports) {
          const address = `${host}:${port}`;
          // Cek apakah port terbuka
          const pingResult = await runCommand(
            `nc -zv -w2 ${host} ${port} 2>&1 || echo "CLOSED"`,
            undefined,
            5000
          );
          const isOpen =
            pingResult.stdout.includes("open") ||
            pingResult.stdout.includes("succeeded") ||
            pingResult.stderr.includes("open") ||
            pingResult.stderr.includes("succeeded");

          if (isOpen) {
            found.push({ address, port, connected: false });
            lines.push(`   ✅ Port ${port} TERBUKA → ${address}`);
          } else {
            lines.push(`   ⬜ Port ${port} tertutup`);
          }
        }

        if (found.length === 0 && existingEmulators.length === 0) {
          lines.push("");
          lines.push("❌ Tidak ada emulator yang ditemukan.");
          lines.push("");
          lines.push("💡 SOLUSI untuk IDX Firebase Studio:");
          lines.push("   1. Buka terminal IDX, jalankan:");
          lines.push("      emulator -avd <nama_avd> -no-window &");
          lines.push("   2. Atau via Android Studio di IDX:");
          lines.push("      AVD Manager → Start emulator");
          lines.push("   3. Setelah emulator jalan, run tool ini lagi");
          lines.push("");
          lines.push("   Cek AVD yang tersedia dengan:");
          lines.push("   emulator -list-avds");

          return { content: [{ type: "text", text: lines.join("\n") }] };
        }

        // Auto-connect jika diminta
        if (auto_connect && found.length > 0) {
          lines.push("");
          lines.push("🔗 Menghubungkan ke emulator...");

          for (const f of found) {
            const connectResult = await runAdbCommand(
              `adb connect ${f.address}`,
              undefined,
              10000
            );
            const success =
              connectResult.stdout.includes("connected") ||
              connectResult.stdout.includes("already connected");
            f.connected = success;

            if (success) {
              lines.push(`   ✅ Terhubung: ${f.address}`);
            } else {
              // Jika gagal autentikasi tapi ada existing connection, skip
              if (connectResult.stderr.includes("failed to authenticate") && existingEmulators.length > 0) {
                lines.push(`   ⚠️  Auth gagal, menggunakan koneksi existing`);
              } else {
                lines.push(
                  `   ❌ Gagal: ${f.address} — ${connectResult.stdout.trim()}`
                );
              }
            }
          }
        }

        // Final device list
        lines.push("");
        lines.push("📱 Device List Final:");
        const finalDevices = await getConnectedDevicesList();
        if (finalDevices.length === 0) {
          lines.push("   (tidak ada device terkoneksi)");
          lines.push("   💡 Coba jalankan: adb devices -l");
        } else {
          finalDevices.forEach((d) => {
            const icon = d.isEmulator ? "🤖" : "📱";
            lines.push(`   ${icon} ${d.serial} — ${d.state}`);
          });
        }

        lines.push("");
        lines.push("💡 Gunakan serial di atas untuk parameter 'device_serial' di tools ADB lainnya.");

        return { content: [{ type: "text", text: lines.join("\n") }] };
      } catch (error) {
        return {
          content: [
            { type: "text", text: formatToolError("idx_detect_emulator", error) },
          ],
        };
      }
    }
  );

  // ── A2. idx_connect_emulator ──────────────────────────────────────────────
  server.tool(
    "idx_connect_emulator",
    "Koneksikan ADB ke emulator via TCP/IP (tanpa USB). " +
      "Untuk IDX: emulator biasanya di 'localhost:5554'. " +
      "Juga bisa dipakai untuk connect ke remote emulator / cloud device.",
    {
      host: z
        .string()
        .default("localhost")
        .describe("Host emulator"),
      port: z
        .number()
        .int()
        .default(5554)
        .describe("Port ADB emulator (default: 5554)"),
      wait_for_boot: z
        .boolean()
        .default(true)
        .describe("Tunggu sampai emulator selesai boot sebelum return"),
      boot_timeout_seconds: z
        .number()
        .int()
        .min(10)
        .max(300)
        .default(120)
        .describe("Timeout menunggu boot (default: 120s)"),
    },
    async ({ host, port, wait_for_boot, boot_timeout_seconds }) => {
      try {
        if (!(await isAdbAvailable())) {
          return {
            content: [{ type: "text", text: "❌ ADB tidak tersedia." }],
          };
        }

        const address = `${host}:${port}`;
        const lines: string[] = [
          `🔗 Menghubungkan ADB ke ${address}...`,
          "─".repeat(55),
        ];

        // Cek apakah emulator sudah terkoneksi via USB/local socket (emulator-XXXX)
        const existingDevices = await getConnectedDevicesList();
        const existingEmulator = existingDevices.find(d => d.isEmulator && d.state === "device");
        
        if (existingEmulator) {
          lines.push(`✅ Emulator sudah terkoneksi: ${existingEmulator.serial}`);
          lines.push("🔄 Mengaktifkan TCP/IP mode...");
          
          // Enable TCP mode via emulator yang sudah terkoneksi
          const tcpResult = await runAdbCommand(
            `adb -s ${existingEmulator.serial} tcpip ${port}`,
            undefined,
            10000
          );
          
          if (tcpResult.exitCode !== 0) {
            lines.push(`⚠️  Gagal enable TCP mode: ${tcpResult.stderr}`);
            lines.push("💡 Menggunakan koneksi existing (USB/local socket)");
            
            // Return info dari existing connection
            const propResult = await runAdbCommand(
              `adb -s ${existingEmulator.serial} shell getprop ro.product.model`,
              undefined,
              5000
            );
            const sdkResult = await runAdbCommand(
              `adb -s ${existingEmulator.serial} shell getprop ro.build.version.sdk`,
              undefined,
              5000
            );
            const androidResult = await runAdbCommand(
              `adb -s ${existingEmulator.serial} shell getprop ro.build.version.release`,
              undefined,
              5000
            );
            
            lines.push("");
            lines.push("📱 Info Emulator (Existing Connection):");
            lines.push(`   Model   : ${propResult.stdout.trim() || "unknown"}`);
            lines.push(`   Android : ${androidResult.stdout.trim() || "unknown"} (API ${sdkResult.stdout.trim() || "?"})`);
            lines.push(`   Serial  : ${existingEmulator.serial}`);
            lines.push("");
            lines.push(`💡 Gunakan device_serial="${existingEmulator.serial}" di tools ADB lainnya.`);
            
            return { content: [{ type: "text", text: lines.join("\n") }] };
          }
          
          await delay(1000); // Tunggu TCP mode aktif
        }

        // Kill server dulu lalu restart (sering fix masalah koneksi IDX)
        await runAdbCommand("adb kill-server", undefined, 5000);
        await delay(1000);
        await runAdbCommand("adb start-server", undefined, 5000);
        await delay(1000);

        const connectResult = await runAdbCommand(
          `adb connect ${address}`,
          undefined,
          15000
        );

        const success =
          connectResult.stdout.includes("connected") ||
          connectResult.stdout.includes("already connected");

        if (!success) {
          // Jika gagal autentikasi tapi ada existing connection, gunakan itu
          if (connectResult.stderr.includes("failed to authenticate") && existingEmulator) {
            lines.push(`⚠️  TCP auth gagal, menggunakan koneksi existing: ${existingEmulator.serial}`);
            
            const propResult = await runAdbCommand(
              `adb -s ${existingEmulator.serial} shell getprop ro.product.model`,
              undefined,
              5000
            );
            const sdkResult = await runAdbCommand(
              `adb -s ${existingEmulator.serial} shell getprop ro.build.version.sdk`,
              undefined,
              5000
            );
            const androidResult = await runAdbCommand(
              `adb -s ${existingEmulator.serial} shell getprop ro.build.version.release`,
              undefined,
              5000
            );

            lines.push("");
            lines.push("📱 Info Emulator:");
            lines.push(`   Model   : ${propResult.stdout.trim() || "unknown"}`);
            lines.push(`   Android : ${androidResult.stdout.trim() || "unknown"} (API ${sdkResult.stdout.trim() || "?"})`);
            lines.push(`   Serial  : ${existingEmulator.serial}`);
            lines.push("");
            lines.push(`💡 Gunakan device_serial="${existingEmulator.serial}" di tools ADB lainnya.`);
            
            return { content: [{ type: "text", text: lines.join("\n") }] };
          }
          
          lines.push(`❌ Koneksi gagal: ${connectResult.stdout.trim()}`);
          lines.push("");
          lines.push("💡 Troubleshooting IDX:");
          lines.push("   • Pastikan emulator sudah berjalan: adb devices");
          lines.push("   • Restart ADB: adb kill-server && adb start-server");
          lines.push(`   • Coba: adb connect ${address}`);
          lines.push("   • Di IDX, cek port forwarding workspace setting");
          return { content: [{ type: "text", text: lines.join("\n") }] };
        }

        lines.push(`✅ Terhubung ke ${address}`);

        if (wait_for_boot) {
          lines.push("⏳ Menunggu emulator selesai boot...");
          const bootStart = Date.now();
          let booted = false;

          while (Date.now() - bootStart < boot_timeout_seconds * 1000) {
            const bootCheck = await runAdbCommand(
              `adb -s ${address} shell getprop sys.boot_completed`,
              undefined,
              10000
            );
            if (bootCheck.stdout.trim() === "1") {
              booted = true;
              break;
            }
            await delay(3000);
          }

          if (booted) {
            const elapsed = Math.round((Date.now() - bootStart) / 1000);
            lines.push(`✅ Emulator siap! (boot dalam ${elapsed}s)`);
          } else {
            lines.push(`⚠️  Timeout ${boot_timeout_seconds}s — emulator mungkin belum sepenuhnya boot`);
          }
        }

        // Info device
        const propResult = await runAdbCommand(
          `adb -s ${address} shell getprop ro.product.model`,
          undefined,
          5000
        );
        const sdkResult = await runAdbCommand(
          `adb -s ${address} shell getprop ro.build.version.sdk`,
          undefined,
          5000
        );
        const androidResult = await runAdbCommand(
          `adb -s ${address} shell getprop ro.build.version.release`,
          undefined,
          5000
        );

        lines.push("");
        lines.push("📱 Info Emulator:");
        lines.push(`   Model   : ${propResult.stdout.trim() || "unknown"}`);
        lines.push(`   Android : ${androidResult.stdout.trim() || "unknown"} (API ${sdkResult.stdout.trim() || "?"})`);
        lines.push(`   Serial  : ${address}`);
        lines.push("");
        lines.push(`💡 Gunakan device_serial="${address}" di tools ADB lainnya.`);

        return { content: [{ type: "text", text: lines.join("\n") }] };
      } catch (error) {
        return {
          content: [
            { type: "text", text: formatToolError("idx_connect_emulator", error) },
          ],
        };
      }
    }
  );

  // ── A3. idx_emulator_status ───────────────────────────────────────────────
  server.tool(
    "idx_emulator_status",
    "Cek status lengkap emulator yang terkoneksi: " +
      "info sistem, memori, CPU, storage, network, aplikasi yang berjalan.",
    {
      device_serial: z
        .string()
        .optional()
        .describe("Serial device (misal 'localhost:5554'). Kosong = device pertama."),
    },
    async ({ device_serial }) => {
      try {
        const flag = device_serial ? `-s ${device_serial}` : "";
        const devices = await getConnectedDevicesList();

        if (devices.length === 0) {
          return {
            content: [
              {
                type: "text",
                text:
                  "❌ Tidak ada device terkoneksi.\n" +
                  "Gunakan idx_detect_emulator atau idx_connect_emulator terlebih dahulu.",
              },
            ],
          };
        }

        const targetDevice = device_serial
          ? devices.find((d) => d.serial === device_serial)
          : devices[0];

        if (!targetDevice) {
          return {
            content: [
              { type: "text", text: `❌ Device '${device_serial}' tidak ditemukan.` },
            ],
          };
        }

        // Parallel queries untuk speed
        const [model, android, sdk, mem, cpu, storage, uptime, display] =
          await Promise.all([
            runAdbCommand(`adb ${flag} shell getprop ro.product.model`, undefined, 5000),
            runAdbCommand(`adb ${flag} shell getprop ro.build.version.release`, undefined, 5000),
            runAdbCommand(`adb ${flag} shell getprop ro.build.version.sdk`, undefined, 5000),
            runAdbCommand(`adb ${flag} shell cat /proc/meminfo | head -5`, undefined, 5000),
            runAdbCommand(`adb ${flag} shell top -bn1 | head -5`, undefined, 5000),
            runAdbCommand(`adb ${flag} shell df /data | tail -1`, undefined, 5000),
            runAdbCommand(`adb ${flag} shell uptime`, undefined, 5000),
            runAdbCommand(
              `adb ${flag} shell dumpsys display | grep "mCurrentDisplayRect\\|DisplayWidth\\|DisplayHeight" | head -3`,
              undefined,
              5000
            ),
          ]);

        // Parse memory
        const memLines = mem.stdout.split("\n");
        const memTotal =
          memLines.find((l) => l.startsWith("MemTotal"))?.replace(/\s+/g, " ") ?? "N/A";
        const memAvail =
          memLines.find((l) => l.startsWith("MemAvailable"))?.replace(/\s+/g, " ") ?? "N/A";

        const lines = [
          "📱 Emulator Status",
          "═".repeat(55),
          `Device Serial : ${targetDevice.serial}`,
          `State         : ${targetDevice.state}`,
          "─".repeat(55),
          "🖥️  SISTEM",
          `  Model   : ${model.stdout.trim()}`,
          `  Android : ${android.stdout.trim()} (API ${sdk.stdout.trim()})`,
          `  Uptime  : ${uptime.stdout.trim()}`,
          "",
          "💾 MEMORI",
          `  ${memTotal}`,
          `  ${memAvail}`,
          "",
          "💿 STORAGE (/data)",
          `  ${storage.stdout.trim()}`,
          "",
          "🖥️  DISPLAY",
          `  ${display.stdout.trim() || "Info tidak tersedia"}`,
        ];

        return { content: [{ type: "text", text: lines.join("\n") }] };
      } catch (error) {
        return {
          content: [
            { type: "text", text: formatToolError("idx_emulator_status", error) },
          ],
        };
      }
    }
  );

  // ── A4. idx_install_apk ───────────────────────────────────────────────────
  server.tool(
    "idx_install_apk",
    "Install APK ke emulator IDX. Otomatis mendeteksi emulator yang " +
      "terkoneksi jika device_serial tidak diisi.",
    {
      apk_path: z
        .string()
        .describe("Path lokal file APK yang akan diinstall"),
      device_serial: z
        .string()
        .optional()
        .describe("Serial device/emulator target"),
      replace_existing: z
        .boolean()
        .default(true)
        .describe("Ganti jika sudah terinstall (-r flag)"),
      grant_permissions: z
        .boolean()
        .default(true)
        .describe("Grant semua permission runtime otomatis (-g flag)"),
      launch_after: z
        .boolean()
        .default(false)
        .describe("Launch aplikasi setelah install"),
      package_name: z
        .string()
        .optional()
        .describe("Package name untuk launch (diperlukan jika launch_after=true)"),
    },
    async ({
      apk_path,
      device_serial,
      replace_existing,
      grant_permissions,
      launch_after,
      package_name,
    }) => {
      try {
        const resolvedApk = path.resolve(apk_path);
        try {
          await fs.access(resolvedApk);
        } catch {
          return {
            content: [
              { type: "text", text: `❌ File APK tidak ditemukan: ${resolvedApk}` },
            ],
          };
        }

        const devices = await getConnectedDevicesList();
        if (devices.length === 0) {
          return {
            content: [
              {
                type: "text",
                text:
                  "❌ Tidak ada device/emulator terkoneksi.\n" +
                  "Jalankan idx_detect_emulator atau idx_connect_emulator terlebih dahulu.",
              },
            ],
          };
        }

        const flag = device_serial ? `-s ${device_serial}` : "";
        const flags = [
          replace_existing ? "-r" : "",
          grant_permissions ? "-g" : "",
        ]
          .filter(Boolean)
          .join(" ");

        const stat = await fs.stat(resolvedApk);
        const sizeMb = (stat.size / (1024 * 1024)).toFixed(2);

        const lines = [
          "📦 Install APK ke Emulator",
          "─".repeat(55),
          `APK    : ${resolvedApk}`,
          `Size   : ${sizeMb} MB`,
          `Device : ${device_serial ?? devices[0]?.serial ?? "default"}`,
          "⏳ Installing...",
        ];

        const installResult = await runAdbCommand(
          `adb ${flag} install ${flags} "${resolvedApk}"`,
          undefined,
          120000
        );

        if (
          installResult.exitCode !== 0 ||
          installResult.stdout.includes("Failure") ||
          installResult.stderr.includes("Failure")
        ) {
          const errMsg =
            installResult.stdout + "\n" + installResult.stderr;
          lines.push("");
          lines.push(`❌ Install GAGAL:`);
          lines.push(extractStackTrace(errMsg));

          // Common error hints
          if (errMsg.includes("INSTALL_FAILED_OLDER_SDK")) {
            lines.push(
              "\n💡 APK membutuhkan API level lebih tinggi dari emulator ini."
            );
          } else if (errMsg.includes("INSTALL_FAILED_UPDATE_INCOMPATIBLE")) {
            lines.push(
              "\n💡 Uninstall dulu versi lama: adb uninstall <package_name>"
            );
          } else if (errMsg.includes("INSTALL_FAILED_NO_MATCHING_ABIS")) {
            lines.push(
              "\n💡 Build APK yang kompatibel dengan arsitektur emulator (x86/x86_64)."
            );
          }
        } else {
          lines.push("✅ Install BERHASIL!");

          if (launch_after && package_name) {
            lines.push("🚀 Launching aplikasi...");
            const launchResult = await runAdbCommand(
              `adb ${flag} shell monkey -p ${package_name} -c android.intent.category.LAUNCHER 1`,
              undefined,
              15000
            );
            if (launchResult.exitCode === 0) {
              lines.push(`✅ Aplikasi ${package_name} dilaunched.`);
            } else {
              lines.push(
                `⚠️  Launch gagal: ${launchResult.stderr.trim()}`
              );
            }
          }
        }

        return { content: [{ type: "text", text: lines.join("\n") }] };
      } catch (error) {
        return {
          content: [
            { type: "text", text: formatToolError("idx_install_apk", error) },
          ],
        };
      }
    }
  );

  // ════════════════════════════════════════════════════════════════════════════
  // BAGIAN B — FIREBASE TEST LAB
  // ════════════════════════════════════════════════════════════════════════════

  // ── B1. ftl_run_test ──────────────────────────────────────────────────────
  server.tool(
    "ftl_run_test",
    "Upload APK dan jalankan test di Firebase Test Lab. " +
      "Mendukung Robo Test (otomatis, tanpa test code) dan " +
      "Instrumentation Test (dengan Espresso/JUnit). " +
      "Membutuhkan gcloud CLI sudah login dan project dikonfigurasi.",
    {
      project_id: z
        .string()
        .describe("Firebase/GCP Project ID, misal 'my-app-12345'"),
      apk_path: z
        .string()
        .describe("Path ke APK yang akan ditest"),
      test_type: z
        .enum(["robo", "instrumentation"])
        .default("robo")
        .describe(
          "Tipe test: 'robo' = otomatis tanpa kode test, " +
            "'instrumentation' = Espresso/JUnit test"
        ),
      test_apk_path: z
        .string()
        .optional()
        .describe("Path ke test APK (wajib untuk instrumentation test)"),
      device_model: z
        .string()
        .default("Pixel6")
        .describe(
          "Model device Test Lab. Gunakan ftl_list_devices untuk daftar lengkap. " +
            "Contoh: 'Pixel6', 'Pixel4', 'NexusLowRes'"
        ),
      android_version: z
        .string()
        .default("33")
        .describe("API level Android. Contoh: '33' (Android 13), '31' (Android 12)"),
      locale: z
        .string()
        .default("id_ID")
        .describe("Locale/bahasa (default: id_ID)"),
      orientation: z
        .enum(["portrait", "landscape"])
        .default("portrait")
        .describe("Orientasi layar"),
      timeout_minutes: z
        .number()
        .int()
        .min(1)
        .max(60)
        .default(10)
        .describe("Timeout test (menit, default: 10)"),
      robo_directives: z
        .string()
        .optional()
        .describe(
          "Robo directives untuk isi form otomatis. Format: 'field_resource_id:value'. " +
            "Contoh: 'username:testuser,password:test123'"
        ),
      results_bucket: z
        .string()
        .optional()
        .describe("GCS bucket untuk hasil. Default: otomatis oleh Firebase."),
      wait_for_results: z
        .boolean()
        .default(true)
        .describe("Tunggu test selesai (default: true). False = fire and forget."),
      results_dir: z
        .string()
        .default("./ftl_results")
        .describe("Direktori lokal untuk download hasil"),
    },
    async ({
      project_id,
      apk_path,
      test_type,
      test_apk_path,
      device_model,
      android_version,
      locale,
      orientation,
      timeout_minutes,
      robo_directives,
      results_bucket,
      wait_for_results,
      results_dir,
    }) => {
      try {
        if (!(await isGcloudAvailable())) {
          return {
            content: [
              {
                type: "text",
                text:
                  "❌ gcloud CLI tidak tersedia.\n\n" +
                  "Install di IDX dengan:\n" +
                  "  curl https://sdk.cloud.google.com | bash\n" +
                  "  exec -l $SHELL\n" +
                  "  gcloud init\n" +
                  "  gcloud auth login\n" +
                  "  gcloud config set project " + project_id,
              },
            ],
          };
        }

        const resolvedApk = path.resolve(apk_path);
        try {
          await fs.access(resolvedApk);
        } catch {
          return {
            content: [
              { type: "text", text: `❌ APK tidak ditemukan: ${resolvedApk}` },
            ],
          };
        }

        const lines: string[] = [
          "🔥 Firebase Test Lab — Menjalankan Test",
          "═".repeat(55),
          `Project    : ${project_id}`,
          `Test Type  : ${test_type}`,
          `APK        : ${path.basename(resolvedApk)}`,
          `Device     : ${device_model} (API ${android_version})`,
          `Locale     : ${locale} | ${orientation}`,
          `Timeout    : ${timeout_minutes} menit`,
          "─".repeat(55),
          "📤 Uploading dan menjalankan test...",
        ];

        // Build gcloud command
        const gcloudArgs = [
          `gcloud firebase test android run`,
          `--project "${project_id}"`,
          `--type ${test_type}`,
          `--app "${resolvedApk}"`,
          `--device model=${device_model},version=${android_version},locale=${locale},orientation=${orientation}`,
          `--timeout ${timeout_minutes}m`,
          `--format=json`,
        ];

        if (test_type === "instrumentation" && test_apk_path) {
          gcloudArgs.push(`--test "${path.resolve(test_apk_path)}"`);
        }

        if (robo_directives) {
          const directives = robo_directives
            .split(",")
            .map((d) => {
              const [id, val] = d.trim().split(":");
              return `--robo-directives text:${id}=${val}`;
            })
            .join(" ");
          gcloudArgs.push(directives);
        }

        if (results_bucket) {
          gcloudArgs.push(`--results-bucket "${results_bucket}"`);
        }

        const testResult = await runCommand(
          gcloudArgs.join(" "),
          undefined,
          (timeout_minutes + 5) * 60 * 1000
        );

        if (testResult.exitCode !== 0) {
          lines.push("");
          lines.push("❌ Test gagal dijalankan:");
          lines.push(testResult.stderr.slice(0, 3000));
          return { content: [{ type: "text", text: lines.join("\n") }] };
        }

        // Parse hasil JSON dari gcloud
        let testData: Record<string, unknown> = {};
        try {
          // gcloud output bisa campuran text + JSON
          const jsonMatch = testResult.stdout.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            testData = JSON.parse(jsonMatch[0]);
          }
        } catch {
          // Output non-JSON, teruskan sebagai text
        }

        lines.push("");
        lines.push("📋 Hasil Test:");

        const testState =
          (testData["@type"] as string)?.includes("TestMatrix")
            ? "submitted"
            : "unknown";

        lines.push(`   Status  : ${testState}`);

        if (testResult.stdout.includes("Passed")) lines.push("   ✅ Test PASSED");
        if (testResult.stdout.includes("Failed")) lines.push("   ❌ Test FAILED");
        if (testResult.stdout.includes("Skipped")) lines.push("   ⏭️  Test SKIPPED");

        // Extract GCS results URL
        const gcsMatch = testResult.stdout.match(/gs:\/\/[^\s]+/);
        const webMatch = testResult.stdout.match(
          /https:\/\/console\.firebase\.google\.com[^\s]+/
        );

        if (gcsMatch) {
          lines.push(`   GCS     : ${gcsMatch[0]}`);
        }
        if (webMatch) {
          lines.push(`   Console : ${webMatch[0]}`);
        }

        lines.push("");
        lines.push("📜 Raw Output:");
        lines.push(truncateOutput(testResult.stdout, 5000));

        return { content: [{ type: "text", text: lines.join("\n") }] };
      } catch (error) {
        return {
          content: [
            { type: "text", text: formatToolError("ftl_run_test", error) },
          ],
        };
      }
    }
  );

  // ── B2. ftl_list_devices ──────────────────────────────────────────────────
  server.tool(
    "ftl_list_devices",
    "Tampilkan daftar device model yang tersedia di Firebase Test Lab " +
      "beserta API level yang didukung. Berguna untuk memilih device target test.",
    {
      project_id: z.string().describe("Firebase/GCP Project ID"),
      filter_model: z
        .string()
        .optional()
        .describe("Filter nama model, misal 'Pixel' atau 'Samsung'"),
    },
    async ({ project_id, filter_model }) => {
      try {
        if (!(await isGcloudAvailable())) {
          return {
            content: [
              { type: "text", text: "❌ gcloud CLI tidak tersedia." },
            ],
          };
        }

        const result = await runCommand(
          `gcloud firebase test android models list --project "${project_id}" --format="table(id,name,supportedVersionIds,tags)"`,
          undefined,
          30000
        );

        if (result.exitCode !== 0) {
          return {
            content: [
              {
                type: "text",
                text: `❌ Gagal mengambil daftar device:\n${result.stderr}`,
              },
            ],
          };
        }

        let output = result.stdout;
        if (filter_model) {
          const lines = output.split("\n");
          output = lines
            .filter(
              (l) =>
                l.includes("ID") ||
                l.toLowerCase().includes(filter_model.toLowerCase())
            )
            .join("\n");
        }

        return {
          content: [
            {
              type: "text",
              text:
                "📱 Firebase Test Lab — Available Devices\n" +
                "─".repeat(55) +
                "\n" +
                output +
                "\n\n💡 Gunakan kolom 'ID' untuk parameter 'device_model' di ftl_run_test.",
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            { type: "text", text: formatToolError("ftl_list_devices", error) },
          ],
        };
      }
    }
  );

  // ── B3. ftl_download_results ──────────────────────────────────────────────
  server.tool(
    "ftl_download_results",
    "Download hasil test dari Firebase Test Lab: screenshot, video, logcat, " +
      "dan test report XML dari Google Cloud Storage.",
    {
      gcs_path: z
        .string()
        .describe(
          "Path GCS hasil test. Format: 'gs://bucket-name/path/to/results'. " +
            "Dapatkan dari output ftl_run_test."
        ),
      output_dir: z
        .string()
        .default("./ftl_results")
        .describe("Direktori lokal untuk menyimpan hasil"),
      download_types: z
        .array(
          z.enum([
            "screenshots",
            "logcat",
            "video",
            "report_xml",
            "report_json",
            "all",
          ])
        )
        .default(["screenshots", "logcat", "report_xml"])
        .describe("Jenis file yang didownload"),
    },
    async ({ gcs_path, output_dir, download_types }) => {
      try {
        if (!(await isGcloudAvailable())) {
          return {
            content: [
              { type: "text", text: "❌ gcloud CLI tidak tersedia." },
            ],
          };
        }

        const resolvedOutput = path.resolve(output_dir);
        await ensureDir(resolvedOutput);

        const downloadAll = download_types.includes("all");
        const lines: string[] = [
          "📥 Download Firebase Test Lab Results",
          "─".repeat(55),
          `GCS Source : ${gcs_path}`,
          `Output dir : ${resolvedOutput}`,
          "",
        ];

        const filePatterns: Record<string, string> = {
          screenshots: "*.png",
          logcat: "logcat",
          video: "*.mp4",
          report_xml: "test_result_*.xml",
          report_json: "*.json",
        };

        const downloadedFiles: string[] = [];

        for (const [type, pattern] of Object.entries(filePatterns)) {
          if (!downloadAll && !download_types.includes(type as typeof download_types[0])) {
            continue;
          }

          const typeDir = path.join(resolvedOutput, type);
          await ensureDir(typeDir);

          const gcsSource = `${gcs_path.replace(/\/$/, "")}/**/${pattern}`;
          lines.push(`📂 Downloading ${type} (${pattern})...`);

          const dlResult = await runCommand(
            `gsutil -m cp -r "${gcsSource}" "${typeDir}/" 2>&1`,
            undefined,
            120000
          );

          if (dlResult.exitCode === 0 || dlResult.stdout.includes("Copying")) {
            const files = await fs.readdir(typeDir).catch(() => []);
            lines.push(
              `   ✅ ${files.length} file(s) didownload ke ${typeDir}`
            );
            downloadedFiles.push(...files.map((f) => path.join(typeDir, f)));
          } else if (dlResult.stderr.includes("No URLs matched")) {
            lines.push(`   ⬜ Tidak ada file ${type} ditemukan`);
          } else {
            lines.push(`   ⚠️  ${dlResult.stderr.slice(0, 200)}`);
          }
        }

        lines.push("");
        lines.push(
          `✅ Download selesai. Total: ${downloadedFiles.length} file(s)`
        );
        lines.push(`📁 Hasil tersimpan di: ${resolvedOutput}`);

        return { content: [{ type: "text", text: lines.join("\n") }] };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: formatToolError("ftl_download_results", error),
            },
          ],
        };
      }
    }
  );

  // ── B4. ftl_parse_report ──────────────────────────────────────────────────
  server.tool(
    "ftl_parse_report",
    "Parse dan tampilkan hasil test report dari Firebase Test Lab. " +
      "Mendukung format XML (JUnit) dan JSON. " +
      "Memberikan ringkasan: passed/failed/skipped, waktu eksekusi, error messages.",
    {
      report_path: z
        .string()
        .describe(
          "Path ke file report. Bisa XML (test_result_*.xml) atau JSON."
        ),
      show_failures_only: z
        .boolean()
        .default(false)
        .describe("Hanya tampilkan test yang gagal"),
    },
    async ({ report_path, show_failures_only }) => {
      try {
        const resolvedPath = path.resolve(report_path);
        const content = await fs.readFile(resolvedPath, "utf-8");
        const ext = path.extname(resolvedPath).toLowerCase();

        const lines: string[] = [
          "📋 Firebase Test Lab — Test Report",
          "═".repeat(55),
          `File: ${resolvedPath}`,
          "─".repeat(55),
        ];

        if (ext === ".xml") {
          // Parse JUnit XML
          const suiteMatch = content.match(
            /<testsuite[^>]*name="([^"]*)"[^>]*tests="(\d+)"[^>]*failures="(\d+)"[^>]*errors="(\d+)"[^>]*skipped="(\d+)"[^>]*time="([^"]*)"/
          );

          if (suiteMatch) {
            const [, name, tests, failures, errors, skipped, time] =
              suiteMatch;
            const passed =
              parseInt(tests ?? "0") -
              parseInt(failures ?? "0") -
              parseInt(errors ?? "0") -
              parseInt(skipped ?? "0");

            lines.push(`📦 Test Suite: ${name}`);
            lines.push(`⏱️  Waktu    : ${parseFloat(time ?? "0").toFixed(2)}s`);
            lines.push("─".repeat(55));
            lines.push(`✅ Passed  : ${passed}`);
            lines.push(`❌ Failed  : ${failures}`);
            lines.push(`💥 Errors  : ${errors}`);
            lines.push(`⏭️  Skipped : ${skipped}`);
            lines.push(`📊 Total   : ${tests}`);
            lines.push("─".repeat(55));
          }

          // Extract individual test cases
          const testCasePattern =
            /<testcase[^>]*name="([^"]*)"[^>]*classname="([^"]*)"[^>]*time="([^"]*)"[^>]*(?:\/>|>([\s\S]*?)<\/testcase>)/g;
          let match;
          const testCases: Array<{
            name: string;
            class: string;
            time: string;
            status: "pass" | "fail" | "skip";
            message?: string;
          }> = [];

          while ((match = testCasePattern.exec(content)) !== null) {
            const [, name, className, time, body] = match;
            let status: "pass" | "fail" | "skip" = "pass";
            let message: string | undefined;

            if (body?.includes("<failure")) {
              status = "fail";
              const msgMatch = body.match(/<failure[^>]*message="([^"]*)"/);
              message = msgMatch?.[1] ?? body.slice(0, 300);
            } else if (body?.includes("<skipped")) {
              status = "skip";
            }

            testCases.push({
              name: name ?? "",
              class: className ?? "",
              time: time ?? "0",
              status,
              message,
            });
          }

          const toShow = show_failures_only
            ? testCases.filter((tc) => tc.status === "fail")
            : testCases;

          if (toShow.length > 0) {
            lines.push("🧪 TEST CASES:");
            toShow.forEach((tc) => {
              const icon =
                tc.status === "pass"
                  ? "✅"
                  : tc.status === "fail"
                  ? "❌"
                  : "⏭️ ";
              lines.push(`  ${icon} ${tc.class}.${tc.name} (${tc.time}s)`);
              if (tc.message) {
                lines.push(
                  `     ↳ ${tc.message.slice(0, 200).replace(/\n/g, " ")}`
                );
              }
            });
          }
        } else if (ext === ".json") {
          // Parse JSON report
          try {
            const json = JSON.parse(content);
            lines.push(JSON.stringify(json, null, 2).slice(0, 10000));
          } catch {
            lines.push(content.slice(0, 5000));
          }
        } else {
          lines.push(content.slice(0, 5000));
        }

        return { content: [{ type: "text", text: lines.join("\n") }] };
      } catch (error) {
        return {
          content: [
            { type: "text", text: formatToolError("ftl_parse_report", error) },
          ],
        };
      }
    }
  );

  // ════════════════════════════════════════════════════════════════════════════
  // BAGIAN C — UI SCRAPING VIA EMULATOR (tanpa physical device)
  // ════════════════════════════════════════════════════════════════════════════

  // ═══════════════════════════════════════════════════════════════════════════
  // HEADLESS SCREENSHOT HELPERS
  // ═══════════════════════════════════════════════════════════════════════════

  /** Generate ASCII art representation from UI bounds */
  function generateAsciiVisual(nodes: Array<{
    class: string;
    resourceId: string;
    text: string;
    contentDesc: string;
    clickable: boolean;
    enabled: boolean;
    bounds: string;
    isInput: boolean;
  }>, screenWidth = 1080, screenHeight = 1920): string {
    const asciiWidth = 60;
    const asciiHeight = 30;
    
    // Create empty grid
    const grid: string[][] = Array(asciiHeight).fill(null).map(() => 
      Array(asciiWidth).fill(' ')
    );
    
    // Scale factor
    const scaleX = asciiWidth / screenWidth;
    const scaleY = asciiHeight / screenHeight;
    
    // Draw border
    for (let x = 0; x < asciiWidth; x++) {
      grid[0][x] = '─';
      grid[asciiHeight - 1][x] = '─';
    }
    for (let y = 0; y < asciiHeight; y++) {
      grid[y][0] = '│';
      grid[y][asciiWidth - 1] = '│';
    }
    grid[0][0] = '┌';
    grid[0][asciiWidth - 1] = '┐';
    grid[asciiHeight - 1][0] = '└';
    grid[asciiHeight - 1][asciiWidth - 1] = '┘';
    
    // Draw interactive elements
    nodes.forEach((node, idx) => {
      if (!node.enabled) return;
      
      const boundsMatch = node.bounds.match(/\[(\d+),(\d+)\]\[(\d+),(\d+)\]/);
      if (!boundsMatch) return;
      
      const [, x1, y1, x2, y2] = boundsMatch.map(Number);
      
      // Scale to ASCII
      const ax1 = Math.max(1, Math.floor(x1 * scaleX));
      const ay1 = Math.max(1, Math.floor(y1 * scaleY));
      const ax2 = Math.min(asciiWidth - 2, Math.ceil(x2 * scaleX));
      const ay2 = Math.min(asciiHeight - 2, Math.ceil(y2 * scaleY));
      
      // Skip very small elements
      if (ax2 - ax1 < 2 || ay2 - ay1 < 1) return;
      
      const char = node.isInput ? '▢' : node.clickable ? '◯' : '□';
      const label = (node.text || node.contentDesc || '').slice(0, ax2 - ax1 - 1);
      
      // Draw element box
      for (let y = ay1; y <= ay2 && y < asciiHeight - 1; y++) {
        for (let x = ax1; x <= ax2 && x < asciiWidth - 1; x++) {
          if (y === ay1 || y === ay2) {
            grid[y][x] = '─';
          } else if (x === ax1 || x === ax2) {
            grid[y][x] = '│';
          } else if (y === ay1 + 1 && x === ax1 + 1 && label) {
            // Place text label
            for (let i = 0; i < label.length && x + i < ax2; i++) {
              grid[y][x + i] = label[i];
            }
          } else if (grid[y][x] === ' ') {
            grid[y][x] = char;
          }
        }
      }
      
      // Corners
      if (ay1 < asciiHeight - 1 && ax1 < asciiWidth - 1) grid[ay1][ax1] = '┌';
      if (ay1 < asciiHeight - 1 && ax2 < asciiWidth - 1) grid[ay1][ax2] = '┐';
      if (ay2 < asciiHeight - 1 && ax1 < asciiWidth - 1) grid[ay2][ax1] = '└';
      if (ay2 < asciiHeight - 1 && ax2 < asciiWidth - 1) grid[ay2][ax2] = '┘';
    });
    
    return '\n' + grid.map(row => row.join('')).join('\n') + '\n';
  }

  // ── C1. emulator_screenshot ───────────────────────────────────────────────
  server.tool(
    "emulator_screenshot",
    "Ambil screenshot dari emulator yang terkoneksi via ADB. " +
      "Alternatif utama saat tidak ada physical device. " +
      "Screenshot disimpan lokal dan path-nya dikembalikan. " +
      "✨ v5.3 UPDATE: Auto-fallback ke UI dump + ASCII visual untuk headless emulator.",
    {
      device_serial: z
        .string()
        .optional()
        .describe("Serial device (misal 'localhost:5554')"),
      output_path: z
        .string()
        .optional()
        .describe("Path output PNG. Default: /tmp/mcp-emulator/screenshot_<ts>.png"),
      display_id: z
        .number()
        .int()
        .optional()
        .describe("Display ID (opsional, default: auto-detect). Di IDX biasanya skip ini."),
      fallback_to_ui: z
        .boolean()
        .default(true)
        .describe("Fallback ke UI dump + ASCII visual jika headless (default: true)"),
    },
    async ({ device_serial, output_path, display_id, fallback_to_ui }) => {
      try {
        const devices = await getConnectedDevicesList();
        if (devices.length === 0) {
          return {
            content: [
              {
                type: "text",
                text:
                  "❌ Tidak ada device/emulator terkoneksi.\n" +
                  "Gunakan idx_detect_emulator terlebih dahulu.",
              },
            ],
          };
        }

        const flag = device_serial ? `-s ${device_serial}` : "";
        const ssDir = path.join(os.tmpdir(), "mcp-emulator");
        await ensureDir(ssDir);

        const timestamp = Date.now();
        const localPath =
          output_path ?? path.join(ssDir, `screenshot_${timestamp}.png`);
        const remotePath = `/sdcard/screenshot_${timestamp}.png`;

        // Wake up device first (emulator might be asleep)
        await runAdbCommand(`adb ${flag} shell input keyevent KEYCODE_WAKEUP`, undefined, 3000);
        await delay(300);
        
        // Try to unlock screen if locked
        await runAdbCommand(`adb ${flag} shell input keyevent 82`, undefined, 3000);
        await delay(300);

        // Method 1: Try exec-out screencap (direct to stdout, no temp file needed)
        let capSuccess = false;
        
        const execOutResult = await runAdbCommand(
          `adb ${flag} exec-out screencap -p`,
          undefined,
          15000
        );
        
        if (execOutResult.exitCode === 0 && execOutResult.stdout.length > 100) {
          try {
            const buffer = Buffer.from(execOutResult.stdout, 'binary');
            await fs.writeFile(localPath, buffer);
            capSuccess = true;
          } catch {
            capSuccess = false;
          }
        }
        
        // Method 2: Fallback to shell screencap with temp file
        if (!capSuccess) {
          let capResult = await runAdbCommand(
            `adb ${flag} shell screencap -p ${remotePath}`,
            undefined,
            15000
          );

          if (capResult.exitCode === 0) {
            const pullResult = await runAdbCommand(
              `adb ${flag} pull ${remotePath} "${localPath}"`,
              undefined,
              15000
            );
            
            await runAdbCommand(`adb ${flag} shell rm ${remotePath}`, undefined, 5000);
            
            if (pullResult.exitCode === 0) {
              capSuccess = true;
            }
          }
        }

        if (capSuccess) {
          const stat = await fs.stat(localPath);
          const sizeKb = (stat.size / 1024).toFixed(1);

          return {
            content: [
              {
                type: "text",
                text:
                  "📸 Emulator Screenshot\n" +
                  "─".repeat(55) +
                  `\nDevice : ${device_serial ?? devices[0]?.serial ?? "default"}` +
                  `\nSaved  : ${localPath}` +
                  `\nSize   : ${sizeKb} KB`,
              },
            ],
          };
        }

        // ═══════════════════════════════════════════════════════════════════════
        // HEADLESS MODE FALLBACK - UI DUMP + ASCII VISUAL
        // ═══════════════════════════════════════════════════════════════════════
        if (fallback_to_ui) {
          const remoteDump = `/sdcard/ui_ss_${timestamp}.xml`;
          const localDump = path.join(os.tmpdir(), `ui_ss_${timestamp}.xml`);
          
          // Try UI dump
          const dumpResult = await runAdbCommand(
            `adb ${flag} shell uiautomator dump --compressed ${remoteDump}`,
            undefined,
            20000
          );
          
          if (dumpResult.exitCode === 0) {
            await runAdbCommand(
              `adb ${flag} pull ${remoteDump} "${localDump}"`,
              undefined,
              10000
            );
            await runAdbCommand(`adb ${flag} shell rm ${remoteDump}`, undefined, 5000);
            
            const xmlContent = await fs.readFile(localDump, "utf-8").catch(() => "");
            await fs.unlink(localDump).catch(() => {});
            
            // Parse nodes for ASCII visual
            const nodePattern =
              /<node[^>]*class="([^"]*)"[^>]*resource-id="([^"]*)"[^>]*text="([^"]*)"[^>]*content-desc="([^"]*)"[^>]*clickable="([^"]*)"[^>]*enabled="([^"]*)"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/g;
            
            const nodes: Array<{
              class: string;
              resourceId: string;
              text: string;
              contentDesc: string;
              clickable: boolean;
              enabled: boolean;
              bounds: string;
              isInput: boolean;
            }> = [];
            
            let match;
            while ((match = nodePattern.exec(xmlContent)) !== null) {
              const [, cls, resourceId, text, contentDesc, clickable, enabled, x1, y1, x2, y2] = match;
              const isInput = (cls?.includes("EditText") || cls?.includes("Input") || cls?.includes("TextField")) ?? false;
              
              nodes.push({
                class: cls?.split(".").pop() ?? cls ?? "",
                resourceId: resourceId ?? "",
                text: text ?? "",
                contentDesc: contentDesc ?? "",
                clickable: clickable === "true",
                enabled: enabled === "true",
                bounds: `[${x1},${y1}][${x2},${y2}]`,
                isInput,
              });
            }
            
            const interactiveNodes = nodes.filter(n => n.clickable && n.enabled);
            const texts = nodes.filter(n => n.text).map(n => n.text).slice(0, 15);
            
            // Generate ASCII visual
            const asciiVisualFallback = generateAsciiVisual(nodes);
            
            return {
              content: [
                {
                  type: "text",
                  text:
                    `📸 Emulator Screenshot (Headless Mode - ASCII Visual)\n` +
                    `═`.repeat(55) + `\n` +
                    `Device : ${device_serial ?? devices[0]?.serial ?? "default"}\n` +
                    `Mode   : 🧠 Headless (UI Dump + ASCII Visual)\n` +
                    `─`.repeat(55) + `\n\n` +
                    `🖼️  LAYOUT VISUAL (ASCII):\n${asciiVisualFallback}\n\n` +
                    `📊 STATISTIK:\n` +
                    `   Total nodes    : ${nodes.length}\n` +
                    `   Interactive    : ${interactiveNodes.length}\n` +
                    `   Text elements  : ${nodes.filter(n => n.text).length}\n\n` +
                    `💬 TEKS TERLIHAT:\n` +
                    (texts.length > 0 ? texts.map(t => `   • ${t}`).join('\n') : '   (tidak ada teks)') +
                    `\n\n` +
                    `─`.repeat(55) + `\n` +
                    `💡 Tips: Gunakan 'emulator_ui_dump' untuk detail lengkap\n` +
                    `        atau 'ftl_run_test' untuk screenshot nyata di Test Lab.`,
                },
              ],
            };
          }
        }

        // Final fallback - error message
        return {
          content: [
            {
              type: "text",
              text:
                `❌ Screenshot gagal - Emulator dalam mode headless\n` +
                `═`.repeat(55) + `\n\n` +
                `💡 Penjelasan:\n` +
                `   Emulator berjalan tanpa display fisik (headless mode).\n\n` +
                `🔧 Alternatif:\n` +
                `   1. emulator_ui_dump - Analisis struktur UI\n` +
                `   2. adb_logcat - Monitoring log aplikasi\n` +
                `   3. ftl_run_test - Screenshot di device cloud`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: formatToolError("emulator_screenshot", error),
            },
          ],
        };
      }
    }
  );

  // ── C2. emulator_ui_dump ──────────────────────────────────────────────────
  server.tool(
    "emulator_ui_dump",
    "Dump hierarki UI dari emulator via uiautomator dan parse menjadi " +
      "ringkasan yang mudah dibaca AI. Ekstrak: elemen interaktif, " +
      "teks yang terlihat, resource ID, bounds, dan struktur layout.",
    {
      device_serial: z
        .string()
        .optional()
        .describe("Serial device/emulator"),
      parse_mode: z
        .enum(["summary", "interactive_only", "full_xml", "text_only", "ascii_visual"])
        .default("summary")
        .describe(
          "Mode output: summary=ringkasan AI-friendly, " +
            "interactive_only=hanya elemen yang bisa diklik/diketik, " +
            "full_xml=XML mentah, text_only=teks terlihat saja, " +
            "ascii_visual=visualisasi ASCII art dari layout"
        ),
      package_filter: z
        .string()
        .optional()
        .describe("Filter resource ID by package, misal 'com.example.app'"),
    },
    async ({ device_serial, parse_mode, package_filter }) => {
      try {
        const devices = await getConnectedDevicesList();
        if (devices.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: "❌ Tidak ada device/emulator terkoneksi.",
              },
            ],
          };
        }

        const flag = device_serial ? `-s ${device_serial}` : "";
        const remotePath = "/sdcard/ui_dump.xml";
        const localPath = path.join(os.tmpdir(), `ui_dump_${Date.now()}.xml`);

        // Wake up device first
        await runAdbCommand(`adb ${flag} shell input keyevent KEYCODE_WAKEUP`, undefined, 3000);
        await delay(200);
        
        // Try to unlock
        await runAdbCommand(`adb ${flag} shell input keyevent 82`, undefined, 3000);
        await delay(300);

        // Dump UI with retry
        let dumpResult = await runAdbCommand(
          `adb ${flag} shell uiautomator dump --compressed ${remotePath}`,
          undefined,
          30000
        );

        // Retry if failed
        if (dumpResult.exitCode !== 0) {
          await delay(1000);
          dumpResult = await runAdbCommand(
            `adb ${flag} shell uiautomator dump ${remotePath}`,
            undefined,
            30000
          );
        }

        if (dumpResult.exitCode !== 0) {
          // Try alternative: check if screen is on
          const screenState = await runAdbCommand(
            `adb ${flag} shell dumpsys power | grep "mWakefulness"`,
            undefined,
            5000
          );
          
          return {
            content: [
              {
                type: "text",
                text:
                  `❌ UI dump gagal:\n${dumpResult.stderr}\n\n` +
                  `💡 Troubleshooting:\n` +
                  `   • Screen state: ${screenState.stdout || 'unknown'}\n` +
                  `   • Pastikan emulator sudah boot (sys.boot_completed = 1)\n` +
                  `   • Coba wake up manual: adb shell input keyevent KEYCODE_WAKEUP\n` +
                  `   • Cek: adb shell dumpsys window | grep mCurrentFocus`,
              },
            ],
          };
        }

        // Pull XML
        await runAdbCommand(
          `adb ${flag} pull ${remotePath} "${localPath}"`,
          undefined,
          15000
        );
        await runAdbCommand(
          `adb ${flag} shell rm ${remotePath}`,
          undefined,
          5000
        );

        const xmlContent = await fs.readFile(localPath, "utf-8");

        if (parse_mode === "full_xml") {
          return {
            content: [
              { type: "text", text: truncateOutput(xmlContent, 30000) },
            ],
          };
        }

        // Parse XML untuk semua mode
        const nodePattern =
          /<node[^>]*class="([^"]*)"[^>]*resource-id="([^"]*)"[^>]*text="([^"]*)"[^>]*content-desc="([^"]*)"[^>]*checkable="([^"]*)"[^>]*checked="([^"]*)"[^>]*clickable="([^"]*)"[^>]*enabled="([^"]*)"[^>]*focusable="([^"]*)"[^>]*focused="([^"]*)"[^>]*scrollable="([^"]*)"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/g;

        const nodes: Array<{
          class: string;
          resourceId: string;
          text: string;
          contentDesc: string;
          clickable: boolean;
          enabled: boolean;
          scrollable: boolean;
          bounds: string;
          isInput: boolean;
        }> = [];

        let match;
        while ((match = nodePattern.exec(xmlContent)) !== null) {
          const [
            ,
            cls,
            resourceId,
            text,
            contentDesc,
            ,
            ,
            clickable,
            enabled,
            ,
            ,
            scrollable,
            x1,
            y1,
            x2,
            y2,
          ] = match;

          // Filter by package if specified
          if (package_filter && resourceId && !resourceId.startsWith(package_filter)) {
            continue;
          }

          const isInput =
            (cls?.includes("EditText") ||
              cls?.includes("Input") ||
              cls?.includes("TextField")) ??
            false;

          nodes.push({
            class: cls?.split(".").pop() ?? cls ?? "",
            resourceId: resourceId ?? "",
            text: text ?? "",
            contentDesc: contentDesc ?? "",
            clickable: clickable === "true",
            enabled: enabled === "true",
            scrollable: scrollable === "true",
            bounds: `[${x1},${y1}][${x2},${y2}]`,
            isInput,
          });
        }

        if (parse_mode === "text_only") {
          const texts = nodes
            .filter((n) => n.text || n.contentDesc)
            .map((n) => n.text || n.contentDesc)
            .filter(Boolean);
          return {
            content: [
              {
                type: "text",
                text:
                  "📝 Teks yang terlihat di layar:\n" +
                  "─".repeat(55) +
                  "\n" +
                  texts.join("\n"),
              },
            ],
          };
        }

        const interactive = nodes.filter(
          (n) => (n.clickable || n.isInput) && n.enabled
        );
        
        // ASCII Visual mode - return early with visual representation
        if (parse_mode === "ascii_visual") {
          const asciiVisual = generateAsciiVisual(nodes);
          return {
            content: [
              {
                type: "text",
                text:
                  `🖼️  UI Layout - ASCII Visual\n` +
                  `═`.repeat(55) + `\n` +
                  `Device : ${device_serial ?? devices[0]?.serial ?? "default"}\n` +
                  `Mode   : ascii_visual\n` +
                  `─`.repeat(55) + `\n` +
                  asciiVisual + `\n` +
                  `─`.repeat(55) + `\n` +
                  `📊 Statistik:\n` +
                  `   Total nodes    : ${nodes.length}\n` +
                  `   Interactive    : ${interactive.length}\n` +
                  `   Input fields   : ${nodes.filter((n) => n.isInput).length}\n\n` +
                  `Legend: ◯ = clickable  ▢ = input  □ = other`,
              },
            ],
          };
        }
        
        const all = parse_mode === "summary" ? nodes : interactive;

        const lines: string[] = [
          "🔍 UI Hierarchy — Emulator",
          "─".repeat(55),
          `Total nodes    : ${nodes.length}`,
          `Interaktif     : ${interactive.length}`,
          `Input fields   : ${nodes.filter((n) => n.isInput).length}`,
          "─".repeat(55),
        ];

        if (parse_mode === "interactive_only" || parse_mode === "summary") {
          if (interactive.length > 0) {
            lines.push("🖱️  ELEMEN INTERAKTIF:");
            interactive.slice(0, 50).forEach((n) => {
              const typeIcon = n.isInput ? "📝" : "🔘";
              const label = n.text || n.contentDesc || n.resourceId || n.class;
              lines.push(
                `  ${typeIcon} [${n.class}] "${label.slice(0, 60)}"` +
                  (n.resourceId ? `\n     id: ${n.resourceId}` : "") +
                  `\n     bounds: ${n.bounds}`
              );
            });
          }
        }

        if (parse_mode === "summary") {
          const texts = nodes
            .filter((n) => n.text && n.text.length > 0)
            .map((n) => n.text)
            .slice(0, 20);
          if (texts.length > 0) {
            lines.push("");
            lines.push("💬 TEKS TERLIHAT:");
            texts.forEach((t) => lines.push(`  • ${t}`));
          }
        }

        return {
          content: [{ type: "text", text: lines.join("\n") }],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: formatToolError("emulator_ui_dump", error),
            },
          ],
        };
      }
    }
  );

  // ── C3. emulator_tap ─────────────────────────────────────────────────────
  // v5.2: Stabilized with retry, verification, and smart waiting
  server.tool(
    "emulator_tap",
    "Tap/klik koordinat atau elemen UI di emulator via ADB input. " +
      "STABILIZED v5.2: Auto-retry, element verification, smart swipe velocity. " +
      "Bisa tap by koordinat X,Y atau by resource-id/text dari UI dump.",
    {
      device_serial: z.string().optional().describe("Serial emulator"),
      action: z
        .enum(["tap", "swipe", "long_press", "tap_by_text", "tap_by_id"])
        .default("tap")
        .describe("Jenis interaksi"),
      x: z.number().optional().describe("Koordinat X (untuk tap/long_press)"),
      y: z.number().optional().describe("Koordinat Y (untuk tap/long_press)"),
      x2: z.number().optional().describe("X tujuan swipe"),
      y2: z.number().optional().describe("Y tujuan swipe"),
      swipe_duration_ms: z.number().int().optional().describe(
        "Durasi swipe (ms). Auto-calculate jika tidak diisi."
      ),
      text: z.string().optional().describe("Teks elemen yang ditap (untuk tap_by_text)"),
      resource_id: z
        .string()
        .optional()
        .describe("Resource ID elemen (untuk tap_by_id, misal 'com.app:id/btn_login')"),
      take_screenshot: z.boolean().default(true),
      verify_tap: z.boolean().default(true).describe(
        "Verifikasi elemen masih ada sebelum tap (untuk tap_by_text)"
      ),
      retry_count: z.number().int().min(1).max(5).default(3).describe(
        "Jumlah retry jika tap gagal (default: 3)"
      ),
    },
    async ({
      device_serial,
      action,
      x,
      y,
      x2,
      y2,
      swipe_duration_ms,
      text,
      resource_id,
      take_screenshot: doScreenshot,
      verify_tap,
      retry_count,
    }) => {
      try {
        const devices = await getConnectedDevicesList();
        if (devices.length === 0) {
          return {
            content: [
              { type: "text", text: "❌ Tidak ada device/emulator terkoneksi." },
            ],
          };
        }

        const flag = device_serial ? `-s ${device_serial}` : "";
        
        // Wake up device before interaction
        await runAdbCommand(`adb ${flag} shell input keyevent KEYCODE_WAKEUP`, undefined, 3000);
        await delay(200);
        // Try unlock
        await runAdbCommand(`adb ${flag} shell input keyevent 82`, undefined, 3000);
        await delay(300);
        let tapX = x;
        let tapY = y;
        let targetText: string | undefined = text;

        // Resolve koordinat untuk tap_by_text / tap_by_id
        if (action === "tap_by_text" || action === "tap_by_id") {
          const searchType = action === "tap_by_text" ? "text" : "resource-id";
          const searchValue = action === "tap_by_text" ? text! : resource_id!;
          
          const elem = await findElementInUi(device_serial, searchType, searchValue);
          
          if (!elem) {
            return {
              content: [
                {
                  type: "text",
                  text:
                    `❌ Elemen tidak ditemukan: ${searchType}="${searchValue}"\n` +
                    "Gunakan emulator_ui_dump untuk lihat elemen yang tersedia.",
                },
              ],
            };
          }
          
          if (!elem.clickable) {
            return {
              content: [
                {
                  type: "text",
                  text: `⚠️ Elemen ditemukan tapi tidak clickable!\n` +
                    `Bounds: ${elem.bounds}\n` +
                    `Coba cari elemen parent yang clickable.`,
                },
              ],
            };
          }
          
          tapX = elem.x;
          tapY = elem.y;
        }

        // Execute action
        let result: { success: boolean; message: string; attempts?: number };
        
        switch (action) {
          case "tap":
          case "tap_by_text":
          case "tap_by_id":
            if (tapX === undefined || tapY === undefined) {
              return {
                content: [{ type: "text", text: "❌ Koordinat x dan y diperlukan untuk tap" }],
              };
            }
            result = await smartTap(
              device_serial, 
              tapX, 
              tapY, 
              verify_tap ? targetText : undefined,
              retry_count
            );
            break;
            
          case "long_press":
            if (tapX === undefined || tapY === undefined) {
              return {
                content: [{ type: "text", text: "❌ Koordinat x dan y diperlukan untuk long_press" }],
              };
            }
            // Long press = swipe to same position with 1000ms duration
            result = await smartSwipe(device_serial, tapX, tapY, tapX, tapY, 1000);
            break;
            
          case "swipe":
            if (!x || !y || !x2 || !y2) {
              return {
                content: [{ type: "text", text: "❌ x, y, x2, y2 diperlukan untuk swipe" }],
              };
            }
            result = await smartSwipe(device_serial, x, y, x2, y2, swipe_duration_ms);
            break;
            
          default:
            return {
              content: [{ type: "text", text: `❌ Action tidak dikenal: ${action}` }],
            };
        }

        // Screenshot after action
        let ssInfo = "";
        if (doScreenshot) {
          await delay(500); // Wait for UI to settle
          const ssDir = path.join(os.tmpdir(), "mcp-emulator");
          await ensureDir(ssDir);
          const ssPath = path.join(ssDir, `tap_${Date.now()}.png`);
          const remoteSs = `/sdcard/ss_${Date.now()}.png`;
          
          try {
            await runAdbCommand(
              `adb ${flag} shell screencap -p ${remoteSs}`,
              undefined,
              10000
            );
            await runAdbCommand(
              `adb ${flag} pull ${remoteSs} "${ssPath}"`,
              undefined,
              10000
            );
            await runAdbCommand(
              `adb ${flag} shell rm ${remoteSs}`,
              undefined,
              5000
            );
            ssInfo = `\n📸 Screenshot: ${ssPath}`;
          } catch {
            ssInfo = "\n📸 Screenshot: (gagal)";
          }
        }

        const statusIcon = result.success ? "✅" : "❌";
        const attemptsInfo = result.attempts ? ` (retry: ${result.attempts}x)` : "";

        return {
          content: [
            {
              type: "text",
              text:
                `${statusIcon} ${action}${attemptsInfo}\n` +
                "─".repeat(55) +
                (tapX !== undefined ? `\nKoord   : (${tapX}, ${tapY})` : "") +
                (text ? `\nTarget  : "${text}"` : "") +
                (resource_id ? `\nID      : ${resource_id}` : "") +
                `\nStatus  : ${result.message}` +
                ssInfo,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            { type: "text", text: formatToolError("emulator_tap", error) },
          ],
        };
      }
    }
  );

  // ── C4. emulator_input_text ───────────────────────────────────────────────
  // v5.2: Stabilized with smart input, chunked typing, and field verification
  server.tool(
    "emulator_input_text",
    "Ketik teks ke field yang sedang fokus di emulator. " +
      "STABILIZED v5.2: Smart field focus, chunked text input, auto-retry. " +
      "Bisa tap ke field dulu lalu ketik.",
    {
      device_serial: z.string().optional(),
      text: z.string().describe("Teks yang diketik"),
      tap_x: z.number().optional().describe("Tap ke koordinat X sebelum ketik"),
      tap_y: z.number().optional().describe("Tap ke koordinat Y sebelum ketik"),
      resource_id: z
        .string()
        .optional()
        .describe("Tap ke elemen by resource-id sebelum ketik (auto-find coordinates)"),
      clear_first: z
        .boolean()
        .default(true)
        .describe("Hapus isi field dulu (Ctrl+A + Del)"),
      press_enter_after: z.boolean().default(false),
      take_screenshot: z.boolean().default(true),
      verify_field_focused: z.boolean().default(true).describe(
        "Verifikasi field fokus sebelum typing"
      ),
    },
    async ({
      device_serial,
      text,
      tap_x,
      tap_y,
      resource_id,
      clear_first,
      press_enter_after,
      take_screenshot: doScreenshot,
      verify_field_focused,
    }) => {
      try {
        const devices = await getConnectedDevicesList();
        if (devices.length === 0) {
          return {
            content: [
              { type: "text", text: "❌ Tidak ada device/emulator terkoneksi." },
            ],
          };
        }

        const flag = device_serial ? `-s ${device_serial}` : "";
        
        // Wake up device before interaction
        await runAdbCommand(`adb ${flag} shell input keyevent KEYCODE_WAKEUP`, undefined, 3000);
        await delay(200);
        await runAdbCommand(`adb ${flag} shell input keyevent 82`, undefined, 3000);
        await delay(300);
        
        const lines: string[] = [
          "⌨️  Input Text (Stabilized v5.2)",
          "─".repeat(55),
          `Text: "${text.slice(0, 50)}${text.length > 50 ? "..." : ""}"`,
          "",
        ];

        // Resolve coordinates if resource_id provided
        let finalTapX = tap_x;
        let finalTapY = tap_y;
        
        if (resource_id && (tap_x === undefined || tap_y === undefined)) {
          lines.push(`🔍 Mencari elemen: ${resource_id}...`);
          const elem = await findElementInUi(device_serial, "resource-id", resource_id);
          
          if (!elem) {
            return {
              content: [
                {
                  type: "text",
                  text: lines.join("\n") + 
                    `\n❌ Elemen tidak ditemukan: ${resource_id}\n` +
                    "Gunakan emulator_ui_dump untuk lihat elemen yang tersedia.",
                },
              ],
            };
          }
          
          finalTapX = elem.x;
          finalTapY = elem.y;
          lines.push(`✅ Elemen ditemukan di (${finalTapX}, ${finalTapY})`);
        }

        // Use smart input function
        const result = await smartInputText(device_serial, text, {
          tapX: finalTapX,
          tapY: finalTapY,
          clearFirst: clear_first,
          pressEnter: press_enter_after,
        });

        if (result.success) {
          lines.push(`✅ ${result.message}`);
        } else {
          lines.push(`❌ ${result.message}`);
          return { content: [{ type: "text", text: lines.join("\n") }] };
        }

        // Screenshot after input
        let ssInfo = "";
        if (doScreenshot) {
          await delay(500);
          const ssDir = path.join(os.tmpdir(), "mcp-emulator");
          await ensureDir(ssDir);
          const ssPath = path.join(ssDir, `input_${Date.now()}.png`);
          const remoteSs = `/sdcard/ssinput_${Date.now()}.png`;
          
          try {
            await runAdbCommand(
              `adb ${flag} shell screencap -p ${remoteSs}`,
              undefined,
              10000
            );
            await runAdbCommand(
              `adb ${flag} pull ${remoteSs} "${ssPath}"`,
              undefined,
              10000
            );
            await runAdbCommand(
              `adb ${flag} shell rm ${remoteSs}`,
              undefined,
              5000
            );
            ssInfo = `\n📸 Screenshot: ${ssPath}`;
          } catch {
            ssInfo = "\n📸 Screenshot: (gagal)";
          }
        }

        lines.push(ssInfo);
        return {
          content: [{ type: "text", text: lines.join("\n") }],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: formatToolError("emulator_input_text", error),
            },
          ],
        };
      }
    }
  );

  // ── C5. emulator_record_screen ────────────────────────────────────────────
  server.tool(
    "emulator_record_screen",
    "Rekam video layar emulator (screenrecord). " +
      "Berguna untuk mendokumentasikan alur UI atau bug yang terjadi.",
    {
      device_serial: z.string().optional(),
      duration_seconds: z
        .number()
        .int()
        .min(1)
        .max(180)
        .default(10)
        .describe("Durasi rekaman (max 180 detik)"),
      output_path: z
        .string()
        .optional()
        .describe("Path output MP4. Default: /tmp/mcp-emulator/record_<ts>.mp4"),
      bit_rate_mbps: z
        .number()
        .min(1)
        .max(8)
        .default(4)
        .describe("Bitrate video dalam Mbps (default: 4)"),
    },
    async ({ device_serial, duration_seconds, output_path, bit_rate_mbps }) => {
      try {
        const devices = await getConnectedDevicesList();
        if (devices.length === 0) {
          return {
            content: [
              { type: "text", text: "❌ Tidak ada device/emulator terkoneksi." },
            ],
          };
        }

        const flag = device_serial ? `-s ${device_serial}` : "";
        const timestamp = Date.now();
        const remoteVideo = `/sdcard/screenrecord_${timestamp}.mp4`;

        const vidDir = path.join(os.tmpdir(), "mcp-emulator");
        await ensureDir(vidDir);
        const localVideo =
          output_path ?? path.join(vidDir, `record_${timestamp}.mp4`);

        // Mulai rekaman (blocking)
        const recordResult = await runAdbCommand(
          `adb ${flag} shell screenrecord --time-limit ${duration_seconds} --bit-rate ${bit_rate_mbps}000000 ${remoteVideo}`,
          undefined,
          (duration_seconds + 10) * 1000
        );

        // Pull video
        await runAdbCommand(
          `adb ${flag} pull ${remoteVideo} "${localVideo}"`,
          undefined,
          30000
        );
        await runAdbCommand(
          `adb ${flag} shell rm ${remoteVideo}`,
          undefined,
          5000
        );

        let stat;
        try {
          stat = await fs.stat(localVideo);
        } catch {
          return {
            content: [
              {
                type: "text",
                text: "❌ Rekaman gagal atau file tidak ditemukan.",
              },
            ],
          };
        }

        const sizeMb = (stat.size / (1024 * 1024)).toFixed(2);

        return {
          content: [
            {
              type: "text",
              text:
                `🎥 Screen Recording Selesai!\n` +
                "─".repeat(55) +
                `\nDurasi  : ${duration_seconds}s` +
                `\nBitrate : ${bit_rate_mbps} Mbps` +
                `\nSaved   : ${localVideo}` +
                `\nSize    : ${sizeMb} MB`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: formatToolError("emulator_record_screen", error),
            },
          ],
        };
      }
    }
  );
}
