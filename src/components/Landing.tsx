"use client";

import Link from "next/link";
import { Authenticated, AuthLoading, Unauthenticated, useQuery } from "convex/react";
import { SignInButton } from "@clerk/nextjs";
import { ArrowRight, ArrowUUpLeft, Bell, HandArrowDown, Package } from "@phosphor-icons/react";
import { api } from "../../convex/_generated/api";
import { CATEGORIES, labelFor } from "../../convex/lib/constants";
import { Button, Skeleton } from "./ui";

export function LandingCta() {
  return (
    <>
      <AuthLoading>
        <Skeleton className="h-10 w-56" />
      </AuthLoading>
      <Unauthenticated>
        <SignInButton mode="redirect" forceRedirectUrl="/board">
          <Button>Sign in to lend or borrow</Button>
        </SignInButton>
      </Unauthenticated>
      <Authenticated>
        <Link
          href="/board"
          className="inline-flex h-10 items-center gap-2 rounded-lg bg-ink px-4 text-sm font-medium text-bg transition hover:opacity-90 active:scale-[0.98]"
        >
          Open the board <ArrowRight size={16} />
        </Link>
      </Authenticated>
    </>
  );
}

export function HowItWorks() {
  return (
    <section className="grid gap-8 border-t border-line py-16 md:grid-cols-[1fr_1.4fr]">
      <h2 className="text-2xl font-semibold tracking-tight text-ink">How lending works</h2>
      <ul className="grid gap-6">
        <Step icon={<HandArrowDown size={20} />} title="Ask for dates">
          Pick a tool, choose the days you need it and send a short note to its owner.
        </Step>
        <Step icon={<Bell size={20} />} title="Get an answer by email">
          The owner approves or declines, and you both get an email the moment anything changes.
        </Step>
        <Step icon={<ArrowUUpLeft size={20} />} title="Bring it back">
          If a return date passes, a friendly daily reminder goes out until the owner marks it returned.
        </Step>
      </ul>
    </section>
  );
}

function Step({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-4">
      <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-surface-2 text-ink">{icon}</span>
      <div>
        <p className="font-medium text-ink">{title}</p>
        <p className="mt-1 text-sm leading-relaxed text-muted">{children}</p>
      </div>
    </li>
  );
}

/** Read-only, public: name + category only (the query itself returns nothing else). */
export function PublicShelf() {
  const tools = useQuery(api.tools.listPublic);
  return (
    <div className="rounded-xl border border-line bg-surface">
      <div className="flex items-baseline justify-between border-b border-line px-5 py-4">
        <h2 className="font-medium text-ink">Available right now</h2>
        {tools ? <span className="text-sm text-muted">{tools.length} tools</span> : null}
      </div>
      {tools === undefined ? (
        <ul className="grid gap-3 p-5" aria-busy="true" aria-label="Loading tools">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-6" />
          ))}
        </ul>
      ) : tools.length === 0 ? (
        <div className="flex flex-col items-center px-5 py-12 text-center">
          <Package size={28} className="mb-2 text-muted" />
          <p className="text-sm text-muted">Nothing on the shelf yet. Sign in and lend the first tool.</p>
        </div>
      ) : (
        <ul className="max-h-[22rem] divide-y divide-line overflow-y-auto">
          {tools.map((t, i) => (
            <li key={i} className="flex items-center justify-between gap-4 px-5 py-3">
              <span className="truncate text-ink">{t.name}</span>
              <span className="shrink-0 rounded-full bg-surface-2 px-2.5 py-0.5 text-xs text-muted">
                {labelFor(CATEGORIES, t.category)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
