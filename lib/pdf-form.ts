import type { ParsedPdfData } from "./pdf-import";

type PdfFields = Pick<ParsedPdfData, "title" | "authors" | "year" | "journal" | "doi" | "url" | "abstract">;

export function mergePdfFields<T extends PdfFields>(current: T, next: ParsedPdfData, previous: ParsedPdfData | null): T {
  const updated = { ...current };
  for (const field of ["title", "authors", "year", "journal", "doi", "url", "abstract"] as const) {
    if (!current[field] || (previous && current[field] === previous[field])) updated[field] = next[field];
  }
  return updated;
}
