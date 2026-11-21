/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { sign, signedHeaders } from "./lib/signing";
import { todayUtc } from "./lib/validate";
import { MAX_ATTEMPTS } from "./notifications";

const modules = import.meta.glob("./**/*.ts");
const API_SECRET = "test-automation-secret";
const HOOK_SECRET = "test-webhook-secret";
const day = (n: number) => todayUtc(Date.now() + n * 86_400_000);

beforeEach(() => {
  vi.stubEnv("ADMIN_EMAILS", "admin@example.com");
  vi.stubEnv("AUTOMATION_API_SECRET", API_SECRET);
  vi.stubEnv("WEBHOOK_SIGNING_SECRET", HOOK_SECRET);
  vi.stubEnv("N8N_NOTIFY_WEBHOOK_URL", "https://n8n.example.test/webhook/lendloop");
});
afterEach(() => {
  vi.unstubAllGlobals();
});

/** Alice lends a drill to Bob; the loan ended 3 days ago (inserted directly, past dates can't be requested). */
async function setupOverdue() {
  const t = convexTest(schema, modules);
  const alice = t.withIdentity({ subject: "alice", email: "alice@example.com", name: "Alice" });
  const bob = t.withIdentity({ subject: "bob", email: "bob@example.com", name: "Bob" });
  const admin = t.withIdentity({ subject: "admin", email: "admin@example.com", name: "Ada" });
  for (const u of [alice, bob, admin]) await u.mutation(api.users.store, {});
  const loanId = await t.run(async (ctx) => {
    const owner = (await ctx.db.query("users").withIndex("by_email", (q) => q.eq("email", "alice@example.com")).unique())!;
    const borrower = (await ctx.db.query("users").withIndex("by_email", (q) => q.eq("email", "bob@example.com")).unique())!;
    const toolId = await ctx.db.insert("tools", {
      ownerId: owner._id,
      name: "Cordless drill",
      category: "power_tools",
      condition: "good",
      description: "",
      status: "on_loan",
    });
    return ctx.db.insert("loans", {
      toolId,
      toolName: "Cordless drill",
      ownerId: owner._id,
      borrowerId: borrower._id,
      startDate: day(-6),
      endDate: day(-3),
      status: "approved",
    });
  });
  return { t, alice, bob, admin, loanId };
}

async function signedPost(t: ReturnType<typeof convexTest>, path: string, payload: unknown, secret = API_SECRET, now = Date.now()) {
  const body = JSON.stringify(payload);
  return t.fetch(path, { method: "POST", headers: await signedHeaders(secret, body, now), body });
}

describe("signature verification (n8n -> Convex)", () => {
  test("a correctly signed request is accepted and returns the overdue loan with minimal fields", async () => {
    const { t, loanId } = await setupOverdue();
    const res = await signedPost(t, "/automation/overdue-loans", {});
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.count).toBe(1);
    expect(data.loans[0]).toEqual({
      loanId,
      reminderKey: `reminder:${loanId}:${todayUtc()}`,
      toolName: "Cordless drill",
      endDate: day(-3),
      daysOverdue: 3,
      borrower: { name: "Bob", email: "bob@example.com" },
      lenderName: "Alice",
    });
    expect(JSON.stringify(data)).not.toContain("alice@example.com"); // lender email is never needed
  });

  test("unsigned, wrong-secret, tampered and replayed requests are all rejected with 401", async () => {
    const { t } = await setupOverdue();
    expect((await t.fetch("/automation/overdue-loans", { method: "POST", body: "{}" })).status).toBe(401);
    expect((await signedPost(t, "/automation/overdue-loans", {}, "wrong-secret")).status).toBe(401);

    const ts = Math.floor(Date.now() / 1000).toString();
    const tampered = await t.fetch("/automation/events", {
      method: "POST",
      headers: { "x-lendloop-timestamp": ts, "x-lendloop-signature": await sign(API_SECRET, ts, '{"a":1}') },
      body: '{"a":2}',
    });
    expect(tampered.status).toBe(401);

    const tenMinutesAgo = Date.now() - 10 * 60_000;
    expect((await signedPost(t, "/automation/overdue-loans", {}, API_SECRET, tenMinutesAgo)).status).toBe(401);
  });

  test("secret rotation: the previous secret keeps working while both are configured", async () => {
    const { t } = await setupOverdue();
    vi.stubEnv("AUTOMATION_API_SECRET", `new-secret,${API_SECRET}`);
    expect((await signedPost(t, "/automation/overdue-loans", {}, API_SECRET)).status).toBe(200);
    expect((await signedPost(t, "/automation/overdue-loans", {}, "new-secret")).status).toBe(200);
  });
});

