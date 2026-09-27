import { existsSync, readdirSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { defineConfig, type Plugin } from "vite";

const root = import.meta.dirname;
// Dashboard data folders (<id>/links.json + <id>/screenshots/). They are
// served / copied as-is, so this doubles as Vite's public dir.
const dashboardsDir = path.resolve(root, process.env.SERENDIPITY_DASHBOARDS ?? "dashboards");

const CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "font-src 'self'",
  "img-src 'self' data:",
  "connect-src 'self'",
  "base-uri 'none'",
  "form-action 'none'",
].join("; ");

function dashboardIds(): string[] {
  if (!existsSync(dashboardsDir)) return [];
  return readdirSync(dashboardsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(path.join(dashboardsDir, entry.name, "links.json")))
    .map((entry) => entry.name);
}

/**
 * Every dashboard shares one page (dashboard.html). In dev it's served for
 * /<id>/; at build time it's copied to dist/<id>/index.html so any static
 * host can serve dashboards without rewrite rules.
 */
function dashboards(): Plugin {
  let outDir = "dist";
  return {
    name: "serendipity-dashboards",
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir);
    },
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const match = req.url?.match(/^\/([a-z0-9-]+)\/?(?:index\.html)?(?:\?.*)?$/);
        if (!match || !existsSync(path.join(dashboardsDir, match[1], "links.json"))) return next();
        const template = await readFile(path.resolve(server.config.root, "dashboard.html"), "utf8");
        res.setHeader("Content-Type", "text/html");
        res.end(await server.transformIndexHtml(req.url!, template));
      });
    },
    async closeBundle() {
      const built = path.join(outDir, "dashboard.html");
      if (!existsSync(built)) return;
      const html = await readFile(built, "utf8");
      for (const id of dashboardIds()) {
        await mkdir(path.join(outDir, id), { recursive: true });
        await writeFile(path.join(outDir, id, "index.html"), html);
      }
      await rm(built);
    },
  };
}

function contentSecurityPolicy(): Plugin {
  return {
    name: "serendipity-csp",
    apply: "build",
    transformIndexHtml: () => [
      { tag: "meta", attrs: { "http-equiv": "Content-Security-Policy", content: CSP }, injectTo: "head-prepend" },
    ],
  };
}

export default defineConfig({
  appType: "mpa",
  publicDir: dashboardsDir,
  plugins: [dashboards(), contentSecurityPolicy()],
  build: {
    // Keep fonts etc. as files; the CSP doesn't allow data: fonts.
    assetsInlineLimit: 0,
    rollupOptions: {
      input: {
        main: path.join(root, "index.html"),
        dashboard: path.join(root, "dashboard.html"),
      },
    },
  },
});
