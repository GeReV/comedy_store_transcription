import type { EpisodeMatches } from "../types.js";
import { MAX_RESULTS, formatTime } from "../search.js";
import { navigate } from "../main.js";

export function renderResults(
  container: HTMLElement,
  results: EpisodeMatches[],
  query: string,
): void {
  container.innerHTML = "";

  if (results.length === 0) {
    container.innerHTML = `<p class="state-message">לא נמצאו תוצאות עבור "<strong>${escHtml(query)}</strong>"</p>`;
    return;
  }

  let totalLines = 0;
  let truncated = false;

  for (const { episode, matches } of results) {
    if (truncated) break;

    const section = document.createElement("div");
    section.className = "results-episode";

    const header = document.createElement("div");
    header.className = "results-episode-header";
    header.innerHTML = `
      <h2>
        <a href="#episode/${encodeURIComponent(episode.id)}"
           data-ep="${escHtml(episode.id)}">
          ${escHtml(episode.title)}
        </a>
      </h2>
      <span class="match-count">${matches.length} תוצאות</span>
    `;
    header.querySelector("a")?.addEventListener("click", (e) => {
      e.preventDefault();
      navigate(`episode/${episode.id}`);
    });
    section.appendChild(header);

    for (const match of matches) {
      if (totalLines >= MAX_RESULTS) {
        truncated = true;
        break;
      }

      const item = document.createElement("div");
      item.className = "result-item";
      item.setAttribute("role", "button");
      item.setAttribute("tabindex", "0");

      const targetHash = `episode/${episode.id}/${match.lineIndex}`;

      const lineToHtml = (
        line: { start: number; text: string } | null,
        cls: string,
      ) => {
        if (!line) return "";
        return `
          <div class="result-line ${cls}">
            <span class="ts">${escHtml(formatTime(line.start))}</span>
            <span class="text">${escHtml(line.text)}</span>
          </div>`;
      };

      item.innerHTML =
        lineToHtml(match.contextBefore, "context") +
        lineToHtml(match.line, "match") +
        lineToHtml(match.contextAfter, "context");

      const onClick = () => navigate(targetHash);
      item.addEventListener("click", onClick);
      item.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") onClick();
      });

      section.appendChild(item);
      totalLines++;
    }

    container.appendChild(section);
  }

  if (truncated) {
    const notice = document.createElement("p");
    notice.className = "overflow-notice";
    notice.textContent = `מוצגות ${MAX_RESULTS} תוצאות ראשונות — צמצם את החיפוש לתוצאות מדויקות יותר`;
    container.appendChild(notice);
  }
}

function escHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
