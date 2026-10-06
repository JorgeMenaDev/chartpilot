/**
 * Agent-authored HTML pages ("HTML renders"), ported from T3 Code
 * (packages/shared/src/htmlRender.ts, MIT, © 2026 T3 Tools Inc.).
 *
 * The agent writes one self-contained HTML document and publishes it with the
 * `html_render` tool. The client shows it in a sandboxed iframe with a small
 * bootstrap injected into its head: the app theme as CSS custom properties, a
 * base stylesheet, link handling, and height reporting over postMessage
 * (the MCP Apps JSON-RPC shapes T3 uses).
 *
 * Differences from T3: pages travel inline in the chat stream instead of as
 * thread attachments, and the theme is baked into the injected bootstrap
 * (srcdoc frames have no URL fragment to carry it).
 */

export const HTML_RENDER_TOOL_NAME = "html_render";
export const HTML_PREVIEW_TOOL_NAME = "html_preview";
export const HTML_RENDER_MIN_HEIGHT = 80;
export const HTML_RENDER_MAX_HEIGHT = 2000;
export const HTML_RENDER_MAX_HTML_LENGTH = 512_000;
/** The reply column's width. Agents preview at it. */
export const HTML_RENDER_COLUMN_WIDTH = 728;

/** What a published page carries to the client. */
export type HtmlRender = { title: string; height: number; html: string };

export function clampHtmlRenderHeight(height: number): number {
  return Math.min(HTML_RENDER_MAX_HEIGHT, Math.max(HTML_RENDER_MIN_HEIGHT, Math.round(height)));
}

export type ThemeAppearance = "dark" | "light";
export type HtmlRenderTheme = { appearance: ThemeAppearance; variables: Record<string, string> };

const FONTS = {
  sans: 'var(--app-font-sans, -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif)',
  mono: '"SF Mono", "SFMono-Regular", Menlo, Consolas, "Liberation Mono", monospace',
};

// T3 Code's stock palettes, mapped to the variables pages style against.
// --chart-1 is the theme accent, then a fixed categorical series.
const THEMES: Record<ThemeAppearance, Record<string, string>> = {
  dark: {
    "--background": "#0a0a0a",
    "--foreground": "#f5f5f5",
    "--muted": "#111111",
    "--muted-foreground": "#818181",
    "--card": "#111111",
    "--card-foreground": "#f5f5f5",
    "--popover": "#111111",
    "--popover-foreground": "#f5f5f5",
    "--secondary": "#111111",
    "--secondary-foreground": "#f5f5f5",
    "--border": "#191919",
    "--input": "#1e1e1e",
    "--ring": "#346bf1",
    "--primary": "#346bf1",
    "--primary-foreground": "#ffffff",
    "--accent": "#346bf1",
    "--accent-foreground": "#ffffff",
    "--accent-surface": "#141414",
    "--accent-surface-foreground": "#f5f5f5",
    "--destructive": "#fb414a",
    "--destructive-foreground": "#ff6467",
    "--destructive-surface": "#301214",
    "--warning": "#fe9a00",
    "--warning-foreground": "#ffb900",
    "--warning-surface": "#312108",
    "--success": "#10b981",
    "--success-foreground": "#34d399",
    "--info": "#3b82f6",
    "--info-foreground": "#60a5fa",
    "--code-background": "#111111",
    "--code-foreground": "#f5f5f5",
    "--chart-1": "#346bf1",
    "--chart-2": "#2dd4bf",
    "--chart-3": "#fbbf24",
    "--chart-4": "#c084fc",
    "--chart-5": "#fb7185",
    "--chart-6": "#a3e635",
  },
  light: {
    "--background": "#fcfcfc",
    "--foreground": "#27272a",
    "--muted": "#fafafa",
    "--muted-foreground": "#71717b",
    "--card": "#ffffff",
    "--card-foreground": "#27272a",
    "--popover": "#ffffff",
    "--popover-foreground": "#27272a",
    "--secondary": "#fafafa",
    "--secondary-foreground": "#27272a",
    "--border": "#e4e4e7",
    "--input": "#d4d4d8",
    "--ring": "#1b4ed8",
    "--primary": "#1b4ed8",
    "--primary-foreground": "#ffffff",
    "--accent": "#1b4ed8",
    "--accent-foreground": "#ffffff",
    "--accent-surface": "#f4f4f5",
    "--accent-surface-foreground": "#18181b",
    "--destructive": "#fb2c36",
    "--destructive-foreground": "#c10007",
    "--destructive-surface": "#fcebec",
    "--warning": "#fe9a00",
    "--warning-foreground": "#bb4d00",
    "--warning-surface": "#fcf4e8",
    "--success": "#10b981",
    "--success-foreground": "#047857",
    "--info": "#3b82f6",
    "--info-foreground": "#1d4ed8",
    "--code-background": "#f4f4f5",
    "--code-foreground": "#27272a",
    "--chart-1": "#1b4ed8",
    "--chart-2": "#0d9488",
    "--chart-3": "#d97706",
    "--chart-4": "#9333ea",
    "--chart-5": "#e11d48",
    "--chart-6": "#65a30d",
  },
};

