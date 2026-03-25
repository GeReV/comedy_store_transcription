import type { EpisodeMetadata, EpisodeLines } from "../types.js";
import { formatTime, MIN_QUERY_LENGTH } from "../search.js";
import { applyHighlights, clearHighlights } from "../highlight.js";

export function renderEpisode(
  container: HTMLElement,
  episode: EpisodeMetadata,
  lines: EpisodeLines,
  query: string,
  scrollToLine?: number,
): void {
  clearHighlights();
  container.replaceChildren();

  const header = document.createElement("div");
  header.className = "episode-header";
  const h2 = document.createElement("h2");
  h2.textContent = episode.title;
  header.appendChild(h2);
  container.appendChild(header);

  const list = document.createElement("div");
  list.className = "transcript-list";
  container.appendChild(list);

  const lineEls: HTMLElement[] = [];
  const frag = document.createDocumentFragment();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;

    const el = document.createElement("div");
    el.className = "transcript-line";
    el.dataset["idx"] = String(i);

    const ts = document.createElement("span");
    ts.className = "ts";
    ts.textContent = formatTime(line.start);

    const text = document.createElement("span");
    text.className = "text";
    text.textContent = line.text;

    el.appendChild(ts);
    el.appendChild(text);
    frag.appendChild(el);
    lineEls.push(el);
  }

  list.appendChild(frag);

  // Apply filter / highlights
  applyQueryFilter(list, lineEls, lines, query);

  // Scroll to target line
  if (scrollToLine !== undefined) {
    const target = lineEls[scrollToLine];
    if (target) {
      target.classList.add("highlighted");
      // Defer scroll so layout is complete
      requestAnimationFrame(() => {
        target.scrollIntoView({ behavior: "smooth", block: "center" });
      });
    }
  }
}

/**
 * Filter visible lines and refresh highlights in-place.
 * Called both on initial render and when the user types in the search bar
 * while in the episode view.
 */
export function applyQueryFilter(
  list: HTMLElement,
  lineEls: HTMLElement[],
  lines: EpisodeLines,
  query: string,
): void {
  clearHighlights();

  const q = query.trim().toLowerCase();
  const filtering = q.length >= MIN_QUERY_LENGTH;

  for (let i = 0; i < lineEls.length; i++) {
    const el = lineEls[i];
    const line = lines[i];
    if (!el || !line) continue;

    const matches = filtering ? line.text.toLowerCase().includes(q) : true;
    el.classList.toggle("hidden", !matches);
  }

  if (filtering) {
    applyHighlights(query, list);
  }
}
