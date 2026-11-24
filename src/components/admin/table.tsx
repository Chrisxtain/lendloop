import type { ReactNode } from "react";

/** Shared table chrome for the admin tabs. Scrolls horizontally on small screens. */
export function TableWrap({ children }: { children: ReactNode }) {
  return <div className="overflow-x-auto rounded-xl border border-line bg-surface">{children}</div>;
}

export const th = "px-4 py-3 text-left text-xs font-medium text-muted";
export const td = "px-4 py-3 align-middle";
