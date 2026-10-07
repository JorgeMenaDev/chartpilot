// The pretend Postgres: loads db/seed/*.json at import and answers the
// queries the app needs. Each function's comment holds the SQL it stands in
// for, so moving to a real database means running db/schema.sql and
// reimplementing these functions with a Postgres client.
import clientCompaniesJson from "@/db/seed/client_companies.json";
import contractorsJson from "@/db/seed/contractors.json";
import contractsJson from "@/db/seed/contracts.json";
import documentSubmissionsJson from "@/db/seed/document_submissions.json";
import monthlySnapshotsJson from "@/db/seed/monthly_snapshots.json";
import requirementsJson from "@/db/seed/requirements.json";
import workSitesJson from "@/db/seed/work_sites.json";
import workerAssignmentsJson from "@/db/seed/worker_assignments.json";
import workersJson from "@/db/seed/workers.json";
import type {
  ClientCompanyRow,
  ContractorRow,
  ContractRow,
  DocumentSubmissionRow,
  MonthlySnapshotRow,
  RequirementRow,
  RequirementScope,
  SubmissionStatus,
  WorkerAssignmentRow,
  WorkerRow,
  WorkSiteRow,
} from "./rows";

// JSON imports widen enums to string; the rows follow db/schema.sql.
const clientCompanies = clientCompaniesJson as ClientCompanyRow[];
const workSites = workSitesJson as WorkSiteRow[];
const contractors = contractorsJson as ContractorRow[];
const contracts = contractsJson as ContractRow[];
const workers = workersJson as WorkerRow[];
const workerAssignments = workerAssignmentsJson as WorkerAssignmentRow[];
const requirements = requirementsJson as RequirementRow[];
const documentSubmissions = documentSubmissionsJson as DocumentSubmissionRow[];
const monthlySnapshots = monthlySnapshotsJson as MonthlySnapshotRow[];

/**
 * The seed is a frozen copy of the database taken on this day, so "today"
 * is pinned to it and the stories in the data (what expires soon) hold. A
 * live database would use now().
 */
export const asOf = Date.UTC(2026, 9, 7);
/** The month the figures describe, YYYY-MM. */
export const currentPeriodMonth = new Date(asOf).toISOString().slice(0, 7);

const byId = <T extends { id: string }>(rows: readonly T[]) => new Map(rows.map((row) => [row.id, row]));
const contractorById = byId(contractors);
const siteById = byId(workSites);
const workerById = byId(workers);
const requirementById = byId(requirements);
const activeContracts = contracts.filter((contract) => contract.status === "active");
const activeContractIds = new Set(activeContracts.map((contract) => contract.id));
const activeAssignments = workerAssignments.filter(
  (assignment) => assignment.status === "active" && activeContractIds.has(assignment.contract_id),
);
const activePlacements = new Set(activeAssignments.map((assignment) => `${assignment.worker_id}:${assignment.contract_id}`));

// status = 'approved' AND (expires_on IS NULL OR expires_on >= current_date)
const isCovered = (row: DocumentSubmissionRow) =>
  row.status === "approved" && (row.expires_on === null || Date.parse(row.expires_on) >= asOf);

/**
 * Documents owed today: company documents of active contracts and worker
 * documents of active assignments.
 *
 *   SELECT d.* FROM document_submissions d
 *   JOIN contracts c ON c.id = d.contract_id AND c.status = 'active'
 *   LEFT JOIN worker_assignments a ON a.worker_id = d.worker_id AND a.contract_id = d.contract_id
 *   WHERE d.worker_id IS NULL OR a.status = 'active'
 */
const owedDocuments = documentSubmissions.filter(
  (row) =>
    activeContractIds.has(row.contract_id) &&
    (row.worker_id === null || activePlacements.has(`${row.worker_id}:${row.contract_id}`)),
);

const required = <T>(value: T | undefined, what: string): T => {
  if (value === undefined) throw new Error(`Seed data is missing ${what}`);
  return value;
};

/** SELECT * FROM client_companies LIMIT 1 */
export function clientCompany() {
  return required(clientCompanies[0], "a client company");
}

export type DocumentStatus = {
  id: string;
  contractorId: string;
  contractorName: string;
  contractId: string;
  siteName: string;
  requirementTitle: string;
  scope: RequirementScope;
  workerId: string | null;
  workerName: string | null;
  status: SubmissionStatus;
  /** Epoch ms, or null for documents that never expire. */
  expiresAt: number | null;
  priorityTier: RequirementRow["priority_tier"];
  updatedAt: number;
};

