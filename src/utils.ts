/**
 * Shared utilities used across all tool modules
 */

import { exec, spawn } from "child_process";
import { promisify } from "util";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";

export const execAsync = promisify(exec);

// ─── Types ───────────────────────────────────────────────────────────────────

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

// ─── Command execution ───────────────────────────────────────────────────────

/**
 * Run a shell command with timeout, capturing stdout + stderr.
 * Never throws — always returns a CommandResult.
 */
export async function runCommand(
  command: string,
  cwd?: string,
  timeoutMs: number = 120_000
): Promise<CommandResult> {
  return new Promise((resolve) => {
    const options = {
      cwd: cwd ?? process.cwd(),
      timeout: timeoutMs,
      maxBuffer: 10 * 1024 * 1024, // 10 MB
      env: { ...process.env, TERM: "dumb" },
    };

    exec(command, options, (error, stdout, stderr) => {
      resolve({
        stdout: stdout.toString(),
        stderr: stderr.toString(),
        exitCode: error?.code ?? (error ? 1 : 0),
      });
    });
  });
}

/**
 * Stream a long-running process (e.g. gradle build) and collect output.
 */
export async function runStreamingCommand(
  args: string[],
  cwd: string,
  timeoutMs: number = 300_000
): Promise<CommandResult> {
  return new Promise((resolve) => {
    const [cmd, ...rest] = args;
    const stdoutChunks: string[] = [];
    const stderrChunks: string[] = [];

    const proc = spawn(cmd!, rest, {
      cwd,
      env: { ...process.env, TERM: "dumb" },
      shell: false,
    });

    const timer = setTimeout(() => {
      proc.kill("SIGKILL");
      resolve({
        stdout: stdoutChunks.join(""),
        stderr: stderrChunks.join("") + "\n[TIMEOUT] Process killed after " + timeoutMs + "ms",
        exitCode: 124,
      });
    }, timeoutMs);

    proc.stdout.on("data", (d: Buffer) => stdoutChunks.push(d.toString()));
    proc.stderr.on("data", (d: Buffer) => stderrChunks.push(d.toString()));

    proc.on("close", (code) => {
      clearTimeout(timer);
      resolve({
        stdout: stdoutChunks.join(""),
        stderr: stderrChunks.join(""),
        exitCode: code ?? 1,
      });
    });

    proc.on("error", (err) => {
      clearTimeout(timer);
      resolve({
        stdout: stdoutChunks.join(""),
        stderr: err.message,
        exitCode: 1,
      });
    });
  });
}

// ─── File system helpers ─────────────────────────────────────────────────────

/**
 * Build a directory tree string (like `tree` command output).
 */
export async function buildDirectoryTree(
  dirPath: string,
  indent: string = "",
  maxDepth: number = 5,
  currentDepth: number = 0
): Promise<string> {
  if (currentDepth >= maxDepth) return indent + "  ... (max depth reached)\n";

  let result = "";
  let entries;

  try {
    entries = await fs.readdir(dirPath, { withFileTypes: true });
  } catch (err) {
    return indent + `  [ERROR reading dir: ${(err as Error).message}]\n`;
  }

  // Sort: directories first, then files
  entries.sort((a: {isDirectory: () => boolean, name: string}, b: {isDirectory: () => boolean, name: string}) => {
    if (a.isDirectory() && !b.isDirectory()) return -1;
    if (!a.isDirectory() && b.isDirectory()) return 1;
    return a.name.localeCompare(b.name);
  });

  // Common ignore patterns
  const ignorePatterns = new Set([
    "node_modules", ".git", ".gradle", "build", "dist",
    ".idea", ".DS_Store", "__pycache__", ".cache", "*.class",
  ]);

  for (const entry of entries) {
    if (ignorePatterns.has(entry.name)) continue;

    const icon = entry.isDirectory() ? "📁" : "📄";
    result += `${indent}${icon} ${entry.name}\n`;

    if (entry.isDirectory()) {
      result += await buildDirectoryTree(
        path.join(dirPath, entry.name),
        indent + "  ",
        maxDepth,
        currentDepth + 1
      );
    }
  }

  return result;
}

