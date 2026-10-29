import "server-only";

import { and, asc, count, desc, eq, ilike, inArray, isNull, max, ne, or, sql } from "drizzle-orm";
import { connection } from "next/server";
import { cache } from "react";
import { z, type ZodType } from "zod";

import { db } from "@/db";
import { assets, contentEntries, contentModelFields, contentModelFieldTargets, contentModels, entryRevisions, tenantMemberships, tenants, twoFactor, user, verification } from "@/db/schema";
import { auth } from "@/lib/auth/server";
import { getCmsContext, requireAdmin, requireTenantContext, type CmsRequestContext } from "@/lib/cms/context";
import { CmsError, CmsError as ApiError } from "@/lib/cms/errors";
import type {
  Asset,
  AssetSort,
  AssetWithPreview,
  CmsSessionView,
  ContentEntry,
  ContentField,
  ContentModel,
  DashboardData,
  DashboardEntry,
  EntryListData,
  EntryRevision,
  LoadWorkbenchDataInput,
  ManagedUser,
  TenantSummary,
  WorkbenchData,
  WorkbenchShell,
} from "@/lib/cms/types";
import { titleValue } from "@/components/workbench/utils";
import { getEnv } from "@/lib/env";
import { deleteS3Object, presignRead, presignUpload } from "@/lib/storage/s3";
import { setActiveTenantId } from "@/lib/tenant/active-tenant";
import { createEntryRevision, getActiveModel, getTenantEntry, sanitizeEntryTranslations, validateEntryData, validateEntryDataForPublish } from "@/modules/entries/service";
import { lockPagePaths, validatePagePaths, validatePageUrlConfig } from "@/modules/entries/links";
import { referencedAssetIds } from "@/modules/entries/assets";
import { childEntrySchema, entryDataSchema, entryStatusSchema, reorderChildrenSchema, updateEntrySchema } from "@/modules/entries/validation";
import { isUniqueViolation, normalizeFieldInput } from "@/modules/models/fields";
import { deleteModelField } from "@/modules/models/delete-field";
import { createModelSchema, fieldInputSchema, modelStatusSchema, moveFieldSchema, updateFieldSchema, updateModelSchema } from "@/modules/models/validation";
import { extractImageDimensions } from "@/modules/uploads/image-dimensions";
import { completeUploadSchema, presignUploadSchema, sanitizeFilename, assertAllowedUpload } from "@/modules/uploads/validation";
import { createUploadToken, parseUploadToken } from "@/modules/uploads/token";
import { listAccessTokensForContext } from "@/modules/access-tokens/service";
import { getRevalidationStatus } from "@/modules/revalidation/service";
import { defaultLocalization } from "@/modules/localization/locales";
import { getTenantLocalization } from "@/modules/localization/tenant";

const createTenantSchema = z.object({
  name: z.string().trim().min(1).max(120),
  slug: z
    .string()
    .trim()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers, and hyphens")
    .max(80)
    .optional(),
});

const updateAssetSchema = z.object({
  originalName: z.string().trim().min(1).max(255),
});

const appRoleSchema = z.enum(["admin", "user"]);
const tenantRoleSchema = z.enum(["owner", "editor"]);
const assetPageSize = 12;

const createUserSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.email().trim().toLowerCase(),
  password: z.string().min(8).max(200),
  role: appRoleSchema.default("user"),
  memberships: z
    .array(
      z.object({
        tenantId: z.uuid(),
        role: tenantRoleSchema,
      }),
    )
    .default([]),
});

const updateUserSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  email: z.email().trim().toLowerCase().optional(),
  password: z.string().min(8).max(200).optional(),
  role: appRoleSchema.optional(),
});

const assignTenantSchema = z.object({
  tenantId: z.uuid(),
  role: tenantRoleSchema,
});

type TenantContext = CmsRequestContext & { activeMembership: NonNullable<CmsRequestContext["activeMembership"]>; activeTenantId: string };
type DateLike = Date | string;
type ModelRow = Omit<ContentModel, "createdAt" | "updatedAt"> & { createdAt: DateLike; updatedAt: DateLike };
type FieldRow = Omit<ContentField, "createdAt" | "updatedAt" | "targetModels"> & { createdAt: DateLike; updatedAt: DateLike };
type EntryRow = Omit<ContentEntry, "createdAt" | "updatedAt" | "publishedAt" | "deletedAt"> & {
  createdAt: DateLike;
  updatedAt: DateLike;
  publishedAt: DateLike | null;
  deletedAt: DateLike | null;
};
type RevisionRow = Omit<EntryRevision, "createdAt"> & { createdAt: DateLike };
type AssetRow = Omit<Asset, "createdAt" | "updatedAt" | "deletedAt"> & {
  createdAt: DateLike;
  updatedAt: DateLike;
  deletedAt: DateLike | null;
};
type UserRow = Omit<ManagedUser, "role" | "createdAt" | "updatedAt" | "banExpires" | "memberships"> & {
  role: string;
  createdAt: DateLike;
  updatedAt: DateLike;
  banExpires: DateLike | null;
};

export async function getWorkbenchData(input: LoadWorkbenchDataInput = {}): Promise<WorkbenchData> {
  // Request IDs and the session context must be generated from the current request.
  await connection();
  const context = await getCmsContext(crypto.randomUUID(), input.tenantSlug);
  const me = serializeMe(context);
  const query = input.query ?? "";
  const assetQuery = input.assetQuery?.trim() ?? "";
  const assetSort = input.assetSort ?? "date-desc";
  const assetPage = Math.max(1, input.assetPage ?? 1);

  if (input.tenantSlug && !context.activeMembership) {
    throw new CmsError("NOT_FOUND", "Tenant was not found");
  }

  if (input.view === "users") {
    const [usersData, tenantsData] = await Promise.all([listManagedUsersForContext(context), listTenantSummariesForContext(context)]);
    return {
      ...emptyWorkbenchData(me, query),
      users: usersData,
      tenants: tenantsData,
    };
  }

  if (input.view === "auth") {
    const [accessTokenData, tenantsData] = await Promise.all([
      listAccessTokensForContext(context),
      listTenantSummariesForContext(context),
    ]);
    return {
      ...emptyWorkbenchData(me, query),
      accessTokens: accessTokenData,
      tenants: tenantsData,
    };
  }

  if (input.view === "tenant-settings") {
    return {
      ...emptyWorkbenchData(me, query),
      tenants: await listTenantSummariesForContext(context),
    };
  }

  if (!context.activeTenantId || !context.activeMembership) {
    return emptyWorkbenchData(me, query);
  }

  const tenantContext: TenantContext = {
    ...context,
    activeMembership: context.activeMembership,
    activeTenantId: context.activeTenantId,
  };
  const view = input.view ?? "dashboard";
  const [modelRows, assetResults, localization] = await Promise.all([
    listModelsForContext(tenantContext),
    listAssetsForContext(
      tenantContext,
      view === "assets" ? { query: assetQuery, sort: assetSort, page: assetPage, pageSize: assetPageSize } : undefined,
    ),
    getTenantLocalization(db, tenantContext.activeTenantId),
  ]);
  let models = modelRows;
  let entry: ContentEntry | null = null;
  let revisions: EntryRevision[] = [];

  if (input.entryId) {
    const entryResponse = await getEntryForContext(tenantContext, input.entryId);
    entry = entryResponse.entry;
    revisions = entryResponse.revisions;
  }

  const requestedModelId = input.preferredModelId ?? input.modelId ?? entry?.modelId ?? "";
  if (requestedModelId && !models.some((model) => model.id === requestedModelId)) {
    const requestedModel = await getModelForContext(tenantContext, requestedModelId);
    models = [requestedModel, ...models];
  }

  const activeModelId = requestedModelId || (view === "entries" ? "" : (models[0]?.id ?? ""));
  const shouldLoadModel = Boolean(activeModelId && ["models", "model-detail", "entries", "model-entries", "entry-new", "entry-detail"].includes(view));
  const [fields, entries] = await Promise.all([
    shouldLoadModel ? getModelFieldsForContext(tenantContext, activeModelId) : Promise.resolve([]),
    activeModelId && (view === "models" || view === "model-detail")
      ? listEntriesForContext(tenantContext, activeModelId, query)
      : Promise.resolve([]),
  ]);
  const componentReferences = shouldLoadModel ? await listComponentReferencesForContext(tenantContext, fields) : [];
  if (entry && view === "entry-detail") {
    const loadedIds = new Set(assetResults.assets.map((asset) => asset.id));
    const missingIds = [entry.data, ...Object.values(entry.translations)]
      .flatMap((data) => referencedAssetIds(fields, data))
      .filter((id) => !loadedIds.has(id));
    if (missingIds.length) {
      const referenced = await db.select().from(assets).where(and(
        eq(assets.tenantId, tenantContext.activeTenantId), inArray(assets.id, missingIds),
        eq(assets.status, "ready"), sql`${assets.deletedAt} is null`,
      ));
      assetResults.assets.push(...await assetsWithPreviews(referenced));
    }
  }

  return {
    me,
    localization,
    models,
    fields,
    entries,
    componentReferences,
    entry,
    revisions,
    assets: assetResults.assets,
    assetQuery,
    assetSort,
    assetPage,
    assetPageSize: view === "assets" ? assetPageSize : 100,
    assetTotal: assetResults.total,
    users: [],
    accessTokens: [],
    tenants: [],
    activeModelId,
    activeEntryId: entry?.id ?? input.entryId ?? "",
    entryQuery: query,
  };
}

