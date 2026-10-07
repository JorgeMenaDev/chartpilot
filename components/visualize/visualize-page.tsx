"use client";

// Visualize: the user asks in their own words and gets a dashboard built
// from the client company's figures. Follow-up questions edit the current
// dashboard; resize and remove are done by hand, without AI. A saved
// visualization stores only its layout, so opening one later makes no AI
// call and always shows the current numbers.
import { JSONUIProvider, Renderer } from "@json-render/react";
import {
  ArrowUpIcon,
  BookmarkIcon,
  Building2Icon,
  ChevronDownIcon,
  HistoryIcon,
  LayoutDashboardIcon,
  LoaderCircleIcon,
  PlusIcon,
  Trash2Icon,
  Undo2Icon,
  XIcon,
  ZapIcon,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { BuilderEvent } from "@/app/api/visualize/route";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { readModelChoice, VISUALIZATION_MODEL_KEY } from "@/lib/model-choice";
import { cn } from "@/lib/utils";
import {
  buildCandidates,
  companiesIn,
  companyById,
  scopeToCompany,
  type BuilderInput,
  type Company,
} from "@/lib/visualize/candidates";
import type { Drill, Size } from "@/lib/visualize/catalog";
import { hydrate, sizeOverrides, type Layout } from "@/lib/visualize/layout";
import {
  emptyLibrary,
  LIBRARY_KEY,
  MAX_HISTORY,
  MAX_NAME,
  MAX_PROMPTS,
  parseLibrary,
  serializeLibrary,
  type Library,
  type Visualization,
} from "@/lib/visualize/library";
import { DrillContext, registry, WidgetControlsContext, type WidgetControls } from "./registry";

const starters = [
  "Which contractors are at risk this month?",
  "Expirations in the coming weeks",
  "How is Deepline Diving doing?",
  "Which workers aren't cleared to work, and why?",
  "Summary for management",
  "Heatmap of documents by contractor",
];

// What the page is showing: an unsaved draft or a saved visualization.
type Draft = {
  layout: Layout;
  companyId: string | null;
  prompts: string[];
  // As last saved, to tell when the draft has changes.
  saved: ({ id: string; name: string } & Snapshot) | null;
  // This conversation's entry in the history, once recorded.
  historyId: string | null;
};

// What a visualization keeps: its layout, contractor scope and requests.
type Snapshot = Pick<Draft, "layout" | "companyId" | "prompts">;

// Unchanged drafts are not recorded or saved again.
const snapshotOf = ({ layout, companyId, prompts }: Snapshot) => JSON.stringify([layout, companyId, prompts]);

/**
 * Saved visualizations and the history of generations, in localStorage:
 * there is no database. A write that fails (storage full or turned off)
 * leaves the lists as they were and sets `storageFailed`.
 */
function useLibrary() {
  const [library, setLibrary] = useState<Library>(emptyLibrary);
  const [storageFailed, setStorageFailed] = useState(false);
  // The latest lists, so a write never builds on a stale render.
  const latest = useRef(library);
  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(LIBRARY_KEY);
    } catch {}
    latest.current = parseLibrary(stored);
    setLibrary(latest.current);
  }, []);

  // Writes first and shows the lists only once they are stored.
  const commit = (change: (current: Library) => Library) => {
    const next = change(latest.current);
    try {
      localStorage.setItem(LIBRARY_KEY, serializeLibrary(next));
    } catch {
      setStorageFailed(true);
      return false;
    }
    latest.current = next;
    setLibrary(next);
    setStorageFailed(false);
    return true;
  };
  const entry = (id: string, name: string, draft: Draft): Visualization => ({
    id,
    name: name.trim().slice(0, MAX_NAME),
    prompts: draft.prompts.slice(-MAX_PROMPTS),
    companyId: draft.companyId,
    layout: draft.layout,
    updatedAt: Date.now(),
  });
  const upsert = (list: Visualization[], item: Visualization) => [item, ...list.filter((other) => other.id !== item.id)];

  return {
    ...library,
    storageFailed,
    /** Creates a visualization, or overwrites `id`. Returns its id, or null when it couldn't be stored. */
    save(draft: Draft, name: string, id = crypto.randomUUID()) {
      return commit((current) => ({ ...current, saved: upsert(current.saved, entry(id, name, draft)) })) ? id : null;
    },
    /** Records a generation: a new entry per conversation, updated as it is iterated. */
    record(draft: Draft) {
      const id = draft.historyId ?? crypto.randomUUID();
      const item = entry(id, draft.prompts[0] ?? "Visualization", draft);
      return commit((current) => ({ ...current, history: upsert(current.history, item).slice(0, MAX_HISTORY) })) ? id : null;
    },
    remove(id: string) {
      return commit((current) => ({
        saved: current.saved.filter((item) => item.id !== id),
        history: current.history.filter((item) => item.id !== id),
      }));
    },
  };
}

