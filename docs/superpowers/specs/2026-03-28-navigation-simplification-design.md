# Navigation Simplification & Testing — Design Spec

**Date:** 2026-03-28
**Status:** Approved

## Overview

Simplify the client-side routing of the Comedy Store website by encoding the episode filter query directly in the URL hash, eliminating the `prevQuery` threading pattern and several special-case workarounds. Add a short-query indicator and automated tests covering every navigation state.

## Background

The current router passes a `prevQuery` parameter through `handleRoute` and computes it in the `hashchange` handler via a 3-branch conditional. Three ad-hoc workarounds exist:

1. A post-render click handler on the episode title to handle the "same hash → no hashchange" problem when clearing a filter.
2. A dead guard in `navigate()` that inserts `#search/…` into history before episode navigation — now unreachable since the input handler keeps the URL in sync.
3. No visual feedback when the search query is too short.

## URL Scheme

All navigation state lives in the hash. The filter query (`?q=`) is embedded in the hash fragment itself, not in `location.search`.

| URL | Route |
|-----|-------|
| `#` | Welcome |
| `#search/{q}` | Results |
| `#episode/{id}` | Episode, unfiltered |
| `#episode/{id}?q={q}` | Episode, filtered |
| `#episode/{id}/{lineIndex}?q={q}` | Episode at line, filtered |
| `#episode/{id}/ch-{N}` | Chapter view |

## Route Type

```typescript
type Route =
    | { kind: "welcome" }
    | { kind: "results"; query: string }
    | { kind: "episode"; id: string; lineIndex?: number; query?: string }
    | { kind: "chapter"; episodeId: string; chapterIdx: number };
```

## Core Logic Changes

### `parseHash`

Splits on `?` before parsing the path. The `?q=` parameter is only extracted for episode URLs:

```typescript
function parseHash(hash: string): Route {
    const raw = hash.startsWith("#") ? hash.slice(1) : hash;
    if (!raw) return { kind: "welcome" };

    if (raw.startsWith("search/")) {
        return { kind: "results", query: decodeURIComponent(raw.slice("search/".length)) };
    }

    if (raw.startsWith("episode/")) {
        const qIdx = raw.indexOf("?");
        const path = qIdx !== -1 ? raw.slice(0, qIdx) : raw;
        const qs = qIdx !== -1 ? raw.slice(qIdx + 1) : "";
        const query = qs.startsWith("q=") ? decodeURIComponent(qs.slice(2)) : undefined;

        const rest = path.slice("episode/".length);
        const slashIdx = rest.lastIndexOf("/");
        if (slashIdx !== -1) {
            const id = decodeURIComponent(rest.slice(0, slashIdx));
            const seg = rest.slice(slashIdx + 1);
            if (seg.startsWith("ch-")) {
                const n = parseInt(seg.slice(3), 10);
                if (!isNaN(n)) return { kind: "chapter", episodeId: id, chapterIdx: n };
            }
            const lineIndex = parseInt(seg, 10);
            return { kind: "episode", id, lineIndex: isNaN(lineIndex) ? undefined : lineIndex, query };
        }
        return { kind: "episode", id: decodeURIComponent(rest), query };
    }

    return { kind: "welcome" };
}
```

### `handleRoute`

Drops the `prevQuery` parameter. The episode branch reads `route.query` directly:

```typescript
async function handleRoute(route: Route, savedScroll = 0) { ... }
// episode branch:
queryEl.value = route.query ?? "";
```

### `hashchange` handler

The 3-branch `prevQuery` conditional is removed:

```typescript
window.addEventListener("hashchange", () => {
    const savedScroll = isPopState ? (history.state?.scroll ?? 0) : 0;
    isPopState = false;
    void handleRoute(parseHash(window.location.hash), savedScroll);
});
```

### `navigate()`

Dead guard removed:

```typescript
function navigate(hash: string) {
    history.replaceState({ ...history.state, scroll: mainPaneEl.scrollTop }, "");
    window.location.hash = hash;
}
```

### Input handler — episode branch

Adds `replaceState` to keep URL in sync as the user types, mirroring the search branch:

