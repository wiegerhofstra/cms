"use server";

import { revalidatePath } from "next/cache";

import { CmsError } from "@/lib/cms/errors";
import { acceptInvite, createInvite, revokeInvite } from "./service";
import type { InviteActionResult } from "./types";

// Server action errors are hidden in production, so expected failures are returned as messages instead.
async function result<T>(action: () => Promise<T>): Promise<InviteActionResult<T>> {
  try {
    return { ok: true, data: await action() };
  } catch (error) {
    return { ok: false, error: error instanceof CmsError ? error.message : "Something went wrong. Try again." };
  }
}

export async function createInviteAction(input: unknown) {
  return result(async () => {
    const created = await createInvite(input);
    revalidatePath("/app/settings/users");
    return created;
  });
}

export async function revokeInviteAction(inviteId: string) {
  return result(async () => {
    await revokeInvite(inviteId);
    revalidatePath("/app/settings/users");
  });
}

export async function acceptInviteAction(token: string, input: unknown) {
  return result(() => acceptInvite(token, input));
}
