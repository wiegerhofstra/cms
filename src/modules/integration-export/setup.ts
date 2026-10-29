import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

import { CmsError } from "../../lib/cms/errors.ts";

const setupSchema = z.object({
  tokenEnv: z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/).max(120).default("CMS_ACCESS_TOKEN"),
  envFile: z.string().max(180).refine((value) => value === "" || value.split("/").every((part) =>
    /^[a-zA-Z0-9_.-]+$/.test(part) && ![".", "..", ".git", "node_modules"].includes(part.toLowerCase()) && !part.endsWith(".")),
  "Use a project-relative environment file path").default(".env.local"),
});

export async function createDocumentationSetup(tenantSlug: string, origin: string, input: unknown) {
  const parsed = setupSchema.safeParse(input);
  if (!parsed.success) throw new CmsError("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Invalid updater configuration");
  const { tokenEnv, envFile } = parsed.data;
  const config = {
    version: 1, origin: new URL(origin).origin, tenantSlug, tokenEnv, output: "docs/cms",
    envFiles: envFile ? [...new Set([".env", envFile])] : [],
  };
  const scripts = {
    "cms:docs": "node scripts/update-cms-docs.mjs",
    update_cms_documentation: "npm run cms:docs",
  };
  return {
    "scripts/update-cms-docs.mjs": await readFile(path.join(process.cwd(), "src/modules/integration-export/update-cms-docs.mjs"), "utf8"),
    "cms-docs.config.json": `${JSON.stringify(config, null, 2)}\n`,
    "CMS-DOCS-SETUP.md": `# Update CMS documentation

Requires Node.js 22.18 or newer. No npm dependencies are needed.

1. Copy scripts/update-cms-docs.mjs and cms-docs.config.json into your project root, preserving the scripts/ directory. Review existing files before replacing an earlier setup.
2. In ${config.origin}/app/settings/auth, edit your existing token for ${tenantSlug} and enable docs:read. The token value stays the same; other permissions remain available. This grants access to every model definition, including archived models.
3. Reuse the existing ${tokenEnv} environment variable. ${envFile ? `The updater loads the configured envFiles, with later files taking precedence. Keep these files gitignored.` : "Supply it through your shell or CI environment."} Variables already set in the process always take precedence. Never use a public/browser token variable.
4. Merge these entries into the existing package.json scripts object (keep your other scripts):

\`\`\`json
${JSON.stringify(scripts, null, 2)}
\`\`\`

Run \`npm run cms:docs\` or \`npm run update_cms_documentation\` to refresh docs/cms/.
Run \`npm run cms:docs -- --check\` in a dedicated CI check: it exits 1 if stale or on error, and never writes files. Pass extra flags to cms:docs directly.

Commit the script, config and entire docs/cms/ directory, including .cms-docs-state.json. Add a pointer in AGENTS.md: "Read docs/cms/INTEGRATION.md before working on the CMS integration."
The config contains no token. Change tokenEnv, envFiles or output in cms-docs.config.json to fit your project. Paths are relative to the project root, regardless of your current working directory.

Generated docs include the guide, schemas, types, client and examples. Keep application code and your own notes outside the generated files. Local edits to generated files cause the updater to stop; move those edits elsewhere or restore the files from Git before retrying. Other files in the folder are preserved.
Downloads are validated before writing, and failed downloads keep the previous docs. Unchanged exports create no diff; the sync manifest omits the changing export timestamp. The updater removes obsolete, unmodified generated files and stages updates before replacing the directory. An interrupted update may leave a docs/cms.lock directory or a docs/cms.update-* backup; inspect those before removing them or retrying.

Refresh explicitly after CMS changes, review the diff and commit it with related application changes. Keep normal install/build scripts independent of CMS availability. Only commit model metadata into repositories authorized to contain it; no entry content or credentials are exported.
`,
  };
}
