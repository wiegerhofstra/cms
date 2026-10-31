import { z } from "zod";

export const consumerTypeSchema = z.enum(["nextjs", "astro"]);

// Accept the resource webhook copied from Coolify, never tags, multiple resources,
// preview deployments, or credentials in query parameters.
export function coolifyDeployUrl(value: string) {
  const url = new URL(value);
  const uuid = url.searchParams.get("uuid");
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.hash
    || url.pathname !== "/api/v1/deploy" || !uuid || !/^[a-zA-Z0-9_-]+$/.test(uuid)
    || url.searchParams.getAll("uuid").length !== 1
    || [...url.searchParams.keys()].some((key) => !["uuid", "force"].includes(key))) {
    throw new Error("Use the Coolify deploy webhook for one application: https://coolify.example.com/api/v1/deploy?uuid=application-uuid");
  }
  // Content changes do not change Git: cached build layers must not reuse old HTML.
  url.searchParams.set("force", "true");
  return url.toString();
}

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
