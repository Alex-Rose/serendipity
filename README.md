# serendipity

Rediscover the things you saved.

**[See the demo →](https://alex-rose.github.io/serendipity/demo/)**

We all save links "for later": articles, recipes, movies to watch, books to
read, projects to try. Then we never look at them again. **serendipity** turns
your saved links into a web page of rich suggestions. Each visit shows a
random handful, so you stumble back onto things you once found worth keeping.

## Status

Early days. What exists today:

- **Extractor (`extractor/`):** takes a URL, loads it in a headless browser,
  and captures it as a standard JSON record with a title, description,
  category and a screenshot thumbnail. It can add links straight into a
  dashboard.
- **Web page (`web/`):** a static site that shows a few random links from a
  dashboard as calm, rich cards, with a "Show me others" button.

Planned:

- **Category-specific metadata** for the kinds of links we decide to support
  (movies, books, git / FOSS projects, ...).
- Creating and managing dashboards from the web, rather than the command line.

## Repository layout

| Path          | What                                                               |
| ------------- | ------------------------------------------------------------------ |
| `extractor/`  | CLI that captures a URL as a link record (TypeScript, Playwright). |
| `web/`        | Static site that displays dashboards (Vite, TypeScript).           |
| `.githooks/`  | Git hooks shared by the whole repo (secret / PII scanning).        |

## Dashboards

Each person gets a dashboard at a random three-word address, such as
`https://your-site.example/amber-orbit-tulip/`. A dashboard is a folder:

```
web/dashboards/amber-orbit-tulip/
├── links.json      { "version": 1, "links": [ <link record>, ... ] }
└── screenshots/    full-size screenshots, named by each record's screenshotName
```

The words come from the [EFF large wordlist](https://www.eff.org/dice)
(7,772 words once the hyphenated ones are removed), picked with a
cryptographically secure random generator. That makes about 4.7 × 10¹¹
possible addresses (~39 bits), enough that nobody stumbles onto a dashboard
by guessing.

There is no login: **the address is the only thing keeping a dashboard
private.** The site never sends it to the links you open (no referrer), marks
dashboards `noindex`, and never lists them. On your server, also disable
directory listings and keep dashboards out of any sitemap.

Dashboards are personal data, so `web/dashboards/` is ignored by git, except
for the `demo` dashboard, which is built from public pages.

## The link record

Every saved link is described by the same JSON object. All fields are always
present; any of them may be an empty string when the page doesn't provide it.

```json
{
  "url": "https://github.com/lovell/sharp",
  "title": "GitHub - lovell/sharp: High performance Node.js image processing, ...",
  "description": "High performance Node.js image processing, ...",
  "category": "webpage",
  "dateAdded": "2026-09-27T13:04:14.313Z",
  "screenshotName": "github-com-lovell-sharp-1790514254313.png",
  "screenshot": "data:image/jpeg;base64,/9j/2wBD...",
  "metadata": {}
}
```

| Field            | Description                                                                         |
| ---------------- | ----------------------------------------------------------------------------------- |
| `url`            | Final URL after redirects.                                                          |
| `title`          | `og:title`, falling back to the page `<title>`.                                     |
| `description`    | The page's short summary: `og:description`, falling back to `<meta name="description">`. |
| `category`       | Lowercase category derived from the page's schema.org data (`recipe`, `movie`, `book`, `article`, `webpage`, ...). |
| `dateAdded`      | ISO 8601 UTC timestamp of when the record was created.                              |
| `screenshotName` | File name of the full-size PNG screenshot in the screenshot directory.              |
| `screenshot`     | Small JPEG thumbnail of the page (base64 data URI).                                 |
| `metadata`       | Category-specific fields (e.g. `author`, `published`). Empty object when none.      |

## Usage

Both parts require Node.js.

### Capture links (extractor)

`npm install` also downloads Playwright's Chromium.

```sh
cd extractor
npm install
npm run build

node dist/index.js https://example.com                 # JSON record to stdout
node dist/index.js https://example.com -f markdown     # markdown link card
node dist/index.js https://example.com -o link.json    # write to a file
node dist/index.js https://example.com -d ../web/dashboards/<id>   # add to a dashboard
node dist/index.js -i urls.txt -d ../web/dashboards/<id>           # add many at once
```

Useful options (see `--help` for all):

- `-i, --input <file>`: capture every URL in a file, one per line. All lines
  are checked before anything is fetched: blank lines and `# comments` are
  skipped, lines that aren't `http(s)` URLs are skipped with a warning, and
  duplicates are dropped. A page that fails to load doesn't stop the rest;
  the exit code is 1 if any failed. Without `-d`, the output is a JSON array.

- `-d, --dashboard <dir>`: add the link to a dashboard's `links.json` and save
  its screenshot in the dashboard's `screenshots/`. Links already in the
  dashboard are skipped.
- `-f, --format json|markdown|raw`: `raw` dumps everything extracted from the
  page, which helps when designing category-specific metadata.
- `--screenshot-dir <dir>`: where full-size screenshots go (default
  `./screenshots`).
- `--no-save-screenshot`: skip the full-size file; `screenshotName` is empty.
- `--thumbnail-width <px>`: width of the base64 thumbnail (default `400`).

If a site shows a bot-check page, a visible browser window opens so you can
solve it. Pass `--no-interactive-fallback` to fail instead.

### Show them (web)

```sh
cd web
npm install
npm run new-dashboard   # creates dashboards/<word-word-word>/ and prints its URL path
npm run dev             # http://localhost:5173/demo/
npm run build           # static site in web/dist/
npm run preview         # serve the built site locally
```

`npm run build` produces a fully static site: the landing page, shared assets
in `assets/`, and one folder per dashboard with its page, `links.json` and
screenshots. Upload `web/dist/` to any static host (a web server, Azure Blob
Storage static website, ...). Rebuild after creating a dashboard. Adding
links to an existing dashboard only changes its `links.json`, so copying that
folder is enough.

To serve the site under a sub-path, set `SERENDIPITY_BASE` when building, e.g.
`SERENDIPITY_BASE=/serendipity/ npm run build`.

Dashboards are read from `web/dashboards/` by default. Set
`SERENDIPITY_DASHBOARDS=/path/to/dashboards` to keep them elsewhere.

Links need their trailing slash (`/amber-orbit-tulip/`). Most web servers
redirect to it automatically; `vite preview` doesn't.

### Demo on GitHub Pages

The [demo](https://alex-rose.github.io/serendipity/demo/) is the `demo`
dashboard, built and published by `.github/workflows/pages.yml` on every push
to `main` that touches `web/`. The workflow builds from what's in git, and
only the demo dashboard is committed, so personal dashboards are never
published. Its screenshots are committed as WebP to keep the repo small.

## Development

A pre-commit hook scans staged changes with [gitleaks](https://github.com/gitleaks/gitleaks)
and blocks commits that contain credentials or personal data (emails, phone
numbers, SSNs, card numbers). Rules are in `.gitleaks.toml`.

```sh
mise install                  # installs the pinned gitleaks version (see mise.toml)
(cd extractor && npm install) # also points git at .githooks/ via the "prepare" script
```

Without mise, install gitleaks any other way and run
`git config core.hooksPath .githooks`. The hook refuses to commit if gitleaks
is missing.

## License

[MIT](LICENSE). The dashboard wordlist is the
[EFF large wordlist](https://www.eff.org/dice), licensed
[CC BY 3.0 US](https://creativecommons.org/licenses/by/3.0/us/).
