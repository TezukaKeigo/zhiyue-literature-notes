export type ParsedPdfData = {
  title: string;
  authors: string;
  year: string;
  journal: string;
  doi: string;
  url: string;
  abstract: string;
  pageCount: number;
  hasExtractableText: boolean;
};

type PdfLine = {
  text: string;
  fontSize: number;
  y: number;
};

const MAX_PAGES_TO_READ = 6;
const MAX_EXTRACTED_CHARACTERS = 30_000;

export async function parsePdfLocally(file: File): Promise<ParsedPdfData> {
  const [{ getDocument, GlobalWorkerOptions }, workerModule] = await Promise.all([
    import("pdfjs-dist/legacy/build/pdf.mjs"),
    import("pdfjs-dist/legacy/build/pdf.worker.min.mjs?url"),
  ]);
  GlobalWorkerOptions.workerSrc = workerModule.default;

  const loadingTask = getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  const document = await loadingTask.promise;

  try {
    const metadata = await document.getMetadata().catch(() => null);
    const info = (metadata?.info ?? {}) as Record<string, unknown>;
    const metadataTitle = cleanMetadataText(info.Title);
    const metadataAuthor = cleanMetadataAuthor(info.Author);
    const metadataYear = yearFromMetadata(info.CreationDate) || yearFromMetadata(info.ModDate);

    const pages: PdfLine[][] = [];
    const pageLimit = Math.min(document.numPages, MAX_PAGES_TO_READ);
    let characterCount = 0;
    for (let pageNumber = 1; pageNumber <= pageLimit && characterCount < MAX_EXTRACTED_CHARACTERS; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const textContent = await page.getTextContent();
      const lines = textItemsToLines(textContent.items);
      const textLength = lines.reduce((total, line) => total + line.text.length, 0);
      pages.push(lines);
      characterCount += textLength;
      page.cleanup();
    }

    const firstPageLines = pages[0] ?? [];
    const firstPage = firstPageLines.map((line) => line.text).join("\n");
    const extractedText = pages.map((page) => page.map((line) => line.text).join("\n")).join("\n\n");
    const layoutTitle = titleFromFirstPage(firstPageLines);
    const title = chooseTitle(metadataTitle, layoutTitle.title) || titleFromFilename(file.name);
    const source = sourceFromText(extractedText);
    return {
      title,
      authors: cleanAuthors(metadataAuthor || authorsFromFirstPage(firstPageLines, layoutTitle.endIndex)),
      year: metadataYear || yearFromText(firstPage),
      journal: source.journal,
      doi: doiFromText(extractedText),
      url: source.url,
      abstract: abstractFromText(extractedText),
      pageCount: document.numPages,
      hasExtractableText: extractedText.replace(/\s/g, "").length >= 40,
    };
  } finally {
    await document.destroy();
  }
}

function textItemsToLines(items: Array<unknown>): PdfLine[] {
  const lines: PdfLine[] = [];
  let parts: string[] = [];
  let currentY: number | null = null;
  let fontSize = 0;

  const flush = () => {
    const text = normalizeWhitespace(parts.join(" "));
    if (text) lines.push({ text, fontSize, y: currentY ?? 0 });
    parts = [];
    currentY = null;
    fontSize = 0;
  };

  for (const item of items) {
    if (!item || typeof item !== "object" || !("str" in item)) continue;
    const value = typeof item.str === "string" ? sanitizeExtractedText(item.str) : "";
    if (!value) continue;
    const transform = "transform" in item && Array.isArray(item.transform) ? item.transform : [];
    const itemY: number = typeof transform[5] === "number" ? transform[5] : currentY ?? 0;
    const itemHeight: number = "height" in item && typeof item.height === "number"
      ? item.height
      : typeof transform[3] === "number" ? Math.abs(transform[3]) : 0;

    if (parts.length && currentY !== null && Math.abs(itemY - currentY) > 3) flush();
    if (currentY === null) currentY = itemY;
    parts.push(value);
    fontSize = Math.max(fontSize, itemHeight);
    if ("hasEOL" in item && item.hasEOL) flush();
  }
  flush();
  return lines;
}

function cleanMetadataText(value: unknown): string {
  if (typeof value !== "string") return "";
  const cleaned = normalizeWhitespace(value.replace(/\u0000/g, "")).trim();
  if (!cleaned || /^(untitled|document|unknown)$/i.test(cleaned) || /^microsoft (word|powerpoint)/i.test(cleaned)) return "";
  return cleaned.slice(0, 300);
}

function cleanMetadataAuthor(value: unknown): string {
  const cleaned = cleanMetadataText(value);
  if (/^(administrator|admin|author|user|microsoft office user)$/i.test(cleaned)) return "";
  return cleaned;
}

function titleFromFilename(filename: string): string {
  return normalizeWhitespace(filename.replace(/\.pdf$/i, "").replace(/[_-]+/g, " ")).slice(0, 300);
}

