// Turns the client company's figures into the widgets the layout model may
// choose from. The model only sees each candidate's `description`; the props
// (worker names, dates, counts) stay on our side and go straight to the
// renderer. So a description names what a widget shows, never a person's data.
//
// Pure: the API route and the browser both build candidates from the same
// BuilderInput (./data loads it from lib/db), so a saved layout refills
// with no AI call.
import type { Experimental_CompositionCandidate } from "@json-render/core";
import type { ContractCoverage, CoverageSnapshot, DocumentStatus, UnmetObligations, WorkerClearance } from "@/lib/db";
import type { ChartKind, Datum, Drill, Size, Tone } from "./catalog";

export type BuilderInput = {
  /** The client company's name, or the contractor's once scoped to one. */
  title: string;
  now: number;
  /** YYYY-MM */
  periodMonth: string;
  contracts: ContractCoverage[];
  documents: DocumentStatus[];
  workers: WorkerClearance[];
  /** Twelve months of per-contractor snapshots, oldest first. */
  history: CoverageSnapshot[];
  obligations: UnmetObligations[];
};

export type Company = { id: string; name: string };

const clearance = {
  cleared: { label: "Cleared", tone: "success" },
  pending: { label: "Pending", tone: "warning" },
  blocked: { label: "Blocked", tone: "danger" },
} as const satisfies Record<WorkerClearance["clearance"], { label: string; tone: Tone }>;

export const MAX_ELEMENTS = 12;
const TABLE_ROWS = 12;
const dayMs = 24 * 60 * 60 * 1000;
const expiringDays = 21;
const goal = 90;

// How each document reads on screen, worst first.
const states = {
  expired: { label: "Expired", tone: "danger" },
  rejected: { label: "Rejected", tone: "danger" },
  expiring: { label: "Expiring soon", tone: "warning" },
  in_review: { label: "In review", tone: "info" },
  requested: { label: "Requested", tone: "muted" },
  valid: { label: "Valid", tone: "success" },
} as const satisfies Record<string, { label: string; tone: Tone }>;
type State = keyof typeof states;
const stateKeys = Object.keys(states) as State[];
const isOpen = (state: State) => state !== "valid" && state !== "expiring";

const displayState = (row: DocumentStatus, now: number): State => {
  switch (row.status) {
    case "approved":
      return row.expiresAt !== null && row.expiresAt - now <= expiringDays * dayMs ? "expiring" : "valid";
    case "expired":
      return "expired";
    case "rejected":
      return "rejected";
    case "pending":
      return "in_review";
    case "missing":
      return "requested";
  }
};

// Traffic-light bands: red below 75, amber through 90, green above.
const bandTone = (percent: number | null): Tone =>
  percent === null ? "muted" : percent < 75 ? "danger" : percent <= goal ? "warning" : "success";

const formatPercent = (percent: number | null) => (percent === null ? "No data" : `${percent}%`);

const formatDate = (timestamp: number) =>
  new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }).format(timestamp);

const formatMonth = (periodMonth: string, month: "short" | "long" = "short") =>
  new Intl.DateTimeFormat("en-GB", { month, year: month === "long" ? "numeric" : undefined, timeZone: "UTC" }).format(
    Date.parse(`${periodMonth}-01`),
  );

const countBy = <T>(items: readonly T[], key: (item: T) => string) => {
  const counts = new Map<string, number>();
  for (const item of items) counts.set(key(item), (counts.get(key(item)) ?? 0) + 1);
  return counts;
};

const subjectOf = (row: DocumentStatus) => row.workerName ?? "Company";

const moreText = (total: number) => (total > TABLE_ROWS ? ` Showing ${TABLE_ROWS} of ${total}.` : "");

const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

// Words that never identify one contractor: legal suffixes, and words that
// also name a work site or a widget ("remove the table").
const genericWords = new Set([
  "services",
  "service",
  "company",
  "group",
  "contractors",
  "limited",
  "and",
  "the",
  "harbour",
  "table",
  "skerry",
]);

const companiesOf = (contracts: readonly ContractCoverage[]): Company[] => [
  ...new Map(
    contracts.map((contract) => [contract.contractorId, { id: contract.contractorId, name: contract.contractorName }]),
  ).values(),
];

/** The one contractor a question names ("how is Deepline doing?"), if any. */
export function companyNamedIn(prompt: string, contracts: readonly ContractCoverage[]) {
  const words = new Set(normalize(prompt).match(/\p{L}+/gu));
  const named = companiesOf(contracts).filter((company) =>
    (normalize(company.name).match(/\p{L}+/gu) ?? []).some(
      (word) => word.length >= 4 && !genericWords.has(word) && words.has(word),
    ),
  );
  return named.length === 1 ? named[0] : null;
}

/** The contractor with this id, when the client company has it. */
export function companyById(id: string, contracts: readonly ContractCoverage[]) {
  return companiesOf(contracts).find((company) => company.id === id) ?? null;
}

/** Every contractor, for the composer's scope picker. */
export const companiesIn = (input: BuilderInput) => companiesOf(input.contracts);

/**
 * Narrows the figures to one contractor, so every metric, chart and table the
 * question gets is about that contractor and not the whole client company.
 */
export function scopeToCompany(input: BuilderInput, company: Company): BuilderInput {
  const contractIds = new Set(
    input.contracts.filter((contract) => contract.contractorId === company.id).map((contract) => contract.contractId),
  );
  return {
    ...input,
    title: company.name,
    contracts: input.contracts.filter((contract) => contractIds.has(contract.contractId)),
    documents: input.documents.filter((row) => row.contractorId === company.id),
    workers: input.workers.filter((worker) => worker.contractorId === company.id),
    history: input.history.filter((row) => row.contractorId === company.id),
    obligations: input.obligations.filter((signal) => contractIds.has(signal.contractId)),
  };
}

