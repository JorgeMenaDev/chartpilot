import { describe, expect, test } from "bun:test";
import type { CoverageSnapshot, DocumentStatus } from "@/lib/db";
import { buildCandidates, companyNamedIn, scopeToCompany, type BuilderInput } from "./candidates";
import type { Drill } from "./catalog";
import { hydrate, toLayout, type Layout } from "./layout";

const names = { deepline: "Deepline Diving Services", coastal: "Coastal Freight Logistics" } as const;
type Id = keyof typeof names;

const contract = (id: Id, covered: number, workersCleared: number, workersTotal: number) => ({
  contractId: `contract-${id}`,
  label: `${names[id]} · Fjord Point Farm`,
  contractorId: id,
  contractorName: names[id],
  siteName: "Fjord Point Farm",
  requiredDocuments: 10,
  coveredDocuments: covered,
  workersCleared,
  workersTotal,
});

const document = (id: Id, status: DocumentStatus["status"], workerName: string | null = null): DocumentStatus => ({
  id: `${id}-${status}`,
  contractorId: id,
  contractorName: names[id],
  contractId: `contract-${id}`,
  siteName: "Fjord Point Farm",
  requirementTitle: "Employment contract",
  scope: workerName ? "worker" : "company",
  workerId: workerName,
  workerName,
  status,
  expiresAt: status === "expired" ? Date.UTC(2026, 8, 1) : null,
  priorityTier: 2,
  updatedAt: 0,
});

const snapshot = (id: Id, periodMonth: string, covered: number): CoverageSnapshot => ({
  contractorId: id,
  contractorName: names[id],
  periodMonth,
  requiredDocuments: 10,
  coveredDocuments: covered,
  expiredDocuments: 0,
  workersCleared: 0,
  workersTotal: 5,
});

const input: BuilderInput = {
  title: "Southern Fjord Salmon Co.",
  now: Date.UTC(2026, 9, 7),
  periodMonth: "2026-10",
  contracts: [contract("deepline", 9, 5, 6), contract("coastal", 5, 1, 5)],
  documents: [document("deepline", "approved"), document("coastal", "missing", "Matías Cárcamo"), document("coastal", "expired")],
  workers: [
    {
      workerId: "Matías Cárcamo",
      fullName: "Matías Cárcamo",
      role: "Driver",
      contractorId: "coastal",
      contractorName: names.coastal,
      contractId: "contract-coastal",
      clearance: "pending",
    },
    {
      workerId: "Ana Soto",
      fullName: "Ana Soto",
      role: "Diver",
      contractorId: "deepline",
      contractorName: names.deepline,
      contractId: "contract-deepline",
      clearance: "cleared",
    },
  ],
  history: [
    snapshot("coastal", "2026-09", 5),
    snapshot("deepline", "2026-09", 8),
    snapshot("coastal", "2026-10", 7),
    snapshot("deepline", "2026-10", 6),
  ],
  obligations: [],
};

const props = (input: BuilderInput, id: string) => buildCandidates(input).find((candidate) => candidate.id === id)?.element.props;

describe("companyNamedIn", () => {
  test("finds a contractor by a distinctive word, ignoring accents and case", () => {
    expect(companyNamedIn("How is DEEPLINE doing?", input.contracts)?.id).toBe("deepline");
  });

  test("ignores words every contractor shares, widget words and questions naming none", () => {
    expect(companyNamedIn("services with expired documents", input.contracts)).toBeNull();
    expect(companyNamedIn("Summary for management", input.contracts)).toBeNull();
    const withTable = [
      ...input.contracts,
      { ...contract("coastal", 5, 1, 5), contractorId: "table", contractorName: "Harbour Table Catering" },
    ];
    expect(companyNamedIn("remove the table", withTable)).toBeNull();
  });
});

// The value of one headline number in a strip.
const kpi = (input: BuilderInput, strip: string, label: string) =>
  (props(input, strip)?.items as { label: string; value: string }[] | undefined)?.find((item) => item.label === label)?.value;

