import type {EpisodeIndex, EpisodeLines, EpisodeMetadata} from "./types.js";
import {parseHash, buildEpisodeHash} from "./router.js";
import type {Route} from "./router.js";
import {loadBundle, loadEpisode, getCachedSubtitles, getEpisodeChapters} from "./loader.js";
import {searchEpisodes, MIN_QUERY_LENGTH} from "./search.js";
import {applyHighlights, clearHighlights} from "./highlight.js";
import {renderSidebar, updateSidebarState} from "./sidebar.js";
import {renderWelcome} from "./views/list.js";
import {renderResults} from "./views/results.js";
import {renderEpisode, applyQueryFilter} from "./views/episode.js";
import type {ChapterBlockData} from "./views/episode.js";
import {ensure} from "./utils.js";
import {measure} from "./perf.js";

// ── Utilities ──────────────────────────────────────────────────────────
function makeStateMsg(text: string): HTMLParagraphElement {
    const p = document.createElement("p");
    p.className = "state-message";
    p.textContent = text;
    return p;
}

// ── DOM refs ───────────────────────────────────────────────────────────
const mainPaneEl = ensure(document.getElementById("main-pane"), "#main-pane");
const sidebarEl = ensure(document.getElementById("sidebar"), "#sidebar");
const queryEl = ensure(document.querySelector<HTMLInputElement>("#query"), "#query");
const statusEl = ensure(document.getElementById("search-status"), "#search-status");
const breadcrumbEl = ensure(document.getElementById("breadcrumb"), "#breadcrumb");
const themeToggleEl = ensure(document.getElementById("theme-toggle"), "#theme-toggle");
const clearBtnEl = ensure(document.querySelector<HTMLButtonElement>("#query-clear"), "#query-clear");

// ── Cached state message elements ──────────────────────────────────────
const loadingSubsMsg = makeStateMsg("טוען תמלילים...");
const episodeNotFoundMsg = makeStateMsg("פרק לא נמצא.");
const loadingEpisodeMsg = makeStateMsg("טוען תמלול...");
const loadErrorMsg = makeStateMsg("שגיאה בטעינת רשימת הפרקים.");

// ── Cached breadcrumb parts ─────────────────────────────────────────────
const sepTemplate = document.createElement("span");
sepTemplate.className = "sep";
sepTemplate.setAttribute("aria-hidden", "true");
sepTemplate.textContent = "›";

const bcHomeLink = document.createElement("a");
bcHomeLink.href = "#";
bcHomeLink.textContent = "ראשי";

function makeSep(): Node {
    return sepTemplate.cloneNode(true);
}

function makeSpan(text: string): HTMLSpanElement {
    const span = document.createElement("span");
    span.textContent = text;
    return span;
}

// ── App state ──────────────────────────────────────────────────────────
let episodeIndex: EpisodeIndex = [];
let currentRoute: Route = {kind: "welcome"};
let isPopState = false;
let episodeViewState: {
    episode: EpisodeMetadata;
    lines: EpisodeLines;
    lineEls: HTMLElement[];
    listEl: HTMLElement;
    chapterBlocks?: ChapterBlockData[];
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
        history.replaceState({...history.state, scroll: mainPaneEl.scrollTop}, "");
    }, 150);
}, {passive: true});

// ── Navigation ─────────────────────────────────────────────────────────
function navigate(hash: string) {
    history.replaceState({...history.state, scroll: mainPaneEl.scrollTop}, "");
    window.location.hash = hash;
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
        return;
    }

    if (route.kind === "chapter") {
        const ep = episodeIndex.find((e) => e.id === route.episodeId);
        const epTitle = ep?.title ?? route.episodeId;
        const chapters = getEpisodeChapters(route.episodeId);
        const ch = chapters?.[route.chapterIdx - 1];
        const chLabel = ch?.name || `סצינה ${route.chapterIdx}`;

        const epLink = document.createElement("a");
        epLink.href = `#episode/${encodeURIComponent(route.episodeId)}`;
        epLink.textContent = epTitle;
        breadcrumbEl.replaceChildren(bcHomeLink, makeSep(), epLink, makeSep(), makeSpan(chLabel));
    }
}

// ── Sidebar helper ─────────────────────────────────────────────────────
function syncSidebar() {
    const activeId =
        currentRoute.kind === "episode" ? currentRoute.id :
        currentRoute.kind === "chapter" ? currentRoute.episodeId :
        undefined;
    updateSidebarState(sidebarEl, getCachedSubtitles(), queryEl.value, activeId);
}