function titleFromFirstPage(lines: PdfLine[]): { title: string; endIndex: number } {
  const candidates = lines
    .slice(0, 24)
    .map((line, index) => ({ ...line, index }))
    .filter(({ text }) => isPossibleTitle(text));
  if (!candidates.length) return { title: "", endIndex: -1 };

  const largestFont = Math.max(...candidates.map((line) => line.fontSize));
  const chosen = candidates
    .filter((line) => line.fontSize >= largestFont * 0.96)
    .sort((left, right) => left.index - right.index)[0];

  const titleLines = [chosen.text];
  let endIndex = chosen.index;
  for (let index = chosen.index + 1; index < Math.min(lines.length, chosen.index + 3); index += 1) {
    const line = lines[index];
    if (line.fontSize < chosen.fontSize * 0.9 || !isPossibleTitle(line.text) || looksLikeAuthorLine(line.text)) break;
    titleLines.push(line.text);
    endIndex = index;
  }
  return { title: normalizeWhitespace(titleLines.join(" ")).slice(0, 300), endIndex };
}

function authorsFromFirstPage(lines: PdfLine[], titleEndIndex: number): string {
  if (titleEndIndex < 0) return "";
  const authorLines: string[] = [];
  for (const line of lines.slice(titleEndIndex + 1, titleEndIndex + 6)) {
    const text = cleanAuthors(line.text);
    if (!text) continue;
    if (isAffiliationOrSection(text)) break;
    if (line.fontSize < 7 || text.length > 300) continue;
    authorLines.push(text);
    if (authorLines.length === 3) break;
  }
  return cleanAuthors(authorLines.join(", ")).slice(0, 300);
}

function chooseTitle(metadataTitle: string, layoutTitle: string): string {
  if (!metadataTitle) return layoutTitle;
  if (!layoutTitle) return metadataTitle;
  const metadataKey = normalizeForMatch(metadataTitle);
  const layoutKey = normalizeForMatch(layoutTitle);
  if (metadataKey.includes(layoutKey) || layoutKey.includes(metadataKey)) {
    return layoutTitle.length >= metadataTitle.length ? layoutTitle : metadataTitle;
  }
  return metadataTitle;
}

function isPossibleTitle(text: string): boolean {
  return text.length >= 6
    && text.length <= 300
    && !/^(abstract|摘要|keywords?|关键词|doi\b|https?:|www\.|arxiv\b)/i.test(text)
    && !/^\d+$/.test(text)
    && !isAffiliationOrSection(text);
}

function looksLikeAuthorLine(text: string): boolean {
  const commas = (text.match(/[,，]/g) ?? []).length;
  return commas >= 2 || /\b(?:and|与)\b/i.test(text) && text.split(/\s+/).length <= 18;
}

function isAffiliationOrSection(text: string): boolean {
  return /abstract|摘要|keywords?|关键词|doi\b|university|institute|laborator(?:y|ies)|\blab\b|department|school of|college|学院|大学|研究所|实验室|@|^\d+\s+(?:introduction|引言)/i.test(text);
}

function cleanAuthors(value: string): string {
  return normalizeWhitespace(value
    .replace(/[♠♣♥♦◆◇■□●○★☆�\uE000-\uF8FF∗*†‡§¶¹²³⁴⁵⁶⁷⁸⁹⁰]/g, " ")
    .replace(/\s*[,，]\s*/g, ", ")
    .replace(/(?:,\s*){2,}/g, ", ")
    .replace(/^,\s*|,\s*$/g, ""));
}

function sanitizeExtractedText(value: string): string {
  return normalizeWhitespace(value.replace(/[♠♣♥♦◆◇■□●○★☆�\uE000-\uF8FF∗*†‡§¶¹²³⁴⁵⁶⁷⁸⁹⁰]/g, " "));
}

function yearFromMetadata(value: unknown): string {
  if (typeof value !== "string") return "";
  return yearFromText(value);
}

function yearFromText(text: string): string {
  const matches = text.match(/\b(?:18|19|20)\d{2}\b/g) ?? [];
  const maximum = new Date().getFullYear() + 1;
  const match = matches.find((value) => Number(value) >= 1800 && Number(value) <= maximum);
  return match ?? "";
}

function doiFromText(text: string): string {
  const match = text.match(/\b10\.\d{4,9}\/[-._;()/:A-Z0-9]+/i)?.[0] ?? "";
  return match.replace(/[.,;:)\]}]+$/g, "").slice(0, 120);
}

function sourceFromText(text: string): { journal: string; url: string } {
  const arxiv = text.match(/\barXiv\s*:\s*(\d{4}\.\d{4,5})(?:v\d+)?\b/i)?.[1];
  const conference = text.match(/\b(ICLR|NeurIPS|ICML|ACL|EMNLP|NAACL|CVPR|ICCV|ECCV|AAAI|IJCAI|KDD|WWW)\s*(20\d{2})\b/i);
  if (conference) {
    const name = conference[1].toUpperCase() === "NEURIPS" ? "NeurIPS" : conference[1].toUpperCase();
    return { journal: `${name} ${conference[2]}`, url: arxiv ? `https://arxiv.org/abs/${arxiv}` : "" };
  }
  if (arxiv) return { journal: `arXiv preprint arXiv:${arxiv}`, url: `https://arxiv.org/abs/${arxiv}` };
  return { journal: "", url: "" };
}

function abstractFromText(text: string): string {
  const normalized = text.replace(/\r/g, "");
  const match = normalized.match(
    /(?:^|\n)\s*(?:abstract|摘要)\s*[:：]?\s*([\s\S]{40,5000}?)(?=\n\s*(?:(?:keywords?|index terms?|1\.?\s*introduction|introduction)\b|(?:关键词|引言)\s*[:：]?)|$)/i,
  );
  return match ? normalizeWhitespace(match[1]).slice(0, 5000) : "";
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeForMatch(value: string): string {
  return value.toLocaleLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
}
