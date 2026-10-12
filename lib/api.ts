import { getAuthenticatedUser } from "../app/chatgpt-auth";

export const READING_STATUSES = ["TO_READ", "READING", "FINISHED"] as const;
export type ReadingStatus = (typeof READING_STATUSES)[number];

export async function getUserId() {
  const user = await getAuthenticatedUser();
  if (!user) throw new AuthenticationRequiredError();
  return user.userId;
}

export class AuthenticationRequiredError extends Error {
  status = 401;

  constructor() {
    super("登录状态无效或已过期，请重新登录");
    this.name = "AuthenticationRequiredError";
  }
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

export function apiErrorResponse(error: unknown) {
  if (error instanceof AuthenticationRequiredError) {
    return jsonError(error.message, error.status);
  }
  return jsonError(errorMessage(error), 500);
}