/**
 * Safely read a file with a size guard.
 */
export async function safeReadFile(
  filePath: string,
  maxSizeBytes: number = 1_000_000
): Promise<{ content: string; truncated: boolean }> {
  const stat = await fs.stat(filePath);
  if (stat.size > maxSizeBytes) {
    const fd = await fs.open(filePath, "r");
    const buffer = Buffer.alloc(maxSizeBytes);
    await fd.read(buffer, 0, maxSizeBytes, 0);
    await fd.close();
    return {
      content: buffer.toString("utf-8") + "\n\n... [FILE TRUNCATED — too large to display fully]",
      truncated: true,
    };
  }
  return { content: await fs.readFile(filePath, "utf-8"), truncated: false };
}

/**
 * Ensure a directory exists (mkdir -p).
 */
export async function ensureDir(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true });
}

/**
 * Get a safe temp directory path.
 */
export function getTempDir(): string {
  return path.join(os.tmpdir(), "android-expert-mcp");
}

// ─── Mutex (simple async lock) ───────────────────────────────────────────────

/**
 * A simple promise-chain mutex to serialise concurrent access to a resource
 * (e.g. a JSON file).  Usage:
 *
 *   const mu = new Mutex();
 *   const release = await mu.acquire();
 *   try { ... } finally { release(); }
 */
export class Mutex {
  private _queue: Promise<void> = Promise.resolve();

  acquire(): Promise<() => void> {
    let release!: () => void;
    const next = new Promise<void>((resolve) => {
      release = resolve;
    });
    const ticket = this._queue.then(() => release);
    this._queue = this._queue.then(() => next);
    return ticket;
  }
}

// ─── Semaphore (Fix #1 — Puppeteer concurrency limiter) ──────────────────────

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
export class Semaphore {
  private _slots: number;
  private _waiting: Array<() => void> = [];

  constructor(concurrency: number) {
    if (concurrency < 1) throw new RangeError("Semaphore concurrency must be >= 1");
    this._slots = concurrency;
  }

  /** Current number of free slots (informational). */
  get available(): number {
    return this._slots;
  }

  /** Current queue depth (callers waiting for a slot). */
  get queued(): number {
    return this._waiting.length;
  }

  /**
   * Acquire one slot.  Resolves immediately if a slot is free,
   * otherwise waits until one becomes available.
   * Returns a `release` function — **always call it in a `finally` block**.
   */
  acquire(): Promise<() => void> {
    return new Promise<() => void>((resolve) => {
      const tryAcquire = () => {
        if (this._slots > 0) {
          this._slots--;
          resolve(() => this._release());
        } else {
          this._waiting.push(tryAcquire);
        }
      };
      tryAcquire();
    });
  }

  /**
   * Run `fn` inside a semaphore slot.  Slot is released automatically
   * when `fn` resolves or rejects.
   */
  async run<T>(fn: () => Promise<T>): Promise<T> {
    const release = await this.acquire();
    try {
      return await fn();
    } finally {
      release();
    }
  }

  private _release(): void {
    this._slots++;
    const next = this._waiting.shift();
    if (next) next();
  }
}

/**
 * Global Puppeteer concurrency limiter — shared across scraping.ts & audit.ts.
 * Max 2 headless Chromium instances launched simultaneously.
 * All other requests queue here until a slot frees.
 */
export const puppeteerSemaphore = new Semaphore(2);

// ─── Puppeteer executable path helper ────────────────────────────────────────

/**
 * Get the path to the Chromium/Chrome executable.
 * Respects PUPPETEER_EXECUTABLE_PATH environment variable,
 * falls back to letting Puppeteer find its bundled Chromium.
 */
export function getPuppeteerExecutablePath(): string | undefined {
  return process.env.PUPPETEER_EXECUTABLE_PATH || undefined;
}

