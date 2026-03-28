# Navigation Simplification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Encode the episode filter query in the URL hash, eliminate the `prevQuery` threading pattern and special-case workarounds, add a short-query indicator, and add Vitest unit tests + Playwright e2e tests covering all navigation states.

**Architecture:** The `Route` type gains a `query` field on the episode variant. `parseHash` extracts `?q=` from episode hashes. `handleRoute` reads `route.query` directly instead of receiving `prevQuery` as a parameter. The sidebar gets one delegated click handler that appends `?q=` when a query is active.

**Tech Stack:** TypeScript, esbuild, Vitest (unit tests), Playwright (e2e tests), `serve` (dev server)

**Spec:** `docs/superpowers/specs/2026-03-28-navigation-simplification-design.md`

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `src/router.ts` | **Create** | `Route` type, `parseHash`, `buildEpisodeHash` — pure, no DOM |
| `src/main.ts` | **Modify** | Remove `prevQuery` threading, update input handler, sidebar handler, short query indicator |
| `src/views/results.ts` | **Modify** | Embed `?q=` in episode title and line links |
| `vitest.config.ts` | **Create** | Vitest configuration |
| `src/__tests__/router.test.ts` | **Create** | Unit tests for `parseHash` and `buildEpisodeHash` |
| `playwright.config.ts` | **Create** | Playwright configuration |
| `tests/e2e/fixtures/subtitles.json` | **Create** | Small fixture bundle for e2e tests |
| `tests/e2e/navigation.spec.ts` | **Create** | E2e tests for all navigation states |
| `package.json` | **Modify** | Add vitest, @playwright/test dev deps and test scripts |

---

## Task 1: Extract `Route` and `parseHash` to `src/router.ts`

Pure refactor — no behavior changes. Moves the routing primitives to a standalone file with no DOM imports so they can be unit tested.

**Files:**
- Create: `src/router.ts`
- Modify: `src/main.ts`

- [ ] **Step 1: Create `src/router.ts` with the existing `Route` type and `parseHash`**

```typescript
// src/router.ts

export type Route =
    | { kind: "welcome" }
    | { kind: "results"; query: string }
    | { kind: "episode"; id: string; lineIndex?: number }
    | { kind: "chapter"; episodeId: string; chapterIdx: number };

export function parseHash(hash: string): Route {
    const raw = hash.startsWith("#") ? hash.slice(1) : hash;
    if (!raw) return { kind: "welcome" };

    if (raw.startsWith("search/")) {
        const query = decodeURIComponent(raw.slice("search/".length));
        return { kind: "results", query };
    }

    if (raw.startsWith("episode/")) {
        const rest = raw.slice("episode/".length);
        const slashIdx = rest.lastIndexOf("/");
        if (slashIdx !== -1) {
            const id = decodeURIComponent(rest.slice(0, slashIdx));
            const seg = rest.slice(slashIdx + 1);
            if (seg.startsWith("ch-")) {
                const chapterIdx = parseInt(seg.slice(3), 10);
                if (!isNaN(chapterIdx)) {
                    return { kind: "chapter", episodeId: id, chapterIdx };
                }
            }
            const lineIndex = parseInt(seg, 10);
            return { kind: "episode", id, lineIndex: isNaN(lineIndex) ? undefined : lineIndex };
        }
        return { kind: "episode", id: decodeURIComponent(rest) };
    }

    return { kind: "welcome" };
}

export function buildEpisodeHash(id: string, lineIndex?: number, query?: string): string {
    let h = `episode/${encodeURIComponent(id)}`;
    if (lineIndex !== undefined) { h += `/${lineIndex}`; }
    if (query) { h += `?q=${encodeURIComponent(query)}`; }
    return h;
}
```

- [ ] **Step 2: Update `src/main.ts` — replace local `Route` type and `parseHash` with imports**

At the top of `src/main.ts`, replace:
```typescript
import type {EpisodeIndex, EpisodeLines, EpisodeMetadata} from "./types.js";
```
with:
```typescript
import type {EpisodeIndex, EpisodeLines, EpisodeMetadata} from "./types.js";
import {parseHash, buildEpisodeHash} from "./router.js";
import type {Route} from "./router.js";
```

