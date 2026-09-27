export interface RawMetadata {
  url: string;
  finalUrl: string;
  title: string | null;
  ogTitle: string | null;
  description: string | null;
  ogDescription: string | null;
  ogImage: string | null;
  siteName: string | null;
  canonicalUrl: string | null;
  favicon: string | null;
  lang: string | null;
  author: string | null;
  publishedTime: string | null;
  modifiedTime: string | null;
  themeColor: string | null;
  oembedUrl: string | null;
  feedUrl: string | null;
  jsonLd: unknown[];
  wordCount: number;
}

export interface Classification {
  type: string;
  emoji: string;
  details: Record<string, string>;
}

export interface PageResult {
  meta: RawMetadata;
  classification: Classification;
  screenshotPng: Buffer;
}

export type ScreenshotMode = "file" | "inline" | "both" | "none";
