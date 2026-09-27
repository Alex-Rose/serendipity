import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

export function slugFromUrl(url: string): string {
  const { hostname, pathname } = new URL(url);
  const slug = `${hostname}${pathname}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || hostname;
}

/** Saves the full-size screenshot and returns its file name (not the full path). */
export async function saveScreenshotFile(png: Buffer, dir: string, url: string): Promise<string> {
  await mkdir(dir, { recursive: true });
  const filename = `${slugFromUrl(url)}-${Date.now()}.png`;
  await writeFile(path.join(dir, filename), png);
  return filename;
}

/** Downscales the screenshot to a small JPEG thumbnail and returns it as a base64 data URI. */
export async function screenshotThumbnail(png: Buffer, maxWidth: number): Promise<string> {
  const resized = await sharp(png)
    .resize({ width: maxWidth, withoutEnlargement: true })
    .jpeg({ quality: 70 })
    .toBuffer();
  return `data:image/jpeg;base64,${resized.toString("base64")}`;
}
