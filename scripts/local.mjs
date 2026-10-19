import "./sites-env.mjs";
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createWorkerConfig, loadLocalEnvironment, readWorkerBuild } from "./runtime-config.mjs";

loadLocalEnvironment();
const [action, ...args] = process.argv.slice(2);
const configPath = resolve("dist/server/wrangler.local.json");
const wrangler = resolve("node_modules/wrangler/bin/wrangler.js");

function run(script, commandArgs) {
  const result = spawnSync(process.execPath, [script, ...commandArgs], { stdio: "inherit", env: process.env });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

try {
  if (!["setup", "migrate", "start"].includes(action)) throw new Error("支持的操作：setup、migrate、start");
  if (action === "setup") run(resolve("scripts/run-framework.mjs"), ["build"]);
  const config = createWorkerConfig(readWorkerBuild());
  writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
  if (action !== "start") {
    // Explicit --local guarantees this command never touches a remote database.
    run(wrangler, ["d1", "migrations", "apply", "DB", "--local", "--config", configPath, "--persist-to", ".wrangler/local-state"]);
    console.log("本地数据库已就绪。重复执行只应用新增迁移；运行 npm start 启动网站。");
  } else {
    console.log(config.ai ? "本地 D1 + 真实远程 AI（需先 wrangler login）。" : "本地离线模式：无需 Cloudflare 账号，AI 服务未启用。");
    run(wrangler, ["dev", "--config", configPath, "--persist-to", ".wrangler/local-state", "--ip", "127.0.0.1", "--inspector-port", "0", ...(config.ai ? [] : ["--local"]), ...args]);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
