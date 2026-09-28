#!/usr/bin/env node
import { writeFile } from "node:fs/promises";
import { Command } from "commander";
import { capturePage } from "./capture.js";
import { type DashboardFile, hasLink, readDashboard, screenshotsDir, writeDashboard } from "./dashboard.js";
import { renderMarkdown } from "./markdown.js";
import { buildRecord } from "./record.js";
import { saveScreenshotFile, screenshotThumbnail } from "./screenshot.js";
import { parseWebUrl, readUrlFile } from "./urls.js";

type OutputFormat = "json" | "markdown" | "raw";

interface CaptureContext {
  opts: Record<string, any>;
  format: OutputFormat;
  screenshotDir: string;
  dashboard?: { dir: string; data: DashboardFile };
}

/**
 * Captures one URL. Returns the value to print (a record, raw metadata or a
 * markdown string), or null when there's nothing to print: the link was added
 * to the dashboard or was already in it. Throws if the page can't be captured.
 */
async function capture(url: string, { opts, format, screenshotDir, dashboard }: CaptureContext): Promise<unknown> {
  if (dashboard && hasLink(dashboard.data, url)) {
    console.error(`Already in ${dashboard.dir}: ${url}`);
    return null;
  }

  const { meta, classification, details, screenshotPng } = await capturePage(url, {
    width: Number(opts.width),
    height: Number(opts.height),
    timeoutMs: Number(opts.timeout),
    interactiveFallback: opts.interactiveFallback,
    interactiveTimeoutMs: Number(opts.interactiveTimeout),
  });

  if (dashboard && hasLink(dashboard.data, meta.finalUrl)) {
    console.error(`Already in ${dashboard.dir}: ${meta.finalUrl}`);
    return null;
  }

  if (format === "raw" && !dashboard) return { meta, classification, details };

  const record = buildRecord({
    meta,
    classification,
    details,
    screenshot: await screenshotThumbnail(screenshotPng, Number(opts.thumbnailWidth)),
    screenshotName: opts.saveScreenshot ? await saveScreenshotFile(screenshotPng, screenshotDir, meta.finalUrl) : "",
  });

  if (dashboard) {
    dashboard.data.links.push(record);
    await writeDashboard(dashboard.dir, dashboard.data);
    console.error(`Added to ${dashboard.dir} (${dashboard.data.links.length} links): ${record.title || record.url}`);
    return null;
  }

  if (format === "json") return record;
  return renderMarkdown(record, { emoji: classification.emoji, siteName: meta.siteName, screenshotDir });
}

const program = new Command();

program
  .name("mdlinks")
  .description("Turn a URL into a standard JSON record (title, description, category, screenshot, ...).")
  .argument("[url]", "page to fetch (or use --input for many)")
  .option("-i, --input <file>", "read URLs from a file, one per line; invalid lines and # comments are skipped")
  .option("-o, --output <file>", "write output to a file instead of stdout")
  .option("-f, --format <format>", "json | markdown | raw (all extracted metadata, for debugging)", "json")
  .option(
    "-d, --dashboard <dir>",
    "add the link to a dashboard folder (its links.json and screenshots/) instead of printing it",
  )
  .option("--screenshot-dir <dir>", "directory to save full-size screenshot files in", "./screenshots")
  .option("--no-save-screenshot", "don't save the full-size screenshot file (screenshotName will be empty)")
  .option("--thumbnail-width <px>", "max width of the base64 screenshot thumbnail", "400")
  .option("--width <px>", "viewport width for the screenshot", "1920")
  .option("--height <px>", "viewport height for the screenshot", "1080")
  .option("--timeout <ms>", "navigation timeout", "30000")
  .option("--no-interactive-fallback", "don't open a visible browser window if a bot-check page is hit")
  .option("--interactive-timeout <ms>", "how long to wait for a manually-solved challenge", "120000")
  .action(async (urlArg: string | undefined, opts) => {
    const format = opts.format as OutputFormat;
    const validFormats: OutputFormat[] = ["json", "markdown", "raw"];
    if (!validFormats.includes(format)) {
      console.error(`Invalid --format "${format}". Expected one of: ${validFormats.join(", ")}`);
      process.exit(1);
    }
    if (Boolean(urlArg) === Boolean(opts.input)) {
      console.error("Pass either a URL or --input <file>, not both.");
      process.exit(1);
    }

    // Every URL is validated before any browser is launched.
    let urls: string[];
    if (opts.input) {
      const file = await readUrlFile(opts.input).catch((err: Error) => {
        console.error(`Can't read ${opts.input}: ${err.message}`);
        process.exit(1);
      });
      for (const { line, text } of file.invalid) {
        console.error(`Skipping ${opts.input}:${line}, not a valid http(s) URL: ${text}`);
      }
      urls = file.urls;
      if (urls.length === 0) {
        console.error(`No valid URLs in ${opts.input}.`);
        process.exit(1);
      }
    } else {
      const url = parseWebUrl(urlArg!);
      if (!url) {
        console.error(`Not a valid http(s) URL: ${urlArg}`);
        process.exit(1);
      }
      urls = [url];
    }

    const dashboardDir: string | undefined = opts.dashboard;
    const ctx: CaptureContext = {
      opts,
      format,
      screenshotDir: dashboardDir ? screenshotsDir(dashboardDir) : opts.screenshotDir,
      dashboard: dashboardDir ? { dir: dashboardDir, data: await readDashboard(dashboardDir) } : undefined,
    };

    const results: unknown[] = [];
    let failures = 0;
    for (const [i, url] of urls.entries()) {
      if (urls.length > 1) console.error(`[${i + 1}/${urls.length}] ${url}`);
      try {
        const result = await capture(url, ctx);
        if (result !== null) results.push(result);
      } catch (err) {
        failures++;
        console.error(`Failed ${url}: ${err instanceof Error ? err.message.split("\n")[0] : err}`);
      }
    }

    if (results.length > 0) {
      // A single URL prints one object; --input always prints a JSON array.
      const output =
        format === "markdown"
          ? (results as string[]).map((md) => md.trimEnd()).join("\n\n")
          : JSON.stringify(opts.input ? results : results[0], null, 2);
      if (opts.output) {
        await writeFile(opts.output, output.trimEnd() + "\n");
      } else {
        console.log(output.trimEnd());
      }
    }

    if (urls.length > 1) {
      console.error(`Done: ${urls.length - failures} of ${urls.length} succeeded${failures ? `, ${failures} failed` : ""}.`);
    }
    if (failures > 0) process.exitCode = 1;
  });

program.parseAsync();
