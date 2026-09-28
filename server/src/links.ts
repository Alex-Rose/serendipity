import { Router } from "express";
import { ObjectId, type WithId } from "mongodb";
import { parseWebUrl, urlKey } from "serendipity-extractor";
import { requireUser } from "./auth.ts";
import { captureLink, deleteScreenshot, isPublicWebUrl } from "./capture.ts";
import { config } from "./config.ts";
import { isDuplicateKey, type Link, links } from "./db.ts";

const TITLE_MAX = 300;
const DESCRIPTION_MAX = 1000;

/** The link as the manage page sees it: the record plus its id. */
export const linkForOwner = (link: WithId<Link>) => ({ id: link._id.toHexString(), ...recordOf(link) });

/** The extractor's link record format, as served in a page's links.json. */
export function recordOf(link: Link) {
  return {
    url: link.url,
    title: link.title,
    description: link.description,
    category: link.category,
    dateAdded: link.dateAdded.toISOString(),
    screenshotName: link.screenshotName,
    screenshot: link.screenshot,
    metadata: link.metadata,
  };
}

function linkId(value: unknown): ObjectId | null {
  return typeof value === "string" && ObjectId.isValid(value) && value.length === 24 ? new ObjectId(value) : null;
}

export const linkRoutes = Router();
linkRoutes.use(requireUser);

linkRoutes.get("/", async (req, res) => {
  const all = await links().find({ userId: req.user!._id }).sort({ dateAdded: -1 }).toArray();
  res.json(all.map(linkForOwner));
});

linkRoutes.post("/", async (req, res) => {
  const userId = req.user!._id;
  const url = typeof req.body?.url === "string" ? parseWebUrl(req.body.url) : null;
  if (!url) {
    res.status(400).json({ error: "That doesn't look like a web address. It should start with https://" });
    return;
  }
  if (!(await isPublicWebUrl(url))) {
    res.status(400).json({ error: "Couldn't find a public website at that address. Check the link and try again." });
    return;
  }

  const isKnown = async (candidate: string) =>
    (await links().countDocuments({ userId, urlKey: urlKey(candidate) }, { limit: 1 })) > 0;
  if (await isKnown(url)) {
    res.status(409).json({ error: "That link is already on your page." });
    return;
  }

  // If the page can't be loaded, the link is still saved: the person can fill
  // in a title themselves. Saving shouldn't depend on someone else's website.
  let warning: string | undefined;
  let record: Omit<Link, "_id" | "userId" | "urlKey" | "dateAdded">;
  const bare = { url, title: "", description: "", category: "webpage", screenshotName: "", screenshot: "", metadata: {} };
  if (!config.capture) {
    record = bare;
  } else {
    try {
      const captured = await captureLink(url, userId, isKnown);
      if (captured === "duplicate") {
        res.status(409).json({ error: "That link is already on your page." });
        return;
      }
      record = captured;
    } catch (err) {
      console.warn(`Capture failed for ${url}: ${err instanceof Error ? err.message.split("\n")[0] : err}`);
      warning = "Saved, but the page couldn't be loaded for a preview. You can give it a title yourself.";
      record = bare;
    }
  }

  const link: Link = { ...record, _id: new ObjectId(), userId, urlKey: urlKey(record.url), dateAdded: new Date() };
  try {
    await links().insertOne(link);
  } catch (err) {
    await deleteScreenshot(link.screenshotName, userId);
    if (!isDuplicateKey(err)) throw err;
    res.status(409).json({ error: "That link is already on your page." });
    return;
  }
  res.status(201).json({ link: linkForOwner(link), warning });
});

linkRoutes.patch("/:id", async (req, res) => {
  const _id = linkId(req.params.id);
  const { title, description } = (req.body ?? {}) as Record<string, unknown>;
  const update: Partial<Link> = {};
  if (typeof title === "string") update.title = title.trim().slice(0, TITLE_MAX);
  if (typeof description === "string") update.description = description.trim().slice(0, DESCRIPTION_MAX);
  if (Object.keys(update).length === 0) {
    res.status(400).json({ error: "Nothing to change." });
    return;
  }
  const link = _id
    ? await links().findOneAndUpdate({ _id, userId: req.user!._id }, { $set: update }, { returnDocument: "after" })
    : null;
  if (!link) {
    res.status(404).json({ error: "That link isn't on your page any more." });
    return;
  }
  res.json(linkForOwner(link));
});

linkRoutes.delete("/:id", async (req, res) => {
  const _id = linkId(req.params.id);
  const link = _id ? await links().findOneAndDelete({ _id, userId: req.user!._id }) : null;
  if (link) await deleteScreenshot(link.screenshotName, link.userId);
  res.status(204).end();
});
