import { CmsError } from "../../lib/cms/errors.ts";

export async function requestRevalidation(url: string, token: string) {
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new CmsError("BAD_REQUEST", "The revalidation endpoint could not be reached. Check the URL and try again.");
  }
  // Do not forward arbitrary upstream bodies: they can contain secrets or HTML.
  if (!response.ok) {
    await response.body?.cancel();
    throw new CmsError("BAD_REQUEST", `Revalidation failed (HTTP ${response.status}). Check the endpoint and token.`);
  }
  await response.body?.cancel();
}
