#!/usr/bin/env node
import { writeFile } from "node:fs/promises";
import { Command } from "commander";
import { openResolvedPage, type LaunchedPage } from "./browser.js";
import { classify } from "./classify.js";
import { extractMetadata } from "./extract.js";
import { runExtractors } from "./extractors/registry.js";
import { renderMarkdown } from "./markdown.js";
import { saveScreenshotFile, screenshotToInlineDataUri } from "./screenshot.js";
import type { ScreenshotMode } from "./types.js";

const program = new Command();

program
  .name("mdlinks")
  .description("Turn a URL into a rich markdown link with title, description, type, and a screenshot.")
  .argument("<url>", "page to fetch")
  .option("-o, --output <file>", "write markdown to a file instead of stdout")
  .option(
    "--screenshot-mode <mode>",
    "file | inline | both | none",
    "file",
  )
  .option("--screenshot-dir <dir>", "directory to save screenshot files in", "./screenshots")
  .option("--inline-max-width <px>", "max width for inline base64 screenshots", "600")
  .option("--width <px>", "viewport width for the screenshot", "1920")
  .option("--height <px>", "viewport height for the screenshot", "1080")
  .option("--timeout <ms>", "navigation timeout", "30000")
  .option("--no-interactive-fallback", "don't open a visible browser window if a bot-check page is hit")
  .option("--interactive-timeout <ms>", "how long to wait for a manually-solved challenge", "120000")
  .option("--json", "print raw extracted metadata as JSON instead of markdown", false)
  .action(async (url: string, opts) => {
    const screenshotMode = opts.screenshotMode as ScreenshotMode;
    const validModes: ScreenshotMode[] = ["file", "inline", "both", "none"];
    if (!validModes.includes(screenshotMode)) {
      console.error(`Invalid --screenshot-mode "${screenshotMode}". Expected one of: ${validModes.join(", ")}`);
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
      const screenshotPng = await page.screenshot({ type: "png" });

      if (opts.json) {
        console.log(JSON.stringify({ meta, classification, details }, null, 2));
        return;
      }

      const screenshotRefs: string[] = [];
      if (screenshotMode === "file" || screenshotMode === "both") {
        const filePath = await saveScreenshotFile(screenshotPng, opts.screenshotDir, meta.finalUrl);
        screenshotRefs.push(filePath);
      }
      if (screenshotMode === "inline" || screenshotMode === "both") {
        screenshotRefs.push(await screenshotToInlineDataUri(screenshotPng, Number(opts.inlineMaxWidth)));
      }

      const markdown = renderMarkdown({ meta, classification, details, screenshotRefs });

      if (opts.output) {
        await writeFile(opts.output, markdown);
      } else {
        console.log(markdown);
      }
    } finally {
      await browser.close();
    }
  });

program.parseAsync();
