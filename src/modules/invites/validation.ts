import { z } from "zod";

export const inviteExpiryDays = [1, 7, 30] as const;

export const createInviteSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .optional()
    .transform((value) => value || undefined)
    .pipe(z.email("Enter a valid email address").optional()),
  role: z.enum(["admin", "user"]).default("user"),
  memberships: z
    .array(z.object({ tenantId: z.uuid(), role: z.enum(["owner", "editor"]) }))
    .max(100)
    .default([]),
  expiresInDays: z.union(inviteExpiryDays.map((days) => z.literal(days))).default(7),
});

export const acceptInviteSchema = z.object({
  name: z.string().trim().min(1, "Enter your name").max(120),
  email: z.email("Enter a valid email address").trim().toLowerCase(),
  password: z.string().min(8, "Use at least 8 characters").max(200),
});

export type CreateInviteInput = z.input<typeof createInviteSchema>;
export type AcceptInviteInput = z.input<typeof acceptInviteSchema>;
