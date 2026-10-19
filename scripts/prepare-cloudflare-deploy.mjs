import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createWorkerConfig, loadLocalEnvironment } from "./runtime-config.mjs";

loadLocalEnvironment();

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

config = createWorkerConfig(config, { remote: true });

await writeFile(wranglerPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
console.log("Cloudflare 部署配置已写入 dist/server/wrangler.json");
