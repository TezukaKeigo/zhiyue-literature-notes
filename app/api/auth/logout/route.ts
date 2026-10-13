import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { SESSION_COOKIE_NAME } from "../../../chatgpt-auth";
import { getDb } from "../../../../db";
import { authSessions } from "../../../../db/schema";
import { jsonError } from "../../../../lib/api";
import {
  clearSessionCookie,
  hashSessionToken,
  isSameOriginRequest,
} from "../../../../lib/local-auth";

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) return jsonError("请求来源无效", 403);

  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (token) {
    const db = getDb();
    await db.delete(authSessions).where(eq(authSessions.tokenHash, await hashSessionToken(token)));
  }

  return Response.json(
    { success: true },
    { headers: { "Set-Cookie": clearSessionCookie() } },
  );
}