Then delete the `Route` type definition (lines 57–61 in the original):
```typescript
// DELETE this block:
type Route =
    | { kind: "welcome" }
    | { kind: "results"; query: string }
    | { kind: "episode"; id: string; lineIndex?: number }
    | { kind: "chapter"; episodeId: string; chapterIdx: number };
```

And delete the `parseHash` function (lines 118–146 in the original).

- [ ] **Step 3: Verify the build passes**

```bash
cd /mnt/c/workspace/comedy_store_transcribe
npm run build:ts
```

Expected: exits 0, writes `static/main.js` with no errors.

- [ ] **Step 4: Commit**

```bash
git add src/router.ts src/main.ts
git commit -m "refactor: extract Route type and parseHash to src/router.ts"
```

---

## Task 2: Set up Vitest and write failing unit tests

- [ ] **Step 1: Install Vitest**

```bash
cd /mnt/c/workspace/comedy_store_transcribe
npm install --save-dev vitest
```

- [ ] **Step 2: Create `vitest.config.ts`**

```typescript
// vitest.config.ts
import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        environment: "node",
        include: ["src/__tests__/**/*.test.ts"],
    },
});
```

- [ ] **Step 3: Add test script to `package.json`**

In `package.json`, add to `"scripts"`:
```json
"test:unit": "vitest run"
```

- [ ] **Step 4: Create `src/__tests__/router.test.ts` with all tests**

```typescript
// src/__tests__/router.test.ts
import { describe, it, expect } from "vitest";
import { parseHash, buildEpisodeHash } from "../router.js";

describe("parseHash", () => {
    it("empty hash → welcome", () => {
        expect(parseHash("")).toEqual({ kind: "welcome" });
        expect(parseHash("#")).toEqual({ kind: "welcome" });
    });

    it("search hash → results", () => {
        expect(parseHash("#search/%D7%A9%D7%9C%D7%95%D7%9D")).toEqual({
            kind: "results",
            query: "שלום",
        });
    });

    it("bare episode hash → episode without filter", () => {
        expect(parseHash("#episode/ep1")).toEqual({
            kind: "episode",
            id: "ep1",
            lineIndex: undefined,
            query: undefined,
        });
    });

    it("episode hash with ?q= → episode with filter", () => {
        expect(parseHash("#episode/ep1?q=%D7%A9%D7%9C%D7%95%D7%9D")).toEqual({
            kind: "episode",
            id: "ep1",
            lineIndex: undefined,
            query: "שלום",
        });
    });

    it("episode hash with lineIndex and ?q= → episode with lineIndex and filter", () => {
        expect(parseHash("#episode/ep1/42?q=%D7%A9%D7%9C%D7%95%D7%9D")).toEqual({
            kind: "episode",
            id: "ep1",
            lineIndex: 42,
            query: "שלום",
        });
    });

    it("chapter hash → chapter", () => {
        expect(parseHash("#episode/ep1/ch-3")).toEqual({
            kind: "chapter",
            episodeId: "ep1",
            chapterIdx: 3,
        });
    });

    it("unknown hash → welcome", () => {
        expect(parseHash("#something/unknown")).toEqual({ kind: "welcome" });
    });

    it("encoded episode id is decoded", () => {
        const encoded = encodeURIComponent("פרק_001");
        const result = parseHash(`#episode/${encoded}`);
        expect(result).toEqual({ kind: "episode", id: "פרק_001", lineIndex: undefined, query: undefined });
    });
});

