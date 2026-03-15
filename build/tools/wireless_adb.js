/**
 * 📡 Wireless ADB Debugging Tools
 * ─────────────────────────────────────────────────────────────────────────────
 * Alternatif scraping & debug Android app tanpa kabel USB, tanpa emulator.
 * Mendukung dua mode koneksi:
 *
 *   • Mode Legacy  (Android 10-)  : USB sekali, lalu `adb tcpip 5555`, cabut kabel
 *   • Mode Modern  (Android 11+)  : Full wireless, pair via QR/kode 6 digit
 *
 * Semua perintah ADB dijalankan via `runAdbCommand` agar terproteksi oleh
 * global ADB mutex — tidak ada race condition meski dipanggil paralel oleh AI.
 *
 * Cara pakai (Android 11+, tanpa USB sama sekali):
 *   1. Buka Settings → Developer Options → Wireless debugging → ON
 *   2. Ketuk "Pair device with pairing code" → catat HOST:PORT dan 6-digit code
 *   3. Panggil `adb_wifi_pair` dengan host:port dan kode
 *   4. Ketuk kembali di Developer Options → catat IP:PORT untuk koneksi
 *   5. Panggil `adb_wifi_connect`
 *   6. Mulai gunakan `adb_wifi_shell`, `adb_wifi_screenshot`, `adb_wifi_ui_dump`
 */
import { z } from "zod";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import { runAdbCommand, formatToolError, ensureDir, truncateOutput, } from "../utils.js";
// ─── Helpers ──────────────────────────────────────────────────────────────────
/**
 * Parse `adb devices` output, return only TCP (wireless) entries.
 */
async function listWirelessDevices() {
    const r = await runAdbCommand("adb devices -l", undefined, 10_000);
    return r.stdout
        .split("\n")
        .slice(1) // skip header "List of devices attached"
        .filter((line) => /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}:\d+/.test(line.trim()))
        .map((line) => {
        const parts = line.trim().split(/\s+/);
        return { address: parts[0] ?? "", state: parts[1] ?? "unknown" };
    })
        .filter((d) => d.address.length > 0);
}
/**
 * Return `-s HOST:PORT` flag if address is provided, empty string otherwise.
 */
