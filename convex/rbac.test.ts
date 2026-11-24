/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { todayUtc } from "./lib/validate";

const modules = import.meta.glob("./**/*.ts");
const day = (n: number) => todayUtc(Date.now() + n * 86_400_000);

const ALICE = { subject: "alice", email: "alice@example.com", name: "Alice" };
const BOB = { subject: "bob", email: "bob@example.com", name: "Bob" };
const ADMIN = { subject: "admin", email: "admin@example.com", name: "Ada Admin" };

const drill = { name: "Cordless drill", category: "power_tools", condition: "good", description: "18V, two batteries" } as const;

async function setup() {
  const t = convexTest(schema, modules);
  const alice = t.withIdentity(ALICE);
  const bob = t.withIdentity(BOB);
  const admin = t.withIdentity(ADMIN);
  for (const u of [alice, bob, admin]) await u.mutation(api.users.store, {});
  return { t, alice, bob, admin };
}

beforeEach(() => {
  vi.stubEnv("ADMIN_EMAILS", "admin@example.com");
});

describe("public page", () => {
  test("shows only name + category of available tools, no owner details", async () => {
    const { t, alice } = await setup();
    await alice.mutation(api.tools.create, drill);
    const rows = await t.query(api.tools.listPublic, {});
    expect(rows).toEqual([{ name: "Cordless drill", category: "power_tools" }]);
  });

  test("signed-out visitors cannot list, create or request", async () => {
    const { t, alice } = await setup();
    const toolId = await alice.mutation(api.tools.create, drill);
    await expect(t.query(api.tools.list, {})).rejects.toThrow(/sign in/i);
    await expect(t.mutation(api.tools.create, drill)).rejects.toThrow(/sign in/i);
    await expect(
      t.mutation(api.loans.request, { toolId, startDate: day(1), endDate: day(3) }),
    ).rejects.toThrow(/sign in/i);
  });
});

describe("roles", () => {
  test("role comes from ADMIN_EMAILS, not from the client", async () => {
    const { alice, admin } = await setup();
    expect((await alice.query(api.users.me, {}))?.role).toBe("user");
    expect((await admin.query(api.users.me, {}))?.role).toBe("admin");
  });

  test("removing an email from ADMIN_EMAILS revokes admin on next sign-in", async () => {
    const { admin } = await setup();
    vi.stubEnv("ADMIN_EMAILS", "");
    await admin.mutation(api.users.store, {});
    expect((await admin.query(api.users.me, {}))?.role).toBe("user");
    await expect(admin.query(api.admin.listLoans, {})).rejects.toThrow(/Admins only/);
  });
});

describe("listings: owner-only edits", () => {
  test("a user cannot edit or delete someone else's listing", async () => {
    const { alice, bob } = await setup();
    const toolId = await alice.mutation(api.tools.create, drill);
    await expect(bob.mutation(api.tools.update, { toolId, ...drill, name: "Mine now" })).rejects.toThrow(
      /your own listings/,
    );
    await expect(bob.mutation(api.tools.remove, { toolId })).rejects.toThrow(/your own listings/);
    await alice.mutation(api.tools.update, { toolId, ...drill, name: "Cordless drill (v2)" });
    await alice.mutation(api.tools.remove, { toolId });
  });

  test("input is validated server-side", async () => {
    const { alice } = await setup();
    await expect(alice.mutation(api.tools.create, { ...drill, name: " x " })).rejects.toThrow(/at least 2/);
    await expect(alice.mutation(api.tools.create, { ...drill, description: "a".repeat(501) })).rejects.toThrow(
      /at most 500/,
    );
  });

  test("an owner cannot delete a tool that is out on loan", async () => {
    const { alice, bob } = await setup();
    const toolId = await alice.mutation(api.tools.create, drill);
    const loanId = await bob.mutation(api.loans.request, { toolId, startDate: day(0), endDate: day(2) });
    await alice.mutation(api.loans.approve, { loanId });
    await expect(alice.mutation(api.tools.remove, { toolId })).rejects.toThrow(/out on loan/);
  });
});

