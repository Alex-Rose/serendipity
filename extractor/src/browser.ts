import type { Browser, Page } from "playwright";
import { chromium } from "playwright-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";

chromium.use(StealthPlugin());

// Substrings seen in the title/body of bot-check interstitials (Cloudflare, etc).
const CHALLENGE_MARKERS = [
  "just a moment",
  "attention required",
  "checking your browser",
  "verify you are human",
  "please verify you are a human",
];

export interface LaunchedPage {
  browser: Browser;
  page: Page;
}

export async function launchStealthPage(width: number, height: number, headless: boolean): Promise<LaunchedPage> {
  const browser: Browser = await chromium.launch({
    headless,
    args: ["--disable-blink-features=AutomationControlled"],
  });
  const page: Page = await browser.newPage({ viewport: { width, height } });
  return { browser, page };
}

export async function looksLikeChallengePage(page: Page): Promise<boolean> {
  const title = (await page.title()).toLowerCase();
  if (CHALLENGE_MARKERS.some((marker) => title.includes(marker))) return true;

  return page.evaluate((markers: string[]) => {
    if (document.getElementById("challenge-running")) return true;
    if (document.querySelector('[class*="cf-browser-verification"]')) return true;
    const bodyText = (document.body?.innerText ?? "").slice(0, 500).toLowerCase();
    return markers.some((marker) => bodyText.includes(marker));
  }, CHALLENGE_MARKERS);
}

/** Polls until the challenge marker disappears (the user solved it) or the timeout elapses. */
export async function waitForChallengeToClear(page: Page, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!(await looksLikeChallengePage(page))) return true;
    await page.waitForTimeout(1000);
  }
  return !(await looksLikeChallengePage(page));
}

async function navigate(page: Page, url: string, timeoutMs: number): Promise<void> {
  await page.goto(url, { waitUntil: "load", timeout: timeoutMs });
  // Best-effort: give the page a chance to settle (lazy images, late JS),
  // but many sites (ads, analytics beacons) never go fully network-idle.
  await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});
}

export interface OpenPageOptions {
  width: number;
  height: number;
  timeoutMs: number;
  interactiveFallback: boolean;
  interactiveTimeoutMs: number;
}

/**
 * Opens the URL headless with stealth evasions applied. If the page comes back
 * as a bot-check interstitial, either gives up (interactiveFallback: false) or
 * re-opens the same URL in a visible window and waits for a human to clear it.
 */
export async function openResolvedPage(url: string, opts: OpenPageOptions): Promise<LaunchedPage> {
  let { browser, page } = await launchStealthPage(opts.width, opts.height, true);
  await navigate(page, url, opts.timeoutMs);

  if (!(await looksLikeChallengePage(page))) {
    return { browser, page };
  }

  if (!opts.interactiveFallback) {
    await browser.close();
    throw new Error(
      `"${url}" looks like a bot-check page and stealth mode didn't get past it. ` +
        `Omit --no-interactive-fallback to solve it manually in a visible browser window.`,
    );
  }

  console.error("Bot-check detected — opening a visible browser window. Solve it there to continue...");
  await browser.close();
  ({ browser, page } = await launchStealthPage(opts.width, opts.height, false));
  await navigate(page, url, opts.timeoutMs);

  const cleared = await waitForChallengeToClear(page, opts.interactiveTimeoutMs);
  if (!cleared) {
    await browser.close();
    throw new Error(`Timed out waiting for the challenge on "${url}" to be solved.`);
  }
  console.error("Challenge cleared, continuing...");
  return { browser, page };
}
