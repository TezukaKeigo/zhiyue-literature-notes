import { and, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { literatures, notes } from "../../../db/schema";
import { apiErrorResponse, getUserId, jsonError } from "../../../lib/api";

export async function POST(request: Request) {
  try {
    const userId = await getUserId();
    const payload = (await request.json()) as {
      literatureId?: unknown;
      content?: unknown;
      pageRef?: unknown;
    };
    const literatureId = Number(payload.literatureId);
    const content = typeof payload.content === "string" ? payload.content.trim().slice(0, 10000) : "";
    const pageRef = typeof payload.pageRef === "string" ? payload.pageRef.trim().slice(0, 60) : "";
    if (!Number.isInteger(literatureId) || literatureId <= 0) return jsonError("文献编号无效");
    if (!content) return jsonError("笔记内容不能为空");
    const db = getDb();
    const [literature] = await db
      .select({ id: literatures.id })
      .from(literatures)
      .where(and(eq(literatures.id, literatureId), eq(literatures.userId, userId)))
      .limit(1);
    if (!literature) return jsonError("关联文献不存在或已被删除", 404);
    const [created] = await db
      .insert(notes)
      .values({ literatureId, userId, content, pageRef })
      .returning();
    return Response.json({ note: created }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
