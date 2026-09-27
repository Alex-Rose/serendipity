#!/usr/bin/env node
import { writeFile } from "node:fs/promises";
import { Command } from "commander";
import { openResolvedPage, type LaunchedPage } from "./browser.js";
import { classify } from "./classify.js";
import { extractMetadata } from "./extract.js";
import { runExtractors } from "./extractors/registry.js";
import { renderMarkdown } from "./markdown.js";
import { buildRecord } from "./record.js";
import { saveScreenshotFile, screenshotThumbnail } from "./screenshot.js";

type OutputFormat = "json" | "markdown" | "raw";

const program = new Command();

program
  .name("mdlinks")
  .description("Turn a URL into a standard JSON record (title, description, category, screenshot, ...).")
  .argument("<url>", "page to fetch")
  .option("-o, --output <file>", "write output to a file instead of stdout")
  .option("-f, --format <format>", "json | markdown | raw (all extracted metadata, for debugging)", "json")
  .option("--screenshot-dir <dir>", "directory to save full-size screenshot files in", "./screenshots")
  .option("--no-save-screenshot", "don't save the full-size screenshot file (screenshotName will be empty)")
  .option("--thumbnail-width <px>", "max width of the base64 screenshot thumbnail", "400")
  .option("--width <px>", "viewport width for the screenshot", "1920")
  .option("--height <px>", "viewport height for the screenshot", "1080")
  .option("--timeout <ms>", "navigation timeout", "30000")
  .option("--no-interactive-fallback", "don't open a visible browser window if a bot-check page is hit")
  .option("--interactive-timeout <ms>", "how long to wait for a manually-solved challenge", "120000")
  .action(async (url: string, opts) => {
    const format = opts.format as OutputFormat;
    const validFormats: OutputFormat[] = ["json", "markdown", "raw"];
    if (!validFormats.includes(format)) {
      console.error(`Invalid --format "${format}". Expected one of: ${validFormats.join(", ")}`);
      process.exit(1);
    }

    let launched: LaunchedPage;
    try {
      launched = await openResolvedPage(url, {
        width: Number(opts.width),
        height: Number(opts.height),
        timeoutMs: Number(opts.timeout),
        interactiveFallback: opts.interactiveFallback,
        interactiveTimeoutMs: Number(opts.interactiveTimeout),
      });
    } catch (err) {
      console.error(err instanceof Error ? err.message : err);
      process.exit(1);
    }
    const { browser, page } = launched;

    try {
      const meta = await extractMetadata(page, url);
      const classification = classify(meta.jsonLd);
      const details = await runExtractors(classification.type, {
        page,
        meta,
        jsonLdNode: classification.node,
      });

      let output: string;
      if (format === "raw") {
        output = JSON.stringify({ meta, classification, details }, null, 2);
      } else {
        const screenshotPng = await page.screenshot({ type: "png" });
        const record = buildRecord({
          meta,
          classification,
          details,
          screenshot: await screenshotThumbnail(screenshotPng, Number(opts.thumbnailWidth)),
          screenshotName: opts.saveScreenshot
            ? await saveScreenshotFile(screenshotPng, opts.screenshotDir, meta.finalUrl)
            : "",
        });
        output =
          format === "json"
            ? JSON.stringify(record, null, 2)
            : renderMarkdown(record, {
                emoji: classification.emoji,
                siteName: meta.siteName,
                screenshotDir: opts.screenshotDir,
              });
      }

      if (opts.output) {
        await writeFile(opts.output, output.endsWith("\n") ? output : output + "\n");
      } else {
        console.log(output.trimEnd());
      }
    } finally {
      await browser.close();
    }
  });

program.parseAsync();
