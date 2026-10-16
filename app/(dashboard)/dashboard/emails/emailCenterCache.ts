"use client"

import { createSessionResource } from "@/lib/sessionCache"
import type { Company, KraEmailCredentials } from "../companies/database"
import type { AccountRow, CaseRow, CategoryOption, CompanyOption, EmailRow, RuleRow, StaffOption } from "./components/shared"

/**
 * Everything the Email Center page shows, kept for the browser session (see lib/sessionCache.ts).
 *
 * The page loads the overview, every case, three email tabs, the rules, the company list and the KRA
 * credentials on open. Leaving and coming back used to repeat all of it behind a full-page spinner;
 * now the page starts from this snapshot and refreshes it in the background.
 *
 * The page owns the fetching (its loaders also feed toasts, the OAuth-return flow and Sync), so this
 * is a store it writes through to rather than a resource with its own fetcher - which is why the
 * fetcher below is never meant to run. It is still a session resource so logout clears it.
 */
export interface EmailCenterSnapshot {
  accounts: AccountRow[]
  latestEmailAt: string | null
  companies: CompanyOption[]
  staff: StaffOption[]
  categories: CategoryOption[]
  cases: CaseRow[]
  emails: EmailRow[]
  rules: RuleRow[]
  rulesSource: "database" | "builtin"
  fullCompanies: Company[]
  kraCredentials: Map<string, KraEmailCredentials>
}

export const emailCenterCache = createSessionResource<EmailCenterSnapshot>(async () => {
  throw new Error("emailCenterCache is written by the Email Center page, not fetched")
})
