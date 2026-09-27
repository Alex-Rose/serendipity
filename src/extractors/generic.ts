import type { Extractor } from "./types.js";

function jsonLdActorName(value: unknown): string | undefined {
  if (Array.isArray(value)) return jsonLdActorName(value[0]);
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "name" in value) {
    return String((value as { name: unknown }).name);
  }
  return undefined;
}

export const genericExtractor: Extractor = {
  types: "*",
  extract({ meta, jsonLdNode }) {
    const details: Record<string, string> = {};

    const author = jsonLdActorName(jsonLdNode?.author) ?? meta.author ?? undefined;
    const published = (jsonLdNode?.datePublished as string | undefined) ?? meta.publishedTime ?? undefined;
    const modified = (jsonLdNode?.dateModified as string | undefined) ?? meta.modifiedTime ?? undefined;

    if (author) details.Author = author;
    if (published) details.Published = published.slice(0, 10);
    if (modified && modified.slice(0, 10) !== published?.slice(0, 10)) {
      details.Updated = modified.slice(0, 10);
    }

    return details;
  },
};