/**
 * Data for the workbench chrome (sidebar and header). Cached per request so the layout and page can share it.
 * Without a tenant slug (settings pages), it falls back to the active tenant cookie, then the first membership.
 */
export const getWorkbenchShell = cache(async (tenantSlug?: string): Promise<WorkbenchShell> => {
  await connection();
  const context = await getCmsContext(crypto.randomUUID(), tenantSlug);
  if (tenantSlug && !context.activeMembership) throw new CmsError("NOT_FOUND", "Tenant was not found");

  const me = serializeMe(context);
  const activeMembership = context.activeMembership ?? context.memberships[0] ?? null;
  if (!activeMembership) return { me, activeMembership: null, models: [], revalidation: { configured: false, lastRevalidatedAt: null } };

  const tenantContext: TenantContext = { ...context, activeMembership, activeTenantId: activeMembership.tenantId };
  const [models, revalidation] = await Promise.all([listModelsForContext(tenantContext), getRevalidationStatus(activeMembership.tenantId)]);
  return { me, activeMembership: me.memberships.find((membership) => membership.tenantId === activeMembership.tenantId) ?? null, models, revalidation };
});

export async function getEntryList(tenantSlug: string, modelId: string): Promise<EntryListData> {
  await connection();
  const context = await requireTenantContext(crypto.randomUUID(), tenantSlug);
  const [model, fields, entries] = await Promise.all([
    getModelForContext(context, modelId),
    getModelFieldsForContext(context, modelId),
    listEntriesForContext(context, modelId),
  ]);
  return { model, fields, entries };
}

export async function getDashboard(tenantSlug: string): Promise<DashboardData> {
  await connection();
  const context = await requireTenantContext(crypto.randomUUID(), tenantSlug);
  // Nested child entries are edited through their parent, so they're left out of the overview.
  const topLevel = and(eq(contentEntries.tenantId, context.activeTenantId), isNull(contentEntries.deletedAt), isNull(contentEntries.parentEntryId));
  const drafts = and(topLevel, eq(contentEntries.status, "draft"));

  const [recentRows, draftRows, [draftTotal], [entryTotal], titleFields] = await Promise.all([
    db.select().from(contentEntries).where(topLevel).orderBy(desc(contentEntries.updatedAt)).limit(8),
    db.select().from(contentEntries).where(drafts).orderBy(desc(contentEntries.updatedAt)).limit(6),
    db.select({ value: count() }).from(contentEntries).where(drafts),
    db.select({ value: count() }).from(contentEntries).where(topLevel),
    db.select({ modelId: contentModelFields.modelId, key: contentModelFields.key })
      .from(contentModelFields)
      .where(and(eq(contentModelFields.tenantId, context.activeTenantId), eq(contentModelFields.isTitle, true))),
  ]);
  const titleKeys = new Map(titleFields.map((field) => [field.modelId, field.key]));

  function dashboardEntry(row: typeof recentRows[number]): DashboardEntry {
    const titleKey = titleKeys.get(row.modelId);
    return {
      id: row.id,
      modelId: row.modelId,
      title: (titleKey ? titleValue(row.data[titleKey]) : "") || "Untitled entry",
      status: row.status,
      updatedAt: dateString(row.updatedAt),
    };
  }

  return {
    recentEntries: recentRows.map(dashboardEntry),
    drafts: draftRows.map(dashboardEntry),
    draftCount: draftTotal?.value ?? 0,
    entryCount: entryTotal?.value ?? 0,
  };
}

export async function createTenant(input: unknown) {
  const context = await getCmsContext(crypto.randomUUID());
  requireAdmin(context);
  const data = parseInput(createTenantSchema, input);
  const slug = data.slug ?? slugify(data.name);
  if (!slug) {
    throw new CmsError("VALIDATION_ERROR", "Tenant name must contain letters or numbers");
  }

  try {
    const tenant = await db.transaction(async (tx) => {
      const [createdTenant] = await tx.insert(tenants).values({ name: data.name, slug }).returning();
      if (!createdTenant) {
        throw new CmsError("INTERNAL_SERVER_ERROR", "Tenant could not be created");
      }

      await tx.insert(tenantMemberships).values({
        tenantId: createdTenant.id,
        userId: context.user.id,
        role: "owner",
      });

      return createdTenant;
    });

    await setActiveTenantId(tenant.id);
    return { tenant };
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new CmsError("CONFLICT", "A tenant with this slug already exists");
    }
    throw error;
  }
}

export async function listManagedUsers() {
  const context = await getCmsContext(crypto.randomUUID());
  return { users: await listManagedUsersForContext(context), tenants: await listTenantSummariesForContext(context), nextCursor: null };
}

export async function createManagedUser(input: unknown) {
  const context = await getCmsContext(crypto.randomUUID());
  requireAdmin(context);
  const data = parseInput(createUserSchema, input);

  try {
    const response = await auth.api.createUser({
      body: {
        email: data.email,
        password: data.password,
        name: data.name,
        role: data.role,
      },
    });

    const createdUser = response.user;
    if (data.memberships.length) {
      await db.insert(tenantMemberships).values(
        data.memberships.map((membership) => ({
          tenantId: membership.tenantId,
          userId: createdUser.id,
          role: membership.role,
        })),
      );
    }

    return { user: await getManagedUser(createdUser.id) };
  } catch (error) {
    if (isUniqueViolation(error)) throw new CmsError("CONFLICT", "A user with this email already exists");
    throw error;
  }
}

export async function updateManagedUser(userId: string, input: unknown) {
  const context = await getCmsContext(crypto.randomUUID());
  requireAdmin(context);
  const data = parseInput(updateUserSchema, input);

  if (context.user.id === userId && data.role && data.role !== "admin") {
    throw new CmsError("CONFLICT", "You cannot remove your own admin role");
  }

  const updateData: Partial<typeof user.$inferInsert> = {};
  if (data.name !== undefined) updateData.name = data.name;
  if (data.email !== undefined) updateData.email = data.email;
  if (data.role !== undefined) updateData.role = data.role;
  if (Object.keys(updateData).length) updateData.updatedAt = new Date();

  try {
    if (Object.keys(updateData).length) {
      const [updatedUser] = await db.update(user).set(updateData).where(eq(user.id, userId)).returning({ id: user.id });
      if (!updatedUser) throw new CmsError("NOT_FOUND", "User was not found");
    } else {
      const [existingUser] = await db.select({ id: user.id }).from(user).where(eq(user.id, userId)).limit(1);
      if (!existingUser) throw new CmsError("NOT_FOUND", "User was not found");
    }

    if (data.password) {
      await auth.api.setUserPassword({ body: { userId, newPassword: data.password } });
    }

    return { user: await getManagedUser(userId) };
  } catch (error) {
    if (isUniqueViolation(error)) throw new CmsError("CONFLICT", "A user with this email already exists");
    throw error;
  }
}

