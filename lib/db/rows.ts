// Row types for db/schema.sql, one per table, as a Postgres driver would
// return them: dates and timestamps as ISO strings, NULL as null.

export type ServiceType =
  "diving" | "logistics" | "net_maintenance" | "catering" | "security" | "electrical" | "boat_transport" | "cleaning";
export type RequirementScope = "company" | "worker";
export type ContractStatus = "active" | "ended";
export type AssignmentStatus = "active" | "ended";
export type SubmissionStatus = "approved" | "pending" | "rejected" | "missing" | "expired";

export type ClientCompanyRow = { id: string; name: string; tax_id: string; industry: string };

export type WorkSiteRow = { id: string; client_company_id: string; name: string; region: string };

export type ContractorRow = {
  id: string;
  client_company_id: string;
  name: string;
  service: ServiceType;
  tax_id: string;
  contact_email: string;
};

export type ContractRow = {
  id: string;
  contractor_id: string;
  work_site_id: string;
  label: string;
  status: ContractStatus;
  starts_on: string;
  ends_on: string | null;
};

export type WorkerRow = { id: string; contractor_id: string; full_name: string; role: string };

export type WorkerAssignmentRow = {
  id: string;
  worker_id: string;
  contract_id: string;
  status: AssignmentStatus;
  started_on: string;
  ended_on: string | null;
};

export type RequirementRow = {
  id: string;
  title: string;
  scope: RequirementScope;
  service: ServiceType | null;
  renewal_months: number | null;
  priority_tier: 1 | 2 | 3 | 4 | 5;
  labour_obligation: boolean;
};

export type DocumentSubmissionRow = {
  id: string;
  contract_id: string;
  requirement_id: string;
  worker_id: string | null;
  status: SubmissionStatus;
  submitted_at: string | null;
  reviewed_at: string | null;
  expires_on: string | null;
  rejection_reason: string | null;
  updated_at: string;
};

export type MonthlySnapshotRow = {
  contractor_id: string;
  period_month: string;
  required_documents: number;
  covered_documents: number;
  expired_documents: number;
  workers_cleared: number;
  workers_total: number;
};
