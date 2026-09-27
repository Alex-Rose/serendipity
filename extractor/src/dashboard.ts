import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { LinkRecord } from "./types.js";

/** Shape of a dashboard's links.json. Bump `version` on breaking changes. */
export interface DashboardFile {
  version: 1;
  links: LinkRecord[];
}

export const linksPath = (dir: string) => path.join(dir, "links.json");
export const screenshotsDir = (dir: string) => path.join(dir, "screenshots");

export async function readDashboard(dir: string): Promise<DashboardFile> {
  let text: string;
  try {
    text = await readFile(linksPath(dir), "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return { version: 1, links: [] };
    throw err;
  }
  const data = JSON.parse(text) as DashboardFile;
  if (data.version !== 1 || !Array.isArray(data.links)) {
    throw new Error(`${linksPath(dir)} is not a version 1 dashboard file.`);
  }
  return data;
}

/** Writes via a temp file + rename so a crash never leaves a half-written links.json. */
export async function writeDashboard(dir: string, data: DashboardFile): Promise<void> {
  await mkdir(dir, { recursive: true });
  const tmp = `${linksPath(dir)}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(data, null, 2) + "\n");
  await rename(tmp, linksPath(dir));
}

export function hasLink(data: DashboardFile, url: string): boolean {
  return data.links.some((link) => link.url === url);
}
