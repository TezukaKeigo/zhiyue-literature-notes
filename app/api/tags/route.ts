import { and, count, eq, sql } from "drizzle-orm";
import { getDb } from "../../../db";
import { literatureTags, tags } from "../../../db/schema";
import { errorMessage, getUserId, jsonError } from "../../../lib/api";

export async function GET() {
  try {
    const userId = await getUserId();
    const db = getDb();
    const rows = await db
      .select({
        id: tags.id,
        name: tags.name,
        color: tags.color,
        createdAt: tags.createdAt,
        literatureCount: count(literatureTags.literatureId),
      })
      .from(tags)
      .leftJoin(literatureTags, eq(tags.id, literatureTags.tagId))
      .where(eq(tags.userId, userId))
      .groupBy(tags.id)
      .orderBy(sql`lower(${tags.name})`);
    return Response.json({ tags: rows.map((row) => ({ ...row, literatureCount: Number(row.literatureCount) })) });
  } catch (error) {
    return jsonError(errorMessage(error), 500);
  }
}

export async function POST(request: Request) {
  try {
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
      .where(and(eq(tags.userId, userId), sql`lower(trim(${tags.name})) = lower(trim(${name}))`))
      .limit(1);
    if (duplicate.length) return jsonError("同名标签已经存在", 409);
    const [created] = await db.insert(tags).values({ userId, name, color }).returning();
    return Response.json({ tag: { ...created, literatureCount: 0 } }, { status: 201 });
  } catch (error) {
    return jsonError(errorMessage(error), 500);
  }
}