describe("buildEpisodeHash", () => {
    it("bare episode", () => {
        expect(buildEpisodeHash("ep1")).toBe("episode/ep1");
    });

    it("episode with lineIndex", () => {
        expect(buildEpisodeHash("ep1", 42)).toBe("episode/ep1/42");
    });

    it("episode with query", () => {
        expect(buildEpisodeHash("ep1", undefined, "שלום")).toBe(
            "episode/ep1?q=%D7%A9%D7%9C%D7%95%D7%9D",
        );
    });

    it("episode with lineIndex and query", () => {
        expect(buildEpisodeHash("ep1", 42, "שלום")).toBe(
            "episode/ep1/42?q=%D7%A9%D7%9C%D7%95%D7%9D",
        );
    });

    it("undefined query produces no ?q= suffix", () => {
        expect(buildEpisodeHash("ep1", undefined, undefined)).toBe("episode/ep1");
    });

    it("encodes episode id", () => {
        expect(buildEpisodeHash("פרק_001")).toBe(`episode/${encodeURIComponent("פרק_001")}`);
    });
});
```

- [ ] **Step 5: Run the tests — confirm failures for `?q=` cases**

```bash
npm run test:unit
```

Expected: tests for `"episode hash with ?q="` and `"episode hash with lineIndex and ?q="` **FAIL** (the current `parseHash` doesn't handle `?q=`). All other tests pass.

---

## Task 3: Update `parseHash` to support `?q=`, and add `query` to `Route`

- [ ] **Step 1: Update `src/router.ts` — add `query` to the episode route and update `parseHash`**

Replace the entire contents of `src/router.ts`:

```typescript
// src/router.ts

export type Route =
    | { kind: "welcome" }
    | { kind: "results"; query: string }
    | { kind: "episode"; id: string; lineIndex?: number; query?: string }
    | { kind: "chapter"; episodeId: string; chapterIdx: number };

export function parseHash(hash: string): Route {
    const raw = hash.startsWith("#") ? hash.slice(1) : hash;
    if (!raw) return { kind: "welcome" };

    if (raw.startsWith("search/")) {
        const query = decodeURIComponent(raw.slice("search/".length));
        return { kind: "results", query };
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
                const chapterIdx = parseInt(seg.slice(3), 10);
                if (!isNaN(chapterIdx)) {
                    return { kind: "chapter", episodeId: id, chapterIdx };
                }
            }
            const lineIndex = parseInt(seg, 10);
            return { kind: "episode", id, lineIndex: isNaN(lineIndex) ? undefined : lineIndex, query };
        }
        return { kind: "episode", id: decodeURIComponent(rest), query };
    }

    return { kind: "welcome" };
}

