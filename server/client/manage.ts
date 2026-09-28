import "../../web/src/fonts.ts";
import "../../web/src/style.css";
import "./app.css";
import { savedAgo } from "../../web/src/card.ts";
import type { LinkRecord } from "../../web/src/links.ts";
import { api, ApiError, type Me } from "./api.ts";

interface Link extends LinkRecord {
  id: string;
}

const list = document.getElementById("link-list") as HTMLUListElement;
const empty = document.getElementById("empty")!;
const count = document.getElementById("link-count")!;
const status = document.getElementById("status")!;
const addForm = document.getElementById("add-form") as HTMLFormElement;
const addUrl = document.getElementById("add-url") as HTMLInputElement;
const addSubmit = document.getElementById("add-submit") as HTMLButtonElement;
const pageLink = document.getElementById("page-link") as HTMLAnchorElement;
const copyButton = document.getElementById("copy-link") as HTMLButtonElement;

let links: Link[] = [];

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = "", text?: string) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  // textContent only: titles and descriptions come from arbitrary web pages.
  if (text !== undefined) node.textContent = text;
  return node;
}

function button(label: string, className: string, onClick: () => void) {
  const node = el("button", className, label);
  node.type = "button";
  node.addEventListener("click", onClick);
  return node;
}

const domainOf = (url: string) => new URL(url).hostname.replace(/^www\./, "");

function setStatus(message: string, tone: "info" | "error" = "info") {
  status.textContent = message;
  status.classList.toggle("is-error", tone === "error");
}

/** On a 401 the session is gone (logged out elsewhere, expired): back to the start. */
function handleError(err: unknown) {
  if (err instanceof ApiError && err.status === 401) {
    location.assign("/#login");
    return;
  }
  setStatus((err as Error).message, "error");
}

// ---------- Rendering ----------

function thumbnail(link: Pick<LinkRecord, "url" | "screenshot">): HTMLElement {
  const box = el("div", "link-thumb");
  if (link.screenshot) {
    const img = el("img");
    img.src = link.screenshot;
    img.alt = "";
    box.append(img);
  } else {
    box.append(el("span", "link-initial", domainOf(link.url).charAt(0)));
  }
  return box;
}

function viewItem(link: Link): HTMLLIElement {
  const item = el("li", "link-item");
  item.dataset.id = link.id;

  const body = el("div", "link-body");
  const title = el("a", "link-title", link.title || domainOf(link.url));
  title.href = link.url;
  title.target = "_blank";
  title.rel = "noopener noreferrer";
  const meta = el("p", "link-meta");
  meta.append(el("span", "", domainOf(link.url)));
  const saved = savedAgo(link.dateAdded);
  if (saved) meta.append(el("span", "", saved));
  body.append(title, meta);
  if (link.description) body.append(el("p", "link-description", link.description));

  const actions = el("div", "link-actions");
  actions.append(
    button("Edit", "text-button", () => item.replaceWith(editItem(link))),
    button("Remove", "text-button text-button-danger", () => remove(link, item)),
  );

  item.append(thumbnail(link), body, actions);
  return item;
}

function editItem(link: Link): HTMLLIElement {
  const item = el("li", "link-item is-editing");
  item.dataset.id = link.id;

  const form = el("form", "link-edit");
  const titleField = el("label", "field");
  const titleInput = el("input");
  titleInput.name = "title";
  titleInput.maxLength = 300;
  titleInput.value = link.title;
  titleInput.placeholder = domainOf(link.url);
  titleField.append(el("span", "", "Title"), titleInput);

  const descriptionField = el("label", "field");
  const descriptionInput = el("textarea");
  descriptionInput.name = "description";
  descriptionInput.maxLength = 1000;
  descriptionInput.rows = 3;
  descriptionInput.value = link.description;
  descriptionField.append(el("span", "", "Description"), descriptionInput);

  const save = el("button", "button button-primary", "Save");
  save.type = "submit";
  const actions = el("div", "link-edit-actions");
  actions.append(save, button("Cancel", "button", () => item.replaceWith(viewItem(link))));
  form.append(titleField, descriptionField, actions);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    save.disabled = true;
    try {
      const updated = await api<Link>(`/links/${link.id}`, {
        method: "PATCH",
        body: { title: titleInput.value, description: descriptionInput.value },
      });
      links = links.map((l) => (l.id === updated.id ? updated : l));
      item.replaceWith(viewItem(updated));
      setStatus("Saved.");
    } catch (err) {
      save.disabled = false;
      handleError(err);
    }
  });

  item.append(thumbnail(link), form);
  queueMicrotask(() => titleInput.focus());
  return item;
}

function pendingItem(url: string): HTMLLIElement {
  const item = el("li", "link-item is-pending");
  const body = el("div", "link-body");
  body.append(el("p", "link-title", domainOf(url)), el("p", "link-meta", "Taking a snapshot of the page…"));
  item.append(thumbnail({ url, screenshot: "" }), body);
  return item;
}

function updateCounts() {
  count.textContent = links.length ? `(${links.length})` : "";
  empty.hidden = links.length > 0 || list.querySelector(".is-pending") !== null;
}

function renderAll() {
  list.replaceChildren(...links.map(viewItem));
  updateCounts();
}

// ---------- Actions ----------

async function remove(link: Link, item: HTMLLIElement) {
  if (!confirm(`Remove “${link.title || domainOf(link.url)}” from your page?`)) return;
  try {
    await api(`/links/${link.id}`, { method: "DELETE" });
    links = links.filter((l) => l.id !== link.id);
    item.remove();
    updateCounts();
    setStatus("Removed.");
  } catch (err) {
    handleError(err);
  }
}

addForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  let url = addUrl.value.trim();
  if (!url) return;
  // People paste "example.com/thing" without the scheme; assume https.
  if (!/^[a-z][a-z0-9+.-]*:/i.test(url)) url = `https://${url}`;
  try {
    new URL(url);
  } catch {
    setStatus("That doesn't look like a web address.", "error");
    return;
  }

  addSubmit.disabled = true;
  addUrl.value = "";
  setStatus("");
  const pending = pendingItem(url);
  list.prepend(pending);
  updateCounts();
  try {
    const { link, warning } = await api<{ link: Link; warning?: string }>("/links", { method: "POST", body: { url } });
    links.unshift(link);
    pending.replaceWith(viewItem(link));
    setStatus(warning ?? "Saved to your page.", warning ? "error" : "info");
  } catch (err) {
    pending.remove();
    addUrl.value = url;
    handleError(err);
  } finally {
    addSubmit.disabled = false;
    updateCounts();
    addUrl.focus();
  }
});

document.getElementById("logout")!.addEventListener("click", async () => {
  await api("/logout", { method: "POST" }).catch(() => {});
  location.assign("/");
});

copyButton.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(pageLink.href);
    copyButton.textContent = "Copied";
  } catch {
    copyButton.textContent = "Couldn't copy";
  }
  setTimeout(() => (copyButton.textContent = "Copy link"), 2000);
});

// ---------- Start ----------

try {
  const [me, all] = await Promise.all([api<Me>("/me"), api<Link[]>("/links")]);
  document.getElementById("username")!.textContent = me.username;
  pageLink.href = `/${me.slug}/`;
  pageLink.textContent = `${location.host}/${me.slug}/`;
  links = all;
  renderAll();
  addUrl.focus();
} catch (err) {
  handleError(err);
}
