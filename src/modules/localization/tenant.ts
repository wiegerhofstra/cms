import { eq } from "drizzle-orm";

import type { Db } from "@/db";
import { tenants } from "@/db/schema";
import { defaultLocalization, type TenantLocalization } from "./locales";

export async function getTenantLocalization(database: Pick<Db, "select">, tenantId: string): Promise<TenantLocalization> {
  const [tenant] = await database
    .select({ defaultLocale: tenants.defaultLocale, locales: tenants.locales })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);
  return tenant ?? defaultLocalization;
}
