-- Chartpilot's pretend database: contractor compliance for one client company.
-- There is no Postgres server. Each table below has a JSON file of rows in
-- db/seed/<table>.json, and lib/db loads them and answers the same questions
-- this schema would. Swapping in real Postgres means running this file and
-- reimplementing lib/db's query functions as SQL.

CREATE TYPE service_type AS ENUM (
  'diving', 'logistics', 'net_maintenance', 'catering',
  'security', 'electrical', 'boat_transport', 'cleaning'
);
CREATE TYPE requirement_scope AS ENUM ('company', 'worker');
CREATE TYPE contract_status AS ENUM ('active', 'ended');
CREATE TYPE assignment_status AS ENUM ('active', 'ended');
-- pending: uploaded, waiting for the client company's review.
-- missing: requested, never uploaded.
CREATE TYPE submission_status AS ENUM ('approved', 'pending', 'rejected', 'missing', 'expired');

-- The company that hires the contractors and checks their documents.
CREATE TABLE client_companies (
  id        text PRIMARY KEY,
  name      text NOT NULL,
  tax_id    text NOT NULL UNIQUE,
  industry  text NOT NULL
);

-- Farms and plants where contractors work.
CREATE TABLE work_sites (
  id                 text PRIMARY KEY,
  client_company_id  text NOT NULL REFERENCES client_companies (id),
  name               text NOT NULL,
  region             text NOT NULL
);

CREATE TABLE contractors (
  id                 text PRIMARY KEY,
  client_company_id  text NOT NULL REFERENCES client_companies (id),
  name               text NOT NULL,
  service            service_type NOT NULL,
  tax_id             text NOT NULL UNIQUE,
  contact_email      text NOT NULL
);

CREATE TABLE contracts (
  id             text PRIMARY KEY,
  contractor_id  text NOT NULL REFERENCES contractors (id),
  work_site_id   text NOT NULL REFERENCES work_sites (id),
  label          text NOT NULL,
  status         contract_status NOT NULL,
  starts_on      date NOT NULL,
  ends_on        date,
  CHECK (ends_on IS NULL OR ends_on > starts_on)
);
CREATE INDEX contracts_contractor_idx ON contracts (contractor_id);

CREATE TABLE workers (
  id             text PRIMARY KEY,
  contractor_id  text NOT NULL REFERENCES contractors (id),
  full_name      text NOT NULL,
  role           text NOT NULL
);
CREATE INDEX workers_contractor_idx ON workers (contractor_id);

-- A worker placed on one of their employer's contracts.
CREATE TABLE worker_assignments (
  id           text PRIMARY KEY,
  worker_id    text NOT NULL REFERENCES workers (id),
  contract_id  text NOT NULL REFERENCES contracts (id),
  status       assignment_status NOT NULL,
  started_on   date NOT NULL,
  ended_on     date,
  UNIQUE (worker_id, contract_id),
  CHECK ((status = 'ended') = (ended_on IS NOT NULL))
);
CREATE INDEX worker_assignments_contract_idx ON worker_assignments (contract_id) WHERE status = 'active';

-- The documents the client company asks for. A company-scope requirement is
-- owed once per contract, a worker-scope one once per assigned worker. A
-- requirement with a service applies only to contractors of that service.
CREATE TABLE requirements (
  id                text PRIMARY KEY,
  title             text NOT NULL UNIQUE,
  scope             requirement_scope NOT NULL,
  service           service_type,
  -- How long an approved document stays valid; NULL never expires.
  renewal_months    integer CHECK (renewal_months > 0),
  -- 1 blocks work outright, 5 is paperwork.
  priority_tier     smallint NOT NULL CHECK (priority_tier BETWEEN 1 AND 5),
  -- Proof the contractor pays and employs its workers lawfully. Unmet ones
  -- can justify withholding the contractor's payment.
  labour_obligation boolean NOT NULL DEFAULT false
);

-- The current state of each document owed: one row per contract, requirement
-- and (for worker-scope requirements) worker.
CREATE TABLE document_submissions (
  id                text PRIMARY KEY,
  contract_id       text NOT NULL REFERENCES contracts (id),
  requirement_id    text NOT NULL REFERENCES requirements (id),
  worker_id         text REFERENCES workers (id),
  status            submission_status NOT NULL,
  submitted_at      timestamptz,
  reviewed_at       timestamptz,
  expires_on        date,
  rejection_reason  text,
  updated_at        timestamptz NOT NULL,
  UNIQUE NULLS NOT DISTINCT (contract_id, requirement_id, worker_id),
  CHECK ((status = 'missing') = (submitted_at IS NULL)),
  CHECK ((status = 'rejected') = (rejection_reason IS NOT NULL)),
  CHECK (status <> 'expired' OR expires_on IS NOT NULL)
);
CREATE INDEX document_submissions_contract_idx ON document_submissions (contract_id);
CREATE INDEX document_submissions_expiry_idx ON document_submissions (expires_on) WHERE status = 'approved';

-- One row per contractor and month, written by a nightly job at month end
-- (the current month holds today's figures), so trends need no history scan.
CREATE TABLE monthly_snapshots (
  contractor_id       text NOT NULL REFERENCES contractors (id),
  period_month        date NOT NULL CHECK (extract(day FROM period_month) = 1),
  required_documents  integer NOT NULL CHECK (required_documents >= 0),
  covered_documents   integer NOT NULL CHECK (covered_documents BETWEEN 0 AND required_documents),
  expired_documents   integer NOT NULL CHECK (expired_documents >= 0),
  workers_cleared     integer NOT NULL CHECK (workers_cleared >= 0),
  workers_total       integer NOT NULL CHECK (workers_cleared <= workers_total),
  PRIMARY KEY (contractor_id, period_month)
);
