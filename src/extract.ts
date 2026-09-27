import type { Page } from "playwright";
import type { RawMetadata } from "./types.js";

/** Runs in the page context via page.evaluate — no Node APIs here. */
function collectPageMetadata(): Omit<RawMetadata, "url" | "finalUrl"> {
  const meta = (name: string) =>
    document.querySelector(`meta[name="${name}"]`)?.getAttribute("content") ?? null;
  const prop = (property: string) =>
    document.querySelector(`meta[property="${property}"]`)?.getAttribute("content") ?? null;
  const link = (rel: string) => document.querySelector(`link[rel="${rel}"]`)?.getAttribute("href") ?? null;

  const jsonLd: unknown[] = [];
  for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      jsonLd.push(JSON.parse(script.textContent ?? ""));
    } catch {
      // malformed JSON-LD block, skip it
    }
  }

  const oembedUrl =
    document.querySelector('link[type="application/json+oembed"]')?.getAttribute("href") ?? null;
  const feedUrl =
    document.querySelector('link[type="application/rss+xml"], link[type="application/atom+xml"]')
      ?.getAttribute("href") ?? null;

  return {
    title: document.title || null,
    ogTitle: prop("og:title"),
    description: meta("description"),
    ogDescription: prop("og:description"),
    ogImage: prop("og:image"),
    siteName: prop("og:site_name"),
    canonicalUrl: link("canonical"),
    favicon: link("icon") ?? link("shortcut icon"),
    lang: document.documentElement.lang || null,
    author: meta("author") ?? prop("article:author"),
    publishedTime: prop("article:published_time"),
    modifiedTime: prop("article:modified_time"),
    themeColor: meta("theme-color"),
    oembedUrl,
    feedUrl,
    jsonLd,
    wordCount: (document.body?.innerText ?? "").trim().split(/\s+/).filter(Boolean).length,
  };
}

export async function extractMetadata(page: Page, requestedUrl: string): Promise<RawMetadata> {
  const rest = await page.evaluate(collectPageMetadata);
  return { url: requestedUrl, finalUrl: page.url(), ...rest };
}
