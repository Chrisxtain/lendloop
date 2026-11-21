import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { secretList, verifyRequest } from "./lib/signing";
import { todayUtc } from "./lib/validate";

/**
 * n8n -> Convex endpoints. Every request must be HMAC-signed with
 * AUTOMATION_API_SECRET (see lib/signing.ts). Bodies are treated as untrusted
 * `unknown` and narrowed field by field; failures return 400, bad signatures 401.
 * Responses never echo why a signature failed (logged server-side only).
 */

const http = httpRouter();

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });

type Parsed = { ok: true; data: Record<string, unknown> } | { ok: false; res: Response };

async function authenticate(req: Request, route: string): Promise<Parsed> {
  const result = await verifyRequest(req, secretList(process.env.AUTOMATION_API_SECRET));
  if (!result.ok) {
    console.warn(`[http] ${route} rejected: ${result.reason}`);
    return { ok: false, res: json({ error: result.status === 500 ? "server misconfigured" : "unauthorized" }, result.status) };
  }
  try {
    const data: unknown = result.body ? JSON.parse(result.body) : {};
    if (typeof data !== "object" || data === null || Array.isArray(data)) throw new Error("not an object");
    return { ok: true, data: data as Record<string, unknown> };
  } catch {
    return { ok: false, res: json({ error: "body must be a JSON object" }, 400) };
  }
}

function str(data: Record<string, unknown>, key: string, max: number, required = true): string | undefined | null {
  const value = data[key];
  if (value === undefined || value === null) return required ? null : undefined;
  if (typeof value !== "string" || value.length === 0 || value.length > max) return null;
  return value;
}

const EVENT_KINDS = ["notification_sent", "notification_failed", "reminder_sent", "reminder_failed"] as const;
type EventKind = (typeof EVENT_KINDS)[number];

/** Daily overdue workflow: which borrowers need a reminder today? */
http.route({
  path: "/automation/overdue-loans",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    const auth = await authenticate(req, "overdue-loans");
    if (!auth.ok) return auth.res;
    const asOf = todayUtc();
    const loans = await ctx.runQuery(internal.automation.overdueLoans, { asOf });
    return json({ asOf, count: loans.length, loans });
  }),
});

/** Write-back: "email sent", "reminder sent" (or failed). Idempotent on idempotencyKey. */
http.route({
  path: "/automation/events",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    const auth = await authenticate(req, "events");
    if (!auth.ok) return auth.res;
    const d = auth.data;
    const loanId = str(d, "loanId", 64);
    const idempotencyKey = str(d, "idempotencyKey", 200);
    const detail = str(d, "detail", 300, false);
    const kind = d.kind;
    if (!loanId || !idempotencyKey || detail === null || !EVENT_KINDS.includes(kind as EventKind)) {
      return json({ error: "expected { loanId, kind, idempotencyKey, detail? }" }, 400);
    }
    const status = await ctx.runMutation(internal.automation.recordEvent, {
      loanId,
      kind: kind as EventKind,
      idempotencyKey,
      detail: detail ?? undefined,
    });
    if (status === "unknown_loan") return json({ error: "unknown loan" }, 404);
    // 200 for both: a retried write-back is a success, not an error.
    return json({ status });
  }),
});

/** n8n error workflow: a run failed after its retries. Idempotent per execution. */
http.route({
  path: "/automation/errors",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    const auth = await authenticate(req, "errors");
    if (!auth.ok) return auth.res;
    const d = auth.data;
    const workflow = str(d, "workflow", 120);
    const message = str(d, "message", 1000);
    const executionId = str(d, "executionId", 64, false);
    const node = str(d, "node", 120, false);
    if (!workflow || !message || executionId === null || node === null) {
      return json({ error: "expected { workflow, message, executionId?, node? }" }, 400);
    }
    const status = await ctx.runMutation(internal.automation.recordError, {
      source: `n8n: ${workflow}${node ? ` (${node})` : ""}`,
      message,
      executionId: executionId ?? undefined,
      idempotencyKey: executionId ? `n8n:${executionId}` : `n8n:${workflow}:${message}:${todayUtc()}`,
    });
    return json({ status });
  }),
});

export default http;
