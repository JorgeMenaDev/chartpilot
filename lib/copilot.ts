import { approveAll, CopilotClient, defineTool, ToolSet, type ToolResultObject } from "@github/copilot-sdk";
import { previewHtml } from "./html-preview";
import {
  clampHtmlRenderHeight,
  HTML_PREVIEW_TOOL_NAME,
  HTML_RENDER_COLUMN_WIDTH,
  HTML_RENDER_LAYOUT_GUIDE,
  HTML_RENDER_MAX_HEIGHT,
  HTML_RENDER_MAX_HTML_LENGTH,
  HTML_RENDER_MIN_HEIGHT,
  HTML_RENDER_PAGE_RULES,
  HTML_RENDER_THEME_GUIDE,
  HTML_RENDER_TOOL_NAME,
  type HtmlRender,
} from "./html-render";

/** One piece of an assistant reply, in the order it arrived. */
export type ReplyPart = { kind: "text"; text: string } | { kind: "render"; render: HtmlRender };

export type ChatMessage = { role: "user"; content: string } | { role: "assistant"; parts: ReplyPart[] };

/** What /api/chat streams to the browser, one JSON object per line. */
export type ChatEvent =
  | { type: "text"; delta: string }
  | { type: "status"; label: string | null }
  | { type: "render"; render: HtmlRender }
  | { type: "error"; message: string };

const SYSTEM_PROMPT = `You are a friendly, curious chat companion in a small web app. Talk about anything, including silly topics. Keep text replies short and conversational, and use Markdown when it helps.

### Showing visuals

When a chart, table, diagram, image collage, or mockup would say more than prose, build a self-contained HTML page, check it with \`${HTML_PREVIEW_TOOL_NAME}\`, then publish it with \`${HTML_RENDER_TOOL_NAME}\` before your final reply. The reader sees the page above that reply, so don't announce or restate it; add only what it doesn't say.

Questions about numbers, rankings, comparisons, timelines, or how something works usually deserve a visual. Make it polished: clear labels, sensible scales, the theme's --chart-* colors, and a short caption or key facts where they help.`;

const Html = {
  type: "string",
  minLength: 1,
  maxLength: HTML_RENDER_MAX_HTML_LENGTH,
  description: "A complete, self-contained HTML document.",
} as const;

type PreviewArgs = { html: string; width?: number; appearance?: "dark" | "light" };
type RenderArgs = { html: string; title: string; height: number };

// Tool descriptions follow T3 Code's html_preview / html_render MCP tools.
function htmlTools(emit: (event: ChatEvent) => void) {
  const preview = defineTool<PreviewArgs>(HTML_PREVIEW_TOOL_NAME, {
    description: `Render an HTML page in a headless browser and get back a PNG screenshot, contentHeight (the height the page needs at this width), and its console output: log, info, warning, error, and uncaught exceptions. console.log is a fine way to report your own checks. Use it to check and iterate on a page before ${HTML_RENDER_TOOL_NAME}. ${HTML_RENDER_PAGE_RULES} The page gets the theme variables and layout described in ${HTML_RENDER_TOOL_NAME}.`,
    parameters: {
      type: "object",
      properties: {
        html: Html,
        width: {
          type: "integer",
          description: `Viewport width in CSS pixels, 240-1600. Defaults to ${HTML_RENDER_COLUMN_WIDTH}, the reply column; use about 390 to check phones.`,
        },
        appearance: { type: "string", enum: ["dark", "light"], description: "Theme to preview. Defaults to dark." },
      },
      required: ["html"],
    },
    skipPermission: true,
    handler: async (args): Promise<ToolResultObject> => {
      emit({ type: "status", label: "Checking the visual" });
      try {
        const { png, ...result } = await previewHtml(args);
        return {
          resultType: "success",
          textResultForLlm: JSON.stringify(result),
          binaryResultsForLlm: [{ type: "image", mimeType: "image/png", data: png, description: "Screenshot of the page" }],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          resultType: "failure",
          error: message,
          textResultForLlm: `Preview failed: ${message}. If the page is likely fine, publish it with ${HTML_RENDER_TOOL_NAME} anyway.`,
        };
      }
    },
  });

  const render = defineTool<RenderArgs>(HTML_RENDER_TOOL_NAME, {
    description: `Show a finished HTML page (chart, table, diagram, collage, mockup) inline in this chat, above your final text reply; call it before writing that reply. The reader already sees the page, so the reply should not announce it, say where it is, or restate it: add only what the page doesn't say. Preview with ${HTML_PREVIEW_TOOL_NAME} first. The app fits the frame to the page's height at each reader's width. ${HTML_RENDER_PAGE_RULES} ${HTML_RENDER_LAYOUT_GUIDE} ${HTML_RENDER_THEME_GUIDE}`,
    parameters: {
      type: "object",
      properties: {
        html: Html,
        title: { type: "string", minLength: 1, maxLength: 200, description: "Short name for the page." },
        height: {
          type: "integer",
          description: `The frame height in CSS pixels, ${HTML_RENDER_MIN_HEIGHT}-${HTML_RENDER_MAX_HEIGHT}. Use ${HTML_PREVIEW_TOOL_NAME}'s contentHeight.`,
        },
      },
      required: ["html", "title", "height"],
    },
    skipPermission: true,
    handler: async ({ html, title, height }) => {
      emit({ type: "render", render: { html, title: title.trim() || "Page", height: clampHtmlRenderHeight(height) } });
      emit({ type: "status", label: null });
      return "Shown to the reader above your reply. Don't mention or describe the page; reply with only what it doesn't already say.";
    },
  });

  return [preview, render];
}