// ── Router ─────────────────────────────────────────────────────────────
async function handleRoute(route: Route, savedScroll = 0) {
    currentRoute = route;
    episodeViewState = null;
    clearHighlights();

    // Set query input before syncSidebar so the sidebar reflects this route's query,
    // not whatever the previous route left in the input.
    const newQuery =
        route.kind === "results" ? route.query :
        route.kind === "episode" ? route.query ?? "" :
        "";
    queryEl.value = newQuery;
    clearBtnEl.hidden = newQuery.length === 0;

    const crumbQuery = route.kind === "episode" ? route.query : undefined;
    setBreadcrumb(route, crumbQuery);
    syncSidebar();
    setStatus("");

    if (route.kind === "welcome") {
        renderWelcome(mainPaneEl);
        mainPaneEl.scrollTop = savedScroll;
        return;
    }

    if (route.kind === "results") {
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

    if (route.kind === "chapter") {
        const ep = episodeIndex.find((e) => e.id === route.episodeId);
        if (!ep) {
            mainPaneEl.replaceChildren(episodeNotFoundMsg);
            return;
        }

        mainPaneEl.replaceChildren(loadingEpisodeMsg);
        const lines = await loadEpisode(ep);
        const chapters = getEpisodeChapters(ep.id);

        const renderResult = measure("render:episode", () =>
            renderEpisode(mainPaneEl, ep, lines, "", undefined, chapters),
        );

        if (renderResult.chapterBlocks) {
            for (const block of renderResult.chapterBlocks) {
                block.el.hidden = block.chapterIdx !== route.chapterIdx;
            }
        }

        mainPaneEl.scrollTop = 0;

        episodeViewState = {
            episode: ep,
            lines,
            lineEls: renderResult.lineEls,
            listEl: renderResult.listEl,
            chapterBlocks: renderResult.chapterBlocks,
        };
    }
}

// ── Search input handling ──────────────────────────────────────────────
queryEl.addEventListener("input", () => {
    const q = queryEl.value;
    clearBtnEl.hidden = q.length === 0;

    // Always sync sidebar highlights as the user types
    syncSidebar();

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

    const subs = getCachedSubtitles();
    if (q.trim().length >= MIN_QUERY_LENGTH && subs.size > 0) {
        const results = measure("search", () => searchEpisodes(episodeIndex, subs, q));
        setStatus(`${results.reduce((s, r) => s + r.totalMatches, 0)} תוצאות`);
        measure("render:results", () => renderResults(mainPaneEl, results, subs, q));
        applyHighlights(q, mainPaneEl);

        const encoded = `#search/${encodeURIComponent(q)}`;

        if (currentRoute.kind !== "results") {
            history.pushState(null, "", encoded);
        } else {
            history.replaceState({...history.state}, "", encoded);
        }

        currentRoute = {kind: "results", query: q};
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
});

queryEl.addEventListener("keydown", (e) => {
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

// ── Sidebar query carry-through ────────────────────────────────────────
sidebarEl.addEventListener("click", (e) => {
    const a = (e.target as Element).closest<HTMLAnchorElement>("a[href^='#episode/']");
    if (!a) { return; }
    const q = queryEl.value.trim();
    if (q.length < MIN_QUERY_LENGTH) { return; }
    e.preventDefault();
    const rawPath = ensure(a.getAttribute("href"), "sidebar link missing href").slice(1);
    const cleanPath = rawPath.split("?")[0];
    navigate(`${cleanPath}?q=${encodeURIComponent(q)}`);
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
        episodeIndex = await loadBundle((loaded, total) => {
            const pct = total > 0 ? ` ${Math.round(loaded / total * 100)}%` : "";
            setStatus(`טוען...${pct}`);
        });
    } catch {
        mainPaneEl.replaceChildren(loadErrorMsg);
        return;
    }

    renderSidebar(sidebarEl, episodeIndex);

    const initialRoute = parseHash(window.location.hash);
    await handleRoute(initialRoute);

    setStatus("");

    if (currentRoute.kind === "results") {
        const subs = getCachedSubtitles();

        const results = measure("search", () => {
            if (currentRoute.kind === "results") {
                return searchEpisodes(episodeIndex, subs, currentRoute.query);
            }

            return [];
        });

        setStatus(`${results.reduce((s, r) => s + r.totalMatches, 0)} תוצאות`);

        measure("render:results", () => {
            if (currentRoute.kind === "results") {
                renderResults(mainPaneEl, results, subs, currentRoute.query);
            }
        });

        applyHighlights(currentRoute.query, mainPaneEl);
    }

    syncSidebar();
}

// ── Hash routing ───────────────────────────────────────────────────────
// popstate fires before hashchange on native Back/Forward.
window.addEventListener("popstate", () => {
    isPopState = true;
});

window.addEventListener("hashchange", () => {
    const savedScroll = isPopState ? (history.state?.scroll ?? 0) : 0;
    isPopState = false;
    void handleRoute(parseHash(window.location.hash), savedScroll);
});

document.addEventListener("DOMContentLoaded", init);
