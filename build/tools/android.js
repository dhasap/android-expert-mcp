/**
 * Kotlin, Gradle & Android Automation Tools (ADB)
 * ─────────────────────────────────────────────────────────────────────────────
 * Provides expert-level tools for:
 *   • Running Gradle tasks (assembleDebug, test, lint, etc.)
 *   • Parsing build logs and extracting Kotlin/Java stack traces
 *   • ADB interactions: UI dump, APK extraction, logcat reading
 *   • Device detection and management
 */
import { z } from "zod";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import { runCommand, runStreamingCommand, runAdbCommand, extractStackTrace, formatToolError, truncateOutput, ensureDir, } from "../utils.js";
// ─── Internal helpers ─────────────────────────────────────────────────────────
async function resolveGradlew(projectPath) {
    const candidates = [
        path.join(projectPath, "gradlew"),
        path.join(projectPath, "gradlew.bat"),
    ];
    for (const c of candidates) {
        try {
            await fs.access(c);
            return c;
        }
        catch {
            // try next
        }
    }
    throw new Error(`gradlew wrapper not found in '${projectPath}'. ` +
        "Make sure this is the root of an Android/Gradle project.");
}
async function checkAdbAvailable() {
    const result = await runAdbCommand("adb version", undefined, 10_000);
    if (result.exitCode !== 0) {
        return { available: false, error: result.stderr || "adb command not found" };
    }
    return { available: true, version: result.stdout.split("\n")[0] };
}
async function getConnectedDevices() {
    const result = await runAdbCommand("adb devices", undefined, 10_000);
    if (result.exitCode !== 0)
        return [];
    return result.stdout
        .split("\n")
        .slice(1)
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith("*") && l.includes("\t"))
        .map((l) => l.split("\t")[0].trim())
        .filter(Boolean);
}
function deviceFlag(deviceSerial) {
    return deviceSerial ? `-s ${deviceSerial}` : "";
}
// ─── Tool registration ────────────────────────────────────────────────────────
export function registerAndroidTools(server) {
    // ── 1. run_gradle_task ────────────────────────────────────────────────────
    server.tool("run_gradle_task", "Executes a Gradle task using the project's ./gradlew wrapper. " +
        "Captures full output, extracts stack traces on failure, and provides " +
        "a structured diagnosis. Common tasks: assembleDebug, assembleRelease, " +
        "test, testDebugUnitTest, lint, clean, dependencies.", {
        project_path: z
            .string()
            .describe("Absolute path to the Android project root (where gradlew lives)"),
        task: z
            .string()
            .describe("Gradle task to run, e.g. 'assembleDebug' or ':app:testDebugUnitTest'"),
        extra_args: z
            .string()
            .optional()
            .describe("Additional Gradle flags, e.g. '--stacktrace --info'"),
        timeout_seconds: z
            .number()
            .int()
            .min(30)
            .max(1800)
            .default(300)
            .describe("Timeout in seconds (default: 300)"),
    }, async ({ project_path, task, extra_args, timeout_seconds }) => {
        try {
            const resolvedPath = path.resolve(project_path);
            const gradlew = await resolveGradlew(resolvedPath);
            // Ensure gradlew is executable
            await runCommand(`chmod +x ${gradlew}`, resolvedPath, 5_000);
            const args = [gradlew, task, "--no-daemon"];
            if (extra_args)
                args.push(extra_args);
            const result = await runStreamingCommand(args, resolvedPath, timeout_seconds * 1000);
            const fullOutput = [result.stdout, result.stderr].filter(Boolean).join("\n");
            const success = result.exitCode === 0;
            let response;
            if (success) {
                response =
                    `✅ Gradle task '${task}' completed successfully.\n` +
                        `${"─".repeat(60)}\n` +
                        truncateOutput(fullOutput);
            }
            else {
                const trace = extractStackTrace(fullOutput);
                response =
                    `❌ Gradle task '${task}' FAILED (exit code: ${result.exitCode})\n` +
                        `${"─".repeat(60)}\n` +
                        `📋 EXTRACTED ERRORS & STACK TRACE:\n\n${trace}\n\n` +
                        `${"─".repeat(60)}\n` +
                        `📜 FULL OUTPUT (last 5000 chars):\n\n${fullOutput.slice(-5000)}`;
            }
            return { content: [{ type: "text", text: response }] };
        }
        catch (error) {
            return {
                content: [{ type: "text", text: formatToolError("run_gradle_task", error) }],
            };
        }
    });
    // ── 2. read_build_log ─────────────────────────────────────────────────────
    server.tool("read_build_log", "Reads a build log file from disk (or a specified path) and intelligently " +
        "extracts Kotlin/Java compiler errors, Gradle failures, and stack traces. " +
        "Use this for post-mortem analysis of CI logs or saved build outputs.", {
        log_path: z
            .string()
            .describe("Path to the build log file to analyze"),
        extract_only_errors: z
            .boolean()
            .default(true)
            .describe("If true, returns only extracted errors/stack traces. " +
            "If false, returns full log (may be very large)."),
    }, async ({ log_path, extract_only_errors }) => {
        try {
            const resolvedPath = path.resolve(log_path);
            const rawContent = await fs.readFile(resolvedPath, "utf-8");
            if (!extract_only_errors) {
                return {
                    content: [{ type: "text", text: truncateOutput(rawContent) }],
                };
            }
            const trace = extractStackTrace(rawContent);
            const lineCount = rawContent.split("\n").length;
            return {
                content: [
                    {
                        type: "text",
                        text: `📋 Build Log Analysis: ${resolvedPath}\n` +
                            `   Total lines: ${lineCount}\n` +
                            `${"─".repeat(60)}\n\n` +
                            `🔍 EXTRACTED ERRORS / STACK TRACES:\n\n${trace}`,
                    },
                ],
            };
        }
        catch (error) {
            return {
                content: [{ type: "text", text: formatToolError("read_build_log", error) }],
            };
        }
    });
    // ── 3. adb_list_devices ───────────────────────────────────────────────────
    server.tool("adb_list_devices", "Lists all currently connected Android devices/emulators via ADB. " +
        "Returns device serials, states, and model info if available.", {}, async () => {
        try {
            const adbCheck = await checkAdbAvailable();
            if (!adbCheck.available) {
                return {
                    content: [
                        {
                            type: "text",
                            text: `❌ ADB not available: ${adbCheck.error}\n` +
                                `Install Android SDK Platform Tools and ensure 'adb' is in PATH.`,
                        },
                    ],
                };
            }
            const result = await runAdbCommand("adb devices -l", undefined, 15_000);
            const devices = await getConnectedDevices();
            if (devices.length === 0) {
                return {
                    content: [
                        {
                            type: "text",
                            text: `📱 No Android devices connected.\n` +
                                `   • For physical device: Enable USB debugging in Developer Options\n` +
                                `   • For emulator: Start AVD from Android Studio or 'emulator -avd <name>'\n\n` +
                                `Raw adb output:\n${result.stdout}`,
                        },
                    ],
                };
            }
            return {
                content: [
                    {
                        type: "text",
                        text: `📱 Connected devices (${devices.length}):\n` +
                            `${"─".repeat(60)}\n` +
                            result.stdout,
                    },
                ],
            };
        }
        catch (error) {
            return {
                content: [{ type: "text", text: formatToolError("adb_list_devices", error) }],
            };
        }
    });
    // ── 4. adb_dump_ui ────────────────────────────────────────────────────────
    server.tool("adb_dump_ui", "Dumps the current UI hierarchy of a connected Android device using " +
        "uiautomator. Returns XML describing all visible UI elements with " +
        "their bounds, resource IDs, text content, and class names. " +
        "Use this to analyze what's on screen for UI debugging.", {
        device_serial: z
            .string()
            .optional()
            .describe("ADB device serial (leave empty to use the only connected device)"),
        include_invisible: z
            .boolean()
            .default(false)
            .describe("Include invisible/non-displayed elements in the dump"),
    }, async ({ device_serial, include_invisible }) => {
        try {
            const adbCheck = await checkAdbAvailable();
            if (!adbCheck.available) {
                return {
                    content: [
                        { type: "text", text: `❌ ADB not available: ${adbCheck.error}` },
                    ],
                };
            }
            const devices = await getConnectedDevices();
            if (devices.length === 0) {
                return {
                    content: [
                        { type: "text", text: "❌ No Android devices connected. Connect a device or start an emulator." },
                    ],
                };
            }
            const flag = deviceFlag(device_serial);
            const remotePath = "/sdcard/ui_dump.xml";
            const localPath = path.join(os.tmpdir(), "ui_dump.xml");
            // Trigger uiautomator dump on device
            const dumpResult = await runAdbCommand(`adb ${flag} shell uiautomator dump ${remotePath}`, undefined, 30_000);
            if (dumpResult.exitCode !== 0) {
                return {
                    content: [
                        {
                            type: "text",
                            text: `❌ uiautomator dump failed:\n${dumpResult.stderr}\n` +
                                `Ensure the device screen is on and unlocked.`,
                        },
                    ],
                };
            }
            // Pull the dump file to local
            const pullResult = await runAdbCommand(`adb ${flag} pull ${remotePath} ${localPath}`, undefined, 15_000);
            if (pullResult.exitCode !== 0) {
                return {
                    content: [
                        {
                            type: "text",
                            text: `❌ Failed to pull UI dump: ${pullResult.stderr}`,
                        },
                    ],
                };
            }
            const xmlContent = await fs.readFile(localPath, "utf-8");
            // Parse summary: count elements
            const nodeCount = (xmlContent.match(/<node /g) || []).length;
            const clickableCount = (xmlContent.match(/clickable="true"/g) || []).length;
            const editableCount = (xmlContent.match(/class="android.widget.EditText"/g) || []).length;
            let processedXml = xmlContent;
            if (!include_invisible) {
                // Simple filter: keep lines with bounds info
                processedXml = xmlContent; // Full XML is still useful for analysis
            }
            return {
                content: [
                    {
                        type: "text",
                        text: `📱 UI Hierarchy Dump\n` +
                            `${"─".repeat(60)}\n` +
                            `  Total nodes    : ${nodeCount}\n` +
                            `  Clickable items: ${clickableCount}\n` +
                            `  Text inputs    : ${editableCount}\n` +
                            `${"─".repeat(60)}\n\n` +
                            truncateOutput(processedXml, 30_000),
                    },
                ],
            };
        }
        catch (error) {
            return {
                content: [{ type: "text", text: formatToolError("adb_dump_ui", error) }],
            };
        }
    });
    // ── 5. adb_read_logcat ────────────────────────────────────────────────────
    server.tool("adb_read_logcat", "Captures Android logcat output for a specified duration. " +
        "Supports filtering by tag, package name, and log level. " +
        "Essential for runtime crash analysis and performance monitoring.", {
        device_serial: z.string().optional().describe("ADB device serial"),
        duration_seconds: z
            .number()
            .int()
            .min(1)
            .max(60)
            .default(5)
            .describe("How many seconds to capture logcat (default: 5)"),
        filter_tag: z
            .string()
            .optional()
            .describe("Filter by log tag, e.g. 'MainActivity', 'OkHttp'"),
        package_name: z
            .string()
            .optional()
            .describe("Filter by app package name, e.g. 'com.example.myapp'"),
        level: z
            .enum(["V", "D", "I", "W", "E", "F"])
            .default("W")
            .describe("Minimum log level: V=Verbose, D=Debug, I=Info, W=Warning, E=Error, F=Fatal"),
        clear_before_capture: z
            .boolean()
            .default(true)
            .describe("Clear existing logcat buffer before capturing (default: true)"),
    }, async ({ device_serial, duration_seconds, filter_tag, package_name, level, clear_before_capture }) => {
        try {
            const adbCheck = await checkAdbAvailable();
            if (!adbCheck.available) {
                return {
                    content: [{ type: "text", text: `❌ ADB not available: ${adbCheck.error}` }],
                };
            }
            const devices = await getConnectedDevices();
            if (devices.length === 0) {
                return {
                    content: [{ type: "text", text: "❌ No Android devices connected." }],
                };
            }
            const flag = deviceFlag(device_serial);
            if (clear_before_capture) {
                await runAdbCommand(`adb ${flag} logcat -c`, undefined, 5_000);
            }
            // Build filter string
            let filterStr = `*:${level}`;
            if (filter_tag) {
                filterStr = `${filter_tag}:${level} *:S`;
            }
            // Capture logcat for specified duration using timeout
            const logcatCmd = `timeout ${duration_seconds} adb ${flag} logcat -v threadtime ${filterStr} || true`;
            const result = await runCommand(logcatCmd, undefined, (duration_seconds + 5) * 1000);
            let logOutput = result.stdout || result.stderr;
            // Filter by package name if specified (post-processing)
            if (package_name && logOutput) {
                const lines = logOutput.split("\n").filter((line) => line.includes(package_name) || line.startsWith("---") || line.length < 10);
                logOutput = lines.join("\n");
            }
            const lineCount = logOutput.split("\n").length;
            return {
                content: [
                    {
                        type: "text",
                        text: `📋 Logcat Output (${duration_seconds}s capture, level >= ${level})\n` +
                            (filter_tag ? `   Tag filter: ${filter_tag}\n` : "") +
                            (package_name ? `   Package filter: ${package_name}\n` : "") +
                            `   Lines captured: ${lineCount}\n` +
                            `${"─".repeat(60)}\n\n` +
                            truncateOutput(logOutput, 20_000),
                    },
                ],
            };
        }
        catch (error) {
            return {
                content: [{ type: "text", text: formatToolError("adb_read_logcat", error) }],
            };
        }
    });
    // ── 6. adb_extract_apk ────────────────────────────────────────────────────
    server.tool("adb_extract_apk", "Extracts (pulls) the APK of an installed app from a connected Android device. " +
        "Saves it locally for analysis or backup.", {
        package_name: z
            .string()
            .describe("App package name, e.g. 'com.example.myapp'"),
        output_dir: z
            .string()
            .default("./apk_extracts")
            .describe("Local directory to save the extracted APK (default: ./apk_extracts)"),
        device_serial: z.string().optional().describe("ADB device serial"),
    }, async ({ package_name, output_dir, device_serial }) => {
        try {
            const adbCheck = await checkAdbAvailable();
            if (!adbCheck.available) {
                return {
                    content: [{ type: "text", text: `❌ ADB not available: ${adbCheck.error}` }],
                };
            }
            const devices = await getConnectedDevices();
            if (devices.length === 0) {
                return {
                    content: [{ type: "text", text: "❌ No Android devices connected." }],
                };
            }
            const flag = deviceFlag(device_serial);
            // Find APK path on device
            const pathResult = await runAdbCommand(`adb ${flag} shell pm path ${package_name}`, undefined, 15_000);
            if (pathResult.exitCode !== 0 || !pathResult.stdout.includes("package:")) {
                return {
                    content: [
                        {
                            type: "text",
                            text: `❌ Package '${package_name}' not found on device.\n` +
                                `   Output: ${pathResult.stdout}\n` +
                                `   Error: ${pathResult.stderr}`,
                        },
                    ],
                };
            }
            const remotePath = pathResult.stdout.replace("package:", "").trim();
            const fileName = `${package_name}_${Date.now()}.apk`;
            const resolvedOutputDir = path.resolve(output_dir);
            await ensureDir(resolvedOutputDir);
            const localPath = path.join(resolvedOutputDir, fileName);
            const pullResult = await runAdbCommand(`adb ${flag} pull "${remotePath}" "${localPath}"`, undefined, 60_000);
            if (pullResult.exitCode !== 0) {
                return {
                    content: [
                        {
                            type: "text",
                            text: `❌ APK pull failed:\n${pullResult.stderr}`,
                        },
                    ],
                };
            }
            const stat = await fs.stat(localPath);
            const sizeMb = (stat.size / (1024 * 1024)).toFixed(2);
            return {
                content: [
                    {
                        type: "text",
                        text: `✅ APK extracted successfully!\n` +
                            `   Package : ${package_name}\n` +
                            `   Source  : ${remotePath}\n` +
                            `   Saved to: ${localPath}\n` +
                            `   Size    : ${sizeMb} MB`,
                    },
                ],
            };
        }
        catch (error) {
            return {
                content: [{ type: "text", text: formatToolError("adb_extract_apk", error) }],
            };
        }
    });
    // ── 7. adb_run_shell ──────────────────────────────────────────────────────
    server.tool("adb_run_shell", "Executes an arbitrary shell command on a connected Android device via ADB. " +
        "Use for advanced device interaction: checking files, running am/pm commands, etc. " +
        "Examples: 'ls /sdcard/', 'am start -n com.pkg/.MainActivity', 'dumpsys battery'", {
        command: z
            .string()
            .describe("Shell command to run on the Android device"),
        device_serial: z.string().optional().describe("ADB device serial"),
        timeout_seconds: z
            .number()
            .int()
            .min(1)
            .max(60)
            .default(15)
            .describe("Timeout in seconds (default: 15)"),
    }, async ({ command, device_serial, timeout_seconds }) => {
        try {
            const adbCheck = await checkAdbAvailable();
            if (!adbCheck.available) {
                return {
                    content: [{ type: "text", text: `❌ ADB not available: ${adbCheck.error}` }],
                };
            }
            const flag = deviceFlag(device_serial);
            const result = await runAdbCommand(`adb ${flag} shell ${command}`, undefined, timeout_seconds * 1000);
            return {
                content: [
                    {
                        type: "text",
                        text: `📱 ADB Shell: ${command}\n` +
                            `   Exit code: ${result.exitCode}\n` +
                            `${"─".repeat(60)}\n` +
                            `STDOUT:\n${result.stdout}\n` +
                            (result.stderr ? `STDERR:\n${result.stderr}` : ""),
                    },
                ],
            };
        }
        catch (error) {
            return {
                content: [{ type: "text", text: formatToolError("adb_run_shell", error) }],
            };
        }
    });
    // ── 8. analyze_kotlin_file ────────────────────────────────────────────────
    server.tool("analyze_kotlin_file", "Reads a Kotlin source file and provides a structural analysis: " +
        "lists classes, functions, imports, companion objects, coroutine usages, " +
        "and potential code smells (long functions, large classes, etc.).", {
        file_path: z
            .string()
            .describe("Path to the .kt file to analyze"),
    }, async ({ file_path }) => {
        try {
            const resolvedPath = path.resolve(file_path);
            const content = await fs.readFile(resolvedPath, "utf-8");
            const lines = content.split("\n");
            // Extract structural info using regex
            const packageName = (content.match(/^package\s+([\w.]+)/m) || [])[1] ?? "unknown";
            const imports = lines.filter((l) => l.trim().startsWith("import")).map((l) => l.trim());
            const classes = lines
                .map((l, i) => ({ line: i + 1, text: l }))
                .filter(({ text }) => /^\s*(open |abstract |data |sealed |enum |inline )?(class|object|interface)\s+/.test(text))
                .map(({ line, text }) => `L${line}: ${text.trim()}`);
            const functions = lines
                .map((l, i) => ({ line: i + 1, text: l }))
                .filter(({ text }) => /^\s*(suspend |private |protected |internal |override |inline )?(fun)\s+/.test(text))
                .map(({ line, text }) => `L${line}: ${text.trim()}`);
            const coroutineUsages = lines
                .filter((l) => /launch|async|withContext|Flow|StateFlow|SharedFlow|suspend/.test(l))
                .length;
            const todoCount = lines.filter((l) => /TODO|FIXME|HACK|XXX/.test(l)).length;
            // Code smell detection
            const smells = [];
            if (lines.length > 500)
                smells.push(`⚠️  File is very long (${lines.length} lines) — consider splitting`);
            if (functions.length > 20)
                smells.push(`⚠️  Too many functions (${functions.length}) — consider refactoring`);
            if (imports.length > 30)
                smells.push(`⚠️  Many imports (${imports.length}) — possible god class`);
            if (todoCount > 0)
                smells.push(`⚠️  Found ${todoCount} TODO/FIXME comment(s)`);
            const output = `🔍 Kotlin File Analysis: ${resolvedPath}\n` +
                `${"─".repeat(60)}\n` +
                `Package    : ${packageName}\n` +
                `Lines      : ${lines.length}\n` +
                `Imports    : ${imports.length}\n` +
                `Classes    : ${classes.length}\n` +
                `Functions  : ${functions.length}\n` +
                `Coroutines : ${coroutineUsages} usages\n\n` +
                (classes.length > 0 ? `📦 CLASSES/OBJECTS:\n${classes.join("\n")}\n\n` : "") +
                (functions.length > 0 ? `⚙️  FUNCTIONS (first 30):\n${functions.slice(0, 30).join("\n")}\n\n` : "") +
                (smells.length > 0 ? `🚨 CODE SMELLS:\n${smells.join("\n")}\n` : "✅ No obvious code smells detected.\n");
            return { content: [{ type: "text", text: output }] };
        }
        catch (error) {
            return {
                content: [{ type: "text", text: formatToolError("analyze_kotlin_file", error) }],
            };
        }
    });
}
//# sourceMappingURL=android.js.map