describe("loans: only the right party can act", () => {
  test("full lifecycle: request -> approve -> returned updates availability", async () => {
    const { alice, bob } = await setup();
    const toolId = await alice.mutation(api.tools.create, drill);
    // Starts today, so approval puts the tool out on loan immediately.
    const loanId = await bob.mutation(api.loans.request, { toolId, startDate: day(0), endDate: day(4) });

    expect((await alice.query(api.loans.incoming, {}))[0]).toMatchObject({ status: "requested", role: "lender" });
    await alice.mutation(api.loans.approve, { loanId });
    expect((await bob.query(api.tools.list, {}))[0].status).toBe("on_loan");

    await alice.mutation(api.loans.markReturned, { loanId });
    expect((await bob.query(api.tools.list, {}))[0].status).toBe("available");
    expect((await bob.query(api.loans.myRequests, {}))[0].status).toBe("returned");
  });

  test("the borrower cannot approve, decline or mark returned", async () => {
    const { alice, bob } = await setup();
    const toolId = await alice.mutation(api.tools.create, drill);
    const loanId = await bob.mutation(api.loans.request, { toolId, startDate: day(1), endDate: day(2) });
    await expect(bob.mutation(api.loans.approve, { loanId })).rejects.toThrow(/Only the lender/);
    await expect(bob.mutation(api.loans.decline, { loanId })).rejects.toThrow(/Only the lender/);
    await alice.mutation(api.loans.approve, { loanId });
    await expect(bob.mutation(api.loans.markReturned, { loanId })).rejects.toThrow(/Only the lender/);
  });

  test("a third party (even an admin) cannot act on someone else's loan", async () => {
    const { alice, bob, admin } = await setup();
    const toolId = await alice.mutation(api.tools.create, drill);
    const loanId = await bob.mutation(api.loans.request, { toolId, startDate: day(1), endDate: day(2) });
    await expect(admin.mutation(api.loans.approve, { loanId })).rejects.toThrow(/Only the lender/);
    await expect(admin.mutation(api.loans.cancel, { loanId })).rejects.toThrow(/Only the borrower/);
  });

  test("other people's requests are not visible", async () => {
    const { t, alice, bob } = await setup();
    const carol = t.withIdentity({ subject: "carol", email: "carol@example.com", name: "Carol" });
    await carol.mutation(api.users.store, {});
    const toolId = await alice.mutation(api.tools.create, drill);
    await bob.mutation(api.loans.request, { toolId, startDate: day(1), endDate: day(2) });
    expect(await carol.query(api.loans.myRequests, {})).toEqual([]);
    expect(await carol.query(api.loans.incoming, {})).toEqual([]);
  });

  test("cannot borrow your own tool, or open duplicate requests", async () => {
    const { alice, bob } = await setup();
    const toolId = await alice.mutation(api.tools.create, drill);
    await expect(
      alice.mutation(api.loans.request, { toolId, startDate: day(1), endDate: day(2) }),
    ).rejects.toThrow(/your own tool/);
    await bob.mutation(api.loans.request, { toolId, startDate: day(1), endDate: day(2) });
    await expect(
      bob.mutation(api.loans.request, { toolId, startDate: day(5), endDate: day(6) }),
    ).rejects.toThrow(/already have an open request/);
  });

  test("dates are validated: no past starts, max 30 days, end after start", async () => {
    const { alice, bob } = await setup();
    const toolId = await alice.mutation(api.tools.create, drill);
    const req = (startDate: string, endDate: string) => bob.mutation(api.loans.request, { toolId, startDate, endDate });
    await expect(req(day(-1), day(2))).rejects.toThrow(/past/);
    await expect(req(day(3), day(1))).rejects.toThrow(/on or after/);
    await expect(req(day(1), day(40))).rejects.toThrow(/at most 30 days/);
    await expect(req("2026-02-30", "2026-03-02")).rejects.toThrow(/valid/);
  });

  test("two overlapping requests can't both be approved", async () => {
    const { t, alice, bob } = await setup();
    const carol = t.withIdentity({ subject: "carol", email: "carol@example.com", name: "Carol" });
    await carol.mutation(api.users.store, {});
    const toolId = await alice.mutation(api.tools.create, drill);
    const l1 = await bob.mutation(api.loans.request, { toolId, startDate: day(1), endDate: day(3) });
    const l2 = await carol.mutation(api.loans.request, { toolId, startDate: day(3), endDate: day(5) });
    await alice.mutation(api.loans.approve, { loanId: l1 });
    await expect(alice.mutation(api.loans.approve, { loanId: l2 })).rejects.toThrow(/overlap an existing booking/);
  });
});

describe("admin", () => {
  test("regular users cannot use any admin function", async () => {
    const { alice, bob } = await setup();
    const toolId = await alice.mutation(api.tools.create, drill);
    const bobMe = await bob.query(api.users.me, {});
    await expect(alice.query(api.admin.listLoans, {})).rejects.toThrow(/Admins only/);
    await expect(alice.query(api.admin.listUsers, {})).rejects.toThrow(/Admins only/);
    await expect(bob.mutation(api.admin.removeTool, { toolId })).rejects.toThrow(/Admins only/);
    await expect(alice.mutation(api.admin.setTrustedLender, { userId: bobMe!._id, trusted: true })).rejects.toThrow(
      /Admins only/,
    );
  });

  test("admin can remove any listing (closing its loans), mark Trusted Lender, and both are audited", async () => {
    const { t, alice, bob, admin } = await setup();
    const toolId = await alice.mutation(api.tools.create, drill);
    const loanId = await bob.mutation(api.loans.request, { toolId, startDate: day(0), endDate: day(2) });
    await alice.mutation(api.loans.approve, { loanId });

    await admin.mutation(api.admin.removeTool, { toolId, reason: "Unsafe item" });
    expect(await bob.query(api.tools.list, {})).toEqual([]);
    expect((await bob.query(api.loans.myRequests, {}))[0].status).toBe("cancelled");

    const aliceMe = await alice.query(api.users.me, {});
    await admin.mutation(api.admin.setTrustedLender, { userId: aliceMe!._id, trusted: true });
    expect((await alice.query(api.users.me, {}))?.trustedLender).toBe(true);

    const audit = await t.run((ctx) => ctx.db.query("auditLog").collect());
    expect(audit.map((a) => a.action).sort()).toEqual(["tool.remove", "trusted_lender.grant"]);
    expect((await admin.query(api.admin.listLoans, {})).length).toBe(1);
  });

  test("a member without a name gets a neutral handle, never part of their email", async () => {
    const { t, bob } = await setup();
    const noName = t.withIdentity({ subject: "nn", email: "secret.person@example.com" });
    await noName.mutation(api.users.store, {});
    await noName.mutation(api.tools.create, drill);
    const board = await bob.query(api.tools.list, {});
    expect(board[0].owner.name).toMatch(/^Neighbour [0-9A-Z]{4}$/);
    expect(JSON.stringify(board)).not.toContain("secret");
  });

  test("users never see other members' emails", async () => {
    const { alice, bob } = await setup();
    await alice.mutation(api.tools.create, drill);
    const board = await bob.query(api.tools.list, {});
    expect(JSON.stringify(board)).not.toContain("alice@example.com");
    expect(board[0].owner).toEqual({ name: "Alice", trustedLender: false });
  });
});
