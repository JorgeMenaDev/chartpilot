"use client";

// How each Visualize widget looks. The layout model picks prepared widgets
// (lib/visualize/candidates.ts); this only paints them.
//
// The page is a three-column grid. A row is one chart tall and is built
// from four small grid rows, so a headline strip can take half a row. Each
// widget sits in a Cell that sizes it and, while the user edits, offers
// resize and remove controls that need no AI.
import { createContext, useContext, useState } from "react";
import { defineRegistry } from "@json-render/react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell as ChartCell,
  LabelList,
  Line,
  LineChart,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Pie,
  PieChart,
  Radar,
  RadarChart,
  RadialBar,
  RadialBarChart,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts";
import { MaximizeIcon, TableIcon, XIcon } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { dashboardCatalog, type ChartKind, type Drill, type Size, type Tone } from "@/lib/visualize/catalog";

const toneFill: Record<Tone, string> = {
  success: "var(--success)",
  warning: "var(--warning)",
  danger: "var(--destructive)",
  info: "var(--message-action)",
  muted: "color-mix(in oklab, var(--muted-foreground) 60%, transparent)",
};

const toneText: Record<Tone, string> = {
  success: "text-success",
  warning: "text-warning",
  danger: "text-destructive",
  info: "text-foreground",
  muted: "text-muted-foreground",
};

// Traffic-light bands: red below 75, amber through 90, green above.
const band = (percent: number | null): Tone =>
  percent === null ? "muted" : percent < 75 ? "danger" : percent <= 90 ? "warning" : "success";

const sizeClass: Record<Size, string> = {
  strip: "md:col-span-3 row-span-2",
  "1x1": "md:col-span-1 row-span-4",
  "2x1": "md:col-span-2 row-span-4",
  "3x1": "md:col-span-3 row-span-4",
  "1x2": "md:col-span-1 row-span-8",
  "2x2": "md:col-span-2 row-span-8",
  "3x2": "md:col-span-3 row-span-8",
};

const enter = "animate-in fade-in slide-in-from-bottom-2 duration-500 ease-out fill-mode-both";

/** Hand-made edits the page applies to its layout, with no AI involved. */
export type WidgetControls = {
  editable: boolean;
  sizes: ReadonlyMap<string, Size>;
  resize: (widget: string, size: Size) => void;
  remove: (widget: string) => void;
};

export const WidgetControlsContext = createContext<WidgetControls>({
  editable: false,
  sizes: new Map(),
  resize: () => {},
  remove: () => {},
});

// Opens the records behind a number or chart point (drill-down). The page
// provides the panel that shows them.
export const DrillContext = createContext<(drill: Drill) => void>(() => {});

// The sign that a widget answers clicks with its records.
function DrillMark({ className }: { className?: string }) {
  return <TableIcon aria-hidden className={cn("size-3.5 shrink-0 text-muted-foreground", className)} />;
}

/** Opens `drills[label]`, when that label has records. */
function useDrillByLabel(drills: Record<string, Drill>) {
  const open = useContext(DrillContext);
  return (label: unknown) => {
    const drill = drills[String(label)];
    if (drill) open(drill);
  };
}

type CellSize = Exclude<Size, "strip">;

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

