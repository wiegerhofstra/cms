import "server-only";

import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware, getSessionFromCtx } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { admin, twoFactor } from "better-auth/plugins";

import { db } from "@/db";
import * as schema from "@/db/schema";

export const auth = betterAuth({
  appName: "CMS",
  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
    transaction: true,
  }),
  emailAndPassword: {
    enabled: true,
    // Accounts are created by administrators or through invite links, never by public sign-up.
    disableSignUp: true,
  },
  user: {
    additionalFields: {
      // Every account created from now on must set up two-factor authentication; see getCmsContext.
      twoFactorRequired: { type: "boolean", required: false, defaultValue: true, input: false },
    },
  },
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== "/two-factor/disable") return;
      const session = await getSessionFromCtx(ctx);
      if (session?.user.twoFactorRequired) {
        throw new APIError("FORBIDDEN", { message: "Two-factor authentication is required for your account and can't be turned off." });
      }
    }),
  },
  plugins: [admin(), twoFactor({ issuer: "CMS" }), nextCookies()],
});

export type AuthSession = typeof auth.$Infer.Session;
