import { z } from "zod";

export const entryStatusSchema = z.enum(["draft", "published"]);

export const entryDataSchema = z.object({
  data: z.record(z.string(), z.unknown()).optional().default({}),
});

export const updateEntrySchema = z.object({
  data: z.record(z.string(), z.unknown()),
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
