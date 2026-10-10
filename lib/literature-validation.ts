import { isReadingStatus } from "./api";

export type LiteraturePayload = {
  title?: unknown;
  authors?: unknown;
  year?: unknown;
  journal?: unknown;
  doi?: unknown;
  url?: unknown;
  abstract?: unknown;
  readingStatus?: unknown;
  rating?: unknown;
  tagIds?: unknown;
};

function text(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export function parseLiteraturePayload(payload: LiteraturePayload) {
  const title = text(payload.title, 300);
  const authors = text(payload.authors, 300);
  const journal = text(payload.journal, 200);
  const doi = text(payload.doi, 120);
  const url = text(payload.url, 500);
  const abstract = text(payload.abstract, 5000);
  const currentYear = new Date().getFullYear();
  const year = payload.year === "" || payload.year == null ? null : Number(payload.year);
  const rating = payload.rating == null || payload.rating === "" ? 0 : Number(payload.rating);
  const readingStatus = isReadingStatus(payload.readingStatus)
    ? payload.readingStatus
    : "TO_READ";
  const tagIds = Array.isArray(payload.tagIds)
    ? [...new Set(payload.tagIds.map(Number).filter((id) => Number.isInteger(id) && id > 0))]
    : [];

  if (!title) return { error: "文献标题不能为空" } as const;
  if (!authors) return { error: "作者不能为空" } as const;
  if (year !== null && (!Number.isInteger(year) || year < 1800 || year > currentYear + 1)) {
    return { error: `年份必须在 1800 至 ${currentYear + 1} 之间` } as const;
  }
  if (!Number.isInteger(rating) || rating < 0 || rating > 5) {
    return { error: "评分必须是 0 至 5 的整数" } as const;
  }
  if (url) {
    try {
      const parsed = new URL(url);
      if (!["http:", "https:"].includes(parsed.protocol)) throw new Error();
    } catch {
      return { error: "文献链接必须是有效的 http 或 https 地址" } as const;
    }
  }

  return {
    data: { title, authors, year, journal, doi, url, abstract, readingStatus, rating, tagIds },
  } as const;
}
