import "server-only";

import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { admin } from "better-auth/plugins";

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
  plugins: [admin(), nextCookies()],
});

export type AuthSession = typeof auth.$Infer.Session;