/**
 * Every document owed today, with its contractor, site, requirement and worker.
 *
 *   SELECT d.id, k.id, k.name, c.id, s.name, r.title, r.scope, w.id, w.full_name,
 *          d.status, d.expires_on, r.priority_tier, d.updated_at
 *   FROM owed_documents d
 *   JOIN contracts c ON c.id = d.contract_id
 *   JOIN contractors k ON k.id = c.contractor_id
 *   JOIN work_sites s ON s.id = c.work_site_id
 *   JOIN requirements r ON r.id = d.requirement_id
 *   LEFT JOIN workers w ON w.id = d.worker_id
 */
export function documentStatuses(): DocumentStatus[] {
  const contractById = byId(contracts);
  return owedDocuments.map((row) => {
    const contract = required(contractById.get(row.contract_id), `contract ${row.contract_id}`);
    const contractor = required(contractorById.get(contract.contractor_id), `contractor ${contract.contractor_id}`);
    const requirement = required(requirementById.get(row.requirement_id), `requirement ${row.requirement_id}`);
    const worker = row.worker_id === null ? null : required(workerById.get(row.worker_id), `worker ${row.worker_id}`);
    return {
      id: row.id,
      contractorId: contractor.id,
      contractorName: contractor.name,
      contractId: contract.id,
      siteName: required(siteById.get(contract.work_site_id), `site ${contract.work_site_id}`).name,
      requirementTitle: requirement.title,
      scope: requirement.scope,
      workerId: worker?.id ?? null,
      workerName: worker?.full_name ?? null,
      status: row.status,
      expiresAt: row.expires_on === null ? null : Date.parse(row.expires_on),
      priorityTier: requirement.priority_tier,
      updatedAt: Date.parse(row.updated_at),
    };
  });
}

export type Clearance = "cleared" | "pending" | "blocked";

export type WorkerClearance = {
  workerId: string;
  fullName: string;
  role: string;
  contractorId: string;
  contractorName: string;
  contractId: string;
  /** cleared: every worker document covered; blocked: one expired or rejected. */
  clearance: Clearance;
};

/**
 * Whether each actively assigned worker may work today.
 *
 *   SELECT a.*, CASE
 *     WHEN bool_and(covered) THEN 'cleared'
 *     WHEN bool_or(d.status IN ('expired', 'rejected')) THEN 'blocked'
 *     ELSE 'pending' END
 *   FROM worker_assignments a JOIN owed_documents d USING (worker_id, contract_id)
 *   WHERE a.status = 'active' GROUP BY a.id
 */
export function workerClearance(): WorkerClearance[] {
  const contractById = byId(contracts);
  return activeAssignments.map((assignment) => {
    const worker = required(workerById.get(assignment.worker_id), `worker ${assignment.worker_id}`);
    const contract = required(contractById.get(assignment.contract_id), `contract ${assignment.contract_id}`);
    const open = owedDocuments.filter((row) => row.worker_id === worker.id && row.contract_id === contract.id && !isCovered(row));
    return {
      workerId: worker.id,
      fullName: worker.full_name,
      role: worker.role,
      contractorId: worker.contractor_id,
      contractorName: required(contractorById.get(worker.contractor_id), `contractor ${worker.contractor_id}`).name,
      contractId: contract.id,
      clearance:
        open.length === 0
          ? "cleared"
          : open.some((row) => row.status === "expired" || row.status === "rejected")
            ? "blocked"
            : "pending",
    };
  });
}

export type ContractCoverage = {
  contractId: string;
  label: string;
  contractorId: string;
  contractorName: string;
  siteName: string;
  requiredDocuments: number;
  coveredDocuments: number;
  workersCleared: number;
  workersTotal: number;
};

/**
 * Document coverage and cleared workers of each active contract.
 *
 *   SELECT c.id, c.label, k.id, k.name, s.name,
 *          count(d.*), count(d.*) FILTER (WHERE covered),
 *          count(cl.*) FILTER (WHERE cl.clearance = 'cleared'), count(cl.*)
 *   FROM contracts c JOIN contractors k ... JOIN work_sites s ...
 *   LEFT JOIN owed_documents d ON d.contract_id = c.id
 *   LEFT JOIN worker_clearance cl ON cl.contract_id = c.id
 *   WHERE c.status = 'active' GROUP BY c.id, k.id, s.id
 */
