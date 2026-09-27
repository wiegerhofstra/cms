import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import nextEnv from "@next/env";
import pg from "pg";
import { readSource } from "./source.mjs";
import { readMedia, storageClient, uploadMedia, checksum } from "./media.mjs";
import { buildContentPlan } from "./content.mjs";
import { readDestination, validatePlan, writePlan, assertUnchangedSnapshot } from "./destination.mjs";

const args = process.argv.slice(2);
if (args.length > 1 || args.some((a) => !["--apply", "--dry-run"].includes(a))) throw new Error("Use --dry-run (default) or --apply");
const apply = args.includes("--apply");
nextEnv.loadEnvConfig(process.cwd());
if (!process.env.DATABASE_URL || !process.env.S3_BUCKET) throw new Error("DATABASE_URL and S3_BUCKET are required");
const runDirectory = path.resolve(".env.ommelanden-content", `${new Date().toISOString().replaceAll(":", "-")}-${apply ? "apply" : "dry-run"}`);
await mkdir(runDirectory, { recursive: true, mode: 0o700 });
const save = (name, value) => writeFile(path.join(runDirectory, name), JSON.stringify(value, null, 2), { mode: 0o600 });
const target = new pg.Client({ connectionString: process.env.DATABASE_URL });
await target.connect();
let s3;
let committed = false;
try {
  const source = await readSource(process.env.OMMELANDEN_DATABASE_CONFIG ?? path.resolve("../ommelanden/config/database.yml"));
  await save("source.json", source);
  await target.query("begin isolation level repeatable read read only");
  const before = await readDestination(target);
  await target.query("rollback");
  await save("destination-before.json", before);
  const media = await readMedia(process.env.OMMELANDEN_DRAGONFLY_ROOT ?? "/home/mythor/Downloads/ommendragon_dump/dragonfly/production", before.tenant.id, process.env.S3_BUCKET);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Amsterdam", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const plan = buildContentPlan(source, before.tenant, before.models, before.entries, media, today);
  validatePlan(plan, before, media);
  await save("media.json", media);
  await save("plan.json", plan);
  const counts = Object.fromEntries(["create", "fill_missing", "reuse"].map((action) => [action, plan.entries.filter((e) => e.action === action).length]));
  const report = { mode: apply ? "apply" : "dry-run", sourceReadOnly: true, sourceSha256: checksum(JSON.stringify(source)),
    sourceCounts: plan.sourceCounts, plannedEntries: counts, media: media.length, mediaBytes: media.reduce((n, a) => n + a.sizeBytes, 0),
    warnings: plan.warnings, pagePublicationPolicy: plan.pagePublicationPolicy, routes: plan.routes };
  await save("report.json", report);
  console.log(JSON.stringify({ source: report.sourceCounts, entries: counts, assets: media.length, skippedStaleRelationships: plan.warnings.length }, null, 2));
  if (apply) {
    s3 = storageClient();
    await uploadMedia(s3, media, (done, total) => { if (done % 10 === 0 || done === total) console.log(`Uploaded/verified media ${done}/${total}`); });
    await target.query("begin isolation level serializable");
    await target.query("set local lock_timeout='5s'");
    await target.query("select pg_advisory_xact_lock(hashtext($1))", [`ommelanden-import:${before.tenant.id}`]);
    assertUnchangedSnapshot(await readDestination(target), before);
    report.applied = await writePlan(target, plan, before, media);
    const after = await readDestination(target);
    const secondPlan = buildContentPlan(source, after.tenant, after.models, after.entries, media, today);
    validatePlan(secondPlan, after, media);
    if (secondPlan.entries.some((e) => e.action !== "reuse")) throw new Error("Import is not idempotent");
    await save("destination-after.json", after);
    await target.query("commit");
    committed = true;
    report.committed = true;
    await save("report.json", report);
    console.log("Import committed:", JSON.stringify(report.applied));
  } else console.log("Dry run only: no database or storage writes.");
  console.log(`Report: ${path.join(runDirectory, "report.json")}`);
} catch (error) {
  await target.query("rollback");
  await save("error.json", { message: error.message, databaseCommitted: committed });
  console.error(`Import ${committed ? "committed, but reporting failed" : "not committed"}. Details: ${runDirectory}`);
  throw error;
} finally {
  s3?.destroy();
  await target.end();
}
