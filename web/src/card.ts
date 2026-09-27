import type { LinkRecord } from "./links.ts";

const DAY = 24 * 60 * 60 * 1000;
const relativeTime = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });

/** "Saved 3 months ago", "Saved yesterday", ... Empty for a missing or bad date. */
export function savedAgo(iso: string, now = Date.now()): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return "";
  const days = Math.max(0, Math.floor((now - then) / DAY));
  const [value, unit]: [number, Intl.RelativeTimeFormatUnit] =
    days >= 365 ? [Math.floor(days / 365), "year"]
    : days >= 30 ? [Math.floor(days / 30), "month"]
    : days >= 7 ? [Math.floor(days / 7), "week"]
    : [days, "day"];
  return `Saved ${relativeTime.format(-value, unit)}`;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string) {
  const node = document.createElement(tag);
  node.className = className;
  // textContent only: titles and descriptions come from arbitrary web pages.
  if (text !== undefined) node.textContent = text;
  return node;
}

function domainOf(url: string): string {
  return new URL(url).hostname.replace(/^www\./, "");
}

function categoryLabel(category: string): string {
  // "webpage" is the catch-all; showing it adds nothing.
  return category && category !== "webpage" ? category.replace(/-/g, " ") : "";
}

function media(link: LinkRecord, screenshotBase: string, domain: string): HTMLElement {
  const box = el("div", "card-media");

  if (!link.screenshot && !link.screenshotName) {
    box.classList.add("is-empty");
    box.append(el("span", "card-initial", domain.charAt(0)));
    return box;
  }

  const thumb = link.screenshot ? el("img", "card-thumb") : null;
  if (thumb) {
    thumb.src = link.screenshot;
    thumb.alt = "";
    box.append(thumb);
  }

  if (!link.screenshotName) {
    thumb?.classList.add("is-sharp");
    return box;
  }

  // The small inline thumbnail shows immediately (blurred), then the full-size
  // screenshot fades in over it. If that fails, fall back to the thumbnail.
  const full = el("img", "card-full");
  full.alt = "";
  full.decoding = "async";
  full.addEventListener("load", () => box.classList.add("is-loaded"), { once: true });
  full.addEventListener(
    "error",
    () => {
      full.remove();
      if (thumb) thumb.classList.add("is-sharp");
      else {
        box.classList.add("is-empty");
        box.append(el("span", "card-initial", domain.charAt(0)));
      }
    },
    { once: true },
  );
  full.src = `${screenshotBase}/${encodeURIComponent(link.screenshotName)}`;
  box.append(full);
  return box;
}

export function renderCard(link: LinkRecord, screenshotBase: string, index: number): HTMLElement {
  const domain = domainOf(link.url);

  const card = el("article", "card");
  card.style.setProperty("--i", String(index));

  const anchor = el("a", "card-link");
  anchor.href = link.url;
  anchor.target = "_blank";
  anchor.rel = "noopener noreferrer";

  const body = el("div", "card-body");
  const meta = el("p", "card-meta");
  meta.append(el("span", "", domain));
  const category = categoryLabel(link.category);
  if (category) meta.append(el("span", "card-category", category));
  body.append(meta, el("h2", "card-title", link.title || domain));
  if (link.description) body.append(el("p", "card-description", link.description));
  const saved = savedAgo(link.dateAdded);
  if (saved) body.append(el("p", "card-saved", saved));

  anchor.append(media(link, screenshotBase, domain), body);
  card.append(anchor);
  return card;
}
