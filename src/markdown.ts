import type { Classification } from "./classify.js";
import type { RawMetadata } from "./types.js";

export interface RenderOptions {
  meta: RawMetadata;
  classification: Classification;
  details: Record<string, string>;
  screenshotRefs: string[];
}

export function renderMarkdown({ meta, classification, details, screenshotRefs }: RenderOptions): string {
  const title = meta.ogTitle ?? meta.title ?? meta.finalUrl;
  const description = meta.ogDescription ?? meta.description;
  const lines: string[] = [];

  lines.push(`### [${title}](${meta.finalUrl})`);
  lines.push("");

  if (description) {
    lines.push(`> ${description}`);
    lines.push("");
  }

  const summaryBits = [`**Type:** ${classification.emoji} ${classification.type}`];
  if (meta.siteName) summaryBits.push(`**Site:** ${meta.siteName}`);
  lines.push(summaryBits.join(" · "));

  const detailEntries = Object.entries(details);
  if (detailEntries.length > 0) {
    lines.push(detailEntries.map(([k, v]) => `**${k}:** ${v}`).join(" · "));
  }
  lines.push("");

  for (const ref of screenshotRefs) {
    lines.push(`![screenshot](${ref})`);
    lines.push("");
  }

  return lines.join("\n").trimEnd() + "\n";
}
