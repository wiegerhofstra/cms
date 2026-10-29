#!/usr/bin/env node
// Copy to scripts/update-cms-docs.mjs. Node.js 22.18+; no dependencies.
import { createHash } from "node:crypto";
import { cp, lstat, mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const stateName = ".cms-docs-state.json";
const maxBytes = 20 * 1024 * 1024;
const hash = (text) => createHash("sha256").update(text).digest("hex");
const sorted = (record) => Object.fromEntries(Object.entries(record).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0));
const isRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

function relativePath(value) {
  if (typeof value !== "string" || !value || value.length > 240 || value.split("/").some((part) =>
    !/^[a-zA-Z0-9_.-]+$/.test(part) || [".", "..", ".git", "node_modules"].includes(part.toLowerCase()) ||
    /[. ]$/.test(part) || /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(part))) {
    throw new Error("Paths must be relative to the project, without traversal or reserved names.");
  }
  return value;
}

async function statOrNull(filename) {
  try { return await lstat(filename); } catch (error) { if (error.code === "ENOENT") return null; throw error; }
}

async function ensureNoSymlinks(root, relative) {
  let current = root;
  for (const part of relative.split("/")) {
    current = path.join(current, part);
    const info = await statOrNull(current);
    if (info?.isSymbolicLink()) throw new Error("The documentation output cannot contain symlinks.");
  }
}

async function localFiles(directory, prefix = "") {
  const files = Object.create(null);
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const name = `${prefix}${entry.name}`;
    if (entry.isDirectory()) Object.assign(files, await localFiles(path.join(directory, entry.name), `${name}/`));
    else if (entry.isFile()) files[name] = hash(await readFile(path.join(directory, entry.name)));
    else throw new Error("The documentation output cannot contain symlinks or special files.");
  }
  return files;
}

function validateSnapshot(snapshot, tenantSlug) {
  if (!isRecord(snapshot) || snapshot.version !== 1 || snapshot.tenantSlug !== tenantSlug || !isRecord(snapshot.files)) {
    throw new Error("Unsupported documentation response or wrong tenant. Download a new setup kit if the API version changed.");
  }
  const names = Object.keys(snapshot.files);
  const seen = new Set();
  if (!names.length || names.length > 1000) throw new Error("Invalid documentation file count.");
  for (const name of names) {
    relativePath(name);
    if (name.split("/").some((part) => part.startsWith(".")) || typeof snapshot.files[name] !== "string" || seen.has(name.toLowerCase())) {
      throw new Error("Invalid or duplicate documentation filename.");
    }
    seen.add(name.toLowerCase());
  }
  for (const name of names) {
    const parts = name.toLowerCase().split("/");
    while (parts.length > 1) {
      parts.pop();
      if (seen.has(parts.join("/"))) throw new Error("Conflicting documentation paths.");
    }
  }
  for (const name of ["INTEGRATION.md", "manifest.json", "openapi.json", "models.schema.json"]) {
    if (!Object.hasOwn(snapshot.files, name)) throw new Error("The documentation response is incomplete.");
  }
  const manifest = JSON.parse(snapshot.files["manifest.json"]);
  if (manifest.tenant?.slug !== tenantSlug) throw new Error("The documentation manifest belongs to a different tenant.");
  if (hash(JSON.stringify(sorted(snapshot.files))) !== snapshot.contentHash) throw new Error("Documentation checksum mismatch.");
  return snapshot;
}

async function download(config, token) {
  const response = await fetch(`${config.origin}/api/integration/${encodeURIComponent(config.tenantSlug)}/v1`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    redirect: "error",
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    await response.body?.cancel();
    if (response.status === 401) throw new Error("CMS token is invalid, expired or revoked. Check your existing environment configuration.");
    if (response.status === 403) throw new Error("Enable docs:read on the existing token in Settings → Auth, and check that its tenant matches the config.");
    throw new Error(`Documentation download failed (HTTP ${response.status}). Existing docs were kept.`);
  }
  if (response.headers.get("content-type")?.split(";", 1)[0] !== "application/json" || !response.body) {
    await response.body?.cancel();
    throw new Error("Expected a JSON documentation response.");
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > maxBytes) throw new Error("Documentation response exceeds 20 MiB.");
    chunks.push(chunk);
  }
  return validateSnapshot(JSON.parse(Buffer.concat(chunks).toString("utf8")), config.tenantSlug);
}

