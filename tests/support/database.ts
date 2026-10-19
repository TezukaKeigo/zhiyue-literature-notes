import { readFile } from "node:fs/promises";
import { Miniflare } from "miniflare";
import { env } from "./runtime";

export async function openTestDatabase() {
  const worker = new Miniflare({
    modules: true,
    script: "export default { fetch() { return new Response('test database'); } };",
    compatibilityDate: "2026-05-15",
    d1Databases: ["DB"],
    d1Persist: false,
    cf: false,
  });
  const db = await worker.getD1Database("DB");
  env.DB = db as unknown as D1Database;
  env.AUTH_MODE = "local";
  const journal = JSON.parse(await readFile(new URL("../../drizzle/meta/_journal.json", import.meta.url), "utf8"));
  for (const entry of journal.entries) {
    const sql = await readFile(new URL(`../../drizzle/${entry.tag}.sql`, import.meta.url), "utf8");
    const statements = sql.split("--> statement-breakpoint").map((part: string) => part.trim()).filter(Boolean);
    await env.DB.batch(statements.map((statement: string) => env.DB!.prepare(statement)));
  }
  return { db: env.DB, close: () => worker.dispose() };
}

export async function clearTestDatabase() {
  delete env.AI;
  await env.DB!.batch(["literatures", "tags", "auth_sessions", "user_accounts"].map((name) => env.DB!.prepare(`DELETE FROM ${name}`)));
}