function deviceFlag(address) {
    return address ? `-s ${address}` : "";
}
// ─── Tool registration ────────────────────────────────────────────────────────
export function registerWirelessAdbTools(server) {
    // ── 1. adb_wifi_pair ─────────────────────────────────────────────────────
    server.tool("adb_wifi_pair", "Pasangkan (pair) perangkat Android 11+ via wireless debugging tanpa kabel USB. " +
        "Buka Settings → Developer Options → Wireless Debugging → 'Pair device with pairing code'. " +
        "Catat HOST:PORT dan 6-digit pairing code, lalu isi di sini. " +
        "Hanya perlu dilakukan SEKALI per perangkat — selanjutnya cukup adb_wifi_connect.", {
        pair_address: z
            .string()
            .describe("HOST:PORT untuk pairing (berbeda dari port koneksi!). " +
            "Contoh: '192.168.1.5:37891'. Terlihat di layar 'Pair device with pairing code'."),
        pairing_code: z
            .string()
            .min(6)
            .max(6)
            .describe("6-digit pairing code yang terlihat di layar HP. Contoh: '123456'"),
    }, async ({ pair_address, pairing_code }) => {
        try {
            const result = await runAdbCommand(`adb pair ${pair_address} ${pairing_code}`, undefined, 30_000);
            const combined = (result.stdout + result.stderr).trim();
            const success = /successfully paired/i.test(combined) || result.exitCode === 0;
            return {
                content: [
                    {
                        type: "text",
                        text: `${success ? "✅" : "❌"} ADB Pairing — ${pair_address}\n` +
                            `${"─".repeat(55)}\n` +
                            `${combined}\n\n` +
                            (success
                                ? `🎉 Pairing berhasil!\n` +
                                    `Langkah berikutnya:\n` +
                                    `  1. Kembali ke layar 'Wireless debugging' di HP\n` +
                                    `  2. Catat IP Address dan Port (port koneksi, bukan port pairing)\n` +
                                    `  3. Panggil adb_wifi_connect dengan alamat tersebut`
                                : `❌ Pairing gagal. Pastikan:\n` +
                                    `  • Kode 6-digit benar dan belum kedaluwarsa\n` +
                                    `  • HOST:PORT dari 'Pair device with pairing code' (bukan port utama)\n` +
                                    `  • HP dan komputer di jaringan WiFi yang sama`),
                    },
                ],
            };
        }
        catch (error) {
            return {
                content: [{ type: "text", text: formatToolError("adb_wifi_pair", error) }],
            };
        }
    });
    // ── 2. adb_wifi_connect ──────────────────────────────────────────────────
    server.tool("adb_wifi_connect", "Hubungkan ke perangkat Android via wireless ADB. " +
        "Untuk Android 11+: gunakan IP:PORT dari halaman 'Wireless debugging' (setelah pairing). " +
        "Untuk Android 10-: sambungkan USB dulu, jalankan adb_wifi_enable, cabut USB, baru connect.", {
        address: z
            .string()
            .describe("IP:PORT perangkat. Contoh: '192.168.1.5:5555' (Android 10-) " +
            "atau '192.168.1.5:45123' (Android 11+, port acak dari Wireless Debugging)"),
    }, async ({ address }) => {
        try {
            const result = await runAdbCommand(`adb connect ${address}`, undefined, 15_000);
            const combined = (result.stdout + result.stderr).trim();
            const connected = /connected to/i.test(combined) || /already connected/i.test(combined);
            // Verify device state after connect
            const devices = await listWirelessDevices();
            const thisDevice = devices.find((d) => d.address === address);
            return {
                content: [
                    {
                        type: "text",
                        text: `${connected ? "✅" : "❌"} ADB WiFi Connect — ${address}\n` +
                            `${"─".repeat(55)}\n` +
                            `${combined}\n\n` +
                            `📱 Status device: ${thisDevice?.state ?? "tidak ditemukan di daftar"}\n\n` +
                            (connected
                                ? `💡 Sekarang gunakan:\n` +
                                    `  • adb_wifi_shell — jalankan shell command\n` +
                                    `  • adb_wifi_screenshot — ambil screenshot\n` +
                                    `  • adb_wifi_ui_dump — dump UI hierarchy untuk scraping\n` +
                                    `  • adb_run_shell (device="${address}") — tools ADB lainnya`
                                : `❌ Gagal terhubung. Pastikan:\n` +
                                    `  • HP dan komputer di WiFi yang sama\n` +
                                    `  • Wireless debugging masih aktif di Developer Options\n` +
                                    `  • Android 11+: sudah pair dulu via adb_wifi_pair\n` +
                                    `  • Android 10-: jalankan adb_wifi_enable dari USB dulu`),
                    },
                ],
            };
        }
        catch (error) {
            return {
                content: [
                    { type: "text", text: formatToolError("adb_wifi_connect", error) },
                ],
            };
        }
    });
    // ── 3. adb_wifi_enable ───────────────────────────────────────────────────
    server.tool("adb_wifi_enable", "Aktifkan mode TCP/IP pada perangkat yang SAAT INI tersambung via USB (Android 10-). " +
        "Setelah ini, cabut USB dan gunakan adb_wifi_connect dengan IP perangkat. " +
        "Untuk Android 11+, fitur ini tidak diperlukan — gunakan Wireless Debugging langsung.", {
        port: z
            .number()
            .int()
            .min(1024)
            .max(65535)
            .default(5555)
            .describe("Port TCP yang akan dibuka di perangkat (default: 5555)"),
        device_serial: z
            .string()
            .optional()
            .describe("Serial USB device jika ada lebih dari satu. Kosongkan jika hanya ada satu device."),
    }, async ({ port, device_serial }) => {
        try {
            const flag = device_serial ? `-s ${device_serial}` : "";
            // Enable TCP mode
            const r = await runAdbCommand(`adb ${flag} tcpip ${port}`, undefined, 10_000);
            // Get device IP from WiFi interface
            const ipResult = await runAdbCommand(`adb ${flag} shell ip addr show wlan0 | grep 'inet '`, undefined, 8_000);
            const ipMatch = ipResult.stdout.match(/inet\s+(\d+\.\d+\.\d+\.\d+)/);
            const deviceIp = ipMatch?.[1] ?? null;
            const combined = (r.stdout + r.stderr).trim();
            return {
                content: [
                    {
                        type: "text",
                        text: `📡 ADB TCP/IP Mode Enabled\n` +
                            `${"─".repeat(55)}\n` +
                            `Port   : ${port}\n` +
                            `Output : ${combined}\n` +
                            (deviceIp
                                ? `📱 Device IP : ${deviceIp}\n\n` +
                                    `✅ Sekarang:\n` +
                                    `  1. Cabut kabel USB\n` +
                                    `  2. Panggil: adb_wifi_connect(address="${deviceIp}:${port}")`
                                : `\n⚠️  Tidak bisa otomatis baca IP device.\n` +
                                    `  Cek IP di HP: Settings → WiFi → tap jaringan aktif → IP Address\n` +
                                    `  Lalu: adb_wifi_connect(address="<IP>:${port}")`),
                    },
                ],
            };
        }
        catch (error) {
            return {
                content: [
                    { type: "text", text: formatToolError("adb_wifi_enable", error) },
                ],
            };
        }
    });
    // ── 4. adb_wifi_devices ──────────────────────────────────────────────────
    server.tool("adb_wifi_devices", "Tampilkan semua perangkat Android yang terhubung via wireless ADB (TCP/IP). " +
        "Hanya menampilkan koneksi nirkabel, bukan USB.", {}, async () => {
        try {
            const devices = await listWirelessDevices();
            if (devices.length === 0) {
                return {
                    content: [
                        {
                            type: "text",
                            text: `📡 Wireless ADB Devices\n` +
                                `${"─".repeat(55)}\n` +
                                `📭 Tidak ada perangkat wireless yang terhubung.\n\n` +
                                `Cara menghubungkan:\n` +
                                `  Android 11+ : adb_wifi_pair → adb_wifi_connect\n` +
                                `  Android 10- : adb_wifi_enable (via USB) → cabut USB → adb_wifi_connect`,
                        },
                    ],
                };
            }
            const lines = [
                `📡 Wireless ADB Devices (${devices.length})`,
                "═".repeat(55),
            ];
            for (const d of devices) {
                const statusIcon = d.state === "device"
                    ? "✅"
                    : d.state === "offline"
                        ? "🔴"
                        : d.state === "unauthorized"
                            ? "🔒"
                            : "❓";
                lines.push(`${statusIcon} ${d.address}  [${d.state}]`);
            }
            lines.push("");
            lines.push(`💡 Gunakan address (misal "${devices[0]?.address}") sebagai parameter 'address' di tool lain.`);
            return { content: [{ type: "text", text: lines.join("\n") }] };
        }
        catch (error) {
            return {
                content: [
                    { type: "text", text: formatToolError("adb_wifi_devices", error) },
                ],
            };
        }
    });
    // ── 5. adb_wifi_disconnect ───────────────────────────────────────────────
    server.tool("adb_wifi_disconnect", "Putuskan koneksi wireless ADB dari perangkat. " +
        "Kosongkan 'address' untuk memutus SEMUA koneksi wireless sekaligus.", {
        address: z
            .string()
            .optional()
            .describe("IP:PORT yang ingin diputus. Kosongkan untuk disconnect semua wireless device."),
    }, async ({ address }) => {
        try {
            const cmd = address ? `adb disconnect ${address}` : "adb disconnect";
            const result = await runAdbCommand(cmd, undefined, 10_000);
            const combined = (result.stdout + result.stderr).trim();
            return {
                content: [
                    {
                        type: "text",
                        text: `🔌 ADB WiFi Disconnect\n` +
                            `${"─".repeat(55)}\n` +
                            (address ? `Target: ${address}\n` : `Target: semua wireless device\n`) +
                            `Result: ${combined}`,
                    },
                ],
            };
        }
        catch (error) {
            return {
                content: [
                    { type: "text", text: formatToolError("adb_wifi_disconnect", error) },
                ],
            };
        }
    });
    // ── 6. adb_wifi_shell ────────────────────────────────────────────────────
    server.tool("adb_wifi_shell", "Jalankan shell command di perangkat Android yang terhubung via wireless ADB. " +
        "Setara dengan adb_run_shell tapi khusus untuk wireless device. " +
        "Cocok untuk inspeksi app data, membaca log, cek permission, dll.", {
        address: z
            .string()
            .describe("IP:PORT perangkat wireless. Contoh: '192.168.1.5:5555'. " +
            "Lihat dari adb_wifi_devices."),
        command: z
            .string()
            .describe("Shell command yang dijalankan. Contoh: 'pm list packages', " +
            "'dumpsys activity top', 'cat /data/data/com.app/files/config.json'"),
        timeout_seconds: z
            .number()
            .int()
            .min(5)
            .max(120)
            .default(30)
            .describe("Timeout dalam detik (default: 30)"),
    }, async ({ address, command, timeout_seconds }) => {
        try {
            const result = await runAdbCommand(`adb -s ${address} shell ${command}`, undefined, timeout_seconds * 1000);
            const output = (result.stdout + (result.stderr ? "\n[stderr]\n" + result.stderr : "")).trim();
            return {
                content: [
                    {
                        type: "text",
                        text: `📡 [${address}] $ ${command}\n` +
                            `${"─".repeat(55)}\n` +
                            `Exit: ${result.exitCode}\n\n` +
                            truncateOutput(output, 8000),
                    },
                ],
            };
        }
        catch (error) {
            return {
                content: [
                    { type: "text", text: formatToolError("adb_wifi_shell", error) },
                ],
            };
        }
    });
    // ── 7. adb_wifi_screenshot ───────────────────────────────────────────────
    server.tool("adb_wifi_screenshot", "Ambil screenshot layar perangkat Android via wireless ADB. " +
        "Berguna untuk memverifikasi UI app, debug layout, atau mendokumentasikan state app.", {
        address: z
            .string()
            .describe("IP:PORT perangkat wireless. Contoh: '192.168.1.5:5555'"),
        output_path: z
            .string()
            .optional()
            .describe("Path lokal untuk menyimpan PNG. Default: /tmp/mcp-emulator/wifi_ss_<ts>.png"),
        display_id: z
            .number()
            .int()
            .default(0)
            .describe("ID display (0 = layar utama). Default: 0"),
    }, async ({ address, output_path, display_id }) => {
        try {
            const outDir = path.join(os.tmpdir(), "mcp-emulator");
            await ensureDir(outDir);
            const ts = Date.now();
            const localPath = output_path ?? path.join(outDir, `wifi_ss_${address.replace(/[:.]/g, "_")}_${ts}.png`);
            const remotePath = `/sdcard/wifi_ss_${ts}.png`;
            const displayFlag = display_id > 0 ? `-d ${display_id}` : "";
            // Capture on device
            await runAdbCommand(`adb -s ${address} shell screencap -p ${displayFlag} ${remotePath}`, undefined, 15_000);
            // Pull to local
            await runAdbCommand(`adb -s ${address} pull ${remotePath} "${localPath}"`, undefined, 15_000);
            // Cleanup remote
            await runAdbCommand(`adb -s ${address} shell rm ${remotePath}`, undefined, 5_000).catch(() => null);
            // Verify local file exists
            await fs.access(localPath);
            return {
                content: [
                    {
                        type: "text",
                        text: `📸 Screenshot via WiFi ADB\n` +
                            `${"─".repeat(55)}\n` +
                            `Device  : ${address}\n` +
                            `Display : ${display_id}\n` +
                            `Saved   : ${localPath}\n\n` +
                            `✅ Screenshot berhasil disimpan!`,
                    },
                ],
            };
        }
        catch (error) {
            return {
                content: [
                    { type: "text", text: formatToolError("adb_wifi_screenshot", error) },
                ],
            };
        }
    });
    // ── 8. adb_wifi_ui_dump ──────────────────────────────────────────────────
    server.tool("adb_wifi_ui_dump", "Dump UI hierarchy (struktur widget) dari app yang sedang berjalan via wireless ADB. " +
        "Ini adalah tool utama untuk scraping data dari Android app secara nirkabel — " +
        "ambil teks, ID, bounds semua elemen UI yang terlihat di layar saat ini. " +
        "Sangat berguna sebagai alternatif web scraping untuk app native.", {
        address: z
            .string()
            .describe("IP:PORT perangkat wireless. Contoh: '192.168.1.5:5555'"),
        output_path: z
            .string()
            .optional()
            .describe("Path lokal untuk menyimpan XML dump. " +
            "Default: /tmp/mcp-emulator/wifi_ui_<ts>.xml"),
        include_raw_xml: z
            .boolean()
            .default(false)
            .describe("Sertakan raw XML dalam response (bisa sangat panjang). " +
            "Default: false — hanya tampilkan summary dan teks elemen."),
        filter_package: z
            .string()
            .optional()
            .describe("Filter hanya elemen dari package tertentu. " +
            "Contoh: 'com.tokopedia.tkpd'"),
    }, async ({ address, output_path, include_raw_xml, filter_package }) => {
        try {
            const outDir = path.join(os.tmpdir(), "mcp-emulator");
            await ensureDir(outDir);
            const ts = Date.now();
            const localPath = output_path ??
                path.join(outDir, `wifi_ui_${address.replace(/[:.]/g, "_")}_${ts}.xml`);
            const remotePath = `/sdcard/wifi_ui_${ts}.xml`;
            // Dump UI hierarchy
            const dumpResult = await runAdbCommand(`adb -s ${address} shell uiautomator dump --compressed ${remotePath}`, undefined, 30_000);
            if (dumpResult.exitCode !== 0 && !dumpResult.stdout.includes("dumped")) {
                return {
                    content: [
                        {
                            type: "text",
                            text: `❌ UI Dump gagal.\n${dumpResult.stderr}\n\n` +
                                `Pastikan:\n` +
                                `  • App sedang berjalan di foreground\n` +
                                `  • Screen tidak dalam keadaan terkunci\n` +
                                `  • uiautomator tersedia di device (Android 4.1+)`,
                        },
                    ],
                };
            }
            // Pull XML
            await runAdbCommand(`adb -s ${address} pull ${remotePath} "${localPath}"`, undefined, 15_000);
            // Cleanup remote
            await runAdbCommand(`adb -s ${address} shell rm ${remotePath}`, undefined, 5_000).catch(() => null);
            // Parse XML for summary
            const xmlContent = await fs.readFile(localPath, "utf-8");
            // Extract text and resource-id attributes
            const textMatches = [...xmlContent.matchAll(/text="([^"]+)"/g)]
                .map((m) => m[1])
                .filter((t) => t.trim().length > 0);
            const resourceIds = [...xmlContent.matchAll(/resource-id="([^"]+)"/g)]
                .map((m) => m[1])
                .filter((id) => id.trim().length > 0)
                .filter((id, i, arr) => arr.indexOf(id) === i); // unique
            const packageMatch = xmlContent.match(/package="([^"]+)"/);
            const detectedPackage = packageMatch?.[1] ?? "unknown";
            const nodeCount = (xmlContent.match(/<node/g) ?? []).length;
            let filteredTexts = textMatches;
            if (filter_package) {
                // Only include text from nodes that have the package
                const pkgRegex = new RegExp(`package="${filter_package.replace(/\./g, "\\.")}[^"]*"[^>]*text="([^"]+)"`, "g");
                filteredTexts = [...xmlContent.matchAll(pkgRegex)].map((m) => m[1]);
            }
            const lines = [
                `🔍 UI Hierarchy Dump via WiFi ADB`,
                "═".repeat(55),
                `Device   : ${address}`,
                `Package  : ${detectedPackage}`,
                `Nodes    : ${nodeCount}`,
                `Texts    : ${filteredTexts.length}`,
                `Saved    : ${localPath}`,
                "",
                "📝 TEKS YANG TERDETEKSI:",
                ...filteredTexts.slice(0, 50).map((t, i) => `  ${i + 1}. ${t}`),
                ...(filteredTexts.length > 50
                    ? [`  ... dan ${filteredTexts.length - 50} teks lainnya`]
                    : []),
                "",
                "🆔 RESOURCE IDs (unique):",
                ...resourceIds.slice(0, 30).map((id) => `  • ${id}`),
                ...(resourceIds.length > 30
                    ? [`  ... dan ${resourceIds.length - 30} ID lainnya`]
                    : []),
            ];
            if (include_raw_xml) {
                lines.push("", "📄 RAW XML:", "─".repeat(55));
                lines.push(truncateOutput(xmlContent, 20000));
            }
            return { content: [{ type: "text", text: lines.join("\n") }] };
        }
        catch (error) {
            return {
                content: [
                    { type: "text", text: formatToolError("adb_wifi_ui_dump", error) },
                ],
            };
        }
    });
}
//# sourceMappingURL=wireless_adb.js.map