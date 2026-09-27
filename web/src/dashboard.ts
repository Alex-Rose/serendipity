import "./fonts.ts";
import "./style.css";
import { renderCard } from "./card.ts";
import { type LinkRecord, parseLinks, pickRandom } from "./links.ts";

const cards = document.getElementById("cards")!;
const notice = document.getElementById("notice")!;
const shuffleButton = document.getElementById("shuffle") as HTMLButtonElement;
const greeting = document.getElementById("greeting")!;

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const LEAVE_MS = 320;

// The dashboard ID is the first path segment after the site's base path:
// <base><word-word-word>/
const siteBase = import.meta.env.BASE_URL;
const id = location.pathname.startsWith(siteBase) ? location.pathname.slice(siteBase.length).split("/")[0] : "";
const base = `${siteBase}${encodeURIComponent(id)}`;

function greetingFor(hour: number): string {
  const part = hour < 5 ? "Good evening" : hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  return `${part}. Here are a few things you once saved.`;
}

/** 2 cards on narrow and medium screens, 3 on wide ones. */
function cardCount(): number {
  return window.matchMedia("(min-width: 1080px)").matches ? 3 : 2;
}

function showNotice(text: string) {
  greeting.textContent = "";
  notice.textContent = text;
  notice.hidden = false;
}

function render(selection: LinkRecord[]) {
  cards.replaceChildren(...selection.map((link, i) => renderCard(link, `${base}/screenshots`, i)));
  cards.style.setProperty("--count", String(selection.length));
}

async function load(): Promise<LinkRecord[] | null> {
  if (!/^[a-z0-9-]+$/.test(id)) return null;
  const response = await fetch(`${base}/links.json`, { cache: "no-cache" });
  if (!response.ok) return null;
  return parseLinks(await response.json());
}

async function main() {
  let links: LinkRecord[] | null;
  try {
    links = await load();
  } catch {
    links = null;
  }

  if (links === null) {
    showNotice("There's nothing at this address.");
    return;
  }
  if (links.length === 0) {
    showNotice("Nothing saved here yet. Links you add will show up on this page.");
    return;
  }

  greeting.textContent = greetingFor(new Date().getHours());
  let shown = pickRandom(links, cardCount());
  render(shown);

  if (links.length <= shown.length) return;
  shuffleButton.hidden = false;
  shuffleButton.addEventListener("click", async () => {
    shuffleButton.disabled = true;
    shown = pickRandom(links, cardCount(), new Set(shown.map((link) => link.url)));
    if (!reducedMotion.matches) {
      cards.classList.add("is-leaving");
      await new Promise((resolve) => setTimeout(resolve, LEAVE_MS));
    }
    render(shown);
    cards.classList.remove("is-leaving");
    shuffleButton.disabled = false;
  });
}

main();
