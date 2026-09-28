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

export interface CapturePageOptions extends OpenPageOptions {
  /**
   * Called with the final URL once the page has loaded (after any redirects),
   * before anything is extracted. Returning false stops there, and
   * capturePage returns null. Lets callers skip pages they already have.
   */
  shouldExtract?: (finalUrl: string) => boolean | Promise<boolean>;
}

/**
 * Loads a URL in a headless browser and collects everything a link record
 * needs, or returns null when opts.shouldExtract turned the page down.
 */
export async function capturePage(url: string, opts: CapturePageOptions): Promise<CapturedPage | null> {
  const { browser, page } = await openResolvedPage(url, opts);
  try {
    if (opts.shouldExtract && !(await opts.shouldExtract(page.url()))) return null;
    const meta = await extractMetadata(page, url);
    const classification = classify(meta.jsonLd);
    const details = await runExtractors(classification.type, { page, meta, jsonLdNode: classification.node });
    const screenshotPng = await page.screenshot({ type: "png" });
    return { meta, classification, details, screenshotPng };
  } finally {
    await browser.close();
  }
}
