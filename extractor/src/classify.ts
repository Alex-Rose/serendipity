export interface Classification {
  /** Schema.org type the classification was based on. */
  type: string;
  /** Stable lowercase slug used as the output's `category`. */
  category: string;
  emoji: string;
  node: Record<string, unknown> | null;
}

// Checked in order; the first schema.org type found in the page's JSON-LD wins.
// Specific content types are listed before generic containers like WebPage.
const TYPE_PRIORITY: Array<{ type: string; category: string; emoji: string }> = [
  { type: "Recipe", category: "recipe", emoji: "🍳" },
  { type: "Movie", category: "movie", emoji: "🎬" },
  { type: "TVSeries", category: "tv-series", emoji: "📺" },
  { type: "TVEpisode", category: "tv-episode", emoji: "📺" },
  { type: "VideoObject", category: "video", emoji: "🎥" },
  { type: "MusicRecording", category: "music", emoji: "🎵" },
  { type: "Book", category: "book", emoji: "📖" },
  { type: "Product", category: "product", emoji: "🛒" },
  { type: "Event", category: "event", emoji: "📅" },
  { type: "NewsArticle", category: "news-article", emoji: "📰" },
  { type: "BlogPosting", category: "blog-post", emoji: "📝" },
  { type: "Article", category: "article", emoji: "📄" },
  { type: "Person", category: "person", emoji: "👤" },
  { type: "Organization", category: "organization", emoji: "🏢" },
  { type: "WebPage", category: "webpage", emoji: "🌐" },
];

function typesOf(node: Record<string, unknown>): string[] {
  const t = node["@type"];
  if (typeof t === "string") return [t];
  if (Array.isArray(t)) return t.filter((x): x is string => typeof x === "string");
  return [];
}

function flatten(nodes: unknown[]): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  for (const node of nodes) {
    if (!node || typeof node !== "object") continue;
    if (Array.isArray(node)) {
      out.push(...flatten(node));
      continue;
    }
    const record = node as Record<string, unknown>;
    out.push(record);
    if (Array.isArray(record["@graph"])) {
      out.push(...flatten(record["@graph"] as unknown[]));
    }
  }
  return out;
}

export function classify(jsonLd: unknown[]): Classification {
  const flat = flatten(jsonLd);
  for (const { type, category, emoji } of TYPE_PRIORITY) {
    const node = flat.find((n) => typesOf(n).includes(type));
    if (node) return { type, category, emoji, node };
  }
  return { type: "WebPage", category: "webpage", emoji: "🌐", node: null };
}
