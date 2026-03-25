# PLAN.md — Comedy Store Website

Static GitHub Pages site for browsing and searching Comedy Store episode transcriptions.

---

## Directory layout

```
static/                          ← GitHub Pages root (deployed via Actions)
  index.html                     ← single HTML file, hand-written, committed
  style.css                      ← hand-written, committed
  main.js                        ← compiled bundle (esbuild output), committed
  data/
    episodes.json                ← episode metadata only, generated + committed
    subtitles/
      פרק_001-21_12_08.json      ← per-episode subtitle lines, generated + committed
      ...

src/
  main.ts                        ← entry point, app state, routing, event wiring
  types.ts                       ← shared TypeScript types
  utils.ts                       ← assert / ensure / escHtml helpers
  search.ts                      ← search logic, display entry construction
  sidebar.ts                     ← sidebar render + live state updates
  highlight.ts                   ← CSS Custom Highlights API wrapper
  loader.ts                      ← fetch + cache for episodes.json and subtitle files
  views/
    list.ts                      ← welcome view
    results.ts                   ← search results view
    episode.ts                   ← episode transcript view

scripts/
  build_data.py                  ← walks files/, writes static/data/
  convert_encoding.py            ← one-off: converted SRT/JSON files from latin-1 to UTF-8

package.json
tsconfig.json
.github/workflows/deploy.yml
```

---

## Build commands

```bash
npm install                  # install esbuild, concurrently, serve
npm run build:data           # python scripts/build_data.py → writes static/data/
npm run build:ts             # esbuild src/main.ts → static/main.js (minified)
npm run build                # both of the above
npm run dev                  # esbuild watch + serve static/ on localhost:3000
```

TypeScript version: 6.x. esbuild target: `es2020`.

---

## Data layer

### `scripts/build_data.py`

Walks `files/` and produces two outputs.

**`static/data/episodes.json`** — metadata array sorted by `num`:
```json
[
  { "id": "פרק_001-21_12_08", "title": "פרק 1 — 21.12.08", "num": 1,    "subtitle_file": "subtitles/פרק_001-21_12_08.json" },
  { "id": "comedy_2020_ep1",  "title": "Comedy Store 2020 — פרק 1",     "num": 10001, "subtitle_file": "subtitles/comedy_2020_ep1.json" }
]
```
`num` is used for sort order only. Regular episodes use their episode number (1–108); `Comedy_Store_2020` specials use 10001–10005 to sort after regular episodes.

**`static/data/subtitles/<id>.json`** — array of lines:
```json
[{ "start": 4.07, "end": 5.15, "text": "לא, נמאס" }, ...]
```

SRT parsing: index line → `HH:MM:SS,mmm --> HH:MM:SS,mmm` → text line(s). Timestamps converted to seconds (float). Multi-line blocks joined with a space.

`Comedy_Store_2020/` is handled specially: only files matching `comedy_store_2020_ep*.srt` are processed.

### Encoding conversion (one-off)

`scripts/convert_encoding.py` was run once to convert 106 SRT/JSON files under `files/` from latin-1 to UTF-8. Tried encodings in order: `utf-8`, `utf-8-sig`, `windows-1255`, `cp1255`, `iso-8859-8`, `latin-1`. Result committed to `main`.

### `src/loader.ts`

- `loadIndex()` — fetches `episodes.json` once; result cached in module-level variable.
- `loadEpisode(episode)` — fetches `subtitles/<id>.json`; per-episode cache via `Map`.
- `loadAll(episodes, onProgress?)` — fetches all subtitle files in parallel via `Promise.all`, calling `onProgress(loaded, total)` after each resolves.
- `getCachedSubtitles()` — returns the subtitle cache `Map` for synchronous access after loading.

### Utilities (`src/utils.ts`)

```ts
assert(condition, message)         // asserts condition — throws Error if falsy
ensure(val, description)           // unwraps T | null | undefined → T via assert
escHtml(s)                         // escapes &, <, >, " for safe HTML insertion
```

### TypeScript types (`src/types.ts`)

```ts
interface EpisodeMetadata { id: string; title: string; num: number; subtitle_file: string; }
interface Line            { start: number; end: number; text: string; }
type EpisodeIndex = EpisodeMetadata[];
type EpisodeLines = Line[];

interface DisplayEntry {
  startIdx: number;          // first line index to display (match − context)
  endIdx: number;            // last line index to display  (match + context)
  matchIndices: Set<number>; // which lines within the range are actual matches
}

interface EpisodeSearchResult {
  episode: EpisodeMetadata;
  entries: DisplayEntry[];   // one per match (or merged, see MERGE_CONTEXT_ENTRIES)
  totalMatches: number;      // total matching lines before context expansion
}
```

---

## UI layout

Two-pane full-width layout using flexbox:

