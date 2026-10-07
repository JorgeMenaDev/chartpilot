// What a compose request may carry, checked before any of it reaches the
// layout model. Pure, so it is tested without a server.
import { z } from "zod";
import { layoutSchema } from "./layout";

/** Larger bodies are refused unread: a full layout and prompt fit in a few kilobytes. */
export const MAX_BODY_BYTES = 16_000;

const composeRequestSchema = z.object({
  prompt: z.string().trim().min(1).max(500),
  // The current dashboard and its contractor scope, when the question edits it.
  layout: layoutSchema.nullable(),
  companyId: z.string().min(1).max(64).nullable(),
  // The Visualization model from settings.
  choice: z.object({
    model: z.string().min(1).max(100),
    effort: z.enum(["low", "medium", "high", "xhigh", "max"]).nullable(),
  }),
});

export type ComposeRequest = z.infer<typeof composeRequestSchema>;

/** The body as text, or null once it passes `limit` bytes (it stops reading there). */
export async function readBody(request: Request, limit = MAX_BODY_BYTES) {
  const reader = request.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (let read = await reader.read(); !read.done; read = await reader.read()) {
    size += read.value.byteLength;
    if (size > limit) {
      await reader.cancel();
      return null;
    }
    chunks.push(read.value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

/** The request in `text`, or null when it is not JSON or breaks a bound. */
export function parseComposeRequest(text: string): ComposeRequest | null {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return null;
  }
  const parsed = composeRequestSchema.safeParse(json);
  return parsed.success ? parsed.data : null;
}