/**
 * Build standard Puppeteer launch options with optional overrides.
 * Automatically includes PUPPETEER_EXECUTABLE_PATH if set.
 */
export function buildPuppeteerLaunchOptions(
  extraArgs: string[] = [],
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  const executablePath = getPuppeteerExecutablePath();
  const defaultArgs = [
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-dev-shm-usage",
    "--disable-accelerated-2d-canvas",
    "--disable-gpu",
    "--window-size=1920,1080",
    "--disable-blink-features=AutomationControlled",
    ...extraArgs,
  ];

  return {
    headless: true,
    ...(executablePath ? { executablePath } : {}),
    args: defaultArgs,
    ...overrides,
  };
}

// ─── ADB global mutex (Fix #2 — prevent concurrent ADB server crashes) ───────

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
export const adbMutex = new Mutex();

/**
 * Run a single `adb ...` command under the global ADB mutex.
 * The lock is always released in `finally` — timeout or error safe.
 *
 * @param command    Full adb command string, e.g. `"adb -s emulator-5554 shell getprop"`
 * @param cwd        Optional working directory
 * @param timeoutMs  Command timeout in ms (default: 60 s)
 */
export async function runAdbCommand(
  command: string,
  cwd?: string,
  timeoutMs: number = 60_000
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const release = await adbMutex.acquire();
  try {
    return await runCommand(command, cwd, timeoutMs);
  } finally {
    release();
  }
}

// ─── Secret masking (Fix #3 — prevent secret leakage in error output) ────────

/**
 * List of environment variable names whose values should never appear in
 * tool output or logs.  Add new secret env vars here as the project grows.
 */
const SECRET_ENV_VARS: readonly string[] = [
  "TURSO_AUTH_TOKEN",
  "BOT_TOKEN",
  "TELEGRAM_TOKEN",
  "FIREBASE_TOKEN",
  "ANTHROPIC_API_KEY",
  "OPENAI_API_KEY",
  "GITHUB_TOKEN",
  "AWS_SECRET_ACCESS_KEY",
  "AWS_ACCESS_KEY_ID",
  "DATABASE_URL",
  "SECRET_KEY",
  "PRIVATE_KEY",
  "API_KEY",
];

/**
 * Replace every occurrence of each secret string inside `text` with `***`.
 *
 * @param text     The raw output / error string that may contain secrets
 * @param secrets  Extra ad-hoc secret values to mask (e.g. function args)
 *
 * Empty / whitespace-only secret values are ignored to avoid over-masking.
 */
export function maskSecrets(text: string, secrets: string[] = []): string {
  // Collect values from known env vars
  const envSecrets = SECRET_ENV_VARS
    .map((name) => process.env[name] ?? "")
    .filter((v) => v.trim().length >= 8); // ignore short/empty values

  const allSecrets = [...envSecrets, ...secrets].filter((s) => s.trim().length >= 8);

  let masked = text;
  for (const secret of allSecrets) {
    // Escape the secret for use in a RegExp, then replace all occurrences
    const escaped = secret.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    masked = masked.replace(new RegExp(escaped, "g"), "***");
  }
  return masked;
}

/**
 * Format a tool error — same as `formatToolError` but with secret masking.
 * Use this variant in tools that handle tokens / credentials.
 */
export function formatSecureToolError(
  toolName: string,
  error: unknown,
  extraSecrets: string[] = []
): string {
  const raw = error instanceof Error ? error.message : String(error);
  return `[${toolName}] ERROR: ${maskSecrets(raw, extraSecrets)}`;
}


/**
 * Read a JSON file safely.  Returns `defaultValue` if the file does not exist
 * or cannot be parsed.
 */
export async function atomicReadJson<T>(
  filePath: string,
  defaultValue: T
): Promise<T> {
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    return JSON.parse(raw) as T;
  } catch {
    return defaultValue;
  }
}

