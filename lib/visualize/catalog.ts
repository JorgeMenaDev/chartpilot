// The components a Visualize dashboard may be composed of. The server offers
// the layout model prepared instances of these (./candidates); the client
// renders them with the registry in components/visualize/registry.tsx.
//
// Every widget carries `widget` (its candidate id, stable across data
// changes) and `size`, its cell footprint on the three-column grid:
// columns × rows, where a row is one chart tall; `strip` is a full-width
// half row of headline numbers.
import { defineCatalog } from "@json-render/core";
import { schema } from "@json-render/react/schema";
import { z } from "zod";

export const tones = ["success", "warning", "danger", "info", "muted"] as const;
const tone = z.enum(tones);
export type Tone = z.infer<typeof tone>;

export const sizes = ["strip", "1x1", "2x1", "3x1", "1x2", "2x2", "3x2"] as const;
const size = z.enum(sizes);
export type Size = z.infer<typeof size>;

const datum = z.object({ label: z.string(), value: z.number(), tone });
export type Datum = z.infer<typeof datum>;

export const chartKinds = [
  "bar",
  "bar-horizontal",
  "bar-stacked",
  "bar-grouped",
  "bar-negative",
  "area",
  "line",
  "radar",
] as const;
export type ChartKind = (typeof chartKinds)[number];

const text = z.string();
const widget = { widget: text, size };

const columns = z.array(z.object({ key: text, label: text, align: z.enum(["left", "right"]) }));
const tableRows = z.array(z.object({ cells: z.record(z.string(), z.string()), tone: tone.nullable() }));

// The records behind a number or a chart point, shown when the user clicks
// it (drill-down, as in Looker).
const drill = z.object({
  title: text,
  description: text,
  columns,
  rows: tableRows,
});
export type Drill = z.infer<typeof drill>;
// Drill-downs of a chart, keyed by the data label the user clicks.
const drills = z.record(z.string(), drill);

export const dashboardCatalog = defineCatalog(schema, {
  components: {
    Page: {
      props: z.object({ title: text, subtitle: text }),
      slots: ["default"],
      description: "Dashboard page with a heading; lays its widgets out in a grid.",
    },
    KpiStrip: {
      props: z.object({
        ...widget,
        items: z.array(
          z.object({
            label: text,
            value: text,
            detail: text,
            tone,
            drill: drill.nullable(),
          }),
        ),
      }),
      description: "Full-width row of headline numbers.",
    },
    Gauge: {
      props: z.object({
        ...widget,
        title: text,
        description: text,
        value: z.number().nullable(),
        label: text,
        tone,
        drill: drill.nullable(),
      }),
      description: "Radial gauge for one percentage.",
    },
    Chart: {
      props: z.object({
        ...widget,
        title: text,
        description: text,
        kind: z.enum(chartKinds),
        unit: z.enum(["percent", "count"]),
        goal: z.number().nullable(),
        series: z.array(z.object({ key: text, label: text, tone })),
        data: z.array(z.object({ label: text, values: z.record(z.string(), z.number()) })),
        drills,
        // All the records of the widget, opened from its title icon.
        drill: drill.nullable(),
      }),
      description: "Bar, area, line or radar chart over labelled points.",
    },
    Donut: {
      props: z.object({
        ...widget,
        title: text,
        description: text,
        centerValue: text,
        centerLabel: text,
        data: z.array(datum),
        drills,
        // All the records of the widget, opened from its title icon.
        drill: drill.nullable(),
      }),
      description: "Share of a whole.",
    },
    BarList: {
      props: z.object({
        ...widget,
        title: text,
        description: text,
        unit: z.enum(["percent", "count"]),
        data: z.array(datum),
        drills,
        // All the records of the widget, opened from its title icon.
        drill: drill.nullable(),
      }),
      description: "Ranked list with inline bars.",
    },
    Heatmap: {
      props: z.object({
        ...widget,
        title: text,
        description: text,
        columns: z.array(text),
        rows: z.array(z.object({ label: text, cells: z.array(z.number().nullable()) })),
        // Keyed `${row label}::${column}`.
        drills,
        // All the records of the widget, opened from its title icon.
        drill: drill.nullable(),
      }),
      description: "Matrix of percentages, coloured by the traffic-light bands.",
    },
    DataTable: {
      props: z.object({
        ...widget,
        title: text,
        description: text,
        columns,
        rows: tableRows,
        emptyText: text,
      }),
      description: "List of records.",
    },
    Callout: {
      props: z.object({ ...widget, title: text, items: z.array(text), tone }),
      description: "Short warning or recommendation list.",
    },
    ContractorCard: {
      props: z.object({
        ...widget,
        name: text,
        coverage: z.number().nullable(),
        contracts: z.number(),
        workersCleared: z.number(),
        workersTotal: z.number(),
        states: z.array(datum),
        drill: drill.nullable(),
      }),
      description: "Summary of one contractor company.",
    },
  },
  actions: {},
});
