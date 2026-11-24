"use client";

import { Suspense } from "react";
import { useQuery } from "convex/react";
import { motion, useReducedMotion } from "motion/react";
import { Tray, HandGrabbing } from "@phosphor-icons/react";
import { api } from "../../../../convex/_generated/api";
import { EmptyState, PageHeader, Skeleton } from "@/components/ui";
import { LoanCard, type LoanRow } from "@/components/LoanCard";
import { isUpcoming } from "@/lib/format";
import { useQueryParam } from "@/hooks/useQueryParam";

type Tab = "incoming" | "mine";

export default function RequestsPage() {
  // useSearchParams needs a Suspense boundary in the App Router.
  return (
    <Suspense fallback={<Skeleton className="h-64" />}>
      <Requests />
    </Suspense>
  );
}

function Requests() {
  const incoming = useQuery(api.loans.incoming);
  const mine = useQuery(api.loans.myRequests);
  // The tab lives in the URL (?tab=mine) so it can be linked to and survives Back.
  const [tabParam, setTabParam] = useQueryParam("tab");
  const tab: Tab = tabParam === "mine" ? "mine" : "incoming";
  const setTab = (t: Tab) => setTabParam(t === "incoming" ? null : t);
  const pendingIncoming = incoming?.filter((l) => l.status === "requested").length ?? 0;
  const rows = tab === "incoming" ? incoming : mine;

  return (
    <>
      <PageHeader title="Requests" subtitle="Answer requests for your tools and keep track of what you've borrowed." />
      <div role="tablist" aria-label="Requests" className="mb-8 flex gap-1 border-b border-line">
        <TabButton active={tab === "incoming"} onClick={() => setTab("incoming")} count={pendingIncoming}>
          Incoming requests
        </TabButton>
        <TabButton active={tab === "mine"} onClick={() => setTab("mine")}>
          My requests
        </TabButton>
      </div>

      <div role="tabpanel">
        {rows === undefined ? (
          <div className="grid gap-3" aria-busy="true" aria-label="Loading requests">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-32" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          tab === "incoming" ? (
            <EmptyState
              icon={<Tray size={28} />}
              title="No requests yet"
              body="When a neighbour asks to borrow one of your tools, it lands here for you to approve or decline."
            />
          ) : (
            <EmptyState
              icon={<HandGrabbing size={28} />}
              title="You haven't borrowed anything"
              body="Find something on the board and request it for the dates you need."
            />
          )
        ) : (
          <Grouped rows={rows} tab={tab} />
        )}
      </div>
    </>
  );
}

/** Groups by what needs attention first: pending, out now, upcoming bookings, then history. */
function Grouped({ rows, tab }: { rows: LoanRow[]; tab: Tab }) {
  const groups = [
    { title: tab === "incoming" ? "Waiting for your answer" : "Waiting for an answer", items: rows.filter((r) => r.status === "requested") },
    {
      title: tab === "incoming" ? "Out on loan" : "Borrowing now",
      items: rows.filter((r) => r.status === "approved" && !isUpcoming(r.status, r.startDate)),
    },
    { title: "Upcoming bookings", items: rows.filter((r) => isUpcoming(r.status, r.startDate)) },
    { title: "History", items: rows.filter((r) => !["requested", "approved"].includes(r.status)) },
  ].filter((g) => g.items.length > 0);

  return (
    <div className="grid gap-10">
      {groups.map((g) => (
        <section key={g.title}>
          <h2 className="mb-3 text-sm font-medium text-muted">
            {g.title} <span className="text-muted/70">({g.items.length})</span>
          </h2>
          <ul className="grid gap-3 lg:grid-cols-2">
            {g.items.map((l, i) => (
              <LoanCard key={l._id} loan={l} index={i} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function TabButton({ active, onClick, count, children }: { active: boolean; onClick: () => void; count?: number; children: React.ReactNode }) {
  const reduce = useReducedMotion();
  return (
    <button
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`relative -mb-px flex h-10 items-center gap-2 px-3 text-sm font-medium transition-colors ${active ? "text-ink" : "text-muted hover:text-ink"}`}
    >
      {children}
      {count ? <span className="grid h-5 min-w-5 place-items-center rounded-full bg-ink px-1.5 text-[11px] font-semibold text-bg">{count}</span> : null}
      {active ? (
        <motion.span
          layoutId="requests-tab"
          transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 500, damping: 40 }}
          className="absolute inset-x-0 bottom-0 h-0.5 bg-ink"
        />
      ) : null}
    </button>
  );
}
