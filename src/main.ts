import type { EpisodeIndex, EpisodeLines, EpisodeMetadata } from "./types.js";
import { loadIndex, loadAll, loadEpisode, getCachedSubtitles } from "./loader.js";
import { search, MIN_QUERY_LENGTH } from "./search.js";
import { clearHighlights } from "./highlight.js";
import { renderList, filterListInPlace } from "./views/list.js";
import { renderResults } from "./views/results.js";
import { renderEpisode, applyQueryFilter } from "./views/episode.js";

// ── DOM refs ──────────────────────────────────────────────────────────
const viewEl = document.getElementById("view")!;
const queryEl = document.getElementById("query") as HTMLInputElement;
const statusEl = document.getElementById("search-status")!;
const breadcrumbEl = document.getElementById("breadcrumb")!;
const themeToggle = document.getElementById("theme-toggle")!;

// ── App state ─────────────────────────────────────────────────────────
type Route =
  | { kind: "list" }
  | { kind: "results"; query: string }
  | { kind: "episode"; id: string; lineIndex?: number };

let episodeIndex: EpisodeIndex = [];
let currentRoute: Route = { kind: "list" };
// Episode view state (kept so query changes can filter in-place)
let episodeViewState: {
  episode: EpisodeMetadata;
  lines: EpisodeLines;
  lineEls: HTMLElement[];
  listEl: HTMLElement;
} | null = null;

// ── Theme ─────────────────────────────────────────────────────────────
function initTheme() {
  const saved = localStorage.getItem("theme");
  if (saved === "dark" || saved === "light") {
    document.documentElement.dataset["theme"] = saved;
  }
}

themeToggle.addEventListener("click", () => {
  const current = document.documentElement.dataset["theme"];
  const next = current === "dark" ? "light" : "dark";
  document.documentElement.dataset["theme"] = next;
  localStorage.setItem("theme", next);
});

// ── Navigation ────────────────────────────────────────────────────────
export function navigate(hash: string) {
  window.location.hash = hash;
}

function parseHash(hash: string): Route {
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  if (!raw || raw === "list") return { kind: "list" };

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

  return { kind: "list" };
}

// ── Breadcrumb ────────────────────────────────────────────────────────
function setBreadcrumb(route: Route, prevQuery?: string) {
  const sep = `<span class="sep" aria-hidden="true">‹</span>`;
  const listLink = `<a href="#" onclick="return false;">רשימת פרקים</a>`;

  if (route.kind === "list") {
    breadcrumbEl.innerHTML = "";
    return;
  }

  if (route.kind === "results") {
    breadcrumbEl.innerHTML = `${listLink}${sep}<span>תוצאות חיפוש</span>`;
    breadcrumbEl.querySelector("a")?.addEventListener("click", () => navigate(""));
    return;
  }

  if (route.kind === "episode") {
    const ep = episodeIndex.find((e) => e.id === route.id);
    const title = ep?.title ?? route.id;

    if (prevQuery && prevQuery.trim().length >= MIN_QUERY_LENGTH) {
      const resultsLink = `<a href="#search/${encodeURIComponent(prevQuery)}">תוצאות חיפוש</a>`;
      breadcrumbEl.innerHTML = `${listLink}${sep}${resultsLink}${sep}<span>${escHtml(title)}</span>`;
      breadcrumbEl.querySelectorAll("a")[0]?.addEventListener("click", () => navigate(""));
      breadcrumbEl.querySelectorAll("a")[1]?.addEventListener("click", () =>
        navigate(`search/${encodeURIComponent(prevQuery)}`),
      );
    } else {
      breadcrumbEl.innerHTML = `${listLink}${sep}<span>${escHtml(title)}</span>`;
      breadcrumbEl.querySelector("a")?.addEventListener("click", () => navigate(""));
    }
  }
}