export async function deleteManagedUser(userId: string) {
  const context = await getCmsContext(crypto.randomUUID());
  requireAdmin(context);
  if (context.user.id === userId) throw new CmsError("CONFLICT", "You cannot delete your own account");

  await auth.api.removeUser({ body: { userId } });
  return { deleted: true as const, userId };
}

/** For someone who lost their authenticator app and backup codes. If their account requires two-factor authentication, they set it up again at their next sign-in. */
export async function resetManagedUserTwoFactor(userId: string) {
  const context = await getCmsContext(crypto.randomUUID());
  requireAdmin(context);
  if (context.user.id === userId) throw new CmsError("CONFLICT", "Manage your own two-factor authentication from your account menu");

  await db.transaction(async (tx) => {
    const [updatedUser] = await tx.update(user).set({ twoFactorEnabled: false, updatedAt: new Date() }).where(eq(user.id, userId)).returning({ id: user.id });
    if (!updatedUser) throw new CmsError("NOT_FOUND", "User was not found");
    await tx.delete(twoFactor).where(eq(twoFactor.userId, userId));
    // Devices trusted under the old setup must not skip the code once a new one is set up.
    await tx.delete(verification).where(and(eq(verification.value, userId), ilike(verification.identifier, "trust-device-%")));
  });

  return { user: await getManagedUser(userId) };
}

export async function assignTenantToUser(userId: string, input: unknown) {
  const context = await getCmsContext(crypto.randomUUID());
  requireAdmin(context);
  const data = parseInput(assignTenantSchema, input);

  const [targetUser, targetTenant] = await Promise.all([
    db.select({ id: user.id }).from(user).where(eq(user.id, userId)).limit(1),
    db.select({ id: tenants.id }).from(tenants).where(eq(tenants.id, data.tenantId)).limit(1),
  ]);
  if (!targetUser[0]) throw new CmsError("NOT_FOUND", "User was not found");
  if (!targetTenant[0]) throw new CmsError("NOT_FOUND", "Tenant was not found");

  await db
    .insert(tenantMemberships)
    .values({ tenantId: data.tenantId, userId, role: data.role })
    .onConflictDoUpdate({
      target: [tenantMemberships.tenantId, tenantMemberships.userId],
      set: { role: data.role },
    });

  return { user: await getManagedUser(userId) };
}

export async function removeTenantFromUser(userId: string, tenantId: string) {
  const context = await getCmsContext(crypto.randomUUID());
  requireAdmin(context);

  await db.delete(tenantMemberships).where(and(eq(tenantMemberships.userId, userId), eq(tenantMemberships.tenantId, tenantId)));
  return { user: await getManagedUser(userId) };
}

export async function switchTenant(tenantId: string) {
  const context = await getCmsContext(crypto.randomUUID());
  const [membership] = await db
    .select({
      tenantId: tenantMemberships.tenantId,
      role: tenantMemberships.role,
      tenant: {
        id: tenants.id,
        slug: tenants.slug,
        name: tenants.name,
      },
    })
    .from(tenantMemberships)
    .innerJoin(tenants, eq(tenantMemberships.tenantId, tenants.id))
    .where(and(eq(tenantMemberships.userId, context.user.id), eq(tenantMemberships.tenantId, tenantId)))
    .limit(1);

  if (!membership) {
    throw new CmsError("FORBIDDEN", "You do not have access to this tenant");
  }

  await setActiveTenantId(tenantId);
  return { activeTenantId: tenantId, membership };
}

export async function listModels(tenantSlug?: string) {
  const context = await requireTenantContext(crypto.randomUUID(), tenantSlug);
  return { models: await listModelsForContext(context), nextCursor: null };
}

export async function createModel(input: unknown, tenantSlug?: string) {
  const [context, data] = await Promise.all([
    requireTenantContext(crypto.randomUUID(), tenantSlug),
    Promise.resolve(parseInput(createModelSchema, input)),
  ]);
  const normalizedFields = await Promise.all(data.fields.map((field) => normalizeFieldInput(db, context.activeTenantId, field)));

  try {
    const model = await db.transaction(async (tx) => {
      const [createdModel] = await tx
        .insert(contentModels)
        .values({
          tenantId: context.activeTenantId,
          name: data.name,
          slug: data.slug,
          kind: data.kind,
          createdBy: context.user.id,
          updatedBy: context.user.id,
        })
        .returning();

      if (!createdModel) {
        throw new ApiError("INTERNAL_SERVER_ERROR", "Model could not be created");
      }

      for (const [index, normalizedField] of normalizedFields.entries()) {
        const { targetModelIds, ...fieldValues } = normalizedField;
        const [createdField] = await tx.insert(contentModelFields).values({
          ...fieldValues,
          tenantId: context.activeTenantId,
          modelId: createdModel.id,
          position: index,
        }).returning({ id: contentModelFields.id });
        if (createdField && targetModelIds.length) {
          await tx.insert(contentModelFieldTargets).values(targetModelIds.map((targetModelId) => ({ fieldId: createdField.id, targetModelId })));
        }
      }

      return createdModel;
    });

    return { model: serializeModel(model) };
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ApiError("CONFLICT", "A model with this slug or field key already exists");
    }
    throw error;
  }
}

export async function getModel(modelId: string, tenantSlug?: string) {
  const context = await requireTenantContext(crypto.randomUUID(), tenantSlug);
  const [model] = await db
    .select()
    .from(contentModels)
    .where(and(eq(contentModels.tenantId, context.activeTenantId), eq(contentModels.id, modelId)))
    .limit(1);

  if (!model) {
    throw new ApiError("NOT_FOUND", "Model was not found");
  }

  return { model: serializeModel(model), fields: await getModelFieldsForContext(context, modelId) };
}

export async function updateModel(modelId: string, input: unknown, tenantSlug?: string) {
  const [context, data] = await Promise.all([
    requireTenantContext(crypto.randomUUID(), tenantSlug),
    Promise.resolve(parseInput(updateModelSchema, input)),
  ]);
  modelStatusSchema.optional().parse(data.status);

  try {
    const model = await db.transaction(async (tx) => {
      await lockPagePaths(tx, context.activeTenantId);
      if (data.pageUrl !== undefined) await validatePageUrlConfig(tx, context.activeTenantId, modelId, data.pageUrl);
      const [updated] = await tx.update(contentModels)
        .set({ ...data, updatedBy: context.user.id, updatedAt: new Date() })
        .where(and(eq(contentModels.tenantId, context.activeTenantId), eq(contentModels.id, modelId))).returning();
      return updated;
    });

    if (!model) {
      throw new ApiError("NOT_FOUND", "Model was not found");
    }

    return { model: serializeModel(model) };
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ApiError("CONFLICT", "A model with this slug already exists");
    }
    throw error;
  }
}

export async function archiveModel(modelId: string, tenantSlug?: string) {
  const context = await requireTenantContext(crypto.randomUUID(), tenantSlug);
  const [model] = await db
    .update(contentModels)
    .set({ status: "archived", updatedBy: context.user.id, updatedAt: new Date() })
    .where(and(eq(contentModels.tenantId, context.activeTenantId), eq(contentModels.id, modelId)))
    .returning();

  if (!model) {
    throw new ApiError("NOT_FOUND", "Model was not found");
  }

  return { model: serializeModel(model) };
}

