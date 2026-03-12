/**
 * Browser Control Tools — Full Interactive Browser Session
 * ─────────────────────────────────────────────────────────────────────────────
 * Persistent browser sessions yang bisa dikendalikan step-by-step oleh AI:
 *   • Buka URL, navigasi, back/forward
 *   • Klik elemen via CSS selector atau XPath
 *   • Isi form, type text, select dropdown, checkbox
 *   • Scroll halaman atau elemen tertentu
 *   • Ambil screenshot saat ini (untuk "melihat" kondisi browser)
 *   • Tunggu elemen muncul / menghilang
 *   • Eksekusi JavaScript arbitrary
 *   • Kelola multiple tab
 *   • Download file
 *   • Handle dialog (alert, confirm, prompt)
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import { formatToolError, ensureDir } from "../utils.js";

// ─── Session Manager ──────────────────────────────────────────────────────────
// Menyimpan browser instances agar AI bisa lanjut dari session yang sama

interface BrowserSession {
  browser: import("puppeteer").Browser;
  pages: Map<string, import("puppeteer").Page>;
  activePageId: string;
  createdAt: Date;
  lastUsedAt: Date;
  userAgent: string;
}

const sessions = new Map<string, BrowserSession>();
const SESSION_TTL_MS = 30 * 60 * 1000; // 30 menit

// Auto-cleanup session yang idle
setInterval(() => {
  const now = Date.now();
  for (const [id, session] of sessions.entries()) {
    if (now - session.lastUsedAt.getTime() > SESSION_TTL_MS) {
      session.browser.close().catch(() => null);
      sessions.delete(id);
      process.stderr.write(`[browser] Session ${id} expired and cleaned up\n`);
    }
  }
}, 5 * 60 * 1000);

function generateSessionId(): string {
  return `session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

async function getSession(sessionId: string): Promise<BrowserSession | null> {
  const session = sessions.get(sessionId);
  if (!session) return null;
  session.lastUsedAt = new Date();
  return session;
}

async function getActivePage(sessionId: string): Promise<{
  page: import("puppeteer").Page;
  session: BrowserSession;
} | null> {
  const session = await getSession(sessionId);
  if (!session) return null;
  const page = session.pages.get(session.activePageId);
  if (!page) return null;
  return { page, session };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function takePageScreenshot(
  page: import("puppeteer").Page,
  label: string = "screenshot"
): Promise<string> {
  const dir = path.join(os.tmpdir(), "mcp-browser-screenshots");
  await ensureDir(dir);
  const timestamp = Date.now();
  const filePath = path.join(dir, `${label}_${timestamp}.png`);
  await page.screenshot({
    path: filePath as `${string}.png`,
    fullPage: false, // viewport only untuk kecepatan
    type: "png",
  });
  return filePath;
}

async function getPageInfo(page: import("puppeteer").Page): Promise<string> {
  try {
    const url = page.url();
    const title = await page.title();
    const viewport = page.viewport();
    return `URL: ${url}\nTitle: ${title}\nViewport: ${viewport?.width ?? "?"}×${viewport?.height ?? "?"}`;
  } catch {
    return "Page info unavailable";
  }
}

// ─── Tool registration ────────────────────────────────────────────────────────

export function registerBrowserTools(server: McpServer): void {
  // ── 1. browser_open ───────────────────────────────────────────────────────
  server.tool(
    "browser_open",
    "Membuka browser baru dan navigasi ke URL. Membuat 'session' yang bisa " +
      "dilanjutkan dengan tools browser lainnya. Kembalikan session_id yang " +
      "harus disimpan untuk operasi selanjutnya. " +
      "GUNAKAN INI PERTAMA KALI sebelum tools browser lainnya.",
    {
      url: z
        .string()
        .describe("URL yang ingin dibuka, misal 'https://google.com'"),
      session_id: z
        .string()
        .optional()
        .describe(
          "ID session yang sudah ada (untuk reuse browser). " +
            "Kosongkan untuk membuat session baru."
        ),
      device: z
        .enum(["desktop", "mobile", "tablet"])
        .default("desktop")
        .describe("Preset device viewport"),
      stealth: z
        .boolean()
        .default(true)
        .describe("Aktifkan mode stealth (anti-bot detection)"),
      wait_until: z
        .enum(["load", "domcontentloaded", "networkidle0", "networkidle2"])
        .default("networkidle2")
        .describe("Kondisi untuk menunggu sebelum selesai"),
      timeout_seconds: z
        .number()
        .int()
        .min(5)
        .max(120)
        .default(30)
        .describe("Timeout navigasi dalam detik"),
      take_screenshot: z
        .boolean()
        .default(true)
        .describe("Ambil screenshot setelah halaman terbuka"),
    },
    async ({
      url,
      session_id,
      device,
      stealth,
      wait_until,
      timeout_seconds,
      take_screenshot: doScreenshot,
    }) => {
      try {
        const puppeteer = await import("puppeteer");

        const viewports = {
          desktop: { width: 1440, height: 900, isMobile: false, deviceScaleFactor: 1 },
          mobile: { width: 390, height: 844, isMobile: true, deviceScaleFactor: 3 },
          tablet: { width: 768, height: 1024, isMobile: true, deviceScaleFactor: 2 },
        };
        const vp = viewports[device];

        let session: BrowserSession;

        // Reuse session jika ada
        if (session_id && sessions.has(session_id)) {
          session = sessions.get(session_id)!;
          session.lastUsedAt = new Date();
          const page = session.pages.get(session.activePageId)!;

          await page.goto(url, {
            waitUntil: wait_until,
            timeout: timeout_seconds * 1000,
          });
        } else {
          // Buat session baru
          const browser = await puppeteer.default.launch({
            headless: true,
            args: [
              "--no-sandbox",
              "--disable-setuid-sandbox",
              "--disable-dev-shm-usage",
              "--disable-gpu",
              "--disable-web-security",
              "--disable-features=VizDisplayCompositor",
              ...(stealth
                ? [
                    "--disable-blink-features=AutomationControlled",
                    "--disable-extensions",
                  ]
                : []),
            ],
          });

          const page = await browser.newPage();
          await page.setViewport(vp);

          const userAgent =
            device === "mobile"
              ? "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
              : "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

          await page.setUserAgent(userAgent);

          if (stealth) {
            await page.evaluateOnNewDocument(() => {
              Object.defineProperty(navigator, "webdriver", { get: () => false });
              Object.defineProperty(navigator, "plugins", { get: () => [1, 2, 3] });
              // @ts-ignore
              window.chrome = { runtime: {} };
            });
            await page.setExtraHTTPHeaders({
              "Accept-Language": "en-US,en;q=0.9,id;q=0.8",
            });
          }

          // Handle dialogs otomatis
          page.on("dialog", async (dialog) => {
            process.stderr.write(
              `[browser] Dialog: ${dialog.type()} — "${dialog.message()}"\n`
            );
            await dialog.accept();
          });

          const newSessionId = session_id ?? generateSessionId();
          const pageId = "page_1";

          session = {
            browser,
            pages: new Map([[pageId, page]]),
            activePageId: pageId,
            createdAt: new Date(),
            lastUsedAt: new Date(),
            userAgent,
          };
          sessions.set(newSessionId, session);

          // Perlu set session_id untuk response
          (session as BrowserSession & { _id?: string })._id = newSessionId;

          await page.goto(url, {
            waitUntil: wait_until,
            timeout: timeout_seconds * 1000,
          });
        }

        const activeSession = session_id ?? (session as BrowserSession & { _id?: string })._id!;
        const page = session.pages.get(session.activePageId)!;
        const pageInfo = await getPageInfo(page);

        let screenshotInfo = "";
        if (doScreenshot) {
          const ssPath = await takePageScreenshot(page, "open");
          screenshotInfo = `\n📸 Screenshot: ${ssPath}`;
        }

        // Cari session ID yang benar
        let foundId = session_id;
        if (!foundId) {
          for (const [id, s] of sessions.entries()) {
            if (s === session) {
              foundId = id;
              break;
            }
          }
        }

        return {
          content: [
            {
              type: "text",
              text:
                `✅ Browser dibuka!\n` +
                `${"─".repeat(50)}\n` +
                `🔑 SESSION ID: ${foundId}\n` +
                `   ⚠️  SIMPAN session_id ini untuk operasi selanjutnya!\n\n` +
                `${pageInfo}` +
                `\n📱 Device  : ${device} (${vp.width}×${vp.height})` +
                `\n🛡️  Stealth : ${stealth}` +
                screenshotInfo,
            },
          ],
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: formatToolError("browser_open", error) }],
        };
      }
    }
  );

  // ── 2. browser_screenshot ─────────────────────────────────────────────────
  server.tool(
    "browser_screenshot",
    "Ambil screenshot dari browser session yang sedang aktif. " +
      "Gunakan ini untuk 'melihat' kondisi halaman saat ini — " +
      "sangat penting untuk verifikasi setelah klik/navigasi/scroll.",
    {
      session_id: z.string().describe("Session ID dari browser_open"),
      full_page: z
        .boolean()
        .default(false)
        .describe("Screenshot seluruh halaman (false = hanya viewport)"),
      label: z
        .string()
        .default("view")
        .describe("Label untuk nama file screenshot"),
    },
    async ({ session_id, full_page, label }) => {
      try {
        const result = await getActivePage(session_id);
        if (!result) {
          return {
            content: [
              {
                type: "text",
                text:
                  `❌ Session '${session_id}' tidak ditemukan atau sudah expired.\n` +
                  `Gunakan browser_open untuk membuat session baru.`,
              },
            ],
          };
        }

        const { page } = result;
        const dir = path.join(os.tmpdir(), "mcp-browser-screenshots");
        await ensureDir(dir);
        const filePath = path.join(dir, `${label}_${Date.now()}.png`);

        await page.screenshot({
          path: filePath as `${string}.png`,
          fullPage: full_page,
          type: "png",
        });

        const stat = await fs.stat(filePath);
        const sizeKb = (stat.size / 1024).toFixed(1);
        const pageInfo = await getPageInfo(page);

        return {
          content: [
            {
              type: "text",
              text:
                `📸 Screenshot diambil!\n` +
                `${"─".repeat(50)}\n` +
                `${pageInfo}\n` +
                `\n💾 Disimpan ke: ${filePath}` +
                `\n📏 Ukuran    : ${sizeKb} KB` +
                `\n📄 Full page : ${full_page}`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: formatToolError("browser_screenshot", error) }],
        };
      }
    }
  );

  // ── 3. browser_click ──────────────────────────────────────────────────────
  server.tool(
    "browser_click",
    "Klik elemen di halaman menggunakan CSS selector. " +
      "Otomatis scroll ke elemen, tunggu hingga clickable, lalu klik. " +
      "Setelah klik, ambil screenshot untuk verifikasi.",
    {
      session_id: z.string().describe("Session ID"),
      selector: z
        .string()
        .describe(
          "CSS selector elemen yang diklik. Contoh: '#submit-btn', " +
            "'.nav-link:first-child', 'button[type=\"submit\"]', 'a[href=\"/login\"]'"
        ),
      wait_after_ms: z
        .number()
        .int()
        .min(0)
        .max(10000)
        .default(1000)
        .describe("Tunggu X ms setelah klik (default: 1000)"),
      take_screenshot: z
        .boolean()
        .default(true)
        .describe("Ambil screenshot setelah klik"),
      timeout_ms: z
        .number()
        .int()
        .min(1000)
        .max(30000)
        .default(10000)
        .describe("Timeout menunggu elemen (ms)"),
      click_count: z
        .number()
        .int()
        .min(1)
        .max(3)
        .default(1)
        .describe("Jumlah klik (1=single, 2=double)"),
    },
    async ({ session_id, selector, wait_after_ms, take_screenshot: doScreenshot, timeout_ms, click_count }) => {
      try {
        const result = await getActivePage(session_id);
        if (!result) {
          return {
            content: [
              { type: "text", text: `❌ Session '${session_id}' tidak ditemukan.` },
            ],
          };
        }

        const { page } = result;

        // Tunggu elemen muncul
        await page.waitForSelector(selector, {
          visible: true,
          timeout: timeout_ms,
        });

        // Scroll ke elemen
        await page.evaluate((sel: string) => {
          const el = document.querySelector(sel);
          el?.scrollIntoView({ behavior: "smooth", block: "center" });
        }, selector);

        await new Promise((r) => setTimeout(r, 300));

        // Klik
        await page.click(selector, { clickCount: click_count });

        if (wait_after_ms > 0) {
          await new Promise((r) => setTimeout(r, wait_after_ms));
        }

        const pageInfo = await getPageInfo(page);

        let ssInfo = "";
        if (doScreenshot) {
          const ssPath = await takePageScreenshot(page, "after_click");
          ssInfo = `\n📸 Screenshot: ${ssPath}`;
        }

        return {
          content: [
            {
              type: "text",
              text:
                `✅ Klik berhasil!\n` +
                `${"─".repeat(50)}\n` +
                `🎯 Selector : ${selector}\n` +
                `🖱️  Klik ke  : ${click_count}\n\n` +
                `${pageInfo}` +
                ssInfo,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            { type: "text", text: formatToolError("browser_click", error) },
          ],
        };
      }
    }
  );

  // ── 4. browser_type ───────────────────────────────────────────────────────
  server.tool(
    "browser_type",
    "Ketik teks ke dalam input field, textarea, atau elemen yang bisa di-edit. " +
      "Bisa clear field terlebih dahulu sebelum mengetik. " +
      "Mendukung key khusus seperti Enter, Tab, Escape.",
    {
      session_id: z.string().describe("Session ID"),
      selector: z
        .string()
        .describe("CSS selector input field. Contoh: '#email', 'input[name=\"password\"]', 'textarea'"),
      text: z
        .string()
        .describe("Teks yang akan diketik"),
      clear_first: z
        .boolean()
        .default(true)
        .describe("Hapus isi field sebelum mengetik (default: true)"),
      press_enter: z
        .boolean()
        .default(false)
        .describe("Tekan Enter setelah selesai mengetik"),
      delay_ms: z
        .number()
        .int()
        .min(0)
        .max(500)
        .default(50)
        .describe("Delay antar karakter dalam ms (simulasi manusia, default: 50)"),
      take_screenshot: z
        .boolean()
        .default(false)
        .describe("Ambil screenshot setelah mengetik"),
    },
    async ({
      session_id,
      selector,
      text,
      clear_first,
      press_enter,
      delay_ms,
      take_screenshot: doScreenshot,
    }) => {
      try {
        const result = await getActivePage(session_id);
        if (!result) {
          return {
            content: [
              { type: "text", text: `❌ Session '${session_id}' tidak ditemukan.` },
            ],
          };
        }

        const { page } = result;

        await page.waitForSelector(selector, { visible: true, timeout: 10000 });
        await page.evaluate((sel: string) => {
          const el = document.querySelector(sel);
          el?.scrollIntoView({ behavior: "smooth", block: "center" });
        }, selector);

        await new Promise((r) => setTimeout(r, 200));

        if (clear_first) {
          await page.click(selector, { clickCount: 3 });
          await page.keyboard.press("Backspace");
        }

        await page.type(selector, text, { delay: delay_ms });

        if (press_enter) {
          await page.keyboard.press("Enter");
          await new Promise((r) => setTimeout(r, 500));
        }

        let ssInfo = "";
        if (doScreenshot) {
          const ssPath = await takePageScreenshot(page, "after_type");
          ssInfo = `\n📸 Screenshot: ${ssPath}`;
        }

        const pageInfo = await getPageInfo(page);

        return {
          content: [
            {
              type: "text",
              text:
                `✅ Teks berhasil diketik!\n` +
                `${"─".repeat(50)}\n` +
                `📝 Selector : ${selector}\n` +
                `📝 Teks     : "${text.slice(0, 100)}${text.length > 100 ? "..." : ""}"\n` +
                `🗑️  Clear    : ${clear_first}\n` +
                `↩️  Enter    : ${press_enter}\n\n` +
                pageInfo +
                ssInfo,
            },
          ],
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: formatToolError("browser_type", error) }],
        };
      }
    }
  );

  // ── 5. browser_navigate ───────────────────────────────────────────────────
  server.tool(
    "browser_navigate",
    "Navigasi browser: buka URL baru, back, forward, atau reload halaman.",
    {
      session_id: z.string().describe("Session ID"),
      action: z
        .enum(["goto", "back", "forward", "reload", "new_tab"])
        .describe("Jenis navigasi"),
      url: z
        .string()
        .optional()
        .describe("URL tujuan (wajib untuk action 'goto' dan 'new_tab')"),
      wait_until: z
        .enum(["load", "domcontentloaded", "networkidle0", "networkidle2"])
        .default("networkidle2"),
      timeout_seconds: z.number().int().min(5).max(60).default(30),
      take_screenshot: z.boolean().default(true),
    },
    async ({ session_id, action, url, wait_until, timeout_seconds, take_screenshot: doScreenshot }) => {
      try {
        const sessionData = await getSession(session_id);
        if (!sessionData) {
          return {
            content: [{ type: "text", text: `❌ Session '${session_id}' tidak ditemukan.` }],
          };
        }

        const page = sessionData.pages.get(sessionData.activePageId)!;

        switch (action) {
          case "goto":
            if (!url) throw new Error("URL wajib untuk action 'goto'");
            await page.goto(url, {
              waitUntil: wait_until,
              timeout: timeout_seconds * 1000,
            });
            break;

          case "back":
            await page.goBack({
              waitUntil: wait_until,
              timeout: timeout_seconds * 1000,
            });
            break;

          case "forward":
            await page.goForward({
              waitUntil: wait_until,
              timeout: timeout_seconds * 1000,
            });
            break;

          case "reload":
            await page.reload({
              waitUntil: wait_until,
              timeout: timeout_seconds * 1000,
            });
            break;

          case "new_tab": {
            if (!url) throw new Error("URL wajib untuk action 'new_tab'");
            const newPage = await sessionData.browser.newPage();
            await newPage.setUserAgent(sessionData.userAgent);
            await newPage.goto(url, {
              waitUntil: wait_until,
              timeout: timeout_seconds * 1000,
            });
            const newPageId = `page_${sessionData.pages.size + 1}`;
            sessionData.pages.set(newPageId, newPage);
            sessionData.activePageId = newPageId;
            break;
          }
        }

        const currentPage = sessionData.pages.get(sessionData.activePageId)!;
        const pageInfo = await getPageInfo(currentPage);

        let ssInfo = "";
        if (doScreenshot) {
          const ssPath = await takePageScreenshot(currentPage, `nav_${action}`);
          ssInfo = `\n📸 Screenshot: ${ssPath}`;
        }

        return {
          content: [
            {
              type: "text",
              text:
                `✅ Navigasi '${action}' berhasil!\n` +
                `${"─".repeat(50)}\n` +
                pageInfo +
                ssInfo,
            },
          ],
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: formatToolError("browser_navigate", error) }],
        };
      }
    }
  );

  // ── 6. browser_scroll ─────────────────────────────────────────────────────
  server.tool(
    "browser_scroll",
    "Scroll halaman ke posisi tertentu, scroll ke elemen, atau scroll ke bawah/atas.",
    {
      session_id: z.string().describe("Session ID"),
      direction: z
        .enum(["up", "down", "top", "bottom", "to_element"])
        .describe("Arah/tujuan scroll"),
      amount_px: z
        .number()
        .int()
        .optional()
        .describe("Jumlah pixel untuk scroll up/down"),
      selector: z
        .string()
        .optional()
        .describe("CSS selector elemen tujuan (untuk direction 'to_element')"),
      take_screenshot: z.boolean().default(true),
    },
    async ({ session_id, direction, amount_px, selector, take_screenshot: doScreenshot }) => {
      try {
        const result = await getActivePage(session_id);
        if (!result) {
          return {
            content: [{ type: "text", text: `❌ Session '${session_id}' tidak ditemukan.` }],
          };
        }

        const { page } = result;

        switch (direction) {
          case "up":
            await page.evaluate((px: number) => window.scrollBy(0, -px), amount_px ?? 500);
            break;
          case "down":
            await page.evaluate((px: number) => window.scrollBy(0, px), amount_px ?? 500);
            break;
          case "top":
            await page.evaluate(() => window.scrollTo(0, 0));
            break;
          case "bottom":
            await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
            break;
          case "to_element":
            if (!selector) throw new Error("selector wajib untuk direction 'to_element'");
            await page.evaluate((sel: string) => {
              document.querySelector(sel)?.scrollIntoView({ behavior: "smooth", block: "center" });
            }, selector);
            break;
        }

        await new Promise((r) => setTimeout(r, 500));

        const scrollPos = await page.evaluate(() => ({
          x: window.scrollX,
          y: window.scrollY,
          maxY: document.body.scrollHeight - window.innerHeight,
        }));

        let ssInfo = "";
        if (doScreenshot) {
          const ssPath = await takePageScreenshot(page, `scroll_${direction}`);
          ssInfo = `\n📸 Screenshot: ${ssPath}`;
        }

        return {
          content: [
            {
              type: "text",
              text:
                `✅ Scroll '${direction}' berhasil!\n` +
                `${"─".repeat(50)}\n` +
                `📍 Posisi scroll: Y=${scrollPos.y}px / ${scrollPos.maxY}px total\n` +
                `📍 Horizontal   : X=${scrollPos.x}px` +
                ssInfo,
            },
          ],
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: formatToolError("browser_scroll", error) }],
        };
      }
    }
  );

  // ── 7. browser_get_content ────────────────────────────────────────────────
  server.tool(
    "browser_get_content",
    "Ambil konten halaman saat ini: HTML, teks, atau data spesifik dari elemen. " +
      "Gunakan ini untuk 'membaca' apa yang ada di browser.",
    {
      session_id: z.string().describe("Session ID"),
      content_type: z
        .enum(["html", "text", "element_text", "element_html", "page_info", "all_links", "all_inputs"])
        .default("text")
        .describe(
          "Jenis konten: html=full HTML, text=teks saja, element_text=teks dari selector, " +
            "element_html=HTML dari selector, page_info=info dasar, " +
            "all_links=semua link, all_inputs=semua form input"
        ),
      selector: z
        .string()
        .optional()
        .describe("CSS selector (wajib untuk element_text dan element_html)"),
      max_length: z
        .number()
        .int()
        .min(100)
        .max(100000)
        .default(10000)
        .describe("Batas panjang output karakter"),
    },
    async ({ session_id, content_type, selector, max_length }) => {
      try {
        const result = await getActivePage(session_id);
        if (!result) {
          return {
            content: [{ type: "text", text: `❌ Session '${session_id}' tidak ditemukan.` }],
          };
        }

        const { page } = result;
        const pageInfo = await getPageInfo(page);
        let content = "";

        switch (content_type) {
          case "html":
            content = await page.content();
            break;

          case "text":
            content = await page.evaluate(() => document.body.innerText || document.body.textContent || "");
            break;

          case "element_text":
            if (!selector) throw new Error("selector wajib untuk content_type 'element_text'");
            content = await page.$eval(selector, (el) => (el as HTMLElement).innerText || el.textContent || "");
            break;

          case "element_html":
            if (!selector) throw new Error("selector wajib untuk content_type 'element_html'");
            content = await page.$eval(selector, (el) => el.outerHTML);
            break;

          case "page_info":
            content = pageInfo;
            break;

          case "all_links": {
            const links = await page.evaluate(() =>
              Array.from(document.querySelectorAll("a[href]")).map((a) => ({
                text: (a as HTMLAnchorElement).textContent?.trim().slice(0, 80),
                href: (a as HTMLAnchorElement).href,
              }))
            );
            content = links
              .filter((l) => l.href && !l.href.startsWith("javascript:"))
              .map((l) => `[${l.text}] → ${l.href}`)
              .join("\n");
            break;
          }

          case "all_inputs": {
            const inputs = await page.evaluate(() =>
              Array.from(
                document.querySelectorAll("input, select, textarea, button")
              ).map((el) => ({
                tag: el.tagName.toLowerCase(),
                type: (el as HTMLInputElement).type,
                name: (el as HTMLInputElement).name,
                id: el.id,
                placeholder: (el as HTMLInputElement).placeholder,
                value: (el as HTMLInputElement).value,
                required: (el as HTMLInputElement).required,
                visible: (el as HTMLElement).offsetParent !== null,
              }))
            );
            content = inputs
              .map(
                (i) =>
                  `<${i.tag} type="${i.type}" name="${i.name}" id="${i.id}"` +
                  (i.placeholder ? ` placeholder="${i.placeholder}"` : "") +
                  (i.required ? " required" : "") +
                  (i.value ? ` value="${i.value.slice(0, 50)}"` : "") +
                  `>`
              )
              .join("\n");
            break;
          }
        }

        const truncated = content.length > max_length;
        const output = truncated ? content.slice(0, max_length) + "\n... [TRUNCATED]" : content;

        return {
          content: [
            {
              type: "text",
              text:
                `📄 Content (${content_type})\n` +
                `${"─".repeat(50)}\n` +
                `${pageInfo}\n\n` +
                `${"─".repeat(50)}\n` +
                output,
            },
          ],
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: formatToolError("browser_get_content", error) }],
        };
      }
    }
  );

  // ── 8. browser_wait ───────────────────────────────────────────────────────
  server.tool(
    "browser_wait",
    "Tunggu kondisi tertentu sebelum melanjutkan: " +
      "tunggu elemen muncul, menghilang, atau tunggu waktu tertentu. " +
      "Penting setelah klik yang memicu loading/animasi.",
    {
      session_id: z.string().describe("Session ID"),
      wait_type: z
        .enum(["selector_visible", "selector_hidden", "network_idle", "time", "navigation"])
        .describe("Jenis kondisi yang ditunggu"),
      selector: z
        .string()
        .optional()
        .describe("CSS selector (untuk selector_visible / selector_hidden)"),
      time_ms: z
        .number()
        .int()
        .min(100)
        .max(30000)
        .default(2000)
        .describe("Waktu tunggu dalam ms (untuk wait_type 'time')"),
      timeout_ms: z
        .number()
        .int()
        .min(1000)
        .max(60000)
        .default(15000)
        .describe("Timeout maksimum menunggu"),
    },
    async ({ session_id, wait_type, selector, time_ms, timeout_ms }) => {
      try {
        const result = await getActivePage(session_id);
        if (!result) {
          return {
            content: [{ type: "text", text: `❌ Session '${session_id}' tidak ditemukan.` }],
          };
        }

        const { page } = result;
        const startTime = Date.now();

        switch (wait_type) {
          case "selector_visible":
            if (!selector) throw new Error("selector wajib");
            await page.waitForSelector(selector, { visible: true, timeout: timeout_ms });
            break;

          case "selector_hidden":
            if (!selector) throw new Error("selector wajib");
            await page.waitForSelector(selector, { hidden: true, timeout: timeout_ms });
            break;

          case "network_idle":
            await page.waitForNetworkIdle({ timeout: timeout_ms });
            break;

          case "time":
            await new Promise((r) => setTimeout(r, time_ms));
            break;

          case "navigation":
            await page.waitForNavigation({
              waitUntil: "networkidle2",
              timeout: timeout_ms,
            });
            break;
        }

        const elapsed = Date.now() - startTime;
        const pageInfo = await getPageInfo(page);

        return {
          content: [
            {
              type: "text",
              text:
                `⏳ Wait '${wait_type}' selesai (${elapsed}ms)\n` +
                `${"─".repeat(50)}\n` +
                pageInfo,
            },
          ],
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: formatToolError("browser_wait", error) }],
        };
      }
    }
  );

  // ── 9. browser_select ─────────────────────────────────────────────────────
  server.tool(
    "browser_select",
    "Pilih opsi dari dropdown <select>, atau toggle checkbox/radio button.",
    {
      session_id: z.string().describe("Session ID"),
      selector: z.string().describe("CSS selector elemen form"),
      action: z
        .enum(["select_option", "check", "uncheck", "toggle"])
        .describe("Jenis aksi pada elemen form"),
      value: z
        .string()
        .optional()
        .describe("Value opsi yang dipilih (untuk select_option)"),
      label: z
        .string()
        .optional()
        .describe("Label teks opsi yang dipilih (alternatif value)"),
      take_screenshot: z.boolean().default(true),
    },
    async ({ session_id, selector, action, value, label, take_screenshot: doScreenshot }) => {
      try {
        const result = await getActivePage(session_id);
        if (!result) {
          return {
            content: [{ type: "text", text: `❌ Session '${session_id}' tidak ditemukan.` }],
          };
        }

        const { page } = result;
        await page.waitForSelector(selector, { visible: true, timeout: 10000 });

        let resultInfo = "";

        switch (action) {
          case "select_option": {
            const selectValue = value ?? label;
            if (!selectValue) throw new Error("value atau label wajib untuk select_option");
            const selected = await page.select(selector, selectValue);
            resultInfo = `Dipilih: ${selected.join(", ")}`;
            break;
          }
          case "check":
            await page.evaluate((sel: string) => {
              const el = document.querySelector(sel) as HTMLInputElement;
              if (el && !el.checked) el.click();
            }, selector);
            resultInfo = "Checkbox dicentang";
            break;
          case "uncheck":
            await page.evaluate((sel: string) => {
              const el = document.querySelector(sel) as HTMLInputElement;
              if (el && el.checked) el.click();
            }, selector);
            resultInfo = "Checkbox tidak dicentang";
            break;
          case "toggle":
            await page.evaluate((sel: string) => {
              (document.querySelector(sel) as HTMLInputElement)?.click();
            }, selector);
            resultInfo = "Toggled";
            break;
        }

        let ssInfo = "";
        if (doScreenshot) {
          const ssPath = await takePageScreenshot(page, "after_select");
          ssInfo = `\n📸 Screenshot: ${ssPath}`;
        }

        return {
          content: [
            {
              type: "text",
              text:
                `✅ Form action '${action}' berhasil!\n` +
                `${"─".repeat(50)}\n` +
                `🎯 Selector : ${selector}\n` +
                `📝 Hasil    : ${resultInfo}` +
                ssInfo,
            },
          ],
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: formatToolError("browser_select", error) }],
        };
      }
    }
  );

  // ── 10. browser_execute_script ────────────────────────────────────────────
  server.tool(
    "browser_execute_script",
    "Eksekusi JavaScript di browser session aktif dan kembalikan hasilnya. " +
      "Berguna untuk interaksi kompleks yang tidak bisa dicapai dengan click/type.",
    {
      session_id: z.string().describe("Session ID"),
      script: z
        .string()
        .describe(
          "JavaScript yang dieksekusi di context halaman. " +
            "Gunakan 'return' untuk mengembalikan nilai. " +
            "Contoh: 'return document.title' atau 'window.scrollTo(0, 500)'"
        ),
      take_screenshot: z.boolean().default(false),
    },
    async ({ session_id, script, take_screenshot: doScreenshot }) => {
      try {
        const result = await getActivePage(session_id);
        if (!result) {
          return {
            content: [{ type: "text", text: `❌ Session '${session_id}' tidak ditemukan.` }],
          };
        }

        const { page } = result;

        const wrappedScript = `(async () => { ${script} })()`;
        const jsResult = await page.evaluate(wrappedScript);

        let ssInfo = "";
        if (doScreenshot) {
          const ssPath = await takePageScreenshot(page, "after_script");
          ssInfo = `\n📸 Screenshot: ${ssPath}`;
        }

        return {
          content: [
            {
              type: "text",
              text:
                `⚡ Script dieksekusi!\n` +
                `${"─".repeat(50)}\n` +
                `Result:\n${JSON.stringify(jsResult, null, 2)}` +
                ssInfo,
            },
          ],
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: formatToolError("browser_execute_script", error) }],
        };
      }
    }
  );

  // ── 11. browser_close ─────────────────────────────────────────────────────
  server.tool(
    "browser_close",
    "Tutup browser session dan bebaskan memori. " +
      "Selalu panggil ini setelah selesai menggunakan browser.",
    {
      session_id: z.string().describe("Session ID yang akan ditutup"),
    },
    async ({ session_id }) => {
      try {
        const session = sessions.get(session_id);
        if (!session) {
          return {
            content: [
              {
                type: "text",
                text: `⚠️  Session '${session_id}' tidak ditemukan (mungkin sudah ditutup).`,
              },
            ],
          };
        }

        await session.browser.close();
        sessions.delete(session_id);

        return {
          content: [
            {
              type: "text",
              text:
                `✅ Browser session '${session_id}' ditutup.\n` +
                `   Durasi session: ${Math.round((Date.now() - session.createdAt.getTime()) / 1000)}s\n` +
                `   Total sesi aktif tersisa: ${sessions.size}`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: formatToolError("browser_close", error) }],
        };
      }
    }
  );

  // ── 12. browser_list_sessions ─────────────────────────────────────────────
  server.tool(
    "browser_list_sessions",
    "List semua browser session yang sedang aktif beserta info URL dan waktu.",
    {},
    async () => {
      try {
        if (sessions.size === 0) {
          return {
            content: [
              { type: "text", text: "📭 Tidak ada browser session yang aktif." },
            ],
          };
        }

        const lines: string[] = [
          `🌐 Active Browser Sessions (${sessions.size}):`,
          "─".repeat(50),
        ];

        for (const [id, session] of sessions.entries()) {
          const page = session.pages.get(session.activePageId);
          const url = page ? page.url() : "unknown";
          const age = Math.round((Date.now() - session.createdAt.getTime()) / 1000);
          const idle = Math.round((Date.now() - session.lastUsedAt.getTime()) / 1000);

          lines.push(
            `🔑 ${id}\n` +
              `   URL     : ${url}\n` +
              `   Tabs    : ${session.pages.size}\n` +
              `   Umur    : ${age}s | Idle: ${idle}s`
          );
        }

        return { content: [{ type: "text", text: lines.join("\n") }] };
      } catch (error) {
        return {
          content: [{ type: "text", text: formatToolError("browser_list_sessions", error) }],
        };
      }
    }
  );

  // ── 13. browser_hover ─────────────────────────────────────────────────────
  server.tool(
    "browser_hover",
    "Hover mouse di atas elemen untuk memicu tooltip, dropdown menu, atau efek hover CSS.",
    {
      session_id: z.string().describe("Session ID"),
      selector: z.string().describe("CSS selector elemen yang di-hover"),
      wait_after_ms: z.number().int().min(0).max(5000).default(500),
      take_screenshot: z.boolean().default(true),
    },
    async ({ session_id, selector, wait_after_ms, take_screenshot: doScreenshot }) => {
      try {
        const result = await getActivePage(session_id);
        if (!result) {
          return {
            content: [{ type: "text", text: `❌ Session '${session_id}' tidak ditemukan.` }],
          };
        }

        const { page } = result;
        await page.waitForSelector(selector, { visible: true, timeout: 10000 });
        await page.hover(selector);

        if (wait_after_ms > 0) await new Promise((r) => setTimeout(r, wait_after_ms));

        let ssInfo = "";
        if (doScreenshot) {
          const ssPath = await takePageScreenshot(page, "after_hover");
          ssInfo = `\n📸 Screenshot: ${ssPath}`;
        }

        return {
          content: [
            {
              type: "text",
              text: `✅ Hover pada '${selector}' berhasil!` + ssInfo,
            },
          ],
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: formatToolError("browser_hover", error) }],
        };
      }
    }
  );

  // ── 14. browser_keyboard ──────────────────────────────────────────────────
  server.tool(
    "browser_keyboard",
    "Tekan tombol keyboard khusus: Enter, Tab, Escape, Arrow keys, Ctrl+C, dll. " +
      "Berguna untuk navigasi form, menutup modal, shortcut keyboard.",
    {
      session_id: z.string().describe("Session ID"),
      keys: z
        .array(z.string())
        .describe(
          "Tombol yang ditekan. Contoh: ['Enter'], ['Tab'], ['Escape'], " +
            "['Control', 'a'] untuk Ctrl+A, ['ArrowDown'], ['F5']"
        ),
      delay_between_ms: z
        .number()
        .int()
        .min(0)
        .max(1000)
        .default(100)
        .describe("Delay antara penekanan tombol (ms)"),
      take_screenshot: z.boolean().default(false),
    },
    async ({ session_id, keys, delay_between_ms, take_screenshot: doScreenshot }) => {
      try {
        const result = await getActivePage(session_id);
        if (!result) {
          return {
            content: [{ type: "text", text: `❌ Session '${session_id}' tidak ditemukan.` }],
          };
        }

        const { page } = result;

        if (keys.length === 1) {
          await page.keyboard.press(keys[0] as Parameters<typeof page.keyboard.press>[0]);
        } else {
          // Chord: tahan semua kecuali terakhir, tekan terakhir, lalu lepas semua
          for (let i = 0; i < keys.length - 1; i++) {
            await page.keyboard.down(keys[i] as Parameters<typeof page.keyboard.down>[0]);
          }
          await page.keyboard.press(
            keys[keys.length - 1] as Parameters<typeof page.keyboard.press>[0]
          );
          for (let i = keys.length - 2; i >= 0; i--) {
            await page.keyboard.up(keys[i] as Parameters<typeof page.keyboard.up>[0]);
          }
        }

        if (delay_between_ms > 0)
          await new Promise((r) => setTimeout(r, delay_between_ms));

        let ssInfo = "";
        if (doScreenshot) {
          const ssPath = await takePageScreenshot(page, "after_key");
          ssInfo = `\n📸 Screenshot: ${ssPath}`;
        }

        return {
          content: [
            {
              type: "text",
              text:
                `⌨️  Keys '${keys.join("+")}' ditekan!` + ssInfo,
            },
          ],
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: formatToolError("browser_keyboard", error) }],
        };
      }
    }
  );
}
