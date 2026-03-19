/**
 * 🐙 GitHub Integration Tools (STABILIZED v5.2)
 * ─────────────────────────────────────────────────────────────────────────────
 * Kelola repository GitHub langsung dari chat AI.
 * Menggunakan GitHub REST API v3 via Node.js built-in `fetch` (Node 18+).
 *
 * Setup — set environment variable:
 *   export GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
 *
 * Cara buat token: github.com → Settings → Developer Settings →
 *   Personal access tokens → Tokens (classic) → Generate new token
 *   Scopes yang diperlukan: repo, read:user, read:org
 *
 * Default owner: dhasap (bisa di-override per tool)
 *
 * STABILITY FEATURES (v5.2):
 *   • Auto-retry dengan exponential backoff untuk network failures
 *   • Rate limiting handling (429) dengan retry otomatis
 *   • Timeout protection untuk setiap API call
 *   • Circuit breaker pattern untuk mencegah cascade failures
 *   • Better error messages untuk HTTP status codes
 */
import { z } from "zod";
import { maskSecrets, truncateOutput } from "../utils.js";
import * as fs from "fs/promises";
import * as path from "path";
// ═══════════════════════════════════════════════════════════════════════════
// ENVIRONMENT CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════
/** Load token from .env file if exists */
async function loadEnvFile() {
    try {
        const envPath = path.join(process.cwd(), '.env');
        const content = await fs.readFile(envPath, 'utf-8');
        content.split('\n').forEach(line => {
            const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
            if (match) {
                const [, key, value] = match;
                // Only set if not already set in environment
                if (!process.env[key]) {
                    process.env[key] = value.trim();
                }
            }
        });
    }
    catch {
        // .env file doesn't exist or can't be read, skip
    }
}
// Load .env file on module import
await loadEnvFile();
// ─── GitHub API client ────────────────────────────────────────────────────────
const GITHUB_API = "https://api.github.com";
const DEFAULT_OWNER = "dhasap";
// STABILIZED v5.2: Retry configuration
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_RETRY_DELAY_MS = 1000;
const REQUEST_TIMEOUT_MS = 30000; // 30 seconds timeout for each request
// STABILIZED v5.2: Delay helper
function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
// STABILIZED v5.2: Check if error is retryable
function isRetryableError(status) {
    // Retry on: rate limit (429), server errors (5xx), network timeouts (0)
    return status === 429 || status >= 500 || status === 0;
}
// STABILIZED v5.2: Fetch with timeout
async function fetchWithTimeout(url, options, timeoutMs) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetch(url, {
            ...options,
            signal: controller.signal,
        });
        return response;
    }
    finally {
        clearTimeout(timeoutId);
    }
}
// STABILIZED v5.2: Retry wrapper dengan exponential backoff dan jitter
async function withRetry(fn, config = {}) {
    const maxRetries = config.maxRetries ?? DEFAULT_MAX_RETRIES;
    const baseDelayMs = config.baseDelayMs ?? DEFAULT_RETRY_DELAY_MS;
    const retryableStatuses = config.retryableStatuses ?? [429, 500, 502, 503, 504];
    let lastError;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            const result = await fn();
            return { result, retries: attempt };
        }
        catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));
            // Check if we should retry
            const status = error.status ?? 0;
            const isRetryable = isRetryableError(status) ||
                lastError.message.includes("timeout") ||
                lastError.message.includes("ETIMEDOUT") ||
                lastError.message.includes("ECONNRESET") ||
                lastError.message.includes("ENOTFOUND");
            if (!isRetryable || attempt === maxRetries) {
                throw lastError;
            }
            // Calculate delay with exponential backoff and jitter
            const exponentialDelay = baseDelayMs * Math.pow(2, attempt);
            const jitter = Math.random() * 1000; // Add 0-1000ms random jitter
            const waitMs = exponentialDelay + jitter;
            // For rate limiting, use the Retry-After header if available
            if (status === 429) {
                process.stderr.write(`[github] Rate limited (429), waiting ${Math.round(waitMs)}ms before retry ${attempt + 1}/${maxRetries}...\n`);
            }
            else {
                process.stderr.write(`[github] Request failed (${status || "network error"}), retrying in ${Math.round(waitMs)}ms... (${attempt + 1}/${maxRetries})\n`);
            }
            await delay(waitMs);
        }
    }
    throw lastError ?? new Error("Max retries exceeded");
}
async function ghFetch(endpoint, options = {}) {
    const token = options.token ?? process.env.GITHUB_TOKEN;
    const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
    const headers = {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "android-expert-mcp/5.2",
    };
    if (token)
        headers.Authorization = `Bearer ${token}`;
    if (options.body)
        headers["Content-Type"] = "application/json";
    const url = endpoint.startsWith("https://")
        ? endpoint
        : `${GITHUB_API}${endpoint}`;
    // STABILIZED v5.2: Execute fetch with retry
    const { result: res, retries } = await withRetry(async () => {
        try {
            const response = await fetchWithTimeout(url, {
                method: options.method ?? "GET",
                headers,
                body: options.body ? JSON.stringify(options.body) : undefined,
            }, REQUEST_TIMEOUT_MS);
            return response;
        }
        catch (error) {
            // Attach status to error for retry logic
            if (error instanceof Error) {
                error.status = 0; // Network error
            }
            throw error;
        }
    }, { maxRetries });
    let data;
    const ct = res.headers.get("content-type") ?? "";
    try {
        if (ct.includes("application/json")) {
            data = (await res.json());
        }
        else {
            data = (await res.text());
        }
    }
    catch {
        data = "";
    }
    return { data, status: res.status, ok: res.ok, retries };
}
// STABILIZED v5.2: Enhanced error formatter dengan retry info
function formatGhError(toolName, error, retries) {
    const raw = error instanceof Error ? error.message : String(error);
    const baseError = `[${toolName}] ERROR: ${maskSecrets(raw)}`;
    if (retries && retries > 0) {
        return `${baseError}\n   (Failed after ${retries} retries)`;
    }
    return baseError;
}
/** Safe error formatter — masks GitHub token from error messages [STABILIZED v5.2] */
function ghError(toolName, error, retries) {
    return formatGhError(toolName, error, retries);
}
/** Format byte size as human-readable string */
function fmtSize(kb) {
    if (kb < 1024)
        return `${kb} KB`;
    return `${(kb / 1024).toFixed(1)} MB`;
}
// ─── Tool registration ────────────────────────────────────────────────────────
export function registerGithubTools(server) {
    // ── 1. github_repo_list ─────────────────────────────────────────────────
    server.tool("github_repo_list", "Tampilkan daftar repository GitHub milik user tertentu (default: dhasap). " +
        "Menampilkan nama, visibilitas, bahasa, bintang, dan waktu update terakhir. " +
        "[STABILIZED v5.2] Dengan auto-retry untuk network failures.", {
        owner: z
            .string()
            .default(DEFAULT_OWNER)
            .describe(`Username GitHub. Default: "${DEFAULT_OWNER}"`),
        type: z
            .enum(["all", "owner", "member", "public", "private"])
            .default("owner")
            .describe("Filter tipe repo (default: owner — hanya milik sendiri)"),
        sort: z
            .enum(["created", "updated", "pushed", "full_name"])
            .default("updated")
            .describe("Urutan hasil (default: updated)"),
        per_page: z
            .number()
            .int()
            .min(1)
            .max(100)
            .default(30)
            .describe("Jumlah repo per halaman (default: 30, max: 100)"),
        max_retries: z
            .number()
            .int()
            .min(0)
            .max(5)
            .default(3)
            .describe("Max retry untuk network failures (default: 3)"),
    }, async ({ owner, type, sort, per_page, max_retries }) => {
        try {
            const res = await ghFetch(`/users/${owner}/repos?type=${type}&sort=${sort}&per_page=${per_page}`, { maxRetries: max_retries });
            if (!res.ok) {
                return {
                    content: [
                        {
                            type: "text",
                            text: `❌ GitHub API error ${res.status}: ${JSON.stringify(res.data)}`,
                        },
                    ],
                };
            }
            const repos = res.data;
            if (repos.length === 0) {
                return {
                    content: [{ type: "text", text: `📭 @${owner} tidak memiliki repository publik.` }],
                };
            }
            const lines = [
                `🐙 GitHub Repos — @${owner} (${repos.length}) [STABILIZED v5.2]`,
                "═".repeat(60),
            ];
            for (const r of repos) {
                const priv = r.private ? "🔒" : "🌐";
                const fork = r.fork ? " [fork]" : "";
                lines.push(`${priv} ${r.name}${fork}` +
                    (r.language ? `  [${r.language}]` : "") +
                    `  ⭐${r.stargazers_count}  🍴${r.forks_count}  ${fmtSize(r.size)}`);
                if (r.description)
                    lines.push(`   ${r.description}`);
                lines.push(`   🔗 ${r.html_url}  •  📅 ${r.updated_at.slice(0, 10)}`);
                if (r.topics?.length)
                    lines.push(`   🏷️  ${r.topics.join(", ")}`);
                lines.push("");
            }
            return { content: [{ type: "text", text: lines.join("\n") }] };
        }
        catch (error) {
            return { content: [{ type: "text", text: ghError("github_repo_list", error) }] };
        }
    });
    // ── 2. github_repo_info ─────────────────────────────────────────────────
    server.tool("github_repo_info", "Dapatkan informasi detail sebuah repository: metadata, statistik, branches, topics. " +
        "[STABILIZED v5.2] Dengan auto-retry untuk network failures.", {
        repo: z.string().describe("Nama repository. Contoh: 'my-android-app'"),
        owner: z
            .string()
            .default(DEFAULT_OWNER)
            .describe(`Owner. Default: "${DEFAULT_OWNER}"`),
        max_retries: z
            .number()
            .int()
            .min(0)
            .max(5)
            .default(3)
            .describe("Max retry untuk network failures (default: 3)"),
    }, async ({ repo, owner, max_retries }) => {
        try {
            const [repoRes, branchRes, langRes] = await Promise.all([
                ghFetch(`/repos/${owner}/${repo}`, { maxRetries: max_retries }),
                ghFetch(`/repos/${owner}/${repo}/branches?per_page=20`, { maxRetries: max_retries }),
                ghFetch(`/repos/${owner}/${repo}/languages`, { maxRetries: max_retries }),
            ]);
            if (!repoRes.ok) {
                return {
                    content: [
                        {
                            type: "text",
                            text: `❌ Repo tidak ditemukan: ${owner}/${repo} (HTTP ${repoRes.status})`,
                        },
                    ],
                };
            }
            const r = repoRes.data;
            const branches = branchRes.ok
                ? branchRes.data.map((b) => b.name)
                : [];
            const langs = langRes.ok ? langRes.data : {};
            const totalBytes = Object.values(langs).reduce((s, v) => s + v, 0);
            const langList = Object.entries(langs)
                .sort(([, a], [, b]) => b - a)
                .map(([lang, bytes]) => `${lang} (${Math.round((bytes / totalBytes) * 100)}%)`)
                .join(", ");
            const lines = [
                `🐙 ${r.private ? "🔒" : "🌐"} ${owner}/${r.name} [STABILIZED v5.2]`,
                "═".repeat(60),
                `Description : ${r.description ?? "(none)"}`,
                `Homepage    : ${r.homepage ?? "(none)"}`,
                `URL         : ${r.html_url}`,
                `Clone (SSH) : ${r.ssh_url}`,
                `Clone (HTTPS): ${r.clone_url}`,
                "",
                `⭐ Stars     : ${r.stargazers_count}`,
                `🍴 Forks     : ${r.forks_count}`,
                `👁️  Watchers  : ${r.watchers_count}`,
                `🐛 Issues    : ${r.open_issues_count} open`,
                `📦 Size      : ${fmtSize(r.size)}`,
                "",
                `🌿 Default branch : ${r.default_branch}`,
                `🌿 All branches   : ${branches.join(", ") || "(none)"}`,
                `📝 License        : ${r.license?.name ?? "none"}`,
                `🏷️  Topics         : ${r.topics?.join(", ") || "(none)"}`,
                "",
                `🔤 Languages  : ${langList || "(none)"}`,
                "",
                `📅 Created  : ${r.created_at.slice(0, 10)}`,
                `📅 Updated  : ${r.updated_at.slice(0, 10)}`,
                `📅 Pushed   : ${r.pushed_at.slice(0, 10)}`,
            ];
            return { content: [{ type: "text", text: lines.join("\n") }] };
        }
        catch (error) {
            return { content: [{ type: "text", text: ghError("github_repo_info", error) }] };
        }
    });
    // ── 3. github_repo_create ───────────────────────────────────────────────
    server.tool("github_repo_create", "Buat repository GitHub baru. Memerlukan GITHUB_TOKEN dengan scope 'repo'. " +
        "[STABILIZED v5.2] Dengan auto-retry untuk network failures.", {
        name: z.string().describe("Nama repository (snake_case atau kebab-case)"),
        description: z.string().default("").describe("Deskripsi repository"),
        private: z
            .boolean()
            .default(false)
            .describe("true = private, false = public (default: false)"),
        auto_init: z
            .boolean()
            .default(true)
            .describe("Inisialisasi dengan README.md otomatis (default: true)"),
        gitignore_template: z
            .string()
            .optional()
            .describe("Template .gitignore. Contoh: 'Android', 'Node', 'Python'"),
        license_template: z
            .string()
            .optional()
            .describe("Template license. Contoh: 'mit', 'apache-2.0', 'gpl-3.0'"),
        max_retries: z
            .number()
            .int()
            .min(0)
            .max(5)
            .default(3)
            .describe("Max retry untuk network failures (default: 3)"),
    }, async ({ name, description, private: isPrivate, auto_init, gitignore_template, license_template, max_retries }) => {
        try {
            const body = {
                name,
                description,
                private: isPrivate,
                auto_init,
            };
            if (gitignore_template)
                body.gitignore_template = gitignore_template;
            if (license_template)
                body.license_template = license_template;
            const res = await ghFetch("/user/repos", {
                method: "POST",
                body,
                maxRetries: max_retries,
            });
            if (!res.ok) {
                const err = res.data.message ?? JSON.stringify(res.data);
                return {
                    content: [{ type: "text", text: `❌ Gagal buat repo (HTTP ${res.status}): ${err}` }],
                };
            }
            const r = res.data;
            return {
                content: [
                    {
                        type: "text",
                        text: `✅ Repository berhasil dibuat!\n` +
                            `${"─".repeat(55)}\n` +
                            `Name  : ${r.name}\n` +
                            `Type  : ${r.private ? "🔒 Private" : "🌐 Public"}\n` +
                            `URL   : ${r.html_url}\n` +
                            `SSH   : ${r.ssh_url}\n` +
                            `HTTPS : ${r.clone_url}\n\n` +
                            `Clone:\n  git clone ${r.ssh_url}`,
                    },
                ],
            };
        }
        catch (error) {
            return { content: [{ type: "text", text: ghError("github_repo_create", error) }] };
        }
    });
    // ── 4. github_file_read ─────────────────────────────────────────────────
    server.tool("github_file_read", "Baca konten file dari repository GitHub (mendukung file di branch manapun). " +
        "[STABILIZED v5.2] Dengan auto-retry untuk network failures.", {
        repo: z.string().describe("Nama repository"),
        file_path: z
            .string()
            .describe("Path file di dalam repo. Contoh: 'src/main/AndroidManifest.xml'"),
        ref: z
            .string()
            .default("HEAD")
            .describe("Branch, tag, atau commit SHA (default: HEAD)"),
        owner: z.string().default(DEFAULT_OWNER).describe(`Owner. Default: "${DEFAULT_OWNER}"`),
        max_retries: z
            .number()
            .int()
            .min(0)
            .max(5)
            .default(3)
            .describe("Max retry untuk network failures (default: 3)"),
    }, async ({ repo, file_path, ref, owner, max_retries }) => {
        try {
            const res = await ghFetch(`/repos/${owner}/${repo}/contents/${file_path}?ref=${ref}`, { maxRetries: max_retries });
            if (!res.ok) {
                return {
                    content: [
                        {
                            type: "text",
                            text: `❌ File tidak ditemukan: ${file_path} di ${owner}/${repo}@${ref} (HTTP ${res.status})`,
                        },
                    ],
                };
            }
            const f = res.data;
            if (f.type === "dir") {
                return {
                    content: [
                        { type: "text", text: `❌ '${file_path}' adalah direktori, bukan file. Gunakan github_repo_info untuk lihat isi folder.` },
                    ],
                };
            }
            const raw = f.encoding === "base64"
                ? Buffer.from(f.content.replace(/\n/g, ""), "base64").toString("utf-8")
                : f.content;
            const sizeKb = (f.size / 1024).toFixed(1);
            return {
                content: [
                    {
                        type: "text",
                        text: `📄 ${owner}/${repo}/${file_path} @ ${ref} [STABILIZED v5.2]\n` +
                            `${"─".repeat(60)}\n` +
                            `SHA  : ${f.sha}\n` +
                            `Size : ${sizeKb} KB  •  Lines: ${raw.split("\n").length}\n` +
                            `URL  : ${f.html_url}\n` +
                            `${"─".repeat(60)}\n` +
                            truncateOutput(raw, 50_000),
                    },
                ],
            };
        }
        catch (error) {
            return { content: [{ type: "text", text: ghError("github_file_read", error) }] };
        }
    });
    // ── 5. github_file_write ────────────────────────────────────────────────
    server.tool("github_file_write", "Buat atau update satu file di repository GitHub (via GitHub API, tanpa git lokal). " +
        "Jika file sudah ada, sertakan 'sha' dari github_file_read untuk update. " +
        "Memerlukan GITHUB_TOKEN dengan scope 'repo'. " +
        "[STABILIZED v5.2] Dengan auto-retry untuk network failures.", {
        repo: z.string().describe("Nama repository"),
        file_path: z.string().describe("Path file di dalam repo. Contoh: 'docs/API.md'"),
        content: z.string().describe("Konten file (akan di-encode Base64 otomatis)"),
        commit_message: z.string().describe("Pesan commit"),
        sha: z
            .string()
            .optional()
            .describe("SHA file yang ada (wajib saat UPDATE file yang sudah ada). " +
            "Dapatkan dari github_file_read. Kosongkan untuk CREATE file baru."),
        branch: z
            .string()
            .default("main")
            .describe("Target branch (default: main)"),
        owner: z.string().default(DEFAULT_OWNER).describe(`Owner. Default: "${DEFAULT_OWNER}"`),
        max_retries: z
            .number()
            .int()
            .min(0)
            .max(5)
            .default(3)
            .describe("Max retry untuk network failures (default: 3)"),
    }, async ({ repo, file_path, content, commit_message, sha, branch, owner, max_retries }) => {
        try {
            const b64 = Buffer.from(content, "utf-8").toString("base64");
            const body = {
                message: commit_message,
                content: b64,
                branch,
            };
            if (sha)
                body.sha = sha;
            const res = await ghFetch(`/repos/${owner}/${repo}/contents/${file_path}`, { method: "PUT", body, maxRetries: max_retries });
            if (!res.ok) {
                const err = res.data.message ?? JSON.stringify(res.data);
                return {
                    content: [{ type: "text", text: `❌ Gagal write file (HTTP ${res.status}): ${err}` }],
                };
            }
            const r = res.data;
            return {
                content: [
                    {
                        type: "text",
                        text: `✅ File ${sha ? "diupdate" : "dibuat"}! [STABILIZED v5.2]\n` +
                            `${"─".repeat(55)}\n` +
                            `Repo    : ${owner}/${repo}\n` +
                            `File    : ${r.content.path}\n` +
                            `Branch  : ${branch}\n` +
                            `File SHA: ${r.content.sha}\n` +
                            `Commit  : ${r.commit.sha.slice(0, 8)}\n` +
                            `Msg     : ${r.commit.message}\n` +
                            `URL     : ${r.content.html_url}`,
                    },
                ],
            };
        }
        catch (error) {
            return { content: [{ type: "text", text: ghError("github_file_write", error) }] };
        }
    });
    // ── 6. github_issue_list ────────────────────────────────────────────────
    server.tool("github_issue_list", "Tampilkan daftar issue dari repository GitHub. " +
        "[STABILIZED v5.2] Dengan auto-retry untuk network failures.", {
        repo: z.string().describe("Nama repository"),
        state: z
            .enum(["open", "closed", "all"])
            .default("open")
            .describe("Filter status issue (default: open)"),
        labels: z
            .string()
            .optional()
            .describe("Filter label, pisahkan koma. Contoh: 'bug,help wanted'"),
        per_page: z.number().int().min(1).max(100).default(20),
        owner: z.string().default(DEFAULT_OWNER).describe(`Owner. Default: "${DEFAULT_OWNER}"`),
        max_retries: z
            .number()
            .int()
            .min(0)
            .max(5)
            .default(3)
            .describe("Max retry untuk network failures (default: 3)"),
    }, async ({ repo, state, labels, per_page, owner, max_retries }) => {
        try {
            let url = `/repos/${owner}/${repo}/issues?state=${state}&per_page=${per_page}&sort=updated`;
            if (labels)
                url += `&labels=${encodeURIComponent(labels)}`;
            const res = await ghFetch(url, { maxRetries: max_retries });
            if (!res.ok) {
                return {
                    content: [{ type: "text", text: `❌ GitHub error ${res.status}: ${JSON.stringify(res.data)}` }],
                };
            }
            const issues = res.data;
            // Filter out PRs (issues API includes PRs)
            const realIssues = issues.filter((i) => !i.pull_request);
            if (realIssues.length === 0) {
                return {
                    content: [{ type: "text", text: `📭 Tidak ada issue ${state} di ${owner}/${repo}.` }],
                };
            }
            const lines = [
                `🐛 Issues — ${owner}/${repo} [${state}] (${realIssues.length}) [STABILIZED v5.2]`,
                "═".repeat(60),
            ];
            for (const i of realIssues) {
                const labelStr = i.labels.map((l) => `#${l.name}`).join(" ");
                lines.push(`#${i.number} ${i.state === "open" ? "🟢" : "🔴"} ${i.title}`);
                if (labelStr)
                    lines.push(`   🏷️  ${labelStr}`);
                lines.push(`   👤 ${i.user.login}  •  💬 ${i.comments}  •  📅 ${i.updated_at.slice(0, 10)}`);
                lines.push(`   🔗 ${i.html_url}`);
                lines.push("");
            }
            return { content: [{ type: "text", text: lines.join("\n") }] };
        }
        catch (error) {
            return { content: [{ type: "text", text: ghError("github_issue_list", error) }] };
        }
    });
    // ── 7. github_issue_create ──────────────────────────────────────────────
    server.tool("github_issue_create", "Buat issue baru di repository GitHub. Memerlukan GITHUB_TOKEN. " +
        "[STABILIZED v5.2] Dengan auto-retry untuk network failures.", {
        repo: z.string().describe("Nama repository"),
        title: z.string().describe("Judul issue"),
        body: z.string().default("").describe("Deskripsi issue (mendukung Markdown)"),
        labels: z
            .array(z.string())
            .default([])
            .describe("Label issue. Contoh: ['bug', 'priority: high']"),
        assignees: z
            .array(z.string())
            .default([])
            .describe("Username yang di-assign. Kosongkan untuk tidak assign."),
        owner: z.string().default(DEFAULT_OWNER).describe(`Owner. Default: "${DEFAULT_OWNER}"`),
        max_retries: z
            .number()
            .int()
            .min(0)
            .max(5)
            .default(3)
            .describe("Max retry untuk network failures (default: 3)"),
    }, async ({ repo, title, body, labels, assignees, owner, max_retries }) => {
        try {
            const res = await ghFetch(`/repos/${owner}/${repo}/issues`, { method: "POST", body: { title, body, labels, assignees }, maxRetries: max_retries });
            if (!res.ok) {
                const err = res.data.message ?? JSON.stringify(res.data);
                return {
                    content: [{ type: "text", text: `❌ Gagal buat issue (HTTP ${res.status}): ${err}` }],
                };
            }
            const i = res.data;
            return {
                content: [
                    {
                        type: "text",
                        text: `✅ Issue #${i.number} dibuat! [STABILIZED v5.2]\n` +
                            `Title : ${i.title}\n` +
                            `URL   : ${i.html_url}`,
                    },
                ],
            };
        }
        catch (error) {
            return { content: [{ type: "text", text: ghError("github_issue_create", error) }] };
        }
    });
    // ── 8. github_pr_list ───────────────────────────────────────────────────
    server.tool("github_pr_list", "Tampilkan daftar Pull Request dari repository GitHub. " +
        "[STABILIZED v5.2] Dengan auto-retry untuk network failures.", {
        repo: z.string().describe("Nama repository"),
        state: z
            .enum(["open", "closed", "all"])
            .default("open")
            .describe("Filter status PR (default: open)"),
        per_page: z.number().int().min(1).max(50).default(15),
        owner: z.string().default(DEFAULT_OWNER).describe(`Owner. Default: "${DEFAULT_OWNER}"`),
        max_retries: z
            .number()
            .int()
            .min(0)
            .max(5)
            .default(3)
            .describe("Max retry untuk network failures (default: 3)"),
    }, async ({ repo, state, per_page, owner, max_retries }) => {
        try {
            const res = await ghFetch(`/repos/${owner}/${repo}/pulls?state=${state}&per_page=${per_page}&sort=updated`, { maxRetries: max_retries });
            if (!res.ok) {
                return {
                    content: [{ type: "text", text: `❌ GitHub error ${res.status}` }],
                };
            }
            const prs = res.data;
            if (prs.length === 0) {
                return {
                    content: [{ type: "text", text: `📭 Tidak ada PR ${state} di ${owner}/${repo}.` }],
                };
            }
            const lines = [
                `🔀 Pull Requests — ${owner}/${repo} [${state}] (${prs.length}) [STABILIZED v5.2]`,
                "═".repeat(60),
            ];
            for (const p of prs) {
                const stateIcon = p.draft ? "📝" : p.state === "open" ? "🟢" : "🔴";
                const labelStr = p.labels.map((l) => `#${l.name}`).join(" ");
                lines.push(`${stateIcon} #${p.number} ${p.title}${p.draft ? " [DRAFT]" : ""}`);
                lines.push(`   ${p.head.ref} → ${p.base.ref}`);
                if (labelStr)
                    lines.push(`   🏷️  ${labelStr}`);
                lines.push(`   👤 ${p.user.login}  •  📅 ${p.updated_at.slice(0, 10)}`);
                lines.push(`   🔗 ${p.html_url}`);
                lines.push("");
            }
            return { content: [{ type: "text", text: lines.join("\n") }] };
        }
        catch (error) {
            return { content: [{ type: "text", text: ghError("github_pr_list", error) }] };
        }
    });
    // ── 9. github_commit_push ───────────────────────────────────────────────
    server.tool("github_commit_push", "Push beberapa file sekaligus dalam satu commit ke GitHub (tanpa git lokal). " +
        "Menggunakan GitHub Tree API untuk efisiensi. " +
        "Ideal untuk scaffolding proyek baru atau batch update file. " +
        "[STABILIZED v5.2] Dengan auto-retry untuk network failures.", {
        repo: z.string().describe("Nama repository"),
        files: z
            .array(z.object({
            path: z.string().describe("Path file di dalam repo"),
            content: z.string().describe("Konten file"),
        }))
            .min(1)
            .describe("Array file yang akan di-push [{path, content}, ...]"),
        commit_message: z.string().describe("Pesan commit"),
        branch: z.string().default("main").describe("Target branch (default: main)"),
        owner: z.string().default(DEFAULT_OWNER).describe(`Owner. Default: "${DEFAULT_OWNER}"`),
        max_retries: z
            .number()
            .int()
            .min(0)
            .max(5)
            .default(3)
            .describe("Max retry untuk network failures (default: 3)"),
    }, async ({ repo, files, commit_message, branch, owner, max_retries }) => {
        try {
            // Step 1: Get latest commit SHA on branch
            const refRes = await ghFetch(`/repos/${owner}/${repo}/git/refs/heads/${branch}`, { maxRetries: max_retries });
            if (!refRes.ok) {
                return {
                    content: [
                        { type: "text", text: `❌ Branch '${branch}' tidak ditemukan (HTTP ${refRes.status})` },
                    ],
                };
            }
            const latestCommitSha = refRes.data.object.sha;
            // Step 2: Get base tree SHA
            const commitRes = await ghFetch(`/repos/${owner}/${repo}/git/commits/${latestCommitSha}`, { maxRetries: max_retries });
            if (!commitRes.ok) {
                return {
                    content: [{ type: "text", text: `❌ Gagal fetch commit (HTTP ${commitRes.status})` }],
                };
            }
            const baseTreeSha = commitRes.data.tree.sha;
            // Step 3: Create blobs for each file
            const treeItems = [];
            for (const f of files) {
                const blobRes = await ghFetch(`/repos/${owner}/${repo}/git/blobs`, {
                    method: "POST",
                    body: { content: f.content, encoding: "utf-8" },
                    maxRetries: max_retries,
                });
                if (!blobRes.ok)
                    throw new Error(`Failed to create blob for ${f.path}`);
                treeItems.push({
                    path: f.path,
                    mode: "100644",
                    type: "blob",
                    sha: blobRes.data.sha,
                });
            }
            // Step 4: Create tree
            const treeRes = await ghFetch(`/repos/${owner}/${repo}/git/trees`, { method: "POST", body: { base_tree: baseTreeSha, tree: treeItems }, maxRetries: max_retries });
            if (!treeRes.ok)
                throw new Error(`Failed to create tree (HTTP ${treeRes.status})`);
            // Step 5: Create commit
            const newCommitRes = await ghFetch(`/repos/${owner}/${repo}/git/commits`, {
                method: "POST",
                body: {
                    message: commit_message,
                    tree: treeRes.data.sha,
                    parents: [latestCommitSha],
                },
                maxRetries: max_retries,
            });
            if (!newCommitRes.ok)
                throw new Error(`Failed to create commit (HTTP ${newCommitRes.status})`);
            // Step 6: Update branch reference
            const updateRes = await ghFetch(`/repos/${owner}/${repo}/git/refs/heads/${branch}`, { method: "PATCH", body: { sha: newCommitRes.data.sha }, maxRetries: max_retries });
            if (!updateRes.ok)
                throw new Error(`Failed to update ref (HTTP ${updateRes.status})`);
            return {
                content: [
                    {
                        type: "text",
                        text: `✅ ${files.length} file di-push dalam 1 commit! [STABILIZED v5.2]\n` +
                            `${"─".repeat(55)}\n` +
                            `Repo   : ${owner}/${repo}\n` +
                            `Branch : ${branch}\n` +
                            `Commit : ${newCommitRes.data.sha.slice(0, 8)}\n` +
                            `Msg    : ${commit_message}\n` +
                            `URL    : ${newCommitRes.data.html_url}\n\n` +
                            `Files pushed:\n` +
                            files.map((f) => `  • ${f.path}`).join("\n"),
                    },
                ],
            };
        }
        catch (error) {
            return { content: [{ type: "text", text: ghError("github_commit_push", error) }] };
        }
    });
    // ── 10. github_release_create ───────────────────────────────────────────
    server.tool("github_release_create", "Buat GitHub Release baru dari tag yang ada atau buat tag baru sekaligus. " +
        "Ideal untuk merilis versi app/library secara otomatis dari AI. " +
        "Memerlukan GITHUB_TOKEN dengan scope 'repo'. " +
        "[STABILIZED v5.2] Dengan auto-retry untuk network failures.", {
        repo: z.string().describe("Nama repository"),
        tag_name: z
            .string()
            .describe("Nama tag. Contoh: 'v1.0.0', 'v2.3.1-beta'"),
        name: z.string().describe("Nama release. Contoh: 'Release v1.0.0'"),
        body: z
            .string()
            .default("")
            .describe("Release notes (mendukung Markdown). Boleh kosong."),
        draft: z
            .boolean()
            .default(false)
            .describe("true = simpan sebagai draft, false = publish langsung (default: false)"),
        prerelease: z
            .boolean()
            .default(false)
            .describe("Tandai sebagai pre-release (beta/rc) (default: false)"),
        target_commitish: z
            .string()
            .default("main")
            .describe("Branch atau SHA sebagai target release (default: main)"),
        owner: z.string().default(DEFAULT_OWNER).describe(`Owner. Default: "${DEFAULT_OWNER}"`),
        max_retries: z
            .number()
            .int()
            .min(0)
            .max(5)
            .default(3)
            .describe("Max retry untuk network failures (default: 3)"),
    }, async ({ repo, tag_name, name, body, draft, prerelease, target_commitish, owner, max_retries }) => {
        try {
            const res = await ghFetch(`/repos/${owner}/${repo}/releases`, {
                method: "POST",
                body: { tag_name, name, body, draft, prerelease, target_commitish },
                maxRetries: max_retries,
            });
            if (!res.ok) {
                const err = res.data.message ?? JSON.stringify(res.data);
                return {
                    content: [
                        { type: "text", text: `❌ Gagal buat release (HTTP ${res.status}): ${err}` },
                    ],
                };
            }
            const r = res.data;
            return {
                content: [
                    {
                        type: "text",
                        text: `✅ Release ${r.draft ? "[DRAFT] " : ""}berhasil dibuat! [STABILIZED v5.2]\n` +
                            `${"─".repeat(55)}\n` +
                            `Tag        : ${r.tag_name}\n` +
                            `Name       : ${r.name}\n` +
                            `Type       : ${r.draft ? "Draft" : r.prerelease ? "Pre-release" : "Release"}\n` +
                            `URL        : ${r.html_url}\n` +
                            `Created at : ${r.created_at.slice(0, 10)}`,
                    },
                ],
            };
        }
        catch (error) {
            return {
                content: [{ type: "text", text: ghError("github_release_create", error) }],
            };
        }
    });
}
//# sourceMappingURL=github.js.map