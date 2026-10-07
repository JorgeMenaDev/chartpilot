"use client";

import { SparklesIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { ControlSeparator, EffortPicker, ModelPicker, SendButton } from "@/components/composer-controls";
import { HtmlRenderFrame } from "@/components/html-render-frame";
import { Markdown } from "@/components/markdown";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { Marker, MarkerContent, MarkerIcon } from "@/components/ui/marker";
import { Message, MessageContent } from "@/components/ui/message";
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@/components/ui/message-scroller";
import { Spinner } from "@/components/ui/spinner";
import type { ChatEvent, ChatMessage, ModelChoice, ReasoningEffort, ReplyPart } from "@/lib/copilot";
import type { ModelCatalog } from "@/lib/models";

type Entry = ChatMessage & { id: string };

// The featured starter is picked to make the agent reach for a chart.
const STARTERS = [
  {
    featured: true,
    title: "The Animal Olympics",
    prompt:
      "If animals competed in the Olympics, who would take gold? Compare the fastest, strongest and highest-jumping animals against the human world records.",
  },
  { title: "Pizza per second", prompt: "How much pizza does the world eat every second? Break it down by country." },
  { title: "A cat's perfect day", prompt: "Plan a lazy house cat's perfect day, hour by hour, and how much of it is naps." },
];

function appendPart(parts: ReplyPart[], event: ChatEvent): ReplyPart[] {
  if (event.type === "render") return [...parts, { kind: "render", render: event.render }];
  const text = event.type === "text" ? event.delta : event.type === "error" ? `\n\n**Error:** ${event.message}` : "";
  if (!text) return parts;
  const last = parts.at(-1);
  return last?.kind === "text" ? [...parts.slice(0, -1), { kind: "text", text: last.text + text }] : [...parts, { kind: "text", text }];
}

export function Chat({ login }: { login: string }) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [input, setInput] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const busy = status !== null;
  const { catalog, choice, setModel, setEffort } = useModelChoice();

  async function send(text: string) {
    text = text.trim();
    if (!text || busy) return;
    const history: Entry[] = [...entries, { id: crypto.randomUUID(), role: "user", content: text }];
    const replyId = crypto.randomUUID();
    setEntries([...history, { id: replyId, role: "assistant", parts: [] }]);
    setInput("");
    setStatus("Thinking");

    const apply = (event: ChatEvent) => {
      if (event.type === "ping") return;
      if (event.type === "status") return setStatus(event.label ?? "Writing");
      setEntries((prev) =>
        prev.map((e) => (e.id === replyId && e.role === "assistant" ? { ...e, parts: appendPart(e.parts, event) } : e)),
      );
      if (event.type === "text") setStatus("Writing");
    };

    // iOS suspends a backgrounded page and cuts its open request; note it for the error message.
    let wentToBackground = false;
    const onVisibility = () => {
      if (document.visibilityState === "hidden") wentToBackground = true;
    };
    document.addEventListener("visibilitychange", onVisibility);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history.map(({ id: _, ...m }) => m), choice }),
      });
      if (res.status === 401) return window.location.reload();
      if (!res.ok || !res.body) return apply({ type: "error", message: `${res.status} ${await res.text()}` });
      let buffer = "";
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      for (let r = await reader.read(); !r.done; r = await reader.read()) {
        buffer += r.value;
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) if (line) apply(JSON.parse(line) as ChatEvent);
      }
    } catch (error) {
      apply({
        type: "error",
        message: wentToBackground
          ? "The connection dropped while this page was in the background. Phones pause the browser when you switch apps, so keep this page open until the reply finishes, then send the message again."
          : `The connection dropped before the reply finished (${String(error)}). Send the message again.`,
      });
    } finally {
      document.removeEventListener("visibilitychange", onVisibility);
      setStatus(null);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {entries.length === 0 ? (
        <EmptyState login={login} onPick={send} />
      ) : (
        <MessageScrollerProvider>
          <MessageScroller className="flex-1">
            <MessageScrollerViewport>
              <MessageScrollerContent className="mx-auto w-full max-w-3xl gap-8 px-4 pt-6 pb-10">
                {entries.map((entry, i) => (
                  <MessageScrollerItem key={entry.id} messageId={entry.id} scrollAnchor={entry.role === "user"}>
                    {entry.role === "user" ? (
                      <Message align="end">
                        <MessageContent>
                          <Bubble variant="secondary">
                            <BubbleContent className="whitespace-pre-wrap">{entry.content}</BubbleContent>
                          </Bubble>
                        </MessageContent>
                      </Message>
                    ) : (
                      <Message>
                        <MessageContent className="gap-4">
                          {entry.parts.map((part, j) =>
                            part.kind === "render" ? (
                              <HtmlRenderFrame key={j} render={part.render} />
                            ) : (
                              <Markdown key={j}>{part.text}</Markdown>
                            ),
                          )}
                          {busy && i === entries.length - 1 && (
                            <Marker>
                              <MarkerIcon>
                                <Spinner />
                              </MarkerIcon>
                              <MarkerContent className="shimmer">{status}…</MarkerContent>
                            </Marker>
                          )}
                        </MessageContent>
                      </Message>
                    )}
                  </MessageScrollerItem>
                ))}
              </MessageScrollerContent>
            </MessageScrollerViewport>
            <MessageScrollerButton />
          </MessageScroller>
        </MessageScrollerProvider>
      )}
      <Composer value={input} onChange={setInput} onSend={() => send(input)} busy={busy}>
        {catalog && (
          <ComposerModelControls catalog={catalog} choice={choice} onModel={setModel} onEffort={setEffort} disabled={busy} />
        )}
      </Composer>
    </div>
  );
}

