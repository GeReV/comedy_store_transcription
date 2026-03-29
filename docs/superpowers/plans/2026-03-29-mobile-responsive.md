# Mobile Responsive Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Comedy Store transcripts site usable on mobile phones (≤640px) via a responsive top bar, a drawer sidebar, and a backdrop overlay.

**Architecture:** All changes are additive. New CSS lives in a single `@media (max-width: 640px)` block appended to `style.css`. New HTML elements (`#sidebar-toggle`, `#sidebar-backdrop`) are wired in `main.ts` with minimal class-toggling logic. Desktop behavior is completely unchanged.

**Tech Stack:** Vanilla TypeScript (compiled via esbuild), plain CSS, no frameworks.

---

## File Map

| File | Change |
|------|--------|
| `static/index.html` | Add `#sidebar-toggle` button and `#sidebar-backdrop` div |
| `static/style.css` | Add base rules for new elements + `@media (max-width: 640px)` block |
| `src/main.ts` | Add DOM refs, `openSidebar`/`closeSidebar`, four event listeners |

---

### Task 1: HTML — add sidebar toggle button and backdrop

**Files:**
- Modify: `static/index.html`

- [ ] **Step 1: Add `#sidebar-toggle` button inside `#top-bar-inner`**

  Open `static/index.html`. After the closing `</button>` tag of `#theme-toggle`, add a new button:

  ```html
      <button id="theme-toggle" aria-label="החלף ערכת צבעים" title="החלף ערכת צבעים">
        <span class="icon-light">☀️</span>
        <span class="icon-dark">🌙</span>
      </button>
      <button id="sidebar-toggle" aria-label="פתח רשימת פרקים" aria-expanded="false" aria-controls="sidebar">☰</button>
  ```

- [ ] **Step 2: Add `#sidebar-backdrop` before `#layout`**

  After the closing `</div>` of `#top-bar` and before `<div id="layout">`, add:

  ```html
  </div>

  <div id="sidebar-backdrop" aria-hidden="true"></div>

  <div id="layout">
  ```

- [ ] **Step 3: Verify HTML is valid**

  Open `static/index.html` and confirm it looks like this (abridged):

  ```html
  <div id="top-bar">
    <div id="top-bar-inner">
      <h1>הקומדי סטור</h1>
      <div id="search-bar">...</div>
      <button id="theme-toggle" ...>...</button>
      <button id="sidebar-toggle" aria-label="פתח רשימת פרקים" aria-expanded="false" aria-controls="sidebar">☰</button>
    </div>
    <nav id="breadcrumb" ...></nav>
  </div>

  <div id="sidebar-backdrop" aria-hidden="true"></div>

  <div id="layout">
    <aside id="sidebar" ...></aside>
    <main id="main-pane" ...></main>
  </div>
  ```

- [ ] **Step 4: Commit**

  ```bash
  git add static/index.html
  git commit -m "feat(mobile): add sidebar-toggle button and backdrop to HTML"
  ```

---

### Task 2: CSS — base rules and mobile media query

**Files:**
- Modify: `static/style.css`

- [ ] **Step 1: Add base rules for new elements after the `#theme-toggle` block**

  In `static/style.css`, after the `#theme-toggle:hover` rule (around line 172), add:

  ```css
  /* ── Sidebar toggle (mobile only) ───────────────────────────────────── */
  #sidebar-toggle {
    display: none; /* shown only on mobile */
    align-items: center;
    justify-content: center;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: .3rem .55rem;
    font-size: .95rem;
    line-height: 1;
    color: var(--text);
    flex-shrink: 0;
    transition: background .15s;
  }
  #sidebar-toggle:hover { background: var(--surface-alt); }

  /* ── Backdrop (mobile only) ──────────────────────────────────────────── */
  #sidebar-backdrop {
    display: none;
  }
  ```

- [ ] **Step 2: Append mobile media query block at end of file**

  Add this entire block at the very end of `static/style.css`:

  ```css
  /* ── Mobile layout (≤640px) ──────────────────────────────────────────── */
  @media (max-width: 640px) {
    /* Top bar: two rows
       Row 1: h1 (flex: 1) | theme-toggle | sidebar-toggle
       Row 2: search-bar (full width, pushed to row 2 via order: 1)        */
    #top-bar-inner {
      flex-wrap: wrap;
    }

    h1 {
      flex: 1;
    }

    #search-bar {
      order: 1;
      width: 100%;
      flex-shrink: 0;
    }

    #sidebar-toggle {
      display: inline-flex;
    }

    /* Sidebar: fixed drawer, slides in from right (RTL) */
    #sidebar {
      position: fixed;
      top: 0;
      right: 0;
      bottom: 0;
      width: 80%;
      max-width: 300px;
      transform: translateX(100%);
      transition: transform .25s ease;
      z-index: 20;
    }

    body.sidebar-open #sidebar {
      transform: translateX(0);
    }

    /* Backdrop */
    #sidebar-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, .4);
      z-index: 19;
    }

    body.sidebar-open #sidebar-backdrop {
      display: block;
    }
  }
  ```

