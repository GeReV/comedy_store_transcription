# Mobile Responsive Layout

**Date:** 2026-03-29
**Scope:** Make the Comedy Store transcripts site usable on mobile devices (≤640px).

## Problem

The site has no mobile media queries. On a phone:
- The two-pane layout (fixed 260px sidebar + main) leaves too little room for content.
- The search bar is fixed at 30% width — too narrow to type comfortably.
- The top bar is a single cramped row.

## Decisions

- **Breakpoint:** `max-width: 640px`
- **Sidebar:** drawer/overlay (slides in from the right, RTL). Default: hidden.
- **Top bar:** two-row layout on mobile — row 1: title + controls, row 2: full-width search.
- **Implementation:** additive CSS media query block + minimal TypeScript for drawer state. Desktop is untouched.

---

## Section 1 — HTML (`static/index.html`)

Two additions:

1. **Sidebar toggle button** — `<button id="sidebar-toggle" aria-label="פתח רשימת פרקים">☰</button>` — inserted after `#theme-toggle` inside `#top-bar-inner`. Hidden on desktop via `display: none`; shown on mobile.

2. **Backdrop** — `<div id="sidebar-backdrop" aria-hidden="true"></div>` — inserted between `#top-bar` and `#layout` in the body. Hidden on desktop; shown as a dimming overlay when the drawer is open.

---

## Section 2 — CSS (`static/style.css`)

A single `@media (max-width: 640px)` block appended to the end of the stylesheet. No existing rules are modified.

```
@media (max-width: 640px) {
  /* Top bar: allow two rows */
  #top-bar-inner       flex-wrap: wrap
  h1                   flex: 1 (expands to fill row 1 beside buttons)
  #sidebar-toggle      display: inline-flex (shown on mobile)
  #search-bar          width: 100%; order: 3  → wraps to row 2, full width
  #theme-toggle        order: 2
  #sidebar-toggle      order: 2

  /* Sidebar: fixed drawer, slides in from right (RTL) */
  #sidebar             position: fixed; top: 0; right: 0; height: 100%
                       width: 80%; max-width: 300px
                       transform: translateX(100%); transition: transform .25s
                       z-index: 20

  body.sidebar-open #sidebar     transform: translateX(0)

  /* Backdrop */
  #sidebar-backdrop    position: fixed; inset: 0; background: rgba(0,0,0,.4)
                       z-index: 19; display: none

  body.sidebar-open #sidebar-backdrop    display: block

  /* Layout: main pane takes full width */
  #layout              (sidebar removed from flow by fixed positioning)
}
```

Desktop layout is completely unchanged.

---

## Section 3 — TypeScript (`src/main.ts`)

### New DOM refs
```ts
const sidebarToggleEl = ensure(document.getElementById("sidebar-toggle"), "#sidebar-toggle");
const backdropEl      = ensure(document.getElementById("sidebar-backdrop"), "#sidebar-backdrop");
```

### Drawer helpers
```ts
function openSidebar()  { document.body.classList.add("sidebar-open"); }
function closeSidebar() { document.body.classList.remove("sidebar-open"); }
```

### Event listeners (4 additions)
| Trigger | Action |
|---------|--------|
| `sidebarToggleEl` click | `openSidebar()` |
| `backdropEl` click | `closeSidebar()` |
| `document` keydown `Escape` (when sidebar open) | `closeSidebar()` |
| `sidebarEl` click (extend existing listener) | call `closeSidebar()` after any episode link click |

No changes to `handleRoute`, routing, or any other logic.

---

## Out of scope

- Footer layout (already simple enough on mobile)
- Touch gestures (swipe to close)
- Per-episode scroll position on mobile
- Any visual polish beyond functional usability
