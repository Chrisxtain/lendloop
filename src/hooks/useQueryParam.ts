"use client";

import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * Keeps a piece of UI state (a tab, a filter) in the URL query string, so views can
 * be bookmarked, shared and restored with Back. Uses replace() to avoid history spam.
 */
export function useQueryParam(key: string): [string | null, (value: string | null) => void] {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const value = params.get(key);
  const setValue = useCallback(
    (next: string | null) => {
      const qs = new URLSearchParams(params.toString());
      if (next) qs.set(key, next);
      else qs.delete(key);
      const query = qs.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [params, router, pathname, key],
  );
  return [value, setValue];
}
