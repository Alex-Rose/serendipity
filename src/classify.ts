export interface Classification {
  type: string;
  emoji: string;
  node: Record<string, unknown> | null;
}

// Checked in order; the first schema.org type found in the page's JSON-LD wins.
// Specific content types are listed before generic containers like WebPage.
const TYPE_PRIORITY: Array<{ type: string; emoji: string }> = [
  { type: "Recipe", emoji: "🍳" },
  { type: "Movie", emoji: "🎬" },
  { type: "TVSeries", emoji: "📺" },
  { type: "TVEpisode", emoji: "📺" },
  { type: "VideoObject", emoji: "🎥" },
  { type: "MusicRecording", emoji: "🎵" },
  { type: "Book", emoji: "📖" },
  { type: "Product", emoji: "🛒" },
  { type: "Event", emoji: "📅" },
  { type: "NewsArticle", emoji: "📰" },
  { type: "BlogPosting", emoji: "📝" },
  { type: "Article", emoji: "📄" },
  { type: "Person", emoji: "👤" },
  { type: "Organization", emoji: "🏢" },
  { type: "WebPage", emoji: "🌐" },
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
  for (const { type, emoji } of TYPE_PRIORITY) {
    const node = flat.find((n) => typesOf(n).includes(type));
    if (node) return { type, emoji, node };
  }
  return { type: "WebPage", emoji: "🌐", node: null };
}
