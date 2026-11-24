"use client";

import type { ReactNode } from "react";
import { IconContext } from "@phosphor-icons/react";

/**
 * Every icon is decorative by default (hidden from screen readers). Where an icon
 * carries meaning, the text next to it (or an sr-only span) says it instead.
 */
export function IconDefaults({ children }: { children: ReactNode }) {
  return <IconContext.Provider value={{ "aria-hidden": true, focusable: false }}>{children}</IconContext.Provider>;
}
