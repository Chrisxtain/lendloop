"use client";

import Link from "next/link";
import { Toolbox } from "@phosphor-icons/react";

export function Wordmark({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="flex items-center gap-2 font-semibold tracking-tight text-ink">
      <span className="grid h-7 w-7 place-items-center rounded-lg bg-accent text-bg">
        <Toolbox size={16} weight="bold" />
      </span>
      LendLoop
    </Link>
  );
}

export function Footer() {
  return (
    <footer className="mt-auto border-t border-line">
      <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-6 text-sm text-muted sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p>LendLoop. Borrow what you need. Lend what you don&apos;t.</p>
        <p>
          Built by <span className="font-medium text-ink">XTAIN™</span>
        </p>
      </div>
    </footer>
  );
}
