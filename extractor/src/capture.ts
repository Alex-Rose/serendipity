import type { Classification } from "./classify.js";
import { classify } from "./classify.js";
import { type OpenPageOptions, openResolvedPage } from "./browser.js";
import { extractMetadata } from "./extract.js";
import { runExtractors } from "./extractors/registry.js";
import type { RawMetadata } from "./types.js";

export interface CapturedPage {
  meta: RawMetadata;
  classification: Classification;
  /** Category-specific details for the record's `metadata`. */
  details: Record<string, string>;
  screenshotPng: Buffer;
}

/** Loads a URL in a headless browser and collects everything a link record needs. */
export async function capturePage(url: string, opts: OpenPageOptions): Promise<CapturedPage> {
  const { browser, page } = await openResolvedPage(url, opts);
  try {
    const meta = await extractMetadata(page, url);
    const classification = classify(meta.jsonLd);
    const details = await runExtractors(classification.type, { page, meta, jsonLdNode: classification.node });
    const screenshotPng = await page.screenshot({ type: "png" });
    return { meta, classification, details, screenshotPng };
  } finally {
    await browser.close();
  }
}
