import path from "node:path";
import type { LinkRecord } from "./types.js";

export interface RenderOptions {
  emoji: string;
  siteName: string | null;
  /** Directory the screenshot file lives in, used to build the image link. */
  screenshotDir: string;
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function renderMarkdown(record: LinkRecord, { emoji, siteName, screenshotDir }: RenderOptions): string {
  const lines: string[] = [];

  lines.push(`### [${record.title || record.url}](${record.url})`);
  lines.push("");

  if (record.description) {
    lines.push(`> ${record.description}`);
    lines.push("");
  }

  const summaryBits = [`**Type:** ${emoji} ${record.category}`];
  if (siteName) summaryBits.push(`**Site:** ${siteName}`);
  lines.push(summaryBits.join(" · "));

  const detailEntries = Object.entries(record.metadata);
  if (detailEntries.length > 0) {
    lines.push(detailEntries.map(([k, v]) => `**${capitalize(k)}:** ${v}`).join(" · "));
  }
  lines.push("");

  if (record.screenshotName) {
    lines.push(`![screenshot](${path.join(screenshotDir, record.screenshotName)})`);
    lines.push("");
  }

  return lines.join("\n").trimEnd() + "\n";
}
