import { z } from "zod";

export const accessTokenPermissionSchema = z.enum(["content:read", "email:send", "docs:read"]);
export type AccessTokenPermission = z.infer<typeof accessTokenPermissionSchema>;
export const accessTokenPermissionsSchema = z.array(accessTokenPermissionSchema).min(1).max(3)
  .transform((permissions) => [...new Set(permissions)]);
