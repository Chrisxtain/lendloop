"use client";

import { useEffect, useState } from "react";
import { useConvexAuth, useMutation } from "convex/react";
import { useUser } from "@clerk/nextjs";
import { api } from "../../convex/_generated/api";
import { errorMessage } from "@/lib/format";

/**
 * After sign-in, upsert the Convex user row (role is computed server-side).
 * Authenticated pages wait for `ready` so their queries never run before the row exists.
 */
export function useStoreUser() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const { user } = useUser();
  const store = useMutation(api.users.store);
  const [readyFor, setReadyFor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const userId = user?.id ?? null;

  useEffect(() => {
    if (!isAuthenticated || !userId) return;
    let cancelled = false;
    store({})
      .then(() => !cancelled && setReadyFor(userId))
      .catch((e) => !cancelled && setError(errorMessage(e)));
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, userId, store]);

  const ready = isAuthenticated && readyFor !== null && readyFor === userId;
  return { isLoading: isLoading || (isAuthenticated && !ready && !error), isAuthenticated, ready, error };
}