/**
 * Write data to a JSON file atomically using a `.tmp` side-file + rename.
 * This prevents a corrupt file if the process crashes mid-write.
 */
export async function atomicWriteJson(
  filePath: string,
  data: unknown
): Promise<void> {
  const tmp = filePath + ".tmp";
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), "utf-8");
  await fs.rename(tmp, filePath);
}

// ─── Stack trace extraction ───────────────────────────────────────────────────

/**
 * Extract meaningful error/stack trace lines from build output.
 */
export function extractStackTrace(output: string): string {
  const lines = output.split("\n");
  const errorPatterns = [
    /error:/i,
    /exception:/i,
    /at .+\(.+\)/,                      // Java stack frame
    /^\s+caused by:/i,
    /build failed/i,
    /task.*failed/i,
    /unresolved reference/i,
    /cannot find symbol/i,
    /^e:/,                              // Kotlin compiler error prefix
    /^w:/,                              // Kotlin compiler warning prefix
    /FAILED$/,
    /^\d+ error/i,
  ];

  const relevantLines: string[] = [];
  let inStackTrace = false;
  let stackLineCount = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const isErrorLine = errorPatterns.some((p) => p.test(line));

    if (isErrorLine) {
      inStackTrace = true;
      stackLineCount = 0;
      // Include a few lines of context before the error
      const contextStart = Math.max(0, i - 2);
      for (let j = contextStart; j < i; j++) {
        if (!relevantLines.includes(lines[j]!)) {
          relevantLines.push(lines[j]!);
        }
      }
    }

    if (inStackTrace) {
      relevantLines.push(line);
      stackLineCount++;
      if (stackLineCount > 30) inStackTrace = false;
    }
  }

  return relevantLines.length > 0
    ? relevantLines.join("\n")
    : "No stack trace found. Full output:\n" + output.slice(-3000);
}

// ─── Text formatting ─────────────────────────────────────────────────────────

export function formatToolError(toolName: string, error: unknown): string {
  const msg = error instanceof Error ? error.message : String(error);
  return `[${toolName}] ERROR: ${msg}`;
}

export function truncateOutput(text: string, maxChars: number = 50_000): string {
  if (text.length <= maxChars) return text;
  const half = Math.floor(maxChars / 2);
  return (
    text.slice(0, half) +
    `\n\n... [OUTPUT TRUNCATED: ${text.length} chars total, showing first and last ${half}] ...\n\n` +
    text.slice(-half)
  );
}

// ─── Temp directory cleanup (Fix #1) ─────────────────────────────────────────

/**
 * Known temp directories used by MCP tools.
 * Any folder listed here will be scanned by cleanupTempDirectories().
 * New tool modules should add their temp dir here.
 */
export const MCP_TEMP_DIRS = [
  "mcp-browser-screenshots", // browser.ts — takePageScreenshot
  "mcp-audits",              // audit.ts   — Lighthouse JSON reports
  "mcp-screenshots",         // audit.ts   — take_screenshot PNG
  "mcp-emulator",            // idx_firebase.ts — emulator screenshots/videos/XML
  "android-expert-mcp",      // general temp (getTempDir)
];

/**
 * Delete files older than `maxAgeHours` from every known MCP temp directory.
 *
 * Designed to be called periodically (e.g. every hour) from index.ts.
 * Never throws — errors are written to stderr so the server keeps running.
 *
 * @param maxAgeHours  Files older than this many hours are deleted (default 24)
 * @returns            Summary string describing what was cleaned up
 */