describe("scopeToCompany", () => {
  test("every figure describes only the named contractor", () => {
    const scoped = scopeToCompany(input, { id: "coastal", name: names.coastal });
    expect(props(scoped, "page")?.title).toBe(names.coastal);
    expect(kpi(scoped, "kpis_summary", "Document coverage")).toBe("50%");
    expect(kpi(scoped, "kpis_summary", "Workers cleared")).toBe("1 of 5");
    expect(kpi(scoped, "kpis_summary", "Expired")).toBe("1");
    expect(kpi(input, "kpis_summary", "Workers cleared")).toBe("6 of 11");
  });
});

describe("12-month trend", () => {
  test("draws all contractors with the biggest riser and faller", () => {
    const trend = props(input, "chart_trend_line") as {
      series: { key: string; label: string }[];
      data: { label: string; values: Record<string, number> }[];
    };
    expect(trend.series.map((entry) => entry.label)).toEqual(["All contractors", "Coastal Freight Logist…", "Deepline Diving"]);
    expect(trend.data.at(-1)).toEqual({ label: "Oct", values: { overall: 65, improved: 70, declined: 60 } });
  });

  test("one contractor draws only its own line", () => {
    const scoped = scopeToCompany(input, { id: "coastal", name: names.coastal });
    expect((props(scoped, "chart_trend_line")?.series as unknown[]).length).toBe(1);
    expect(props(scoped, "chart_trend_change")).toBeUndefined();
  });
});

describe("hydrate", () => {
  const layout: Layout = {
    root: "node_1",
    elements: [
      { id: "node_1", widget: "page", children: ["node_2", "node_3"] },
      { id: "node_2", widget: "kpis_summary", children: [], size: "strip" },
      { id: "node_3", widget: "card_gone", children: [] },
    ],
  };

  test("refills a saved layout with today's figures and drops widgets that no longer exist", () => {
    const spec = hydrate(layout, buildCandidates(input));
    expect(spec?.elements.node_1?.children).toEqual(["node_2"]);
    expect(spec?.elements.node_3).toBeUndefined();
    const items = spec?.elements.node_2?.props.items as { value: string }[];
    expect(items[0]?.value).toBe("70%");
  });

  test("a composed spec turns back into the same layout", () => {
    const spec = hydrate(layout, buildCandidates(input));
    expect(spec && toLayout(spec, layout).elements).toEqual([
      { id: "node_1", widget: "page", children: ["node_2"] },
      { id: "node_2", widget: "kpis_summary", children: [], size: "strip" },
    ]);
  });
});

describe("drill-downs", () => {
  type Item = { label: string; value: string; drill: Drill | null };
  const items = (strip: string) => props(input, strip)?.items as Item[];

  test("each headline number opens exactly the records it counts", () => {
    for (const item of [...items("kpis_summary"), ...items("kpis_documents")])
      if (/^\d+$/.test(item.value)) expect([item.label, item.drill?.rows.length]).toEqual([item.label, Number(item.value)]);
  });

  test("a chart point opens the records of that point only", () => {
    const drills = props(input, "chart_coverage_bars")?.drills as Record<string, Drill>;
    expect(drills["Coastal Freight Logist…"]?.rows.map((row) => row.cells.state)).toEqual(["Expired", "Requested"]);
  });

  test("the workers list uses each worker's clearance and names the missing documents", () => {
    const drill = items("kpis_summary").find((item) => item.label === "Workers cleared")?.drill;
    expect(drill?.description).toBe("1 of 2 cleared");
    expect(drill?.rows.map((row) => row.cells)).toEqual([
      { worker: "Matías Cárcamo", company: names.coastal, missing: "Employment contract", state: "Pending" },
      { worker: "Ana Soto", company: names.deepline, missing: "—", state: "Cleared" },
    ]);
  });
});
