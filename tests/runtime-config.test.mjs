import { describe, expect, it } from "vitest";
import { createWorkerConfig, LOCAL_DATABASE_ID } from "../scripts/runtime-config.mjs";

const base = { name: "old", main: "index.js", assets: { directory: "../client" }, vars: { AUTH_MODE: "sites" }, ai: { binding: "AI", remote: true }, d1_databases: [{ database_id: "original-account-database" }] };

describe("可复现运行配置", () => {
  it("默认本地模式没有 AI 或个人远程数据库，并使用本地登录", () => {
    const config = createWorkerConfig(base, { environment: {} });
    expect(config.ai).toBeUndefined();
    expect(config.vars.AUTH_MODE).toBe("local");
    expect(config.d1_databases[0].database_id).toBe(LOCAL_DATABASE_ID);
    expect(base.vars.AUTH_MODE).toBe("sites");
  });
  it("显式开启本地 AI 时，数据库仍是本地数据库", () => {
    const config = createWorkerConfig(base, { environment: { ZHIYUE_LOCAL_AI: "1" } });
    expect(config.ai).toEqual({ binding: "AI", remote: true });
    expect(config.d1_databases[0].database_id).toBe(LOCAL_DATABASE_ID);
  });
  it.each(["", "not-a-uuid", LOCAL_DATABASE_ID])("远程数据库 ID 缺失或非法时拒绝生成部署配置：%s", (databaseId) => {
    expect(() => createWorkerConfig(base, { remote: true, environment: { CLOUDFLARE_D1_DATABASE_ID: databaseId } })).toThrow("CLOUDFLARE_D1_DATABASE_ID");
  });
  it("部署使用调用者提供的资源配置", () => {
    const config = createWorkerConfig(base, { remote: true, environment: { CLOUDFLARE_D1_DATABASE_ID: "12345678-1234-4234-8234-123456789abc", CLOUDFLARE_WORKER_NAME: "my-worker", CLOUDFLARE_D1_DATABASE_NAME: "my-db" } });
    expect(config.name).toBe("my-worker");
    expect(config.d1_databases[0].database_name).toBe("my-db");
    expect(config.ai.binding).toBe("AI");
  });
});
