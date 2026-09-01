import { and, eq, inArray } from "drizzle-orm";

import { type Db } from "@/db";
import { contentModels } from "@/db/schema";
import { CmsError as ApiError } from "@/lib/cms/errors";

import type { FieldInput } from "./validation";

type NormalizedField = {
  key: string;
  label: string;
  type: FieldInput["type"];
  required: boolean;
  config: Record<string, unknown>;
  targetModelIds: string[];
  isList: boolean;
  isTitle: boolean;
};

export async function normalizeFieldInput(db: Db, tenantId: string, input: FieldInput): Promise<NormalizedField> {
  if (input.type !== "component") {
    return {
      key: input.key,
      label: input.label,
      type: input.type,
      required: input.required,
      config: input.config,
      targetModelIds: [],
      isList: false,
      isTitle: input.isTitle,
    };
  }

  const configuredSlugs = input.config.targetModelSlugs;
  const legacySlug = input.config.targetModelSlug;
  const targetModelSlugs = Array.from(new Set(
    Array.isArray(configuredSlugs)
      ? configuredSlugs.filter((slug): slug is string => typeof slug === "string" && Boolean(slug))
      : typeof legacySlug === "string" && legacySlug
        ? [legacySlug]
        : [],
  ));
  if (!targetModelSlugs.length) {
    throw new ApiError("VALIDATION_ERROR", "Component fields require at least one target model");
  }

  const targetModels = await db
    .select({ id: contentModels.id, slug: contentModels.slug })
    .from(contentModels)
    .where(and(eq(contentModels.tenantId, tenantId), inArray(contentModels.slug, targetModelSlugs)));

  if (targetModels.length !== targetModelSlugs.length) {
    throw new ApiError("VALIDATION_ERROR", "One or more component target models were not found");
  }

  const config: Record<string, unknown> = { ...input.config, targetModelSlugs };
  delete config.targetModelSlug;

  return {
    key: input.key,
    label: input.label,
    type: input.type,
    required: input.required,
    config,
    targetModelIds: targetModels.map((model) => model.id),
    isList: input.config.isList === true,
    isTitle: input.isTitle,
  };
}

export function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "23505";
}