/** Widgets for the current scope, built in the browser from the page's data. */
function useCandidates(input: BuilderInput, companyId: string | null) {
  return useMemo(() => {
    const company = companyId ? companyById(companyId, input.contracts) : null;
    return {
      companies: companiesIn(input),
      candidates: buildCandidates(company ? scopeToCompany(input, company) : input),
      company,
    };
  }, [input, companyId]);
}

const formatPeriodMonth = (periodMonth: string) =>
  new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(Date.parse(`${periodMonth}-01`));

export function VisualizePage({ input }: { input: BuilderInput }) {
  const [prompt, setPrompt] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [history, setHistory] = useState<Draft[]>([]);
  const [composing, setComposing] = useState(false);
  const [lastRun, setLastRun] = useState<{ ms: number; unavailable: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  // The question being composed before any dashboard exists.
  const [pending, setPending] = useState<string | null>(null);
  // The records the user clicked through to, shown in a side panel.
  const [drill, setDrill] = useState<Drill | null>(null);
  // The contractor picked in the composer before the first question.
  const [scopeId, setScopeId] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const companyId = draft ? draft.companyId : scopeId;
  const { candidates, company, companies } = useCandidates(input, companyId);
  const library = useLibrary();
  const recorded = useRef<string | null>(null);

  // Every generation lands in the history on its own, once the composer
  // settles: one entry per conversation, updated as it changes.
  useEffect(() => {
    if (!draft || composing || !draft.prompts.length) return;
    const snapshot = snapshotOf(draft);
    if (snapshot === recorded.current) return;
    recorded.current = snapshot;
    const id = library.record(draft);
    if (id && !draft.historyId) setDraft({ ...draft, historyId: id });
  }, [draft, composing, library]);

  const spec = draft ? hydrate(draft.layout, candidates) : null;
  const dirty = draft ? !draft.saved || snapshotOf(draft) !== snapshotOf(draft.saved) : false;

  // Every change goes through here, so Undo can step back through it.
  function change(next: Draft | null) {
    if (draft) setHistory((current) => [...current.slice(-19), draft]);
    setDraft(next);
  }

  async function compose(text: string) {
    const question = text.trim();
    if (!question || composing) return;
    setComposing(true);
    setPending(question);
    setError(null);
    setPrompt("");
    const before = draft;
    let latest: Draft | null = before;
    try {
      const response = await fetch("/api/visualize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: question,
          layout: before?.layout ?? null,
          companyId: before ? before.companyId : scopeId,
          choice: readModelChoice(VISUALIZATION_MODEL_KEY),
        }),
      });
      if (response.status === 401) return window.location.reload();
      if (!response.ok || !response.body) throw new Error(`Couldn't compose the dashboard (${response.status}). Try again.`);
      const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += value;
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines.filter(Boolean)) {
          const event = JSON.parse(line) as BuilderEvent;
          if (event.type === "error") throw new Error(event.message);
          if (event.type === "complete") setLastRun({ ms: event.ms, unavailable: event.stopReason === "unavailable" });
          if (!event.layout) continue;
          latest = {
            layout: event.layout,
            companyId: event.type === "complete" ? event.companyId : (latest?.companyId ?? (before ? before.companyId : scopeId)),
            prompts: [...(before?.prompts ?? []), question],
            saved: before?.saved ?? null,
            historyId: before?.historyId ?? null,
          };
          setDraft(latest);
        }
      }
      if (before && latest !== before) setHistory((current) => [...current.slice(-19), before]);
    } catch (caught) {
      setDraft(before);
      setError(caught instanceof Error && caught.message ? caught.message : "Couldn't compose the dashboard. Try again.");
    } finally {
      setComposing(false);
      setPending(null);
      inputRef.current?.focus();
    }
  }

  function undo() {
    const previous = history.at(-1);
    if (!previous) return;
    setHistory((current) => current.slice(0, -1));
    setDraft(previous);
  }

  // Opens a saved visualization, or a history entry to keep iterating on.
  // Either way the figures are refilled from the data, with no AI call.
  function open(visualization: Visualization, fromHistory = false) {
    const { id, name, layout, companyId, prompts } = visualization;
    const next: Draft = {
      layout,
      companyId,
      prompts,
      saved: fromHistory ? null : { id, name, layout, companyId, prompts },
      historyId: fromHistory ? id : null,
    };
    recorded.current = snapshotOf(next);
    setHistory([]);
    setLastRun(null);
    setError(null);
    setDraft(next);
  }

  function startOver() {
    recorded.current = null;
    setDraft(null);
    setScopeId(null);
    setHistory([]);
    setLastRun(null);
    setError(null);
    inputRef.current?.focus();
  }

  function save(name: string, asNew = false) {
    if (!draft || !name.trim()) return;
    const id = library.save(draft, name, asNew ? undefined : draft.saved?.id);
    if (!id) return;
    const { layout, companyId, prompts } = draft;
    setDraft({ ...draft, saved: { id, name: name.trim().slice(0, MAX_NAME), layout, companyId, prompts } });
  }

  function remove(visualization: Visualization) {
    if (!library.remove(visualization.id)) return;
    if (draft?.saved?.id === visualization.id) startOver();
    if (draft?.historyId === visualization.id) setDraft({ ...draft, historyId: null });
  }

  // Cmd/Ctrl+Z steps back, unless the user is undoing typing in a field.
  const undoRef = useRef(undo);
  undoRef.current = undo;
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const field = event.target instanceof HTMLElement ? event.target.closest("input, textarea") : null;
      const typing = field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement ? field.value : "";
      if ((event.metaKey || event.ctrlKey) && event.key === "z" && !typing) {
        event.preventDefault();
        undoRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function pickScope(id: string | null) {
    if (draft) change({ ...draft, companyId: id });
    else setScopeId(id);
  }

  const controls: WidgetControls = {
    editable: !composing,
    sizes: sizeOverrides(draft?.layout ?? null),
    resize: (widget: string, size: Size) =>
      draft &&
      change({
        ...draft,
        layout: {
          ...draft.layout,
          elements: draft.layout.elements.map((element) => (element.widget === widget ? { ...element, size } : element)),
        },
      }),
    remove: (widget: string) => {
      if (!draft) return;
      const gone = new Set(draft.layout.elements.filter((element) => element.widget === widget).map((element) => element.id));
      change({
        ...draft,
        layout: {
          ...draft.layout,
          elements: draft.layout.elements
            .filter((element) => !gone.has(element.id))
            .map((element) => ({ ...element, children: element.children.filter((child) => !gone.has(child)) })),
        },
      });
    },
  };

  const storageNotice = library.storageFailed ? (
    <p className="text-sm text-warning">
      Couldn't save to this browser, so Saved and History weren't updated. The dashboard still works.
    </p>
  ) : null;

  const composer = (
    <Composer
      inputRef={inputRef}
      value={prompt}
      onChange={setPrompt}
      onSubmit={() => compose(prompt)}
      composing={composing}
      placeholder={
        draft
          ? "Adjust it: “add the expirations”, “show it as bars”, “remove the table”…"
          : "Ask about your contractors, workers or documents…"
      }
      context={draft || pending ? null : input.title}
      period={formatPeriodMonth(input.periodMonth)}
      lastPrompt={draft?.prompts.at(-1) ?? null}
      companies={companies}
      scope={company}
      onScope={pickScope}
    />
  );

  if (!draft && !composing)
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 pt-[14vh] pb-16">
        <div className="flex flex-col items-center gap-1 text-center">
          <h1 className="text-2xl font-normal tracking-tight sm:text-3xl">What do you want to see about your contractors?</h1>
          <p className="text-sm text-muted-foreground">
            Ask your question and I'll build the visualization from your current data.
          </p>
        </div>
        {composer}
        {error || lastRun?.unavailable ? (
          <p className="text-center text-sm text-muted-foreground">
            {error ?? "I don't have data for that yet. Try one of these questions:"}
          </p>
        ) : null}
        <div className="text-center">{storageNotice}</div>
        <div className="flex flex-wrap justify-center gap-2">
          {starters.map((starter) => (
            <button
              key={starter}
              type="button"
              disabled={composing}
              onClick={() => compose(starter)}
              className="rounded-full border bg-card px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
            >
              {starter}
            </button>
          ))}
        </div>
        <LibraryTabs saved={library.saved} recent={library.history} onOpen={open} onRemove={remove} />
      </div>
    );

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 pt-5 pb-52">
      {draft ? (
        <Toolbar
          draft={draft}
          dirty={dirty}
          canUndo={history.length > 0 && !composing}
          busy={composing}
          lastRun={lastRun}
          onUndo={undo}
          onNew={startOver}
          onSave={save}
          recent={library.history}
          onOpenRecent={(item) => open(item, true)}
        />
      ) : (
        <span className="h-8 animate-pulse text-sm text-muted-foreground">{pending}</span>
      )}
      {composing ? <Progress /> : null}
      {lastRun?.unavailable && !composing ? (
        <p className="text-sm text-muted-foreground">No changes: I don't have data for that yet.</p>
      ) : null}
      {spec ? (
        <WidgetControlsContext.Provider value={controls}>
          <DrillContext.Provider value={setDrill}>
            <JSONUIProvider registry={registry} initialState={{}}>
              <Renderer spec={spec} registry={registry} />
            </JSONUIProvider>
          </DrillContext.Provider>
        </WidgetControlsContext.Provider>
      ) : (
        <SkeletonGrid />
      )}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {storageNotice}
      <DrillPanel drill={drill} onClose={() => setDrill(null)} />
      <div className="fixed inset-x-0 bottom-0 z-20 bg-gradient-to-t from-background via-background/95 to-transparent pt-10 pb-6">
        <div className="mx-auto w-full max-w-3xl px-4">{composer}</div>
      </div>
    </div>
  );
}

