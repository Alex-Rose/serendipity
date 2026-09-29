import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { type NextFunction, type Request, type Response, Router } from "express";
import { ObjectId } from "mongodb";
import { config } from "./config.ts";
import { isDuplicateKey, sessions, type User, users } from "./db.ts";
import { rateLimit } from "./rate-limit.ts";
import { newSlug } from "./slug.ts";

const scryptAsync = promisify(scrypt) as (password: string, salt: Buffer, keylen: number, options: object) => Promise<Buffer>;

// ---------- Passwords ----------

const SCRYPT = { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const KEY_LENGTH = 32;

/** Stored as "scrypt$N$r$p$salt$hash" (base64url), so parameters can change later. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scryptAsync(password, salt, KEY_LENGTH, SCRYPT);
  return ["scrypt", SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString("base64url"), hash.toString("base64url")].join("$");
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, N, r, p, salt, hash] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64url");
  const actual = await scryptAsync(password, Buffer.from(salt, "base64url"), expected.length, {
    N: Number(N),
    r: Number(r),
    p: Number(p),
    maxmem: SCRYPT.maxmem,
  });
  return timingSafeEqual(actual, expected);
}

// Checked against when the username doesn't exist, so a login takes the same
// time either way and doesn't reveal which usernames are taken.
const dummyHash = hashPassword(randomBytes(16).toString("hex"));

// ---------- Sessions ----------

const COOKIE = "sid";
const SESSION_DAYS = 30;

const tokenId = (token: string) => createHash("sha256").update(token).digest("base64url");

function readCookie(req: Request, name: string): string | undefined {
  for (const part of (req.headers.cookie ?? "").split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return decodeURIComponent(value.join("="));
  }
  return undefined;
}

async function startSession(req: Request, res: Response, userId: ObjectId): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await sessions().insertOne({ _id: tokenId(token), userId, expiresAt });
  res.cookie(COOKIE, token, {
    httpOnly: true,
    secure: config.cookieSecure === "auto" ? req.secure : config.cookieSecure,
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

/** The signed-in user, or null. Cached on the request. */
export async function currentUser(req: Request): Promise<User | null> {
  if (req.user !== undefined) return req.user;
  req.user = null;
  const token = readCookie(req, COOKIE);
  if (!token) return null;
  const session = await sessions().findOne({ _id: tokenId(token), expiresAt: { $gt: new Date() } });
  if (session) req.user = await users().findOne({ _id: session.userId });
  return req.user;
}

declare module "express-serve-static-core" {
  interface Request {
    user?: User | null;
  }
}

export async function requireUser(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (await currentUser(req)) return next();
  res.status(401).json({ error: "Please log in." });
}

// ---------- Validation ----------

const USERNAME = /^[a-z0-9_-]{3,32}$/;
const PASSWORD_MIN = 5;
const PASSWORD_MAX = 200;

function credentials(body: unknown): { username: string; password: string } | null {
  const { username, password } = (body ?? {}) as Record<string, unknown>;
  if (typeof username !== "string" || typeof password !== "string") return null;
  return { username: username.trim().toLowerCase(), password };
}

export const publicUser = (user: User) => ({ username: user.username, slug: user.slug });

// ---------- Routes ----------

export const authRoutes = Router();

authRoutes.post("/register", rateLimit({ windowMs: 60 * 60 * 1000, max: 10 }), async (req, res) => {
  const creds = credentials(req.body);
  if (!creds || !USERNAME.test(creds.username)) {
    res.status(400).json({ error: "Pick a username of 3 to 32 letters, numbers, - or _." });
    return;
  }
  if (creds.password.length < PASSWORD_MIN || creds.password.length > PASSWORD_MAX) {
    res.status(400).json({ error: `Use a password of at least ${PASSWORD_MIN} characters.` });
    return;
  }

  const passwordHash = await hashPassword(creds.password);
  // A new random slug on the (very unlikely) chance one is already taken.
  for (let attempt = 0; attempt < 5; attempt++) {
    const user: User = {
      _id: new ObjectId(),
      username: creds.username,
      passwordHash,
      slug: newSlug(),
      createdAt: new Date(),
    };
    try {
      await users().insertOne(user);
    } catch (err) {
      if (!isDuplicateKey(err)) throw err;
      if (await users().findOne({ username: user.username }, { projection: { _id: 1 } })) {
        res.status(409).json({ error: "That username is taken. Try another one." });
        return;
      }
      continue;
    }
    await startSession(req, res, user._id);
    res.status(201).json(publicUser(user));
    return;
  }
  throw new Error("Couldn't find a free page address.");
});

authRoutes.post("/login", rateLimit({ windowMs: 15 * 60 * 1000, max: 20 }), async (req, res) => {
  const creds = credentials(req.body);
  const user = creds && creds.password.length <= PASSWORD_MAX ? await users().findOne({ username: creds.username }) : null;
  const ok = await verifyPassword(creds?.password.slice(0, PASSWORD_MAX) ?? "", user?.passwordHash ?? (await dummyHash));
  if (!user || !ok) {
    res.status(401).json({ error: "Wrong username or password." });
    return;
  }
  await startSession(req, res, user._id);
  res.json(publicUser(user));
});

authRoutes.post("/logout", async (req, res) => {
  const token = readCookie(req, COOKIE);
  if (token) await sessions().deleteOne({ _id: tokenId(token) });
  res.clearCookie(COOKIE, { path: "/" });
  res.status(204).end();
});

authRoutes.get("/me", requireUser, (req, res) => {
  res.json(publicUser(req.user!));
});
