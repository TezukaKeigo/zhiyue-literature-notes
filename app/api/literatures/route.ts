import { and, count, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "../../../db";
import { literatureTags, literatures, notes, tags } from "../../../db/schema";
import {
  apiErrorResponse,
  getUserId,
  jsonError,
} from "../../../lib/api";
import { LiteraturePayload, parseLiteraturePayload } from "../../../lib/literature-validation";

export async function GET(request: Request) {
  try {
    const userId = await getUserId();
    const db = getDb();
    const url = new URL(request.url);
    const query = (url.searchParams.get("q") ?? "").trim().toLocaleLowerCase();
    const status = url.searchParams.get("status") ?? "ALL";
    const tagId = Number(url.searchParams.get("tagId") ?? 0);
    const sort = url.searchParams.get("sort") ?? "updated-desc";

    const [rows, tagRows, noteRows] = await Promise.all([
      db.select().from(literatures).where(eq(literatures.userId, userId)),
      db
        .select({
          literatureId: literatureTags.literatureId,
          id: tags.id,
          name: tags.name,
          color: tags.color,
        })
        .from(literatureTags)
        .innerJoin(tags, eq(literatureTags.tagId, tags.id))
        .where(eq(tags.userId, userId)),
      db
        .select({ literatureId: notes.literatureId, count: count() })
        .from(notes)
        .where(eq(notes.userId, userId))
        .groupBy(notes.literatureId),
    ]);

    const tagMap = new Map<number, Array<{ id: number; name: string; color: string }>>();
    for (const item of tagRows) {
      const list = tagMap.get(item.literatureId) ?? [];
      list.push({ id: item.id, name: item.name, color: item.color });
      tagMap.set(item.literatureId, list);
    }
    const noteMap = new Map(noteRows.map((item) => [item.literatureId, Number(item.count)]));

    let result = rows.map((item) => ({
      ...item,
      tags: tagMap.get(item.id) ?? [],
      noteCount: noteMap.get(item.id) ?? 0,
    }));

    if (query) {
      result = result.filter((item) =>
        [
          item.title,
          item.authors,
          item.journal,
          item.doi,
          ...item.tags.map((tag) => tag.name),
        ]
          .join(" ")
          .toLocaleLowerCase()
          .includes(query),
      );
    }
    if (["TO_READ", "READING", "FINISHED"].includes(status)) {
      result = result.filter((item) => item.readingStatus === status);
    }
    if (Number.isInteger(tagId) && tagId > 0) {
      result = result.filter((item) => item.tags.some((tag) => tag.id === tagId));
    }

    result.sort((a, b) => {
      if (sort === "year-desc") return (b.year ?? 0) - (a.year ?? 0);
      if (sort === "year-asc") return (a.year ?? 9999) - (b.year ?? 9999);
      if (sort === "title-asc") return a.title.localeCompare(b.title, "zh-CN");
      if (sort === "created-desc") return b.createdAt.localeCompare(a.createdAt);
      return b.updatedAt.localeCompare(a.updatedAt);
    });

    return Response.json({ literatures: result });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const userId = await getUserId();
    const parsed = parseLiteraturePayload((await request.json()) as LiteraturePayload);
    if ("error" in parsed) return jsonError(parsed.error ?? "文献信息校验失败");
    const { tagIds, ...values } = parsed.data;
    const db = getDb();

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
          sql`lower(trim(${literatures.title})) = lower(trim(${values.title}))`,
          sql`lower(trim(${literatures.authors})) = lower(trim(${values.authors}))`,
          values.year === null ? sql`${literatures.year} is null` : eq(literatures.year, values.year),
        ),
      )
      .limit(1);
    if (duplicate.length) return jsonError("相同标题、作者和年份的文献已经存在", 409);

    const [created] = await db
      .insert(literatures)
      .values({ userId, ...values })
      .returning();
    if (tagIds.length) {
      await db.insert(literatureTags).values(
        tagIds.map((tagId) => ({ literatureId: created.id, tagId })),
      );
    }
    return Response.json({ literature: created }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

