import { readFile } from "node:fs/promises";

/** Returns the normalized URL if `value` is an absolute http(s) URL, else null. */
export function parseWebUrl(value: string): string | null {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return null;
  }
  if ((url.protocol !== "http:" && url.protocol !== "https:") || !url.hostname) return null;
  return url.href;
}

export interface UrlFile {
  urls: string[];
  invalid: Array<{ line: number; text: string }>;
}

/**
 * Reads one URL per line. Blank lines and `#` comments are skipped, invalid
 * lines are reported (not thrown), and duplicates are dropped.
 */
export async function readUrlFile(path: string): Promise<UrlFile> {
  const lines = (await readFile(path, "utf8")).split(/\r?\n/);
  const urls = new Set<string>();
  const invalid: UrlFile["invalid"] = [];

  lines.forEach((raw, i) => {
    const text = raw.trim();
    if (!text || text.startsWith("#")) return;
    const url = parseWebUrl(text);
    if (url) urls.add(url);
    else invalid.push({ line: i + 1, text });
  });

  return { urls: [...urls], invalid };
}
