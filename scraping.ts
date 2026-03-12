/**
 * Web Scraping & DOM Extraction Tools
 * ─────────────────────────────────────────────────────────────────────────────
 * Puppeteer-powered headless browser tools for:
 *   • Full DOM extraction and HTML structure analysis
 *   • JavaScript-rendered content scraping
 *   • Basic anti-bot bypass techniques (stealth headers, random delays)
 *   • Link extraction, form detection, meta tag parsing
 *   • Network request monitoring
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { formatToolError, truncateOutput } from "../utils.js";

// Puppeteer is loaded lazily to avoid startup cost
let puppeteerModule: typeof import("puppeteer") | null = null;

async function getPuppeteer(): Promise<typeof import("puppeteer")> {
  if (!puppeteerModule) {
    puppeteerModule = await import("puppeteer");
  }
  return puppeteerModule;
}

// ─── Stealth helpers ──────────────────────────────────────────────────────────

const STEALTH_USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
];

function randomUA(): string {
  return STEALTH_USER_AGENTS[Math.floor(Math.random() * STEALTH_USER_AGENTS.length)]!;
}

function randomDelay(min: number = 500, max: number = 2000): Promise<void> {
  const ms = Math.floor(Math.random() * (max - min) + min);
  return new Promise((r) => setTimeout(r, ms));
}

interface BrowserOptions {
  stealth: boolean;
  viewport_width: number;
  viewport_height: number;
  timeout_ms: number;
}

async function launchBrowser(options: BrowserOptions) {
  const puppeteer = await getPuppeteer();

  const browser = await puppeteer.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-accelerated-2d-canvas",
      "--disable-gpu",
      "--window-size=1920,1080",
      "--disable-blink-features=AutomationControlled",
      ...(options.stealth
        ? [
            "--disable-features=site-per-process",
            "--disable-extensions",
            "--proxy-server=direct://",
            "--proxy-bypass-list=*",
          ]
        : []),
    ],
  });

  const page = await browser.newPage();

  if (options.stealth) {
    // Override navigator properties to appear human
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, "webdriver", { get: () => false });
      Object.defineProperty(navigator, "plugins", {
        get: () => [1, 2, 3, 4, 5],
      });
      Object.defineProperty(navigator, "languages", {
        get: () => ["en-US", "en"],
      });
    });

    await page.setExtraHTTPHeaders({
      "Accept-Language": "en-US,en;q=0.9",
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      "Accept-Encoding": "gzip, deflate, br",
    });
  }

  await page.setUserAgent(randomUA());
  await page.setViewport({
    width: options.viewport_width,
    height: options.viewport_height,
  });

  return { browser, page };
}

// ─── Tool registration ────────────────────────────────────────────────────────

export function registerScrapingTools(server: McpServer): void {
  // ── 1. scrape_page_html ───────────────────────────────────────────────────
  server.tool(
    "scrape_page_html",
    "Fetches a webpage using a headless Puppeteer browser and returns the fully " +
      "rendered HTML (after JavaScript execution). Supports stealth mode to bypass " +
      "basic bot detection. Waits for network idle before extracting content.",
    {
      url: z.string().url().describe("Full URL to scrape (must include https://)"),
      wait_for: z
        .enum(["load", "domcontentloaded", "networkidle0", "networkidle2"])
        .default("networkidle2")
        .describe("Wait condition before extracting HTML (default: networkidle2)"),
      wait_selector: z
        .string()
        .optional()
        .describe("Wait for a specific CSS selector to appear before extracting, e.g. '#main-content'"),
      stealth_mode: z
        .boolean()
        .default(true)
        .describe("Enable stealth/anti-bot bypass mode (default: true)"),
      timeout_seconds: z
        .number()
        .int()
        .min(5)
        .max(120)
        .default(30)
        .describe("Page load timeout in seconds (default: 30)"),
      scroll_to_bottom: z
        .boolean()
        .default(false)
        .describe("Scroll to the bottom of the page to trigger lazy-loaded content"),
    },
    async ({ url, wait_for, wait_selector, stealth_mode, timeout_seconds, scroll_to_bottom }) => {
      let browser: Awaited<ReturnType<typeof launchBrowser>>["browser"] | null = null;

      try {
        const { browser: b, page } = await launchBrowser({
          stealth: stealth_mode,
          viewport_width: 1920,
          viewport_height: 1080,
          timeout_ms: timeout_seconds * 1000,
        });
        browser = b;

        if (stealth_mode) await randomDelay(300, 800);

        await page.goto(url, {
          waitUntil: wait_for,
          timeout: timeout_seconds * 1000,
        });

        if (wait_selector) {
          await page.waitForSelector(wait_selector, {
            timeout: timeout_seconds * 1000,
          });
        }

        if (scroll_to_bottom) {
          await page.evaluate(async () => {
            await new Promise<void>((resolve) => {
              let totalHeight = 0;
              const timer = setInterval(() => {
                window.scrollBy(0, 300);
                totalHeight += 300;
                if (totalHeight >= document.body.scrollHeight) {
                  clearInterval(timer);
                  resolve();
                }
              }, 100);
            });
          });
          await randomDelay(500, 1000);
        }

        const html = await page.content();
        const title = await page.title();
        const finalUrl = page.url();

        return {
          content: [
            {
              type: "text",
              text:
                `🌐 Page scraped: ${finalUrl}\n` +
                `   Title   : ${title}\n` +
                `   HTML size: ${(html.length / 1024).toFixed(1)} KB\n` +
                `${"─".repeat(60)}\n\n` +
                truncateOutput(html, 80_000),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            { type: "text", text: formatToolError("scrape_page_html", error) },
          ],
        };
      } finally {
        if (browser) await browser.close().catch(() => null);
      }
    }
  );

  // ── 2. extract_dom_structure ──────────────────────────────────────────────
  server.tool(
    "extract_dom_structure",
    "Extracts a structured summary of a webpage's DOM: headings hierarchy, " +
      "links, images, forms, meta tags, structured data (JSON-LD), and main " +
      "text content. Much faster to parse than raw HTML for AI analysis.",
    {
      url: z.string().url().describe("URL to extract DOM structure from"),
      include_links: z.boolean().default(true).describe("Include all hyperlinks"),
      include_images: z.boolean().default(true).describe("Include image src/alt data"),
      include_forms: z.boolean().default(true).describe("Include form field structures"),
      include_meta: z.boolean().default(true).describe("Include meta tags and OG data"),
      include_text: z
        .boolean()
        .default(true)
        .describe("Include main body text (stripped of HTML tags)"),
      stealth_mode: z.boolean().default(true),
      timeout_seconds: z.number().int().min(5).max(60).default(30),
    },
    async ({
      url, include_links, include_images, include_forms, include_meta,
      include_text, stealth_mode, timeout_seconds,
    }) => {
      let browser: Awaited<ReturnType<typeof launchBrowser>>["browser"] | null = null;

      try {
        const { browser: b, page } = await launchBrowser({
          stealth: stealth_mode,
          viewport_width: 1920,
          viewport_height: 1080,
          timeout_ms: timeout_seconds * 1000,
        });
        browser = b;

        await page.goto(url, { waitUntil: "networkidle2", timeout: timeout_seconds * 1000 });

        // Extract everything in one page.evaluate call for efficiency
        const domData = await page.evaluate(
          (opts) => {
            const data: Record<string, unknown> = {};

            // Title & basic info
            data.title = document.title;
            data.url = window.location.href;
            data.lang = document.documentElement.lang;

            // Headings hierarchy
            data.headings = Array.from(document.querySelectorAll("h1,h2,h3,h4,h5,h6")).map(
              (h) => ({
                tag: h.tagName.toLowerCase(),
                text: h.textContent?.trim().slice(0, 200),
              })
            );

            if (opts.include_meta) {
              data.meta = {
                description: (document.querySelector('meta[name="description"]') as HTMLMetaElement)?.content,
                keywords: (document.querySelector('meta[name="keywords"]') as HTMLMetaElement)?.content,
                og_title: (document.querySelector('meta[property="og:title"]') as HTMLMetaElement)?.content,
                og_description: (document.querySelector('meta[property="og:description"]') as HTMLMetaElement)?.content,
                og_image: (document.querySelector('meta[property="og:image"]') as HTMLMetaElement)?.content,
                canonical: (document.querySelector('link[rel="canonical"]') as HTMLLinkElement)?.href,
              };
              // JSON-LD structured data
              const jsonlds = Array.from(document.querySelectorAll('script[type="application/ld+json"]'));
              data.structured_data = jsonlds.map((s) => {
                try { return JSON.parse(s.textContent || ""); } catch { return null; }
              }).filter(Boolean);
            }

            if (opts.include_links) {
              data.links = Array.from(document.querySelectorAll("a[href]"))
                .map((a) => ({
                  text: (a as HTMLAnchorElement).textContent?.trim().slice(0, 100),
                  href: (a as HTMLAnchorElement).href,
                  rel: (a as HTMLAnchorElement).rel,
                }))
                .filter((l) => l.href && !l.href.startsWith("javascript:"))
                .slice(0, 100); // Cap at 100 links
            }

            if (opts.include_images) {
              data.images = Array.from(document.querySelectorAll("img"))
                .map((img) => ({
                  src: (img as HTMLImageElement).src,
                  alt: (img as HTMLImageElement).alt,
                  width: (img as HTMLImageElement).naturalWidth,
                  height: (img as HTMLImageElement).naturalHeight,
                  loading: (img as HTMLImageElement).loading,
                }))
                .slice(0, 50);
            }

            if (opts.include_forms) {
              data.forms = Array.from(document.querySelectorAll("form")).map((form) => ({
                action: (form as HTMLFormElement).action,
                method: (form as HTMLFormElement).method,
                fields: Array.from(
                  (form as HTMLFormElement).querySelectorAll("input,select,textarea")
                ).map((el) => ({
                  type: (el as HTMLInputElement).type,
                  name: (el as HTMLInputElement).name,
                  placeholder: (el as HTMLInputElement).placeholder,
                  required: (el as HTMLInputElement).required,
                })),
              }));
            }

            if (opts.include_text) {
              // Extract text from body, removing scripts/styles
              const clone = document.body.cloneNode(true) as HTMLElement;
              clone.querySelectorAll("script,style,nav,footer,header").forEach((el) => el.remove());
              data.main_text = clone.textContent?.replace(/\s+/g, " ").trim().slice(0, 5000);
            }

            return data;
          },
          { include_links, include_images, include_forms, include_meta, include_text }
        );

        const output =
          `🔍 DOM Structure: ${url}\n${"─".repeat(60)}\n\n` +
          JSON.stringify(domData, null, 2);

        return { content: [{ type: "text", text: truncateOutput(output, 40_000) }] };
      } catch (error) {
        return {
          content: [{ type: "text", text: formatToolError("extract_dom_structure", error) }],
        };
      } finally {
        if (browser) await browser.close().catch(() => null);
      }
    }
  );

  // ── 3. execute_js_on_page ─────────────────────────────────────────────────
  server.tool(
    "execute_js_on_page",
    "Navigates to a URL and executes custom JavaScript on the page, returning " +
      "the result. Useful for extracting specific data that requires DOM traversal " +
      "or interaction with JS-rendered content.",
    {
      url: z.string().url().describe("URL to load"),
      js_code: z
        .string()
        .describe(
          "JavaScript code to execute. Must return a serializable value. " +
            "Example: 'return document.querySelectorAll(\".product-price\").length'"
        ),
      wait_for_selector: z.string().optional().describe("Wait for this CSS selector before executing JS"),
      stealth_mode: z.boolean().default(true),
      timeout_seconds: z.number().int().min(5).max(60).default(30),
    },
    async ({ url, js_code, wait_for_selector, stealth_mode, timeout_seconds }) => {
      let browser: Awaited<ReturnType<typeof launchBrowser>>["browser"] | null = null;

      try {
        const { browser: b, page } = await launchBrowser({
          stealth: stealth_mode,
          viewport_width: 1920,
          viewport_height: 1080,
          timeout_ms: timeout_seconds * 1000,
        });
        browser = b;

        await page.goto(url, { waitUntil: "networkidle2", timeout: timeout_seconds * 1000 });

        if (wait_for_selector) {
          await page.waitForSelector(wait_for_selector, { timeout: timeout_seconds * 1000 });
        }

        // Wrap in async function so user can use `return`
        const wrappedCode = `(async () => { ${js_code} })()`;
        const result = await page.evaluate(wrappedCode);

        return {
          content: [
            {
              type: "text",
              text:
                `⚡ JS Execution Result on ${url}\n${"─".repeat(60)}\n\n` +
                JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            { type: "text", text: formatToolError("execute_js_on_page", error) },
          ],
        };
      } finally {
        if (browser) await browser.close().catch(() => null);
      }
    }
  );

  // ── 4. monitor_network_requests ───────────────────────────────────────────
  server.tool(
    "monitor_network_requests",
    "Loads a URL and captures all network requests made by the page: " +
      "API calls, resource loads, XHR/fetch requests. " +
      "Essential for reverse-engineering SPAs and finding hidden APIs.",
    {
      url: z.string().url().describe("URL to monitor"),
      filter_type: z
        .enum(["all", "xhr", "fetch", "document", "script", "stylesheet", "image"])
        .default("xhr")
        .describe("Filter requests by resource type (default: xhr)"),
      timeout_seconds: z.number().int().min(5).max(60).default(15),
      stealth_mode: z.boolean().default(true),
    },
    async ({ url, filter_type, timeout_seconds, stealth_mode }) => {
      let browser: Awaited<ReturnType<typeof launchBrowser>>["browser"] | null = null;

      try {
        const { browser: b, page } = await launchBrowser({
          stealth: stealth_mode,
          viewport_width: 1920,
          viewport_height: 1080,
          timeout_ms: timeout_seconds * 1000,
        });
        browser = b;

        const capturedRequests: Array<{
          url: string;
          method: string;
          resourceType: string;
          headers?: Record<string, string>;
        }> = [];

        await page.setRequestInterception(true);

        page.on("request", (req) => {
          const rType = req.resourceType();
          if (filter_type === "all" || rType === filter_type) {
            capturedRequests.push({
              url: req.url(),
              method: req.method(),
              resourceType: rType,
              headers: filter_type !== "all" ? req.headers() : undefined,
            });
          }
          req.continue();
        });

        await page.goto(url, { waitUntil: "networkidle2", timeout: timeout_seconds * 1000 });
        await randomDelay(1000, 2000);

        const summary =
          `🌐 Network Monitor: ${url}\n` +
          `   Filter: ${filter_type}\n` +
          `   Requests captured: ${capturedRequests.length}\n` +
          `${"─".repeat(60)}\n\n` +
          capturedRequests
            .slice(0, 100)
            .map((r) => `[${r.method}] ${r.resourceType.toUpperCase()} → ${r.url}`)
            .join("\n");

        return { content: [{ type: "text", text: summary }] };
      } catch (error) {
        return {
          content: [
            { type: "text", text: formatToolError("monitor_network_requests", error) },
          ],
        };
      } finally {
        if (browser) await browser.close().catch(() => null);
      }
    }
  );
}