export function htmlRenderTheme(appearance: ThemeAppearance): HtmlRenderTheme {
  return {
    appearance,
    variables: { ...THEMES[appearance], "--radius": "0.625rem", "--font-sans": FONTS.sans, "--font-mono": FONTS.mono },
  };
}

/** Agent-facing reference for the injected variables, used in tool descriptions. */
export const HTML_RENDER_THEME_GUIDE = [
  "The app injects its active theme as CSS custom properties on :root, and they follow light/dark mode live:",
  "--background (page background, identical to the chat around the frame), --foreground, --muted, --muted-foreground,",
  "--card, --card-foreground, --popover, --popover-foreground, --secondary, --secondary-foreground, --border, --input, --ring,",
  "--primary, --primary-foreground (solid buttons), --accent, --accent-foreground (brand accent), --accent-surface, --accent-surface-foreground,",
  "--destructive, --destructive-foreground, --destructive-surface, --warning, --warning-foreground, --warning-surface,",
  "--success, --success-foreground, --info, --info-foreground, --code-background, --code-foreground,",
  "--chart-1 … --chart-6 (categorical series for charts), --radius, --font-sans, --font-mono.",
  "The base stylesheet sets html background/color/font from these, body margin to 0, and hides the page's scrollbar; your own CSS overrides it.",
].join(" ");

/** Agent-facing layout rules for a page that sits inside a reply. */
export const HTML_RENDER_LAYOUT_GUIDE = [
  `The frame is borderless on the chat's background, as wide as the reply column (${HTML_RENDER_COLUMN_WIDTH}px on desktop, about 360px on phones), and its left edge lines up with your reply text.`,
  "Use a fluid width with no horizontal padding on the outermost element, and no outer card, border, or banner title: the page is part of your reply.",
  "Give charts fixed pixel heights rather than heights that scale with width.",
  "Let content set the page's height. Avoid viewport-based heights such as 100vh or height:100% on html or body; the frame grows to fit the page, so they can make it grow again and again.",
].join(" ");

export const HTML_RENDER_PAGE_RULES =
  "Write one self-contained document with inline <style> and <script>. Remote http(s) URLs, such as a CDN chart library, load as-is.";

// The bridge between a render and its client speaks the MCP Apps protocol
// (JSON-RPC over postMessage): https://github.com/modelcontextprotocol/ext-apps
const HOST_CONTEXT_CHANGED_METHOD = "ui/notifications/host-context-changed";
const OPEN_LINK_METHOD = "ui/open-link";
const SIZE_CHANGED_METHOD = "ui/notifications/size-changed";

/** The content height in a framed render's `ui/notifications/size-changed` notification. */
export function readHtmlRenderContentHeight(data: unknown): number | undefined {
  if (typeof data !== "object" || data === null) return undefined;
  const { jsonrpc, method, params } = data as Record<string, unknown>;
  if (jsonrpc !== "2.0" || method !== SIZE_CHANGED_METHOD) return undefined;
  const height = typeof params === "object" && params !== null ? (params as { height?: unknown }).height : undefined;
  return typeof height === "number" && Number.isFinite(height) && height > 0 ? height : undefined;
}

/** A render's `ui/open-link` request, if `data` is one with an http(s) URL. */
export function readHtmlRenderLinkRequest(data: unknown): { id: string | number; url: string } | undefined {
  if (typeof data !== "object" || data === null) return undefined;
  const { jsonrpc, id, method, params } = data as Record<string, unknown>;
  if (jsonrpc !== "2.0" || method !== OPEN_LINK_METHOD) return undefined;
  if (typeof id !== "string" && typeof id !== "number") return undefined;
  const url = typeof params === "object" && params !== null ? (params as { url?: unknown }).url : undefined;
  return typeof url === "string" && /^https?:\/\//i.test(url) ? { id, url } : undefined;
}

/** The empty result a client sends back for a render's request. */
export function htmlRenderResult(id: string | number) {
  return { jsonrpc: "2.0", id, result: {} } as const;
}

/** The `host-context-changed` notification a client posts into a mounted render when the theme changes. */
export function htmlRenderThemeMessage(theme: HtmlRenderTheme) {
  return {
    jsonrpc: "2.0",
    method: HOST_CONTEXT_CHANGED_METHOD,
    params: { theme: theme.appearance, styles: { variables: theme.variables } },
  } as const;
}

// A scrollbar inside the reply reads as a box within the chat, so it stays hidden.
const BASE_CSS =
  "html{background:var(--background);color:var(--foreground);font-family:var(--font-sans);font-size:14px;line-height:1.5;-webkit-font-smoothing:antialiased;-webkit-text-size-adjust:100%;scrollbar-width:none}" +
  "html::-webkit-scrollbar{display:none}body{margin:0}code,kbd,pre,samp{font-family:var(--font-mono)}";

function rootRule(theme: HtmlRenderTheme): string {
  const declarations = Object.entries(theme.variables)
    .map(([name, value]) => `${name}:${value};`)
    .join("");
  return `:root{color-scheme:${theme.appearance};${declarations}}`;
}