// Legal suffixes dropped from axis labels, where space is short.
const shortName = (name: string) => name.replace(/\s+(Co\.?|Ltd\.?|Services|Group)$/i, "").replace(/^(.{22}).+$/, "$1…");

const shortTitle = (title: string, length = 24) => (title.length > length ? `${title.slice(0, length)}…` : title);

const weekStart = (timestamp: number) => {
  const date = new Date(timestamp);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  return date.getTime();
};

const percentOf = (part: number, total: number) => (total === 0 ? null : Math.floor((part / total) * 100));

const sum = <T>(items: readonly T[], value: (item: T) => number) => items.reduce((total, item) => total + value(item), 0);

/** Every widget this client company (or scoped contractor) can show, as layout candidates. */
export function buildCandidates({
  title,
  now,
  periodMonth,
  contracts,
  documents,
  workers: workerRows,
  history,
  obligations,
}: BuilderInput): Experimental_CompositionCandidate[] {
  const rows = documents.map((row) => ({ ...row, state: displayState(row, now) }));
  const openRows = rows.filter((row) => isOpen(row.state));
  const stateCounts = countBy(rows, (row) => row.state);
  const count = (state: State) => stateCounts.get(state) ?? 0;
  const covered = (items: readonly { state: State }[]) => items.filter((row) => !isOpen(row.state)).length;
  const coverage = percentOf(
    sum(contracts, (contract) => contract.coveredDocuments),
    sum(contracts, (contract) => contract.requiredDocuments),
  );

  const companies = companiesOf(contracts).map(({ id, name }) => {
    const own = contracts.filter((contract) => contract.contractorId === id);
    return {
      id,
      name,
      coverage: percentOf(
        sum(own, (contract) => contract.coveredDocuments),
        sum(own, (contract) => contract.requiredDocuments),
      ),
      contracts: own.length,
      workersCleared: sum(own, (contract) => contract.workersCleared),
      workersTotal: sum(own, (contract) => contract.workersTotal),
      rows: rows.filter((row) => row.contractorId === id),
    };
  });
  const byCoverage = [...companies].sort((left, right) => (left.coverage ?? 0) - (right.coverage ?? 0));
  // The document types most often required, for the radar and the heatmap.
  const topRequirements = [...countBy(rows, (row) => row.requirementTitle)]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 8)
    .map(([requirement]) => requirement);

  // ---- drill-downs: the records behind each number and chart point
  type Row = (typeof rows)[number];
  const severity = (row: Row) => stateKeys.indexOf(row.state);
  const documentsDrill = (title: string, items: readonly Row[]): Drill => ({
    title,
    description: items.length === 1 ? "1 document" : `${items.length} documents`,
    columns: [
      // A list about one contractor does not repeat its name on every row.
      ...(new Set(items.map((row) => row.contractorId)).size > 1
        ? [{ key: "company", label: "Contractor", align: "left" as const }]
        : []),
      { key: "requirement", label: "Document", align: "left" },
      { key: "subject", label: "For", align: "left" },
      { key: "date", label: "Expires", align: "right" },
      { key: "state", label: "Status", align: "right" },
    ],
    rows: [...items]
      .sort((left, right) => severity(left) - severity(right) || (left.expiresAt ?? Infinity) - (right.expiresAt ?? Infinity))
      .map((row) => ({
        cells: {
          company: row.contractorName,
          requirement: row.requirementTitle,
          subject: subjectOf(row),
          date: row.expiresAt === null ? "—" : formatDate(row.expiresAt),
          state: states[row.state].label,
        },
        tone: states[row.state].tone,
      })),
  });
  const inState = (...wanted: State[]) => rows.filter((row) => wanted.includes(row.state));
  // Active assignments with their clearance and the open documents behind it.
  const assignments = workerRows
    .map((worker) => ({
      name: worker.fullName,
      companyId: worker.contractorId,
      company: worker.contractorName,
      status: clearance[worker.clearance],
      open: openRows.filter((row) => row.workerId === worker.workerId && row.contractId === worker.contractId),
    }))
    .sort(
      (left, right) =>
        Number(left.status === clearance.cleared) - Number(right.status === clearance.cleared) ||
        right.open.length - left.open.length ||
        left.name.localeCompare(right.name),
    );
  const workersDrill = (title: string, companyId?: string): Drill => {
    const items = assignments.filter((entry) => !companyId || entry.companyId === companyId);
    return {
      title,
      description: `${items.filter((entry) => entry.status === clearance.cleared).length} of ${items.length} cleared`,
      columns: [
        { key: "worker", label: "Worker", align: "left" },
        { key: "company", label: "Contractor", align: "left" },
        { key: "missing", label: "Open documents", align: "left" },
        { key: "state", label: "Status", align: "right" },
      ],
      rows: items.map((entry) => ({
        cells: {
          worker: entry.name,
          company: entry.company,
          missing: entry.open.map((row) => row.requirementTitle).join(", ") || "—",
          state: entry.status.label,
        },
        tone: entry.status.tone,
      })),
    };
  };
  const companyGaps = (company: (typeof companies)[number]) =>
    documentsDrill(
      `${company.name}: open gaps`,
      company.rows.filter((row) => isOpen(row.state)),
    );
  const companiesDrill: Drill = {
    title: "Active contractors",
    description: "Worst coverage first.",
    columns: [
      { key: "company", label: "Contractor", align: "left" },
      { key: "contracts", label: "Contracts", align: "right" },
      { key: "workers", label: "Cleared", align: "right" },
      { key: "open", label: "Open", align: "right" },
      { key: "coverage", label: "Coverage", align: "right" },
    ],
    rows: byCoverage.map((company) => ({
      cells: {
        company: company.name,
        contracts: String(company.contracts),
        workers: `${company.workersCleared}/${company.workersTotal}`,
        open: String(company.rows.filter((row) => isOpen(row.state)).length),
        coverage: formatPercent(company.coverage),
      },
      tone: bandTone(company.coverage),
    })),
  };
  const contractPercent = (contract: ContractCoverage) => percentOf(contract.coveredDocuments, contract.requiredDocuments);
  const contractsByCoverage = [...contracts].sort(
    (left, right) => (contractPercent(left) ?? 101) - (contractPercent(right) ?? 101),
  );
  const contractsDrill: Drill = {
    title: "Coverage by contract",
    description: "Worst coverage first.",
    columns: [
      { key: "contract", label: "Contract", align: "left" },
      { key: "company", label: "Contractor", align: "left" },
      { key: "site", label: "Site", align: "left" },
      { key: "workers", label: "Cleared", align: "right" },
      { key: "coverage", label: "Coverage", align: "right" },
    ],
    rows: contractsByCoverage.map((contract) => ({
      cells: {
        contract: contract.label,
        company: contract.contractorName,
        site: contract.siteName,
        workers: `${contract.workersCleared}/${contract.workersTotal}`,
        coverage: formatPercent(contractPercent(contract)),
      },
      tone: bandTone(contractPercent(contract)),
    })),
  };
  const withholdingDrill: Drill | null = obligations.length
    ? {
        title: "Contracts with unmet labour obligations",
        description: "Withhold payment while the contractor's payroll proof is missing.",
        columns: [
          { key: "company", label: "Contractor", align: "left" },
          { key: "contract", label: "Contract", align: "left" },
          { key: "workers", label: "Workers", align: "right" },
          { key: "company_reqs", label: "Company docs", align: "right" },
          { key: "withholding", label: "Withholding", align: "right" },
        ],
        rows: obligations.map((signal) => ({
          cells: {
            company: signal.contractorName,
            contract: signal.contractLabel,
            workers: String(signal.unmetWorkerCount),
            company_reqs: String(signal.unmetCompanyRequirementCount),
            withholding: signal.withholdingRecommended ? "Recommended" : "No",
          },
          tone: signal.withholdingRecommended ? "danger" : "warning",
        })),
      }
    : null;
  // Drill-downs of a chart, keyed by the label the user clicks.
  const byLabel = <T>(items: readonly T[], label: (item: T) => string, drill: (item: T) => Drill): Record<string, Drill> =>
    Object.fromEntries(items.map((item) => [label(item), drill(item)]));
  const companyGapDrills = byLabel(byCoverage, (company) => shortName(company.name), companyGaps);
  const shownStates = stateKeys.filter((state) => count(state) > 0);
  const stateDrills = byLabel(
    shownStates,
    (state) => states[state].label,
    (state) => documentsDrill(`Documents: ${states[state].label.toLowerCase()}`, inState(state)),
  );

  const candidates: Experimental_CompositionCandidate[] = [];
  const add = (id: string, description: string, type: string, size: Size, props: Record<string, unknown>, resource?: string) =>
    candidates.push({
      id,
      description,
      root: false,
      ...(resource ? { resource } : {}),
      element: { type, props: { widget: id, size, ...props } },
    });
  // A chart; `resource` groups the same data drawn as different chart types,
  // so "show it as bars" swaps one for another.
  const chart = (
    id: string,
    description: string,
    size: Size,
    props: {
      title: string;
      description: string;
      kind: ChartKind;
      unit: "percent" | "count";
      goal?: number;
      series: { key: string; label: string; tone: Tone }[];
      data: { label: string; values: Record<string, number> }[];
      drills?: Record<string, Drill>;
    },
    resource?: string,
  ) => add(id, `${description} Drawn as a ${props.kind} chart.`, "Chart", size, { goal: null, drills: {}, ...props }, resource);

  // ---- page
  candidates.push({
    id: "page",
    description: "Page: the dashboard page. Always the root.",
    root: true,
    element: {
      type: "Page",
      props: {
        title,
        subtitle: `Figures as of ${formatDate(now)} · ${companies.length === 1 ? "1 contractor" : `${companies.length} contractors`}`,
      },
    },
  });

  // ---- headline numbers, as full-width strips so they never crowd out charts
  const workersCleared = sum(contracts, (contract) => contract.workersCleared);
  const workersTotal = sum(contracts, (contract) => contract.workersTotal);
  const withholdings = obligations.filter((signal) => signal.withholdingRecommended).length;
  const kpi = {
    coverage: {
      label: "Document coverage",
      value: formatPercent(coverage),
      detail: `Goal: above ${goal}%`,
      tone: bandTone(coverage),
      drill: contractsDrill,
    },
    contractors: {
      label: "Active contractors",
      value: String(companies.length),
      detail: `${contracts.length} active contracts`,
      tone: "info",
      drill: companiesDrill,
    },
    workers: {
      label: "Workers cleared",
      value: `${workersCleared} of ${workersTotal}`,
      detail: `${workersTotal - workersCleared} not cleared`,
      tone: workersCleared === workersTotal ? "success" : "warning",
      drill: workersDrill("Workers"),
    },
    expired: {
      label: "Expired",
      value: String(count("expired")),
      detail: "Block clearance",
      tone: count("expired") ? "danger" : "success",
      drill: documentsDrill("Expired documents", inState("expired")),
    },
    expiring: {
      label: "Expiring soon",
      value: String(count("expiring")),
      detail: `Next ${expiringDays} days`,
      tone: count("expiring") ? "warning" : "success",
      drill: documentsDrill("Expiring soon", inState("expiring")),
    },
    review: {
      label: "In review",
      value: String(count("in_review")),
      detail: "Waiting on your decision",
      tone: "info",
      drill: documentsDrill("In review", inState("in_review")),
    },
    rejected: {
      label: "Rejected",
      value: String(count("rejected")),
      detail: "The contractor must fix them",
      tone: count("rejected") ? "danger" : "success",
      drill: documentsDrill("Rejected", inState("rejected")),
    },
    missing: {
      label: "Not uploaded",
      value: String(count("requested")),
      detail: "Requested from the contractor",
      tone: count("requested") ? "warning" : "success",
      drill: documentsDrill("Not uploaded", inState("requested")),
    },
    withholding: {
      label: "Payment withholding",
      value: String(withholdings),
      detail: `${obligations.length} contracts with unmet obligations`,
      tone: withholdings ? "danger" : "success",
      drill: withholdingDrill,
    },
  } satisfies Record<string, { label: string; value: string; detail: string; tone: Tone; drill: Drill | null }>;
  const strip = (id: string, description: string, keys: (keyof typeof kpi)[]) =>
    add(
      id,
      `Headline numbers: ${description}`,
      "KpiStrip",
      "strip",
      { items: keys.map((key) => kpi[key]) },
      // One strip per dashboard: two would repeat numbers.
      "kpis",
    );
  strip(
    "kpis_summary",
    "overall coverage, active contractors, cleared workers and expired documents (summary, overview, how are we doing, key indicators).",
    ["coverage", "contractors", "workers", "expired"],
  );
  strip(
    "kpis_documents",
    "documents by status: expired, expiring soon, in review, rejected, not uploaded (document status, pending, expirations).",
    ["expired", "expiring", "review", "rejected", "missing"],
  );
  strip(
    "kpis_operations",
    "cleared workers, active contractors, contracts where payment withholding is recommended (operations, workforce, withholding).",
    ["workers", "contractors", "withholding"],
  );

  // ---- gauges
  add(
    "gauge_coverage",
    `Gauge: overall document coverage as a radial dial against the ${goal}% goal (coverage, traffic light, dial).`,
    "Gauge",
    "1x1",
    {
      title: "Document coverage",
      description: `Goal: above ${goal}%.`,
      value: coverage,
      label: "coverage",
      tone: bandTone(coverage),
      drill: contractsDrill,
    },
  );
  const workersPercent = percentOf(workersCleared, workersTotal);
  add(
    "gauge_workers",
    "Gauge: share of workers cleared to work, as a radial dial (percentage of workers cleared).",
    "Gauge",
    "1x1",
    {
      title: "Workers cleared",
      description: `${workersCleared} of ${workersTotal} can work.`,
      value: workersPercent,
      label: "cleared",
      tone: bandTone(workersPercent),
      drill: workersDrill("Workers"),
    },
  );

  // ---- coverage per contractor, in four chart types
  const coverageData = byCoverage.map((company) => ({
    label: shortName(company.name),
    values: { coverage: company.coverage ?? 0 },
  }));
  const coverageSeries = [{ key: "coverage", label: "Coverage", tone: "info" as const }];
  const coverageText =
    "Coverage percentage per contractor, worst first (coverage by contractor, ranking, compare contractors, at risk).";
  const goalText = `Lines at 75% and at the ${goal}% goal.`;
  chart(
    "chart_coverage_bars",
    coverageText,
    "2x1",
    {
      title: "Coverage by contractor",
      description: goalText,
      kind: "bar-horizontal",
      unit: "percent",
      goal,
      series: coverageSeries,
      data: coverageData,
      drills: companyGapDrills,
    },
    "coverage_by_company",
  );
  chart(
    "chart_coverage_columns",
    coverageText,
    "2x1",
    {
      title: "Coverage by contractor",
      description: goalText,
      kind: "bar",
      unit: "percent",
      goal,
      series: coverageSeries,
      data: coverageData,
      drills: companyGapDrills,
    },
    "coverage_by_company",
  );
  chart(
    "chart_coverage_radar",
    coverageText,
    "1x1",
    {
      title: "Coverage by contractor",
      description: "Further from the centre is better.",
      kind: "radar",
      unit: "percent",
      series: coverageSeries,
      data: coverageData,
      drills: companyGapDrills,
    },
    "coverage_by_company",
  );
  add(
    "list_coverage",
    `Ranked list: ${coverageText}`,
    "BarList",
    "1x1",
    {
      title: "Coverage by contractor",
      description: `Red below 75%, green above ${goal}%.`,
      unit: "percent",
      data: byCoverage.map((company) => ({
        label: company.name,
        value: company.coverage ?? 0,
        tone: bandTone(company.coverage),
      })),
      drills: byLabel(byCoverage, (company) => company.name, companyGaps),
    },
    "coverage_by_company",
  );
  chart(
    "chart_gap_to_goal",
    `Bars above or below zero: how far each contractor is from the ${goal}% coverage goal (gap to goal, who complies).`,
    "2x1",
    {
      title: `Distance to the ${goal}% goal`,
      description: "Points above or below the goal.",
      kind: "bar-negative",
      unit: "count",
      series: [{ key: "gap", label: "Points vs goal", tone: "info" }],
      data: byCoverage.map((company) => ({
        label: shortName(company.name),
        values: { gap: (company.coverage ?? 0) - goal },
      })),
      drills: companyGapDrills,
    },
  );

  // ---- coverage over the last twelve months
  const months = [...new Set(history.map((row) => row.periodMonth))];
  const monthCoverage = (items: readonly CoverageSnapshot[]) =>
    percentOf(
      sum(items, (row) => row.coveredDocuments),
      sum(items, (row) => row.requiredDocuments),
    ) ?? 0;
  const monthDrill = (month: string): Drill => {
    const items = history
      .filter((row) => row.periodMonth === month)
      .sort((left, right) => monthCoverage([left]) - monthCoverage([right]));
    return {
      title: `Coverage in ${formatMonth(month, "long")}`,
      description: "Worst coverage first.",
      columns: [
        { key: "company", label: "Contractor", align: "left" },
        { key: "workers", label: "Cleared", align: "right" },
        { key: "expired", label: "Expired", align: "right" },
        { key: "coverage", label: "Coverage", align: "right" },
      ],
      rows: items.map((row) => ({
        cells: {
          company: row.contractorName,
          workers: `${row.workersCleared}/${row.workersTotal}`,
          expired: String(row.expiredDocuments),
          coverage: `${monthCoverage([row])}%`,
        },
        tone: bandTone(monthCoverage([row])),
      })),
    };
  };
  const monthDrills = byLabel(months, (month) => formatMonth(month), monthDrill);
  // Points gained over the year, per contractor.
  const change = companies.map((company) => {
    const own = history.filter((row) => row.contractorId === company.id);
    const first = own.at(0);
    const last = own.at(-1);
    return { company, points: first && last ? monthCoverage([last]) - monthCoverage([first]) : 0 };
  });
  const byChange = [...change].sort((left, right) => left.points - right.points);
  const declined = byChange.at(0);
  const improved = byChange.at(-1);
  // One contractor draws its own line; several draw the whole company plus
  // the biggest faller and riser.
  const trendSeries =
    companies.length === 1 || !declined || !improved
      ? [{ key: "overall", label: "Coverage", tone: "info" as const }]
      : [
          { key: "overall", label: "All contractors", tone: "info" as const },
          { key: "improved", label: shortName(improved.company.name), tone: "success" as const },
          { key: "declined", label: shortName(declined.company.name), tone: "danger" as const },
        ];
  const trendData = months.map((month) => {
    const inMonth = history.filter((row) => row.periodMonth === month);
    const of = (id: string | undefined) => monthCoverage(inMonth.filter((row) => row.contractorId === id));
    return {
      label: formatMonth(month),
      values: {
        overall: monthCoverage(inMonth),
        ...(trendSeries.length > 1 ? { improved: of(improved?.company.id), declined: of(declined?.company.id) } : {}),
      },
    };
  });
  const trendText =
    trendSeries.length > 1
      ? "Coverage month by month over the last 12 months: all contractors, plus the one that improved the most and the one that fell the most (trend, evolution, improving, getting worse, history)."
      : "Coverage month by month over the last 12 months (trend, evolution, history).";
  const trendDescription =
    trendSeries.length > 1 ? "All contractors, the biggest riser and the biggest faller." : "The last twelve months.";
  if (months.length > 1) {
    chart(
      "chart_trend_line",
      trendText,
      "2x1",
      {
        title: "Coverage over 12 months",
        description: trendDescription,
        kind: "line",
        unit: "percent",
        series: trendSeries,
        data: trendData,
        drills: monthDrills,
      },
      "coverage_trend",
    );
    chart(
      "chart_trend_area",
      trendText,
      "2x1",
      {
        title: "Coverage over 12 months",
        description: trendDescription,
        kind: "area",
        unit: "percent",
        series: trendSeries.slice(0, 1),
        data: trendData.map((datum) => ({ label: datum.label, values: { overall: datum.values.overall } })),
        drills: monthDrills,
      },
      "coverage_trend",
    );
    if (companies.length > 1)
      chart(
        "chart_trend_change",
        "Bars above or below zero: coverage points each contractor gained or lost over the last 12 months (who improved, who got worse, year on year).",
        "2x1",
        {
          title: "Change over 12 months",
          description: `Coverage points since ${formatMonth(months[0] ?? periodMonth, "long")}.`,
          kind: "bar-negative",
          unit: "count",
          series: [{ key: "change", label: "Points", tone: "info" }],
          data: byChange.map(({ company, points }) => ({ label: shortName(company.name), values: { change: points } })),
          drills: companyGapDrills,
        },
      );
  }

  // ---- document states
  const stateData = stateKeys
    .map((state): Datum => ({ label: states[state].label, value: count(state), tone: states[state].tone }))
    .filter((datum) => datum.value > 0);
  add(
    "donut_states",
    "Donut chart: share of documents in each status (document status, distribution, pie, valid vs expired).",
    "Donut",
    "1x1",
    {
      title: "Document status",
      description: `${rows.length} documents required.`,
      centerValue: formatPercent(coverage),
      centerLabel: "coverage",
      data: stateData,
      drills: stateDrills,
    },
    "states_total",
  );
  chart(
    "chart_states_columns",
    "Count of documents in each status (document status, how many documents per status).",
    "2x1",
    {
      title: "Documents by status",
      description: `${rows.length} documents required.`,
      kind: "bar",
      unit: "count",
      series: [{ key: "count", label: "Documents", tone: "info" }],
      data: stateData.map((datum) => ({ label: datum.label, values: { count: datum.value } })),
      drills: stateDrills,
    },
    "states_total",
  );
  chart(
    "chart_states_by_company",
    "Stacked bars: document statuses broken down per contractor (statuses by contractor, gaps per company).",
    "2x1",
    {
      title: "Documents by contractor and status",
      description: "Each bar adds up the documents required from the contractor.",
      kind: "bar-stacked",
      unit: "count",
      series: stateKeys.map((state) => ({ key: state, ...states[state] })),
      data: byCoverage.map((company) => {
        const counts = countBy(company.rows, (row) => row.state);
        return {
          label: shortName(company.name),
          values: Object.fromEntries(stateKeys.map((state) => [state, counts.get(state) ?? 0])),
        };
      }),
      drills: byLabel(
        byCoverage,
        (company) => shortName(company.name),
        (company) => documentsDrill(`${company.name}: documents`, company.rows),
      ),
    },
  );

  // ---- workers
  const workerData = byCoverage.map((company) => ({
    label: shortName(company.name),
    values: { cleared: company.workersCleared, blocked: company.workersTotal - company.workersCleared },
  }));
  const workerSeries = [
    { key: "cleared", label: "Cleared", tone: "success" as const },
    { key: "blocked", label: "Not cleared", tone: "danger" as const },
  ];
  const workerDrills = byLabel(
    byCoverage,
    (company) => shortName(company.name),
    (company) => workersDrill(`${company.name}: workers`, company.id),
  );
  const workersText = "Cleared vs not cleared workers per contractor (workers cleared by contractor, workforce).";
  chart(
    "chart_workers_grouped",
    workersText,
    "2x1",
    {
      title: "Workers by contractor",
      description: "Workers assigned to active contracts.",
      kind: "bar-grouped",
      unit: "count",
      series: workerSeries,
      data: workerData,
      drills: workerDrills,
    },
    "workers_by_company",
  );
  chart(
    "chart_workers_stacked",
    workersText,
    "2x1",
    {
      title: "Workers by contractor",
      description: "Workers assigned to active contracts.",
      kind: "bar-stacked",
      unit: "count",
      series: workerSeries,
      data: workerData,
      drills: workerDrills,
    },
    "workers_by_company",
  );

  // ---- expiry over time: 4 weeks back, 12 weeks ahead
  const thisWeek = weekStart(now);
  const weeks = Array.from({ length: 16 }, (_, index) => thisWeek + (index - 4) * 7 * dayMs);
  const dated = rows.filter(
    (row) => row.expiresAt !== null && (row.state === "valid" || row.state === "expiring" || row.state === "expired"),
  );
  const expiryData = weeks.map((start) => {
    const inWeek = dated.filter((row) => weekStart(row.expiresAt ?? 0) === start);
    return {
      label: formatDate(start),
      values: {
        expired: inWeek.filter((row) => (row.expiresAt ?? 0) < now).length,
        upcoming: inWeek.filter((row) => (row.expiresAt ?? 0) >= now).length,
      },
    };
  });
  const firstWeek = weeks[0] ?? thisWeek;
  const lastWeek = weeks.at(-1) ?? thisWeek;
  const expiring = dated.filter((row) => (row.expiresAt ?? 0) >= firstWeek && (row.expiresAt ?? 0) < lastWeek + 7 * dayMs);
  const expiryDrills = byLabel(
    weeks,
    (start) => formatDate(start),
    (start) =>
      documentsDrill(
        `Expiring in the week of ${formatDate(start)}`,
        dated.filter((row) => weekStart(row.expiresAt ?? 0) === start),
      ),
  );
  const expirySeries = [
    { key: "expired", label: "Expired", tone: "danger" as const },
    { key: "upcoming", label: "Expiring", tone: "warning" as const },
  ];
  const expiryText =
    "Documents expiring per week, from 4 weeks ago to 12 weeks ahead (expirations over time, renewal calendar, coming weeks).";
  for (const [id, kind] of [
    ["chart_expiry_area", "area"],
    ["chart_expiry_line", "line"],
    ["chart_expiry_columns", "bar-stacked"],
  ] as const)
    chart(
      id,
      expiryText,
      "3x1",
      {
        title: "Expirations by week",
        description: "Four weeks back and twelve ahead.",
        kind,
        unit: "count",
        series: expirySeries,
        data: expiryData,
        drills: expiryDrills,
      },
      "expiry_timeline",
    );

  // ---- document types
  chart(
    "chart_requirements_radar",
    "Radar: coverage percentage of each of the most required document types (compliance by document type, strengths and weaknesses).",
    "1x1",
    {
      title: "Coverage by document type",
      description: "The most required documents.",
      kind: "radar",
      unit: "percent",
      series: [{ key: "coverage", label: "Coverage", tone: "info" }],
      data: topRequirements.slice(0, 6).map((requirement) => {
        const owed = rows.filter((row) => row.requirementTitle === requirement);
        return {
          label: shortTitle(requirement, 14),
          values: { coverage: percentOf(covered(owed), owed.length) ?? 0 },
        };
      }),
      drills: byLabel(
        topRequirements.slice(0, 6),
        (requirement) => shortTitle(requirement, 14),
        (requirement) =>
          documentsDrill(
            requirement,
            openRows.filter((row) => row.requirementTitle === requirement),
          ),
      ),
    },
  );
  add(
    "list_gaps_by_requirement",
    "Ranked list: document types with the most open gaps (gaps by document type, most unmet requirements).",
    "BarList",
    "1x2",
    {
      title: "Documents with the most gaps",
      description: "Expired, rejected, in review or not uploaded.",
      unit: "count",
      data: [...countBy(openRows, (row) => row.requirementTitle)]
        .sort((left, right) => right[1] - left[1])
        .slice(0, 10)
        .map(([label, value]) => ({ label, value, tone: "danger" as const })),
      drills: byLabel(
        [...new Set(openRows.map((row) => row.requirementTitle))],
        (requirement) => requirement,
        (requirement) =>
          documentsDrill(
            requirement,
            openRows.filter((row) => row.requirementTitle === requirement),
          ),
      ),
    },
  );
  add("list_gaps_by_site", "Ranked list: open gaps per work site (gaps by site, farm, plant).", "BarList", "1x1", {
    title: "Gaps by site",
    description: "Open documents at each site.",
    unit: "count",
    data: [...countBy(openRows, (row) => row.siteName)]
      .sort((left, right) => right[1] - left[1])
      .map(([label, value]) => ({ label, value, tone: "warning" as const })),
    drills: byLabel(
      [...new Set(openRows.map((row) => row.siteName))],
      (site) => site,
      (site) =>
        documentsDrill(
          `Gaps at ${site}`,
          openRows.filter((row) => row.siteName === site),
        ),
    ),
  });
  add(
    "heatmap_company_requirement",
    "Heatmap matrix: coverage of each contractor (rows) for each document type (columns) (matrix, heat map, who owes which document).",
    "Heatmap",
    byCoverage.length <= 5 ? "3x1" : "3x2",
    {
      title: "Coverage by contractor and document",
      description: "Each cell: share of that document up to date. Empty when not required.",
      columns: topRequirements.map((requirement) => shortTitle(requirement)),
      rows: byCoverage.map((company) => ({
        label: shortName(company.name),
        cells: topRequirements.map((requirement) => {
          const owed = company.rows.filter((row) => row.requirementTitle === requirement);
          return percentOf(covered(owed), owed.length);
        }),
      })),
      drills: Object.fromEntries(
        byCoverage.flatMap((company) =>
          topRequirements.map((requirement) => [
            `${shortName(company.name)}::${shortTitle(requirement)}`,
            documentsDrill(
              `${company.name} · ${requirement}`,
              company.rows.filter((row) => row.requirementTitle === requirement),
            ),
          ]),
        ),
      ),
    },
  );

  // ---- tables
  const table = (
    id: string,
    description: string,
    props: {
      title: string;
      description: string;
      columns: { key: string; label: string; align: "left" | "right" }[];
      rows: { cells: Record<string, string>; tone: Tone | null }[];
      emptyText: string;
    },
  ) =>
    add(
      id,
      // Telling the model a table is empty keeps it from spending a row on nothing.
      `Table: ${description}${props.rows.length ? "" : " Currently empty."}`,
      "DataTable",
      "3x1",
      {
        ...props,
        description: `${props.description}${moreText(props.rows.length)}`,
        rows: props.rows.slice(0, TABLE_ROWS),
      },
    );
  const companyColumn = { key: "company", label: "Contractor", align: "left" as const };
  const requirementColumn = { key: "requirement", label: "Document", align: "left" as const };
  const subjectColumn = { key: "subject", label: "For", align: "left" as const };
  const stateColumn = { key: "state", label: "Status", align: "right" as const };
  const gapCells = (row: Row) => ({
    cells: {
      company: row.contractorName,
      requirement: row.requirementTitle,
      subject: subjectOf(row),
      state: states[row.state].label,
    },
    tone: states[row.state].tone,
  });

  table("table_expiring", "expired and soon-to-expire documents with dates (expired and expiring, renew).", {
    title: "Expired and expiring",
    description: "By expiry date.",
    columns: [companyColumn, requirementColumn, subjectColumn, { key: "date", label: "Expires", align: "right" }],
    rows: rows
      .filter((row) => row.state === "expired" || row.state === "expiring")
      .sort((left, right) => (left.expiresAt ?? 0) - (right.expiresAt ?? 0))
      .map((row) => ({
        cells: {
          company: row.contractorName,
          requirement: row.requirementTitle,
          subject: subjectOf(row),
          date: row.expiresAt === null ? "—" : formatDate(row.expiresAt),
        },
        tone: states[row.state].tone,
      })),
    emptyText: "No expired or expiring documents.",
  });
  const blockedWorkers = [
    ...Map.groupBy(
      openRows.filter((row) => row.scope === "worker" && row.workerId),
      (row) => `${row.workerId}:${row.contractId}`,
    ).values(),
  ].sort((left, right) => right.length - left.length);
  table(
    "table_blocked_workers",
    "workers who are not cleared and the documents they are missing (workers not cleared, blocked, why).",
    {
      title: "Workers not cleared",
      description: "With the documents they are missing.",
      columns: [
        { key: "worker", label: "Worker", align: "left" },
        companyColumn,
        { key: "missing", label: "Missing", align: "left" },
        { key: "count", label: "Open", align: "right" },
      ],
      rows: blockedWorkers.flatMap((open) => {
        const first = open[0];
        return first
          ? [
              {
                cells: {
                  worker: first.workerName ?? "Worker",
                  company: first.contractorName,
                  missing: open
                    .slice(0, 2)
                    .map((row) => `${row.requirementTitle} (${states[row.state].label.toLowerCase()})`)
                    .join(", "),
                  count: String(open.length),
                },
                tone: "danger" as const,
              },
            ]
          : [];
      }),
      emptyText: "Every worker is cleared.",
    },
  );
  table("table_review_queue", "documents waiting for you to approve or reject (review queue, to approve).", {
    title: "Waiting for your review",
    description: "Uploaded documents that need a decision.",
    columns: [companyColumn, requirementColumn, subjectColumn],
    rows: rows.filter((row) => row.state === "in_review").map((row) => ({ ...gapCells(row), tone: null })),
    emptyText: "No documents waiting for review.",
  });
  table("table_rejected", "rejected documents the contractor must correct (rejected, corrections).", {
    title: "Rejected",
    description: "The contractor must upload them again.",
    columns: [companyColumn, requirementColumn, subjectColumn, stateColumn],
    rows: rows.filter((row) => row.state === "rejected").map(gapCells),
    emptyText: "No rejected documents.",
  });
  table(
    "table_contracts",
    "every contract with its contractor, work site, coverage and cleared workers (contracts, detail by contract).",
    {
      title: "Contracts",
      description: "Worst coverage first.",
      columns: [
        { key: "contract", label: "Contract", align: "left" },
        companyColumn,
        { key: "site", label: "Site", align: "left" },
        { key: "workers", label: "Cleared", align: "right" },
        { key: "coverage", label: "Coverage", align: "right" },
      ],
      rows: contractsDrill.rows,
      emptyText: "No active contracts.",
    },
  );
  table("table_priority", "the most urgent open gaps to resolve first (resolve first, priorities, what to do today, actions).", {
    title: "Resolve first",
    description: "Open gaps by operational priority.",
    columns: [companyColumn, requirementColumn, subjectColumn, stateColumn],
    rows: [...openRows]
      .sort((left, right) => left.priorityTier - right.priorityTier || left.updatedAt - right.updatedAt)
      .map(gapCells),
    emptyText: "No open gaps.",
  });

  if (obligations.length)
    add(
      "callout_withholding",
      "Callout: contracts where withholding payment is recommended because of unmet labour obligations (withholding, payroll, labour risk).",
      "Callout",
      "3x1",
      {
        title: "Contracts with unmet labour obligations",
        tone: withholdings ? "danger" : "warning",
        items: obligations.map(
          (signal) =>
            `${signal.contractLabel}: ${signal.unmetWorkerCount} workers and ${signal.unmetCompanyRequirementCount} company documents outstanding${signal.withholdingRecommended ? " — withholding recommended" : ""}.`,
        ),
      },
    );

  // ---- one card and one gap table per contractor
  for (const company of companies) {
    const counts = countBy(company.rows, (row) => row.state);
    add(
      `card_${company.id}`,
      `Contractor card for "${company.name}": its coverage, contracts, cleared workers and document statuses.`,
      "ContractorCard",
      "1x1",
      {
        name: company.name,
        coverage: company.coverage,
        contracts: company.contracts,
        workersCleared: company.workersCleared,
        workersTotal: company.workersTotal,
        states: stateKeys
          .map((state): Datum => ({ label: states[state].label, value: counts.get(state) ?? 0, tone: states[state].tone }))
          .filter((datum) => datum.value > 0),
        drill: companyGaps(company),
      },
    );
    const open = company.rows.filter((row) => isOpen(row.state));
    table(`table_${company.id}`, `open gaps of "${company.name}" only.`, {
      title: `${company.name}: open gaps`,
      description: `${open.length} open documents.`,
      columns: [requirementColumn, subjectColumn, stateColumn],
      rows: open.map(gapCells),
      emptyText: "No open gaps.",
    });
  }

  // ---- every chart's title icon opens all of its records
  const allDocuments = documentsDrill("Documents required", rows);
  const allWorkers = workersDrill("Workers");
  const openGaps = documentsDrill("Open gaps", openRows);
  const expirations = documentsDrill("Expirations", expiring);
  const latestMonth = months.at(-1);
  const wholeDrills: Record<string, Drill> = {
    chart_coverage_bars: companiesDrill,
    chart_coverage_columns: companiesDrill,
    chart_coverage_radar: companiesDrill,
    list_coverage: companiesDrill,
    chart_gap_to_goal: companiesDrill,
    chart_trend_change: companiesDrill,
    ...(latestMonth ? { chart_trend_line: monthDrill(latestMonth), chart_trend_area: monthDrill(latestMonth) } : {}),
    donut_states: allDocuments,
    chart_states_columns: allDocuments,
    chart_states_by_company: allDocuments,
    chart_workers_grouped: allWorkers,
    chart_workers_stacked: allWorkers,
    chart_expiry_area: expirations,
    chart_expiry_line: expirations,
    chart_expiry_columns: expirations,
    chart_requirements_radar: documentsDrill(
      "Most required documents",
      rows.filter((row) => topRequirements.slice(0, 6).includes(row.requirementTitle)),
    ),
    list_gaps_by_requirement: openGaps,
    list_gaps_by_site: openGaps,
    heatmap_company_requirement: documentsDrill(
      "Most required documents",
      rows.filter((row) => topRequirements.includes(row.requirementTitle)),
    ),
  };
  for (const candidate of candidates)
    if (["Chart", "Donut", "BarList", "Heatmap"].includes(candidate.element.type))
      candidate.element.props.drill = wholeDrills[candidate.id] ?? null;

  return candidates;
}

/** What the layout model is told about this app, besides the candidate list. */
export const composerGuidance = {
  context: {
    platform:
      "Chartpilot Visualize: a client company (a salmon farming operator) checks the compliance documents of its contractors and their workers. Every number and list is prepared.",
  },
  instructions: {
    root: "Always use Page as the root.",
    next: "Build a dashboard, not a single chart: a new dashboard has one headline strip and three to six more widgets that answer the request from different angles, with at most one table, and nothing unrelated. For example: contractors at risk gets the coverage ranking, the distance to goal, the 12-month change and the resolve-first table; expirations get the documents strip, the weekly expiry chart and the expired-and-expiring table; one contractor gets its card, the 12-month trend, its document statuses and its gaps table; workers get the operations strip, workers by contractor and the workers-not-cleared table; a summary for management gets the summary strip, the coverage gauge, coverage by contractor, the 12-month trend and the document status donut. When the user names a chart type (bars, columns, lines, area, radar, pie, donut, gauge, heatmap), pick the variant drawn that way. When context.current_dashboard lists widgets, the request edits that dashboard: keep every one of them unless the request removes or replaces it, and change only what it asks for.",
    parent: "Every widget goes directly in the Page. Put one headline strip first, then gauges and charts, then tables.",
  },
};
