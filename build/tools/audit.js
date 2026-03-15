/**
 * Website Review & Audit Tools
 * ─────────────────────────────────────────────────────────────────────────────
 * Provides professional-grade website auditing capabilities:
 *   • Full-page screenshots via Puppeteer
 *   • Lighthouse performance/accessibility/SEO/best-practices audits
 *   • Structured audit report parsing with actionable recommendations
 *   • Core Web Vitals extraction (LCP, FID/INP, CLS, TTFB)
 *   • Accessibility issues scanner
 *   • Mobile responsiveness check
 */
import { z } from "zod";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import { formatToolError, ensureDir, truncateOutput, puppeteerSemaphore, buildPuppeteerLaunchOptions } from "../utils.js";
// Lazy-load Puppeteer and Lighthouse to keep startup fast
let puppeteerModule = null;
async function getPuppeteer() {
    if (!puppeteerModule) {
        puppeteerModule = await import("puppeteer");
    }
    return puppeteerModule;
}
function scoreToEmoji(score) {
    if (score === null)
        return "⬜";
    if (score >= 0.9)
        return "🟢";
    if (score >= 0.5)
        return "🟡";
    return "🔴";
}
function scoreToPercent(score) {
    if (score === null)
        return "N/A";
    return `${Math.round(score * 100)}`;
}
function parseLighthouseReport(lhResult) {
    const categories = lhResult.categories;
    const audits = lhResult.audits;
    const sections = [];
    // ── Category scores ──
    sections.push("## 📊 Category Scores\n");
    for (const [key, cat] of Object.entries(categories)) {
        const pct = scoreToPercent(cat.score);
        const emoji = scoreToEmoji(cat.score);
        sections.push(`${emoji} **${cat.title ?? key}**: ${pct}/100`);
    }
    sections.push("");
    // ── Core Web Vitals ──
    const cwvIds = ["first-contentful-paint", "largest-contentful-paint", "total-blocking-time",
        "cumulative-layout-shift", "speed-index", "interactive", "server-response-time"];
    sections.push("## ⚡ Core Web Vitals & Performance Metrics\n");
    for (const id of cwvIds) {
        const audit = audits[id];
        if (!audit)
            continue;
        const emoji = scoreToEmoji(audit.score);
        const value = audit.displayValue ?? (audit.numericValue ? `${Math.round(audit.numericValue)}ms` : "N/A");
        sections.push(`${emoji} **${audit.title}**: ${value}`);
    }
    sections.push("");
    // ── Failed/warning audits by category ──
    const failedAudits = [];
    const warningAudits = [];
    for (const audit of Object.values(audits)) {
        if (audit.scoreDisplayMode === "informative" || audit.scoreDisplayMode === "notApplicable")
            continue;
        if (audit.score === null)
            continue;
        if (audit.score < 0.5) {
            failedAudits.push({
                title: audit.title,
                description: audit.description,
                score: audit.score,
                displayValue: audit.displayValue,
            });
        }
        else if (audit.score < 0.9) {
            warningAudits.push({
                title: audit.title,
                description: audit.description,
                score: audit.score,
                displayValue: audit.displayValue,
            });
        }
    }
    if (failedAudits.length > 0) {
        sections.push("## 🔴 Critical Issues (Score < 50)\n");
        for (const a of failedAudits.slice(0, 15)) {
            sections.push(`### ❌ ${a.title}`);
            if (a.displayValue)
                sections.push(`**Value**: ${a.displayValue}`);
            sections.push(`**Issue**: ${a.description.slice(0, 300)}`);
            sections.push("");
        }
    }
    if (warningAudits.length > 0) {
        sections.push("## 🟡 Warnings (Score 50–89)\n");
        for (const a of warningAudits.slice(0, 10)) {
            sections.push(`- ⚠️ **${a.title}**${a.displayValue ? ` — ${a.displayValue}` : ""}`);
        }
        sections.push("");
    }
    // ── Opportunities (performance improvements) ──
    const opportunities = Object.values(audits)
        .filter((a) => a.details?.type === "opportunity" && a.score !== null && a.score < 1)
        .sort((a, b) => (a.score ?? 0) - (b.score ?? 0))
        .slice(0, 8);
    if (opportunities.length > 0) {
        sections.push("## 💡 Performance Opportunities\n");
        for (const opp of opportunities) {
            sections.push(`- **${opp.title}**: ${opp.displayValue ?? "Review needed"}`);
        }
        sections.push("");
    }
    // ── Accessibility specific ──
    const a11yAudits = Object.values(audits)
        .filter((a) => {
        const cat = categories["accessibility"];
        return (cat?.auditRefs?.some((ref) => ref.id === a.id) &&
            a.score !== null &&
            a.score < 1);
    })
        .slice(0, 10);
    if (a11yAudits.length > 0) {
        sections.push("## ♿ Accessibility Issues\n");
        for (const a of a11yAudits) {
            const emoji = scoreToEmoji(a.score);
            sections.push(`${emoji} **${a.title}**`);
            sections.push(`   ${a.description.slice(0, 200)}`);
            sections.push("");
        }
    }
    // ── Recommendations summary ──
    sections.push("## 🛠️ Top Recommendations\n");
    const allFailed = [...failedAudits, ...warningAudits].slice(0, 5);
    if (allFailed.length === 0) {
        sections.push("✅ No major issues found! Site is well-optimized.");
    }
    else {
        sections.push("Priority fixes based on audit results:");
        allFailed.forEach((a, i) => {
            sections.push(`${i + 1}. **${a.title}** — ${a.description.slice(0, 150)}`);
        });
    }
    return sections.join("\n");
}
// ─── Tool registration ────────────────────────────────────────────────────────
export function registerAuditTools(server) {
    // ── 1. take_screenshot ────────────────────────────────────────────────────
    server.tool("take_screenshot", "Takes a full-page screenshot of a website using Puppeteer. " +
        "Saves it to a local file and returns the file path. " +
        "Supports both desktop and mobile viewport emulation.", {
        url: z.string().url().describe("URL to screenshot"),
        output_path: z
            .string()
            .optional()
            .describe("Where to save the PNG file. Defaults to a timestamped file in /tmp/mcp-screenshots/"),
        full_page: z
            .boolean()
            .default(true)
            .describe("Capture the full scrollable page (default: true)"),
        device: z
            .enum(["desktop", "mobile", "tablet"])
            .default("desktop")
            .describe("Viewport emulation preset (default: desktop)"),
        wait_seconds: z
            .number()
            .min(0)
            .max(30)
            .default(2)
            .describe("Seconds to wait after page load before screenshot (default: 2)"),
        timeout_seconds: z.number().int().min(10).max(120).default(30),
    }, async ({ url, output_path, full_page, device, wait_seconds, timeout_seconds }) => {
        let browser = null;
        let releaseSemaphore = null;
        try {
            const puppeteer = await getPuppeteer();
            const viewports = {
                desktop: { width: 1920, height: 1080, isMobile: false, deviceScaleFactor: 1 },
                mobile: { width: 390, height: 844, isMobile: true, deviceScaleFactor: 3 },
                tablet: { width: 768, height: 1024, isMobile: true, deviceScaleFactor: 2 },
            };
            const viewport = viewports[device];
            releaseSemaphore = await puppeteerSemaphore.acquire();
            browser = await puppeteer.launch(buildPuppeteerLaunchOptions());
            const page = await browser.newPage();
            await page.setViewport(viewport);
            if (device === "mobile") {
                await page.setUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1");
            }
            await page.goto(url, { waitUntil: "networkidle2", timeout: timeout_seconds * 1000 });
            if (wait_seconds > 0) {
                await new Promise((r) => setTimeout(r, wait_seconds * 1000));
            }
            // Determine output path
            const screenshotDir = path.join(os.tmpdir(), "mcp-screenshots");
            await ensureDir(screenshotDir);
            const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
            const safeDomain = new URL(url).hostname.replace(/[^a-zA-Z0-9-]/g, "_");
            const finalPath = output_path ?? path.join(screenshotDir, `${safeDomain}_${device}_${timestamp}.png`);
            const resolvedPath = path.resolve(finalPath);
            await ensureDir(path.dirname(resolvedPath));
            await page.screenshot({
                path: resolvedPath,
                fullPage: full_page,
                type: "png",
            });
            const stat = await fs.stat(resolvedPath);
            const sizekb = (stat.size / 1024).toFixed(1);
            const title = await page.title();
            return {
                content: [
                    {
                        type: "text",
                        text: `📸 Screenshot captured!\n` +
                            `   URL     : ${url}\n` +
                            `   Title   : ${title}\n` +
                            `   Device  : ${device} (${viewport.width}×${viewport.height})\n` +
                            `   Full pg : ${full_page}\n` +
                            `   Saved to: ${resolvedPath}\n` +
                            `   Size    : ${sizekb} KB`,
                    },
                ],
            };
        }
        catch (error) {
            return {
                content: [{ type: "text", text: formatToolError("take_screenshot", error) }],
            };
        }
        finally {
            if (browser)
                await browser.close().catch(() => null);
            releaseSemaphore?.();
        }
    });
    // ── 2. run_lighthouse_audit ───────────────────────────────────────────────
    server.tool("run_lighthouse_audit", "Runs a comprehensive Lighthouse audit on a website, measuring Performance, " +
        "Accessibility, Best Practices, and SEO. Returns a full structured report " +
        "with scores and detailed findings. Also saves the raw JSON report.", {
        url: z.string().url().describe("URL to audit"),
        categories: z
            .array(z.enum(["performance", "accessibility", "best-practices", "seo"]))
            .default(["performance", "accessibility", "best-practices", "seo"])
            .describe("Which Lighthouse categories to run"),
        device: z
            .enum(["mobile", "desktop"])
            .default("mobile")
            .describe("Emulation preset — Lighthouse defaults to mobile (default: mobile)"),
        output_dir: z
            .string()
            .optional()
            .describe("Directory to save the JSON report. Defaults to /tmp/mcp-audits/"),
        timeout_seconds: z
            .number()
            .int()
            .min(30)
            .max(300)
            .default(120)
            .describe("Audit timeout in seconds (default: 120)"),
    }, async ({ url, categories, device, output_dir, timeout_seconds }) => {
        let browser = null;
        let releaseSemaphore = null;
        try {
            // Dynamic import of lighthouse (ESM)
            const puppeteer = await getPuppeteer();
            releaseSemaphore = await puppeteerSemaphore.acquire();
            browser = await puppeteer.launch(buildPuppeteerLaunchOptions(["--remote-debugging-port=9222"], { defaultViewport: null }));
            // Dynamically import lighthouse
            let lighthouse;
            try {
                const lhModule = await import("lighthouse");
                lighthouse = lhModule.default;
            }
            catch (importErr) {
                return {
                    content: [
                        {
                            type: "text",
                            text: "❌ Lighthouse not installed or not importable.\n" +
                                "Run: npm install lighthouse\n" +
                                `Import error: ${importErr.message}`,
                        },
                    ],
                };
            }
            const wsEndpoint = browser.wsEndpoint();
            const port = parseInt(new URL(wsEndpoint).port, 10);
            const formFactor = device === "desktop" ? "desktop" : "mobile";
            const screenEmulation = device === "desktop"
                ? {
                    mobile: false,
                    width: 1350,
                    height: 940,
                    deviceScaleFactor: 1,
                    disabled: false,
                }
                : {
                    mobile: true,
                    width: 390,
                    height: 844,
                    deviceScaleFactor: 3,
                    disabled: false,
                };
            const runnerResult = await Promise.race([
                lighthouse(url, {
                    port,
                    output: "json",
                    logLevel: "error",
                    onlyCategories: categories,
                    formFactor,
                    screenEmulation,
                    throttlingMethod: "simulate",
                }),
                new Promise((_, reject) => setTimeout(() => reject(new Error(`Lighthouse timed out after ${timeout_seconds}s`)), timeout_seconds * 1000)),
            ]);
            if (!runnerResult || !runnerResult.lhr) {
                return {
                    content: [{ type: "text", text: "❌ Lighthouse returned no results." }],
                };
            }
            const lhr = runnerResult.lhr;
            // Save raw JSON report
            const auditDir = output_dir ?? path.join(os.tmpdir(), "mcp-audits");
            await ensureDir(auditDir);
            const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
            const safeDomain = new URL(url).hostname.replace(/[^a-zA-Z0-9-]/g, "_");
            const reportPath = path.join(auditDir, `${safeDomain}_${device}_${timestamp}.json`);
            await fs.writeFile(reportPath, JSON.stringify(lhr, null, 2), "utf-8");
            // Parse into human-readable summary
            const summary = parseLighthouseReport(lhr);
            const header = `🔍 Lighthouse Audit Report\n` +
                `   URL        : ${lhr.finalUrl ?? url}\n` +
                `   Device     : ${device}\n` +
                `   LH Version : ${lhr.lighthouseVersion ?? "unknown"}\n` +
                `   Fetch time : ${lhr.fetchTime ?? "N/A"}\n` +
                `   Report JSON: ${reportPath}\n` +
                `${"═".repeat(60)}\n\n`;
            return {
                content: [
                    {
                        type: "text",
                        text: header + summary,
                    },
                ],
            };
        }
        catch (error) {
            return {
                content: [
                    { type: "text", text: formatToolError("run_lighthouse_audit", error) },
                ],
            };
        }
        finally {
            if (browser)
                await browser.close().catch(() => null);
            releaseSemaphore?.();
        }
    });
    // ── 3. parse_audit_report ─────────────────────────────────────────────────
    server.tool("parse_audit_report", "Reads a saved Lighthouse JSON report from disk and parses it into a " +
        "human-readable summary with scores, issues, and actionable recommendations. " +
        "Use this if you already ran a Lighthouse audit and saved the JSON.", {
        report_path: z
            .string()
            .describe("Path to the Lighthouse JSON report file"),
        focus: z
            .enum(["all", "performance", "accessibility", "seo", "best-practices", "opportunities"])
            .default("all")
            .describe("Focus the summary on a specific category (default: all)"),
    }, async ({ report_path, focus }) => {
        try {
            const resolvedPath = path.resolve(report_path);
            const rawJson = await fs.readFile(resolvedPath, "utf-8");
            const lhr = JSON.parse(rawJson);
            if (!lhr.categories || !lhr.audits) {
                return {
                    content: [
                        {
                            type: "text",
                            text: "❌ File does not appear to be a valid Lighthouse report (missing categories/audits).",
                        },
                    ],
                };
            }
            let summary = parseLighthouseReport(lhr);
            // Filter by focus if needed
            if (focus !== "all") {
                const focusKeywords = {
                    performance: ["Performance", "Core Web Vitals", "Opportunities"],
                    accessibility: ["Accessibility"],
                    seo: ["SEO"],
                    "best-practices": ["Best Practices"],
                    opportunities: ["Opportunities", "Critical Issues", "Warnings"],
                };
                const keywords = focusKeywords[focus] ?? [];
                if (keywords.length > 0) {
                    const lines = summary.split("\n");
                    const filtered = [];
                    let inSection = false;
                    for (const line of lines) {
                        if (line.startsWith("## ")) {
                            inSection = keywords.some((kw) => line.includes(kw));
                        }
                        if (inSection || !line.startsWith("## ")) {
                            filtered.push(line);
                        }
                    }
                    summary = filtered.join("\n");
                }
            }
            const header = `📄 Parsed Audit Report: ${resolvedPath}\n` +
                `   Focus: ${focus}\n` +
                `${"═".repeat(60)}\n\n`;
            return {
                content: [{ type: "text", text: truncateOutput(header + summary) }],
            };
        }
        catch (error) {
            return {
                content: [
                    { type: "text", text: formatToolError("parse_audit_report", error) },
                ],
            };
        }
    });
    // ── 4. check_mobile_responsiveness ───────────────────────────────────────
    server.tool("check_mobile_responsiveness", "Checks a website's mobile responsiveness by loading it at multiple " +
        "viewport sizes and detecting common issues: horizontal overflow, " +
        "text readability, touch target sizes, and meta viewport presence.", {
        url: z.string().url().describe("URL to check"),
        viewports: z
            .array(z.object({
            name: z.string(),
            width: z.number().int(),
            height: z.number().int(),
        }))
            .default([
            { name: "Mobile S (320px)", width: 320, height: 568 },
            { name: "Mobile M (375px)", width: 375, height: 667 },
            { name: "Mobile L (425px)", width: 425, height: 850 },
            { name: "Tablet (768px)", width: 768, height: 1024 },
            { name: "Desktop (1440px)", width: 1440, height: 900 },
        ])
            .describe("List of viewport sizes to test"),
        timeout_seconds: z.number().int().min(10).max(120).default(30),
    }, async ({ url, viewports, timeout_seconds }) => {
        let browser = null;
        let releaseSemaphore = null;
        try {
            const puppeteer = await getPuppeteer();
            releaseSemaphore = await puppeteerSemaphore.acquire();
            browser = await puppeteer.launch(buildPuppeteerLaunchOptions());
            const results = [];
            for (const vp of viewports) {
                const page = await browser.newPage();
                await page.setViewport({ width: vp.width, height: vp.height });
                try {
                    await page.goto(url, { waitUntil: "networkidle2", timeout: timeout_seconds * 1000 });
                    const analysis = await page.evaluate((vpWidth) => {
                        // Check horizontal scroll
                        const bodyWidth = document.documentElement.scrollWidth;
                        const hasHorizontalScroll = bodyWidth > vpWidth;
                        // Meta viewport
                        const metaViewport = document.querySelector('meta[name="viewport"]');
                        const hasMetaViewport = !!metaViewport;
                        // Small text (< 12px)
                        const allText = document.querySelectorAll("p, span, a, li, td, th");
                        let smallTextCount = 0;
                        for (const el of Array.from(allText).slice(0, 200)) {
                            const fs = parseFloat(window.getComputedStyle(el).fontSize);
                            if (fs < 12 && fs > 0)
                                smallTextCount++;
                        }
                        // Small touch targets (< 44x44px)
                        const interactive = document.querySelectorAll("a, button, input, select");
                        let smallTouchTargets = 0;
                        for (const el of Array.from(interactive).slice(0, 100)) {
                            const rect = el.getBoundingClientRect();
                            if ((rect.width < 44 || rect.height < 44) && rect.width > 0) {
                                smallTouchTargets++;
                            }
                        }
                        return { bodyWidth, hasHorizontalScroll, hasMetaViewport, smallTextCount, smallTouchTargets };
                    }, vp.width);
                    const issues = [];
                    if (analysis.hasHorizontalScroll) {
                        issues.push(`Horizontal overflow: content width ${analysis.bodyWidth}px > viewport ${vp.width}px`);
                    }
                    if (!analysis.hasMetaViewport) {
                        issues.push("Missing <meta name='viewport'> tag!");
                    }
                    if (analysis.smallTextCount > 10) {
                        issues.push(`${analysis.smallTextCount} elements with small text (<12px)`);
                    }
                    if (analysis.smallTouchTargets > 5) {
                        issues.push(`${analysis.smallTouchTargets} touch targets smaller than 44×44px`);
                    }
                    results.push({
                        viewport: `${vp.name}`,
                        hasHorizontalScroll: analysis.hasHorizontalScroll,
                        bodyWidth: analysis.bodyWidth,
                        viewportWidth: vp.width,
                        hasMetaViewport: analysis.hasMetaViewport,
                        smallTextCount: analysis.smallTextCount,
                        smallTouchTargets: analysis.smallTouchTargets,
                        issues,
                    });
                }
                finally {
                    await page.close();
                }
            }
            // Build report
            const lines = [
                `📱 Mobile Responsiveness Check: ${url}`,
                `${"─".repeat(60)}`,
                "",
            ];
            let totalIssues = 0;
            for (const r of results) {
                const status = r.issues.length === 0 ? "✅" : "❌";
                lines.push(`${status} **${r.viewport}** (${r.viewportWidth}px)`);
                if (r.issues.length > 0) {
                    r.issues.forEach((issue) => lines.push(`     ⚠️  ${issue}`));
                    totalIssues += r.issues.length;
                }
                lines.push("");
            }
            lines.push(`${"─".repeat(60)}`);
            lines.push(totalIssues === 0
                ? "✅ **All viewports passed!** Site is well-optimized for mobile."
                : `❌ **${totalIssues} total issue(s) found across ${viewports.length} viewports.**`);
            return { content: [{ type: "text", text: lines.join("\n") }] };
        }
        catch (error) {
            return {
                content: [
                    { type: "text", text: formatToolError("check_mobile_responsiveness", error) },
                ],
            };
        }
        finally {
            if (browser)
                await browser.close().catch(() => null);
            releaseSemaphore?.();
        }
    });
    // ── 5. extract_seo_data ───────────────────────────────────────────────────
    server.tool("extract_seo_data", "Performs a deep SEO analysis of a webpage: checks title, meta description, " +
        "canonical, OG tags, heading hierarchy, image alt texts, structured data, " +
        "internal vs external links, page speed indicators, and more.", {
        url: z.string().url().describe("URL to analyze for SEO"),
        timeout_seconds: z.number().int().min(10).max(60).default(30),
    }, async ({ url, timeout_seconds }) => {
        let browser = null;
        let releaseSemaphore = null;
        try {
            const puppeteer = await getPuppeteer();
            releaseSemaphore = await puppeteerSemaphore.acquire();
            browser = await puppeteer.launch(buildPuppeteerLaunchOptions());
            const page = await browser.newPage();
            await page.setViewport({ width: 1440, height: 900 });
            await page.goto(url, { waitUntil: "networkidle2", timeout: timeout_seconds * 1000 });
            const seoData = await page.evaluate(() => {
                const get = (sel, attr) => {
                    const el = document.querySelector(sel);
                    if (!el)
                        return "";
                    if (attr)
                        return el.getAttribute(attr) ?? "";
                    return el.textContent?.trim() ?? "";
                };
                const domain = window.location.hostname;
                // Headings
                const headings = { h1: [], h2: [], h3: [] };
                for (const tag of ["h1", "h2", "h3"]) {
                    headings[tag] = Array.from(document.querySelectorAll(tag))
                        .map((h) => h.textContent?.trim().slice(0, 100) ?? "")
                        .filter(Boolean);
                }
                // Images without alt
                const allImages = Array.from(document.querySelectorAll("img"));
                const imagesWithoutAlt = allImages.filter((img) => !img.alt || img.alt.trim() === "").length;
                // Links
                const allLinks = Array.from(document.querySelectorAll("a[href]"));
                const internalLinks = allLinks.filter((a) => a.href.includes(domain)).length;
                const externalLinks = allLinks.length - internalLinks;
                const nofollowLinks = allLinks.filter((a) => a.rel?.includes("nofollow")).length;
                // JSON-LD
                const jsonld = Array.from(document.querySelectorAll('script[type="application/ld+json"]'))
                    .map((s) => { try {
                    return JSON.parse(s.textContent || "");
                }
                catch {
                    return null;
                } })
                    .filter(Boolean);
                return {
                    title: document.title,
                    titleLength: document.title.length,
                    metaDescription: get('meta[name="description"]', "content"),
                    metaDescriptionLength: (get('meta[name="description"]', "content") || "").length,
                    canonical: get('link[rel="canonical"]', "href"),
                    robots: get('meta[name="robots"]', "content"),
                    ogTitle: get('meta[property="og:title"]', "content"),
                    ogDescription: get('meta[property="og:description"]', "content"),
                    ogImage: get('meta[property="og:image"]', "content"),
                    twitterCard: get('meta[name="twitter:card"]', "content"),
                    viewport: get('meta[name="viewport"]', "content"),
                    lang: document.documentElement.lang,
                    headings,
                    totalImages: allImages.length,
                    imagesWithoutAlt,
                    totalLinks: allLinks.length,
                    internalLinks,
                    externalLinks,
                    nofollowLinks,
                    jsonld,
                    wordCount: document.body.innerText?.split(/\s+/).filter(Boolean).length ?? 0,
                };
            });
            // Build analysis
            const issues = [];
            const good = [];
            if (!seoData.title)
                issues.push("❌ Missing <title> tag");
            else if (seoData.titleLength < 30)
                issues.push(`⚠️ Title too short (${seoData.titleLength} chars, aim for 50–60)`);
            else if (seoData.titleLength > 60)
                issues.push(`⚠️ Title too long (${seoData.titleLength} chars, aim for 50–60)`);
            else
                good.push(`✅ Title length OK (${seoData.titleLength} chars)`);
            if (!seoData.metaDescription)
                issues.push("❌ Missing meta description");
            else if (seoData.metaDescriptionLength < 120)
                issues.push(`⚠️ Meta description too short (${seoData.metaDescriptionLength} chars)`);
            else if (seoData.metaDescriptionLength > 160)
                issues.push(`⚠️ Meta description too long (${seoData.metaDescriptionLength} chars)`);
            else
                good.push(`✅ Meta description OK (${seoData.metaDescriptionLength} chars)`);
            if (!seoData.canonical)
                issues.push("⚠️ No canonical URL set");
            else
                good.push("✅ Canonical URL present");
            if ((seoData.headings.h1 ?? []).length === 0)
                issues.push("❌ No H1 tag found!");
            else if ((seoData.headings.h1 ?? []).length > 1)
                issues.push(`⚠️ Multiple H1 tags (${(seoData.headings.h1 ?? []).length})`);
            else
                good.push("✅ Single H1 tag");
            if (seoData.imagesWithoutAlt > 0)
                issues.push(`⚠️ ${seoData.imagesWithoutAlt}/${seoData.totalImages} images missing alt text`);
            else if (seoData.totalImages > 0)
                good.push(`✅ All ${seoData.totalImages} images have alt text`);
            if (!seoData.ogTitle)
                issues.push("⚠️ Missing OG title (og:title)");
            else
                good.push("✅ Open Graph title set");
            if (!seoData.ogImage)
                issues.push("⚠️ Missing OG image (og:image)");
            if (!seoData.twitterCard)
                issues.push("⚠️ Missing Twitter Card meta");
            if (!seoData.viewport)
                issues.push("❌ Missing viewport meta tag");
            if (!seoData.lang)
                issues.push("⚠️ Missing lang attribute on <html>");
            if (seoData.wordCount < 300)
                issues.push(`⚠️ Low word count (${seoData.wordCount} words)`);
            if (seoData.jsonld.length > 0)
                good.push(`✅ Structured data found (${seoData.jsonld.length} JSON-LD block(s))`);
            else
                issues.push("⚠️ No structured data (JSON-LD) found");
            const report = [
                `🔍 SEO Analysis: ${url}`,
                `${"─".repeat(60)}`,
                ``,
                `📌 PAGE METADATA`,
                `  Title         : "${seoData.title}" (${seoData.titleLength} chars)`,
                `  Description   : "${(seoData.metaDescription || "").slice(0, 80)}..." (${seoData.metaDescriptionLength} chars)`,
                `  Canonical     : ${seoData.canonical || "NOT SET"}`,
                `  Language      : ${seoData.lang || "NOT SET"}`,
                `  Robots        : ${seoData.robots || "index, follow (default)"}`,
                ``,
                `📊 CONTENT STATS`,
                `  Word count    : ${seoData.wordCount}`,
                `  Total links   : ${seoData.totalLinks} (${seoData.internalLinks} internal, ${seoData.externalLinks} external, ${seoData.nofollowLinks} nofollow)`,
                `  Images        : ${seoData.totalImages} total, ${seoData.imagesWithoutAlt} missing alt`,
                ``,
                `📑 HEADING STRUCTURE`,
                `  H1 (${(seoData.headings.h1 ?? []).length}): ${(seoData.headings.h1 ?? []).join(" | ") || "NONE"}`,
                `  H2 (${(seoData.headings.h2 ?? []).length}): ${(seoData.headings.h2 ?? []).slice(0, 3).join(" | ")}${(seoData.headings.h2 ?? []).length > 3 ? "..." : ""}`,
                ``,
                `📣 SOCIAL / OG`,
                `  og:title    : ${seoData.ogTitle || "NOT SET"}`,
                `  og:image    : ${seoData.ogImage || "NOT SET"}`,
                `  twitter:card: ${seoData.twitterCard || "NOT SET"}`,
                ``,
                `📋 STRUCTURED DATA`,
                seoData.jsonld.length > 0
                    ? seoData.jsonld.map((j) => `  • @type: ${j?.["@type"] ?? "unknown"}`).join("\n")
                    : `  NONE`,
                ``,
                `${"─".repeat(60)}`,
                `✅ PASSING (${good.length}):`,
                ...good.map((g) => `  ${g}`),
                ``,
                `⚠️  ISSUES (${issues.length}):`,
                ...issues.map((i) => `  ${i}`),
            ].join("\n");
            return { content: [{ type: "text", text: report }] };
        }
        catch (error) {
            return {
                content: [{ type: "text", text: formatToolError("extract_seo_data", error) }],
            };
        }
        finally {
            if (browser)
                await browser.close().catch(() => null);
            releaseSemaphore?.();
        }
    });
}
//# sourceMappingURL=audit.js.map