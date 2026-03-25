# PLAN.md — Comedy Store Website

Static GitHub Pages site for browsing and searching Comedy Store episode transcriptions.

---

## Phase 1: Project Scaffold

**Goal:** Working build pipeline that produces a deployable `static/` directory.

### Directory layout
```
static/                     ← GitHub Pages root (via Actions)
  index.html
  style.css                 ← hand-written, committed
  main.js                   ← compiled bundle, committed
  data/
    episodes.json           ← episode metadata only, generated + committed
    subtitles/
      פרק_001.json          ← per-episode subtitle lines, generated + committed
      פרק_002.json
      ...

src/
  main.ts                   ← entry point, routing
  types.ts                  ← shared TypeScript types
  search.ts                 ← brute-force search logic
  views/
    list.ts                 ← episode list view
    results.ts              ← search results view
    episode.ts              ← single episode view
  highlight.ts              ← CSS Highlights API wrapper
  loader.ts                 ← data fetching + cache

scripts/
  build_data.py             ← reads files/, writes static/data/

package.json
tsconfig.json
.github/workflows/deploy.yml
```

### Tooling
- **esbuild** for bundling + transpiling TypeScript (`npm run build:ts`)
- **`npm run dev`** — esbuild watch mode + `npx serve static`
- GitHub Actions deploy workflow: on push to `main`, run `npm run build`, push `static/` to gh-pages branch

### `package.json` scripts
```json
"build:data": "python scripts/build_data.py",
"build:ts":   "esbuild src/main.ts --bundle --outfile=static/main.js --target=es2020",
"build":      "npm run build:data && npm run build:ts",
"dev":        "esbuild src/main.ts --bundle --outfile=static/main.js --watch & npx serve static"
```

---

## Phase 2: Data Layer

**Goal:** Lightweight `episodes.json` for fast initial load, plus per-episode subtitle files loaded on demand.

### `scripts/build_data.py`

Two outputs:

**1. `static/data/episodes.json`** — metadata array, one object per episode:
```json
[
  { "id": "פרק_001", "title": "פרק 1 — 21.12.08", "num": 1, "subtitle_file": "subtitles/פרק_001.json" },
  { "id": "comedy_2020_ep1", "title": "Comedy Store 2020 — פרק 1", "num": 1001, "subtitle_file": "subtitles/comedy_2020_ep1.json" },
  ...
]
```
`num` is used for sort order; `Comedy_Store_2020` episodes get a high base number (1001+) to sort after regular episodes.

**2. `static/data/subtitles/<id>.json`** — one file per episode, array of lines:
```json
[
  { "start": 4.07, "end": 5.15, "text": "לא, נמאס" },
  ...
]
```

**SRT parsing:** Each block: index line → `HH:MM:SS,mmm --> HH:MM:SS,mmm` → one or more text lines. Timestamps converted to seconds (float). Multi-line subtitle blocks join with a space. Leading/trailing whitespace stripped.

**Episode identity:**
- `Comedy_Store_2020/` → per-file: `comedy_store_2020_ep1.srt` → id `comedy_2020_ep1`, title `Comedy Store 2020 — פרק 1`
- `פרק_NNN[-suffix]/` → id from directory name, title `פרק NNN` with optional human-readable suffix

### TypeScript types (`types.ts`)
```ts
interface EpisodeMetadata {
  id: string;
  title: string;
  num: number;          // sort order
  subtitle_file: string;
}

interface Line {
  start: number;        // seconds
  end: number;         // seconds
  text: string;
}

type EpisodeIndex = EpisodeMetadata[];
type EpisodeLines = Line[];
```

### `loader.ts`
- `loadIndex(): Promise<EpisodeIndex>` — fetches `episodes.json` once; cached
- `loadEpisode(id: string): Promise<EpisodeLines>` — fetches `subtitles/<id>.json`; per-episode cache
- `loadAll(ids: string[]): Promise<Map<string, EpisodeLines>>` — fetches all subtitle files in parallel; used when search is first triggered; shows progress

---

## Phase 3: UI & Design

**Goal:** RTL Hebrew SPA with three views, light/dark theme, minimal CSS.

### CSS

Hand-written `static/style.css` using:
- CSS custom properties: `--bg`, `--surface`, `--surface-alt`, `--text`, `--text-muted`, `--accent`, `--border`, `--highlight-bg`, `--highlight-text`
- `[data-theme="dark"]` on `<html>` overrides light defaults; `@media (prefers-color-scheme: dark)` sets the initial default
- `direction: rtl; font-family: system-ui` on `body`
- Centered single-column layout: `max-width: 800px; margin: 0 auto`
- Target ~150–200 lines total

CSS Highlights API declaration:
```css
::highlight(search-match) {
  background-color: var(--highlight-bg);
  color: var(--highlight-text);
}
```