export function buildEpisodeHash(id: string, lineIndex?: number, query?: string): string {
    let h = `episode/${encodeURIComponent(id)}`;
    if (lineIndex !== undefined) { h += `/${lineIndex}`; }
    if (query) { h += `?q=${encodeURIComponent(query)}`; }
    return h;
}
```

- [ ] **Step 2: Run unit tests — all should pass**

```bash
npm run test:unit
```

Expected: all tests **PASS**.

- [ ] **Step 3: Commit**

```bash
git add src/router.ts vitest.config.ts src/__tests__/router.test.ts package.json
git commit -m "feat: add ?q= support to parseHash and unit tests"
```

---

## Task 4: Simplify `handleRoute` and `hashchange`

Removes `prevQuery` parameter threading, eliminates the dead guard in `navigate()`, and removes the post-render episode title click handler.

**Files:**
- Modify: `src/main.ts`

- [ ] **Step 1: Update `navigate()` — remove dead guard**

Replace the `navigate` function in `src/main.ts`:

```typescript
function navigate(hash: string) {
    history.replaceState({...history.state, scroll: mainPaneEl.scrollTop}, "");
    window.location.hash = hash;
}
```

- [ ] **Step 2: Update `handleRoute` signature and top-level breadcrumb call**

Replace:
```typescript
async function handleRoute(route: Route, prevQuery?: string, savedScroll = 0) {
    currentRoute = route;
    episodeViewState = null;
    clearHighlights();
    setBreadcrumb(route, prevQuery);
    syncSidebar();
```

With:
```typescript
async function handleRoute(route: Route, savedScroll = 0) {
    currentRoute = route;
    episodeViewState = null;
    clearHighlights();
    const crumbQuery = route.kind === "episode" ? route.query : undefined;
    setBreadcrumb(route, crumbQuery);
    syncSidebar();
```

- [ ] **Step 3: Update the episode branch of `handleRoute`**

Replace the episode branch (from `if (route.kind === "episode") {` through `return;`):

```typescript
    if (route.kind === "episode") {
        queryEl.value = route.query ?? "";

        const ep = episodeIndex.find((e) => e.id === route.id);
        if (!ep) {
            mainPaneEl.replaceChildren(episodeNotFoundMsg);
            return;
        }

        mainPaneEl.replaceChildren(loadingEpisodeMsg);
        const lines = await loadEpisode(ep);
        const chapters = getEpisodeChapters(ep.id);

        const renderResult = measure("render:episode", () =>
            renderEpisode(mainPaneEl, ep, lines, queryEl.value, route.lineIndex, chapters),
        );

        if (route.lineIndex === undefined) {
            requestAnimationFrame(() => {
                mainPaneEl.scrollTop = savedScroll;
            });
        }

        episodeViewState = {
            episode: ep,
            lines,
            lineEls: renderResult.lineEls,
            listEl: renderResult.listEl,
            chapterBlocks: renderResult.chapterBlocks,
        };

        return;
    }
```

Note: the post-render title click handler attachment is intentionally omitted. The title link (`#episode/{id}`) now naturally differs from a filtered URL (`#episode/{id}?q=…`), so `hashchange` fires on click.

- [ ] **Step 4: Simplify the `results` branch — remove redundant `setBreadcrumb` call**

Replace:
```typescript
    if (route.kind === "results") {
        queryEl.value = route.query;
        setBreadcrumb(route);
```

With:
```typescript
    if (route.kind === "results") {
        queryEl.value = route.query;
```

- [ ] **Step 5: Simplify the `hashchange` handler**

Replace the entire `hashchange` listener:
```typescript
window.addEventListener("hashchange", () => {
    const savedScroll = isPopState ? (history.state?.scroll ?? 0) : 0;
    isPopState = false;
    const route = parseHash(window.location.hash);
    void handleRoute(route, savedScroll);
});
```

Also remove the now-unused `prevQuery` computation lines (the old 4-line conditional block) if they still remain.

- [ ] **Step 6: Verify build**

```bash
npm run build:ts
```

Expected: exits 0.

- [ ] **Step 7: Commit**

```bash
git add src/main.ts
git commit -m "refactor: remove prevQuery threading, simplify handleRoute and hashchange"
```

---

## Task 5: Update episode input handler and add short query indicator

**Files:**
- Modify: `src/main.ts`

- [ ] **Step 1: Replace the episode branch in the input handler**

Find the input handler's episode branch:
```typescript
    if (currentRoute.kind === "episode") {
        // Filter transcript in-place without navigating away
        if (episodeViewState) {
            const {listEl, lineEls, lines, chapterBlocks} = episodeViewState;
            measure("filter:episode", () => applyQueryFilter(listEl, lineEls, lines, q, chapterBlocks));
        }
        return;
    }
```

Replace it with:
```typescript
    if (currentRoute.kind === "episode") {
        if (episodeViewState) {
            const {listEl, lineEls, lines, chapterBlocks} = episodeViewState;
            measure("filter:episode", () => applyQueryFilter(listEl, lineEls, lines, q, chapterBlocks));
        }
        const newHash = `#${buildEpisodeHash(currentRoute.id, undefined, q.trim().length >= MIN_QUERY_LENGTH ? q : undefined)}`;
        history.replaceState({...history.state}, "", newHash);
        currentRoute = {...currentRoute, query: q.trim().length >= MIN_QUERY_LENGTH ? q : undefined};
        return;
    }
```

- [ ] **Step 2: Add the short query indicator**

Find the end of the global search path in the input handler:
```typescript
    } else if (q.trim().length === 0) {
        setStatus("");
        renderWelcome(mainPaneEl);

        if (currentRoute.kind === "results") {
            history.replaceState(null, "", "#");
        }

        currentRoute = {kind: "welcome"};
    }
```

Add an `else` branch after it:
```typescript
    } else if (q.trim().length === 0) {
        setStatus("");
        renderWelcome(mainPaneEl);

        if (currentRoute.kind === "results") {
            history.replaceState(null, "", "#");
        }

        currentRoute = {kind: "welcome"};
    } else {
        setStatus(`הקלד לפחות ${MIN_QUERY_LENGTH} תווים`);
    }
