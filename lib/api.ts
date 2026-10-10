import { headers } from "next/headers";

export const READING_STATUSES = ["TO_READ", "READING", "FINISHED"] as const;
export type ReadingStatus = (typeof READING_STATUSES)[number];

export async function getUserId() {
  const requestHeaders = await headers();
  return requestHeaders.get("oai-authenticated-user-id") ?? "local-demo-user";
}

export function jsonError(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}

export function isReadingStatus(value: unknown): value is ReadingStatus {
  return typeof value === "string" && READING_STATUSES.includes(value as ReadingStatus);
}

export function parsePositiveId(value: string) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export function errorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "系统发生未知错误";
  if (message.includes("UNIQUE constraint failed")) return "名称或记录已存在，请勿重复提交";
  if (message.includes("no such table")) return "数据库尚未初始化，请先应用项目迁移";
  return message;
}
