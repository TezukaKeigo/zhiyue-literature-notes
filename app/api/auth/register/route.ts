import { lt } from "drizzle-orm";
import { getDb } from "../../../../db";
import { authSessions, userAccounts } from "../../../../db/schema";
import { jsonError } from "../../../../lib/api";
import {
  createPasswordHash,
  createSessionCookie,
  createSessionToken,
  isSameOriginRequest,
  isValidEmail,
  normalizeEmail,
} from "../../../../lib/local-auth";

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) return jsonError("请求来源无效", 403);

  try {
    const payload = (await request.json()) as {
      displayName?: unknown;
      email?: unknown;
      password?: unknown;
    };
    const displayName = typeof payload.displayName === "string"
      ? payload.displayName.trim().slice(0, 30)
      : "";
    const email = normalizeEmail(payload.email);
    const password = typeof payload.password === "string" ? payload.password : "";

    if (!displayName) return jsonError("请输入显示名称");
    if (!isValidEmail(email)) return jsonError("请输入有效的邮箱地址");
    if (password.length < 10) return jsonError("密码至少需要 10 个字符");
    if (password.length > 128) return jsonError("密码不能超过 128 个字符");

    const passwordRecord = await createPasswordHash(password);
    const db = getDb();
    let account: typeof userAccounts.$inferSelect;
    try {
      [account] = await db
        .insert(userAccounts)
        .values({
          email,
          displayName,
          passwordHash: passwordRecord.hash,
          passwordSalt: passwordRecord.salt,
          passwordIterations: passwordRecord.iterations,
        })
        .returning();
    } catch (error) {
      // Drizzle wraps the D1 constraint error in Error.cause.
      const cause = error instanceof Error ? error.cause : undefined;
      const message = [error, cause].map((item) => item instanceof Error ? item.message : "").join("\n");
      if (message.includes("UNIQUE constraint failed")) {
        return jsonError("该邮箱已经注册，请直接登录", 409);
      }
      throw error;
    }

    const session = await createSessionToken();
    const now = Math.floor(Date.now() / 1000);
    await db.delete(authSessions).where(lt(authSessions.expiresAt, now));
    await db.insert(authSessions).values({
      tokenHash: session.tokenHash,
      userId: account.id,
      expiresAt: session.expiresAt,
    });

    return Response.json(
      { user: { displayName: account.displayName, email: account.email } },
      { status: 201, headers: { "Set-Cookie": createSessionCookie(session.token) } },
    );
  } catch {
    return jsonError("创建账号失败，请稍后重试", 500);
  }
}