export async function deleteModel(modelId: string, tenantSlug?: string) {
  const context = await requireTenantContext(crypto.randomUUID(), tenantSlug);

  await db.transaction(async (tx) => {
    const [model] = await tx
      .select({ id: contentModels.id, status: contentModels.status })
      .from(contentModels)
      .where(and(eq(contentModels.tenantId, context.activeTenantId), eq(contentModels.id, modelId)))
      .for("update")
      .limit(1);

    if (!model) throw new ApiError("NOT_FOUND", "Model was not found");
    if (model.status !== "archived") throw new ApiError("CONFLICT", "Archive the model before deleting it");

    const [liveEntry] = await tx
      .select({ id: contentEntries.id })
      .from(contentEntries)
      .where(and(eq(contentEntries.tenantId, context.activeTenantId), eq(contentEntries.modelId, modelId), sql`${contentEntries.deletedAt} is null`))
      .limit(1);
    if (liveEntry) throw new ApiError("CONFLICT", "Delete all entries before deleting the model");

    const modelEntryIds = tx
      .select({ id: contentEntries.id })
      .from(contentEntries)
      .where(and(eq(contentEntries.tenantId, context.activeTenantId), eq(contentEntries.modelId, modelId)));
    const [liveChildEntry] = await tx
      .select({ id: contentEntries.id })
      .from(contentEntries)
      .where(and(eq(contentEntries.tenantId, context.activeTenantId), inArray(contentEntries.parentEntryId, modelEntryIds), sql`${contentEntries.deletedAt} is null`))
      .limit(1);
    if (liveChildEntry) throw new ApiError("CONFLICT", "Delete or unlink all child entries before deleting the model");

    const [componentReference] = await tx
      .select({ fieldId: contentModelFieldTargets.fieldId })
      .from(contentModelFieldTargets)
      .where(eq(contentModelFieldTargets.targetModelId, modelId))
      .limit(1);
    if (componentReference) throw new ApiError("CONFLICT", "Remove this model from component fields before deleting it");

    await tx
      .delete(contentEntries)
      .where(and(eq(contentEntries.tenantId, context.activeTenantId), eq(contentEntries.modelId, modelId), sql`${contentEntries.deletedAt} is not null`));

    const [deletedModel] = await tx
      .delete(contentModels)
      .where(and(eq(contentModels.tenantId, context.activeTenantId), eq(contentModels.id, modelId)))
      .returning({ id: contentModels.id });
    if (!deletedModel) throw new ApiError("NOT_FOUND", "Model was not found");
  });

  return { deleted: true as const, modelId };
}

export async function createField(modelId: string, input: unknown, tenantSlug?: string) {
  const [context, data] = await Promise.all([
    requireTenantContext(crypto.randomUUID(), tenantSlug),
    Promise.resolve(parseInput(fieldInputSchema, input)),
  ]);
  const [model] = await db
    .select({ id: contentModels.id, status: contentModels.status })
    .from(contentModels)
    .where(and(eq(contentModels.tenantId, context.activeTenantId), eq(contentModels.id, modelId)))
    .limit(1);

  if (!model) throw new ApiError("NOT_FOUND", "Model was not found");
  if (model.status === "archived") throw new ApiError("CONFLICT", "Archived models cannot be edited");

  const normalizedField = await normalizeFieldInput(db, context.activeTenantId, data);

  try {
    const field = await db.transaction(async (tx) => {
      const { targetModelIds, ...fieldValues } = normalizedField;
      if (normalizedField.isTitle) {
        await tx
          .update(contentModelFields)
          .set({ isTitle: false, updatedAt: new Date() })
          .where(and(eq(contentModelFields.tenantId, context.activeTenantId), eq(contentModelFields.modelId, modelId)));
      }

      const [positionRow] = await tx
        .select({ value: max(contentModelFields.position) })
        .from(contentModelFields)
        .where(and(eq(contentModelFields.tenantId, context.activeTenantId), eq(contentModelFields.modelId, modelId)));
      const [createdField] = await tx
        .insert(contentModelFields)
        .values({ ...fieldValues, tenantId: context.activeTenantId, modelId, position: (positionRow?.value ?? -1) + 1 })
        .returning();
      if (!createdField) throw new ApiError("INTERNAL_SERVER_ERROR", "Field could not be created");
      if (targetModelIds.length) {
        await tx.insert(contentModelFieldTargets).values(targetModelIds.map((targetModelId) => ({ fieldId: createdField.id, targetModelId })));
      }
      return createdField;
    });

    return { field: serializeField(field) };
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ApiError("CONFLICT", "A field with this key already exists");
    }
    throw error;
  }
}

export async function moveField(modelId: string, input: unknown, tenantSlug?: string) {
  const context = await requireTenantContext(crypto.randomUUID(), tenantSlug);
  const data = parseInput(moveFieldSchema, input);

  await db.transaction(async (tx) => {
    // Serialize moves for a model and use its current order, not a stale client list.
    const [model] = await tx.select({ id: contentModels.id, status: contentModels.status })
      .from(contentModels)
      .where(and(eq(contentModels.tenantId, context.activeTenantId), eq(contentModels.id, modelId)))
      .for("update");
    if (!model) throw new ApiError("NOT_FOUND", "Model was not found");
    if (model.status === "archived") throw new ApiError("CONFLICT", "Archived models cannot be edited");

    const scope = and(eq(contentModelFields.tenantId, context.activeTenantId), eq(contentModelFields.modelId, modelId));
    const fields = await tx.select({ id: contentModelFields.id }).from(contentModelFields)
      .where(scope).orderBy(contentModelFields.position, contentModelFields.id).for("update");
    const index = fields.findIndex((field) => field.id === data.fieldId);
    if (index === -1) throw new ApiError("NOT_FOUND", "Field was not found");
    const nextIndex = index + (data.direction === "up" ? -1 : 1);
    if (nextIndex < 0 || nextIndex >= fields.length) return;
    [fields[index], fields[nextIndex]] = [fields[nextIndex]!, fields[index]!];

    const positions = fields.map((field, position) => sql`when ${field.id}::uuid then ${position}::integer`);
    await tx.update(contentModelFields).set({
      position: sql`case ${contentModelFields.id} ${sql.join(positions, sql` `)} else ${contentModelFields.position} end`,
      updatedAt: new Date(),
    }).where(scope);
  });

  return { reordered: true as const };
}

export async function updateField(modelId: string, fieldId: string, input: unknown, tenantSlug?: string) {
  const [context, data] = await Promise.all([
    requireTenantContext(crypto.randomUUID(), tenantSlug),
    Promise.resolve(parseInput(updateFieldSchema, input)),
  ]);
  const [currentField] = await db
    .select()
    .from(contentModelFields)
    .where(and(eq(contentModelFields.tenantId, context.activeTenantId), eq(contentModelFields.modelId, modelId), eq(contentModelFields.id, fieldId)))
    .limit(1);

  if (!currentField) throw new ApiError("NOT_FOUND", "Field was not found");

  const mergedInput = {
    key: data.key ?? currentField.key,
    label: data.label ?? currentField.label,
    type: data.type ?? currentField.type,
    required: data.required ?? currentField.required,
    config: data.config ?? currentField.config,
    isTitle: data.isTitle ?? currentField.isTitle,
    localized: data.localized ?? currentField.localized,
  };
  const normalizedField = await normalizeFieldInput(db, context.activeTenantId, mergedInput);
  try {
    const field = await db.transaction(async (tx) => {
      await lockPagePaths(tx, context.activeTenantId);
      const [linkedModel] = await tx.select({ pageUrl: contentModels.pageUrl }).from(contentModels).where(and(eq(contentModels.tenantId, context.activeTenantId), eq(contentModels.id, modelId))).limit(1);
      if (linkedModel?.pageUrl?.pattern.includes("{slug}") && linkedModel.pageUrl.slugField === currentField.key &&
        (normalizedField.key !== currentField.key || normalizedField.type !== "slug" || !normalizedField.required || normalizedField.config.unique !== true)) {
        throw new ApiError("CONFLICT", "This field is used for page URLs. Change the model's page URL settings first.");
      }

      const { targetModelIds, ...fieldValues } = normalizedField;
      if (normalizedField.isTitle) {
        await tx
          .update(contentModelFields)
          .set({ isTitle: false, updatedAt: new Date() })
          .where(and(eq(contentModelFields.tenantId, context.activeTenantId), eq(contentModelFields.modelId, modelId), ne(contentModelFields.id, fieldId)));
      }

      const existingTargets = await tx.select({ targetModelId: contentModelFieldTargets.targetModelId }).from(contentModelFieldTargets).where(eq(contentModelFieldTargets.fieldId, fieldId));
      const removedTargetIds = existingTargets.map((target) => target.targetModelId).filter((targetModelId) => !targetModelIds.includes(targetModelId));
      if (removedTargetIds.length) {
        const parentEntries = await tx.select({ data: contentEntries.data }).from(contentEntries).where(and(eq(contentEntries.tenantId, context.activeTenantId), eq(contentEntries.modelId, modelId), sql`${contentEntries.deletedAt} is null`));
        const linkedEntryIds = parentEntries.flatMap((entry) => componentEntryIds(entry.data[currentField.key]));
        if (linkedEntryIds.length) {
          const [blockedReference] = await tx.select({ id: contentEntries.id }).from(contentEntries).where(and(inArray(contentEntries.id, linkedEntryIds), inArray(contentEntries.modelId, removedTargetIds))).limit(1);
          if (blockedReference) throw new ApiError("CONFLICT", "Remove linked entries from this field before removing their component model");
        }
      }

      const [updatedField] = await tx
        .update(contentModelFields)
        .set({ ...fieldValues, updatedAt: new Date() })
        .where(and(eq(contentModelFields.tenantId, context.activeTenantId), eq(contentModelFields.modelId, modelId), eq(contentModelFields.id, fieldId)))
        .returning();

      await tx.delete(contentModelFieldTargets).where(eq(contentModelFieldTargets.fieldId, fieldId));
      if (targetModelIds.length) {
        await tx.insert(contentModelFieldTargets).values(targetModelIds.map((targetModelId) => ({ fieldId, targetModelId })));
      }
      if (currentField.localized && !normalizedField.localized) {
        await removeFieldTranslations(tx, context.activeTenantId, modelId, currentField.key);
      }
      if (linkedModel?.pageUrl && currentField.localized !== normalizedField.localized) await validatePagePaths(tx, context.activeTenantId);
      return updatedField;
    });

    if (!field) throw new ApiError("NOT_FOUND", "Field was not found");
    return { field: serializeField(field) };
  } catch (error) {
    if (isUniqueViolation(error)) throw new ApiError("CONFLICT", "A field with this key already exists");
    throw error;
  }
}

