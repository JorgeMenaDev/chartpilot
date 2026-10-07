// Visualize: composes a dashboard for a question about the contractors.
// Offers the database's figures to the layout model as prepared widgets and
// streams each composed layout back as NDJSON lines. A follow-up sends the
// current layout; the model sees its widgets and returns the edited set.
import { experimental_composeSpec } from "@json-render/core";
import { getSession } from "@/lib/session";
import { dashboardCatalog } from "@/lib/visualize/catalog";
import {
  buildCandidates,
  companyById,
  companyNamedIn,
  composerGuidance,
  MAX_ELEMENTS,
  scopeToCompany,
} from "@/lib/visualize/candidates";
import { builderInput } from "@/lib/visualize/data";
import { copilotEvaluator } from "@/lib/visualize/evaluator";
import { hydrate, toLayout, type Layout } from "@/lib/visualize/layout";
import { parseComposeRequest, readBody } from "@/lib/visualize/request";

export const maxDuration = 90;

// Only layouts travel back: the browser refills the figures from its own
// copy of the data, so drill-down records never cross the wire twice.
export type BuilderEvent =
  | { type: "step"; layout: Layout }
  | {
      type: "complete";
      layout: Layout | null;
      stopReason: "finish" | "unavailable" | "limit";
      // The contractor every widget was scoped to, if any.
      companyId: string | null;
      ms: number;
    }
  | { type: "error"; message: string };

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return new Response("Not signed in", { status: 401 });
  const text = await readBody(request);
  if (text === null) return new Response("Request too large", { status: 413 });
  const parsed = parseComposeRequest(text);
  if (!parsed) return new Response("Bad request", { status: 400 });
  const { prompt, choice, layout: previous } = parsed;

  const input = builderInput();
  // A named contractor wins; otherwise a follow-up keeps the current scope.
  const company =
    companyNamedIn(prompt, input.contracts) ?? (parsed.companyId ? companyById(parsed.companyId, input.contracts) : null);
  const candidates = buildCandidates(company ? scopeToCompany(input, company) : input);
  // A follow-up shows the model the widgets on screen; json-render's own
  // edit loop would spend one model turn per change.
  const current = previous && hydrate(previous, candidates);
  const descriptions = new Map(candidates.map((candidate) => [candidate.id, candidate.description]));
  const currentDashboard = current
    ? Object.values(current.elements).flatMap((element) => {
        const widget = element.props.widget;
        return typeof widget === "string" ? [{ widget, description: descriptions.get(widget) }] : [];
      })
    : null;

  const started = Date.now();
  const encoder = new TextEncoder();
  // When the reader goes away, stop the Copilot turn and stop writing.
  const cancel = new AbortController();
  const signal = AbortSignal.any([request.signal, cancel.signal, AbortSignal.timeout(80_000)]);
  // A timeout still reports its error; a reader that left gets nothing more.
  const gone = () => cancel.signal.aborted || request.signal.aborted;
  const stream = new ReadableStream<Uint8Array>({
    cancel: () => cancel.abort(),
    async start(controller) {
      const send = (event: BuilderEvent) => {
        if (!gone()) controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };
      let close = async () => {};
      try {
        const evaluator = await copilotEvaluator(session.login, session.token, choice);
        close = evaluator.close;
        for await (const event of experimental_composeSpec({
          catalog: dashboardCatalog,
          candidates,
          prompt,
          evaluate: evaluator.evaluate,
          strategy: "batch",
          maxSteps: MAX_ELEMENTS,
          maxElements: MAX_ELEMENTS,
          maxDepth: 4,
          signal,
          context: { ...composerGuidance.context, ...(currentDashboard ? { current_dashboard: currentDashboard } : {}) },
          instructions: composerGuidance.instructions,
        })) {
          if (event.type === "step") send({ type: "step", layout: toLayout(event.spec, previous) });
          else
            send({
              type: "complete",
              layout: event.spec && toLayout(event.spec, previous),
              stopReason: event.stopReason,
              companyId: company?.id ?? null,
              ms: Date.now() - started,
            });
        }
      } catch (error) {
        if (gone()) return;
        const reason = error instanceof Error ? error.message : String(error);
        console.error("[visualize] compose failed:", reason);
        send({ type: "error", message: `Couldn't compose the dashboard: ${reason}` });
      } finally {
        await close();
        if (!gone()) controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" },
  });
}
