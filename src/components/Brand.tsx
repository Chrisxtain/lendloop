"use client";

import Link from "next/link";
import { Toolbox } from "@phosphor-icons/react";

export function Wordmark({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} translate="no" className="flex items-center gap-2 font-semibold tracking-tight text-ink">
      <span className="grid h-7 w-7 place-items-center rounded-lg bg-accent text-bg">
        <Toolbox size={16} weight="bold" />
      </span>
      LendLoop
    </Link>
  );
}

/** Hidden until focused with Tab: lets keyboard users jump past the header. Target needs id="main". */
export function SkipLink() {
  return (
    <a
      href="#main"
      className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-ink focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-bg"
    >
      Skip to content
    </a>
  );
}

export function Footer() {
  return (
    <footer className="mt-auto border-t border-line">
      <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-6 text-sm text-muted sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p>
          <span translate="no">LendLoop</span>. Borrow what you need. Lend what you don&apos;t.
        </p>
        <p>
          Built by{" "}
          <span translate="no" className="font-medium text-ink">
            XTAIN™
          </span>
        </p>
      </div>
    </footer>
  );
}
