import { and, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { getDb } from "../../../../db";
import { literatureTags, literatures, notes, tags } from "../../../../db/schema";
import { errorMessage, getUserId, jsonError, parsePositiveId } from "../../../../lib/api";
import { parseLiteraturePayload } from "../../../../lib/literature-validation";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  try {
    const id = parsePositiveId((await context.params).id);
    if (!id) return jsonError("文献编号无效");
    const userId = await getUserId();
    const db = getDb();
    const [literature] = await db
      .select()
      .from(literatures)
      .where(and(eq(literatures.id, id), eq(literatures.userId, userId)))
      .limit(1);
    if (!literature) return jsonError("文献不存在或已被删除", 404);

    const [tagRows, noteRows] = await Promise.all([
      db
        .select({ id: tags.id, name: tags.name, color: tags.color })
        .from(literatureTags)
        .innerJoin(tags, eq(literatureTags.tagId, tags.id))
        .where(eq(literatureTags.literatureId, id)),
      db
        .select()
        .from(notes)
        .where(and(eq(notes.literatureId, id), eq(notes.userId, userId)))
        .orderBy(desc(notes.updatedAt), desc(notes.id)),
    ]);
    return Response.json({ literature: { ...literature, tags: tagRows, notes: noteRows } });
  } catch (error) {
    return jsonError(errorMessage(error), 500);
  }
}

export async function PATCH(request: Request, context: Context) {
  try {
    const id = parsePositiveId((await context.params).id);
    if (!id) return jsonError("文献编号无效");
    const userId = await getUserId();
    const parsed = parseLiteraturePayload(await request.json());
    if ("error" in parsed) return jsonError(parsed.error);
    const { tagIds, ...values } = parsed.data;
    const db = getDb();

    const [existing] = await db
      .select({ id: literatures.id })
      .from(literatures)
      .where(and(eq(literatures.id, id), eq(literatures.userId, userId)))
      .limit(1);
    if (!existing) return jsonError("文献不存在或已被删除", 404);

    if (tagIds.length) {
      const ownedTags = await db
        .select({ id: tags.id })
        .from(tags)
        .where(and(eq(tags.userId, userId), inArray(tags.id, tagIds)));
      if (ownedTags.length !== tagIds.length) return jsonError("包含无效标签");
    }

    const duplicate = await db
      .select({ id: literatures.id })
      .from(literatures)
      .where(
        and(
          eq(literatures.userId, userId),
          ne(literatures.id, id),
          sql`lower(trim(${literatures.title})) = lower(trim(${values.title}))`,
          sql`lower(trim(${literatures.authors})) = lower(trim(${values.authors}))`,
          values.year === null ? sql`${literatures.year} is null` : eq(literatures.year, values.year),
        ),
      )
      .limit(1);
    if (duplicate.length) return jsonError("相同标题、作者和年份的文献已经存在", 409);

    const [updated] = await db
      .update(literatures)
      .set({ ...values, updatedAt: sql`CURRENT_TIMESTAMP` })
      .where(and(eq(literatures.id, id), eq(literatures.userId, userId)))
      .returning();

    await db.delete(literatureTags).where(eq(literatureTags.literatureId, id));
    if (tagIds.length) {
      await db.insert(literatureTags).values(tagIds.map((tagId) => ({ literatureId: id, tagId })));
    }
    return Response.json({ literature: updated });
  } catch (error) {
    return jsonError(errorMessage(error), 500);
  }
}

export async function DELETE(_request: Request, context: Context) {
  try {
    const id = parsePositiveId((await context.params).id);
    if (!id) return jsonError("文献编号无效");
    const userId = await getUserId();
    const db = getDb();
    const deleted = await db
      .delete(literatures)
      .where(and(eq(literatures.id, id), eq(literatures.userId, userId)))
      .returning({ id: literatures.id });
    if (!deleted.length) return jsonError("文献不存在或已被删除", 404);
    return Response.json({ success: true });
  } catch (error) {
    return jsonError(errorMessage(error), 500);
  }
}
