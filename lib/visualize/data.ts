// The figures a dashboard is built from, read from the database. Server only:
// the page passes them to the browser, which builds the same candidates.
import {
  asOf,
  clientCompany,
  contractCoverage,
  contractorsCoverageHistory,
  contractsWithUnmetObligations,
  currentPeriodMonth,
  documentStatuses,
  workerClearance,
} from "@/lib/db";
import type { BuilderInput } from "./candidates";

export function builderInput(): BuilderInput {
  return {
    title: clientCompany().name,
    now: asOf,
    periodMonth: currentPeriodMonth,
    contracts: contractCoverage(),
    documents: documentStatuses(),
    workers: workerClearance(),
    history: contractorsCoverageHistory(currentPeriodMonth, 12),
    obligations: contractsWithUnmetObligations(),
  };
}
