import { describe, expect, test } from "bun:test";
import { emptyLibrary, MAX_HISTORY, parseLibrary, serializeLibrary, type Visualization } from "./library";

const entry = (id: string): Visualization => ({
  id,
  name: "Summary for management",
  prompts: ["Summary for management"],
  companyId: null,
  layout: {
    root: "node_0",
    elements: [
      { id: "node_0", widget: "page", children: ["node_1"] },
      { id: "node_1", widget: "kpis_summary", children: [] },
    ],
  },
  updatedAt: 1,
});

describe("parseLibrary", () => {
  test("reads back what it stored", () => {
    const library = { saved: [entry("a")], history: [entry("b")] };
    expect(parseLibrary(serializeLibrary(library))).toEqual(library);
  });

  test("recovers from nothing, broken JSON, partial and older formats", () => {
    expect(parseLibrary(null)).toEqual(emptyLibrary);
    expect(parseLibrary("{")).toEqual(emptyLibrary);
    expect(parseLibrary('{"saved":[]}')).toEqual(emptyLibrary);
    // The unversioned shape this tab first shipped with.
    expect(parseLibrary(JSON.stringify({ saved: [{ ...entry("a").layout, id: "a" }], history: [] }))).toEqual(emptyLibrary);
  });

  test("drops invalid entries and keeps the rest", () => {
    const broken = { ...entry("bad"), layout: { root: "node_9", elements: entry("bad").layout.elements } };
    const raw = JSON.stringify({ version: 1, saved: [broken, entry("good"), "junk"], history: [{ id: "x" }] });
    expect(parseLibrary(raw)).toEqual({ saved: [entry("good")], history: [] });
  });

  test("keeps at most the newest history entries", () => {
    const history = Array.from({ length: MAX_HISTORY + 5 }, (_, index) => entry(`h${index}`));
    const parsed = parseLibrary(JSON.stringify({ version: 1, saved: [], history }));
    expect(parsed.history.map((item) => item.id)).toEqual(history.slice(0, MAX_HISTORY).map((item) => item.id));
  });
});
