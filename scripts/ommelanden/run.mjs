import nextEnv from "@next/env";
import pg from "pg";
import { setupModels } from "./setup.mjs";

const args = process.argv.slice(2);
if (args.length > 1 || args.some((arg) => !["--apply", "--dry-run"].includes(arg))) {
  throw new Error("Usage: npm run migrate:ommelanden:models -- [--dry-run | --apply]");
}
nextEnv.loadEnvConfig(process.cwd());
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  await client.query("begin");
  await client.query("set local lock_timeout='5s'");
  const changes = await setupModels(client);
  await client.query(args.includes("--apply") ? "commit" : "rollback");
  console.log(changes.length ? changes.join("\n") : "No changes needed.");
  console.log(args.includes("--apply") ? "Applied to ommelanden." : "Dry run: all changes rolled back. Use --apply to persist.");
} catch (error) {
  await client.query("rollback");
  throw error;
} finally {
  await client.end();
}