// ── Router ────────────────────────────────────────────────────────────
async function handleRoute(route: Route, prevQuery?: string) {
  currentRoute = route;
  episodeViewState = null;
  clearHighlights();

  if (route.kind === "list") {
    queryEl.value = "";
    setBreadcrumb(route);
    renderList(viewEl, episodeIndex, getCachedSubtitles(), "");
    return;
  }

  if (route.kind === "results") {
    queryEl.value = route.query;
    setBreadcrumb(route);

    if (episodeIndex.length === 0) {
      viewEl.innerHTML = `<p class="state-message">טוען...</p>`;
      return;
    }

    const cachedSubs = getCachedSubtitles();
    if (cachedSubs.size < episodeIndex.length) {
      viewEl.innerHTML = `<p class="state-message">טוען תמלילים...</p>`;
      return;
    }

    const results = search(episodeIndex, cachedSubs, route.query);
    setStatus(`${countTotalMatches(results)} תוצאות`);
    renderResults(viewEl, results, route.query);
    return;
  }

  if (route.kind === "episode") {
    queryEl.value = prevQuery ?? "";
    setBreadcrumb(route, prevQuery);

    const ep = episodeIndex.find((e) => e.id === route.id);
    if (!ep) {
      viewEl.innerHTML = `<p class="state-message">פרק לא נמצא.</p>`;
      return;
    }

    viewEl.innerHTML = `<p class="state-message">טוען תמלול...</p>`;
    const lines = await loadEpisode(ep);

    renderEpisode(viewEl, ep, lines, queryEl.value, route.lineIndex);

    // Keep state for in-place filtering
    const listEl = viewEl.querySelector<HTMLElement>(".transcript-list");
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

function countTotalMatches(results: ReturnType<typeof search>): number {
  return results.reduce((s, r) => s + r.matches.length, 0);
}

// ── Search input handling ─────────────────────────────────────────────
queryEl.addEventListener("input", () => {
  const q = queryEl.value;

  if (currentRoute.kind === "episode") {
    // In episode view: filter lines in-place, don't navigate
    if (episodeViewState) {
      const { listEl, lineEls, lines } = episodeViewState;
      applyQueryFilter(listEl, lineEls, lines, q);
    }
    return;
  }

  if (currentRoute.kind === "list") {
    filterListInPlace(viewEl, episodeIndex, getCachedSubtitles(), q);
    return;
  }

  // In results view: re-run search live
  if (currentRoute.kind === "results") {
    const cachedSubs = getCachedSubtitles();
    if (q.trim().length >= MIN_QUERY_LENGTH && cachedSubs.size > 0) {
      const results = search(episodeIndex, cachedSubs, q);
      setStatus(`${countTotalMatches(results)} תוצאות`);
      renderResults(viewEl, results, q);
    }
  }
});

queryEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    const q = queryEl.value.trim();
    if (q.length >= MIN_QUERY_LENGTH) {
      navigate(`search/${encodeURIComponent(q)}`);
    }
  }
});

// ── Status helpers ────────────────────────────────────────────────────
function setStatus(msg: string) {
  statusEl.textContent = msg;
}

// ── Bootstrap ─────────────────────────────────────────────────────────
async function init() {
  initTheme();

  setStatus("טוען...");

  // Parse initial route before any data loads so the URL is honoured
  const initialRoute = parseHash(window.location.hash);
  // If arriving at an episode with a query, try to recover the query from the
  // referring search (we can't know it from the hash alone, so leave it empty)
  await handleRoute(initialRoute);

  // Load episode index
  try {
    episodeIndex = await loadIndex();
  } catch (err) {
    viewEl.innerHTML = `<p class="state-message">שגיאה בטעינת רשימת הפרקים.</p>`;
    return;
  }

  // Re-render now that index is available
  await handleRoute(parseHash(window.location.hash));
  setStatus("");

  // Load all subtitles in the background
  loadAll(episodeIndex, (loaded, total) => {
    if (currentRoute.kind !== "episode") {
      setStatus(`טוען תמלילים... (${loaded}/${total})`);
    }
    // Refresh list filters as content data becomes available
    if (currentRoute.kind === "list" && queryEl.value.trim().length >= MIN_QUERY_LENGTH) {
      filterListInPlace(viewEl, episodeIndex, getCachedSubtitles(), queryEl.value);
    }
  }).then(() => {
    setStatus("");
    // If user is already in results view, re-render with full data
    if (currentRoute.kind === "results") {
      const results = search(episodeIndex, getCachedSubtitles(), currentRoute.query);
      setStatus(`${countTotalMatches(results)} תוצאות`);
      renderResults(viewEl, results, currentRoute.query);
    }
    if (currentRoute.kind === "list" && queryEl.value.trim().length >= MIN_QUERY_LENGTH) {
      filterListInPlace(viewEl, episodeIndex, getCachedSubtitles(), queryEl.value);
    }
  });
}

// ── Hash routing ──────────────────────────────────────────────────────
window.addEventListener("hashchange", () => {
  const route = parseHash(window.location.hash);
  // When navigating to an episode from the results view, carry the query
  const prevQuery =
    currentRoute.kind === "results" ? currentRoute.query :
    currentRoute.kind === "episode" && queryEl.value ? queryEl.value :
    undefined;
  handleRoute(route, prevQuery);
});

document.addEventListener("DOMContentLoaded", init);

// ── Helpers ───────────────────────────────────────────────────────────
function escHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