```
┌─────────────────────────────────────────────────────┐
│ top-bar: h1 · [search box + clear btn]       · [🌙] │  ← flex-shrink:0, never scrolls
│ breadcrumb                                           │
├───────────────────────────────────┬─────────────────┤
│                                   │                 │
│  main-pane (flex:1, overflow-y)   │  sidebar        │  ← both scroll independently
│                                   │  (260px, RTL    │
│                                   │   = right side) │
└───────────────────────────────────┴─────────────────┘
```

In RTL flexbox, the first flex child (`#sidebar`) renders on the right; `#main-pane` is on the left. Both have `overflow-y: auto` for independent scrolling. `body` has `overflow: hidden` to prevent double scrollbars.

### Theme

Light/dark toggle button (`#theme-toggle`) at the far left (`margin-inline-start: auto`). Persisted to `localStorage`. Default follows `prefers-color-scheme`. `[data-theme="dark"]` on `<html>` enables dark overrides.

CSS custom properties: `--bg`, `--surface`, `--surface-alt`, `--text`, `--text-muted`, `--accent`, `--border`, `--highlight-bg`, `--highlight-text`, `--radius`.

### Search box

`#search-bar` is `width: 30%; flex-shrink: 0`. Inside it is `.query-wrap` (relative-positioned), containing:
- `#query` — RTL text input, `flex: 1`, padded on the left to leave room for the clear button.
- `#query-clear` — `✕` button absolutely positioned on the left side of the input. Starts `hidden`; shown/hidden via JS as the input value changes. Click clears the input and dispatches an `input` event.

Native webkit search cancel button suppressed via `#query::-webkit-search-cancel-button { display: none }`.

---

## Views

### Welcome view (`src/views/list.ts`)

Rendered when the hash is empty. Shows a single prompt string. Clearing the search from any other view returns here.

### Search results view (`src/views/results.ts`)

Rendered when a query of `MIN_QUERY_LENGTH` (2) or more characters is active and subtitles are loaded.

Structure per episode with matches:
- Header: episode title (clickable → episode view) + match count.
- Up to `MAX_ENTRIES_PER_GROUP` (3) `DisplayEntry` blocks, each showing lines `startIdx..endIdx` inclusive. Match lines get class `match`; context lines get class `context`.
- If more entries exist: a hidden `.entries-overflow` div + "show more" button that reveals them on click.
- Clicking any result line navigates to the full episode view at that line index.

CSS Highlights API (`applyHighlights`) is called on `mainPaneEl` after every results render so query matches are highlighted throughout the result text.

### Episode view (`src/views/episode.ts`)

`renderEpisode(container, episode, lines, query, scrollToLine?)`:
- Renders all lines as `.transcript-line` divs, each with a `.ts` timestamp and `.text` span.
- Calls `applyQueryFilter` to hide non-matching lines and apply highlights (if query is non-empty).
- If `scrollToLine` is set, adds `.highlighted` class to that line and scrolls it into view via `requestAnimationFrame` + `scrollIntoView({ behavior: "smooth", block: "center" })`.

`applyQueryFilter(list, lineEls, lines, query)`:
- Clears highlights, then toggles `.hidden` on each line based on whether it matches the query.
- Re-applies highlights over the visible content.
- Called on initial render and live as the user types while in episode view.

When navigating to an episode from a search result (i.e., `route.lineIndex` is set), the query is cleared (`queryEl.value = ""`), so the full unfiltered episode is displayed and the transcript scrolls to the target line.

### Sidebar (`src/sidebar.ts`)

`renderSidebar(container, index)` — creates the `<ul>` once on page load. Each `<li>` holds the episode title and navigates to that episode on click.

`updateSidebarState(container, subtitles, query, currentEpisodeId?)` — called on every route change and every keystroke. Toggles three CSS classes on each `<li>` without touching the DOM structure:
- `.current` — the currently viewed episode (highlighted).
- `.has-match` — episode has at least one line matching the query (bold).
- `.no-match` — episode has no match (reduced opacity).

Scrolls the current episode into view within the sidebar using `scrollIntoView({ block: "nearest" })`.

---

## Search logic (`src/search.ts`)

### Constants (all exported)

| Constant | Value | Effect |
|---|---|---|
| `MIN_QUERY_LENGTH` | `2` | Minimum characters before search activates |
| `CONTEXT_LINES` | `1` | Lines shown above and below each match |
| `MAX_ENTRIES_PER_GROUP` | `3` | Entries shown per episode before "show more" |
| `MAX_MERGED_LINES` | `10` | Max lines in a merged entry (only relevant when merging is on) |
| `MERGE_CONTEXT_ENTRIES` | `false` | Feature flag — see below |

### `MERGE_CONTEXT_ENTRIES` flag

When `false` (default): each matching line produces its own independent `DisplayEntry` with `CONTEXT_LINES` lines of context above and below. Adjacent matches may produce overlapping context windows but are shown as separate entries.

