import { z } from "zod";

export const entryStatusSchema = z.enum(["draft", "published"]);

const translationsSchema = z.record(z.string(), z.record(z.string(), z.unknown()));

export const entryDataSchema = z.object({
  data: z.record(z.string(), z.unknown()).optional().default({}),
  translations: translationsSchema.optional().default({}),
});

export const updateEntrySchema = z.object({
  data: z.record(z.string(), z.unknown()),
  /** Omit to keep the entry's current translations. */
  translations: translationsSchema.optional(),
});

export const childEntrySchema = z.object({
  fieldId: z.uuid(),
  childEntryId: z.uuid().optional(),
  data: z.record(z.string(), z.unknown()).optional().default({}),
});

export const reorderChildrenSchema = z.object({
  fieldId: z.uuid(),
  childEntryIds: z.array(z.uuid()).min(1),
});
