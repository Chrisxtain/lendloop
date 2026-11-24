/// <reference types="vite/client" />
import { convexTest, type TestConvex } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { todayUtc } from "./lib/validate";

const modules = import.meta.glob("./**/*.ts");
const day = (n: number) => todayUtc(Date.now() + n * 86_400_000);
const drill = { name: "Cordless drill", category: "power_tools", condition: "good", description: "" } as const;

beforeEach(() => {
  vi.stubEnv("ADMIN_EMAILS", "admin@example.com");
  vi.stubEnv("WEBHOOK_SIGNING_SECRET", "test-webhook-secret");
  vi.stubEnv("N8N_NOTIFY_WEBHOOK_URL", "https://n8n.example.test/webhook/lendloop");
});
afterEach(() => vi.unstubAllGlobals());

async function setup() {
  const t = convexTest(schema, modules);
  const alice = t.withIdentity({ subject: "alice", email: "alice@example.com", name: "Alice" }); // lender
  const bob = t.withIdentity({ subject: "bob", email: "bob@example.com", name: "Bob" });
  const carol = t.withIdentity({ subject: "carol", email: "carol@example.com", name: "Carol" });
  const admin = t.withIdentity({ subject: "admin", email: "admin@example.com", name: "Ada" });
  for (const u of [alice, bob, carol, admin]) await u.mutation(api.users.store, {});
  const toolId = await alice.mutation(api.tools.create, drill);
  const status = async () => (await t.run((ctx) => ctx.db.get("tools", toolId)))?.status;
  const events = async (loanId: Id<"loans">) =>
    (await t.run((ctx) => ctx.db.system.query("_scheduled_functions").collect()))
      .filter((s) => (s.args[0] as { loanId?: string }).loanId === loanId)
      .map((s) => (s.args[0] as { event: string }).event);
  return { t, alice, bob, carol, admin, toolId, status, events };
}

/** Inserts an approved loan directly (past start dates can't be requested through the API). */
async function insertApproved(t: TestConvex<typeof schema>, toolId: Id<"tools">, borrowerEmail: string, startDate: string, endDate: string) {
  return t.run(async (ctx) => {
    const tool = (await ctx.db.get("tools", toolId))!;
    const borrower = (await ctx.db.query("users").withIndex("by_email", (q) => q.eq("email", borrowerEmail)).unique())!;
    return ctx.db.insert("loans", {
      toolId,
      toolName: tool.name,
      ownerId: tool.ownerId,
      borrowerId: borrower._id,
      startDate,
      endDate,
      status: "approved",
    });
  });
}

