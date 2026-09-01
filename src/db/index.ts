import "server-only";

import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { getEnv } from "@/lib/env";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as {
  cmsPool?: Pool;
};

const pool =
  globalForDb.cmsPool ??
  new Pool({
    connectionString: getEnv().DATABASE_URL,
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.cmsPool = pool;
}

export const db = drizzle(pool, { schema });
export type Db = typeof db;
