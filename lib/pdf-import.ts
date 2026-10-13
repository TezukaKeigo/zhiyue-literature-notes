export type ParsedPdfData = {
  title: string;
  authors: string;
  year: string;
  doi: string;
  abstract: string;
  pageCount: number;
  hasExtractableText: boolean;
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

    const pages: string[] = [];
    const pageLimit = Math.min(document.numPages, MAX_PAGES_TO_READ);
    let characterCount = 0;
    for (let pageNumber = 1; pageNumber <= pageLimit && characterCount < MAX_EXTRACTED_CHARACTERS; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const textContent = await page.getTextContent();
      const text = textItemsToLines(textContent.items).slice(0, MAX_EXTRACTED_CHARACTERS - characterCount);
      pages.push(text);
      characterCount += text.length;
      page.cleanup();
    }

    const firstPage = pages[0] ?? "";
    const extractedText = pages.join("\n\n");
    const title = metadataTitle || titleFromFirstPage(firstPage) || titleFromFilename(file.name);
    return {
      title,
      authors: metadataAuthor || authorsFromFirstPage(firstPage, title),
      year: metadataYear || yearFromText(firstPage),
      doi: doiFromText(extractedText),
      abstract: abstractFromText(extractedText),
      pageCount: document.numPages,
      hasExtractableText: extractedText.replace(/\s/g, "").length >= 40,
    };
  } finally {
    await document.destroy();
  }
}

function textItemsToLines(items: Array<unknown>): string {
  const lines: string[] = [];
  let currentLine = "";

  for (const item of items) {
    if (!item || typeof item !== "object" || !("str" in item)) continue;
    const value = typeof item.str === "string" ? item.str.trim() : "";
    if (value) currentLine = currentLine ? `${currentLine} ${value}` : value;
    if ("hasEOL" in item && item.hasEOL) {
      if (currentLine) lines.push(normalizeWhitespace(currentLine));
      currentLine = "";
    }
  }
  if (currentLine) lines.push(normalizeWhitespace(currentLine));
  return lines.filter(Boolean).join("\n");
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

function titleFromFirstPage(text: string): string {
  const candidates = text
    .split("\n")
    .slice(0, 18)
    .map(normalizeWhitespace)
    .filter((line) => line.length >= 8 && line.length <= 240)
    .filter((line) => !/^(abstract|摘要|keywords?|关键词|doi\b|https?:|www\.)/i.test(line))
    .filter((line) => !/^\d+$/.test(line));
  return candidates.sort((left, right) => right.length - left.length)[0]?.slice(0, 300) ?? "";
}

function authorsFromFirstPage(text: string, title: string): string {
  if (!title) return "";
  const lines = text.split("\n").map(normalizeWhitespace).filter(Boolean);
  const normalizedTitle = normalizeForMatch(title);
  const titleIndex = lines.findIndex((line) => {
    const normalizedLine = normalizeForMatch(line);
    return normalizedLine === normalizedTitle || normalizedLine.includes(normalizedTitle.slice(0, 40));
  });
  if (titleIndex < 0) return "";

  for (const line of lines.slice(titleIndex + 1, titleIndex + 4)) {
    if (line.length < 2 || line.length > 220) continue;
    if (/abstract|摘要|keywords?|关键词|doi\b|university|institute|学院|大学|研究所|@/i.test(line)) continue;
    if (/^(19|20)\d{2}$/.test(line)) continue;
    return line.slice(0, 300);
  }
  return "";
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

function abstractFromText(text: string): string {
  const normalized = text.replace(/\r/g, "");
  const match = normalized.match(
    /(?:^|\n)\s*(?:abstract|摘要)\s*[:：]?\s*([\s\S]{40,5000}?)(?=\n\s*(?:keywords?|关键词|index terms?|1\.?\s*(?:introduction|引言)|introduction|引言)\b|$)/i,
  );
  return match ? normalizeWhitespace(match[1]).slice(0, 5000) : "";
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeForMatch(value: string): string {
  return value.toLocaleLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
}
