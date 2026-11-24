"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Authenticated, AuthLoading, Unauthenticated, useQuery } from "convex/react";
import { SignInButton, UserButton } from "@clerk/nextjs";
import { motion, useReducedMotion } from "motion/react";
import { api } from "../../convex/_generated/api";
import { useStoreUser } from "@/hooks/useStoreUser";
import { Footer, SkipLink, Wordmark } from "./Brand";
import { Button, Skeleton } from "./ui";

/* z-index scale: 40 sticky header, 50 toasts. Dialogs use the native top layer. */

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-[100dvh] flex-col">
      <SkipLink />
      <AuthLoading>
        <ShellSkeleton />
      </AuthLoading>
      <Unauthenticated>
        <div className="mx-auto grid max-w-md flex-1 place-content-center gap-4 px-4 text-center">
          <p className="text-ink">Please sign in to see the shelf.</p>
          <SignInButton mode="redirect">
            <Button>Sign in to lend or borrow</Button>
          </SignInButton>
        </div>
      </Unauthenticated>
      <Authenticated>
        <SignedInShell>{children}</SignedInShell>
      </Authenticated>
      <Footer />
    </div>
  );
}

function SignedInShell({ children }: { children: ReactNode }) {
  const { ready, error } = useStoreUser();
  if (error) {
    return <p className="mx-auto max-w-md flex-1 px-4 py-20 text-center text-danger">{error}</p>;
  }
  if (!ready) return <ShellSkeleton />;
  return (
    <>
      <TopNav />
      <main id="main" tabIndex={-1} className="mx-auto w-full max-w-6xl flex-1 px-4 py-10 outline-none sm:px-6">
        {children}
      </main>
    </>
  );
}

function TopNav() {
  const me = useQuery(api.users.me);
  const incoming = useQuery(api.loans.incoming);
  const pending = incoming?.filter((l) => l.status === "requested").length ?? 0;
  const items = [
    { href: "/board", label: "Board", short: "Board" },
    { href: "/listings", label: "My listings", short: "Listings" },
    { href: "/requests", label: "Requests", short: "Requests", count: pending },
    ...(me?.role === "admin" ? [{ href: "/admin", label: "Admin", short: "Admin" }] : []),
  ];
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-bg/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4 sm:px-6">
        <Wordmark href="/board" />
        <nav aria-label="Main" className="-mb-px hidden flex-1 gap-1 sm:flex">
          {items.map((it) => (
            <NavLink key={it.href} layoutGroup="desktop" {...it} />
          ))}
        </nav>
        <div className="ml-auto sm:ml-0">
          <UserButton />
        </div>
      </div>
      {/* Phones: every tab visible at once (no hidden horizontal scroll), so pending badges are never off-screen. */}
      <nav aria-label="Main" className="grid auto-cols-fr grid-flow-col border-t border-line sm:hidden">
        {items.map((it) => (
          <NavLink key={it.href} layoutGroup="mobile" {...it} label={it.short} compact />
        ))}
      </nav>
    </header>
  );
}

function NavLink({
  href,
  label,
  count,
  compact,
  layoutGroup,
}: {
  href: string;
  label: string;
  count?: number;
  compact?: boolean;
  layoutGroup: string;
}) {
  const path = usePathname();
  const active = path === href || path.startsWith(`${href}/`);
  const reduce = useReducedMotion();
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`relative flex items-center justify-center gap-1.5 whitespace-nowrap px-3 text-sm font-medium transition-colors ${
        compact ? "h-11" : "h-16"
      } ${active ? "text-ink" : "text-muted hover:text-ink"}`}
    >
      {label}
      {count ? (
        <span className="grid h-5 min-w-5 place-items-center rounded-full bg-ink px-1.5 text-[11px] font-semibold text-bg">
          {count}
        </span>
      ) : null}
      {active ? (
        <motion.span
          layoutId={`nav-underline-${layoutGroup}`}
          transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 500, damping: 40 }}
          className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-ink"
        />
      ) : null}
    </Link>
  );
}

function ShellSkeleton() {
  return (
    <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-10 sm:px-6" aria-busy="true" aria-label="Loading">
      <Skeleton className="mb-8 h-8 w-48" />
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-40" />
        ))}
      </div>
    </div>
  );
}
