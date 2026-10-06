import { streamReply, type ChatMessage } from "@/lib/copilot";
import { getSession } from "@/lib/session";

export const maxDuration = 300;

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return new Response("Not signed in", { status: 401 });

  const { messages } = (await req.json()) as { messages: ChatMessage[] };
  if (!Array.isArray(messages) || messages.at(-1)?.role !== "user") return new Response("No user message", { status: 400 });

  const stream = await streamReply(session.login, session.token, messages);
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" } });
}
