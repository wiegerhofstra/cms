import "server-only";

import { and, desc, eq, gt, inArray, isNull, sql } from "drizzle-orm";
import { headers } from "next/headers";
import type { ZodType } from "zod";

import { db } from "@/db";
import { tenantMemberships, tenants, user, userInvites, type InviteMembership } from "@/db/schema";
import { auth } from "@/lib/auth/server";
import { getCmsContext, requireAdmin } from "@/lib/cms/context";
import { CmsError } from "@/lib/cms/errors";
import { generateInviteToken, hashInviteToken } from "./token";
import type { InviteStatus, InviteSummary } from "./types";
import { acceptInviteSchema, createInviteSchema } from "./validation";

const invalidInviteMessage = "This invite link is no longer valid. Ask an administrator for a new one.";

async function requireAdminContext() {
  const context = await getCmsContext(crypto.randomUUID());
  requireAdmin(context);
  return context;
}

function parse<T>(schema: ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) throw new CmsError("VALIDATION_ERROR", result.error.issues[0]?.message ?? "Check the form and try again");
  return result.data;
}

function inviteStatus(invite: typeof userInvites.$inferSelect, now = new Date()): InviteStatus {
  if (invite.acceptedAt) return "accepted";
  if (invite.revokedAt) return "revoked";
  if (invite.expiresAt <= now) return "expired";
  return "pending";
}

/** Creates an invite and returns the only copy of its link path; the database keeps just a hash of the token. */
export async function createInvite(input: unknown): Promise<{ invite: InviteSummary; path: string }> {
  const context = await requireAdminContext();
  const data = parse(createInviteSchema, input);
  const memberships = Array.from(new Map(data.memberships.map((membership) => [membership.tenantId, membership])).values());

  if (memberships.length) {
    const found = await db.select({ id: tenants.id }).from(tenants).where(inArray(tenants.id, memberships.map((membership) => membership.tenantId)));
    if (found.length !== memberships.length) throw new CmsError("VALIDATION_ERROR", "One or more workspaces no longer exist");
  }

  if (data.email) {
    const [existing] = await db.select({ id: user.id }).from(user).where(eq(user.email, data.email)).limit(1);
    if (existing) throw new CmsError("CONFLICT", "Someone with this email already has an account");
  }

  const { token, tokenHash } = generateInviteToken();
  const [invite] = await db
    .insert(userInvites)
    .values({
      tokenHash,
      email: data.email ?? null,
      role: data.role,
      memberships,
      createdBy: context.user.id,
      expiresAt: new Date(Date.now() + data.expiresInDays * 24 * 60 * 60 * 1000),
    })
    .returning();
  if (!invite) throw new CmsError("INTERNAL_SERVER_ERROR", "The invite could not be created");

  const [summary] = await summarize([invite]);
  return { invite: summary!, path: `/invite/${token}` };
}

/** Pending invites first, then the most recent accepted, revoked, or expired ones. */
export async function listInvites(): Promise<InviteSummary[]> {
  await requireAdminContext();
  const rows = await db.select().from(userInvites).orderBy(desc(userInvites.createdAt)).limit(50);
  const summaries = await summarize(rows);
  const pending = summaries.filter((invite) => invite.status === "pending");
  const closed = summaries.filter((invite) => invite.status !== "pending").slice(0, 10);
  return [...pending, ...closed];
}

export async function revokeInvite(inviteId: string): Promise<void> {
  await requireAdminContext();
  const [revoked] = await db
    .update(userInvites)
    .set({ revokedAt: new Date() })
    .where(and(eq(userInvites.id, inviteId), isNull(userInvites.acceptedAt), isNull(userInvites.revokedAt)))
    .returning({ id: userInvites.id });
  if (!revoked) throw new CmsError("NOT_FOUND", "This invite was already used or revoked");
}

/** Public lookup for the invite page. Reveals only whether the link works and which email it is for. */
export async function getInviteForToken(token: string): Promise<{ status: InviteStatus | "invalid"; email: string | null }> {
  const [invite] = await db.select().from(userInvites).where(eq(userInvites.tokenHash, hashInviteToken(token))).limit(1);
  if (!invite) return { status: "invalid", email: null };
  return { status: inviteStatus(invite), email: invite.email };
}

