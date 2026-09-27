import type { Extractor, ExtractorContext } from "./types.js";
import { genericExtractor } from "./generic.js";

// Add type-specific extractors here (e.g. a Recipe or Movie extractor) —
// each one only needs to match on its schema.org type(s) via `types`.
const extractors: Extractor[] = [genericExtractor];

export function registerExtractor(extractor: Extractor): void {
  extractors.push(extractor);
}

export async function runExtractors(
  type: string,
  ctx: ExtractorContext,
): Promise<Record<string, string>> {
  let details: Record<string, string> = {};
  for (const extractor of extractors) {
    const applies = extractor.types === "*" || extractor.types.includes(type);
    if (applies) {
      details = { ...details, ...(await extractor.extract(ctx)) };
    }
  }
  return details;
}