export async function cleanupTempDirectories(
  maxAgeHours: number = 24
): Promise<string> {
  const cutoffMs = maxAgeHours * 60 * 60 * 1000;
  const now = Date.now();
  const results: string[] = [];
  let totalDeleted = 0;
  let totalFreedBytes = 0;

  for (const dirName of MCP_TEMP_DIRS) {
    const dirPath = path.join(os.tmpdir(), dirName);

    // Skip dirs that don't exist yet — not an error
    try {
      await fs.access(dirPath);
    } catch {
      continue;
    }

    let entries;
    try {
      entries = await fs.readdir(dirPath, { withFileTypes: true });
    } catch (err) {
      results.push(`⚠️  ${dirName}: readdir failed — ${(err as Error).message}`);
      continue;
    }

    let deleted = 0;
    let freedBytes = 0;

    for (const entry of entries) {
      if (!entry.isFile()) continue; // skip subdirs
      const filePath = path.join(dirPath, entry.name);
      try {
        const stat = await fs.stat(filePath);
        const ageMs = now - stat.mtimeMs;
        if (ageMs > cutoffMs) {
          freedBytes += stat.size;
          await fs.unlink(filePath);
          deleted++;
        }
      } catch {
        // File may have been deleted already by another process — skip silently
      }
    }

    if (deleted > 0) {
      const freedKb = (freedBytes / 1024).toFixed(1);
      results.push(`✅ ${dirName}: deleted ${deleted} file(s), freed ${freedKb} KB`);
    }

    totalDeleted += deleted;
    totalFreedBytes += freedBytes;
  }

  const freedKbTotal = (totalFreedBytes / 1024).toFixed(1);
  const summary =
    totalDeleted === 0
      ? `[cleanup] No files older than ${maxAgeHours}h found.`
      : `[cleanup] Removed ${totalDeleted} file(s), freed ${freedKbTotal} KB total.\n` +
        results.join("\n");

  return summary;
}

// ─── Path safety validation (Fix #3) ─────────────────────────────────────────

/**
 * Blocked path prefixes — absolute paths that tools must never read or write.
 * Covers system config, credentials, package managers, and root.
 */
const BLOCKED_PATH_PREFIXES = [
  "/etc",
  "/var",
  "/usr",
  "/bin",
  "/sbin",
  "/lib",
  "/lib64",
  "/boot",
  "/proc",
  "/sys",
  "/dev",
  "/run",
  "/snap",
  "/root",       // root home
];

/**
 * Blocked path segments — any resolved path containing one of these
 * directory-name segments is rejected, regardless of its absolute prefix.
 * This catches dotfiles like ~/.ssh, ~/.gnupg, ~/.aws wherever they live.
 */
const BLOCKED_SEGMENTS = [
  ".ssh",
  ".gnupg",
  ".gpg",
  ".aws",
  ".azure",
  ".gcloud",
  ".kube",
  ".docker",
  ".npmrc",
  ".pypirc",
  ".netrc",
  ".git-credentials",
  "id_rsa",
  "id_ed25519",
  "id_ecdsa",
  "known_hosts",
  "authorized_keys",
];

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
export function isSafePath(
  targetPath: string,
  allowedRoot?: string
): SafePathResult {
  const resolved = path.resolve(targetPath);

  // Rule 1 — filesystem root
  if (resolved === "/") {
    return { safe: false, reason: "Refusing to operate on filesystem root '/'" };
  }

  // Rule 2 — blocked prefixes
  for (const prefix of BLOCKED_PATH_PREFIXES) {
    if (resolved === prefix || resolved.startsWith(prefix + "/")) {
      return {
        safe: false,
        reason: `Path '${resolved}' is inside a protected system directory ('${prefix}')`,
      };
    }
  }

  // Rule 3 — blocked segments (catches ~/.ssh etc.)
  const segments = resolved.split(path.sep);
  for (const seg of segments) {
    if (BLOCKED_SEGMENTS.includes(seg.toLowerCase())) {
      return {
        safe: false,
        reason: `Path '${resolved}' contains a sensitive segment ('${seg}')`,
      };
    }
  }

  // Rule 4 — optional allowedRoot confinement
  if (allowedRoot) {
    const root = path.resolve(allowedRoot);
    if (!resolved.startsWith(root + path.sep) && resolved !== root) {
      return {
        safe: false,
        reason: `Path '${resolved}' is outside the allowed root '${root}'`,
      };
    }
  }

  return { safe: true };
}