```

- [ ] **Step 3: Verify build**

```bash
npm run build:ts
```

Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
git add src/main.ts
git commit -m "feat: sync episode filter to URL, add short query indicator"
```

---

## Task 6: Add sidebar click interceptor

**Files:**
- Modify: `src/main.ts`

- [ ] **Step 1: Add the delegated click handler on `sidebarEl`**

Add this block after the `clearBtnEl` click handler (around line 370 in the original file, after `queryEl.focus();`):

```typescript
// ── Sidebar query carry-through ────────────────────────────────────────
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

- [ ] **Step 2: Verify build**

```bash
npm run build:ts
```

Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add src/main.ts
git commit -m "feat: add sidebar click interceptor to carry query into episode"
```

---

## Task 7: Update results view links

Embeds `?q=` in episode title and line links rendered in search results.

**Files:**
- Modify: `src/views/results.ts`

- [ ] **Step 1: Add `buildEpisodeHash` import**

At the top of `src/views/results.ts`, add:
```typescript
import { buildEpisodeHash } from "../router.js";
```

- [ ] **Step 2: Update the episode title link in `renderResults`**

Replace (line 41):
```typescript
    titleEl.href = `#episode/${episode.id}`;
```
With:
```typescript
    titleEl.href = `#${buildEpisodeHash(episode.id, undefined, query)}`;
