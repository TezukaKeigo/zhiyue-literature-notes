import { and, eq, sql } from "drizzle-orm";
import { getDb } from "../../../../db";
import { notes } from "../../../../db/schema";
import { apiErrorResponse, getUserId, jsonError, parsePositiveId } from "../../../../lib/api";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
  try {
    const id = parsePositiveId((await context.params).id);
    if (!id) return jsonError("笔记编号无效");
    const userId = await getUserId();
    const payload = (await request.json()) as { content?: unknown; pageRef?: unknown };
    const content = typeof payload.content === "string" ? payload.content.trim().slice(0, 10000) : "";
    const pageRef = typeof payload.pageRef === "string" ? payload.pageRef.trim().slice(0, 60) : "";
    if (!content) return jsonError("笔记内容不能为空");
    const db = getDb();
    const [updated] = await db
      .update(notes)
      .set({ content, pageRef, updatedAt: sql`CURRENT_TIMESTAMP` })
      .where(and(eq(notes.id, id), eq(notes.userId, userId)))
      .returning();
    if (!updated) return jsonError("笔记不存在或已被删除", 404);
    return Response.json({ note: updated });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function DELETE(_request: Request, context: Context) {
  try {
    const id = parsePositiveId((await context.params).id);
    if (!id) return jsonError("笔记编号无效");
    const userId = await getUserId();
    const db = getDb();
    const deleted = await db
      .delete(notes)
      .where(and(eq(notes.id, id), eq(notes.userId, userId)))
      .returning({ id: notes.id });
    if (!deleted.length) return jsonError("笔记不存在或已被删除", 404);
    return Response.json({ success: true });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
