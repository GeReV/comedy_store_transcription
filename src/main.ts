import type { EpisodeIndex, EpisodeLines, EpisodeMetadata } from "./types.js";
import { loadIndex, loadAll, loadEpisode, getCachedSubtitles } from "./loader.js";
import { searchEpisodes, MIN_QUERY_LENGTH } from "./search.js";
import { clearHighlights } from "./highlight.js";
import { renderSidebar, updateSidebarState } from "./sidebar.js";
import { renderWelcome } from "./views/list.js";
import { renderResults } from "./views/results.js";
import { renderEpisode, applyQueryFilter } from "./views/episode.js";

// ── DOM refs ───────────────────────────────────────────────────────────
const mainPaneEl   = document.getElementById("main-pane")!;
const sidebarEl    = document.getElementById("sidebar")!;
const queryEl      = document.getElementById("query") as HTMLInputElement;
const statusEl     = document.getElementById("search-status")!;
const breadcrumbEl = document.getElementById("breadcrumb")!;
const themeToggle  = document.getElementById("theme-toggle")!;

// ── App state ──────────────────────────────────────────────────────────
type Route =
  | { kind: "welcome" }
  | { kind: "results"; query: string }
  | { kind: "episode"; id: string; lineIndex?: number };

let episodeIndex: EpisodeIndex = [];
let currentRoute: Route = { kind: "welcome" };
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

themeToggle.addEventListener("click", () => {
  const current = document.documentElement.dataset["theme"];
  const isDark =
    current === "dark" ||
    (current === undefined && matchMedia("(prefers-color-scheme: dark)").matches);
  const next = isDark ? "light" : "dark";
  document.documentElement.dataset["theme"] = next;
  localStorage.setItem("theme", next);
});

// ── Navigation ─────────────────────────────────────────────────────────
export function navigate(hash: string) {
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
  const sep = `<span class="sep" aria-hidden="true">‹</span>`;

  if (route.kind === "welcome") {
    breadcrumbEl.innerHTML = "";
    return;
  }

  if (route.kind === "results") {
    breadcrumbEl.innerHTML = `<a id="bc-home">ראשי</a>${sep}<span>תוצאות חיפוש</span>`;
    breadcrumbEl.querySelector("#bc-home")?.addEventListener("click", () => navigate(""));
    return;
  }

  if (route.kind === "episode") {
    const ep = episodeIndex.find((e) => e.id === route.id);
    const title = ep?.title ?? route.id;

    if (prevQuery && prevQuery.trim().length >= MIN_QUERY_LENGTH) {
      breadcrumbEl.innerHTML =
        `<a id="bc-home">ראשי</a>${sep}` +
        `<a id="bc-results">תוצאות חיפוש</a>${sep}` +
        `<span>${escHtml(title)}</span>`;
      breadcrumbEl.querySelector("#bc-home")?.addEventListener("click", () => navigate(""));
      breadcrumbEl.querySelector("#bc-results")?.addEventListener("click", () =>
        navigate(`search/${encodeURIComponent(prevQuery)}`),
      );
    } else {
      breadcrumbEl.innerHTML = `<a id="bc-home">ראשי</a>${sep}<span>${escHtml(title)}</span>`;
      breadcrumbEl.querySelector("#bc-home")?.addEventListener("click", () => navigate(""));
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
async function handleRoute(route: Route, prevQuery?: string) {
  currentRoute = route;
  episodeViewState = null;
  clearHighlights();
  setBreadcrumb(route, prevQuery);
  syncSidebar();

  if (route.kind === "welcome") {
    queryEl.value = "";
    renderWelcome(mainPaneEl);
    return;
  }

  if (route.kind === "results") {
    queryEl.value = route.query;
    setBreadcrumb(route);
    const subs = getCachedSubtitles();

    if (subs.size < episodeIndex.length) {
      mainPaneEl.innerHTML = `<p class="state-message">טוען תמלילים...</p>`;
      return;
    }

    const results = searchEpisodes(episodeIndex, subs, route.query);
    setStatus(`${results.reduce((s, r) => s + r.totalMatches, 0)} תוצאות`);
    renderResults(mainPaneEl, results, subs);
    return;
  }

  if (route.kind === "episode") {
    queryEl.value = prevQuery ?? "";
    setBreadcrumb(route, prevQuery);

    const ep = episodeIndex.find((e) => e.id === route.id);
    if (!ep) {
      mainPaneEl.innerHTML = `<p class="state-message">פרק לא נמצא.</p>`;
      return;
    }

    mainPaneEl.innerHTML = `<p class="state-message">טוען תמלול...</p>`;
    const lines = await loadEpisode(ep);

    renderEpisode(mainPaneEl, ep, lines, queryEl.value, route.lineIndex);

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

  // Always sync sidebar highlights as the user types
  syncSidebar();

  if (currentRoute.kind === "episode") {
    // Filter transcript in-place without navigating away
    if (episodeViewState) {
      const { listEl, lineEls, lines } = episodeViewState;
      applyQueryFilter(listEl, lineEls, lines, q);
    }
    return;
  }

  const subs = getCachedSubtitles();
  if (q.trim().length >= MIN_QUERY_LENGTH && subs.size > 0) {
    const results = searchEpisodes(episodeIndex, subs, q);
    setStatus(`${results.reduce((s, r) => s + r.totalMatches, 0)} תוצאות`);
    renderResults(mainPaneEl, results, subs);
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
    mainPaneEl.innerHTML = `<p class="state-message">שגיאה בטעינת רשימת הפרקים.</p>`;
    return;
  }

  renderSidebar(sidebarEl, episodeIndex);

  const initialRoute = parseHash(window.location.hash);
  await handleRoute(initialRoute);
  setStatus("");

  // Background-load all subtitle files
  loadAll(episodeIndex, (loaded, total) => {
    if (currentRoute.kind !== "episode") {
      setStatus(`טוען תמלילים... (${loaded}/${total})`);
    }
    syncSidebar();
  }).then(() => {
    setStatus("");
    if (currentRoute.kind === "results") {
      const subs = getCachedSubtitles();
      const results = searchEpisodes(episodeIndex, subs, currentRoute.query);
      setStatus(`${results.reduce((s, r) => s + r.totalMatches, 0)} תוצאות`);
      renderResults(mainPaneEl, results, subs);
    }
    syncSidebar();
  });
}

// ── Hash routing ───────────────────────────────────────────────────────
window.addEventListener("hashchange", () => {
  const route = parseHash(window.location.hash);
  const prevQuery =
    currentRoute.kind === "results" ? currentRoute.query :
    currentRoute.kind === "episode" && queryEl.value ? queryEl.value :
    undefined;
  handleRoute(route, prevQuery);
});

document.addEventListener("DOMContentLoaded", init);

// ── Helpers ────────────────────────────────────────────────────────────
function escHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
