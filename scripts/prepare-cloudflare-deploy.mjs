import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const wranglerPath = resolve("dist/server/wrangler.json");

let config;
try {
  config = JSON.parse(await readFile(wranglerPath, "utf8"));
} catch (error) {
  throw new Error(
    `无法读取 ${wranglerPath}，请先运行 npm run build。`,
    { cause: error },
  );
}

config.name = "zhiyue-literature-notes";
config.topLevelName = "zhiyue-literature-notes";
config.workers_dev = true;
config.preview_urls = false;
config.keep_vars = true;
config.vars = { ...(config.vars ?? {}), AUTH_MODE: "local" };
config.ai = { binding: "AI", remote: true };
config.d1_databases = [
  {
    binding: "DB",
    database_name: "zhiyue-literature-notes-db",
    database_id: "c614a5bb-31c0-43ef-b1e1-5c250d7cd013",
  },
];

await writeFile(wranglerPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
console.log("Cloudflare 部署配置已写入 dist/server/wrangler.json");
