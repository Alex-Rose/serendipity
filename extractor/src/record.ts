import type { Classification } from "./classify.js";
import type { LinkRecord, RawMetadata } from "./types.js";

export interface BuildRecordOptions {
  meta: RawMetadata;
  classification: Classification;
  details: Record<string, string>;
  screenshot: string;
  screenshotName: string;
  dateAdded?: Date;
}

export function buildRecord({
  meta,
  classification,
  details,
  screenshot,
  screenshotName,
  dateAdded = new Date(),
}: BuildRecordOptions): LinkRecord {
  return {
    url: meta.finalUrl,
    title: (meta.ogTitle ?? meta.title ?? "").trim(),
    description: (meta.ogDescription ?? meta.description ?? "").trim(),
    category: classification.category,
    dateAdded: dateAdded.toISOString(),
    screenshotName,
    screenshot,
    metadata: details,
  };
}
