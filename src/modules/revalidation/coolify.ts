import { CmsError } from "../../lib/cms/errors.ts";
import { coolifyDeployUrl } from "./validation.ts";

export async function requestCoolifyBuild(webhook: string, token: string) {
  const url = coolifyDeployUrl(webhook);
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new CmsError("BAD_REQUEST", "Coolify could not be reached. Check its URL and deployment logs before retrying; the build may already be queued.");
  }
  if (!response.ok) {
    await response.body?.cancel();
    throw new CmsError("BAD_REQUEST", `Coolify rebuild failed (HTTP ${response.status}). Check the webhook and deploy token.`);
  }
  const body = await response.json().catch(() => null);
  const uuid = new URL(url).searchParams.get("uuid");
  const deployment = Array.isArray(body?.deployments)
    ? body.deployments.find((item: { resource_uuid?: string; deployment_uuid?: string } | null) => item?.resource_uuid === uuid)
    : null;
  if (typeof deployment?.deployment_uuid !== "string" || !/^[a-zA-Z0-9_-]{1,128}$/.test(deployment.deployment_uuid)) {
    throw new CmsError("BAD_REQUEST", "Coolify did not confirm a queued deployment. Check its deployment logs before retrying.");
  }
  return deployment.deployment_uuid as string;
}