```typescript
if (currentRoute.kind === "episode") {
    if (episodeViewState) {
        const { listEl, lineEls, lines, chapterBlocks } = episodeViewState;
        measure("filter:episode", () => applyQueryFilter(listEl, lineEls, lines, q, chapterBlocks));
    }
    const base = `#episode/${encodeURIComponent(currentRoute.id)}`;
    const newHash = q.trim().length >= MIN_QUERY_LENGTH
        ? `${base}?q=${encodeURIComponent(q)}`
        : base;
    history.replaceState({ ...history.state }, "", newHash);
    currentRoute = { ...currentRoute, query: q.trim().length >= MIN_QUERY_LENGTH ? q : undefined };
    return;
}
```

### Episode title click handler

Removed entirely. The episode title link stays as `#episode/{id}`. When the current URL is `#episode/{id}?q={q}`, clicking the title changes the hash (drops `?q=`), which fires `hashchange` naturally and re-renders unfiltered. No post-render DOM patching needed.

## Results View (`src/views/results.ts`)

Episode title and line links embed the current query. `renderResults` already receives `q`:

- Episode title: `#episode/${encodeURIComponent(id)}?q=${encodeURIComponent(q)}`
- Line result: `#episode/${encodeURIComponent(id)}/${lineIndex}?q=${encodeURIComponent(q)}`

## Sidebar

One delegated click handler, added once at init time. Intercepts episode link clicks when a query is active and appends `?q=` before navigating. Falls through to normal hash navigation otherwise:

```typescript
sidebarEl.addEventListener("click", (e) => {
    const a = (e.target as Element).closest<HTMLAnchorElement>("a[href^='#episode/']");
    if (!a) { return; }
    const q = queryEl.value.trim();
    if (q.length < MIN_QUERY_LENGTH) { return; }
    e.preventDefault();
    const path = ensure(a.getAttribute("href"), "sidebar link missing href").slice(1);
    navigate(`${path}?q=${encodeURIComponent(q)}`);
});
```

This preserves the two carry-through behaviors:
- Results → sidebar click → filtered episode
- Filtered episode → sidebar click (different episode) → filtered episode

## Short Query Indicator

When the typed query is between 1 and `MIN_QUERY_LENGTH - 1` characters, the status element shows a hint. Added as a new `else` branch in the input handler's global search path:

```typescript
} else {
    setStatus(`הקלד לפחות ${MIN_QUERY_LENGTH} תווים`);
}
```

Only applies to the global search context; the episode in-place filter is unaffected.

## Testing

### Vitest — pure logic unit tests

`parseHash` unit tests covering all URL formats:

```
parseHash("#")                           → { kind: "welcome" }
parseHash("#search/כסף")                 → { kind: "results", query: "כסף" }
parseHash("#episode/פרק_001")            → { kind: "episode", id: "פרק_001" }
parseHash("#episode/פרק_001?q=כסף")      → { kind: "episode", id: "פרק_001", query: "כסף" }
parseHash("#episode/פרק_001/42?q=כסף")   → { kind: "episode", id: "פרק_001", lineIndex: 42, query: "כסף" }
parseHash("#episode/פרק_001/ch-3")       → { kind: "chapter", episodeId: "פרק_001", chapterIdx: 3 }
```

### Playwright — end-to-end navigation tests

Uses the existing `serve static` dev server with a small fixture bundle (a few episodes with known content) so tests are independent of the real `subtitles.json`.

Covers every edge in the state graph in both directions:

| Test | Actions | Assertions |
|------|---------|------------|
| Welcome → Results | type query | URL = `#search/…`, results shown |
| Results → Welcome | clear query | URL = `#`, welcome shown |
| Results → Episode (filtered) | click result line | URL = `#episode/…?q=…`, filter active |
| Episode (filtered) → Results | click breadcrumb | URL = `#search/…` |
| Episode (filtered) → Episode (clear) | click episode title | URL = `#episode/…`, no `?q=`, all lines shown |
| Episode → Chapter | click chapter header | URL = `#episode/…/ch-N` |
| Chapter → Episode | click breadcrumb episode | URL = `#episode/…` |
| Back: Results → Welcome | `goBack()` from results | URL = `#`, welcome shown |
| Back: Episode → Results | `goBack()` from episode | URL = `#search/…`, results shown |
| Back: Chapter → Episode | `goBack()` from chapter | URL = `#episode/…` |
| Sidebar carry-through | type query, click sidebar | URL = `#episode/…?q=…`, filter active |
| Short query | type 1 char | status hint shown, results not updated |
| Direct load filtered | navigate to `#episode/…?q=…` | filter applied on load |
