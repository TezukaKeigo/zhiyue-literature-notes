import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import * as register from "../app/api/auth/register/route";
import * as login from "../app/api/auth/login/route";
import * as logout from "../app/api/auth/logout/route";
import * as profile from "../app/api/auth/profile/route";
import * as literatureList from "../app/api/literatures/route";
import * as literatureDetail from "../app/api/literatures/[id]/route";
import * as tagList from "../app/api/tags/route";
import * as tagDetail from "../app/api/tags/[id]/route";
import * as noteList from "../app/api/notes/route";
import * as noteDetail from "../app/api/notes/[id]/route";
import * as aiRoute from "../app/api/literatures/[id]/ai/route";
import { requests } from "./support/request-context";
import { env } from "./support/runtime";
import { clearTestDatabase, openTestDatabase } from "./support/database";
import type { literatures, tags, notes } from "../db/schema";

type AiOutput = { content: string; keywords: string[]; keyPoints: string[]; stale: boolean };
type Tag = typeof tags.$inferSelect & { literatureCount: number };
type Note = typeof notes.$inferSelect;
type Paper = typeof literatures.$inferSelect & { noteCount: number; tags: Tag[]; notes: Note[]; aiOutputs: { paperAnalysis: AiOutput; readingSummary: AiOutput } };
type ApiBody = { literature: Paper; literatures: Paper[]; tag: Tag; tags: Tag[]; note: Note; output: AiOutput; cached: boolean; error: string };

type Route = (request: Request, context: { params: Promise<{ id: string }> }) => Promise<Response>;
const basePaper = { title: "Context engineering", authors: "Alice Chen", year: 2025, abstract: "本研究探索文献与阅读笔记的组织方式，提出通过主题标签提高检索效率，并使用用户实验评估其效果。", readingStatus: "TO_READ", rating: 0, tagIds: [] };
const generated = { content: "该研究讨论文献与阅读笔记的组织方法，通过主题标签提升检索效率，并通过用户实验进行评估。", keywords: ["文献管理", "阅读笔记", "主题标签"], keyPoints: ["使用主题标签组织文献", "通过用户实验评估效果"] };
let database: Awaited<ReturnType<typeof openTestDatabase>>;
let alice: string;
let bob: string;

