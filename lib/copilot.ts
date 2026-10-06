import { approveAll, CopilotClient, ToolSet } from "@github/copilot-sdk";

export type ChatMessage = { role: "user" | "assistant"; content: string };

const SYSTEM_PROMPT =
  "You are a friendly, playful chat buddy inside a small demo web app. " +
  "Keep answers short and conversational. You have no tools; just talk.";

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
  if (!last) throw new Error("No messages");
  const history = messages.slice(0, -1);
  if (history.length === 0) return last.content;
  const transcript = history.map((m) => `${m.role === "user" ? "User" : "You"}: ${m.content}`).join("\n\n");
  return `Conversation so far:\n\n${transcript}\n\nUser's new message:\n${last.content}`;
}

// Streams the assistant's reply as plain text chunks.
export async function streamReply(login: string, token: string, messages: ChatMessage[]) {
  const client = await clientFor(login, token);
  const session = await client.createSession({
    onPermissionRequest: approveAll,
    availableTools: new ToolSet(),
    streaming: true,
    systemMessage: { mode: "replace", content: SYSTEM_PROMPT },
  });
  const encoder = new TextEncoder();

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      session.on("assistant.message_delta", (e) => controller.enqueue(encoder.encode(e.data.deltaContent)));
      try {
        await session.sendAndWait(toPrompt(messages), 120_000);
      } catch (error) {
        controller.enqueue(encoder.encode(`\n\n[error: ${error instanceof Error ? error.message : String(error)}]`));
      } finally {
        controller.close();
        await session.disconnect().catch(() => {});
      }
    },
  });
}
