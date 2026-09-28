import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";
import { buildRecord, capturePage, type LinkRecord, screenshotThumbnail, screenshotWebp, slugFromUrl } from "serendipity-extractor";
import type { ObjectId } from "mongodb";
import { config } from "./config.ts";
import { screenshots } from "./db.ts";

// ---------- Keeping captures off private networks ----------

const privateRanges = new BlockList();
for (const [net, prefix] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16],
  ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["224.0.0.0", 3],
] as const) privateRanges.addSubnet(net, prefix, "ipv4");
for (const [net, prefix] of [["::", 127], ["fc00::", 7], ["fe80::", 10], ["ff00::", 8]] as const) {
  privateRanges.addSubnet(net, prefix, "ipv6");
}

// BlockList also checks IPv4-mapped IPv6 addresses (::ffff:127.0.0.1) against the IPv4 ranges.
const isPrivateAddress = (address: string) => privateRanges.check(address, isIP(address) === 6 ? "ipv6" : "ipv4");

/** True if the URL is http(s) and its host resolves only to public addresses. */
export async function isPublicWebUrl(url: string): Promise<boolean> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
  if (config.allowPrivateUrls) return true;
  const host = parsed.hostname.replace(/^\[|\]$/g, "");
  try {
    const addresses = isIP(host) ? [{ address: host }] : await lookup(host, { all: true, verbatim: true });
    return addresses.length > 0 && addresses.every(({ address }) => !isPrivateAddress(address));
  } catch {
    return false;
  }
}

// ---------- Capture ----------

// Each capture runs its own Chromium; queue them so a burst of links can't
// exhaust the server's memory.
let running = 0;
const waiting: Array<() => void> = [];

async function withCaptureSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (running >= config.captureConcurrency) await new Promise<void>((resolve) => waiting.push(resolve));
  running++;
  try {
    return await fn();
  } finally {
    running--;
    waiting.shift()?.();
  }
}

const FULL_SCREENSHOT_WIDTH = 1280;

/**
 * Loads the page and returns its link record, with the full-size screenshot
 * stored in GridFS. `isKnown` is checked against the final URL (after
 * redirects) before anything is stored, so duplicates don't leave orphans.
 */
export async function captureLink(
  url: string,
  userId: ObjectId,
  isKnown: (finalUrl: string) => Promise<boolean>,
): Promise<LinkRecord | "duplicate"> {
  const page = await withCaptureSlot(() =>
    capturePage(url, {
      width: 1920,
      height: 1080,
      timeoutMs: 30_000,
      interactiveFallback: false,
      interactiveTimeoutMs: 0,
      allowRequest: isPublicWebUrl,
    }),
  );
  if (page.meta.finalUrl !== url && (await isKnown(page.meta.finalUrl))) return "duplicate";

  const screenshotName = `${slugFromUrl(page.meta.finalUrl)}-${Date.now()}.webp`;
  const webp = await screenshotWebp(page.screenshotPng, FULL_SCREENSHOT_WIDTH);
  await new Promise<void>((resolve, reject) => {
    screenshots()
      .openUploadStream(screenshotName, { metadata: { userId, contentType: "image/webp" } })
      .on("finish", () => resolve())
      .on("error", reject)
      .end(webp);
  });

  return buildRecord({
    meta: page.meta,
    classification: page.classification,
    details: page.details,
    screenshot: await screenshotThumbnail(page.screenshotPng, 400),
    screenshotName,
  });
}

export async function deleteScreenshot(name: string, userId: ObjectId): Promise<void> {
  if (!name) return;
  const bucket = screenshots();
  for (const file of await bucket.find({ filename: name, "metadata.userId": userId }).toArray()) {
    await bucket.delete(file._id);
  }
}