/** Creates the invited account, gives it the invite's access, and signs the new user in. */
export async function acceptInvite(token: string, input: unknown): Promise<void> {
  const data = parse(acceptInviteSchema, input);
  const tokenHash = hashInviteToken(token);
  const [invite] = await db.select().from(userInvites).where(eq(userInvites.tokenHash, tokenHash)).limit(1);
  if (!invite || inviteStatus(invite) !== "pending") throw new CmsError("BAD_REQUEST", invalidInviteMessage);
  if (invite.email && invite.email !== data.email) throw new CmsError("BAD_REQUEST", `This invite is for ${invite.email}.`);

  const [existing] = await db.select({ id: user.id }).from(user).where(eq(user.email, data.email)).limit(1);
  if (existing) throw new CmsError("CONFLICT", "An account with this email already exists. Sign in instead.");

  // Claim the invite first so two people can't use the same link at the same time.
  const [claimed] = await db
    .update(userInvites)
    .set({ acceptedAt: new Date() })
    .where(and(eq(userInvites.id, invite.id), isNull(userInvites.acceptedAt), isNull(userInvites.revokedAt), gt(userInvites.expiresAt, sql`now()`)))
    .returning({ id: userInvites.id });
  if (!claimed) throw new CmsError("BAD_REQUEST", invalidInviteMessage);

  let userId: string;
  try {
    const created = await auth.api.createUser({
      body: { email: data.email, password: data.password, name: data.name, role: invite.role === "admin" ? "admin" : "user" },
    });
    userId = created.user.id;
  } catch (error) {
    await db.update(userInvites).set({ acceptedAt: null }).where(eq(userInvites.id, invite.id));
    throw error instanceof CmsError ? error : new CmsError("BAD_REQUEST", "Your account could not be created. Try again or ask for a new invite.");
  }

  if (invite.memberships.length) {
    await db.insert(tenantMemberships).values(invite.memberships.map((membership) => ({ tenantId: membership.tenantId, userId, role: membership.role }))).onConflictDoNothing();
  }
  await db.update(userInvites).set({ acceptedBy: userId }).where(eq(userInvites.id, invite.id));

  await auth.api.signInEmail({ body: { email: data.email, password: data.password }, headers: await headers() });
}

async function summarize(rows: Array<typeof userInvites.$inferSelect>): Promise<InviteSummary[]> {
  const tenantIds = Array.from(new Set(rows.flatMap((row) => row.memberships.map((membership: InviteMembership) => membership.tenantId))));
  const userIds = Array.from(new Set(rows.flatMap((row) => [row.createdBy, row.acceptedBy]).filter((id): id is string => Boolean(id))));
  const [tenantRows, userRows] = await Promise.all([
    tenantIds.length ? db.select({ id: tenants.id, name: tenants.name }).from(tenants).where(inArray(tenants.id, tenantIds)) : Promise.resolve([]),
    userIds.length ? db.select({ id: user.id, name: user.name, email: user.email }).from(user).where(inArray(user.id, userIds)) : Promise.resolve([]),
  ]);
  const tenantNames = new Map(tenantRows.map((tenant) => [tenant.id, tenant.name]));
  const userNames = new Map(userRows.map((row) => [row.id, row.name || row.email]));
  const now = new Date();

  return rows.map((row) => ({
    id: row.id,
    email: row.email,
    role: row.role === "admin" ? "admin" : "user",
    memberships: row.memberships
      .filter((membership) => tenantNames.has(membership.tenantId))
      .map((membership) => ({ tenantId: membership.tenantId, tenantName: tenantNames.get(membership.tenantId)!, role: membership.role })),
    createdBy: row.createdBy ? userNames.get(row.createdBy) ?? null : null,
    acceptedBy: row.acceptedBy ? userNames.get(row.acceptedBy) ?? null : null,
    status: inviteStatus(row, now),
    expiresAt: row.expiresAt.toISOString(),
    acceptedAt: row.acceptedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  }));
}
