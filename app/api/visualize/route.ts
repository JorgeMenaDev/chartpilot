// Visualize: composes a dashboard for a question about the contractors.
// Offers the database's figures to the layout model as prepared widgets and
// streams each composed layout back as NDJSON lines. A follow-up sends the
// current layout; the model sees its widgets and returns the edited set.
import { experimental_composeSpec } from "@json-render/core";
import { z } from "zod";
import { getSession } from "@/lib/session";
import { dashboardCatalog, sizes } from "@/lib/visualize/catalog";
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

const layout = z.object({
  root: z.string(),
  elements: z.array(
    z.object({ id: z.string(), widget: z.string(), children: z.array(z.string()), size: z.enum(sizes).optional() }),
  ),
});

const body = z.object({
  prompt: z.string().trim().min(1).max(500),
  // The current dashboard and its contractor scope, when the question edits it.
  layout: layout.nullable(),
  companyId: z.string().nullable(),
  // The Visualization model from settings.
  choice: z.object({
    model: z.string().min(1),
    effort: z.enum(["low", "medium", "high", "xhigh", "max"]).nullable(),
  }),
});

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return new Response("Not signed in", { status: 401 });
  const parsed = body.safeParse(await request.json());
  if (!parsed.success) return new Response("Bad request", { status: 400 });
  const { prompt, choice } = parsed.data;
  const previous = parsed.data.layout;

  const input = builderInput();
  // A named contractor wins; otherwise a follow-up keeps the current scope.
  const company =
    companyNamedIn(prompt, input.contracts) ??
    (parsed.data.companyId ? companyById(parsed.data.companyId, input.contracts) : null);
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
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: BuilderEvent) => controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
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
          signal: AbortSignal.any([request.signal, AbortSignal.timeout(80_000)]),
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
        const reason = error instanceof Error ? error.message : String(error);
        console.error("[visualize] compose failed:", reason);
        send({ type: "error", message: `Couldn't compose the dashboard: ${reason}` });
      } finally {
        await close();
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" },
  });
}
