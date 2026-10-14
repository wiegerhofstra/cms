import { z } from "zod";

export const revalidationSettingsSchema = z.object({
  url: z.string().trim().max(2048).refine((value) => {
    if (!value) return true;
    try {
      const url = new URL(value);
      return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password && !url.hash;
    } catch { return false; }
  }, "Enter a full HTTP or HTTPS URL without credentials or a fragment"),
  token: z.string().trim().max(4096).regex(/^[\x21-\x7e]*$/, "Use a token without spaces or control characters"),
});

export type RevalidationSettingsSummary = {
  url: string;
  hasToken: boolean;
  updatedAt: string;
};
