// Three-word page addresses, e.g. "amber-orbit-tulip", from the same EFF
// wordlist the static site uses (web/scripts/wordlist.txt): 7,772 words, so
// ~4.7 × 10^11 possible addresses (~39 bits). The address is the only thing
// keeping a page private, so it must be unguessable.

import { randomInt } from "node:crypto";
import { readFileSync } from "node:fs";

const wordlist = new URL("../../web/scripts/wordlist.txt", import.meta.url);
const words = readFileSync(wordlist, "utf8").split("\n").filter(Boolean);

export const SLUG = /^[a-z]+-[a-z]+-[a-z]+$/;

export function newSlug(): string {
  // randomInt is backed by the CSPRNG and is unbiased.
  return Array.from({ length: 3 }, () => words[randomInt(words.length)]).join("-");
}
