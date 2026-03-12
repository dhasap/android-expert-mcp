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
  let entries: fs.Dirent[];

  try {
    entries = await fs.readdir(dirPath, { withFileTypes: true });
  } catch (err) {
    return indent + `  [ERROR reading dir: ${(err as Error).message}]\n`;
  }

  // Sort: directories first, then files
  entries.sort((a, b) => {
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