// A 3 × 2 grid of the page's cells: hover previews a footprint, click
// applies it. Every size fits in one compact square, no list to scroll.
function SizePicker({ current, onPick }: { current: CellSize; onPick: (size: CellSize) => void }) {
  const [preview, setPreview] = useState<CellSize | null>(null);
  const [columns = 1, rows = 1] = (preview ?? current).split("x").map(Number);
  return (
    <DropdownMenu onOpenChange={() => setPreview(null)}>
      <DropdownMenuTrigger
        aria-label="Resize"
        className="flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
      >
        <MaximizeIcon className="size-3.5" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-auto p-2.5">
        <p className="pb-2 text-xs font-medium text-muted-foreground">Size</p>
        <div className="grid grid-cols-3 gap-1" onMouseLeave={() => setPreview(null)}>
          {([1, 2] as const).flatMap((row) =>
            ([1, 2, 3] as const).map((column) => {
              const size = `${column}x${row}` as CellSize;
              return (
                <DropdownMenuItem
                  key={size}
                  aria-label={`${plural(column, "column", "columns")} × ${plural(row, "row", "rows")}`}
                  onClick={() => onPick(size)}
                  onMouseEnter={() => setPreview(size)}
                  onFocus={() => setPreview(size)}
                  className={cn(
                    "h-9 w-11 cursor-pointer rounded-md border p-0 transition-colors focus:bg-transparent",
                    column <= columns && row <= rows
                      ? "border-primary/60 bg-primary/25 focus:bg-primary/25"
                      : "border-border bg-muted/40",
                  )}
                />
              );
            }),
          )}
        </div>
        <p className="pt-2 text-center text-xs tabular-nums">
          {plural(columns, "column", "columns")} × {plural(rows, "row", "rows")}
          {preview === null || preview === current ? <span className="text-muted-foreground"> · current</span> : null}
        </p>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Cell({ widget, size, children }: { widget: string; size: Size; children: React.ReactNode }) {
  const controls = useContext(WidgetControlsContext);
  const current = controls.sizes.get(widget) ?? size;
  return (
    <div className={cn("group/cell relative min-w-0", sizeClass[current], enter)}>
      {children}
      {controls.editable ? (
        <div className="absolute top-2.5 right-2.5 flex gap-0.5 rounded-lg border bg-popover/95 p-0.5 opacity-0 shadow-sm backdrop-blur transition-opacity group-hover/cell:opacity-100 focus-within:opacity-100 has-data-popup-open:opacity-100">
          {current !== "strip" ? <SizePicker current={current} onPick={(next) => controls.resize(widget, next)} /> : null}
          <button
            type="button"
            aria-label="Remove"
            onClick={() => controls.remove(widget)}
            className="flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <XIcon className="size-3.5" />
          </button>
        </div>
      ) : null}
    </div>
  );
}

function Swatch({ tone }: { tone: Tone }) {
  return <span className="inline-block size-2 shrink-0 rounded-full" style={{ background: toneFill[tone] }} />;
}

function Widget({
  title,
  description,
  children,
  className,
  drillable = false,
  drill = null,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
  className?: string;
  // Points inside the widget open their own records.
  drillable?: boolean;
  // All the widget's records, opened from the title icon.
  drill?: Drill | null;
}) {
  const open = useContext(DrillContext);
  return (
    <Card className="h-full min-w-0 gap-3 overflow-hidden py-4">
      <CardHeader className="px-4">
        <CardTitle className="flex items-center gap-1.5 text-sm font-medium">
          {title}
          {drill ? (
            <button
              type="button"
              aria-label={`Show the records behind “${title}”`}
              title={drillable ? "Show all records (or click a point)" : "Show the records"}
              onClick={() => open(drill)}
              className="flex size-6 cursor-pointer items-center justify-center rounded-md hover:bg-accent [&_svg]:hover:text-foreground"
            >
              <DrillMark />
            </button>
          ) : drillable ? (
            <span title="Click a point to see its records">
              <DrillMark />
            </span>
          ) : null}
        </CardTitle>
        {description ? <CardDescription className="text-xs">{description}</CardDescription> : null}
      </CardHeader>
      <CardContent className={cn("min-h-0 flex-1 px-4", className)}>{children}</CardContent>
    </Card>
  );
}

function Legend({ series }: { series: { key: string; label: string; tone: Tone }[] }) {
  return series.length > 1 ? (
    <div className="flex flex-wrap gap-x-3 gap-y-1 pt-2 text-xs text-muted-foreground">
      {series.map((entry) => (
        <span key={entry.key} className="flex items-center gap-1.5">
          <Swatch tone={entry.tone} />
          {entry.label}
        </span>
      ))}
    </div>
  ) : null;
}

type ChartProps = {
  kind: ChartKind;
  unit: "percent" | "count";
  goal: number | null;
  series: { key: string; label: string; tone: Tone }[];
  data: { label: string; values: Record<string, number> }[];
  drills: Record<string, Drill>;
};

// One recharts drawing per kind, styled like shadcn/ui's chart gallery.
function ChartBody({ kind, unit, goal, series, data, drills }: ChartProps) {
  const drillLabel = useDrillByLabel(drills);
  // Every chart opens the records of the point the user clicks.
  const onClick = (state: { activeLabel?: string | number }) => drillLabel(state.activeLabel);
  const config = Object.fromEntries(
    series.map((entry) => [entry.key, { label: entry.label, color: toneFill[entry.tone] }]),
  ) satisfies ChartConfig;
  const rows = data.map((datum) => ({ label: datum.label, ...datum.values }));
  const format = (value: unknown) => (unit === "percent" ? `${value}%` : String(value));
  const percentDomain = unit === "percent" ? ([0, 100] as const) : undefined;
  // A single percentage series is painted by the traffic light, bar by bar.
  const banded = unit === "percent" && series.length === 1;
  const tooltip = <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="dot" />} />;
  const longLabels = data.some((datum) => datum.label.length > 10) && data.length <= 8;
  const horizontal =
    kind === "bar-horizontal" || kind === "bar-negative" || (longLabels && (kind === "bar-stacked" || kind === "bar-grouped"));
  const stacked = kind === "bar-stacked";
  const container = cn("aspect-auto h-full w-full", Object.keys(drills).length > 0 && "cursor-pointer");

  if (kind === "radar")
    return (
      <ChartContainer config={config} className={container}>
        <RadarChart data={rows} outerRadius="66%" onClick={onClick}>
          {tooltip}
          <PolarGrid />
          <PolarAngleAxis dataKey="label" tick={{ fontSize: 10 }} />
          <PolarRadiusAxis domain={percentDomain} tick={false} axisLine={false} />
          {series.map((entry) => (
            <Radar
              key={entry.key}
              dataKey={entry.key}
              fill={`var(--color-${entry.key})`}
              fillOpacity={0.35}
              stroke={`var(--color-${entry.key})`}
              strokeWidth={2}
              dot={{ r: 3, fillOpacity: 1 }}
            />
          ))}
        </RadarChart>
      </ChartContainer>
    );

  if (kind === "area" || kind === "line") {
    const Chart = kind === "area" ? AreaChart : LineChart;
    return (
      <ChartContainer config={config} className={container}>
        <Chart data={rows} margin={{ left: 0, right: 8, top: 8 }} onClick={onClick}>
          <defs>
            {series.map((entry) => (
              <linearGradient key={entry.key} id={`fill-${entry.key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={`var(--color-${entry.key})`} stopOpacity={0.6} />
                <stop offset="95%" stopColor={`var(--color-${entry.key})`} stopOpacity={0.05} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} minTickGap={24} />
          <YAxis tickLine={false} axisLine={false} width={28} allowDecimals={false} domain={percentDomain} />
          {tooltip}
          {series.map((entry) =>
            kind === "area" ? (
              <Area
                key={entry.key}
                dataKey={entry.key}
                type="monotone"
                stackId="a"
                fill={`url(#fill-${entry.key})`}
                stroke={`var(--color-${entry.key})`}
                strokeWidth={2}
              />
            ) : (
              <Line
                key={entry.key}
                dataKey={entry.key}
                type="monotone"
                stroke={`var(--color-${entry.key})`}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />
            ),
          )}
        </Chart>
      </ChartContainer>
    );
  }

  return (
    <ChartContainer config={config} className={container}>
      <BarChart
        data={rows}
        layout={horizontal ? "vertical" : "horizontal"}
        margin={{ left: 0, right: horizontal ? 36 : 8, top: 12 }}
        barCategoryGap={horizontal ? 6 : "20%"}
        onClick={onClick}
      >
        <CartesianGrid vertical={horizontal} horizontal={!horizontal} />
        {horizontal ? (
          <>
            <XAxis type="number" hide domain={kind === "bar-negative" ? ["auto", "auto"] : percentDomain} />
            <YAxis type="category" dataKey="label" tickLine={false} axisLine={false} width={150} tick={{ fontSize: 11 }} />
          </>
        ) : (
          <>
            <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} interval={0} tick={{ fontSize: 11 }} />
            <YAxis tickLine={false} axisLine={false} width={28} allowDecimals={false} domain={percentDomain} />
          </>
        )}
        {tooltip}
        {/* The traffic light's two edges, 75 (red→amber) and the goal. */}
        {goal !== null
          ? [75, goal].map((threshold) => (
              <ReferenceLine
                key={threshold}
                {...(horizontal ? { x: threshold } : { y: threshold })}
                stroke={toneFill[threshold === goal ? "success" : "warning"]}
                strokeOpacity={0.7}
                strokeDasharray="3 3"
                label={{
                  value: `${threshold}%`,
                  position: horizontal ? "top" : "right",
                  fontSize: 10,
                  fill: "var(--muted-foreground)",
                }}
              />
            ))
          : null}
        {kind === "bar-negative" ? <ReferenceLine x={0} stroke="var(--border)" /> : null}
        {series.map((entry, index) => (
          <Bar
            key={entry.key}
            dataKey={entry.key}
            stackId={stacked ? "a" : undefined}
            fill={`var(--color-${entry.key})`}
            radius={stacked ? (index === series.length - 1 ? 4 : 0) : 4}
            maxBarSize={horizontal ? 22 : 48}
          >
            {banded || kind === "bar-negative"
              ? rows.map((row) => {
                  const value = Number(row[entry.key as keyof typeof row]);
                  return (
                    <ChartCell
                      key={row.label}
                      fill={toneFill[kind === "bar-negative" ? (value >= 0 ? "success" : "danger") : band(value)]}
                    />
                  );
                })
              : null}
            {series.length === 1 ? (
              <LabelList
                dataKey={entry.key}
                position={horizontal ? "right" : "top"}
                className="fill-foreground"
                fontSize={11}
                formatter={format}
              />
            ) : null}
          </Bar>
        ))}
      </BarChart>
    </ChartContainer>
  );
}

export const { registry } = defineRegistry(dashboardCatalog, {
  components: {
    Page: ({ props, children }) => (
      <section className="flex flex-col gap-5">
        <header className={cn("flex flex-col gap-0.5", enter)}>
          <h2 className="text-xl font-semibold tracking-tight">{props.title}</h2>
          <p className="text-sm text-muted-foreground">{props.subtitle}</p>
        </header>
        <div className="grid grid-flow-row-dense auto-rows-[4.25rem] grid-cols-1 gap-4 md:grid-cols-3">{children}</div>
      </section>
    ),

    KpiStrip: function KpiStrip({ props }) {
      const open = useContext(DrillContext);
      return (
        <Cell widget={props.widget} size={props.size}>
          <Card className="h-full justify-center py-0">
            <CardContent
              className="grid h-full divide-x px-0"
              style={{
                gridTemplateColumns: `repeat(${props.items.length}, minmax(0, 1fr))`,
              }}
            >
              {props.items.map((item) => (
                <button
                  type="button"
                  key={item.label}
                  disabled={!item.drill}
                  onClick={() => item.drill && open(item.drill)}
                  title={item.drill ? `Show the records behind “${item.label}”` : undefined}
                  className="group/kpi relative flex min-w-0 flex-col justify-center gap-1 px-5 text-left transition-colors first:rounded-l-xl last:rounded-r-xl enabled:cursor-pointer enabled:hover:bg-accent/40"
                >
                  {item.drill ? (
                    <DrillMark className="absolute top-3 right-3 opacity-40 transition-opacity group-hover/kpi:opacity-100" />
                  ) : null}
                  <span className="flex items-center gap-2 truncate text-xs text-muted-foreground">
                    <Swatch tone={item.tone} />
                    {item.label}
                  </span>
                  <span
                    className={cn(
                      "text-3xl font-semibold tabular-nums tracking-tight",
                      (item.tone === "danger" || item.tone === "warning") && toneText[item.tone],
                    )}
                  >
                    {item.value}
                  </span>
                  <span className="truncate text-xs text-muted-foreground">{item.detail}</span>
                </button>
              ))}
            </CardContent>
          </Card>
        </Cell>
      );
    },

    Gauge: function Gauge({ props }) {
      const open = useContext(DrillContext);
      const value = props.value ?? 0;
      return (
        <Cell widget={props.widget} size={props.size}>
          <Widget title={props.title} description={props.description} drill={props.drill} drillable={Boolean(props.drill)}>
            <div
              className={cn("relative mx-auto aspect-square h-full max-w-full", props.drill && "cursor-pointer")}
              onClick={() => props.drill && open(props.drill)}
            >
              <ChartContainer
                config={{
                  value: { label: props.label, color: toneFill[props.tone] },
                }}
                className="aspect-square h-full w-full"
              >
                <RadialBarChart
                  data={[{ value }]}
                  startAngle={90}
                  endAngle={90 - (360 * value) / 100}
                  innerRadius="74%"
                  outerRadius="100%"
                >
                  <RadialBar dataKey="value" background={{ fill: "var(--muted)" }} cornerRadius={10} fill="var(--color-value)" />
                  <PolarRadiusAxis tick={false} tickLine={false} axisLine={false} />
                </RadialBarChart>
              </ChartContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span className={cn("text-3xl font-semibold tabular-nums", toneText[props.tone])}>
                  {props.value === null ? "—" : `${props.value}%`}
                </span>
                <span className="text-xs text-muted-foreground">{props.label}</span>
              </div>
            </div>
          </Widget>
        </Cell>
      );
    },

    Chart: ({ props }) => (
      <Cell widget={props.widget} size={props.size}>
        <Widget
          title={props.title}
          description={props.description}
          drill={props.drill}
          className="flex flex-col"
          drillable={Object.keys(props.drills).length > 0}
        >
          <div className="min-h-0 flex-1">
            <ChartBody {...props} />
          </div>
          <Legend series={props.series} />
        </Widget>
      </Cell>
    ),

    Donut: function Donut({ props }) {
      const drillLabel = useDrillByLabel(props.drills);
      const config = Object.fromEntries(
        props.data.map((datum) => [datum.label, { label: datum.label, color: toneFill[datum.tone] }]),
      ) satisfies ChartConfig;
      return (
        <Cell widget={props.widget} size={props.size}>
          <Widget
            title={props.title}
            description={props.description}
            drill={props.drill}
            className="flex flex-col items-center gap-3"
            drillable
          >
            <div className="relative aspect-square min-h-0 flex-1">
              <ChartContainer config={config} className="aspect-square h-full">
                <PieChart>
                  <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />
                  <Pie
                    data={props.data}
                    dataKey="value"
                    nameKey="label"
                    innerRadius="66%"
                    outerRadius="100%"
                    paddingAngle={2}
                    stroke="none"
                    cornerRadius={3}
                    className="cursor-pointer"
                    onClick={(_, index) => drillLabel(props.data[index]?.label)}
                  >
                    {props.data.map((datum) => (
                      <ChartCell key={datum.label} fill={toneFill[datum.tone]} />
                    ))}
                  </Pie>
                </PieChart>
              </ChartContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-2xl font-semibold tabular-nums">{props.centerValue}</span>
                <span className="text-xs text-muted-foreground">{props.centerLabel}</span>
              </div>
            </div>
            <ul className="flex flex-wrap justify-center gap-x-3 gap-y-1 text-xs">
              {props.data.map((datum) => (
                <li key={datum.label}>
                  <button
                    type="button"
                    onClick={() => drillLabel(datum.label)}
                    className="flex cursor-pointer items-center gap-1.5 rounded px-1 hover:bg-accent/50"
                  >
                    <Swatch tone={datum.tone} />
                    {datum.label}
                    <span className="tabular-nums text-muted-foreground">{datum.value}</span>
                  </button>
                </li>
              ))}
            </ul>
          </Widget>
        </Cell>
      );
    },

    BarList: function BarList({ props }) {
      const drillLabel = useDrillByLabel(props.drills);
      const max = props.unit === "percent" ? 100 : Math.max(1, ...props.data.map((datum) => datum.value));
      return (
        <Cell widget={props.widget} size={props.size}>
          <Widget
            title={props.title}
            description={props.description}
            drill={props.drill}
            className="overflow-y-auto"
            drillable={Object.keys(props.drills).length > 0}
          >
            <ul className="flex flex-col gap-1">
              {props.data.map((datum) => (
                <li
                  key={datum.label}
                  role="button"
                  tabIndex={0}
                  onClick={() => drillLabel(datum.label)}
                  onKeyDown={(event) => event.key === "Enter" && drillLabel(datum.label)}
                  className="flex cursor-pointer flex-col gap-1 rounded-md px-1.5 py-1 hover:bg-accent/40"
                >
                  <div className="flex items-baseline justify-between gap-3 text-xs">
                    <span className="truncate">{datum.label}</span>
                    <span className="font-medium tabular-nums">
                      {datum.value}
                      {props.unit === "percent" ? "%" : ""}
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full transition-[width] duration-700 ease-out"
                      style={{
                        width: `${(datum.value / max) * 100}%`,
                        background: toneFill[datum.tone],
                      }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </Widget>
        </Cell>
      );
    },

    Heatmap: function Heatmap({ props }) {
      const drillLabel = useDrillByLabel(props.drills);
      return (
        <Cell widget={props.widget} size={props.size}>
          <Widget title={props.title} description={props.description} drill={props.drill} className="overflow-auto" drillable>
            <div
              className="grid min-w-[40rem] gap-1 text-xs"
              style={{
                gridTemplateColumns: `minmax(9rem, 1.4fr) repeat(${props.columns.length}, minmax(0, 1fr))`,
              }}
            >
              <span />
              {props.columns.map((column) => (
                <span key={column} className="line-clamp-2 px-1 pb-1 text-center text-[11px] leading-tight text-muted-foreground">
                  {column}
                </span>
              ))}
              {props.rows.map((row) => (
                <div key={row.label} className="contents">
                  <span className="flex items-center truncate pr-2">{row.label}</span>
                  {row.cells.map((cell, index) => (
                    <button
                      type="button"
                      key={index}
                      disabled={cell === null}
                      onClick={() => drillLabel(`${row.label}::${props.columns[index]}`)}
                      title={`${row.label} · ${props.columns[index]}: ${cell === null ? "not required" : `${cell}%`}`}
                      className="flex h-8 items-center justify-center rounded-md font-medium tabular-nums transition-[filter] enabled:cursor-pointer enabled:hover:brightness-125"
                      style={
                        cell === null
                          ? { background: "var(--muted)", opacity: 0.4 }
                          : {
                              background: `color-mix(in oklab, ${toneFill[band(cell)]} ${cell > 90 ? 45 : 30 + (100 - cell) / 3}%, transparent)`,
                            }
                      }
                    >
                      {cell === null ? "" : `${cell}%`}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </Widget>
        </Cell>
      );
    },

    DataTable: ({ props }) => (
      <Cell widget={props.widget} size={props.size}>
        <Widget title={props.title} description={props.description} className="overflow-auto px-2">
          {props.rows.length === 0 ? (
            <p className="px-2 text-sm text-muted-foreground">{props.emptyText}</p>
          ) : (
            <Table>
              <TableHeader className="sticky top-0 bg-card">
                <TableRow>
                  {props.columns.map((column) => (
                    <TableHead key={column.key} className={cn("h-8 text-xs", column.align === "right" && "text-right")}>
                      {column.label}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {props.rows.map((row, index) => (
                  <TableRow key={index}>
                    {props.columns.map((column, columnIndex) => (
                      <TableCell
                        key={column.key}
                        className={cn(
                          "max-w-72 truncate py-1.5 text-[13px]",
                          column.align === "right" && "text-right tabular-nums",
                          columnIndex === props.columns.length - 1 && row.tone && toneText[row.tone],
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
        </Widget>
      </Cell>
    ),

    Callout: ({ props }) => (
      <Cell widget={props.widget} size={props.size}>
        <div
          className={cn(
            "h-full overflow-auto rounded-xl border p-4",
            props.tone === "danger" ? "border-destructive/30 bg-destructive/5" : "border-warning/40 bg-warning/5",
          )}
        >
          <p className={cn("text-sm font-medium", toneText[props.tone])}>{props.title}</p>
          <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 text-sm">
            {props.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      </Cell>
    ),

    ContractorCard: function ContractorCard({ props }) {
      const open = useContext(DrillContext);
      const total = props.states.reduce((sum, datum) => sum + datum.value, 0);
      return (
        <Cell widget={props.widget} size={props.size}>
          <Card className="h-full gap-4 py-4">
            <CardHeader className="px-4">
              <CardDescription className="text-xs">Contractor</CardDescription>
              <CardTitle className="line-clamp-2 text-base">{props.name}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4 px-4">
              <div className="grid grid-cols-3 gap-3">
                {[
                  ["Coverage", props.coverage === null ? "—" : `${props.coverage}%`, toneText[band(props.coverage)]],
                  ["Cleared", `${props.workersCleared}/${props.workersTotal}`, ""],
                  ["Contracts", String(props.contracts), ""],
                ].map(([label, value, className]) => (
                  <div key={label} className="flex flex-col">
                    <span className="text-xs text-muted-foreground">{label}</span>
                    <span className={cn("text-2xl font-semibold tabular-nums", className)}>{value}</span>
                  </div>
                ))}
              </div>
              <div className="flex h-2 gap-px overflow-hidden rounded-full bg-muted">
                {props.states.map((datum) => (
                  <div
                    key={datum.label}
                    title={`${datum.label}: ${datum.value}`}
                    style={{
                      width: `${(datum.value / Math.max(1, total)) * 100}%`,
                      background: toneFill[datum.tone],
                    }}
                  />
                ))}
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                {props.states.map((datum) => (
                  <span key={datum.label} className="flex items-center gap-1.5">
                    <Swatch tone={datum.tone} />
                    {datum.label} {datum.value}
                  </span>
                ))}
              </div>
              {props.drill ? (
                <button
                  type="button"
                  onClick={() => props.drill && open(props.drill)}
                  className="flex w-fit cursor-pointer items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                >
                  <DrillMark />
                  Show open gaps
                </button>
              ) : null}
            </CardContent>
          </Card>
        </Cell>
      );
    },
  },
});
