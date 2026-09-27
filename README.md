# serendipity

Rediscover the things you saved.

We all save links "for later": articles, recipes, movies to watch, books to
read, projects to try. Then we never look at them again. **serendipity** turns
your saved links into a web page of rich suggestions. Each visit shows a
random handful, so you stumble back onto things you once found worth keeping.

## Status

Early days. What exists today:

- **Extractor (`extractor/`):** takes a URL, loads it in a headless browser,
  and captures it as a standard JSON record with a title, description,
  category and a screenshot thumbnail.

Planned:

- **Suggestions page:** a web page / service showing a random subset of
  saved links as rich cards.
- **Category-specific metadata** for the kinds of links we decide to support
  (movies, books, git / FOSS projects, ...).
- A way to save links and keep the collection.

## Repository layout

| Path          | What                                                          |
| ------------- | ------------------------------------------------------------- |
| `extractor/`  | CLI that captures a URL as a link record (TypeScript, Playwright). |
| `.githooks/`  | Git hooks shared by the whole repo (secret / PII scanning).   |

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

The extractor lives in `extractor/`. It requires Node.js, and `npm install`
also downloads Playwright's Chromium.

```sh
cd extractor
npm install
npm run build

node dist/index.js https://example.com                 # JSON record to stdout
node dist/index.js https://example.com -f markdown     # markdown link card
node dist/index.js https://example.com -o link.json    # write to a file
```

Useful options (see `--help` for all):

- `-f, --format json|markdown|raw`: `raw` dumps everything extracted from the
  page, which helps when designing category-specific metadata.
- `--screenshot-dir <dir>`: where full-size screenshots go (default
  `./screenshots`).
- `--no-save-screenshot`: skip the full-size file; `screenshotName` is empty.
- `--thumbnail-width <px>`: width of the base64 thumbnail (default `400`).

If a site shows a bot-check page, a visible browser window opens so you can
solve it. Pass `--no-interactive-fallback` to fail instead.

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

[MIT](LICENSE)