// Runs synchronously in <head>, before the page's own styles and body. It
// follows theme changes the host posts, asks the host to open clicked links,
// and reports the page's content height so the host can fit the frame.
const BOOTSTRAP_SCRIPT = `(function(){var s=document.getElementById("t3-theme"),n=0;if(!s)return;var b=${JSON.stringify(BASE_CSS)};function a(t){if(!t||typeof t!=="object"||!t.variables||typeof t.variables!=="object")return;var c=":root{color-scheme:"+(t.appearance==="light"?"light":"dark")+";";for(var k in t.variables){if(/^--[a-z0-9-]+$/.test(k))c+=k+":"+String(t.variables[k]).replace(/[;{}<>]/g,"")+";";}s.textContent=c+"}"+b;}window.addEventListener("message",function(e){var d=e.data,p=d&&d.params;if(d&&d.jsonrpc==="2.0"&&d.method===${JSON.stringify(HOST_CONTEXT_CHANGED_METHOD)}&&p&&p.styles)a({appearance:p.theme,variables:p.styles.variables});});document.addEventListener("click",function(e){var l=e.isTrusted?e.composedPath().find(function(t){return t&&t.matches&&t.matches("a[href]");}):null,u;if(!l)return;try{u=new URL(l.getAttribute("href"),document.baseURI);}catch(x){return;}if(!/^https?:$/.test(u.protocol))return;if(window.parent!==window){e.preventDefault();window.parent.postMessage({jsonrpc:"2.0",id:"t3-link-"+(++n),method:${JSON.stringify(OPEN_LINK_METHOD)},params:{url:u.href}},"*");}else{l.setAttribute("target","_blank");l.setAttribute("rel","noopener");}},true);if(window.parent!==window){var h,o,z=function(){var r=document.documentElement,v=Math.ceil(r.scrollHeight>r.clientHeight?r.scrollHeight:r.getBoundingClientRect().height);if(v===h)return;h=v;window.parent.postMessage({jsonrpc:"2.0",method:${JSON.stringify(SIZE_CHANGED_METHOD)},params:{height:v}},"*");};if(window.ResizeObserver){o=new ResizeObserver(z);o.observe(document.documentElement);}document.addEventListener("DOMContentLoaded",function(){if(o&&document.body)o.observe(document.body);z();});window.addEventListener("load",z);}})();`;

function bootstrapMarkup(markup: string, theme: HtmlRenderTheme): string {
  return [
    /<meta\s[^>]*charset/i.test(markup.slice(0, 4096)) ? "" : '<meta charset="utf-8">',
    /<meta\s[^>]*name\s*=\s*["']?viewport/i.test(markup)
      ? ""
      : '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<style id="t3-theme">${rootRule(theme)}${BASE_CSS}</style>`,
    `<script>${BOOTSTRAP_SCRIPT}</script>`,
  ].join("");
}

// Comments, raw text, and template contents are blanked to the same length,
// so offsets still line up and inert tags cannot receive the bootstrap.
const blankNonMarkup = (html: string) => {
  const scan = html.replace(
    /<!--[\s\S]*?(?:-->|$)|<(script|style|textarea|title|xmp|iframe|noembed|noframes|noscript)\b[\s\S]*?(?:<\/\1\s*>|$)|<plaintext\b[\s\S]*$/gi,
    (match) => " ".repeat(match.length),
  );
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  let at = 0;
  for (const match of scan.matchAll(/<(\/?)template(?:\s[^>]*)?\/?>/gi)) {
    if (!match[1]) {
      if (depth++ === 0) start = match.index;
    } else if (depth > 0 && --depth === 0) {
      const end = match.index + match[0].length;
      parts.push(scan.slice(at, start), " ".repeat(end - start));
      at = end;
    }
  }
  if (depth > 0) {
    parts.push(scan.slice(at, start), " ".repeat(scan.length - start));
    at = scan.length;
  }
  parts.push(scan.slice(at));
  return parts.join("");
};

/** Inserts the theme bootstrap at the start of the document head, so a page's own styles and scripts come after it. */
export function injectHtmlRenderBootstrap(html: string, theme: HtmlRenderTheme): string {
  const scan = blankNonMarkup(html);
  const markup = bootstrapMarkup(scan, theme);
  const headOpen = /<head(?:\s[^>]*)?>/i.exec(scan);
  if (headOpen) {
    const at = headOpen.index + headOpen[0].length;
    return html.slice(0, at) + markup + html.slice(at);
  }
  const htmlOpen = /<html(?:\s[^>]*)?>/i.exec(scan);
  if (htmlOpen) {
    const at = htmlOpen.index + htmlOpen[0].length;
    return `${html.slice(0, at)}<head>${markup}</head>${html.slice(at)}`;
  }
  const doctype = /^\s*<!doctype[^>]*>/i.exec(html);
  if (doctype) {
    const at = doctype[0].length;
    return `${html.slice(0, at)}<head>${markup}</head>${html.slice(at)}`;
  }
  return `<!doctype html><head>${markup}</head>${html}`;
}