export async function deleteField(modelId: string, fieldId: string, tenantSlug?: string) {
  const context = await requireTenantContext(crypto.randomUUID(), tenantSlug);
  return deleteModelField(db, context.activeTenantId, modelId, fieldId);
}

export async function listEntries(modelId: string, query = "", tenantSlug?: string) {
  const context = await requireTenantContext(crypto.randomUUID(), tenantSlug);
  entryStatusSchema.optional().parse(undefined);
  return { entries: await listEntriesForContext(context, modelId, query), nextCursor: null };
}

export async function createEntry(modelId: string, input: unknown, translationsInput?: unknown, tenantSlug?: string) {
  const [context, data] = await Promise.all([
    requireTenantContext(crypto.randomUUID(), tenantSlug),
    Promise.resolve(parseInput(entryDataSchema, { data: input, translations: translationsInput })),
  ]);
  await getActiveModel(db, context.activeTenantId, modelId);
  const translations = await sanitizeEntryTranslations(db, context.activeTenantId, modelId, data.translations);
  await validateEntryData(db, context.activeTenantId, modelId, data.data, undefined, translations);

  const entry = await db.transaction(async (tx) => {
    const [createdEntry] = await tx
      .insert(contentEntries)
      .values({ tenantId: context.activeTenantId, modelId, data: data.data, translations, createdBy: context.user.id, updatedBy: context.user.id })
      .returning();
    if (!createdEntry) throw new ApiError("INTERNAL_SERVER_ERROR", "Entry could not be created");
    await createEntryRevision(tx, { tenantId: context.activeTenantId, entryId: createdEntry.id, data: createdEntry.data, translations: createdEntry.translations, userId: context.user.id });
    return createdEntry;
  });

  return { entry: serializeEntry(entry) };
}

export async function getEntry(entryId: string, tenantSlug?: string) {
  const context = await requireTenantContext(crypto.randomUUID(), tenantSlug);
  return getEntryForContext(context, entryId);
}

export async function updateEntry(entryId: string, input: unknown, translationsInput?: unknown, tenantSlug?: string) {
  const [context, data] = await Promise.all([
    requireTenantContext(crypto.randomUUID(), tenantSlug),
    Promise.resolve(parseInput(updateEntrySchema, { data: input, translations: translationsInput })),
  ]);
  const currentEntry = await getTenantEntry(db, context.activeTenantId, entryId);
  if (!currentEntry) throw new ApiError("NOT_FOUND", "Entry was not found");
  await getActiveModel(db, context.activeTenantId, currentEntry.modelId);
  const translations = await sanitizeEntryTranslations(db, context.activeTenantId, currentEntry.modelId, data.translations ?? currentEntry.translations);
  const entry = await db.transaction(async (tx) => {
    await lockPagePaths(tx, context.activeTenantId);
    if (currentEntry.status === "published") {
      await validateEntryDataForPublish(tx, context.activeTenantId, currentEntry.modelId, data.data, entryId, translations);
    } else {
      await validateEntryData(tx, context.activeTenantId, currentEntry.modelId, data.data, entryId, translations);
    }
    const [updatedEntry] = await tx
      .update(contentEntries)
      .set({ data: data.data, translations, updatedBy: context.user.id, updatedAt: new Date() })
      .where(and(eq(contentEntries.tenantId, context.activeTenantId), eq(contentEntries.id, entryId), eq(contentEntries.status, currentEntry.status), sql`${contentEntries.deletedAt} is null`))
      .returning();
    if (!updatedEntry) throw new ApiError("CONFLICT", "Entry status changed while it was being updated");
    await createEntryRevision(tx, { tenantId: context.activeTenantId, entryId: updatedEntry.id, data: updatedEntry.data, translations: updatedEntry.translations, userId: context.user.id });
    return updatedEntry;
  });

  return { entry: serializeEntry(entry) };
}

export async function deleteEntry(entryId: string, tenantSlug?: string) {
  const context = await requireTenantContext(crypto.randomUUID(), tenantSlug);
  const currentEntry = await getTenantEntry(db, context.activeTenantId, entryId);
  if (!currentEntry) throw new ApiError("NOT_FOUND", "Entry was not found");

  await db.transaction(async (tx) => {
    const [deletedEntry] = await tx
      .update(contentEntries)
      .set({ deletedAt: new Date(), updatedBy: context.user.id, updatedAt: new Date() })
      .where(and(eq(contentEntries.tenantId, context.activeTenantId), eq(contentEntries.id, entryId), sql`${contentEntries.deletedAt} is null`))
      .returning();
    if (!deletedEntry) throw new ApiError("NOT_FOUND", "Entry was not found");
    await createEntryRevision(tx, { tenantId: context.activeTenantId, entryId: deletedEntry.id, data: deletedEntry.data, translations: deletedEntry.translations, userId: context.user.id });
  });

  return { deleted: true as const };
}

export async function publishEntry(entryId: string, tenantSlug?: string) {
  const context = await requireTenantContext(crypto.randomUUID(), tenantSlug);
  const entry = await db.transaction(async (tx) => {
    await lockPagePaths(tx, context.activeTenantId);
    const [currentEntry] = await tx
      .select()
      .from(contentEntries)
      .where(and(eq(contentEntries.tenantId, context.activeTenantId), eq(contentEntries.id, entryId), sql`${contentEntries.deletedAt} is null`))
      .for("update")
      .limit(1);
    if (!currentEntry) throw new ApiError("NOT_FOUND", "Entry was not found");
    await validateEntryDataForPublish(tx, context.activeTenantId, currentEntry.modelId, currentEntry.data, currentEntry.id, currentEntry.translations);

    const [publishedEntry] = await tx
      .update(contentEntries)
      .set({ status: "published", publishedAt: new Date(), updatedBy: context.user.id, updatedAt: new Date() })
      .where(and(eq(contentEntries.tenantId, context.activeTenantId), eq(contentEntries.id, entryId), sql`${contentEntries.deletedAt} is null`))
      .returning();
    if (!publishedEntry) throw new ApiError("NOT_FOUND", "Entry was not found");
    await createEntryRevision(tx, { tenantId: context.activeTenantId, entryId: publishedEntry.id, data: publishedEntry.data, translations: publishedEntry.translations, userId: context.user.id });
    return publishedEntry;
  });
  return { entry: serializeEntry(entry) };
}

