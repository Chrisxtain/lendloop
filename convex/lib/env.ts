/**
 * All secrets/config come from Convex deployment env vars (`npx convex env set`).
 * Nothing secret is ever committed. Missing required values fail loudly.
 */
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required Convex env var: ${name}`);
  return value;
}

export function adminEmails(): Set<string> {
  return new Set(
    (process.env.ADMIN_EMAILS ?? "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
}
