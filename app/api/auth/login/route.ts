import { eq, lt, sql } from "drizzle-orm";
import { getDb } from "../../../../db";
import { authSessions, userAccounts } from "../../../../db/schema";
import { jsonError } from "../../../../lib/api";
import {
  createSessionCookie,
  createSessionToken,
  isSameOriginRequest,
  normalizeEmail,
  verifyPassword,
} from "../../../../lib/local-auth";

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_SECONDS = 15 * 60;

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) return jsonError("请求来源无效", 403);

  try {
    const payload = (await request.json()) as { email?: unknown; password?: unknown };
    const email = normalizeEmail(payload.email);
    const password = typeof payload.password === "string" ? payload.password : "";
    if (!email || !password) return jsonError("请输入邮箱和密码");

    const db = getDb();
    const [account] = await db
      .select()
      .from(userAccounts)
      .where(eq(userAccounts.email, email))
      .limit(1);
    const now = Math.floor(Date.now() / 1000);

    if (account?.lockedUntil && account.lockedUntil > now) {
      return jsonError("登录尝试次数过多，请 15 分钟后再试", 429);
    }

    const valid = account
      ? await verifyPassword(
          password,
          account.passwordHash,
          account.passwordSalt,
          account.passwordIterations,
        )
      : false;

    if (!account || !valid) {
      if (account) {
        const failedCount = account.failedLoginCount + 1;
        await db
          .update(userAccounts)
          .set({
            failedLoginCount: failedCount >= MAX_FAILED_ATTEMPTS ? 0 : failedCount,
            lockedUntil: failedCount >= MAX_FAILED_ATTEMPTS ? now + LOCK_SECONDS : null,
            updatedAt: sql`CURRENT_TIMESTAMP`,
          })
          .where(eq(userAccounts.id, account.id));
      }
      return jsonError("邮箱或密码不正确", 401);
    }

    await db
      .update(userAccounts)
      .set({ failedLoginCount: 0, lockedUntil: null, updatedAt: sql`CURRENT_TIMESTAMP` })
      .where(eq(userAccounts.id, account.id));

    const session = await createSessionToken();
    await db.delete(authSessions).where(lt(authSessions.expiresAt, now));
    await db.insert(authSessions).values({
      tokenHash: session.tokenHash,
      userId: account.id,
      expiresAt: session.expiresAt,
    });

    return Response.json(
      { user: { displayName: account.displayName, email: account.email } },
      { headers: { "Set-Cookie": createSessionCookie(session.token) } },
    );
  } catch {
    return jsonError("登录失败，请稍后重试", 500);
  }
}
