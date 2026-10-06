import chromium from "@sparticuz/chromium-min";
import puppeteer, { type Browser } from "puppeteer-core";
import { HTML_RENDER_COLUMN_WIDTH, htmlRenderTheme, injectHtmlRenderBootstrap, type ThemeAppearance } from "./html-render";

// On Vercel, Chromium is downloaded into /tmp on first use (keeps the function
// under the size limit next to the Copilot runtime). Locally, use installed Chrome.
const CHROMIUM_PACK =
  "https://github.com/Sparticuz/chromium/releases/download/v153.0.0/chromium-v153.0.0-pack.x64.tar";
const LOCAL_CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const MAX_CAPTURE_HEIGHT = 2000;

let browser: Promise<Browser> | undefined;

function getBrowser() {
  browser ??= (async () =>
    process.env.VERCEL
      ? puppeteer.launch({
          args: chromium.args,
          executablePath: await chromium.executablePath(CHROMIUM_PACK),
          headless: true,
        })
      : puppeteer.launch({ executablePath: process.env.CHROME_PATH ?? LOCAL_CHROME, headless: true }))();
  browser.catch(() => (browser = undefined));
  return browser;
}

export type ConsoleMessage = { level: "log" | "info" | "warning" | "error"; text: string };

export type HtmlPreview = {
  width: number;
  contentHeight: number;
  capturedHeight: number;
  consoleMessages: ConsoleMessage[];
  png: string; // base64
};

/** Renders a page as the chat would show it and returns a screenshot, its content height, and console output. */
export async function previewHtml(input: { html: string; width?: number; appearance?: ThemeAppearance }): Promise<HtmlPreview> {
  const width = Math.min(1600, Math.max(240, Math.round(input.width ?? HTML_RENDER_COLUMN_WIDTH)));
  const page = await (await getBrowser()).newPage();
  const consoleMessages: ConsoleMessage[] = [];
  page.on("console", (message) => {
    const type = message.type();
    const level = type === "error" || type === "warn" ? (type === "warn" ? "warning" : "error") : type === "info" ? "info" : "log";
    consoleMessages.push({ level, text: message.text() });
  });
  page.on("pageerror", (error) => consoleMessages.push({ level: "error", text: `Uncaught ${String(error)}` }));
  try {
    await page.setViewport({ width, height: 600 });
    const html = injectHtmlRenderBootstrap(input.html, htmlRenderTheme(input.appearance ?? "dark"));
    await page.setContent(html, { waitUntil: "load", timeout: 20_000 });
    await page.waitForNetworkIdle({ idleTime: 300, timeout: 10_000 }).catch(() => {});
    // Let chart libraries finish their first animation frame.
    await new Promise((resolve) => setTimeout(resolve, 400));
    const contentHeight = await page.evaluate(() => {
      const root = document.documentElement;
      return Math.ceil(root.scrollHeight > root.clientHeight ? root.scrollHeight : root.getBoundingClientRect().height);
    });
    const capturedHeight = Math.min(contentHeight, MAX_CAPTURE_HEIGHT);
    await page.setViewport({ width, height: Math.max(1, capturedHeight) });
    const png = Buffer.from(await page.screenshot({ type: "png" })).toString("base64");
    return { width, contentHeight, capturedHeight, consoleMessages, png };
  } finally {
    await page.close().catch(() => {});
  }
}
