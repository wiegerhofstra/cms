export type InviteStatus = "pending" | "accepted" | "revoked" | "expired";

export type InviteSummary = {
  id: string;
  email: string | null;
  role: "admin" | "user";
  memberships: Array<{ tenantId: string; tenantName: string; role: "owner" | "editor" }>;
  createdBy: string | null;
  acceptedBy: string | null;
  status: InviteStatus;
  expiresAt: string;
  acceptedAt: string | null;
  createdAt: string;
};

export type InviteActionResult<T> = { ok: true; data: T } | { ok: false; error: string };