When `true`: adjacent/overlapping context windows are merged into a single `DisplayEntry`. The merged entry is capped at `MAX_MERGED_LINES` total lines; match indices that fall outside the cap are dropped from `matchIndices`.

### `buildDisplayEntries(matchIndices, totalLines)`

Iterates sorted match indices. For each index `idx`, computes window `[max(0, idx−C), min(last, idx+C)]`. If `MERGE_CONTEXT_ENTRIES` is true and the window overlaps with the previous entry (`start <= prev.endIdx + 1`), extends the previous entry (honouring the line cap). Otherwise pushes a new entry.

### `searchEpisodes(index, subtitles, query)`

Scans every line of every loaded episode with `String.includes` (case-insensitive). Returns `EpisodeSearchResult[]` for episodes with at least one match, in index order.

### `episodeHasMatch(lines, query)`

Quick boolean check used by the sidebar to classify episodes during live typing.

---

## Highlights (`src/highlight.ts`)

Uses the CSS Custom Highlights API (`CSS.highlights`). Feature-detected with `'highlights' in CSS`; silently does nothing on unsupported browsers.

`applyHighlights(query, container)`:
- Walks all text nodes inside `container` with `TreeWalker(SHOW_TEXT)`.
- For each text node finds all occurrences of `query` (lowercase comparison), creates a `Range` per occurrence.
- Registers all ranges: `CSS.highlights.set('search-match', new Highlight(...ranges))`.

`clearHighlights()` — `CSS.highlights.delete('search-match')`.

CSS declaration in `style.css`:
```css
::highlight(search-match) {
  background-color: var(--highlight-bg);
  color: var(--highlight-text);
}
```

Applied in both the results view (over rendered match text) and the episode view (over visible transcript lines).

---

## Hash routing and navigation (`src/main.ts`)

### Route type

```ts
type Route =
  | { kind: "welcome" }
  | { kind: "results"; query: string }
  | { kind: "episode"; id: string; lineIndex?: number };
```

### Hash format

| Hash | Route |
|---|---|
| `""` or `"#"` | welcome |
| `#search/<encoded-query>` | results |
| `#episode/<id>` | episode, no scroll target |
| `#episode/<id>/<lineIndex>` | episode, scroll to line |

### Navigation functions

```ts
navigate(hash)      // forward: pushes current mainPaneEl.scrollTop to stack, changes hash
navigateBack(hash)  // back (breadcrumb): sets isBackNavigation flag, changes hash
```

Breadcrumb back-links use `navigateBack()`; all other navigation (sidebar clicks, result row clicks, Enter in search) uses `navigate()`.

### Navigation stack (scroll restoration)

`scrollStack: number[]` and `isBackNavigation: boolean` are module-level state.

- `navigate()` pushes `mainPaneEl.scrollTop` before changing the hash.
- `navigateBack()` sets `isBackNavigation = true` before changing the hash.
- At the top of `handleRoute`: if `isBackNavigation`, `savedScroll = scrollStack.pop() ?? 0`; otherwise `savedScroll = 0`.
- After rendering, `mainPaneEl.scrollTop = savedScroll` — synchronously for welcome/results, via `requestAnimationFrame` for episode (to let the DOM settle after render).
- Episode views arriving with a `lineIndex` skip scroll restoration entirely; `scrollIntoView` handles positioning.

### `handleRoute(route, prevQuery?)`

1. Computes `savedScroll`; resets `isBackNavigation`.
2. Updates `currentRoute`, clears highlights, updates breadcrumb and sidebar.
3. Dispatches to the appropriate render function.
4. Restores scroll.

### Live search (input event)

While in the episode view: `applyQueryFilter` is called in-place — no navigation, no hash change.

While in welcome/results: if query ≥ `MIN_QUERY_LENGTH` and subtitles are loaded, renders results and updates `currentRoute` in-place without changing the hash. Pressing Enter pushes the query to the hash via `navigate()`.

### Background loading

`loadAll` is called after the initial route renders. A progress callback updates `#search-status` with `טוען תמלילים... (N/total)`. When loading completes, if the current route is "results", results are re-rendered (scroll position preserved around the re-render) and highlights re-applied.

---

## GitHub Actions deployment

On push to `main`, the workflow:
1. Installs Node 22 + Python 3.13.
2. Runs `npm ci`.
3. Runs `npm run build:data` (generates `static/data/`).
4. Runs `npm run build:ts` (compiles `static/main.js`).
5. Deploys `./static` to the `gh-pages` branch via `peaceiris/actions-gh-pages@v4`.

`workflow_dispatch` is also enabled for manual triggers.

---

## Out of scope

- Filtering by season
- Episode metadata (air date, guest names, descriptions)
- Linking timestamps to YouTube or video files
- Transcription correction tooling