async function call(route: Route, { method = "GET", cookie = alice, body, id = "1", path = "/api/test", headers = {} }: {
  method?: string; cookie?: string; body?: unknown; id?: string; path?: string; headers?: Record<string, string>;
} = {}) {
  const request = new Request(`http://localhost${path}`, {
    method,
    headers: { Origin: "http://localhost", ...(cookie ? { Cookie: cookie } : {}), ...(body !== undefined ? { "Content-Type": "application/json" } : {}), ...headers },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const response = await requests.run(request, () => route(request, { params: Promise.resolve({ id }) }));
  return { response, status: response.status, body: await response.json() as ApiBody };
}

async function account(email: string) {
  const result = await call(register.POST, { method: "POST", cookie: "", body: { email, displayName: "测试空间", password: "TestPassword123!" } });
  expect(result.status).toBe(201);
  return result.response.headers.get("set-cookie")!.split(";")[0];
}

async function paper(overrides = {}, cookie = alice) {
  const result = await call(literatureList.POST, { method: "POST", cookie, body: { ...basePaper, ...overrides } });
  expect(result.status).toBe(201);
  return result.body.literature;
}

async function tag(name = "机器学习", cookie = alice) {
  const result = await call(tagList.POST, { method: "POST", cookie, body: { name, color: "#123456" } });
  expect(result.status).toBe(201);
  return result.body.tag;
}

async function note(literatureId: number, content = "方法使用主题标签归类；我希望进一步了解用户实验的样本规模。") {
  const result = await call(noteList.POST, { method: "POST", body: { literatureId, content, pageRef: "第 2 页" } });
  expect(result.status).toBe(201);
  return result.body.note;
}

function fakeAi(response: unknown = { response: JSON.stringify(generated) }) {
  const run = vi.fn().mockResolvedValue(response);
  env.AI = { run } as unknown as Ai;
  return run;
}

async function analyze(id: number, task = "paper-analysis", regenerate = false, cookie = alice) {
  return call(aiRoute.POST, { method: "POST", cookie, id: String(id), body: { task, regenerate } });
}

beforeAll(async () => { database = await openTestDatabase(); });
afterAll(async () => { await database?.close(); });
beforeEach(async () => {
  vi.restoreAllMocks();
  await clearTestDatabase();
  alice = await account("alice@example.test");
  bob = await account("bob@example.test");
});

describe("账号与隔离（真实密码哈希、会话、D1）", () => {
  it("注册成功并返回安全 Cookie，同邮箱不能重复注册", async () => {
    const result = await call(register.POST, { method: "POST", cookie: "", body: { email: "new@example.test", displayName: "新空间", password: "TestPassword123!" } });
    expect(result.status).toBe(201);
    expect(result.response.headers.get("set-cookie")).toMatch(/HttpOnly; Secure; SameSite=Lax/);
    expect((await call(register.POST, { method: "POST", cookie: "", body: { email: "NEW@example.test", displayName: "重复", password: "TestPassword123!" } })).status).toBe(409);
    const stored = await database.db.prepare("SELECT password_hash FROM user_accounts WHERE email = ?").bind("new@example.test").first<{ password_hash: string }>();
    expect(stored?.password_hash).not.toBe("TestPassword123!");
  });

  it("错误密码拒绝、正确密码登录、退出后原会话失效", async () => {
    expect((await call(login.POST, { method: "POST", cookie: "", body: { email: "alice@example.test", password: "wrong-password" } })).status).toBe(401);
    const result = await call(login.POST, { method: "POST", cookie: "", body: { email: "alice@example.test", password: "TestPassword123!" } });
    expect(result.status).toBe(200);
    const cookie = result.response.headers.get("set-cookie")!.split(";")[0];
    expect((await call(literatureList.GET, { cookie })).status).toBe(200);
    expect((await call(logout.POST, { method: "POST", cookie })).status).toBe(200);
    expect((await call(literatureList.GET, { cookie })).status).toBe(401);
  });

  it("连续错误登录触发锁定", async () => {
    for (let attempt = 0; attempt < 5; attempt++) {
      expect((await call(login.POST, { method: "POST", cookie: "", body: { email: "alice@example.test", password: "wrong-password" } })).status).toBe(401);
    }
    expect((await call(login.POST, { method: "POST", cookie: "", body: { email: "alice@example.test", password: "TestPassword123!" } })).status).toBe(429);
  });

  it("匿名、伪造身份头、过期会话均无法读取数据", async () => {
    expect((await call(literatureList.GET, { cookie: "" })).status).toBe(401);
    expect((await call(literatureList.GET, { cookie: "", headers: { "oai-authenticated-user-id": "account:1", "oai-authenticated-user-email": "alice@example.test" } })).status).toBe(401);
    await database.db.prepare("UPDATE auth_sessions SET expires_at = 0").run();
    expect((await call(literatureList.GET)).status).toBe(401);
  });

  it("跨来源认证请求被拒绝", async () => {
    expect((await call(register.POST, { method: "POST", cookie: "", body: {}, headers: { Origin: "https://other.example" } })).status).toBe(403);
  });

  it("空间名称修改后再次读取仍然保留", async () => {
    const updated = await call(profile.PATCH, { method: "PATCH", body: { spaceName: "新的研究空间" } });
    expect(updated.status).toBe(200);
    const row = await database.db.prepare("SELECT display_name FROM user_accounts WHERE email = 'alice@example.test'").first<{ display_name: string }>();
    expect(row?.display_name).toBe("新的研究空间");
  });

  it("另一账号的列表为空，且不能读取、编辑、删除文献或添加笔记", async () => {
    const item = await paper();
    expect((await call(literatureList.GET, { cookie: bob })).body.literatures).toEqual([]);
    for (const [method, route] of [["GET", literatureDetail.GET], ["PATCH", literatureDetail.PATCH], ["DELETE", literatureDetail.DELETE]] as const) {
      expect((await call(route, { method, cookie: bob, id: String(item.id), ...(method === "PATCH" ? { body: basePaper } : {}) })).status).toBe(404);
    }
    expect((await call(noteList.POST, { method: "POST", cookie: bob, body: { literatureId: item.id, content: "越权笔记" } })).status).toBe(404);
    expect((await call(literatureDetail.GET, { id: String(item.id) })).status).toBe(200);
  });
});

describe("文献、标签、笔记的数据闭环", () => {
  it("标签改名和颜色更新同步到文献详情与检索，重复改名被拒绝", async () => {
    const topic = await tag("旧主题");
    const item = await paper({ tagIds: [topic.id] });
    expect((await call(tagDetail.PATCH, { method: "PATCH", id: String(topic.id), body: { name: "新主题", color: "#abcdef" } })).status).toBe(200);
    const detail = (await call(literatureDetail.GET, { id: String(item.id) })).body.literature;
    expect(detail.tags[0]).toMatchObject({ name: "新主题", color: "#abcdef" });
    expect((await call(literatureList.GET, { path: `/api/literatures?q=${encodeURIComponent("新主题")}` })).body.literatures).toHaveLength(1);
    await tag("另一个主题");
    expect((await call(tagDetail.PATCH, { method: "PATCH", id: String(topic.id), body: { name: "另一个主题" } })).status).toBe(409);
  });

  it("其他账号无法编辑、删除已有笔记或标签", async () => {
    const topic = await tag();
    const item = await paper({ tagIds: [topic.id] });
    const saved = await note(item.id);
    expect((await call(noteDetail.PATCH, { method: "PATCH", cookie: bob, id: String(saved.id), body: { content: "越权修改" } })).status).toBe(404);
    expect((await call(noteDetail.DELETE, { method: "DELETE", cookie: bob, id: String(saved.id) })).status).toBe(404);
    expect((await call(tagDetail.PATCH, { method: "PATCH", cookie: bob, id: String(topic.id), body: { name: "越权修改" } })).status).toBe(404);
    expect((await call(tagDetail.DELETE, { method: "DELETE", cookie: bob, id: String(topic.id) })).status).toBe(404);
    expect((await call(literatureDetail.GET, { id: String(item.id) })).body.literature.notes[0].id).toBe(saved.id);
  });

  it("文献修改后详情及列表均反映新值，笔记数随新增和删除变化", async () => {
    const item = await paper();
    expect((await call(literatureDetail.PATCH, { method: "PATCH", id: String(item.id), body: { ...basePaper, readingStatus: "FINISHED", year: 2024 } })).status).toBe(200);
    const saved = await note(item.id);
    const detail = (await call(literatureDetail.GET, { id: String(item.id) })).body.literature;
    expect(detail.readingStatus).toBe("FINISHED");
    expect(detail.year).toBe(2024);
    expect(detail.notes[0].id).toBe(saved.id);
    expect((await call(literatureList.GET)).body.literatures[0].noteCount).toBe(1);
    expect((await call(noteDetail.PATCH, { method: "PATCH", id: String(saved.id), body: { content: "修订后的观点", pageRef: "第 3 页" } })).status).toBe(200);
    expect((await call(literatureDetail.GET, { id: String(item.id) })).body.literature.notes[0].content).toBe("修订后的观点");
    expect((await call(noteDetail.DELETE, { method: "DELETE", id: String(saved.id) })).status).toBe(200);
    expect((await call(literatureList.GET)).body.literatures[0].noteCount).toBe(0);
  });

  it("标题/作者/标签关键词、状态组合筛选与年份排序正确", async () => {
    const topic = await tag();
    const one = await paper({ tagIds: [topic.id], readingStatus: "READING" });
    await paper({ title: "Another paper", authors: "Bob Lee", year: 2022 });
    for (const query of ["context", "Alice", "机器学习"]) {
      expect((await call(literatureList.GET, { path: `/api/literatures?q=${encodeURIComponent(query)}` })).body.literatures.map((row: { id: number }) => row.id)).toEqual([one.id]);
    }
    expect((await call(literatureList.GET, { path: `/api/literatures?status=READING&tagId=${topic.id}` })).body.literatures).toHaveLength(1);
    expect((await call(literatureList.GET, { path: "/api/literatures?sort=year-asc" })).body.literatures.map((row) => row.year)).toEqual([2022, 2025]);
    expect((await call(tagList.GET)).body.tags[0].literatureCount).toBe(1);
  });

  it("删除标签保留文献，删除文献级联清理笔记、AI 和标签关联", async () => {
    const keep = await tag("保留标签");
    const remove = await tag("删除标签");
    const item = await paper({ tagIds: [keep.id, remove.id] });
    await note(item.id);
    fakeAi();
    expect((await analyze(item.id)).status).toBe(200);
    expect((await call(tagDetail.DELETE, { method: "DELETE", id: String(remove.id) })).status).toBe(200);
    expect((await call(literatureDetail.GET, { id: String(item.id) })).body.literature.tags).toHaveLength(1);
    expect((await call(literatureDetail.DELETE, { method: "DELETE", id: String(item.id) })).status).toBe(200);
    for (const table of ["reading_notes", "literature_tags", "literature_ai_outputs"]) {
      expect(await database.db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first("n")).toBe(0);
    }
    expect((await call(tagList.GET)).body.tags).toHaveLength(1);
    expect((await call(literatureDetail.GET, { id: String(item.id) })).status).toBe(404);
  });

  it("重复文献和标签返回 409，不产生额外记录", async () => {
    await paper();
    expect((await call(literatureList.POST, { method: "POST", body: { ...basePaper, title: "  CONTEXT ENGINEERING  " } })).status).toBe(409);
    expect((await call(literatureList.GET)).body.literatures).toHaveLength(1);
    await tag("Topic");
    expect((await call(tagList.POST, { method: "POST", body: { name: " topic " } })).status).toBe(409);
  });

  it.each([
    { title: " " }, { authors: "" }, { year: 1799 }, { year: new Date().getFullYear() + 2 },
    { year: 2024.5 }, { rating: -1 }, { rating: 6 }, { url: "javascript:alert(1)" },
  ])("拒绝非法文献输入 %j", async (invalid) => {
    expect((await call(literatureList.POST, { method: "POST", body: { ...basePaper, ...invalid } })).status).toBe(400);
    expect((await call(literatureList.GET)).body.literatures).toEqual([]);
  });

  it("空笔记、无效标签和跨账号标签不能写入", async () => {
    const item = await paper();
    expect((await call(noteList.POST, { method: "POST", body: { literatureId: item.id, content: "  " } })).status).toBe(400);
    const foreign = await tag("私有标签", bob);
    for (const id of [999999, foreign.id]) {
      expect((await call(literatureList.POST, { method: "POST", body: { ...basePaper, title: "不能创建", tagIds: [id] } })).status).toBe(400);
    }
  });
});

describe("AI 阅读助手（仅模型绑定为测试桩）", () => {
  it("无摘要、无笔记时拒绝生成，未配置服务时返回 503", async () => {
    const empty = await paper({ abstract: "" });
    expect((await analyze(empty.id)).status).toBe(400);
    expect((await analyze(empty.id, "reading-summary")).status).toBe(400);
    const item = await paper({ title: "有摘要" });
    expect((await analyze(item.id)).status).toBe(503);
  });

  it.each([{ response: JSON.stringify(generated) }, { response: generated }])("兼容模型响应，持久化并命中缓存：%j", async (result) => {
    const item = await paper();
    const run = fakeAi(result);
    const first = await analyze(item.id);
    expect(first.status).toBe(200);
    expect(first.body.output.content).toBe(generated.content);
    expect((await call(literatureDetail.GET, { id: String(item.id) })).body.literature.aiOutputs.paperAnalysis.stale).toBe(false);
    const cached = await analyze(item.id);
    expect(cached.body.cached).toBe(true);
    expect(run).toHaveBeenCalledTimes(1);
    expect((await call(tagList.GET)).body.tags).toEqual([]);
  });

  it("摘要修改后旧分析过期，重新生成后恢复有效", async () => {
    const item = await paper();
    fakeAi();
    await analyze(item.id);
    await call(literatureDetail.PATCH, { method: "PATCH", id: String(item.id), body: { ...basePaper, abstract: "新的研究摘要：本文进一步研究文献检索中的上下文组织。" } });
    expect((await call(literatureDetail.GET, { id: String(item.id) })).body.literature.aiOutputs.paperAnalysis.stale).toBe(true);
    expect((await analyze(item.id)).status).toBe(200);
    expect((await call(literatureDetail.GET, { id: String(item.id) })).body.literature.aiOutputs.paperAnalysis.stale).toBe(false);
  });

  it("笔记总结依赖已保存笔记，笔记更新或删除后总结过期", async () => {
    const item = await paper();
    const saved = await note(item.id);
    const run = fakeAi();
    expect((await analyze(item.id, "reading-summary")).status).toBe(200);
    expect(JSON.stringify(run.mock.calls[0])).toContain("样本规模");
    await call(noteDetail.PATCH, { method: "PATCH", id: String(saved.id), body: { content: "新增观点：需要补充与其他检索方法的对比。" } });
    expect((await call(literatureDetail.GET, { id: String(item.id) })).body.literature.aiOutputs.readingSummary.stale).toBe(true);
    await call(noteDetail.DELETE, { method: "DELETE", id: String(saved.id) });
    expect((await analyze(item.id, "reading-summary")).status).toBe(400);
  });

  it.each(["upstream", "malformed", "incomplete"])("生成失败 %s 时不覆盖旧结果", async (failure) => {
    const item = await paper();
    const run = fakeAi();
    await analyze(item.id);
    // Change the source rather than waiting for the regeneration cooldown.
    await call(literatureDetail.PATCH, { method: "PATCH", id: String(item.id), body: { ...basePaper, abstract: "源内容已改变，应该尝试生成新的文献分析。" } });
    if (failure === "upstream") run.mockRejectedValueOnce(new Error("test upstream failure"));
    if (failure === "malformed") run.mockResolvedValueOnce({ response: "not json" });
    if (failure === "incomplete") run.mockResolvedValueOnce({ response: { content: "不足", keywords: [], keyPoints: [] } });
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await analyze(item.id)).status).toBe(502);
    log.mockRestore();
    const output = (await call(literatureDetail.GET, { id: String(item.id) })).body.literature.aiOutputs.paperAnalysis;
    expect(output.content).toBe(generated.content);
    expect(output.stale).toBe(true);
  });

  it("重新生成受冷却限制，跨账号及跨来源请求不能调用模型", async () => {
    const item = await paper();
    const run = fakeAi();
    await analyze(item.id);
    expect((await analyze(item.id, "paper-analysis", true)).status).toBe(429);
    expect((await analyze(item.id, "paper-analysis", false, bob)).status).toBe(404);
    expect((await call(aiRoute.POST, { method: "POST", cookie: "", id: String(item.id), body: { task: "paper-analysis" } })).status).toBe(401);
    expect((await call(aiRoute.POST, { method: "POST", id: String(item.id), body: { task: "paper-analysis" }, headers: { Origin: "https://other.example" } })).status).toBe(403);
    expect(run).toHaveBeenCalledTimes(1);
  });
});