// While Copilot picks the widgets: one model turn, usually 8 to 15 seconds.
function Progress() {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const model = readModelChoice(VISUALIZATION_MODEL_KEY).model;
  return (
    <p className="flex items-center gap-2 text-sm text-muted-foreground">
      <LoaderCircleIcon className="size-3.5 animate-spin" />
      <span className="shimmer">Choosing widgets with {model === "auto" ? "Copilot Auto" : model}</span>
      <span className="tabular-nums">{seconds} s</span>
    </p>
  );
}

// The records behind a clicked number or chart point.
function DrillPanel({ drill, onClose }: { drill: Drill | null; onClose: () => void }) {
  return (
    <Sheet open={drill !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full gap-0 sm:max-w-3xl!">
        {drill ? (
          <>
            <SheetHeader className="border-b">
              <SheetTitle>{drill.title}</SheetTitle>
              <SheetDescription>{drill.description}</SheetDescription>
            </SheetHeader>
            <div className="min-h-0 flex-1 overflow-auto px-2">
              {drill.rows.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">No records.</p>
              ) : (
                <Table>
                  <TableHeader className="sticky top-0 bg-popover">
                    <TableRow>
                      {drill.columns.map((column) => (
                        <TableHead key={column.key} className={cn("text-xs", column.align === "right" && "text-right")}>
                          {column.label}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {drill.rows.map((row, index) => (
                      <TableRow key={index}>
                        {drill.columns.map((column, columnIndex) => (
                          <TableCell
                            key={column.key}
                            title={row.cells[column.key]}
                            className={cn(
                              "max-w-64 truncate text-[13px]",
                              column.align === "right" && "text-right whitespace-nowrap tabular-nums",
                              columnIndex === drill.columns.length - 1 && row.tone && drillTone[row.tone],
                            )}
                          >
                            {row.cells[column.key]}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

const drillTone: Record<NonNullable<Drill["rows"][number]["tone"]>, string> = {
  success: "text-success",
  warning: "text-warning",
  danger: "text-destructive",
  info: "text-foreground",
  muted: "text-muted-foreground",
};

function SkeletonGrid() {
  return (
    <div className="grid auto-rows-[4.25rem] grid-cols-1 gap-4 md:grid-cols-3">
      {["row-span-2", "row-span-2", "row-span-2", "md:col-span-2 row-span-4", "row-span-4"].map((className, index) => (
        <div key={index} className={cn("animate-pulse rounded-xl bg-muted/60", className)} />
      ))}
    </div>
  );
}

// The bar above a dashboard: what it is, and what can be done with it.
function Toolbar({
  draft,
  dirty,
  canUndo,
  busy,
  lastRun,
  onUndo,
  onNew,
  onSave,
  recent,
  onOpenRecent,
}: {
  draft: Draft;
  dirty: boolean;
  canUndo: boolean;
  busy: boolean;
  lastRun: { ms: number; unavailable: boolean } | null;
  onUndo: () => void;
  onNew: () => void;
  onSave: (name: string, asNew?: boolean) => void;
  recent: Visualization[];
  onOpenRecent: (item: Visualization) => void;
}) {
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");
  const button =
    "flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-40";

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <LayoutDashboardIcon className="size-4 shrink-0 text-muted-foreground" />
          <span className="truncate text-sm font-medium">{draft.saved?.name ?? "New visualization"}</span>
          {draft.saved && dirty ? <span className="text-xs text-muted-foreground">· unsaved changes</span> : null}
        </div>
        {lastRun && !lastRun.unavailable ? (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <ZapIcon className="size-3" />
            {`Built in ${(lastRun.ms / 1000).toFixed(1)} s`}
          </span>
        ) : null}
        <button type="button" className={button} onClick={onUndo} disabled={!canUndo}>
          <Undo2Icon className="size-3.5" />
          Undo
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger className={button} disabled={busy || !recent.length}>
            <HistoryIcon className="size-3.5" />
            History
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-80">
            <DropdownMenuGroup>
              <DropdownMenuLabel>Recently generated</DropdownMenuLabel>
              {recent.slice(0, 10).map((item) => (
                <DropdownMenuItem key={item.id} onClick={() => onOpenRecent(item)} className="flex flex-col items-start gap-0.5">
                  <span className="flex w-full items-center gap-1.5">
                    <span className="truncate">{item.name}</span>
                    {item.id === draft.historyId ? (
                      <span className="ml-auto shrink-0 text-xs text-muted-foreground">current</span>
                    ) : null}
                  </span>
                  <span className="text-xs text-muted-foreground">{describeEntry(item)}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
        <button type="button" className={button} onClick={onNew} disabled={busy}>
          <PlusIcon className="size-3.5" />
          New
        </button>
        {draft.saved && dirty ? (
          <button type="button" className={button} onClick={() => onSave(draft.saved?.name ?? "", false)}>
            Save changes
          </button>
        ) : null}
        {naming ? (
          <form
            className="flex items-center gap-1"
            onSubmit={(event) => {
              event.preventDefault();
              if (!name.trim()) return;
              onSave(name, Boolean(draft.saved));
              setNaming(false);
            }}
          >
            <input
              autoFocus
              value={name}
              maxLength={MAX_NAME}
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => event.key === "Escape" && setNaming(false)}
              placeholder="Visualization name"
              className="h-8 w-64 rounded-lg border bg-card px-2.5 text-sm outline-none focus:border-ring"
            />
            <button type="submit" className="h-8 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground">
              Save
            </button>
          </form>
        ) : (
          <button
            type="button"
            disabled={busy || (Boolean(draft.saved) && !dirty)}
            onClick={() => {
              setName(draft.saved ? `${draft.saved.name} (copy)` : (draft.prompts[0] ?? "").slice(0, MAX_NAME));
              setNaming(true);
            }}
            className="flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground transition-opacity disabled:opacity-40"
          >
            <BookmarkIcon className="size-3.5" />
            {draft.saved ? "Save as new" : "Save"}
          </button>
        )}
      </div>
      {draft.prompts.length ? (
        <p className="truncate text-xs text-muted-foreground" title={draft.prompts.join("\n")}>
          “{draft.prompts.at(-1)}”
          {draft.prompts.length > 1
            ? ` · ${draft.prompts.length - 1} ${draft.prompts.length === 2 ? "earlier request" : "earlier requests"}`
            : ""}
        </p>
      ) : null}
    </div>
  );
}

const relativeTime = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

// "3 requests · 6 widgets · 5 minutes ago"
function describeEntry(item: Visualization) {
  const minutes = Math.round((item.updatedAt - Date.now()) / 60_000);
  const when =
    minutes === 0
      ? "just now"
      : Math.abs(minutes) < 60
        ? relativeTime.format(minutes, "minute")
        : Math.abs(minutes) < 60 * 24
          ? relativeTime.format(Math.round(minutes / 60), "hour")
          : relativeTime.format(Math.round(minutes / (60 * 24)), "day");
  const asks = item.prompts.length;
  const widgets = item.layout.elements.length - 1;
  return `${asks} ${asks === 1 ? "request" : "requests"} · ${widgets} ${widgets === 1 ? "widget" : "widgets"} · ${when}`;
}

// Below the starters: saved visualizations and recent generations, one
// switch apart.
function LibraryTabs({
  saved,
  recent,
  onOpen,
  onRemove,
}: {
  saved: Visualization[];
  recent: Visualization[];
  onOpen: (item: Visualization, fromHistory?: boolean) => void;
  onRemove: (item: Visualization) => void;
}) {
  const [picked, setPicked] = useState<"saved" | "recent" | null>(null);
  if (!saved.length && !recent.length) return null;
  const tab = picked ?? (saved.length ? "saved" : "recent");
  const items = tab === "saved" ? saved : recent;
  const tabs = [
    { key: "saved", label: "Saved", count: saved.length },
    { key: "recent", label: "History", count: recent.length },
  ] as const;
  return (
    <section className="mt-6 flex flex-col gap-3">
      <div className="flex items-center gap-1 self-start rounded-lg bg-muted/60 p-0.5">
        {tabs.map((entry) => (
          <button
            key={entry.key}
            type="button"
            onClick={() => setPicked(entry.key)}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-3 py-1 text-sm transition-colors",
              tab === entry.key ? "bg-card text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {entry.label}
            <span className="text-xs text-muted-foreground tabular-nums">{entry.count}</span>
          </button>
        ))}
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {tab === "saved"
            ? "No saved visualizations yet. Open one from History and save it."
            : "Every visualization you generate shows up here."}
        </p>
      ) : (
        <div key={tab} className="grid gap-3 animate-in fade-in duration-200 sm:grid-cols-2">
          {items.map((item) => (
            <div key={item.id} className="group relative rounded-xl border bg-card transition-colors hover:border-ring/50">
              <button
                type="button"
                onClick={() => onOpen(item, tab === "recent")}
                className="flex w-full flex-col gap-1 p-4 text-left"
              >
                <span className="flex items-center gap-1.5 truncate pr-8 text-sm font-medium">
                  {tab === "recent" ? <HistoryIcon className="size-3.5 shrink-0 text-muted-foreground" /> : null}
                  <span className="truncate">{item.name}</span>
                </span>
                <span className="text-xs text-muted-foreground">{describeEntry(item)}</span>
              </button>
              {tab === "recent" ? (
                <button
                  type="button"
                  aria-label={`Remove “${item.name}” from history`}
                  onClick={() => onRemove(item)}
                  className="absolute top-3 right-3 rounded-md p-1.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:bg-accent hover:text-foreground focus-visible:opacity-100"
                >
                  <XIcon className="size-3.5" />
                </button>
              ) : (
                <AlertDialog>
                  <AlertDialogTrigger
                    aria-label={`Delete ${item.name}`}
                    className="absolute top-3 right-3 rounded-md p-1.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:bg-accent hover:text-foreground focus-visible:opacity-100"
                  >
                    <Trash2Icon className="size-3.5" />
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete “{item.name}”?</AlertDialogTitle>
                      <AlertDialogDescription>It is removed from this browser. This can't be undone.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={() => onRemove(item)}>Delete</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

// The input box, after T3 Code's composer: a rounded surface with the
// prompt, a footer with a round send button, and a context strip tucked
// underneath.
function Composer({
  inputRef,
  value,
  onChange,
  onSubmit,
  composing,
  placeholder,
  context,
  period,
  lastPrompt,
  companies,
  scope,
  onScope,
}: {
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  composing: boolean;
  placeholder: string;
  // Shown under the box on the empty page; a dashboard has its own title.
  context: string | null;
  period: string;
  lastPrompt: string | null;
  companies: Company[];
  scope: Company | null;
  onScope: (id: string | null) => void;
}) {
  return (
    <div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
        className={cn(
          "relative z-10 rounded-3xl border bg-card shadow-lg shadow-black/5 transition-[border-color,box-shadow] duration-300 focus-within:border-ring/60",
          composing && "border-primary/60 shadow-primary/15",
        )}
      >
        <textarea
          ref={inputRef}
          autoFocus
          rows={2}
          value={value}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              onSubmit();
            } else if (event.key === "Escape") onChange("");
            else if (event.key === "ArrowUp" && !value && lastPrompt) {
              event.preventDefault();
              onChange(lastPrompt);
            }
          }}
          className="field-sizing-content max-h-48 min-h-16 w-full resize-none bg-transparent px-5 pt-4 text-base outline-none placeholder:text-muted-foreground"
        />
        <div className="flex items-center justify-between gap-2 px-3 pb-3">
          <DropdownMenu>
            <DropdownMenuTrigger className="flex max-w-72 items-center gap-1.5 rounded-full px-2.5 py-1 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
              <Building2Icon className="size-4 shrink-0" />
              <span className="truncate">{scope?.name ?? "All contractors"}</span>
              <ChevronDownIcon className="size-3.5 shrink-0" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-auto">
              <DropdownMenuGroup>
                <DropdownMenuLabel>Data from</DropdownMenuLabel>
                <DropdownMenuRadioGroup value={scope?.id ?? ""} onValueChange={(id: string) => onScope(id || null)}>
                  <DropdownMenuRadioItem value="">All contractors</DropdownMenuRadioItem>
                  {companies.map((company) => (
                    <DropdownMenuRadioItem key={company.id} value={company.id}>
                      {company.name}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
          <button
            type="submit"
            aria-label="Build visualization"
            disabled={composing || !value.trim()}
            className="flex size-9 items-center justify-center rounded-full bg-message-action text-message-action-foreground shadow-xs transition-all duration-150 enabled:hover:scale-105 enabled:hover:bg-message-action-hover enabled:active:scale-95 disabled:opacity-40"
          >
            {composing ? <LoaderCircleIcon className="size-4 animate-spin" /> : <ArrowUpIcon className="size-4" />}
          </button>
        </div>
      </form>
      {context ? (
        <div className="mx-5 flex items-center justify-between gap-2 rounded-b-2xl border border-t-0 bg-muted/50 px-4 py-1.5 text-xs text-muted-foreground">
          <span className="truncate">Data from {context}</span>
          <span className="shrink-0">{period}</span>
        </div>
      ) : null}
    </div>
  );
}
