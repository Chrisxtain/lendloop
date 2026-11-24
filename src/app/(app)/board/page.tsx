"use client";

import { Suspense, useEffect, useState } from "react";
import { useQueryParam } from "@/hooks/useQueryParam";
import { useMutation, useQuery } from "convex/react";
import { motion, useReducedMotion } from "motion/react";
import { MagnifyingGlass, SealCheck, Trash } from "@phosphor-icons/react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { CATEGORIES, CONDITIONS, labelFor, type Category } from "../../../../convex/lib/constants";
import { Button, EmptyState, PageHeader, Skeleton, ToolStatusBadge, inputClass } from "@/components/ui";
import { RequestDialog, type RequestTarget } from "@/components/RequestDialog";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useToast } from "@/components/Toast";

export default function BoardPage() {
  // useSearchParams needs a Suspense boundary in the App Router.
  return (
    <Suspense fallback={<Skeleton className="h-64" />}>
      <Board />
    </Suspense>
  );
}

const isCategory = (v: string | null): v is Category => CATEGORIES.some((c) => c.value === v);

function Board() {
  // Filter and search live in the URL (?category=garden&q=saw) so views can be shared and bookmarked.
  const [categoryParam, setCategoryParam] = useQueryParam("category");
  const [q, setQ] = useQueryParam("q");
  const category = isCategory(categoryParam) ? categoryParam : undefined;
  const setCategory = (c: Category | undefined) => setCategoryParam(c ?? null);
  const [search, setSearch] = useState(q ?? "");
  useEffect(() => {
    const id = setTimeout(() => setQ(search.trim() || null), 300); // debounce URL updates while typing
    return () => clearTimeout(id);
  }, [search, setQ]);
  const all = useQuery(api.tools.list, { category });
  const needle = search.trim().toLowerCase();
  const tools = needle
    ? all?.filter((t) => t.name.toLowerCase().includes(needle) || t.description.toLowerCase().includes(needle))
    : all;
  const me = useQuery(api.users.me);
  const [requesting, setRequesting] = useState<RequestTarget | null>(null);
  const [removing, setRemoving] = useState<{ _id: Id<"tools">; name: string } | null>(null);
  const removeTool = useMutation(api.admin.removeTool);
  const toast = useToast();
  const reduce = useReducedMotion();
  const isAdmin = me?.role === "admin";

  return (
    <>
      <PageHeader
        title="The shelf"
        subtitle="Everything your neighbours are happy to lend."
        action={
          <div className="relative w-full sm:w-72">
            <MagnifyingGlass size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <label htmlFor="board-search" className="sr-only">
              Search tools
            </label>
            <input
              id="board-search"
              name="q"
              type="search"
              autoComplete="off"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search tools…"
              className={`${inputClass} pl-9`}
            />
          </div>
        }
      />

      <div role="group" aria-label="Filter by category" className="no-scrollbar -mx-4 mb-8 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0">
        <Chip active={!category} onClick={() => setCategory(undefined)}>
          All
        </Chip>
        {CATEGORIES.map((c) => (
          <Chip key={c.value} active={category === c.value} onClick={() => setCategory(c.value)}>
            {c.label}
          </Chip>
        ))}
      </div>

      {tools === undefined ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3" aria-busy="true" aria-label="Loading tools">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-44" />
          ))}
        </div>
      ) : tools.length === 0 ? (
        <EmptyState
          icon={<MagnifyingGlass size={28} />}
          title={
            needle
              ? `Nothing matches "${search.trim()}"`
              : category
                ? `No ${labelFor(CATEGORIES, category).toLowerCase()} listed yet`
                : "The shelf is empty"
          }
          body={
            needle
              ? "Try a shorter word, or pick All categories."
              : "When a neighbour lists something it shows up here. Got a tool you rarely use? List it from My listings."
          }
        />
      ) : (
        <ul className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {tools.map((t, i) => (
            <motion.li
              key={t._id}
              initial={reduce ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, delay: Math.min(i, 9) * 0.03, ease: [0.16, 1, 0.3, 1] }}
              className="flex flex-col rounded-xl border border-line bg-surface p-5"
            >
              <div className="flex items-start justify-between gap-3">
                <h2 className="min-w-0 break-words font-medium text-ink">{t.name}</h2>
                <ToolStatusBadge status={t.status} />
              </div>
              <p className="mt-1 text-sm text-muted">
                {labelFor(CATEGORIES, t.category)}, {labelFor(CONDITIONS, t.condition).toLowerCase()}
              </p>
              {t.description ? <p className="mt-3 line-clamp-3 text-sm leading-relaxed text-body">{t.description}</p> : null}
              <div className="mt-auto flex items-center justify-between gap-3 pt-5">
                <p className="flex min-w-0 items-center gap-1 text-sm text-muted">
                  <span className="truncate">{t.isMine ? "Your listing" : t.owner.name}</span>
                  {t.owner.trustedLender ? (
                    <span className="inline-flex items-center gap-0.5 text-accent" title="Trusted Lender">
                      <SealCheck size={15} weight="fill" aria-hidden />
                      <span className="sr-only">Trusted Lender</span>
                    </span>
                  ) : null}
                </p>
                <div className="flex shrink-0 gap-2">
                  {isAdmin ? (
                    <Button size="sm" variant="ghost" aria-label={`Remove ${t.name}`} onClick={() => setRemoving({ _id: t._id, name: t.name })}>
                      <Trash size={16} />
                    </Button>
                  ) : null}
                  {!t.isMine ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      aria-label={`Request ${t.name}`}
                      onClick={() => setRequesting({ _id: t._id, name: t.name, ownerName: t.owner.name, onLoan: t.status === "on_loan" })}
                    >
                      Request
                    </Button>
                  ) : null}
                </div>
              </div>
            </motion.li>
          ))}
        </ul>
      )}

      <RequestDialog tool={requesting} onClose={() => setRequesting(null)} />
      <ConfirmDialog
        open={removing !== null}
        title={`Remove ${removing?.name ?? "listing"}?`}
        body="As an admin you can remove any listing. Open requests and any active loan are cancelled, and the people involved are notified."
        confirmLabel="Remove listing"
        withReason
        onClose={() => setRemoving(null)}
        onConfirm={async (reason) => {
          if (!removing) return;
          await removeTool({ toolId: removing._id, reason });
          toast("success", `${removing.name} removed`);
        }}
      />
    </>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`h-8 shrink-0 rounded-full px-3.5 text-sm transition active:scale-[0.98] ${
        active ? "bg-ink text-bg" : "border border-line bg-surface text-body hover:bg-surface-2"
      }`}
    >
      {children}
    </button>
  );
}