export async function unpublishEntry(entryId: string, tenantSlug?: string) {
  const context = await requireTenantContext(crypto.randomUUID(), tenantSlug);
  const entry = await db.transaction(async (tx) => {
    const [unpublishedEntry] = await tx
      .update(contentEntries)
      .set({ status: "draft", publishedAt: null, updatedBy: context.user.id, updatedAt: new Date() })
      .where(and(eq(contentEntries.tenantId, context.activeTenantId), eq(contentEntries.id, entryId), sql`${contentEntries.deletedAt} is null`))
      .returning();
    if (!unpublishedEntry) throw new ApiError("NOT_FOUND", "Entry was not found");
    await createEntryRevision(tx, { tenantId: context.activeTenantId, entryId: unpublishedEntry.id, data: unpublishedEntry.data, translations: unpublishedEntry.translations, userId: context.user.id });
    return unpublishedEntry;
  });
  return { entry: serializeEntry(entry) };
}

export async function createChild(entryId: string, input: unknown, tenantSlug?: string) {
  const [context, data] = await Promise.all([
    requireTenantContext(crypto.randomUUID(), tenantSlug),
    Promise.resolve(parseInput(childEntrySchema, input)),
  ]);
  const parentEntry = await getTenantEntry(db, context.activeTenantId, entryId);
  if (!parentEntry) throw new ApiError("NOT_FOUND", "Parent entry was not found");

  const [field] = await db
    .select()
    .from(contentModelFields)
    .where(and(eq(contentModelFields.tenantId, context.activeTenantId), eq(contentModelFields.modelId, parentEntry.modelId), eq(contentModelFields.id, data.fieldId), eq(contentModelFields.type, "component")))
    .limit(1);

  if (!field) throw new ApiError("VALIDATION_ERROR", "Component field was not found");
  const targets = await db.select({ targetModelId: contentModelFieldTargets.targetModelId }).from(contentModelFieldTargets).where(eq(contentModelFieldTargets.fieldId, field.id));
  let targetModelId = targets[0]?.targetModelId;

  if (data.childEntryId) {
    const [linkedEntry] = await db.select({ modelId: contentEntries.modelId }).from(contentEntries).where(and(eq(contentEntries.tenantId, context.activeTenantId), eq(contentEntries.id, data.childEntryId), sql`${contentEntries.deletedAt} is null`)).limit(1);
    if (!linkedEntry || !targets.some((target) => target.targetModelId === linkedEntry.modelId)) throw new ApiError("NOT_FOUND", "Child entry was not found");
    targetModelId = linkedEntry.modelId;
  } else if (targets.length !== 1) {
    throw new ApiError("VALIDATION_ERROR", "Creating a child directly requires a component field with one target model");
  }
  if (!targetModelId) throw new ApiError("VALIDATION_ERROR", "Component field has no target models");

  if (!data.childEntryId) {
    await validateEntryData(db, context.activeTenantId, targetModelId, data.data);
  }

  const childEntry = await db.transaction(async (tx) => {
    const [positionRow] = await tx
      .select({ value: max(contentEntries.position) })
      .from(contentEntries)
      .where(and(eq(contentEntries.tenantId, context.activeTenantId), eq(contentEntries.parentEntryId, parentEntry.id), eq(contentEntries.parentFieldId, field.id), sql`${contentEntries.deletedAt} is null`));
    const position = (positionRow?.value ?? -1) + 1;

    if (data.childEntryId) {
      const [linkedEntry] = await tx
        .update(contentEntries)
        .set({ parentEntryId: parentEntry.id, parentFieldId: field.id, position, updatedBy: context.user.id, updatedAt: new Date() })
        .where(and(eq(contentEntries.tenantId, context.activeTenantId), eq(contentEntries.id, data.childEntryId), eq(contentEntries.modelId, targetModelId), sql`${contentEntries.deletedAt} is null`))
        .returning();
      if (!linkedEntry) throw new ApiError("NOT_FOUND", "Child entry was not found");
      await createEntryRevision(tx, { tenantId: context.activeTenantId, entryId: linkedEntry.id, data: linkedEntry.data, translations: linkedEntry.translations, userId: context.user.id });
      return linkedEntry;
    }

    const [createdEntry] = await tx
      .insert(contentEntries)
      .values({ tenantId: context.activeTenantId, modelId: targetModelId, data: data.data, parentEntryId: parentEntry.id, parentFieldId: field.id, position, createdBy: context.user.id, updatedBy: context.user.id })
      .returning();
    if (!createdEntry) throw new ApiError("INTERNAL_SERVER_ERROR", "Child entry could not be created");
    await createEntryRevision(tx, { tenantId: context.activeTenantId, entryId: createdEntry.id, data: createdEntry.data, translations: createdEntry.translations, userId: context.user.id });
    return createdEntry;
  });

  return { childEntry: serializeEntry(childEntry) };
}

export async function reorderChildren(entryId: string, input: unknown, tenantSlug?: string) {
  const [context, data] = await Promise.all([
    requireTenantContext(crypto.randomUUID(), tenantSlug),
    Promise.resolve(parseInput(reorderChildrenSchema, input)),
  ]);
  const parentEntry = await getTenantEntry(db, context.activeTenantId, entryId);
  if (!parentEntry) throw new ApiError("NOT_FOUND", "Parent entry was not found");

  const [field] = await db
    .select({ id: contentModelFields.id, isList: contentModelFields.isList })
    .from(contentModelFields)
    .where(and(eq(contentModelFields.tenantId, context.activeTenantId), eq(contentModelFields.modelId, parentEntry.modelId), eq(contentModelFields.id, data.fieldId), eq(contentModelFields.type, "component")))
    .limit(1);
  if (!field) throw new ApiError("VALIDATION_ERROR", "Component field was not found");
  if (!field.isList && data.childEntryIds.length > 1) throw new ApiError("VALIDATION_ERROR", "Single component fields cannot be reordered as a list");

  const children = await db
    .select({ id: contentEntries.id })
    .from(contentEntries)
    .where(and(eq(contentEntries.tenantId, context.activeTenantId), eq(contentEntries.parentEntryId, parentEntry.id), eq(contentEntries.parentFieldId, field.id), inArray(contentEntries.id, data.childEntryIds), sql`${contentEntries.deletedAt} is null`));
  if (children.length !== data.childEntryIds.length) throw new ApiError("VALIDATION_ERROR", "All child entries must belong to this parent field");

  await db.transaction(async (tx) => {
    await Promise.all(data.childEntryIds.map((childEntryId, position) => tx.update(contentEntries).set({ position, updatedBy: context.user.id, updatedAt: new Date() }).where(and(eq(contentEntries.tenantId, context.activeTenantId), eq(contentEntries.id, childEntryId), eq(contentEntries.parentEntryId, parentEntry.id), eq(contentEntries.parentFieldId, field.id)))));
  });

  return { reordered: true as const };
}

export async function listAssets(tenantSlug?: string) {
  const context = await requireTenantContext(crypto.randomUUID(), tenantSlug);
  const result = await listAssetsForContext(context);
  return { assets: result.assets, nextCursor: null };
}

async function getManagedUser(userId: string): Promise<ManagedUser> {
  const context = await getCmsContext(crypto.randomUUID());
  requireAdmin(context);
  const users = await listManagedUsersForContext(context);
  const managedUser = users.find((item) => item.id === userId);
  if (!managedUser) throw new CmsError("NOT_FOUND", "User was not found");
  return managedUser;
}

