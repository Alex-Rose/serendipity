# serendipity server

The hosted version of serendipity. People sign up with just a username and a
password, get their own page at a random three-word address, and add, edit
and remove links from the browser. Data lives in MongoDB.

The static site in [`../web`](../web) keeps working on its own: it needs no
server or database, and dashboards are managed from the command line. Both
versions show the same page, because this server reuses the static site's
page, cards and styles, and the [extractor](../extractor) that captures links.

## How it works

- **Sign up** (`/`): username and password, no email. Signing up creates the
  page at a three-word address (e.g. `/amber-orbit-tulip/`) and logs you in.
- **Manage** (`/manage`): paste a link to save it. The server opens it in a
  headless Chromium and saves its title, description, category and a
  screenshot. If the page can't be loaded, the link is saved anyway and you
  can give it a title yourself. Each link can be edited (title, description)
  or removed.
- **Your page** (`/<word-word-word>/`): the same page as the static site,
  showing a few random links. As with the static site, **the address is the
  only thing keeping a page private**: anyone who has it can see the page. It
  is never sent to the links you open, and pages are marked `noindex`.

## Running it

### With Docker (recommended)

From the repository root:

```sh
docker compose -f server/compose.yaml up --build
```

Then open <http://localhost:3000>. This runs the server and MongoDB 7, with
data in the `mongo-data` volume. The image includes Chromium for capturing
links. Set `PORT=8080` (or any other port) in front of the command to use a
different port.

### Without Docker

You need Node.js 22.18 or newer, which runs the TypeScript directly, and a
MongoDB server.

```sh
(cd extractor && npm install && npm run build)   # also downloads Chromium
cd server
npm install
npm run dev        # http://localhost:3000, reloads on changes
```

`npm run dev` serves the pages through Vite. For production:

```sh
npm run build      # type-check and build the pages into dist/
npm start          # NODE_ENV=production, serves dist/
```

To start a throwaway MongoDB for development:
`docker run -d --rm -p 127.0.0.1:27017:27017 mongo:7`.

## Configuration

All settings are environment variables:

| Variable                          | Default                                   | What                                                                                                                                  |
| --------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `MONGODB_URI`                     | `mongodb://localhost:27017/serendipity`   | MongoDB connection string. The database name comes from the URI.                                                                      |
| `PORT`                            | `3000`                                    | Port to listen on.                                                                                                                    |
| `NODE_ENV`                        |                                           | `production` serves the built pages from `dist/` and sends a strict Content-Security-Policy. Anything else runs Vite (development).  |
| `TRUST_PROXY`                     | off                                       | Set behind a reverse proxy, as Express's [`trust proxy`](https://expressjs.com/en/guide/behind-proxies.html): `true`, a hop count, or addresses such as `loopback`. Needed for correct client IPs (rate limiting) and HTTPS detection. |
| `COOKIE_SECURE`                   | `auto`                                    | Whether the session cookie is HTTPS-only. `auto` sets it when the request came over HTTPS; `true` / `false` force it.                |
| `SERENDIPITY_CAPTURE`             | `on`                                      | `off` skips the headless browser: links are saved with just their URL, and people add titles themselves.                              |
| `SERENDIPITY_CAPTURE_CONCURRENCY` | `2`                                       | How many pages are captured at once. Each capture is a Chromium instance, which needs a few hundred MB of memory.                     |
| `SERENDIPITY_ALLOW_PRIVATE_URLS`  | `off`                                     | Allow links to private network addresses (see Security). Only turn this on for a personal instance.                                   |

## Deploying

Run the Docker image, or the Node commands above, next to a MongoDB (your own,
or a hosted one such as MongoDB Atlas via `MONGODB_URI`). Put it behind a
reverse proxy that terminates HTTPS (Caddy, nginx, a cloud load balancer), and
set `TRUST_PROXY`. For example, with Caddy on the same host:

```
serendipity.example.com {
  reverse_proxy localhost:3000
}
```

and `TRUST_PROXY=loopback`.

The server keeps nothing on disk: everything, screenshots included, is in
MongoDB, so any number of instances can share a database. Rate limits are
kept in memory, per instance.

## Data

| Collection            | Contents                                                                                                   |
| --------------------- | ---------------------------------------------------------------------------------------------------------- |
| `users`               | Username (lowercase, unique), scrypt password hash, the page's three-word `slug` (unique), creation date. |
| `sessions`            | SHA-256 of each session token, the user, and an expiry (30 days). A TTL index removes expired sessions.   |
| `links`               | One document per saved link: the extractor's [link record](../README.md#the-link-record) plus `userId`.   |
| `screenshots` (GridFS)| Full-size screenshots as WebP (1280 px wide), named by each link's `screenshotName`.                      |

A page's `/<slug>/links.json` has the same format as a static dashboard's
`links.json`.

## API

All endpoints take and return JSON. Changes need the session cookie, which
the sign-up and login endpoints set.

| Method & path             | Body                          | What                                                                            |
| ------------------------- | ----------------------------- | ------------------------------------------------------------------------------- |
| `POST /api/register`      | `{ username, password }`      | Creates the account and its page and logs in. Returns `{ username, slug }`.     |
| `POST /api/login`         | `{ username, password }`      | Logs in. Returns `{ username, slug }`.                                          |
| `POST /api/logout`        |                               | Ends the session.                                                               |
| `GET /api/me`             |                               | The logged-in user: `{ username, slug }`.                                       |
| `GET /api/links`          |                               | Your links, newest first, each a link record plus its `id`.                     |
| `POST /api/links`         | `{ url }`                     | Captures and saves a link. Returns `{ link, warning? }`; the warning says when the page couldn't be captured. |
| `PATCH /api/links/:id`    | `{ title?, description? }`    | Edits a link.                                                                   |
| `DELETE /api/links/:id`   |                               | Removes a link and its screenshot.                                              |
| `GET /<slug>/links.json`  |                               | A page's links, public (anyone with the address).                               |
| `GET /<slug>/screenshots/:name` |                         | A link's full-size screenshot.                                                  |

## Security

- Passwords are hashed with scrypt. Sessions are random 256-bit tokens in an
  `HttpOnly`, `SameSite=Lax` cookie; only their hash is stored.
- Sign-up and login are rate-limited per IP address, and a login takes the
  same time whether or not the username exists.
- Changes are only accepted as JSON from the site's own origin, which a
  cross-site form can't send.
- Saving a link makes the server open that URL. So that nobody can use this
  to look inside your network, the server refuses links (and blocks every
  request the page makes, including redirects) to loopback, private,
  link-local and other non-public addresses. A DNS name that changes its
  answer between the check and the browser's own lookup could still get
  through, so don't run the server next to services that trust any caller on
  the local network, or use a firewall to block it from reaching them.
- Titles and descriptions come from arbitrary web pages and are only ever
  inserted as text. In production, a Content-Security-Policy allows only the
  site's own scripts, styles and fonts.
