import { z } from "zod";

export const modelStatusSchema = z.enum(["active", "archived"]);
export const fieldTypeSchema = z.enum([
  "text",
  "rich_text",
  "url",
  "number",
  "boolean",
  "date",
  "time",
  "enum",
  "asset",
  "component",
  "slug",
]);

export const fieldInputSchema = z.object({
  key: z
    .string()
    .trim()
    .regex(/^[a-z][a-z0-9_]*$/, "Use snake_case starting with a letter")
    .max(80),
  label: z.string().trim().min(1).max(120),
  type: fieldTypeSchema,
  required: z.boolean().optional().default(false),
  config: z.record(z.string(), z.unknown()).optional().default({}),
  isTitle: z.boolean().optional().default(false),
});

export const createModelSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    slug: z
      .string()
      .trim()
      .regex(/^[a-z][a-z0-9_]*$/, "Use snake_case starting with a letter")
      .max(80),
    fields: z.array(fieldInputSchema).max(100).optional().default([]),
  })
  .refine((value) => value.fields.filter((field) => field.isTitle).length <= 1, {
    message: "Only one field can be used as the model title",
    path: ["fields"],
  });

export const updateModelSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    status: modelStatusSchema.optional(),
  })
  .refine((value) => value.name !== undefined || value.status !== undefined, {
    message: "Provide at least one field to update",
  });

export const updateFieldSchema = fieldInputSchema.partial().refine((value) => Object.keys(value).length > 0, {
  message: "Provide at least one field to update",
});

export const moveFieldSchema = z.object({
  fieldId: z.uuid(),
  direction: z.enum(["up", "down"]),
});

export type FieldInput = z.infer<typeof fieldInputSchema>;
