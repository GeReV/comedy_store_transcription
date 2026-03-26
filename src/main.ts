import type { EpisodeIndex, EpisodeLines, EpisodeMetadata } from "./types.js";
import { loadIndex, loadAll, loadEpisode, getCachedSubtitles } from "./loader.js";
import { searchEpisodes, MIN_QUERY_LENGTH } from "./search.js";
import { applyHighlights, clearHighlights } from "./highlight.js";
import { renderSidebar, updateSidebarState } from "./sidebar.js";
import { renderWelcome } from "./views/list.js";
import { renderResults } from "./views/results.js";
import { renderEpisode, applyQueryFilter } from "./views/episode.js";
import { ensure } from "./utils.js";
import { measure } from "./perf.js";

// ── Utilities ──────────────────────────────────────────────────────────
function makeStateMsg(text: string): HTMLParagraphElement {
  const p = document.createElement("p");
  p.className = "state-message";
  p.textContent = text;
  return p;
}

// ── DOM refs ───────────────────────────────────────────────────────────
const mainPaneEl   = ensure(document.getElementById("main-pane"), "#main-pane");
const sidebarEl    = ensure(document.getElementById("sidebar"), "#sidebar");
const queryEl      = ensure(document.querySelector<HTMLInputElement>("#query"), "#query");
const statusEl     = ensure(document.getElementById("search-status"), "#search-status");
const breadcrumbEl = ensure(document.getElementById("breadcrumb"), "#breadcrumb");
const themeToggleEl  = ensure(document.getElementById("theme-toggle"), "#theme-toggle");
const clearBtnEl     = ensure(document.querySelector<HTMLButtonElement>("#query-clear"), "#query-clear");

// ── Cached state message elements ──────────────────────────────────────
const loadingSubsMsg    = makeStateMsg("טוען תמלילים...");
const episodeNotFoundMsg = makeStateMsg("פרק לא נמצא.");
const loadingEpisodeMsg = makeStateMsg("טוען תמלול...");
const loadErrorMsg      = makeStateMsg("שגיאה בטעינת רשימת הפרקים.");

// ── Cached breadcrumb parts ─────────────────────────────────────────────
const sepTemplate = document.createElement("span");
sepTemplate.className = "sep";
sepTemplate.setAttribute("aria-hidden", "true");
sepTemplate.textContent = "‹";

const bcHomeLink = document.createElement("a");
bcHomeLink.href = "#";
bcHomeLink.textContent = "ראשי";

function makeSep(): Node { return sepTemplate.cloneNode(true); }

function makeSpan(text: string): HTMLSpanElement {
  const span = document.createElement("span");
  span.textContent = text;
  return span;
}

// ── App state ──────────────────────────────────────────────────────────
type Route =
  | { kind: "welcome" }
  | { kind: "results"; query: string }
  | { kind: "episode"; id: string; lineIndex?: number };

let episodeIndex: EpisodeIndex = [];
let currentRoute: Route = { kind: "welcome" };
let isPopState = false;
let episodeViewState: {
  episode: EpisodeMetadata;
  lines: EpisodeLines;
  lineEls: HTMLElement[];
  listEl: HTMLElement;
} | null = null;

// ── Theme ──────────────────────────────────────────────────────────────
function initTheme() {
  const saved = localStorage.getItem("theme");
  if (saved === "dark" || saved === "light") {
    document.documentElement.dataset["theme"] = saved;
  }
}

themeToggleEl.addEventListener("click", () => {
  const current = document.documentElement.dataset["theme"];
  const isDark =
    current === "dark" ||
    (current === undefined && matchMedia("(prefers-color-scheme: dark)").matches);
  const next = isDark ? "light" : "dark";
  document.documentElement.dataset["theme"] = next;
  localStorage.setItem("theme", next);
});

// ── Scroll persistence ─────────────────────────────────────────────────
let scrollSaveTimer = 0;
mainPaneEl.addEventListener("scroll", () => {
  clearTimeout(scrollSaveTimer);
  scrollSaveTimer = setTimeout(() => {
    history.replaceState({ ...history.state, scroll: mainPaneEl.scrollTop }, "");
  }, 150);
}, { passive: true });