### `index.html` structure
```html
<html lang="he" dir="rtl">
<head>...</head>
<body>
  <header>
    <h1>קומדי סטור</h1>
    <nav id="breadcrumb"></nav>          <!-- populated by router -->
    <button id="theme-toggle" aria-label="החלף ערכת צבעים"></button>
  </header>

  <div id="search-bar">
    <input id="query" type="search" placeholder="חפש בתמלילים...">
    <span id="search-status"></span>     <!-- "טוען...", "N תוצאות", "" -->
  </div>

  <main id="view"></main>               <!-- swapped by router -->
</body>
</html>
```

The `#search-bar` is always visible across all views. `#view` is replaced on navigation.

### Views

**List view** (default, `#`)
- Grid of episode cards, sorted by `num`
- Each card: episode title, subtitle line count
- Typing in `#query` filters cards by title match (immediate, no subtitle load needed)
- When subtitles finish loading in background, cards also reflect content matches
- Clicking a card → Episode view

**Search results view** (`#search/<encoded-query>`)
- Triggered by pressing Enter in `#query` or when query length ≥ 3 and subtitles are loaded
- Two sections stacked vertically:
  1. **Episode list** (compact, horizontal scroll or wrapping chips): episodes that have matches; clicking one jumps to that episode's section below or navigates to Episode view
  2. **Results** grouped by episode: each group shows episode title + up to N matching lines, each with 1 line of context above and below (if available)
- Each match line is a link → Episode view scrolled to that line with query highlighted
- `#breadcrumb` shows: `רשימת פרקים ← תוצאות חיפוש`

**Episode view** (`#episode/<id>` or `#episode/<id>/<line-index>`)
- Loads and renders all lines for the episode as a scrollable list
- Each line: timestamp (formatted as `MM:SS` or `HH:MM:SS`) + text
- If `<line-index>` is present, scroll to that line on render
- If navigated from search results: breadcrumb shows back link to results, and query matches are highlighted via CSS Highlights API
- Local filter: typing in `#query` while in episode view filters visible lines and refreshes highlights (does not navigate away)
- `#breadcrumb` shows: `רשימת פרקים ← תוצאות חיפוש ← <episode title>` or `רשימת פרקים ← <episode title>`

---

## Phase 4: Search Logic

**Goal:** Fast brute-force substring search across all in-memory subtitle data.

### Loading strategy
- `episodes.json` fetched immediately on page load
- Subtitle files loaded in background after index is ready (`loadAll`)
- `#search-status` shows loading progress: `טוען תמלילים... (42/109)`
- Search is enabled once all subtitles are loaded; episode list filtering by title is available immediately

### `search.ts`
```ts
interface LineMatch {
  line: Line;
  lineIndex: number;
  contextBefore: Line | null;
  contextAfter: Line | null;
}

interface EpisodeMatches {
  episode: EpisodeMetadata;
  matches: LineMatch[];
}

function search(
  index: EpisodeIndex,
  subtitles: Map<string, EpisodeLines>,
  query: string
): EpisodeMatches[]
```

- Normalise: `query.trim().toLowerCase()`; skip if length < 2
- For each episode → each line: `line.text.toLowerCase().includes(query)`
- On match: capture `lines[i-1]` and `lines[i+1]` as context (null at boundaries)
- Return grouped array sorted by `episode.num`

### Highlights (`highlight.ts`)
```ts
function applyHighlights(query: string, containerEl: Element): void
function clearHighlights(): void
```

- Walk text nodes inside `containerEl` with a `TreeWalker`
- For each text node, find all occurrences of `query` (case-insensitive)
- Create a `Range` for each occurrence
- `CSS.highlights.set('search-match', new Highlight(...allRanges))`
- `clearHighlights()` → `CSS.highlights.delete('search-match')`
- Note: CSS Highlights API is Chrome 105+, Firefox 117+, Safari 17.2+. Show a static yellow `background-color` fallback via `<mark>` for older browsers (feature-detect with `'highlights' in CSS`).

### Performance notes
- At ~109 episodes × ~300 lines × ~20 chars average, the in-memory scan is ~650K string comparisons — well under 10ms on modern hardware
- No debounce needed initially; add 80ms debounce if laggy
- DOM update: clear and re-render `#view` only; do not diff

---

## Phase 5: Hash Routing

**Goal:** Browser back/forward works naturally; links are shareable.

### Router (`main.ts`)
- Listen to `hashchange` and initial load
- Parse `window.location.hash`:
  - `""` or `"#"` → List view
  - `"#search/<query>"` → Search results view (decode query)
  - `"#episode/<id>"` → Episode view, no specific line
  - `"#episode/<id>/<lineIndex>"` → Episode view, scroll to line
- Store last search query so the input is restored when navigating back to list/results
- Search input changes in episode view do not change the hash; they filter locally

---

## Phase 6: GitHub Actions Deployment

Since GitHub Pages only supports `/` or `/docs` as branch-based source, use a Actions workflow:

```yaml
# .github/workflows/deploy.yml
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm ci && npm run build
      - uses: peaceiris/actions-gh-pages@v4
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          publish_dir: ./static
```

---

## Out of scope for now

- Filtering by season
- Episode metadata (air date, guest names, descriptions)
- Linking timestamps to YouTube or video files
- OCR-based transcription corrections
- Merging adjacent chapters
