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

/**
 * The standard output for every URL. All fields are always present; any of
 * them may be an empty string when the page doesn't provide it.
 */
export interface LinkRecord {
  url: string;
  title: string;
  /** The page's short summary (meta description / og:description). */
  description: string;
  category: string;
  /** ISO 8601 timestamp of when the record was created. */
  dateAdded: string;
  /** File name of the full-size screenshot saved in the screenshot dir. */
  screenshotName: string;
  /** Small thumbnail of the screenshot as a base64 data URI. */
  screenshot: string;
  /** Category-specific fields; empty object when there are none. */
  metadata: Record<string, string>;
}