```

- [ ] **Step 3: Update `renderEntry` to accept and use `query`**

Replace the function signature:
```typescript
function renderEntry(
  entry: DisplayEntry,
  lines: EpisodeLines,
  episodeId: string,
): HTMLElement {
```
With:
```typescript
function renderEntry(
  entry: DisplayEntry,
  lines: EpisodeLines,
  episodeId: string,
  query: string,
): HTMLElement {
```

Replace (line 95):
```typescript
    row.href = `#episode/${episodeId}/${i}`;
```
With:
```typescript
    row.href = `#${buildEpisodeHash(episodeId, i, query)}`;
```

- [ ] **Step 4: Pass `query` to all `renderEntry` calls**

In `renderResults`, update the visible entries loop:
```typescript
    for (const entry of visible) {
      section.appendChild(renderEntry(entry, lines, episode.id, query));
    }
```

Update the "show more" button click handler (the overflow loop inside `btn.addEventListener`):
```typescript
        for (const entry of overflow) {
          frag.appendChild(renderEntry(entry, lines, episode.id, query));
        }
```

- [ ] **Step 5: Verify build**

```bash
npm run build:ts
```

Expected: exits 0.

- [ ] **Step 6: Commit**

```bash
git add src/views/results.ts
git commit -m "feat: embed ?q= in result links so clicking navigates to filtered episode"
```

---

## Task 8: Set up Playwright and write e2e navigation tests

**Files:**
- Create: `playwright.config.ts`
- Create: `tests/e2e/fixtures/subtitles.json`
- Create: `tests/e2e/navigation.spec.ts`
- Modify: `package.json`

- [ ] **Step 1: Install Playwright**

```bash
cd /mnt/c/workspace/comedy_store_transcribe
npm install --save-dev @playwright/test
npx playwright install chromium
```

On WSL2, if browser installation fails, run: `npx playwright install-deps chromium && npx playwright install chromium`

- [ ] **Step 2: Add test script to `package.json`**

In `package.json`, add to `"scripts"`:
```json
"test:e2e": "playwright test"
```

- [ ] **Step 3: Create `playwright.config.ts`**

```typescript
// playwright.config.ts
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
    testDir: "./tests/e2e",
    use: {
        baseURL: "http://localhost:3000",
    },
    webServer: {
        command: "npx serve static -p 3000",
        url: "http://localhost:3000",
        reuseExistingServer: !process.env["CI"],
    },
    projects: [
        { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    ],
});
```

- [ ] **Step 4: Build the site so the server has current JS**

```bash
npm run build:ts
```

- [ ] **Step 5: Create `tests/e2e/fixtures/subtitles.json`**

```json
[
  {
    "id": "ep1",
    "title": "פרק בדיקה 1",
    "num": 1,
    "lines": [
      { "start": 0.0, "end": 2.0, "text": "שלום עולם" },
      { "start": 2.0, "end": 4.0, "text": "מה שלומך" },
      { "start": 4.0, "end": 6.0, "text": "להתראות" }
    ]
  },
  {
    "id": "ep2",
    "title": "פרק בדיקה 2",
    "num": 2,
    "lines": [
      { "start": 0.0, "end": 2.0, "text": "בוקר טוב" },
      { "start": 2.0, "end": 4.0, "text": "לילה טוב" }
    ],
    "chapters": [
      { "start": 0.0, "end": 2.0, "name": "פתיחה" }
    ]
  }
]
```

- [ ] **Step 6: Create `tests/e2e/navigation.spec.ts`**

```typescript
// tests/e2e/navigation.spec.ts
import { test, expect } from "@playwright/test";
import path from "path";

const FIXTURE = path.resolve("tests/e2e/fixtures/subtitles.json");

async function setup(page: import("@playwright/test").Page) {
    // Serve fixture data instead of real bundle
    await page.route("**/data/subtitles.json.gz", (route) => route.fulfill({ status: 404 }));
    await page.route("**/data/subtitles.json", (route) =>
        route.fulfill({ status: 200, contentType: "application/json", path: FIXTURE }),
    );
}

test.describe("Welcome ↔ Results", () => {
    test("typing a query navigates to #search/…", async ({ page }) => {
        await setup(page);
        await page.goto("/");
        await page.fill("#query", "שלום");
        await expect(page).toHaveURL(/#search\/.+/);
        await expect(page.locator(".results-episode")).toHaveCount(1);
    });

    test("clearing the query returns to welcome", async ({ page }) => {
        await setup(page);
        await page.goto("/#search/%D7%A9%D7%9C%D7%95%D7%9D");
        await page.locator("#query-clear").click();
        await expect(page).toHaveURL(/\/#?$/);
        await expect(page.locator(".results-episode")).toHaveCount(0);
    });

    test("Back from results goes to welcome", async ({ page }) => {
        await setup(page);
        await page.goto("/");
        await page.fill("#query", "שלום");
        await expect(page).toHaveURL(/#search\/.+/);
        await page.goBack();
        await expect(page).toHaveURL(/\/#?$/);
    });
});

test.describe("Results → Episode", () => {
    test("clicking a result line navigates to filtered episode", async ({ page }) => {
        await setup(page);
        await page.goto("/");
        await page.fill("#query", "שלום");
        await page.locator(".result-line.match").first().click();
        await expect(page).toHaveURL(/#episode\/ep1\/\d+\?q=.+/);
        const hiddenCount = await page.locator(".line.hidden").count();
        expect(hiddenCount).toBeGreaterThan(0);
    });

    test("clicking episode title in results navigates to filtered episode", async ({ page }) => {
        await setup(page);
        await page.goto("/");
        await page.fill("#query", "שלום");
        await page.locator(".results-episode-title").first().click();
        await expect(page).toHaveURL(/#episode\/ep1\?q=.+/);
    });

    test("Back from filtered episode goes to results", async ({ page }) => {
        await setup(page);
        await page.goto("/");
        await page.fill("#query", "שלום");
        await page.locator(".results-episode-title").first().click();
        await expect(page).toHaveURL(/#episode\/.+\?q=.+/);
        await page.goBack();
        await expect(page).toHaveURL(/#search\/.+/);
    });
});

test.describe("Episode filter", () => {
    test("clicking episode title in filtered view clears filter", async ({ page }) => {
        await setup(page);
        await page.goto("/#episode/ep1?q=%D7%A9%D7%9C%D7%95%D7%9D");
        await page.waitForSelector(".episode-header");
        const hiddenBefore = await page.locator(".line.hidden").count();
        expect(hiddenBefore).toBeGreaterThan(0);

        await page.locator(".episode-header h2 a").click();
        await expect(page).toHaveURL(/#episode\/ep1$/);
        await expect(page.locator(".line.hidden")).toHaveCount(0);
    });

    test("breadcrumb Results link returns to search results", async ({ page }) => {
        await setup(page);
        await page.goto("/");
        await page.fill("#query", "שלום");
        await page.locator(".results-episode-title").first().click();
        await page.waitForSelector("#breadcrumb a[href*='search']");
        await page.locator("#breadcrumb a[href*='search']").click();
        await expect(page).toHaveURL(/#search\/.+/);
        await expect(page.locator(".results-episode")).toHaveCount(1);
    });

    test("typing while on episode updates URL with ?q=", async ({ page }) => {
        await setup(page);
        await page.goto("/#episode/ep1");
        await page.waitForSelector(".episode-header");
        await page.fill("#query", "שלום");
        await expect(page).toHaveURL(/#episode\/ep1\?q=.+/);
    });

    test("sidebar click while filtered carries query to new episode", async ({ page }) => {
        await setup(page);
        await page.goto("/");
        await page.fill("#query", "שלום");
        await page.locator("#sidebar a[href*='ep2']").click();
        await expect(page).toHaveURL(/#episode\/ep2\?q=.+/);
    });
});

test.describe("Chapter navigation", () => {
    test("clicking chapter header navigates to chapter view", async ({ page }) => {
        await setup(page);
        await page.goto("/#episode/ep2");
        await page.waitForSelector(".chapter-block-header");
        await page.locator("a.chapter-block-header").first().click();
        await expect(page).toHaveURL(/#episode\/ep2\/ch-\d+/);
    });

    test("chapter breadcrumb episode link returns to episode", async ({ page }) => {
        await setup(page);
        await page.goto("/#episode/ep2/ch-1");
        await page.waitForSelector("#breadcrumb");
        await page.locator("#breadcrumb a[href*='episode/ep2']").click();
        await expect(page).toHaveURL(/#episode\/ep2$/);
    });

    test("Back from chapter goes to episode", async ({ page }) => {
        await setup(page);
        await page.goto("/#episode/ep2");
        await page.waitForSelector(".chapter-block-header");
        await page.locator("a.chapter-block-header").first().click();
        await expect(page).toHaveURL(/#episode\/ep2\/ch-\d+/);
        await page.goBack();
        await expect(page).toHaveURL(/#episode\/ep2$/);
    });
});

test.describe("Short query indicator", () => {
    test("typing one character shows hint in status bar", async ({ page }) => {
        await setup(page);
        await page.goto("/");
        await page.fill("#query", "א");
        await expect(page.locator("#search-status")).toContainText("תווים");
        // URL should not have changed to a search URL
        await expect(page).not.toHaveURL(/#search\/.+/);
    });
});

test.describe("Direct URL load", () => {
    test("loading a filtered episode URL shows filter applied", async ({ page }) => {
        await setup(page);
        await page.goto("/#episode/ep1?q=%D7%A9%D7%9C%D7%95%D7%9D");
        await page.waitForSelector(".episode-header");
        const hiddenCount = await page.locator(".line.hidden").count();
        expect(hiddenCount).toBeGreaterThan(0);
        await expect(page.locator("#query")).toHaveValue("שלום");
    });
});
```

- [ ] **Step 7: Run the e2e tests**

```bash
npm run test:e2e
```

Expected: all tests pass. If any fail, read the error carefully — it will point to either a selector mismatch (check the actual DOM class names) or a timing issue (add `waitForSelector` or `waitForURL` before the assertion).

- [ ] **Step 8: Commit**

```bash
git add playwright.config.ts tests/ package.json
git commit -m "test: add Playwright e2e navigation tests and Vitest setup"
```
