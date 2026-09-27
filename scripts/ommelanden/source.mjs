import { readFile } from "node:fs/promises";
import { load } from "js-yaml";
import pg from "pg";

export const sourceTables = [
  "admin_blogs", "admin_experiences", "admin_group_items", "admin_groups", "admin_humans",
  "admin_issues", "admin_loc_human_links", "admin_loc_specialty_links", "admin_locations",
  "admin_menus", "admin_pages", "admin_speciality_human_links", "admin_specialties", "admin_trainings",
];

export async function readSource(configPath) {
  // Parse data only. Never evaluate Rails ERB or load the Rails application.
  const config = load(await readFile(configPath, "utf8")).development;
  if (config?.adapter !== "postgresql") throw new Error("Expected a PostgreSQL development configuration");
  const client = new pg.Client({
    host: config.host, port: config.port ?? 5432, database: config.database,
    user: config.username, password: config.password, connectionTimeoutMillis: 5000,
    // Enforced by PostgreSQL from connection startup, before the first query.
    options: "-c default_transaction_read_only=on -c statement_timeout=30000",
    types: { getTypeParser(oid, format) {
      if (oid === 1082) return (value) => value; // calendar dates, no timezone conversion
      if (oid === 1114) return (value) => new Date(`${value.replace(" ", "T")}Z`); // Rails stores UTC
      return pg.types.getTypeParser(oid, format);
    } },
  });
  await client.connect();
  try {
    await client.query("begin isolation level repeatable read read only");
    if ((await client.query("show transaction_read_only")).rows[0].transaction_read_only !== "on") {
      throw new Error("Source database is not read-only");
    }
    const snapshot = {};
    for (const table of sourceTables) snapshot[table] = (await client.query(`select * from ${table} order by id`)).rows;
    // Public bylines only: never extract authentication data or password hashes.
    snapshot.users = (await client.query("select id,name from users order by id")).rows;
    return JSON.parse(JSON.stringify(snapshot));
  } finally {
    await client.query("rollback");
    await client.end();
  }
}
