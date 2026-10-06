import { streamReply, type ChatMessage } from "@/lib/copilot";
import { getSession } from "@/lib/session";

export const maxDuration = 300;

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return new Response("Not signed in", { status: 401 });

  const { messages } = (await req.json()) as { messages: ChatMessage[] };
  if (!Array.isArray(messages) || messages.length === 0) return new Response("No messages", { status: 400 });

  const stream = await streamReply(session.login, session.token, messages);
  return new Response(stream, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
}
