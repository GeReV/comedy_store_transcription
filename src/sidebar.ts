import type { EpisodeIndex, EpisodeLines } from "./types.js";
import { episodeHasMatch, MIN_QUERY_LENGTH } from "./search.js";
import { navigate } from "./main.js";

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
    li.textContent = ep.title;
    li.title = ep.title;
    li.addEventListener("click", () => navigate(`episode/${ep.id}`));
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

  let currentEl: HTMLElement | null = null;

  for (const li of container.querySelectorAll<HTMLElement>(".sidebar-item")) {
    const epId = li.dataset["epId"] ?? "";

    const isCurrent = epId === currentEpisodeId;
    li.classList.toggle("current", isCurrent);
    if (isCurrent) currentEl = li;

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