async function sync(root, config, snapshot, check) {
  const output = path.join(root, config.output);
  await ensureNoSymlinks(root, config.output);
  const info = await statOrNull(output);
  if (info && !info.isDirectory()) throw new Error("Documentation output must be a directory.");
  const current = info ? await localFiles(output) : {};
  const source = `${config.origin}/api/integration/${config.tenantSlug}/v1`;
  let previous = { files: {} };
  if (Object.hasOwn(current, stateName)) {
    previous = JSON.parse(await readFile(path.join(output, stateName), "utf8"));
    if (previous.version !== 1 || previous.source !== source || !isRecord(previous.files)) {
      throw new Error("Output belongs to another CMS configuration or has an invalid state file. Choose a new output directory.");
    }
    for (const [name, checksum] of Object.entries(previous.files)) {
      relativePath(name);
      if (name === stateName || !/^[a-f0-9]{64}$/.test(checksum)) throw new Error("Invalid documentation state file.");
    }
  }
  const next = Object.fromEntries(Object.entries(snapshot.files).map(([name, body]) => [name, hash(body)]));
  const removed = Object.keys(previous.files).filter((name) => !Object.hasOwn(next, name));
  const changed = Object.keys(next).filter((name) => current[name] !== next[name]);
  const conflicts = [...new Set([...Object.keys(previous.files), ...Object.keys(next)])].filter((name) =>
    Object.hasOwn(current, name) && current[name] !== previous.files[name] && current[name] !== next[name]);
  if (conflicts.length) throw new Error(`Local documentation edits would be overwritten: ${conflicts.join(", ")}. Move your edits outside the generated folder or restore these files from Git first.`);
  const state = `${JSON.stringify({ version: 1, source, contentHash: snapshot.contentHash, files: sorted(next) }, null, 2)}\n`;
  if (!changed.length && !removed.length && current[stateName] === hash(state)) {
    console.log("CMS documentation is up to date.");
    return;
  }
  if (check) {
    console.error(`CMS documentation is out of date (${changed.length} changed, ${removed.length} removed). Run npm run cms:docs.`);
    process.exitCode = 1;
    return;
  }

  // Stage alongside the destination so directory renames stay on the same filesystem.
  const temporary = await mkdtemp(`${output}.update-`);
  const staged = path.join(temporary, "next");
  const backup = path.join(temporary, "previous");
  let keepBackup = false;
  try {
    if (info) await cp(output, staged, { recursive: true, errorOnExist: true, force: false });
    else await mkdir(staged);
    for (const name of removed) await rm(path.join(staged, name), { force: true });
    for (const [name, body] of Object.entries(snapshot.files)) {
      const target = path.join(staged, name);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, body);
    }
    await writeFile(path.join(staged, stateName), state);
    // Recheck after staging, protecting edits made while the download was being applied.
    if (JSON.stringify(sorted(info ? await localFiles(output) : {})) !== JSON.stringify(sorted(current))) {
      throw new Error("Documentation changed during the update. Run the command again.");
    }
    if (info) await rename(output, backup);
    try { await rename(staged, output); } catch (error) {
      if (info) {
        try { await rename(backup, output); } catch {
          keepBackup = true;
          throw new Error(`Could not restore documentation. Your previous files are preserved in ${backup}.`, { cause: error });
        }
      }
      throw error;
    }
    console.log(`Updated ${config.output}: ${changed.length} changed, ${removed.length} removed. Review and commit the diff.`);
  } finally {
    if (!keepBackup) await rm(temporary, { recursive: true, force: true }).catch(() => console.warn(`Could not remove temporary directory ${temporary}.`));
  }
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help")) {
    console.log("npm run cms:docs [-- --check]\nConfiguration: cms-docs.config.json. --check exits 1 when stale and never writes files.");
    return;
  }
  if (args.some((arg) => arg !== "--check")) throw new Error("Unknown argument. Use --check or --help.");
  const root = fileURLToPath(new URL("../", import.meta.url));
  const config = JSON.parse(await readFile(path.join(root, "cms-docs.config.json"), "utf8"));
  if (config.version !== 1 || typeof config.tenantSlug !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(config.tenantSlug) ||
    typeof config.tokenEnv !== "string" || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(config.tokenEnv)) throw new Error("Invalid cms-docs.config.json.");
  const origin = new URL(config.origin);
  if (origin.username || origin.password || origin.origin !== config.origin ||
    (origin.protocol !== "https:" && !(origin.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname)))) {
    throw new Error("CMS origin must be HTTPS (HTTP is allowed only for localhost development).");
  }
  relativePath(config.output);
  if (!Array.isArray(config.envFiles) || config.envFiles.some((file) => typeof file !== "string")) throw new Error("envFiles must be an array of relative file paths.");
  // Existing process variables win; later envFiles take precedence over earlier files.
  for (const file of [...config.envFiles].reverse()) {
    try { process.loadEnvFile(path.join(root, relativePath(file))); } catch (error) { if (error.code !== "ENOENT") throw error; }
  }
  const token = process.env[config.tokenEnv];
  if (!token || !/^cms_at_[^\s]+$/.test(token)) throw new Error(`Set ${config.tokenEnv} to your existing CMS token in the environment or configured envFiles.`);
  const snapshot = await download(config, token);
  if (args.includes("--check")) return sync(root, config, snapshot, true);
  await ensureNoSymlinks(root, config.output);
  const output = path.join(root, config.output);
  await mkdir(path.dirname(output), { recursive: true });
  const lock = `${output}.lock`;
  try { await mkdir(lock); } catch (error) {
    if (error.code === "EEXIST") throw new Error(`Another update may be running. If an earlier run was interrupted, remove ${lock} and retry.`);
    throw error;
  }
  try { await sync(root, config, snapshot, false); } finally { await rm(lock, { recursive: true, force: true }); }
}

await main().catch((error) => {
  console.error(`CMS documentation update failed: ${error.message}`);
  process.exitCode = 1;
});