// ── Navigation ─────────────────────────────────────────────────────────
function navigate(hash: string) {
  // Save current scroll before leaving
  history.replaceState({ ...history.state, scroll: mainPaneEl.scrollTop }, "");
  // When jumping to an episode from in-memory search results (user hasn't pressed
  // Enter, so #search/... isn't in the browser history yet), silently insert it
  // first so the native Back button returns to the results rather than welcome.
  if (
    currentRoute.kind === "results" &&
    hash.startsWith("episode/") &&
    !window.location.hash.startsWith("#search/")
  ) {
    history.pushState(null, "", `#search/${encodeURIComponent(currentRoute.query)}`);
  }
  window.location.hash = hash;
}

function parseHash(hash: string): Route {
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
      const lineIndex = parseInt(rest.slice(slashIdx + 1), 10);
      return { kind: "episode", id, lineIndex: isNaN(lineIndex) ? undefined : lineIndex };
    }
    return { kind: "episode", id: decodeURIComponent(rest) };
  }

  return { kind: "welcome" };
}

// ── Breadcrumb ─────────────────────────────────────────────────────────
function setBreadcrumb(route: Route, prevQuery?: string) {
  if (route.kind === "welcome") {
    breadcrumbEl.replaceChildren();
    return;
  }

  if (route.kind === "results") {
    breadcrumbEl.replaceChildren(bcHomeLink, makeSep(), makeSpan("תוצאות חיפוש"));
    return;
  }

  if (route.kind === "episode") {
    const ep = episodeIndex.find((e) => e.id === route.id);
    const title = ep?.title ?? route.id;

    if (prevQuery && prevQuery.trim().length >= MIN_QUERY_LENGTH) {
      const resultsLink = document.createElement("a");
      resultsLink.href = `#search/${encodeURIComponent(prevQuery)}`;
      resultsLink.textContent = "תוצאות חיפוש";
      breadcrumbEl.replaceChildren(bcHomeLink, makeSep(), resultsLink, makeSep(), makeSpan(title));
    } else {
      breadcrumbEl.replaceChildren(bcHomeLink, makeSep(), makeSpan(title));
    }
  }
}

// ── Sidebar helper ─────────────────────────────────────────────────────
function syncSidebar() {
  updateSidebarState(
    sidebarEl,
    getCachedSubtitles(),
    queryEl.value,
    currentRoute.kind === "episode" ? currentRoute.id : undefined,
  );
}

// ── Router ─────────────────────────────────────────────────────────────
async function handleRoute(route: Route, prevQuery?: string, savedScroll = 0) {
  currentRoute = route;
  episodeViewState = null;
  clearHighlights();
  setBreadcrumb(route, prevQuery);
  syncSidebar();

  if (route.kind === "welcome") {
    queryEl.value = "";
    renderWelcome(mainPaneEl);
    mainPaneEl.scrollTop = savedScroll;
    return;
  }

  if (route.kind === "results") {
    queryEl.value = route.query;
    setBreadcrumb(route);
    const subs = getCachedSubtitles();

    if (subs.size < episodeIndex.length) {
      mainPaneEl.replaceChildren(loadingSubsMsg);
      return;
    }

    const results = measure("search", () => searchEpisodes(episodeIndex, subs, route.query));
    setStatus(`${results.reduce((s, r) => s + r.totalMatches, 0)} תוצאות`);
    measure("render:results", () => renderResults(mainPaneEl, results, subs, route.query));
    applyHighlights(route.query, mainPaneEl);
    mainPaneEl.scrollTop = savedScroll;
    return;
  }

  if (route.kind === "episode") {
    queryEl.value = route.lineIndex !== undefined ? "" : (prevQuery ?? "");
    setBreadcrumb(route, prevQuery);

    const ep = episodeIndex.find((e) => e.id === route.id);
    if (!ep) {
      mainPaneEl.replaceChildren(episodeNotFoundMsg);
      return;
    }

    mainPaneEl.replaceChildren(loadingEpisodeMsg);
    const lines = await loadEpisode(ep);

    measure("render:episode", () => renderEpisode(mainPaneEl, ep, lines, queryEl.value, route.lineIndex));

    if (route.lineIndex === undefined) {
      requestAnimationFrame(() => { mainPaneEl.scrollTop = savedScroll; });
    }

    const listEl = mainPaneEl.querySelector<HTMLElement>(".transcript-list");
    if (listEl) {
      episodeViewState = {
        episode: ep,
        lines,
        lineEls: Array.from(listEl.querySelectorAll<HTMLElement>(".transcript-line")),
        listEl,
      };
    }
  }
}