export function contractCoverage(): ContractCoverage[] {
  const clearance = workerClearance();
  return activeContracts.map((contract) => {
    const documents = owedDocuments.filter((row) => row.contract_id === contract.id);
    const placed = clearance.filter((entry) => entry.contractId === contract.id);
    return {
      contractId: contract.id,
      label: contract.label,
      contractorId: contract.contractor_id,
      contractorName: required(contractorById.get(contract.contractor_id), `contractor ${contract.contractor_id}`).name,
      siteName: required(siteById.get(contract.work_site_id), `site ${contract.work_site_id}`).name,
      requiredDocuments: documents.length,
      coveredDocuments: documents.filter(isCovered).length,
      workersCleared: placed.filter((entry) => entry.clearance === "cleared").length,
      workersTotal: placed.length,
    };
  });
}

export type CoverageSnapshot = {
  contractorId: string;
  contractorName: string;
  /** YYYY-MM */
  periodMonth: string;
  requiredDocuments: number;
  coveredDocuments: number;
  expiredDocuments: number;
  workersCleared: number;
  workersTotal: number;
};

/**
 * Each contractor's monthly figures for the last `months` months up to `periodMonth`.
 *
 *   SELECT s.*, k.name FROM monthly_snapshots s JOIN contractors k ON k.id = s.contractor_id
 *   WHERE s.period_month >  ($1::date - make_interval(months => $2))
 *     AND s.period_month <= $1::date
 *   ORDER BY s.period_month, k.name
 */
export function contractorsCoverageHistory(periodMonth: string, months: number): CoverageSnapshot[] {
  const [year = 0, month = 1] = periodMonth.split("-").map(Number);
  const from = new Date(Date.UTC(year, month - 1 - months, 1)).toISOString().slice(0, 7);
  return monthlySnapshots
    .map((row) => ({ row, period: row.period_month.slice(0, 7) }))
    .filter(({ period }) => period > from && period <= periodMonth)
    .map(({ row, period }) => ({
      contractorId: row.contractor_id,
      contractorName: required(contractorById.get(row.contractor_id), `contractor ${row.contractor_id}`).name,
      periodMonth: period,
      requiredDocuments: row.required_documents,
      coveredDocuments: row.covered_documents,
      expiredDocuments: row.expired_documents,
      workersCleared: row.workers_cleared,
      workersTotal: row.workers_total,
    }))
    .sort(
      (left, right) =>
        left.periodMonth.localeCompare(right.periodMonth) || left.contractorName.localeCompare(right.contractorName),
    );
}

export type UnmetObligations = {
  contractId: string;
  contractLabel: string;
  contractorName: string;
  unmetWorkerCount: number;
  unmetCompanyRequirementCount: number;
  /** A company-level labour document (payroll proof) is not covered. */
  withholdingRecommended: boolean;
};

/**
 * Contracts with uncovered labour obligations, the grounds to withhold payment.
 *
 *   SELECT c.id, c.label, k.name,
 *          count(DISTINCT d.worker_id) FILTER (WHERE r.scope = 'worker'),
 *          count(*) FILTER (WHERE r.scope = 'company'),
 *          bool_or(r.scope = 'company')
 *   FROM owed_documents d JOIN requirements r ON r.id = d.requirement_id AND r.labour_obligation
 *   JOIN contracts c ... JOIN contractors k ...
 *   WHERE NOT covered GROUP BY c.id, k.name
 */
export function contractsWithUnmetObligations(): UnmetObligations[] {
  return activeContracts.flatMap((contract) => {
    const unmet = owedDocuments.filter(
      (row) => row.contract_id === contract.id && requirementById.get(row.requirement_id)?.labour_obligation && !isCovered(row),
    );
    if (unmet.length === 0) return [];
    const companyCount = unmet.filter((row) => row.worker_id === null).length;
    return [
      {
        contractId: contract.id,
        contractLabel: contract.label,
        contractorName: required(contractorById.get(contract.contractor_id), `contractor ${contract.contractor_id}`).name,
        unmetWorkerCount: new Set(unmet.flatMap((row) => (row.worker_id ? [row.worker_id] : []))).size,
        unmetCompanyRequirementCount: companyCount,
        withholdingRecommended: companyCount > 0,
      },
    ];
  });
}