function EmptyState({ login, onPick }: { login: string; onPick: (prompt: string) => void }) {
  const [featured, ...others] = STARTERS;
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-8 overflow-y-auto px-4 py-10">
      <div className="space-y-2 text-center">
        <h1 className="text-3xl font-semibold tracking-tight">Hey {login}, what shall we explore?</h1>
        <p className="text-muted-foreground">Ask anything. Charts appear when they say more than words.</p>
      </div>
      <div className="grid w-full max-w-2xl gap-3 sm:grid-cols-2">
        {featured && (
          <button
            onClick={() => onPick(featured.prompt)}
            className="group relative overflow-hidden rounded-2xl border border-primary/40 bg-gradient-to-br from-primary/15 via-transparent to-chart-2/10 p-5 text-left transition hover:border-primary sm:col-span-2"
          >
            <span className="mb-2 flex items-center gap-2 text-xs font-medium tracking-wide text-primary uppercase">
              <SparklesIcon className="size-3.5" /> Try this
            </span>
            <span className="block text-lg font-semibold">{featured.title}</span>
            <span className="mt-1 block text-sm text-muted-foreground">{featured.prompt}</span>
          </button>
        )}
        {others.map((s) => (
          <button
            key={s.title}
            onClick={() => onPick(s.prompt)}
            className="rounded-2xl border border-border p-4 text-left transition hover:bg-muted"
          >
            <span className="block font-medium">{s.title}</span>
            <span className="mt-1 block text-sm text-muted-foreground">{s.prompt}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

const CHOICE_KEY = "copilot-chat:model-choice";

/** The user's model catalog and their saved model + effort choice. */
function useModelChoice() {
  const [catalog, setCatalog] = useState<ModelCatalog | null>(null);
  const [choice, setChoice] = useState<ModelChoice>({ model: "auto", effort: null });

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(CHOICE_KEY) ?? "null") as ModelChoice | null;
      if (saved?.model) setChoice(saved);
    } catch {}
    fetch("/api/models")
      .then((res) => (res.ok ? (res.json() as Promise<ModelCatalog>) : null))
      .then(setCatalog)
      .catch(() => {});
  }, []);

  // A saved model the plan no longer offers falls back to Auto.
  const usable = catalog?.models.find((m) => m.id === choice.model && m.lockedReason === null);
  const effective: ModelChoice = catalog && !usable ? { model: "auto", effort: choice.effort } : choice;

  const update = (next: ModelChoice) => {
    setChoice(next);
    localStorage.setItem(CHOICE_KEY, JSON.stringify(next));
  };
  return {
    catalog,
    choice: effective,
    setModel: (model: string) => update({ model, effort: null }),
    setEffort: (effort: ReasoningEffort) => update({ ...effective, effort }),
  };
}

function ComposerModelControls(props: {
  catalog: ModelCatalog;
  choice: ModelChoice;
  onModel: (id: string) => void;
  onEffort: (effort: ReasoningEffort) => void;
  disabled: boolean;
}) {
  const model = props.catalog.models.find((m) => m.id === props.choice.model);
  return (
    <>
      <ModelPicker models={props.catalog.models} value={props.choice.model} onChange={props.onModel} disabled={props.disabled} />
      {model && model.efforts.length > 0 && (
        <>
          <ControlSeparator />
          <EffortPicker
            efforts={model.efforts}
            defaultEffort={model.defaultEffort}
            value={props.choice.effort}
            onChange={props.onEffort}
            disabled={props.disabled}
            {...(props.catalog.autoOnly
              ? { note: "On Copilot Free, Auto runs a model without reasoning, so effort has no effect." }
              : {})}
          />
        </>
      )}
    </>
  );
}

/** T3-style composer: a rounded glass surface, the prompt on top, controls and send below. */
function Composer(props: {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  busy: boolean;
  children?: React.ReactNode;
}) {
  return (
    <form
      className="mx-auto w-full max-w-3xl px-3 pb-3 sm:px-4 sm:pb-4"
      onSubmit={(e) => {
        e.preventDefault();
        props.onSend();
      }}
    >
      <div className="relative isolate rounded-3xl bg-(--surface-raised)/(--glass-opacity) shadow-composer backdrop-blur-(--glass-blur) backdrop-saturate-(--glass-saturation) after:pointer-events-none after:absolute after:inset-0 after:rounded-[inherit] after:border after:border-[color-mix(in_srgb,white_5%,transparent)] dark:shadow-none">
        <textarea
          value={props.value}
          onChange={(e) => props.onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              props.onSend();
            }
          }}
          placeholder="Ask something silly…"
          rows={2}
          autoFocus
          className="field-sizing-content block max-h-48 min-h-16 w-full resize-none bg-transparent px-4 pt-4 pb-2 text-base leading-relaxed outline-none placeholder:text-muted-foreground/70 sm:text-sm"
        />
        <div className="flex min-w-0 flex-nowrap items-center justify-between gap-2 px-3 pb-3 sm:px-4 sm:pb-4">
          <div className="relative -m-1 -ms-3.5 flex min-w-0 flex-1 items-center gap-1 overflow-x-auto p-1 ps-3.5 [scrollbar-width:none]">
            {props.children}
          </div>
          <SendButton disabled={props.busy || !props.value.trim()} />
        </div>
      </div>
    </form>
  );
}
