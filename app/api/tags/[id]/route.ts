import { and, eq, ne, sql } from "drizzle-orm";
import { getDb } from "../../../../db";
import { tags } from "../../../../db/schema";
import { errorMessage, getUserId, jsonError, parsePositiveId } from "../../../../lib/api";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
  try {
    const id = parsePositiveId((await context.params).id);
    if (!id) return jsonError("标签编号无效");
    const userId = await getUserId();
    const payload = (await request.json()) as { name?: unknown; color?: unknown };
    const name = typeof payload.name === "string" ? payload.name.trim().slice(0, 30) : "";
    const color = typeof payload.color === "string" && /^#[0-9a-fA-F]{6}$/.test(payload.color)
      ? payload.color
      : "#315c63";
    if (!name) return jsonError("标签名称不能为空");
    const db = getDb();
    const duplicate = await db
      .select({ id: tags.id })
      .from(tags)
      .where(
        and(
          eq(tags.userId, userId),
          ne(tags.id, id),
          sql`lower(trim(${tags.name})) = lower(trim(${name}))`,
        ),
      )
      .limit(1);
    if (duplicate.length) return jsonError("同名标签已经存在", 409);
    const [updated] = await db
      .update(tags)
      .set({ name, color })
      .where(and(eq(tags.id, id), eq(tags.userId, userId)))
      .returning();
    if (!updated) return jsonError("标签不存在或已被删除", 404);
    return Response.json({ tag: updated });
  } catch (error) {
    return jsonError(errorMessage(error), 500);
  }
}

export async function DELETE(_request: Request, context: Context) {
  try {
    const id = parsePositiveId((await context.params).id);
    if (!id) return jsonError("标签编号无效");
    const userId = await getUserId();
    const db = getDb();
    const deleted = await db
      .delete(tags)
      .where(and(eq(tags.id, id), eq(tags.userId, userId)))
      .returning({ id: tags.id });
    if (!deleted.length) return jsonError("标签不存在或已被删除", 404);
    return Response.json({ success: true });
  } catch (error) {
    return jsonError(errorMessage(error), 500);
  }
}
