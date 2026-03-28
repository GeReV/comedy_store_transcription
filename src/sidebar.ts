import type { EpisodeIndex, EpisodeLines } from "./types.js";
import { episodeHasMatch, MIN_QUERY_LENGTH } from "./search.js";

export function renderSidebar(
  container: HTMLElement,
  index: EpisodeIndex,
): void {
  const ul = document.createElement("ul");
  ul.className = "sidebar-list";
  for (const ep of index) {
    const li = document.createElement("li");
    li.className = "sidebar-item";
    li.dataset["epId"] = ep.id;

    const a = document.createElement("a");
    a.className = "sidebar-link";
    a.href = `#episode/${ep.id}`;
    a.textContent = ep.title;
    a.title = ep.title;

    li.appendChild(a);
    ul.appendChild(li);
  }
  container.replaceChildren(ul);
}

/**
 * Update sidebar item states (current / has-match / no-match) without
 * re-creating the DOM.
 */
export function updateSidebarState(
  container: HTMLElement,
  subtitles: Map<string, EpisodeLines>,
  query: string,
  currentEpisodeId?: string,
): void {
  const q = query.trim().toLowerCase();
  const filtering = q.length >= MIN_QUERY_LENGTH && subtitles.size > 0;

  const listEl = container.querySelector<HTMLElement>(".sidebar-list");
  listEl?.classList.toggle("filtered", filtering);

  let currentEl: HTMLElement | null = null;

  for (const li of container.querySelectorAll<HTMLElement>(".sidebar-item")) {
    const epId = li.dataset["epId"] ?? "";

    const isCurrent = epId === currentEpisodeId;
    li.classList.toggle("current", isCurrent);

    if (isCurrent) {
      currentEl = li;
    }

    if (filtering) {
      const lines = subtitles.get(epId);
      const hasMatch = lines ? episodeHasMatch(lines, q) : false;
      li.classList.toggle("has-match", hasMatch);
      li.classList.toggle("no-match", !hasMatch);
    } else {
      li.classList.remove("has-match", "no-match");
    }
  }

  // Scroll current episode into view within the sidebar
  currentEl?.scrollIntoView({ block: "nearest" });
}
