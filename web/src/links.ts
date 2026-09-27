/** One saved link, as written by the extractor (see extractor/src/types.ts). */
export interface LinkRecord {
  url: string;
  title: string;
  description: string;
  category: string;
  dateAdded: string;
  screenshotName: string;
  screenshot: string;
  metadata: Record<string, string>;
}

const str = (value: unknown): string => (typeof value === "string" ? value : "");

function isWebUrl(value: string): boolean {
  try {
    const { protocol } = new URL(value);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Validates a links.json payload. The content comes from arbitrary web pages,
 * so anything unexpected is dropped rather than trusted: links must be http(s),
 * thumbnails must be image data URIs, screenshot names must be plain file names.
 */
export function parseLinks(data: unknown): LinkRecord[] {
  const file = data as { version?: unknown; links?: unknown } | null;
  if (!file || file.version !== 1 || !Array.isArray(file.links)) {
    throw new Error("Unsupported links.json format");
  }

  return file.links.flatMap((raw: unknown): LinkRecord[] => {
    if (!raw || typeof raw !== "object") return [];
    const r = raw as Record<string, unknown>;
    const url = str(r.url);
    if (!isWebUrl(url)) return [];

    const screenshot = str(r.screenshot);
    const screenshotName = str(r.screenshotName);
    return [
      {
        url,
        title: str(r.title),
        description: str(r.description),
        category: str(r.category),
        dateAdded: str(r.dateAdded),
        screenshotName: /^[\w.-]+$/.test(screenshotName) ? screenshotName : "",
        screenshot: screenshot.startsWith("data:image/") ? screenshot : "",
        metadata: {},
      },
    ];
  });
}

/**
 * Picks `count` random links, preferring ones not in `exclude` (the ones
 * currently shown) so "show me others" actually shows others when it can.
 */
export function pickRandom(links: LinkRecord[], count: number, exclude: ReadonlySet<string> = new Set()): LinkRecord[] {
  const shuffle = (items: LinkRecord[]) => {
    const out = [...items];
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  };
  const fresh = shuffle(links.filter((link) => !exclude.has(link.url)));
  const seen = shuffle(links.filter((link) => exclude.has(link.url)));
  return [...fresh, ...seen].slice(0, count);
}
