import { beforeEach, describe, expect, it, vi } from "vitest";
import { parsePdfLocally, type ParsedPdfData } from "../lib/pdf-import";
import { mergePdfFields } from "../lib/pdf-form";

const pdf = vi.hoisted(() => ({
  getDocument: vi.fn(), cleanup: vi.fn(), destroy: vi.fn(), getMetadata: vi.fn(), getPage: vi.fn(),
}));
vi.mock("pdfjs-dist/legacy/build/pdf.mjs", () => ({ getDocument: pdf.getDocument, GlobalWorkerOptions: {} }));
vi.mock("pdfjs-dist/legacy/build/pdf.worker.min.mjs?url", () => ({ default: "test-only-pdf-worker" }));

const empty: ParsedPdfData = { title: "", authors: "", year: "", journal: "", doi: "", url: "", abstract: "", pageCount: 0, hasExtractableText: false };
const first = { ...empty, title: "论文甲", authors: "作者甲", year: "2024", doi: "10.1234/old", abstract: "摘要甲" };
const second = { ...empty, title: "论文乙", authors: "作者乙", year: "2025", abstract: "摘要乙" };

function line(str: string, y: number, size = 10) {
  return { str, transform: [1, 0, 0, size, 0, y], height: size, hasEOL: true };
}

beforeEach(() => {
  vi.clearAllMocks();
  pdf.getMetadata.mockResolvedValue({ info: {} });
  pdf.getPage.mockResolvedValue({ getTextContent: async () => ({ items: [
    line("LocAgent: Graph-Guided Code Localization", 750, 20),
    line("Zhaoling Chen ♠*, Xiangru Tang ♠*, Gangda Deng ♦*", 710),
    line("Viktor Prasanna ♦, Arman Cohan ♠, Xingyao Wang ♥", 690),
    line("Nankai University", 670), line("arXiv:2503.09089v1 2025", 650),
    line("Abstract", 610, 12),
    line("We study code localization and propose graph-guided retrieval to improve the identification of relevant source files.", 590),
    line("1 Introduction", 560, 12),
  ] }), cleanup: pdf.cleanup });
  pdf.getDocument.mockReturnValue({ promise: Promise.resolve({ numPages: 18, getMetadata: pdf.getMetadata, getPage: pdf.getPage, destroy: pdf.destroy }) });
});

describe("PDF 识别回归（模拟 PDF.js 提取数据）", () => {
  it("按版面识别标题和多行作者，去掉脚注符号，不把作者当标题", async () => {
    const result = await parsePdfLocally(new File(["test"], "2025 LocAgent.pdf", { type: "application/pdf" }));
    expect(result.title).toBe("LocAgent: Graph-Guided Code Localization");
    expect(result.authors).toContain("Zhaoling Chen");
    expect(result.authors).toContain("Xingyao Wang");
    expect(result.authors).not.toMatch(/[♠♦♥*]/);
    expect(result.journal).toBe("arXiv preprint arXiv:2503.09089");
    expect(result.url).toBe("https://arxiv.org/abs/2503.09089");
    expect(result.doi).toBe("");
    expect(result.abstract).toContain("graph-guided retrieval");
    expect(pdf.getPage).toHaveBeenCalledTimes(6);
    expect(pdf.destroy).toHaveBeenCalledOnce();
  });

  it("提取已存在的 DOI，并识别无可提取文本的 PDF", async () => {
    pdf.getPage.mockResolvedValueOnce({ getTextContent: async () => ({ items: [line("A paper with a persistent identifier", 750, 20), line("DOI: 10.1234/example.2025.", 700)] }), cleanup: pdf.cleanup });
    expect((await parsePdfLocally(new File(["test"], "paper.pdf"))).doi).toBe("10.1234/example.2025");
    pdf.getPage.mockResolvedValue({ getTextContent: async () => ({ items: [] }), cleanup: pdf.cleanup });
    expect((await parsePdfLocally(new File(["test"], "scan.pdf"))).hasExtractableText).toBe(false);
  });

  it("读取异常时仍释放 PDF 文档", async () => {
    pdf.getPage.mockRejectedValueOnce(new Error("corrupt PDF"));
    await expect(parsePdfLocally(new File(["bad"], "bad.pdf"))).rejects.toThrow("corrupt PDF");
    expect(pdf.destroy).toHaveBeenCalledOnce();
  });
});

describe("PDF 重选与手工编辑保护", () => {
  it("首次选择只填空字段", () => {
    expect(mergePdfFields({ ...empty, title: "手写标题" }, first, null)).toMatchObject({ title: "手写标题", authors: "作者甲", abstract: "摘要甲" });
  });
  it("重新选择会更新自动填写字段，并清除新文件中不存在的旧 DOI", () => {
    expect(mergePdfFields(first, second, first)).toMatchObject({ title: "论文乙", authors: "作者乙", abstract: "摘要乙", doi: "" });
  });
  it("手工修改过的作者、摘要及其他表单值保持不变", () => {
    const current = { ...first, authors: "人工核对的作者", abstract: "个人摘要", rating: 5 };
    expect(mergePdfFields(current, second, first)).toMatchObject({ title: "论文乙", authors: "人工核对的作者", abstract: "个人摘要", rating: 5 });
    expect(current.title).toBe("论文甲");
  });
});