describe("future bookings", () => {
  test("a future booking can be approved while the tool is out, without overlapping", async () => {
    const { alice, bob, carol, toolId, status } = await setup();
    const now = await bob.mutation(api.loans.request, { toolId, startDate: day(0), endDate: day(3) });
    await alice.mutation(api.loans.approve, { loanId: now });
    expect(await status()).toBe("on_loan");

    const later = await carol.mutation(api.loans.request, { toolId, startDate: day(5), endDate: day(7) });
    await alice.mutation(api.loans.approve, { loanId: later });
    expect(await status()).toBe("on_loan"); // still out with Bob

    await alice.mutation(api.loans.markReturned, { loanId: now });
    expect(await status()).toBe("available"); // Carol's booking hasn't started yet
  });

  test("approving a booking that starts later leaves the tool available", async () => {
    const { alice, bob, toolId, status } = await setup();
    const loanId = await bob.mutation(api.loans.request, { toolId, startDate: day(2), endDate: day(4) });
    await alice.mutation(api.loans.approve, { loanId });
    expect(await status()).toBe("available");
  });

  test("requests for already-booked dates are rejected up front", async () => {
    const { alice, bob, carol, toolId } = await setup();
    const loanId = await bob.mutation(api.loans.request, { toolId, startDate: day(2), endDate: day(4) });
    await alice.mutation(api.loans.approve, { loanId });
    await expect(
      carol.mutation(api.loans.request, { toolId, startDate: day(4), endDate: day(6) }),
    ).rejects.toThrow(/already booked for/);
    await carol.mutation(api.loans.request, { toolId, startDate: day(5), endDate: day(6) }); // the next day is fine
  });

  test("the hourly job flips a tool to on loan when a booking starts (and is idempotent)", async () => {
    const { t, toolId, status } = await setup();
    await insertApproved(t, toolId, "bob@example.com", day(0), day(2)); // starts today, tool still "available"
    expect(await status()).toBe("available");
    expect(await t.mutation(internal.loans.activateStartedBookings, {})).toBe(1);
    expect(await status()).toBe("on_loan");
    await t.mutation(internal.loans.activateStartedBookings, {});
    expect(await status()).toBe("on_loan");
  });

  test("returning a loan keeps the tool on loan if the next booking has already started", async () => {
    const { t, alice, toolId, status } = await setup();
    const late = await insertApproved(t, toolId, "bob@example.com", day(-4), day(-1)); // overdue
    await insertApproved(t, toolId, "carol@example.com", day(0), day(2)); // starts today
    await t.mutation(internal.loans.activateStartedBookings, {});
    await alice.mutation(api.loans.markReturned, { loanId: late });
    expect(await status()).toBe("on_loan");
  });

  test("a booking can't be marked returned before it starts", async () => {
    const { alice, bob, toolId } = await setup();
    const loanId = await bob.mutation(api.loans.request, { toolId, startDate: day(2), endDate: day(3) });
    await alice.mutation(api.loans.approve, { loanId });
    await expect(alice.mutation(api.loans.markReturned, { loanId })).rejects.toThrow(/hasn't started yet/);
  });

  test("borrowers only see booked date ranges, never who booked them", async () => {
    const { alice, bob, carol, toolId } = await setup();
    const loanId = await bob.mutation(api.loans.request, { toolId, startDate: day(2), endDate: day(4) });
    await alice.mutation(api.loans.approve, { loanId });
    const booked = await carol.query(api.tools.bookings, { toolId });
    expect(booked).toEqual([{ startDate: day(2), endDate: day(4) }]);
  });
});

describe("cancelling bookings", () => {
  test("the borrower can cancel an upcoming booking; the lender is notified", async () => {
    const { alice, bob, toolId, events } = await setup();
    const loanId = await bob.mutation(api.loans.request, { toolId, startDate: day(2), endDate: day(4) });
    await alice.mutation(api.loans.approve, { loanId });
    await bob.mutation(api.loans.cancel, { loanId });
    expect((await bob.query(api.loans.myRequests, {}))[0].status).toBe("cancelled");
    expect(await events(loanId)).toContain("cancelled");
  });

  test("the lender can cancel an upcoming booking; the borrower is notified", async () => {
    const { alice, bob, toolId, events } = await setup();
    const loanId = await bob.mutation(api.loans.request, { toolId, startDate: day(2), endDate: day(4) });
    await alice.mutation(api.loans.approve, { loanId });
    await alice.mutation(api.loans.cancel, { loanId });
    expect(await events(loanId)).toContain("booking_cancelled");
  });

  test("a loan that has started can't be cancelled, and the lender declines pending requests instead", async () => {
    const { alice, bob, toolId } = await setup();
    const started = await bob.mutation(api.loans.request, { toolId, startDate: day(0), endDate: day(2) });
    await alice.mutation(api.loans.approve, { loanId: started });
    await expect(bob.mutation(api.loans.cancel, { loanId: started })).rejects.toThrow(/haven't started/);
    await expect(alice.mutation(api.loans.cancel, { loanId: started })).rejects.toThrow(/haven't started/);
  });

  test("the lender can't cancel a pending request (decline it) and outsiders can't cancel at all", async () => {
    const { alice, bob, carol, toolId } = await setup();
    const loanId = await bob.mutation(api.loans.request, { toolId, startDate: day(2), endDate: day(4) });
    await expect(alice.mutation(api.loans.cancel, { loanId })).rejects.toThrow(/Decline the request/);
    await expect(carol.mutation(api.loans.cancel, { loanId })).rejects.toThrow(/Only the borrower or the lender/);
  });

  test("deleting a listing with only future bookings cancels them; a started loan blocks deletion", async () => {
    const { t, alice, bob, toolId, events } = await setup();
    const future = await bob.mutation(api.loans.request, { toolId, startDate: day(3), endDate: day(4) });
    await alice.mutation(api.loans.approve, { loanId: future });
    await alice.mutation(api.tools.remove, { toolId });
    expect(await events(future)).toContain("tool_removed");

    const otherTool = await alice.mutation(api.tools.create, { ...drill, name: "Ladder" });
    await insertApproved(t, otherTool, "bob@example.com", day(0), day(1));
    await expect(alice.mutation(api.tools.remove, { toolId: otherTool })).rejects.toThrow(/out on loan/);
  });
});

describe("admin retry for failed notifications", () => {
  async function failedNotification() {
    const s = await setup();
    const loanId = await s.bob.mutation(api.loans.request, { toolId: s.toolId, startDate: day(2), endDate: day(3) });
    await s.t.mutation(internal.notifications.recordDeliveryFailure, { loanId, event: "requested", message: "n8n down" });
    const [err] = await s.admin.query(api.admin.listAutomationErrors, {});
    return { ...s, loanId, err };
  }

  test("an admin can retry a failed notification: it is re-scheduled and audit-logged", async () => {
    const { t, admin, loanId, err } = await failedNotification();
    expect(err).toMatchObject({ canRetry: true, toolName: "Cordless drill", event: "requested", resolvedAt: null });
    await admin.mutation(api.admin.retryNotification, { errorId: err._id });
    const scheduled = await t.run((ctx) => ctx.db.system.query("_scheduled_functions").collect());
    const retries = scheduled.filter(
      (s) => s.name.includes("deliver") && (s.args[0] as { loanId: string; attempt: number }).loanId === loanId,
    );
    expect(retries.length).toBeGreaterThanOrEqual(2); // original + admin retry
    expect((await admin.query(api.admin.listAutomationErrors, {}))[0].retriedAt).not.toBeNull();
    const audit = await t.run((ctx) => ctx.db.query("auditLog").collect());
    expect(audit.map((a) => a.action)).toContain("notification.retry");
  });

  test("a successful delivery marks the error resolved; a repeat failure re-opens the same row", async () => {
    const { t, admin, loanId, err } = await failedNotification();
    vi.stubGlobal("fetch", async () => new Response("ok", { status: 202 }));
    await t.action(internal.notifications.deliver, { loanId, event: "requested", attempt: 1 });
    let rows = await admin.query(api.admin.listAutomationErrors, {});
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ _id: err._id, canRetry: false });
    expect(rows[0].resolvedAt).not.toBeNull();

    await t.mutation(internal.notifications.recordDeliveryFailure, { loanId, event: "requested", message: "down again" });
    rows = await admin.query(api.admin.listAutomationErrors, {});
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ message: "down again", resolvedAt: null, canRetry: true });
  });

  test("only admins can retry or resolve; n8n-side errors can be resolved but not retried here", async () => {
    const { t, admin, bob, err } = await failedNotification();
    await expect(bob.mutation(api.admin.retryNotification, { errorId: err._id })).rejects.toThrow(/Admins only/);
    await expect(bob.mutation(api.admin.resolveError, { errorId: err._id })).rejects.toThrow(/Admins only/);

    const n8nError = await t.run((ctx) =>
      ctx.db.insert("automationErrors", { source: "n8n: Overdue reminders", message: "Resend 500", idempotencyKey: "n8n:42", at: Date.now() }),
    );
    await expect(admin.mutation(api.admin.retryNotification, { errorId: n8nError })).rejects.toThrow(/came from n8n/);
    await admin.mutation(api.admin.resolveError, { errorId: n8nError });
    const row = (await admin.query(api.admin.listAutomationErrors, {})).find((r) => r._id === n8nError);
    expect(row?.resolvedAt).not.toBeNull();
  });
});
