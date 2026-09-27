// Creates a new, empty dashboard with a random three-word ID, e.g.
// dashboards/amber-orbit-tulip/links.json.
//
// Words come from the EFF large wordlist (7,772 words once the four hyphenated
// ones are removed), so an ID is one of ~4.7 × 10^11 possibilities (~39 bits).
// The URL is the only thing keeping a dashboard private: don't publish it.

import { randomInt } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const dashboardsDir = path.resolve(process.env.SERENDIPITY_DASHBOARDS ?? path.join(here, "..", "dashboards"));

const words = (await readFile(path.join(here, "wordlist.txt"), "utf8")).split("\n").filter(Boolean);

function newId(): string {
  // randomInt is backed by the CSPRNG and is unbiased (it rejection-samples internally).
  return Array.from({ length: 3 }, () => words[randomInt(words.length)]).join("-");
}

let id = newId();
while (existsSync(path.join(dashboardsDir, id))) id = newId();

const dir = path.join(dashboardsDir, id);
await mkdir(path.join(dir, "screenshots"), { recursive: true });
await writeFile(path.join(dir, "links.json"), JSON.stringify({ version: 1, links: [] }, null, 2) + "\n");

console.log(`Created ${path.relative(process.cwd(), dir) || dir}`);
console.log(`URL path: /${id}/`);
console.log(`Add links: (cd ../extractor && node dist/index.js <url> -d ${dir})`);
