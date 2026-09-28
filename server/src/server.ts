import { readFile } from "node:fs/promises";
import path from "node:path";
import express, { type NextFunction, type Request, type Response } from "express";
import { authRoutes, currentUser } from "./auth.ts";
import { config } from "./config.ts";
import { connect, disconnect, links, screenshots, users } from "./db.ts";
import { linkRoutes, recordOf } from "./links.ts";
import { SLUG } from "./slug.ts";

const root = path.resolve(import.meta.dirname, "..");
const distDir = path.join(root, "dist");

const CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "font-src 'self'",
  "img-src 'self' data:",
  "connect-src 'self'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", config.trustProxy);

app.use((_req, res, next) => {
  // Page addresses are secret: never send them to the sites people open.
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Content-Type-Options", "nosniff");
  // Vite's dev server injects inline scripts, so the CSP only applies to the built site.
  if (config.production) res.setHeader("Content-Security-Policy", CSP);
  next();
});

// ---------- API ----------

function originHost(origin: string): string | null {
  try {
    return new URL(origin).host;
  } catch {
    return null;
  }
}

const api = express.Router();

// The session cookie is SameSite=Lax; on top of that, changes must be JSON
// (which a cross-site form can't send) from this site's own origin.
api.use((req, res, next) => {
  if (req.method === "GET" || req.method === "HEAD") return next();
  const origin = req.headers.origin;
  if (origin && originHost(origin) !== req.host) {
    res.status(403).json({ error: "Cross-site request refused." });
    return;
  }
  // Requests without a body (DELETE, logout) have nothing to check.
  const hasBody = Number(req.headers["content-length"] ?? 0) > 0 || req.headers["transfer-encoding"] !== undefined;
  if (hasBody && !req.is("application/json")) {
    res.status(415).json({ error: "Expected JSON." });
    return;
  }
  next();
});
api.use(express.json({ limit: "16kb" }));
api.use((_req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  next();
});
api.use(authRoutes);
api.use("/links", linkRoutes);
api.use((_req, res) => {
  res.status(404).json({ error: "Not found." });
});
app.use("/api", api);

// ---------- Public pages: /<word-word-word>/ ----------

async function pageOwner(req: Request, res: Response) {
  const slug = String(req.params.slug);
  const owner = SLUG.test(slug) ? await users().findOne({ slug }, { projection: { _id: 1 } }) : null;
  if (!owner) res.status(404).json({ error: "There's nothing at this address." });
  return owner;
}

app.get("/:slug/links.json", async (req, res) => {
  const owner = await pageOwner(req, res);
  if (!owner) return;
  const all = await links().find({ userId: owner._id }).sort({ dateAdded: -1 }).toArray();
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("X-Robots-Tag", "noindex");
  res.json({ version: 1, links: all.map(recordOf) });
});

app.get("/:slug/screenshots/:name", async (req, res) => {
  const owner = await pageOwner(req, res);
  if (!owner) return;
  const bucket = screenshots();
  const [file] = await bucket.find({ filename: req.params.name, "metadata.userId": owner._id }).limit(1).toArray();
  if (!file) {
    res.status(404).end();
    return;
  }
  // Names include a timestamp, so a file never changes.
  res.setHeader("Content-Type", String(file.metadata?.contentType ?? "application/octet-stream"));
  res.setHeader("Content-Length", String(file.length));
  res.setHeader("Cache-Control", "private, max-age=31536000, immutable");
  bucket.openDownloadStream(file._id).on("error", () => res.destroy()).pipe(res);
});

// ---------- HTML ----------

/** Serves one of the site's HTML pages: through Vite in development, from dist/ in production. */
let sendPage: (req: Request, res: Response, name: string) => Promise<void>;

if (config.production) {
  app.use("/assets", express.static(path.join(distDir, "assets"), { immutable: true, maxAge: "1y", index: false }));
  sendPage = async (_req, res, name) => {
    res.type("html").send(await readFile(path.join(distDir, name), "utf8"));
  };
} else {
  const { createServer } = await import("vite");
  const vite = await createServer({ root, server: { middlewareMode: true }, appType: "custom" });
  app.use(vite.middlewares);
  sendPage = async (req, res, name) => {
    const html = await readFile(path.join(root, name), "utf8");
    res.type("html").send(await vite.transformIndexHtml(req.originalUrl, html));
  };
}

app.get("/", async (req, res) => {
  // Signed in: straight to your links.
  if (await currentUser(req)) return res.redirect("/manage");
  await sendPage(req, res, "index.html");
});

app.get("/manage", async (req, res) => {
  if (!(await currentUser(req))) return res.redirect("/");
  res.setHeader("Cache-Control", "no-store");
  await sendPage(req, res, "manage.html");
});

// Matches both /<slug> and /<slug>/; the page needs the trailing slash.
app.get("/:slug", async (req, res, next) => {
  if (!SLUG.test(req.params.slug)) return next();
  if (!req.path.endsWith("/")) return res.redirect(301, `/${req.params.slug}/`);
  res.setHeader("X-Robots-Tag", "noindex");
  await sendPage(req, res, "dashboard.html");
});

app.use((_req, res) => {
  res.status(404).type("text").send("Not found");
});

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  if (res.headersSent) return res.destroy();
  res.status(500).json({ error: "Something went wrong on our side. Please try again." });
});

// ---------- Start ----------

await connect();
const server = app.listen(config.port, () => {
  console.log(`serendipity server on http://localhost:${config.port}${config.production ? "" : " (development)"}`);
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    server.close();
    disconnect().finally(() => process.exit(0));
  });
}