// ── Search input handling ──────────────────────────────────────────────
queryEl.addEventListener("input", () => {
  const q = queryEl.value;
  clearBtnEl.hidden = q.length === 0;

  // Always sync sidebar highlights as the user types
  syncSidebar();

  if (currentRoute.kind === "episode") {
    // Filter transcript in-place without navigating away
    if (episodeViewState) {
      const { listEl, lineEls, lines } = episodeViewState;
      measure("filter:episode", () => applyQueryFilter(listEl, lineEls, lines, q));
    }
    return;
  }

  const subs = getCachedSubtitles();
  if (q.trim().length >= MIN_QUERY_LENGTH && subs.size > 0) {
    const results = measure("search", () => searchEpisodes(episodeIndex, subs, q));
    setStatus(`${results.reduce((s, r) => s + r.totalMatches, 0)} תוצאות`);
    measure("render:results", () => renderResults(mainPaneEl, results, subs, q));
    applyHighlights(q, mainPaneEl);
    currentRoute = { kind: "results", query: q };
  } else if (q.trim().length === 0) {
    setStatus("");
    renderWelcome(mainPaneEl);
    currentRoute = { kind: "welcome" };
  }
});

queryEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    const q = queryEl.value.trim();
    if (q.length >= MIN_QUERY_LENGTH) {
      navigate(`search/${encodeURIComponent(q)}`);
    }
  }
  if (e.key === "Escape") {
    queryEl.value = "";
    queryEl.dispatchEvent(new Event("input"));
  }
});

// ── Clear button ───────────────────────────────────────────────────────
clearBtnEl.addEventListener("click", () => {
  queryEl.value = "";
  clearBtnEl.hidden = true;
  queryEl.dispatchEvent(new Event("input"));
  queryEl.focus();
});

// ── Status ─────────────────────────────────────────────────────────────
function setStatus(msg: string) {
  statusEl.textContent = msg;
}

// ── Bootstrap ──────────────────────────────────────────────────────────
async function init() {
  initTheme();
  setStatus("טוען...");

  try {
    episodeIndex = await loadIndex();
  } catch {
    mainPaneEl.replaceChildren(loadErrorMsg);
    return;
  }

  renderSidebar(sidebarEl, episodeIndex);

  const initialRoute = parseHash(window.location.hash);
  await handleRoute(initialRoute);
  setStatus("");

  // Background-load all subtitle files as a single bundle
  loadAll(episodeIndex, (loaded, total) => {
    if (currentRoute.kind !== "episode") {
      const pct = total > 0 ? ` ${Math.round(loaded / total * 100)}%` : "";
      setStatus(`טוען תמלילים...${pct}`);
    }
  }).then(() => {
    setStatus("");
    if (currentRoute.kind === "results") {
      const subs = getCachedSubtitles();
      const results = measure("search", () => searchEpisodes(episodeIndex, subs, currentRoute.query));
      setStatus(`${results.reduce((s, r) => s + r.totalMatches, 0)} תוצאות`);
      measure("render:results", () => renderResults(mainPaneEl, results, subs, currentRoute.query));
      applyHighlights(currentRoute.query, mainPaneEl);
    }
    syncSidebar();
  });
}

// ── Hash routing ───────────────────────────────────────────────────────
// popstate fires before hashchange on native Back/Forward.
window.addEventListener("popstate", () => {
  isPopState = true;
});

window.addEventListener("hashchange", () => {
  const savedScroll = isPopState ? (history.state?.scroll ?? 0) : 0;
  isPopState = false;
  const route = parseHash(window.location.hash);
  const prevQuery =
    currentRoute.kind === "results" ? currentRoute.query :
    currentRoute.kind === "episode" && queryEl.value ? queryEl.value :
    undefined;
  handleRoute(route, prevQuery, savedScroll);
});

document.addEventListener("DOMContentLoaded", init);
