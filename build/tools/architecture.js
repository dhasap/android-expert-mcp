/**
 * Architecture & Planning Tools
 * ─────────────────────────────────────────────────────────────────────────────
 * Tools for reading project structures, managing documentation files,
 * and writing architecture notes / algorithm pseudocode.
 */
import { z } from "zod";
import * as fs from "fs/promises";
import * as path from "path";
import { buildDirectoryTree, safeReadFile, ensureDir, formatToolError, isSafePath, } from "../utils.js";
export function registerArchitectureTools(server) {
    // ── 1. read_project_structure ─────────────────────────────────────────────
    server.tool("read_project_structure", "Reads and returns the directory tree of a project folder. " +
        "Automatically ignores node_modules, .git, .gradle, and build artifacts.", {
        project_path: z
            .string()
            .describe("Absolute or relative path to the project root directory"),
        max_depth: z
            .number()
            .int()
            .min(1)
            .max(10)
            .default(5)
            .describe("Maximum depth of directory traversal (default: 5)"),
    }, async ({ project_path, max_depth }) => {
        try {
            const resolvedPath = path.resolve(project_path);
            // Validate the path exists and is a directory
            const stat = await fs.stat(resolvedPath);
            if (!stat.isDirectory()) {
                return {
                    content: [
                        {
                            type: "text",
                            text: `ERROR: '${resolvedPath}' is not a directory.`,
                        },
                    ],
                };
            }
            const tree = await buildDirectoryTree(resolvedPath, "", max_depth, 0);
            const output = `📂 Project Structure: ${resolvedPath}\n` +
                `${"─".repeat(60)}\n` +
                (tree || "  (empty directory)\n");
            return { content: [{ type: "text", text: output }] };
        }
        catch (error) {
            return {
                content: [
                    { type: "text", text: formatToolError("read_project_structure", error) },
                ],
            };
        }
    });
    // ── 2. read_file ──────────────────────────────────────────────────────────
    server.tool("read_file", "Reads the content of any file (source code, markdown, configs, etc.). " +
        "Files larger than 1 MB will be truncated with a notice.", {
        file_path: z
            .string()
            .describe("Absolute or relative path to the file to read"),
        max_size_kb: z
            .number()
            .int()
            .min(1)
            .max(10240)
            .default(1024)
            .describe("Maximum file size to read in KB (default: 1024 KB = 1 MB)"),
    }, async ({ file_path, max_size_kb }) => {
        try {
            const resolvedPath = path.resolve(file_path);
            // ── Path safety check ────────────────────────────────────────────
            const safety = isSafePath(resolvedPath);
            if (!safety.safe) {
                return {
                    content: [{
                            type: "text",
                            text: `🚫 read_file blocked: ${safety.reason}`,
                        }],
                };
            }
            const { content, truncated } = await safeReadFile(resolvedPath, max_size_kb * 1024);
            const ext = path.extname(resolvedPath).slice(1) || "text";
            const header = `📄 File: ${resolvedPath}\n` +
                `${"─".repeat(60)}\n` +
                (truncated ? "⚠️  File was truncated to fit size limit.\n\n" : "");
            return {
                content: [{ type: "text", text: header + content }],
            };
        }
        catch (error) {
            return {
                content: [{ type: "text", text: formatToolError("read_file", error) }],
            };
        }
    });
    // ── 3. write_file ─────────────────────────────────────────────────────────
    server.tool("write_file", "Creates a new file or completely overwrites an existing file with provided content. " +
        "Automatically creates parent directories if they don't exist. " +
        "Ideal for creating architecture docs, algorithm write-ups, or code files. " +
        "Blocked from writing to system directories (/etc, /var, ~/.ssh, etc.).", {
        file_path: z
            .string()
            .describe("Absolute or relative path where the file should be written"),
        content: z.string().describe("Full content to write into the file"),
        create_dirs: z
            .boolean()
            .default(true)
            .describe("Auto-create parent directories if missing (default: true)"),
        restrict_to_cwd: z
            .boolean()
            .default(false)
            .describe("If true, only allow writing inside the current working directory " +
            "(extra safety for automated pipelines). Default: false."),
    }, async ({ file_path, content, create_dirs, restrict_to_cwd }) => {
        try {
            const resolvedPath = path.resolve(file_path);
            const allowedRoot = restrict_to_cwd ? process.cwd() : undefined;
            // ── Path safety check ────────────────────────────────────────────
            const safety = isSafePath(resolvedPath, allowedRoot);
            if (!safety.safe) {
                return {
                    content: [{
                            type: "text",
                            text: `🚫 write_file blocked: ${safety.reason}`,
                        }],
                };
            }
            if (create_dirs) {
                await ensureDir(path.dirname(resolvedPath));
            }
            await fs.writeFile(resolvedPath, content, "utf-8");
            const stat = await fs.stat(resolvedPath);
            const sizeKb = (stat.size / 1024).toFixed(2);
            return {
                content: [
                    {
                        type: "text",
                        text: `✅ File written successfully.\n` +
                            `   Path : ${resolvedPath}\n` +
                            `   Size : ${sizeKb} KB\n` +
                            `   Lines: ${content.split("\n").length}`,
                    },
                ],
            };
        }
        catch (error) {
            return {
                content: [{ type: "text", text: formatToolError("write_file", error) }],
            };
        }
    });
    // ── 4. edit_file ──────────────────────────────────────────────────────────
    server.tool("edit_file", "Edits an existing file by replacing a specific substring with new content. " +
        "Use this for precise, surgical edits to code or documentation. " +
        "For larger rewrites, prefer write_file.", {
        file_path: z
            .string()
            .describe("Absolute or relative path to the file to edit"),
        search_text: z
            .string()
            .describe("Exact text to find in the file (must match exactly, including whitespace)"),
        replace_text: z
            .string()
            .describe("Text to replace the found match with"),
        replace_all: z
            .boolean()
            .default(false)
            .describe("Replace all occurrences (default: false — only replaces first match)"),
    }, async ({ file_path, search_text, replace_text, replace_all }) => {
        try {
            const resolvedPath = path.resolve(file_path);
            // ── Path safety check ────────────────────────────────────────────
            const safety = isSafePath(resolvedPath);
            if (!safety.safe) {
                return {
                    content: [{
                            type: "text",
                            text: `🚫 edit_file blocked: ${safety.reason}`,
                        }],
                };
            }
            const { content } = await safeReadFile(resolvedPath);
            if (!content.includes(search_text)) {
                return {
                    content: [
                        {
                            type: "text",
                            text: `ERROR [edit_file]: search_text not found in '${resolvedPath}'.\n` +
                                `Make sure the text matches exactly (including newlines and indentation).`,
                        },
                    ],
                };
            }
            const occurrences = content.split(search_text).length - 1;
            let newContent;
            if (replace_all) {
                newContent = content.split(search_text).join(replace_text);
            }
            else {
                newContent = content.replace(search_text, replace_text);
            }
            await fs.writeFile(resolvedPath, newContent, "utf-8");
            return {
                content: [
                    {
                        type: "text",
                        text: `✅ File edited successfully.\n` +
                            `   Path: ${resolvedPath}\n` +
                            `   Occurrences found: ${occurrences}\n` +
                            `   Occurrences replaced: ${replace_all ? occurrences : 1}`,
                    },
                ],
            };
        }
        catch (error) {
            return {
                content: [{ type: "text", text: formatToolError("edit_file", error) }],
            };
        }
    });
    // ── 5. create_architecture_doc ────────────────────────────────────────────
    server.tool("create_architecture_doc", "Creates a structured architecture documentation markdown file with standard sections: " +
        "Overview, Tech Stack, Module Breakdown, Data Flow, API Contracts, and Notes. " +
        "Saves to the specified path.", {
        output_path: z
            .string()
            .describe("Path where the .md file will be saved (e.g., docs/architecture.md)"),
        project_name: z.string().describe("Name of the project"),
        overview: z.string().describe("High-level description of the project"),
        tech_stack: z
            .array(z.string())
            .describe("List of technologies used (e.g., ['Kotlin', 'Jetpack Compose', 'Room DB'])"),
        modules: z
            .array(z.object({
            name: z.string(),
            description: z.string(),
            responsibilities: z.array(z.string()),
        }))
            .describe("List of modules/components with their responsibilities"),
        data_flow: z.string().describe("Description of the main data flow"),
        additional_notes: z
            .string()
            .optional()
            .describe("Any additional notes, constraints, or open questions"),
    }, async ({ output_path, project_name, overview, tech_stack, modules, data_flow, additional_notes }) => {
        try {
            const now = new Date().toISOString().split("T")[0];
            const moduleSection = modules
                .map((m) => `### ${m.name}\n` +
                `${m.description}\n\n` +
                `**Responsibilities:**\n` +
                m.responsibilities.map((r) => `- ${r}`).join("\n"))
                .join("\n\n");
            const techSection = tech_stack.map((t) => `- ${t}`).join("\n");
            const content = `# ${project_name} — Architecture Documentation\n\n` +
                `> Generated: ${now}\n\n` +
                `---\n\n` +
                `## 1. Overview\n\n${overview}\n\n` +
                `---\n\n` +
                `## 2. Tech Stack\n\n${techSection}\n\n` +
                `---\n\n` +
                `## 3. Module Breakdown\n\n${moduleSection}\n\n` +
                `---\n\n` +
                `## 4. Data Flow\n\n${data_flow}\n\n` +
                `---\n\n` +
                `## 5. API Contracts\n\n` +
                `_Document your API endpoints / interfaces here._\n\n` +
                `---\n\n` +
                `## 6. Additional Notes\n\n` +
                (additional_notes ?? "_None at this time._") +
                "\n";
            const resolvedPath = path.resolve(output_path);
            await ensureDir(path.dirname(resolvedPath));
            await fs.writeFile(resolvedPath, content, "utf-8");
            return {
                content: [
                    {
                        type: "text",
                        text: `✅ Architecture doc created: ${resolvedPath}`,
                    },
                ],
            };
        }
        catch (error) {
            return {
                content: [
                    { type: "text", text: formatToolError("create_architecture_doc", error) },
                ],
            };
        }
    });
    // ── 6. list_files ─────────────────────────────────────────────────────────
    server.tool("list_files", "Lists all files in a directory matching an optional glob-like extension filter.", {
        dir_path: z.string().describe("Path to directory"),
        extension: z
            .string()
            .optional()
            .describe("Filter by file extension, e.g. '.kt', '.xml', '.md'"),
        recursive: z
            .boolean()
            .default(false)
            .describe("Recursively list subdirectories (default: false)"),
    }, async ({ dir_path, extension, recursive }) => {
        try {
            const resolvedPath = path.resolve(dir_path);
            async function collectFiles(dir, depth) {
                if (depth > 10)
                    return [];
                const entries = await fs.readdir(dir, { withFileTypes: true });
                const results = [];
                for (const entry of entries) {
                    if (["node_modules", ".git", ".gradle", "build"].includes(entry.name))
                        continue;
                    const fullPath = path.join(dir, entry.name);
                    if (entry.isDirectory() && recursive) {
                        results.push(...(await collectFiles(fullPath, depth + 1)));
                    }
                    else if (entry.isFile()) {
                        if (!extension || entry.name.endsWith(extension)) {
                            results.push(fullPath);
                        }
                    }
                }
                return results;
            }
            const files = await collectFiles(resolvedPath, 0);
            const output = `📁 Files in ${resolvedPath}` +
                (extension ? ` (filter: *${extension})` : "") +
                `\n${"─".repeat(60)}\n` +
                (files.length > 0
                    ? files.map((f) => `  • ${f}`).join("\n")
                    : "  (no files found)");
            return { content: [{ type: "text", text: output }] };
        }
        catch (error) {
            return {
                content: [{ type: "text", text: formatToolError("list_files", error) }],
            };
        }
    });
}
//# sourceMappingURL=architecture.js.map