async function listManagedUsersForContext(context: CmsRequestContext): Promise<ManagedUser[]> {
  requireAdmin(context);

  const [userRows, membershipRows] = await Promise.all([
    db.select().from(user).orderBy(desc(user.createdAt)).limit(100),
    db
      .select({
        userId: tenantMemberships.userId,
        tenantId: tenantMemberships.tenantId,
        role: tenantMemberships.role,
        tenant: {
          id: tenants.id,
          slug: tenants.slug,
          name: tenants.name,
        },
      })
      .from(tenantMemberships)
      .innerJoin(tenants, eq(tenantMemberships.tenantId, tenants.id)),
  ]);

  const membershipsByUser = new Map<string, ManagedUser["memberships"]>();
  for (const membership of membershipRows) {
    const memberships = membershipsByUser.get(membership.userId) ?? [];
    memberships.push({
      tenantId: membership.tenantId,
      role: membership.role,
      tenant: membership.tenant,
    });
    membershipsByUser.set(membership.userId, memberships);
  }

  return userRows.map((row) => serializeManagedUser(row, membershipsByUser.get(row.id) ?? []));
}

async function listTenantSummariesForContext(context: CmsRequestContext): Promise<TenantSummary[]> {
  requireAdmin(context);
  return db.select({ id: tenants.id, slug: tenants.slug, name: tenants.name }).from(tenants).orderBy(desc(tenants.createdAt));
}

export async function deleteAsset(assetId: string, tenantSlug?: string) {
  const context = await requireTenantContext(crypto.randomUUID(), tenantSlug);
  const [asset] = await db
    .select()
    .from(assets)
    .where(and(eq(assets.tenantId, context.activeTenantId), eq(assets.id, assetId), ne(assets.status, "deleted")))
    .limit(1);

  if (!asset) throw new ApiError("NOT_FOUND", "Asset was not found");

  await deleteS3Object({ bucket: asset.bucket, objectKey: asset.objectKey });

  const [deletedAsset] = await db
    .update(assets)
    .set({ status: "deleted", deletedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(assets.tenantId, context.activeTenantId), eq(assets.id, assetId), ne(assets.status, "deleted")))
    .returning();

  if (!deletedAsset) throw new ApiError("NOT_FOUND", "Asset was not found");
  return { deleted: true as const, assetId: deletedAsset.id };
}

export async function updateAsset(assetId: string, input: unknown, tenantSlug?: string) {
  const [context, data] = await Promise.all([
    requireTenantContext(crypto.randomUUID(), tenantSlug),
    Promise.resolve(parseInput(updateAssetSchema, input)),
  ]);

  const [asset] = await db
    .update(assets)
    .set({ originalName: data.originalName, updatedAt: new Date() })
    .where(and(eq(assets.tenantId, context.activeTenantId), eq(assets.id, assetId), ne(assets.status, "deleted")))
    .returning();

  if (!asset) throw new ApiError("NOT_FOUND", "Asset was not found");
  return { asset: serializeAsset(asset) };
}

export async function presignAssetUpload(input: unknown, tenantSlug?: string) {
  const [context, data] = await Promise.all([
    requireTenantContext(crypto.randomUUID(), tenantSlug),
    Promise.resolve(parseInput(presignUploadSchema, input)),
  ]);
  const env = getEnv();
  if (!env.S3_BUCKET) throw new ApiError("INTERNAL_SERVER_ERROR", "S3_BUCKET is not configured");

  try {
    assertAllowedUpload({ fileSize: data.fileSize, maxBytes: env.UPLOAD_MAX_BYTES });
  } catch (error) {
    throw new ApiError("VALIDATION_ERROR", error instanceof Error ? error.message : "Upload is not allowed");
  }

  const now = new Date();
  const yyyy = String(now.getUTCFullYear());
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const objectKey = `tenant/${context.activeTenantId}/${yyyy}/${mm}/${crypto.randomUUID()}-${sanitizeFilename(data.filename)}`;

  const [asset] = await db
    .insert(assets)
    .values({ tenantId: context.activeTenantId, uploadedBy: context.user.id, bucket: env.S3_BUCKET, objectKey, originalName: data.filename, mimeType: data.mimeType, sizeBytes: data.fileSize, status: "pending" })
    .returning();
  if (!asset) throw new ApiError("INTERNAL_SERVER_ERROR", "Asset could not be created");

  const upload = await presignUpload({ bucket: env.S3_BUCKET, objectKey, mimeType: data.mimeType, maxBytes: env.UPLOAD_MAX_BYTES });
  const uploadToken = createUploadToken({ assetId: asset.id, tenantId: context.activeTenantId, objectKey, mimeType: data.mimeType, sizeBytes: data.fileSize, expiresAt: Date.now() + 10 * 60 * 1000 });
  return { assetId: asset.id, upload, uploadToken };
}

export async function completeAssetUpload(input: unknown, tenantSlug?: string) {
  const [context, data] = await Promise.all([
    requireTenantContext(crypto.randomUUID(), tenantSlug),
    Promise.resolve(parseInput(completeUploadSchema, input)),
  ]);
  const token = parseUploadToken(data.uploadToken);
  if (!token || token.tenantId !== context.activeTenantId) throw new ApiError("FORBIDDEN", "Upload token is invalid or expired");

  const [pendingAsset] = await db
    .select()
    .from(assets)
    .where(and(eq(assets.tenantId, context.activeTenantId), eq(assets.id, token.assetId), eq(assets.objectKey, token.objectKey), eq(assets.status, "pending")))
    .limit(1);
  if (!pendingAsset) throw new ApiError("NOT_FOUND", "Pending asset was not found");

  const dimensions = await extractImageDimensions({
    bucket: pendingAsset.bucket,
    objectKey: pendingAsset.objectKey,
    mimeType: pendingAsset.mimeType,
  });

  const [asset] = await db
    .update(assets)
    .set({ status: "ready", etag: data.etag, imageWidth: dimensions.imageWidth, imageHeight: dimensions.imageHeight, updatedAt: new Date() })
    .where(and(eq(assets.tenantId, context.activeTenantId), eq(assets.id, pendingAsset.id), eq(assets.status, "pending")))
    .returning();
  if (!asset) throw new ApiError("NOT_FOUND", "Pending asset was not found");
  const [assetWithPreview] = await assetsWithPreviews([asset]);
  return { assetId: asset.id, asset: assetWithPreview! };
}

async function listModelsForContext(context: TenantContext): Promise<ContentModel[]> {
  const rows = await db
    .select()
    .from(contentModels)
    .where(eq(contentModels.tenantId, context.activeTenantId))
    .orderBy(desc(contentModels.createdAt))
    .limit(100);

  return rows.map(serializeModel);
}

async function listAssetsForContext(
  context: TenantContext,
  options: { query?: string; sort?: AssetSort; page?: number; pageSize?: number } = {},
): Promise<{ assets: AssetWithPreview[]; total: number }> {
  const query = options.query?.trim() ?? "";
  const pattern = `%${query}%`;
  const page = Math.max(1, options.page ?? 1);
  const pageSize = Math.max(1, options.pageSize ?? 100);
  const search = query
    ? or(
        ilike(assets.originalName, pattern),
        ilike(assets.mimeType, pattern),
        ilike(assets.objectKey, pattern),
        sql`${assets.status}::text ilike ${pattern}`,
      )
    : undefined;
  const where = and(eq(assets.tenantId, context.activeTenantId), ne(assets.status, "deleted"), search);
  const [rows, [countRow]] = await Promise.all([
    db
      .select()
      .from(assets)
      .where(where)
      .orderBy(...assetOrderBy(options.sort ?? "date-desc"))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.select({ total: sql<number>`count(*)::int` }).from(assets).where(where),
  ]);

  return { assets: await assetsWithPreviews(rows), total: countRow?.total ?? 0 };
}

async function assetsWithPreviews(rows: (typeof assets.$inferSelect)[]): Promise<AssetWithPreview[]> {
  return Promise.all(
    rows.map(async (asset) => {
      const serialized = serializeAsset(asset);
      const readUrl = serialized.status === "ready" ? await presignRead({ bucket: serialized.bucket, objectKey: serialized.objectKey, expiresIn: 300 }) : null;

      return {
        ...serialized,
        downloadUrl: readUrl,
        previewUrl: serialized.mimeType.startsWith("image/") ? readUrl : null,
      };
    }),
  );

}

