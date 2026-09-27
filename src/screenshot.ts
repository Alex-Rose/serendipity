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

export async function saveScreenshotFile(png: Buffer, dir: string, url: string): Promise<string> {
  await mkdir(dir, { recursive: true });
  const filename = `${slugFromUrl(url)}-${Date.now()}.png`;
  const filePath = path.join(dir, filename);
  await writeFile(filePath, png);
  return filePath;
}

export async function screenshotToInlineDataUri(png: Buffer, maxWidth: number): Promise<string> {
  const resized = await sharp(png)
    .resize({ width: maxWidth, withoutEnlargement: true })
    .png({ quality: 80 })
    .toBuffer();
  return `data:image/png;base64,${resized.toString("base64")}`;
}
