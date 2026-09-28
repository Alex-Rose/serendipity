import "../../web/src/fonts.ts";
import "../../web/src/style.css";
import "./app.css";
import { api, type Me } from "./api.ts";

type Mode = "register" | "login";

const form = document.getElementById("auth") as HTMLFormElement;
const error = document.getElementById("auth-error")!;
const submit = document.getElementById("auth-submit") as HTMLButtonElement;
const hint = document.getElementById("auth-hint")!;
const password = form.elements.namedItem("password") as HTMLInputElement;
const tabs = [...form.querySelectorAll<HTMLButtonElement>("[data-mode]")];

let mode: Mode = location.hash === "#login" ? "login" : "register";

function setMode(next: Mode) {
  mode = next;
  for (const tab of tabs) tab.setAttribute("aria-selected", String(tab.dataset.mode === mode));
  submit.textContent = mode === "register" ? "Create my page" : "Log in";
  password.autocomplete = mode === "register" ? "new-password" : "current-password";
  hint.hidden = mode === "login";
  error.hidden = true;
}

function showError(message: string) {
  error.textContent = message;
  error.hidden = false;
}

for (const tab of tabs) tab.addEventListener("click", () => setMode(tab.dataset.mode as Mode));

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = new FormData(form);
  const username = String(data.get("username") ?? "").trim();
  const pass = String(data.get("password") ?? "");

  if (mode === "register") {
    if (!/^[A-Za-z0-9_-]{3,32}$/.test(username)) return showError("Pick a username of 3 to 32 letters, numbers, - or _.");
    if (pass.length < 8) return showError("Use a password of at least 8 characters.");
  } else if (!username || !pass) {
    return showError("Enter your username and password.");
  }

  submit.disabled = true;
  error.hidden = true;
  try {
    await api<Me>(mode === "register" ? "/register" : "/login", { body: { username, password: pass }, method: "POST" });
    location.assign("/manage");
  } catch (err) {
    showError((err as Error).message);
    submit.disabled = false;
  }
});

setMode(mode);