- [ ] **Step 3: Commit**

  ```bash
  git add static/style.css
  git commit -m "feat(mobile): add responsive CSS — two-row top bar and sidebar drawer"
  ```

---

### Task 3: TypeScript — drawer state in main.ts

**Files:**
- Modify: `src/main.ts`

- [ ] **Step 1: Add DOM refs**

  In `src/main.ts`, after the existing `const clearBtnEl = ...` line (around line 30), add:

  ```typescript
  const sidebarToggleEl = ensure(document.getElementById("sidebar-toggle"), "#sidebar-toggle");
  const backdropEl = ensure(document.getElementById("sidebar-backdrop"), "#sidebar-backdrop");
  ```

- [ ] **Step 2: Add drawer helpers**

  After the `initTheme` function definition (around line 76), add:

  ```typescript
  // ── Sidebar drawer (mobile) ────────────────────────────────────────────
  function openSidebar() {
      document.body.classList.add("sidebar-open");
      sidebarToggleEl.setAttribute("aria-expanded", "true");
  }

  function closeSidebar() {
      document.body.classList.remove("sidebar-open");
      sidebarToggleEl.setAttribute("aria-expanded", "false");
  }
  ```

- [ ] **Step 3: Add drawer event listeners**

  After the `themeToggleEl.addEventListener("click", ...)` block (around line 86), add:

  ```typescript
  sidebarToggleEl.addEventListener("click", openSidebar);
  backdropEl.addEventListener("click", closeSidebar);

  document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && document.body.classList.contains("sidebar-open")) {
          closeSidebar();
      }
  });
  ```

- [ ] **Step 4: Auto-close drawer on episode navigation**

  Find the existing `sidebarEl.addEventListener("click", ...)` block (around line 325). Add `closeSidebar()` as the first line after the early-return guard:

  ```typescript
  sidebarEl.addEventListener("click", (e) => {
      const a = (e.target as Element).closest<HTMLAnchorElement>("a[href^='#episode/']");
      if (!a) { return; }
      closeSidebar();
      const q = queryEl.value.trim();
      if (q.length < MIN_QUERY_LENGTH) { return; }
      e.preventDefault();
      const rawPath = ensure(a.getAttribute("href"), "sidebar link missing href").slice(1);
      const cleanPath = rawPath.split("?")[0];
      navigate(`${cleanPath}?q=${encodeURIComponent(q)}`);
  });
  ```

- [ ] **Step 5: Build and verify TypeScript compiles**

  ```bash
  npm run build:ts
  ```

  Expected: no errors, `static/main.js` is updated.

- [ ] **Step 6: Commit**

  ```bash
  git add src/main.ts
  git commit -m "feat(mobile): wire sidebar drawer open/close in main.ts"
  ```

---

### Task 4: Verify end-to-end in browser

**No file changes — verification only.**

- [ ] **Step 1: Run dev server**

  ```bash
  npm run dev
  ```

  Open `http://localhost:3000` (or the port shown).

- [ ] **Step 2: Verify desktop layout is unchanged**

  On a desktop browser window (>640px wide):
  - ☰ button is not visible
  - Sidebar is visible on the right
  - Search bar is at 30% width in the single-row top bar

- [ ] **Step 3: Verify mobile layout — top bar**

  Open DevTools → toggle device toolbar → set width to 390px (iPhone 14):
  - Row 1: "הקומדי סטור" on the right, ☀️ and ☰ buttons on the left
  - Row 2: full-width search input
  - Breadcrumb below (if on a route that shows it)

- [ ] **Step 4: Verify drawer opens and closes**

  - Tap ☰ → sidebar slides in from the right, backdrop dims the content behind
  - Tap the backdrop → sidebar closes
  - Press Escape → sidebar closes
  - Tap ☰ again, then tap an episode in the sidebar → sidebar closes and episode loads

- [ ] **Step 5: Run unit tests**

  ```bash
  npm run test:unit
  ```

  Expected: all existing tests pass (no regressions — nothing in the test suite covers the new code).
