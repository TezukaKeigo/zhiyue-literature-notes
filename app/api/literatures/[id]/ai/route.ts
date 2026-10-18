import { and, asc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../../../../../db";
import { literatureAiOutputs, literatures, notes } from "../../../../../db/schema";
import {
  AI_MODEL,
  AiGenerationError,
  type AiOutputKind,
  buildPaperAnalysisSource,
  buildReadingSummarySource,
  createAiInputHash,
  generateAiOutput,
  parseStoredStringArray,
} from "../../../../../lib/ai";
import {
  apiErrorResponse,
  getUserId,
  jsonError,
  parsePositiveId,
} from "../../../../../lib/api";
import { isSameOriginRequest } from "../../../../../lib/local-auth";

type Context = { params: Promise<{ id: string }> };

const requestSchema = z
  .object({
    task: z.enum(["paper-analysis", "reading-summary"]),
    regenerate: z.boolean().optional().default(false),
  })
  .strict();

export async function POST(request: Request, context: Context) {
  try {
    if (!isSameOriginRequest(request)) return jsonError("请求来源无效", 403);

    const id = parsePositiveId((await context.params).id);
    if (!id) return jsonError("文献编号无效");

    const payload = await request.json().catch(() => null);
    const parsedRequest = requestSchema.safeParse(payload);
    if (!parsedRequest.success) return jsonError("AI 任务参数无效");

    const userId = await getUserId();
    const db = getDb();
    const [literature] = await db
      .select()
      .from(literatures)
      .where(and(eq(literatures.id, id), eq(literatures.userId, userId)))
      .limit(1);
    if (!literature) return jsonError("文献不存在或已被删除", 404);

    const kind: AiOutputKind =
      parsedRequest.data.task === "paper-analysis" ? "PAPER_ANALYSIS" : "READING_SUMMARY";

    let source: string;
    if (kind === "PAPER_ANALYSIS") {
      if (!literature.abstract.trim()) {
        return jsonError("请先填写文献摘要，再生成 AI 文献分析");
      }
      source = buildPaperAnalysisSource(literature);
    } else {
      const noteRows = await db
        .select({ id: notes.id, content: notes.content, pageRef: notes.pageRef })
        .from(notes)
        .where(and(eq(notes.literatureId, id), eq(notes.userId, userId)))
        .orderBy(asc(notes.id));
      if (!noteRows.length) {
        return jsonError("请先添加阅读笔记，再生成 AI 阅读总结");
      }
      source = buildReadingSummarySource(noteRows);
    }

    const inputHash = await createAiInputHash(kind, source);
    const [existing] = await db
      .select()
      .from(literatureAiOutputs)
      .where(
        and(
          eq(literatureAiOutputs.literatureId, id),
          eq(literatureAiOutputs.userId, userId),
          eq(literatureAiOutputs.kind, kind),
        ),
      )
      .limit(1);

    if (existing && !parsedRequest.data.regenerate && existing.inputHash === inputHash) {
      return Response.json({ output: serializeOutput(existing, false), cached: true });
    }

    if (existing && parsedRequest.data.regenerate) {
      const elapsedMs = Date.now() - parseSqliteTimestamp(existing.updatedAt);
      if (elapsedMs >= 0 && elapsedMs < 15_000) {
        const retryAfter = Math.ceil((15_000 - elapsedMs) / 1_000);
        return Response.json(
          { error: `请等待 ${retryAfter} 秒后再重新生成`, retryAfter },
          { status: 429, headers: { "Retry-After": String(retryAfter) } },
        );
      }
    }

    const generated = await generateAiOutput(kind, source);
    const [stored] = await db
      .insert(literatureAiOutputs)
      .values({
        literatureId: id,
        userId,
        kind,
        content: generated.content,
        keywordsJson: JSON.stringify(generated.keywords),
        keyPointsJson: JSON.stringify(generated.keyPoints),
        inputHash,
        model: AI_MODEL,
      })
      .onConflictDoUpdate({
        target: [literatureAiOutputs.literatureId, literatureAiOutputs.kind],
        set: {
          userId,
          content: generated.content,
          keywordsJson: JSON.stringify(generated.keywords),
          keyPointsJson: JSON.stringify(generated.keyPoints),
          inputHash,
          model: AI_MODEL,
          updatedAt: sql`CURRENT_TIMESTAMP`,
        },
      })
      .returning();

    return Response.json({ output: serializeOutput(stored, false), cached: false });
  } catch (error) {
    if (error instanceof AiGenerationError) return jsonError(error.message, error.status);
    return apiErrorResponse(error);
  }
}

function serializeOutput(
  row: typeof literatureAiOutputs.$inferSelect,
  stale: boolean,
) {
  return {
    content: row.content,
    keywords: parseStoredStringArray(row.keywordsJson),
    keyPoints: parseStoredStringArray(row.keyPointsJson),
    model: row.model,
    updatedAt: row.updatedAt,
    stale,
  };
}

function parseSqliteTimestamp(value: string): number {
  const normalized = value.includes("T") ? value : `${value.replace(" ", "T")}Z`;
  const timestamp = Date.parse(normalized);
  return Number.isFinite(timestamp) ? timestamp : 0;
}
