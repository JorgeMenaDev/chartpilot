import { describe, expect, test } from "bun:test";
import type { Layout } from "./layout";
import { MAX_BODY_BYTES, parseComposeRequest, readBody } from "./request";

const layout: Layout = {
  root: "node_0",
  elements: [
    { id: "node_0", widget: "page", children: ["node_1"] },
    { id: "node_1", widget: "kpis_summary", children: [], size: "strip" },
  ],
};
const valid = { prompt: "Add the expirations", layout, companyId: null, choice: { model: "auto", effort: null } };
const parse = (body: unknown) => parseComposeRequest(JSON.stringify(body));

describe("parseComposeRequest", () => {
  test("accepts a follow-up with its current layout", () => {
    expect(parse(valid)?.layout).toEqual(layout);
    expect(parse({ ...valid, layout: null })?.prompt).toBe("Add the expirations");
  });

  test("rejects malformed JSON and missing fields", () => {
    expect(parseComposeRequest("{")).toBeNull();
    expect(parse({ prompt: "Hi" })).toBeNull();
  });

  test("bounds the layout so it can't inflate the model prompt", () => {
    const element = (index: number) => ({ id: `node_${index}`, widget: `widget_${index}`, children: [] });
    const many = { root: "node_0", elements: Array.from({ length: 13 }, (_, index) => element(index)) };
    expect(parse({ ...valid, layout: many })).toBeNull();
    const repeated = { ...layout, elements: [...layout.elements, { id: "node_2", widget: "kpis_summary", children: [] }] };
    expect(parse({ ...valid, layout: repeated })).toBeNull();
    const sameId = { ...layout, elements: [...layout.elements, { id: "node_1", widget: "gauge_coverage", children: [] }] };
    expect(parse({ ...valid, layout: sameId })).toBeNull();
    expect(parse({ ...valid, layout: { ...layout, root: "node_9" } })).toBeNull();
    const dangling = { ...layout, elements: [{ id: "node_0", widget: "page", children: ["node_7"] }] };
    expect(parse({ ...valid, layout: dangling })).toBeNull();
  });

  test("bounds the prompt, scope and model id", () => {
    expect(parse({ ...valid, prompt: "x".repeat(501) })).toBeNull();
    expect(parse({ ...valid, companyId: "c".repeat(65) })).toBeNull();
    expect(parse({ ...valid, choice: { model: "m".repeat(101), effort: null } })).toBeNull();
  });
});

describe("readBody", () => {
  const post = (body: string) => new Request("http://localhost/api/visualize", { method: "POST", body });

  test("returns a body within the limit", async () => {
    expect(await readBody(post(JSON.stringify(valid)))).toBe(JSON.stringify(valid));
  });

  test("stops at the limit", async () => {
    expect(await readBody(post("x".repeat(MAX_BODY_BYTES + 1)))).toBeNull();
  });
});
