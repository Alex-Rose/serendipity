import type { Page } from "playwright";
import type { RawMetadata } from "../types.js";

export interface ExtractorContext {
  page: Page;
  meta: RawMetadata;
  jsonLdNode: Record<string, unknown> | null;
}

export interface Extractor {
  /** Schema.org types this extractor applies to, or "*" to run for every page. */
  types: string[] | "*";
  extract(ctx: ExtractorContext): Promise<Record<string, string>> | Record<string, string>;
}