// One Copilot runtime per GitHub user, reused while this server instance stays warm.
const clients = new Map<string, Promise<CopilotClient>>();

function clientFor(login: string, token: string) {
  let client = clients.get(login);
  if (!client) {
    const home = `/tmp/copilot/${login}`;
    const c = new CopilotClient({
      gitHubToken: token,
      useLoggedInUser: false,
      mode: "empty", // multi-user server mode: no ambient OS tools
      baseDirectory: home,
      workingDirectory: "/tmp",
      // The serverless filesystem is read-only outside /tmp.
      env: { ...process.env, HOME: home, XDG_CACHE_HOME: "/tmp/copilot/.cache" },
      logLevel: "error",
    });
    client = c.start().then(() => c);
    client.catch(() => clients.delete(login));
    clients.set(login, client);
  }
  return client;
}

// Server instances do not keep chat state, so each turn starts a fresh session
// and replays the earlier turns as a transcript in the prompt.
function toPrompt(messages: ChatMessage[]) {
  const last = messages.at(-1);
  if (!last || last.role !== "user") throw new Error("The last message must be the user's");
  const history = messages.slice(0, -1);
  if (history.length === 0) return last.content;
  const transcript = history
    .map((m) =>
      m.role === "user"
        ? `User: ${m.content}`
        : `You: ${m.parts
            .map((p) => (p.kind === "text" ? p.text : `[You showed the reader an HTML page titled "${p.render.title}".]`))
            .join("\n")}`,
    )
    .join("\n\n");
  return `Conversation so far:\n\n${transcript}\n\nUser's new message:\n${last.content}`;
}

/** Runs one turn and streams it as newline-delimited ChatEvents. */
export async function streamReply(login: string, token: string, messages: ChatMessage[]) {
  const encoder = new TextEncoder();
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const stream = new ReadableStream<Uint8Array>({ start: (c) => void (controller = c) });
  const emit = (event: ChatEvent) => controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));

  const tools = htmlTools(emit);
  const client = await clientFor(login, token);
  const session = await client.createSession({
    onPermissionRequest: approveAll,
    tools,
    availableTools: tools.reduce((set, tool) => set.addCustom(tool.name), new ToolSet()),
    streaming: true,
    systemMessage: { mode: "replace", content: SYSTEM_PROMPT },
  });
  session.on("assistant.message_delta", (e) => emit({ type: "text", delta: e.data.deltaContent }));
  session.on("tool.execution_start", (e) => {
    if (e.data.toolName === HTML_RENDER_TOOL_NAME) emit({ type: "status", label: "Publishing the visual" });
  });

  void (async () => {
    try {
      emit({ type: "status", label: "Thinking" });
      await session.sendAndWait(toPrompt(messages), 240_000);
    } catch (error) {
      emit({ type: "error", message: error instanceof Error ? error.message : String(error) });
    } finally {
      controller.close();
      await session.disconnect().catch(() => {});
    }
  })();

  return stream;
}
