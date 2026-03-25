import type { EpisodeIndex, EpisodeLines } from "../types.js";
import { episodeHasMatch, MIN_QUERY_LENGTH } from "../search.js";
import { navigate } from "../main.js";

export function renderList(
  container: HTMLElement,
  index: EpisodeIndex,
  subtitles: Map<string, EpisodeLines>,
  query: string,
): void {
  container.innerHTML = "";

  if (index.length === 0) {
    container.innerHTML = `<p class="state-message">טוען פרקים...</p>`;
    return;
  }

  const grid = document.createElement("div");
  grid.className = "episode-grid";

  const q = query.trim().toLowerCase();
  const filterByContent = q.length >= MIN_QUERY_LENGTH && subtitles.size > 0;

  let visibleCount = 0;

  for (const ep of index) {
    const card = document.createElement("div");
    card.className = "episode-card";
    card.dataset["epId"] = ep.id;

    const lines = subtitles.get(ep.id);
    const lineCount = lines?.length ?? 0;

    // Determine visibility
    let visible = true;
    if (q.length >= MIN_QUERY_LENGTH) {
      const titleMatch = ep.title.toLowerCase().includes(q);
      const contentMatch = filterByContent && lines
        ? episodeHasMatch(lines, q)
        : false;
      visible = titleMatch || contentMatch;
    }

    if (!visible) {
      card.classList.add("hidden");
    } else {
      visibleCount++;
    }

    card.innerHTML = `
      <h2>${escHtml(ep.title)}</h2>
      <p class="meta">${lineCount > 0 ? `${lineCount} שורות` : "טוען..."}</p>
    `;
    card.addEventListener("click", () => navigate(`episode/${ep.id}`));
    grid.appendChild(card);
  }

  container.appendChild(grid);

  if (q.length >= MIN_QUERY_LENGTH && visibleCount === 0) {
    container.innerHTML = `<p class="state-message">לא נמצאו פרקים התואמים "<strong>${escHtml(q)}</strong>"</p>`;
  }
}

/** Update card visibility in-place without a full re-render. */
export function filterListInPlace(
  container: HTMLElement,
  index: EpisodeIndex,
  subtitles: Map<string, EpisodeLines>,
  query: string,
): void {
  const q = query.trim().toLowerCase();
  const filterByContent = q.length >= MIN_QUERY_LENGTH && subtitles.size > 0;

  const cards = container.querySelectorAll<HTMLElement>(".episode-card");
  let visibleCount = 0;

  for (const card of cards) {
    const epId = card.dataset["epId"];
    const ep = index.find((e) => e.id === epId);
    if (!ep) continue;

    const lines = subtitles.get(ep.id);
    let visible = true;

    if (q.length >= MIN_QUERY_LENGTH) {
      const titleMatch = ep.title.toLowerCase().includes(q);
      const contentMatch = filterByContent && lines
        ? episodeHasMatch(lines, q)
        : false;
      visible = titleMatch || contentMatch;
    }

    card.classList.toggle("hidden", !visible);
    if (visible) visibleCount++;

    // Update line count if it was missing before
    const meta = card.querySelector(".meta");
    if (meta && lines && meta.textContent === "טוען...") {
      meta.textContent = `${lines.length} שורות`;
    }
  }

  // Show/hide empty state
  let emptyMsg = container.querySelector<HTMLElement>(".state-message");
  if (q.length >= MIN_QUERY_LENGTH && visibleCount === 0) {
    if (!emptyMsg) {
      emptyMsg = document.createElement("p");
      emptyMsg.className = "state-message";
      container.appendChild(emptyMsg);
    }
    emptyMsg.innerHTML = `לא נמצאו פרקים התואמים "<strong>${escHtml(q)}</strong>"`;
  } else if (emptyMsg) {
    emptyMsg.remove();
  }
}

function escHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
