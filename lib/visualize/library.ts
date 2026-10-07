// Saved visualizations and the history of generations, as kept in
// localStorage. Storage is outside our control (older formats, other tabs,
// hand edits), so reading validates every entry and drops what doesn't fit.
import { z } from "zod";
import { layoutSchema } from "./layout";

export const LIBRARY_KEY = "chartpilot:visualizations";
export const MAX_NAME = 80;
/** History entries kept; older ones are dropped. */
export const MAX_HISTORY = 30;
const MAX_SAVED = 100;
export const MAX_PROMPTS = 20;
// Bump when the stored shape changes; older libraries are then dropped.
const VERSION = 1;

const visualizationSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().trim().min(1).max(MAX_NAME),
  prompts: z.array(z.string().max(500)).max(MAX_PROMPTS),
  companyId: z.string().min(1).max(64).nullable(),
  layout: layoutSchema,
  updatedAt: z.number().finite(),
});

/** A saved visualization or a history entry: its layout and how it was asked for, never its figures. */
export type Visualization = z.infer<typeof visualizationSchema>;

/** Both lists newest first. */
export type Library = { saved: Visualization[]; history: Visualization[] };

export const emptyLibrary: Library = { saved: [], history: [] };

const storedSchema = z.object({ version: z.literal(VERSION), saved: z.array(z.unknown()), history: z.array(z.unknown()) });

const validEntries = (items: unknown[], max: number) =>
  items.slice(0, max).flatMap((item) => {
    const parsed = visualizationSchema.safeParse(item);
    return parsed.success ? [parsed.data] : [];
  });

/** The library stored as `raw`; unreadable, invalid or older-format records are dropped. */
export function parseLibrary(raw: string | null): Library {
  if (!raw) return emptyLibrary;
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return emptyLibrary;
  }
  const stored = storedSchema.safeParse(json);
  if (!stored.success) return emptyLibrary;
  return { saved: validEntries(stored.data.saved, MAX_SAVED), history: validEntries(stored.data.history, MAX_HISTORY) };
}

export const serializeLibrary = (library: Library) =>
  JSON.stringify({ version: VERSION, saved: library.saved.slice(0, MAX_SAVED), history: library.history.slice(0, MAX_HISTORY) });