describe("idempotent write-backs", () => {
  test("the same reminder written twice creates one record, and the loan leaves today's overdue list", async () => {
    const { t, bob, loanId } = await setupOverdue();
    const reminderKey = `reminder:${loanId}:${todayUtc()}`;
    const write = () => signedPost(t, "/automation/events", { loanId, kind: "reminder_sent", idempotencyKey: reminderKey });

    expect(await (await write()).json()).toEqual({ status: "created" });
    expect(await (await write()).json()).toEqual({ status: "duplicate" });

    const rows = await t.run((ctx) => ctx.db.query("automationEvents").collect());
    expect(rows).toHaveLength(1);

    const overdue = await (await signedPost(t, "/automation/overdue-loans", {})).json();
    expect(overdue.count).toBe(0);

    // The bonus feature: the borrower sees the activity on the loan.
    const mine = await bob.query(api.loans.myRequests, {});
    expect(mine[0].automation[0]).toMatchObject({ kind: "reminder_sent" });
  });

  test("invalid bodies get 400 and unknown loans 404", async () => {
    const { t } = await setupOverdue();
    expect((await signedPost(t, "/automation/events", { kind: "reminder_sent" })).status).toBe(400);
    expect((await signedPost(t, "/automation/events", { loanId: "x", kind: "hacked", idempotencyKey: "k" })).status).toBe(400);
    expect((await signedPost(t, "/automation/events", [1, 2])).status).toBe(400);
    expect((await signedPost(t, "/automation/events", { loanId: "nope", kind: "reminder_sent", idempotencyKey: "k" })).status).toBe(404);
  });

  test("n8n error reports are stored once per execution and visible to admins only", async () => {
    const { t, admin, bob } = await setupOverdue();
    const report = { workflow: "Overdue reminders", node: "Send reminder", message: "Resend 422", executionId: "981" };
    expect(await (await signedPost(t, "/automation/errors", report)).json()).toEqual({ status: "created" });
    expect(await (await signedPost(t, "/automation/errors", report)).json()).toEqual({ status: "duplicate" });
    const errors = await admin.query(api.admin.listAutomationErrors, {});
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ source: "n8n: Overdue reminders (Send reminder)", executionId: "981" });
    await expect(bob.query(api.admin.listAutomationErrors, {})).rejects.toThrow(/Admins only/);
  });
});

describe("request notification webhook (Convex -> n8n)", () => {
  test("payload is minimal and addressed to the right person", async () => {
    const { t, loanId } = await setupOverdue();
    const toOwner = await t.query(internal.notifications.payloadFor, { loanId, event: "requested" });
    expect(toOwner?.recipient).toEqual({ name: "Alice", email: "alice@example.com" });
    expect(Object.keys(toOwner!).sort()).toEqual(
      ["endDate", "event", "eventId", "loanId", "note", "otherPartyName", "recipient", "startDate", "toolName"].sort(),
    );
    const toBorrower = await t.query(internal.notifications.payloadFor, { loanId, event: "approved" });
    expect(toBorrower?.recipient.email).toBe("bob@example.com");
    expect(JSON.stringify(toBorrower)).not.toContain("alice@example.com");
  });

  test("delivery is signed so n8n can verify it", async () => {
    const { t, loanId } = await setupOverdue();
    let captured: { headers: Headers; body: string } | null = null;
    vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
      captured = { headers: new Headers(init.headers), body: String(init.body) };
      return new Response("ok", { status: 200 });
    });
    await t.action(internal.notifications.deliver, { loanId, event: "approved", attempt: 1 });
    const c = captured as unknown as { headers: Headers; body: string };
    const ts = c.headers.get("x-lendloop-timestamp")!;
    expect(c.headers.get("x-lendloop-signature")).toBe(await sign(HOOK_SECRET, ts, c.body));
    expect(c.headers.get("x-lendloop-event-id")).toBe(`${loanId}:approved`);
    expect(await t.run((ctx) => ctx.db.query("automationErrors").collect())).toHaveLength(0);
  });

  test("a 5xx is retried (scheduled), and the final failed attempt is recorded, not silent", async () => {
    const { t, admin, loanId } = await setupOverdue();
    vi.stubGlobal("fetch", async () => new Response("down", { status: 503 }));

    await t.action(internal.notifications.deliver, { loanId, event: "approved", attempt: 1 });
    const scheduled = await t.run((ctx) => ctx.db.system.query("_scheduled_functions").collect());
    expect(scheduled.some((s) => s.name.includes("deliver") && (s.args[0] as { attempt: number }).attempt === 2)).toBe(true);
    expect(await t.run((ctx) => ctx.db.query("automationErrors").collect())).toHaveLength(0);

    await t.action(internal.notifications.deliver, { loanId, event: "approved", attempt: MAX_ATTEMPTS });
    const errors = await admin.query(api.admin.listAutomationErrors, {});
    expect(errors[0].message).toMatch(/HTTP 503 \(after 5 attempts\)/);
    const loans = await admin.query(api.admin.listLoans, {});
    expect(loans[0].automation[0]).toMatchObject({ kind: "notification_failed" });
  });

  test("a 401 from n8n is not retried (a bad secret won't fix itself)", async () => {
    const { t, loanId } = await setupOverdue();
    vi.stubGlobal("fetch", async () => new Response("nope", { status: 401 }));
    await t.action(internal.notifications.deliver, { loanId, event: "declined", attempt: 1 });
    const errors = await t.run((ctx) => ctx.db.query("automationErrors").collect());
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toMatch(/HTTP 401 \(after 1 attempt\)/);
  });

  test("every loan transition schedules exactly one delivery, inside the same transaction", async () => {
    const { t, alice, bob } = await setupOverdue();
    const toolId = await alice.mutation(api.tools.create, { name: "Ladder", category: "ladders", condition: "good", description: "" });
    const loanId: Id<"loans"> = await bob.mutation(api.loans.request, { toolId, startDate: day(1), endDate: day(2) });
    await alice.mutation(api.loans.decline, { loanId });
    const scheduled = await t.run((ctx) => ctx.db.system.query("_scheduled_functions").collect());
    const events = scheduled
      .filter((s) => (s.args[0] as { loanId: string }).loanId === loanId)
      .map((s) => (s.args[0] as { event: string }).event);
    expect(events.sort()).toEqual(["declined", "requested"]);
  });
});
