import { GridFSBucket, type Db, MongoClient, type ObjectId } from "mongodb";
import { config } from "./config.ts";

export interface User {
  _id: ObjectId;
  /** Lowercase; unique. */
  username: string;
  passwordHash: string;
  /** The three-word address of the user's page, e.g. "amber-orbit-tulip". Unique. */
  slug: string;
  createdAt: Date;
}

export interface Session {
  /** SHA-256 of the cookie token, so a database leak doesn't leak live sessions. */
  _id: string;
  userId: ObjectId;
  expiresAt: Date;
}

/** A saved link: the extractor's link record, plus its owner. */
export interface Link {
  _id: ObjectId;
  userId: ObjectId;
  url: string;
  title: string;
  description: string;
  category: string;
  dateAdded: Date;
  /** File name of the full-size screenshot in the "screenshots" GridFS bucket, or "". */
  screenshotName: string;
  /** Small JPEG thumbnail as a data URI, or "". */
  screenshot: string;
  metadata: Record<string, string>;
}

const client = new MongoClient(config.mongoUri);
let db: Db;

export async function connect(): Promise<void> {
  await client.connect();
  db = client.db();
  await Promise.all([
    users().createIndex({ username: 1 }, { unique: true }),
    users().createIndex({ slug: 1 }, { unique: true }),
    sessions().createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    links().createIndex({ userId: 1, url: 1 }, { unique: true }),
    links().createIndex({ userId: 1, dateAdded: -1 }),
    db.collection("screenshots.files").createIndex({ filename: 1, "metadata.userId": 1 }),
  ]);
}

export const disconnect = () => client.close();

export const users = () => db.collection<User>("users");
export const sessions = () => db.collection<Session>("sessions");
export const links = () => db.collection<Link>("links");
export const screenshots = () => new GridFSBucket(db, { bucketName: "screenshots" });

export function isDuplicateKey(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: unknown }).code === 11000;
}
