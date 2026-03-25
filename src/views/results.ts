import type { EpisodeSearchResult, EpisodeLines, DisplayEntry } from "../types.js";
import { MAX_ENTRIES_PER_GROUP, formatTime } from "../search.js";
import { navigate } from "../main.js";

const noResultsEl = document.createElement("p");
noResultsEl.className = "state-message";
noResultsEl.textContent = "לא נמצאו תוצאות";

export function renderResults(
  container: HTMLElement,
  results: EpisodeSearchResult[],
  subtitles: Map<string, EpisodeLines>,
): void {
  container.replaceChildren();

  if (results.length === 0) {
    container.replaceChildren(noResultsEl);
    return;
  }

  const totalMatches = results.reduce((s, r) => s + r.totalMatches, 0);
  const summary = document.createElement("p");
  summary.className = "results-summary";
  summary.textContent = `${totalMatches} תוצאות ב־${results.length} פרקים`;
  container.appendChild(summary);

  for (const { episode, entries, totalMatches: epTotal } of results) {
    const lines = subtitles.get(episode.id) ?? [];

    const section = document.createElement("div");
    section.className = "results-episode";

    const header = document.createElement("div");
    header.className = "results-episode-header";

    const titleEl = document.createElement("span");
    titleEl.className = "results-episode-title";
    titleEl.textContent = episode.title;
    titleEl.addEventListener("click", () => navigate(`episode/${episode.id}`));

    const countEl = document.createElement("span");
    countEl.className = "results-episode-count";
    countEl.textContent = `${epTotal} תוצאות`;

    header.appendChild(titleEl);
    header.appendChild(countEl);
    section.appendChild(header);

    const visible = entries.slice(0, MAX_ENTRIES_PER_GROUP);
    const overflow = entries.slice(MAX_ENTRIES_PER_GROUP);

    for (const entry of visible) {
      section.appendChild(renderEntry(entry, lines, episode.id));
    }

    if (overflow.length > 0) {
      const overflowEl = document.createElement("div");
      overflowEl.className = "entries-overflow hidden";
      for (const entry of overflow) {
        overflowEl.appendChild(renderEntry(entry, lines, episode.id));
      }
      section.appendChild(overflowEl);

      const btn = document.createElement("button");
      btn.className = "show-more-btn";
      btn.textContent = `הצג עוד ${overflow.length} תוצאות`;
      btn.addEventListener("click", () => {
        overflowEl.classList.remove("hidden");
        btn.remove();
      });
      section.appendChild(btn);
    }

    container.appendChild(section);
  }
}

function renderEntry(
  entry: DisplayEntry,
  lines: EpisodeLines,
  episodeId: string,
): HTMLElement {
  const el = document.createElement("div");
  el.className = "result-entry";

  for (let i = entry.startIdx; i <= entry.endIdx; i++) {
    const line = lines[i];
    if (!line) continue;

    const isMatch = entry.matchIndices.has(i);
    const row = document.createElement("div");
    row.className = `result-line ${isMatch ? "match" : "context"}`;

    const ts = document.createElement("span");
    ts.className = "ts";
    ts.textContent = formatTime(line.start);

    const text = document.createElement("span");
    text.className = "text";
    text.textContent = line.text;

    row.appendChild(ts);
    row.appendChild(text);
    row.addEventListener("click", () => navigate(`episode/${episodeId}/${i}`));
    el.appendChild(row);
  }

  return el;
}
