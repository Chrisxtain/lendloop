"use client";

import { Suspense } from "react";
import { useQuery } from "convex/react";
import { ShieldWarning } from "@phosphor-icons/react";
import { api } from "../../../../convex/_generated/api";
import { EmptyState, PageHeader, Skeleton } from "@/components/ui";
import { Members } from "@/components/admin/Members";
import { Listings } from "@/components/admin/Listings";
import { Loans } from "@/components/admin/Loans";
import { AutomationErrors } from "@/components/admin/AutomationErrors";
import { AuditLog } from "@/components/admin/AuditLog";
import { useQueryParam } from "@/hooks/useQueryParam";

type Tab = "members" | "listings" | "loans" | "automation" | "audit";
const TABS: { id: Tab; label: string }[] = [
  { id: "members", label: "Members" },
  { id: "listings", label: "Listings" },
  { id: "loans", label: "All loans" },
  { id: "automation", label: "Automation errors" },
  { id: "audit", label: "Audit log" },
];

export default function AdminPage() {
  // useSearchParams needs a Suspense boundary in the App Router.
  return (
    <Suspense fallback={<Skeleton className="h-64" />}>
      <Admin />
    </Suspense>
  );
}

const isTab = (v: string | null): v is Tab => TABS.some((t) => t.id === v);

function Admin() {
  const me = useQuery(api.users.me);
  // The tab lives in the URL (?tab=automation) so admins can link straight to it.
  const [tabParam, setTabParam] = useQueryParam("tab");
  const tab: Tab = isTab(tabParam) ? tabParam : "members";
  const setTab = (t: Tab) => setTabParam(t === "members" ? null : t);
  const isAdmin = me?.role === "admin";
  // Skipped (not run) for non-admins, so the open-error badge never errors for them.
  const errors = useQuery(api.admin.listAutomationErrors, isAdmin ? {} : "skip");
  const openErrors = errors?.filter((e) => !e.resolvedAt).length ?? 0;

  // The UI check is cosmetic. Every admin query/mutation re-checks the role in Convex.
  if (me === undefined) return <Skeleton className="h-64" />;
  if (!isAdmin) {
    return <EmptyState icon={<ShieldWarning size={28} />} title="Admins only" body="This area is for neighbourhood admins." />;
  }

  return (
    <>
      <PageHeader title="Admin" subtitle="Keep the shelf healthy. Every action here is recorded in the audit log." />
      <div role="tablist" aria-label="Admin sections" className="no-scrollbar mb-8 flex gap-1 overflow-x-auto border-b border-line">
        {TABS.map((t) => (
          <button
            key={t.id}
            id={`admin-tab-${t.id}`}
            role="tab"
            aria-selected={tab === t.id}
            aria-controls="admin-panel"
            onClick={() => setTab(t.id)}
            className={`-mb-px flex h-10 shrink-0 items-center gap-2 border-b-2 px-3 text-sm font-medium transition-colors ${
              tab === t.id ? "border-ink text-ink" : "border-transparent text-muted hover:text-ink"
            }`}
          >
            {t.label}
            {t.id === "automation" && openErrors > 0 ? (
              <span className="grid h-5 min-w-5 place-items-center rounded-full bg-danger px-1.5 text-[11px] font-semibold text-bg">
                {openErrors}
                <span className="sr-only"> open</span>
              </span>
            ) : null}
          </button>
        ))}
      </div>
      <div role="tabpanel" id="admin-panel" aria-labelledby={`admin-tab-${tab}`}>
        {tab === "members" && <Members />}
        {tab === "listings" && <Listings />}
        {tab === "loans" && <Loans />}
        {tab === "automation" && <AutomationErrors />}
        {tab === "audit" && <AuditLog />}
      </div>
    </>
  );
}
