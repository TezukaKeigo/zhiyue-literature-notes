import { eq, sql } from "drizzle-orm";
import { getAuthenticatedUser } from "../../../chatgpt-auth";
import { getDb } from "../../../../db";
import { userAccounts } from "../../../../db/schema";
import { apiErrorResponse, jsonError } from "../../../../lib/api";
import { isSameOriginRequest } from "../../../../lib/local-auth";

export async function PATCH(request: Request) {
  if (!isSameOriginRequest(request)) return jsonError("请求来源无效", 403);

  try {
    const user = await getAuthenticatedUser();
    if (!user) return jsonError("登录状态无效或已过期，请重新登录", 401);
    if (user.provider !== "local" || !user.userId.startsWith("account:")) {
      return jsonError("当前登录方式不支持修改空间名称", 400);
    }

    const payload = (await request.json()) as { spaceName?: unknown };
    if (typeof payload.spaceName !== "string") return jsonError("请输入空间名称");
    const spaceName = payload.spaceName.trim();
    if (!spaceName) return jsonError("空间名称不能为空");
    if (spaceName.length > 30) return jsonError("空间名称不能超过 30 个字符");

    const accountId = Number(user.userId.slice("account:".length));
    if (!Number.isInteger(accountId) || accountId < 1) {
      return jsonError("账号信息无效，请重新登录", 401);
    }

    const db = getDb();
    const [updated] = await db
      .update(userAccounts)
      .set({ displayName: spaceName, updatedAt: sql`CURRENT_TIMESTAMP` })
      .where(eq(userAccounts.id, accountId))
      .returning({ displayName: userAccounts.displayName, email: userAccounts.email });

    if (!updated) return jsonError("账号不存在，请重新登录", 404);
    return Response.json({ user: updated });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
