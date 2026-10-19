import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

export const LOCAL_DATABASE_ID = "00000000-0000-4000-8000-000000000000";

export function loadLocalEnvironment(root = process.cwd()) {
  for (const filename of [".env.local", ".env"]) {
    const path = resolve(root, filename);
    if (existsSync(path)) process.loadEnvFile(path);
  }
}

export function createWorkerConfig(base, { remote = false, environment = process.env } = {}) {
  const config = structuredClone(base);
  const name = remote ? environment.CLOUDFLARE_WORKER_NAME || "zhiyue-literature-notes" : "zhiyue-literature-notes-local";
  const databaseId = remote ? environment.CLOUDFLARE_D1_DATABASE_ID?.trim() : LOCAL_DATABASE_ID;
  if (remote && (!databaseId || databaseId === LOCAL_DATABASE_ID || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(databaseId))) {
    throw new Error("请在 .env.local 中设置 CLOUDFLARE_D1_DATABASE_ID。先运行 npx wrangler d1 create <数据库名称>，再填写返回的 database_id。");
  }
  config.name = config.topLevelName = name;
  config.vars = { ...(config.vars ?? {}), AUTH_MODE: "local" };
  config.d1_databases = [{
    binding: "DB",
    database_name: remote ? environment.CLOUDFLARE_D1_DATABASE_NAME || "zhiyue-literature-notes-db" : "zhiyue-literature-notes-local",
    database_id: databaseId,
    migrations_dir: "../../drizzle",
  }];
  delete config.ai;
  if (remote || environment.ZHIYUE_LOCAL_AI === "1") config.ai = { binding: "AI", remote: true };
  if (remote) {
    config.workers_dev = true;
    config.preview_urls = false;
    config.keep_vars = true;
  }
  return config;
}

export function readWorkerBuild() {
  try {
    return JSON.parse(readFileSync(resolve("dist/server/wrangler.json"), "utf8"));
  } catch {
    throw new Error("未找到有效构建。请先运行 npm run setup，或 npm run build。");
  }
}
