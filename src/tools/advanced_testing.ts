/**
 * 🧪 Advanced Testing Tools — v5.3
 * API Testing, Performance Profiling, Security Audit, Push Notification Testing
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import * as http from "http";
import * as https from "https";
import { runCommand, runAdbCommand, formatToolError, ensureDir, truncateOutput } from "../utils.js";

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 1: API TESTING
// ═══════════════════════════════════════════════════════════════════════════

async function makeHttpRequest(
  url: string,
  method: string,
  headers: Record<string, string>,
  body?: string,
  timeoutMs: number = 30000
): Promise<{ status: number; headers: Record<string, string>; body: string; timeMs: number }> {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    const urlObj = new URL(url);
    const isHttps = urlObj.protocol === "https:";
    const client = isHttps ? https : http;

    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || (isHttps ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: method.toUpperCase(),
      headers: {
        "User-Agent": "Android-Expert-MCP/5.3",
        ...headers,
      },
      timeout: timeoutMs,
    };

    const req = client.request(options, (res) => {
      let data = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        resolve({
          status: res.statusCode || 0,
          headers: res.headers as Record<string, string>,
          body: data,
          timeMs: Date.now() - startTime,
        });
      });
    });

    req.on("error", (err) => reject(err));
    req.on("timeout", () => {
      req.destroy();
      reject(new Error(`Request timeout after ${timeoutMs}ms`));
    });

    if (body) req.write(body);
    req.end();
  });
}

// Global mock servers storage
const mockServers = new Map<string, { server: http.Server; port: number; routes: Map<string, any> }>();

export function registerAdvancedTestingTools(server: McpServer): void {
  
  // ── 1. api_send_request ─────────────────────────────────────────────────
  server.tool(
    "api_send_request",
    "Kirim HTTP request (GET, POST, PUT, DELETE, PATCH) dengan custom headers dan body.",
    {
      url: z.string().describe("URL endpoint"),
      method: z.enum(["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"]).default("GET"),
      headers: z.record(z.string()).default({}),
      body: z.string().optional(),
      timeout_seconds: z.number().int().min(1).max(300).default(30),
    },
    async ({ url, method, headers, body, timeout_seconds }) => {
      try {
        const result = await makeHttpRequest(url, method, headers, body, timeout_seconds * 1000);
        
        let formattedBody = result.body;
        try {
          const parsed = JSON.parse(result.body);
          formattedBody = JSON.stringify(parsed, null, 2);
        } catch {}

        const lines = [
          `🌐 API Request — ${method} ${url}`,
          "═".repeat(60),
          `⏱️  Response Time: ${result.timeMs}ms`,
          `📊 Status Code: ${result.status} ${result.status >= 200 && result.status < 300 ? "✅" : "❌"}`,
          "─".repeat(60),
          "📋 Response Headers:",
          ...Object.entries(result.headers).slice(0, 10).map(([k, v]) => `  ${k}: ${v}`),
          "─".repeat(60),
          `📄 Response Body (${result.body.length} bytes):`,
          truncateOutput(formattedBody, 10000),
        ];

        return { content: [{ type: "text", text: lines.join("\n") }] };
      } catch (error) {
        return { content: [{ type: "text", text: formatToolError("api_send_request", error) }] };
      }
    }
  );

  // ── 2. api_mock_server ──────────────────────────────────────────────────
  server.tool(
    "api_mock_server",
    "Start/stop mock HTTP server untuk testing.",
    {
      action: z.enum(["start", "stop", "add_route", "list"]).describe("Action"),
      server_id: z.string().default("default"),
      port: z.number().int().min(1024).max(65535).optional(),
      route: z.string().optional(),
      method: z.enum(["GET", "POST", "PUT", "DELETE"]).default("GET"),
      status_code: z.number().int().default(200),
      response_body: z.string().default('{"message": "OK"}'),
    },
    async ({ action, server_id, port, route, method, status_code, response_body }) => {
      try {
        const lines: string[] = [`🎭 Mock Server — ${action.toUpperCase()}`];

        switch (action) {
          case "start": {
            if (mockServers.has(server_id)) {
              const existing = mockServers.get(server_id)!;
              lines.push(`⚠️ Server '${server_id}' already running on port ${existing.port}`);
              break;
            }

            const serverPort = port || (3000 + Math.floor(Math.random() * 1000));
            const routes = new Map();
            
            const httpServer = http.createServer((req, res) => {
              const key = `${req.method}:${req.url}`;
              const config = routes.get(key);
              
              if (config) {
                res.writeHead(config.status, { "Content-Type": "application/json" });
                res.end(config.body);
              } else {
                res.writeHead(404);
                res.end(JSON.stringify({ error: "Route not found" }));
              }
            });

            await new Promise<void>((resolve, reject) => {
              httpServer.listen(serverPort, () => resolve());
              httpServer.on("error", reject);
            });

            mockServers.set(server_id, { server: httpServer, port: serverPort, routes });
            lines.push(`✅ Server '${server_id}' started at http://localhost:${serverPort}`);
            break;
          }

          case "stop": {
            const mockServer = mockServers.get(server_id);
            if (!mockServer) {
              lines.push(`❌ Server '${server_id}' not found`);
            } else {
              mockServer.server.close();
              mockServers.delete(server_id);
              lines.push(`✅ Server '${server_id}' stopped`);
            }
            break;
          }

          case "add_route": {
            if (!route) {
              lines.push("❌ Parameter 'route' required");
            } else {
              const mockServer = mockServers.get(server_id);
              if (!mockServer) {
                lines.push(`❌ Server '${server_id}' not found`);
              } else {
                const key = `${method}:${route}`;
                mockServer.routes.set(key, { status: status_code, body: response_body });
                lines.push(`✅ Route added: ${method} ${route} -> ${status_code}`);
              }
            }
            break;
          }

          case "list": {
            lines.push("📋 Active Mock Servers:");
            if (mockServers.size === 0) {
              lines.push("   (no active servers)");
            } else {
              for (const [id, ms] of mockServers) {
                lines.push(`   • ${id} -> http://localhost:${ms.port} (${ms.routes.size} routes)`);
              }
            }
            break;
          }
        }

        return { content: [{ type: "text", text: lines.join("\n") }] };
      } catch (error) {
        return { content: [{ type: "text", text: formatToolError("api_mock_server", error) }] };
      }
    }
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 2: PERFORMANCE PROFILING
  // ═══════════════════════════════════════════════════════════════════════════

  const PERF_DATA_DIR = path.join(os.tmpdir(), "android-expert-mcp", "perf-data");

  // ── 3. profile_memory ───────────────────────────────────────────────────
  server.tool(
    "profile_memory",
    "Analisis memory usage aplikasi Android. Deteksi memory leaks.",
    {
      device_serial: z.string().optional(),
      package_name: z.string(),
      duration_seconds: z.number().int().min(5).max(300).default(30),
      sample_interval_seconds: z.number().int().min(1).max(10).default(2),
    },
    async ({ device_serial, package_name, duration_seconds, sample_interval_seconds }) => {
      try {
        await ensureDir(PERF_DATA_DIR);
        const flag = device_serial ? `-s ${device_serial}` : "";
        
        const lines: string[] = [
          `🧠 Memory Profile — ${package_name}`,
          "═".repeat(60),
          `⏱️  Duration: ${duration_seconds}s (sample every ${sample_interval_seconds}s)`,
          "",
          "📊 Sampling memory...",
        ];

        const samples: any[] = [];
        const startTime = Date.now();
        
        while (Date.now() - startTime < duration_seconds * 1000) {
          const memResult = await runAdbCommand(
            `adb ${flag} shell dumpsys meminfo ${package_name} | grep -E "TOTAL PSS|TOTAL PRIVATE|Java Heap:"`,
            undefined,
            5000
          );
          
          if (memResult.exitCode === 0) {
            const pssMatch = memResult.stdout.match(/TOTAL PSS:\s*(\d+)/);
            const heapMatch = memResult.stdout.match(/Java Heap:\s*(\d+)/);
            
            const sample = {
              time: Math.round((Date.now() - startTime) / 1000),
              pss: parseInt(pssMatch?.[1] || "0"),
              heap: parseInt(heapMatch?.[1] || "0"),
            };
            
            samples.push(sample);
            lines.push(`   [${sample.time}s] PSS: ${(sample.pss / 1024).toFixed(1)}MB, Heap: ${(sample.heap / 1024).toFixed(1)}MB`);
          }
          
          await new Promise(r => setTimeout(r, sample_interval_seconds * 1000));
        }

        // Analysis
        lines.push("");
        lines.push("📈 Analysis:");
        
        if (samples.length > 1) {
          const first = samples[0];
          const last = samples[samples.length - 1];
          const pssGrowth = (last.pss - first.pss) / 1024;
          const heapGrowth = (last.heap - first.heap) / 1024;
          
          lines.push(`   PSS Growth: ${pssGrowth > 0 ? "📈" : "📉"} ${pssGrowth.toFixed(1)}MB`);
          lines.push(`   Heap Growth: ${heapGrowth > 0 ? "📈" : "📉"} ${heapGrowth.toFixed(1)}MB`);
          
          if (pssGrowth > 10) lines.push("   ⚠️  WARNING: Possible memory leak!");
        }

        return { content: [{ type: "text", text: lines.join("\n") }] };
      } catch (error) {
        return { content: [{ type: "text", text: formatToolError("profile_memory", error) }] };
      }
    }
  );

  // ── 4. profile_cpu ──────────────────────────────────────────────────────
  server.tool(
    "profile_cpu",
    "CPU profiling untuk aplikasi Android.",
    {
      device_serial: z.string().optional(),
      package_name: z.string(),
      duration_seconds: z.number().int().min(5).max(120).default(10),
    },
    async ({ device_serial, package_name, duration_seconds }) => {
      try {
        const flag = device_serial ? `-s ${device_serial}` : "";
        
        const lines: string[] = [
          `🔥 CPU Profile — ${package_name}`,
          "═".repeat(60),
          `⏱️  Profiling for ${duration_seconds}s...`,
          "",
        ];

        // Basic CPU monitoring via top
        const topResult = await runAdbCommand(
          `adb ${flag} shell "top -p $(pidof ${package_name}) -b -n ${Math.min(duration_seconds, 10)} 2>/dev/null | head -30"`,
          undefined,
          (duration_seconds + 5) * 1000
        );

        lines.push("📈 CPU Usage:");
        lines.push(truncateOutput(topResult.stdout, 5000));

        return { content: [{ type: "text", text: lines.join("\n") }] };
      } catch (error) {
        return { content: [{ type: "text", text: formatToolError("profile_cpu", error) }] };
      }
    }
  );

  // ── 5. profile_battery ──────────────────────────────────────────────────
  server.tool(
    "profile_battery",
    "Analisis battery drain aplikasi Android.",
    {
      device_serial: z.string().optional(),
      package_name: z.string(),
      reset_stats: z.boolean().default(false),
    },
    async ({ device_serial, package_name, reset_stats }) => {
      try {
        const flag = device_serial ? `-s ${device_serial}` : "";
        
        if (reset_stats) {
          await runAdbCommand(`adb ${flag} shell dumpsys batterystats --reset`, undefined, 5000);
        }

        const lines: string[] = [
          `🔋 Battery Profile — ${package_name}`,
          "═".repeat(60),
          "",
        ];

        const statsResult = await runAdbCommand(
          `adb ${flag} shell dumpsys batterystats ${package_name} | head -100`,
          undefined,
          15000
        );

        lines.push("📊 Battery Stats:");
        lines.push(truncateOutput(statsResult.stdout, 8000));

        return { content: [{ type: "text", text: lines.join("\n") }] };
      } catch (error) {
        return { content: [{ type: "text", text: formatToolError("profile_battery", error) }] };
      }
    }
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 3: SECURITY AUDIT
  // ═══════════════════════════════════════════════════════════════════════════

  // ── 6. scan_dependencies ────────────────────────────────────────────────
  server.tool(
    "scan_dependencies",
    "Scan dependencies untuk mencari known vulnerabilities.",
    {
      project_path: z.string(),
      build_system: z.enum(["gradle", "npm", "pip", "auto"]).default("auto"),
    },
    async ({ project_path, build_system }) => {
      try {
        const resolvedPath = path.resolve(project_path);
        const lines: string[] = [
          `🔒 Dependency Security Scan`,
          "═".repeat(60),
          `📁 Project: ${resolvedPath}`,
          "",
        ];

        // Auto-detect
        let detected = build_system;
        if (build_system === "auto") {
          const files = await fs.readdir(resolvedPath).catch(() => [] as string[]);
          if (files.includes("package.json")) detected = "npm";
          else if (files.includes("build.gradle")) detected = "gradle";
          else if (files.includes("requirements.txt")) detected = "pip";
        }

        lines.push(`🔧 Build System: ${detected}`);

        if (detected === "npm") {
          const auditResult = await runCommand("npm audit --json 2>&1 || true", resolvedPath, 60000);
          try {
            const auditData = JSON.parse(auditResult.stdout);
            const vulns = auditData.vulnerabilities || {};
            lines.push(`\n📊 Found ${Object.keys(vulns).length} packages with vulnerabilities`);
            
            for (const [pkg, info] of Object.entries(vulns).slice(0, 10)) {
              const infoAny = info as any;
              lines.push(`   ⚠️  ${pkg}: ${infoAny.severity}`);
            }
            
            lines.push("\n💡 Fix: npm audit fix");
          } catch {
            lines.push("\n⚠️  Could not parse npm audit");
          }
        } else {
          lines.push("\n💡 For gradle: add OWASP dependency-check plugin");
          lines.push("   For pip: install 'safety' and run 'safety check'");
        }

        return { content: [{ type: "text", text: lines.join("\n") }] };
      } catch (error) {
        return { content: [{ type: "text", text: formatToolError("scan_dependencies", error) }] };
      }
    }
  );

  // ── 7. extract_secrets ──────────────────────────────────────────────────
  server.tool(
    "extract_secrets",
    "Scan source code untuk hardcoded secrets.",
    {
      source_path: z.string(),
    },
    async ({ source_path }) => {
      try {
        const resolvedPath = path.resolve(source_path);
        const lines: string[] = [
          `🔑 Secret Detection`,
          "═".repeat(60),
          `📁 Source: ${resolvedPath}`,
          "",
          "🔍 Scanning for secrets...",
        ];

        // Simple secret patterns
        const patterns = [
          { type: "AWS Key", pattern: /AKIA[0-9A-Z]{16}/ },
          { type: "Private Key", pattern: /-----BEGIN (RSA )?PRIVATE KEY-----/ },
          { type: "GitHub Token", pattern: /ghp_[A-Za-z0-9_]{36}/ },
          { type: "Password", pattern: /password\s*=\s*["'][^"']{4,}["']/i },
        ];

        const secrets: string[] = [];
        
        // Find files
        const findResult = await runCommand(
          `find "${resolvedPath}" -type f \( -name "*.kt" -o -name "*.java" -o -name "*.js" -o -name "*.ts" -o -name "*.py" \) 2>/dev/null | head -50`,
          undefined,
          10000
        );

        for (const file of findResult.stdout.split("\n").filter(f => f.trim())) {
          try {
            const content = await fs.readFile(file, "utf-8");
            for (const { type, pattern } of patterns) {
              if (pattern.test(content)) {
                secrets.push(`   ⚠️  ${type} in ${path.relative(resolvedPath, file)}`);
              }
            }
          } catch {}
        }

        if (secrets.length > 0) {
          lines.push("\n🚨 Potential Secrets Found:");
          lines.push(...secrets.slice(0, 20));
        } else {
          lines.push("\n✅ No obvious secrets found");
        }

        return { content: [{ type: "text", text: lines.join("\n") }] };
      } catch (error) {
        return { content: [{ type: "text", text: formatToolError("extract_secrets", error) }] };
      }
    }
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 4: PUSH NOTIFICATION TESTING
  // ═══════════════════════════════════════════════════════════════════════════

  // ── 8. send_fcm_message ────────────────────────────────────────────────
  server.tool(
    "send_fcm_message",
    "Kirim push notification test via FCM.",
    {
      device_token: z.string(),
      title: z.string().default("Test Notification"),
      body: z.string().default("This is a test"),
      fcm_server_key: z.string().optional(),
    },
    async ({ device_token, title, body, fcm_server_key }) => {
      try {
        const apiKey = fcm_server_key || process.env.FCM_SERVER_KEY;
        
        if (!apiKey) {
          return {
            content: [{
              type: "text",
              text: "❌ FCM Server Key not found. Set FCM_SERVER_KEY env var."
            }],
          };
        }

        const result = await makeHttpRequest(
          "https://fcm.googleapis.com/fcm/send",
          "POST",
          { "Content-Type": "application/json", "Authorization": `key=${apiKey}` },
          JSON.stringify({ to: device_token, notification: { title, body } }),
          30000
        );

        const lines = [
          `📲 FCM Push Notification`,
          "═".repeat(60),
          `📍 Token: ${device_token.slice(0, 20)}...`,
          `📝 Title: ${title}`,
          `💬 Body: ${body}`,
          "",
          `📊 Response: ${result.status}`,
          `⏱️  Time: ${result.timeMs}ms`,
          result.status === 200 ? "✅ Sent successfully!" : `❌ Failed: ${result.body}`,
        ];

        return { content: [{ type: "text", text: lines.join("\n") }] };
      } catch (error) {
        return { content: [{ type: "text", text: formatToolError("send_fcm_message", error) }] };
      }
    }
  );

  // ── 9. simulate_deep_link ──────────────────────────────────────────────
  server.tool(
    "simulate_deep_link",
    "Simulate deep link di emulator.",
    {
      device_serial: z.string().optional(),
      deep_link_url: z.string(),
      package_name: z.string().optional(),
    },
    async ({ device_serial, deep_link_url, package_name }) => {
      try {
        const flag = device_serial ? `-s ${device_serial}` : "";
        
        const lines: string[] = [
          `🔗 Deep Link Simulation`,
          "═".repeat(60),
          `📍 URL: ${deep_link_url}`,
          "",
        ];

        const cmd = package_name
          ? `adb ${flag} shell am start -W -a android.intent.action.VIEW -d "${deep_link_url}" ${package_name}`
          : `adb ${flag} shell am start -W -a android.intent.action.VIEW -d "${deep_link_url}"`;

        const result = await runAdbCommand(cmd, undefined, 30000);
        
        if (result.exitCode === 0) {
          lines.push("✅ Deep link opened successfully!");
          lines.push(truncateOutput(result.stdout, 3000));
        } else {
          lines.push("❌ Failed to open deep link");
          lines.push(result.stderr);
        }

        return { content: [{ type: "text", text: lines.join("\n") }] };
      } catch (error) {
        return { content: [{ type: "text", text: formatToolError("simulate_deep_link", error) }] };
      }
    }
  );

  // ── 10. test_notification_ui ────────────────────────────────────────────
  server.tool(
    "test_notification_ui",
    "Test notification UI - screenshot panel atau list notifications.",
    {
      device_serial: z.string().optional(),
      action: z.enum(["screenshot_panel", "list_notifications"]).default("screenshot_panel"),
    },
    async ({ device_serial, action }) => {
      try {
        const flag = device_serial ? `-s ${device_serial}` : "";
        
        const lines: string[] = [
          `🔔 Notification UI Test — ${action}`,
          "═".repeat(60),
          "",
        ];

        if (action === "screenshot_panel") {
          // Open notification panel
          await runAdbCommand(`adb ${flag} shell input swipe 500 10 500 1000 300`, undefined, 5000);
          await new Promise(r => setTimeout(r, 500));
          
          const ssPath = path.join(os.tmpdir(), "mcp-emulator", `notif_${Date.now()}.png`);
          const remoteSs = `/sdcard/notif_ss_${Date.now()}.png`;
          
          await runAdbCommand(`adb ${flag} shell screencap -p ${remoteSs}`, undefined, 10000);
          await runAdbCommand(`adb ${flag} pull ${remoteSs} "${ssPath}"`, undefined, 10000);
          await runAdbCommand(`adb ${flag} shell rm ${remoteSs}`, undefined, 5000);
          
          // Close panel
          await runAdbCommand(`adb ${flag} shell cmd statusbar collapse`, undefined, 5000);
          
          lines.push(`✅ Screenshot saved: ${ssPath}`);
        } else {
          const notifResult = await runAdbCommand(
            `adb ${flag} shell dumpsys notification | head -50`,
            undefined,
            10000
          );
          lines.push("📋 Notifications:");
          lines.push(truncateOutput(notifResult.stdout, 5000));
        }

        return { content: [{ type: "text", text: lines.join("\n") }] };
      } catch (error) {
        return { content: [{ type: "text", text: formatToolError("test_notification_ui", error) }] };
      }
    }
  );
}