function assetOrderBy(sort: AssetSort) {
  if (sort === "date-asc") return [asc(assets.createdAt), asc(assets.id)];
  if (sort === "name-asc") return [asc(assets.originalName), desc(assets.createdAt)];
  if (sort === "name-desc") return [desc(assets.originalName), desc(assets.createdAt)];
  if (sort === "type-asc") return [asc(assets.mimeType), asc(assets.originalName), desc(assets.createdAt)];
  if (sort === "size-desc") return [desc(assets.sizeBytes), desc(assets.createdAt)];
  return [desc(assets.createdAt), desc(assets.id)];
}

async function getModelFieldsForContext(context: TenantContext, modelId: string): Promise<ContentField[]> {
  await getModelForContext(context, modelId);

  const fields = await db
    .select()
    .from(contentModelFields)
    .where(and(eq(contentModelFields.tenantId, context.activeTenantId), eq(contentModelFields.modelId, modelId)))
    .orderBy(contentModelFields.position);

  const targets = fields.length
    ? await db
        .select({ fieldId: contentModelFieldTargets.fieldId, id: contentModels.id, name: contentModels.name, slug: contentModels.slug })
        .from(contentModelFieldTargets)
        .innerJoin(contentModels, eq(contentModelFieldTargets.targetModelId, contentModels.id))
        .where(inArray(contentModelFieldTargets.fieldId, fields.map((field) => field.id)))
    : [];

  return fields.map((field) => serializeField(field, targets.filter((target) => target.fieldId === field.id)));
}

async function getModelForContext(context: TenantContext, modelId: string): Promise<ContentModel> {
  const [model] = await db
    .select()
    .from(contentModels)
    .where(and(eq(contentModels.tenantId, context.activeTenantId), eq(contentModels.id, modelId)))
    .limit(1);

  if (!model) throw new ApiError("NOT_FOUND", "Model was not found");
  return serializeModel(model);
}

async function listEntriesForContext(context: TenantContext, modelId: string, query = ""): Promise<ContentEntry[]> {
  const filters = [eq(contentEntries.tenantId, context.activeTenantId), eq(contentEntries.modelId, modelId), sql`${contentEntries.deletedAt} is null`];
  if (query) filters.push(or(ilike(sql`${contentEntries.data}::text`, `%${query}%`), ilike(sql`${contentEntries.translations}::text`, `%${query}%`))!);

  const rows = await db
    .select()
    .from(contentEntries)
    .where(and(...filters))
    .orderBy(desc(contentEntries.createdAt))
    .limit(100);

  return rows.map(serializeEntry);
}

async function listComponentReferencesForContext(context: TenantContext, fields: ContentField[]) {
  const componentFields = fields.filter((field) => field.type === "component" && field.targetModels.length);
  const targetModels = new Map(componentFields.flatMap((field) => field.targetModels.map((model) => [model.id, model] as const)));
  const targetModelIds = Array.from(targetModels.keys());

  const targetData = new Map(
    await Promise.all(
      targetModelIds.map(async (modelId) => {
        const [fields, entries] = await Promise.all([
          getModelFieldsForContext(context, modelId),
          listEntriesForContext(context, modelId),
        ]);
        return [modelId, { entries, titleField: fields.find((field) => field.isTitle) ?? null }] as const;
      }),
    ),
  );

  return componentFields.flatMap((field) => field.targetModels.flatMap((model) => {
    const data = targetData.get(model.id);
    return data ? [{ fieldId: field.id, modelId: model.id, modelName: model.name, ...data }] : [];
  }));
}

async function getEntryForContext(context: TenantContext, entryId: string) {
  const entry = await getTenantEntry(db, context.activeTenantId, entryId);
  if (!entry) throw new ApiError("NOT_FOUND", "Entry was not found");

  const revisions = await db
    .select()
    .from(entryRevisions)
    .where(and(eq(entryRevisions.tenantId, context.activeTenantId), eq(entryRevisions.entryId, entryId)))
    .orderBy(entryRevisions.version);

  return { entry: serializeEntry(entry), revisions: revisions.map(serializeRevision) };
}

/** Removes one field's values from every translation of a model's entries. */
async function removeFieldTranslations(tx: Parameters<Parameters<typeof db.transaction>[0]>[0], tenantId: string, modelId: string, key: string) {
  await tx
    .update(contentEntries)
    .set({
      translations: sql`coalesce((
        select jsonb_object_agg(locale, locale_values - ${key}::text)
        from jsonb_each(${contentEntries.translations}) as translation(locale, locale_values)
        where locale_values - ${key}::text <> '{}'::jsonb
      ), '{}'::jsonb)`,
    })
    .where(and(eq(contentEntries.tenantId, tenantId), eq(contentEntries.modelId, modelId), sql`${contentEntries.translations} <> '{}'::jsonb`));
}

function emptyWorkbenchData(me: CmsSessionView, query: string): WorkbenchData {
  return {
    me,
    localization: defaultLocalization,
    models: [],
    fields: [],
    entries: [],
    componentReferences: [],
    entry: null,
    revisions: [],
    assets: [],
    assetQuery: "",
    assetSort: "date-desc",
    assetPage: 1,
    assetPageSize,
    assetTotal: 0,
    users: [],
    accessTokens: [],
    tenants: [],
    activeModelId: "",
    activeEntryId: "",
    entryQuery: query,
  };
}

function serializeMe(context: CmsRequestContext): CmsSessionView {
  return {
    user: {
      id: context.user.id,
      name: context.user.name,
      email: context.user.email,
      role: appRole(context.user.role),
      image: context.user.image,
    },
    activeTenantId: context.activeTenantId,
    memberships: context.memberships,
  };
}

function serializeModel(model: ModelRow): ContentModel {
  return { ...model, createdAt: dateString(model.createdAt), updatedAt: dateString(model.updatedAt) };
}

function serializeField(field: FieldRow, targetModels: ContentField["targetModels"] = []): ContentField {
  return { ...field, targetModels, createdAt: dateString(field.createdAt), updatedAt: dateString(field.updatedAt) };
}

function componentEntryIds(value: unknown): string[] {
  const values = Array.isArray(value) ? value : [value];
  return values.flatMap((reference) => {
    if (typeof reference === "object" && reference !== null && "childEntryId" in reference && typeof reference.childEntryId === "string") return [reference.childEntryId];
    return typeof reference === "string" ? [reference] : [];
  });
}

function serializeEntry(entry: EntryRow): ContentEntry {
  return {
    ...entry,
    publishedAt: nullableDateString(entry.publishedAt),
    deletedAt: nullableDateString(entry.deletedAt),
    createdAt: dateString(entry.createdAt),
    updatedAt: dateString(entry.updatedAt),
  };
}

function serializeRevision(revision: RevisionRow): EntryRevision {
  return { ...revision, createdAt: dateString(revision.createdAt) };
}

function serializeAsset(asset: AssetRow): Asset {
  return {
    ...asset,
    deletedAt: nullableDateString(asset.deletedAt),
    createdAt: dateString(asset.createdAt),
    updatedAt: dateString(asset.updatedAt),
  };
}

function serializeManagedUser(row: UserRow, memberships: ManagedUser["memberships"]): ManagedUser {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: appRole(row.role),
    image: row.image,
    emailVerified: row.emailVerified,
    banned: row.banned,
    banReason: row.banReason,
    banExpires: nullableDateString(row.banExpires),
    twoFactorEnabled: row.twoFactorEnabled,
    twoFactorRequired: row.twoFactorRequired,
    createdAt: dateString(row.createdAt),
    updatedAt: dateString(row.updatedAt),
    memberships,
  };
}

function appRole(value: string | null | undefined): "admin" | "user" {
  return value === "admin" ? "admin" : "user";
}

function parseInput<T>(schema: ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new ApiError("VALIDATION_ERROR", result.error.issues.map((issue) => `${issue.path.join(".") || "body"}: ${issue.message}`).join("; "));
  }
  return result.data;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function dateString(value: DateLike): string {
  return value instanceof Date ? value.toISOString() : value;
}

function nullableDateString(value: DateLike | null): string | null {
  return value ? dateString(value) : null;
}
