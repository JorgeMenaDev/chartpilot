"use client";

import { useEffect, useRef, useState } from "react";
import type { ChatMessage } from "@/lib/copilot";

export function Chat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => bottom.current?.scrollIntoView({ behavior: "smooth" }), [messages]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    const history: ChatMessage[] = [...messages, { role: "user", content: text }];
    setMessages([...history, { role: "assistant", content: "" }]);
    setInput("");
    setBusy(true);

    const appendToReply = (chunk: string) =>
      setMessages((prev) => [...prev.slice(0, -1), { role: "assistant", content: (prev.at(-1)?.content ?? "") + chunk }]);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history }),
      });
      if (res.status === 401) return window.location.reload();
      if (!res.ok || !res.body) return appendToReply(`[error: ${res.status} ${await res.text()}]`);
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      for (let r = await reader.read(); !r.done; r = await reader.read()) appendToReply(r.value);
    } catch (error) {
      appendToReply(`[error: ${String(error)}]`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="messages">
        {messages.length === 0 && <p className="empty">Ask anything. Try: “Which animal would win at chess?”</p>}
        {messages.map((m, i) => (
          <div key={i} className={`bubble ${m.role}`}>
            {m.content || (busy && i === messages.length - 1 ? "…" : "")}
          </div>
        ))}
        <div ref={bottom} />
      </div>
      <form className="composer" onSubmit={send}>
        <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Say something silly…" autoFocus />
        <button className="button" disabled={busy || !input.trim()}>
          Send
        </button>
      </form>
    </>
  );
}
