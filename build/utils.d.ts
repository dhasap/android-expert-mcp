/**
 * Shared utilities used across all tool modules
 */
import { exec } from "child_process";
export declare const execAsync: typeof exec.__promisify__;
export interface CommandResult {
    stdout: string;
    stderr: string;
    exitCode: number;
}
export interface ToolResult {
    success: boolean;
    data?: unknown;
    error?: string;
}
/**
 * Run a shell command with timeout, capturing stdout + stderr.
 * Never throws — always returns a CommandResult.
 */
export declare function runCommand(command: string, cwd?: string, timeoutMs?: number): Promise<CommandResult>;
/**
 * Stream a long-running process (e.g. gradle build) and collect output.
 */
export declare function runStreamingCommand(args: string[], cwd: string, timeoutMs?: number): Promise<CommandResult>;
/**
 * Build a directory tree string (like `tree` command output).
 */
export declare function buildDirectoryTree(dirPath: string, indent?: string, maxDepth?: number, currentDepth?: number): Promise<string>;
/**
 * Safely read a file with a size guard.
 */
export declare function safeReadFile(filePath: string, maxSizeBytes?: number): Promise<{
    content: string;
    truncated: boolean;
}>;
/**
 * Ensure a directory exists (mkdir -p).
 */
export declare function ensureDir(dirPath: string): Promise<void>;
/**
 * Get a safe temp directory path.
 */
export declare function getTempDir(): string;
/**
 * A simple promise-chain mutex to serialise concurrent access to a resource
 * (e.g. a JSON file).  Usage:
 *
 *   const mu = new Mutex();
 *   const release = await mu.acquire();
 *   try { ... } finally { release(); }
 */
export declare class Mutex {
    private _queue;
    acquire(): Promise<() => void>;
}
/**
 * A counting semaphore that limits how many async operations run concurrently.
 *
 * Usage:
 *   const sem = new Semaphore(2);   // max 2 concurrent slots
 *   const release = await sem.acquire();
 *   try { await doHeavyWork(); } finally { release(); }
 *
 * Callers beyond the limit are queued and wake up FIFO as slots free up.
 * Because release() is always called in `finally`, deadlocks cannot occur
 * even when the guarded work throws or times out.
 */
export declare class Semaphore {
    private _slots;
    private _waiting;
    constructor(concurrency: number);
    /** Current number of free slots (informational). */
    get available(): number;
    /** Current queue depth (callers waiting for a slot). */
    get queued(): number;
    /**
     * Acquire one slot.  Resolves immediately if a slot is free,
     * otherwise waits until one becomes available.
     * Returns a `release` function — **always call it in a `finally` block**.
     */
    acquire(): Promise<() => void>;
    /**
     * Run `fn` inside a semaphore slot.  Slot is released automatically
     * when `fn` resolves or rejects.
     */
    run<T>(fn: () => Promise<T>): Promise<T>;
    private _release;
}
/**
 * Global Puppeteer concurrency limiter — shared across scraping.ts & audit.ts.
 * Max 2 headless Chromium instances launched simultaneously.
 * All other requests queue here until a slot frees.
 */
export declare const puppeteerSemaphore: Semaphore;
/**
 * Get the path to the Chromium/Chrome executable.
 * Respects PUPPETEER_EXECUTABLE_PATH environment variable,
 * falls back to letting Puppeteer find its bundled Chromium.
 */
export declare function getPuppeteerExecutablePath(): string | undefined;
/**
 * Build standard Puppeteer launch options with optional overrides.
 * Automatically includes PUPPETEER_EXECUTABLE_PATH if set.
 */
export declare function buildPuppeteerLaunchOptions(extraArgs?: string[], overrides?: Record<string, unknown>): Record<string, unknown>;
/**
 * Global ADB mutex — serialises all `adb ...` command invocations
 * across android.ts and idx_firebase.ts.
 *
 * ADB server is a single daemon; concurrent heavy commands (uiautomator dump,
 * logcat, screencap) race on the same socket and often corrupt each other.
 * Running them sequentially via this lock eliminates those races.
 *
 * Usage:
 *   const release = await adbMutex.acquire();
 *   try { await runCommand("adb ..."); } finally { release(); }
 *
 * Or via the helper:
 *   const result = await runAdbCommand("adb shell uiautomator dump");
 */
export declare const adbMutex: Mutex;
/**
 * Run a single `adb ...` command under the global ADB mutex.
 * The lock is always released in `finally` — timeout or error safe.
 *
 * @param command    Full adb command string, e.g. `"adb -s emulator-5554 shell getprop"`
 * @param cwd        Optional working directory
 * @param timeoutMs  Command timeout in ms (default: 60 s)
 */
export declare function runAdbCommand(command: string, cwd?: string, timeoutMs?: number): Promise<{
    stdout: string;
    stderr: string;
    exitCode: number;
}>;
/**
 * Replace every occurrence of each secret string inside `text` with `***`.
 *
 * @param text     The raw output / error string that may contain secrets
 * @param secrets  Extra ad-hoc secret values to mask (e.g. function args)
 *
 * Empty / whitespace-only secret values are ignored to avoid over-masking.
 */
export declare function maskSecrets(text: string, secrets?: string[]): string;
/**
 * Format a tool error — same as `formatToolError` but with secret masking.
 * Use this variant in tools that handle tokens / credentials.
 */
export declare function formatSecureToolError(toolName: string, error: unknown, extraSecrets?: string[]): string;
/**
 * Read a JSON file safely.  Returns `defaultValue` if the file does not exist
 * or cannot be parsed.
 */
export declare function atomicReadJson<T>(filePath: string, defaultValue: T): Promise<T>;
/**
 * Write data to a JSON file atomically using a `.tmp` side-file + rename.
 * This prevents a corrupt file if the process crashes mid-write.
 */
export declare function atomicWriteJson(filePath: string, data: unknown): Promise<void>;
/**
 * Extract meaningful error/stack trace lines from build output.
 */
export declare function extractStackTrace(output: string): string;
export declare function formatToolError(toolName: string, error: unknown): string;
export declare function truncateOutput(text: string, maxChars?: number): string;
/**
 * Known temp directories used by MCP tools.
 * Any folder listed here will be scanned by cleanupTempDirectories().
 * New tool modules should add their temp dir here.
 */
export declare const MCP_TEMP_DIRS: string[];
/**
 * Delete files older than `maxAgeHours` from every known MCP temp directory.
 *
 * Designed to be called periodically (e.g. every hour) from index.ts.
 * Never throws — errors are written to stderr so the server keeps running.
 *
 * @param maxAgeHours  Files older than this many hours are deleted (default 24)
 * @returns            Summary string describing what was cleaned up
 */
export declare function cleanupTempDirectories(maxAgeHours?: number): Promise<string>;
export interface SafePathResult {
    safe: boolean;
    reason?: string;
}
/**
 * Validate that `targetPath` is safe to read or write.
 *
 * Rules (in order):
 *  1. Resolve to absolute path first (eliminates `../` traversal attacks).
 *  2. Reject if the path IS the filesystem root ("/").
 *  3. Reject if the resolved path starts with any BLOCKED_PATH_PREFIXES.
 *  4. Reject if any path segment matches BLOCKED_SEGMENTS.
 *  5. If `allowedRoot` is provided, reject paths outside that directory tree.
 *
 * @param targetPath   The path string supplied by the AI / user
 * @param allowedRoot  Optional directory to restrict writes to (e.g. cwd)
 */
export declare function isSafePath(targetPath: string, allowedRoot?: string): SafePathResult;
//# sourceMappingURL=utils.d.ts.map