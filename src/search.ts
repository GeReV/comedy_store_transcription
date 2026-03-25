import type {
  EpisodeIndex,
  EpisodeLines,
  EpisodeMatches,
  Line,
  LineMatch,
} from "./types.js";

export const MIN_QUERY_LENGTH = 2;
/** Max total matching lines rendered across all episodes before truncating. */
export const MAX_RESULTS = 300;

export function search(
  index: EpisodeIndex,
  subtitles: Map<string, EpisodeLines>,
  query: string,
): EpisodeMatches[] {
  const q = query.trim().toLowerCase();
  if (q.length < MIN_QUERY_LENGTH) return [];

  const results: EpisodeMatches[] = [];

  for (const episode of index) {
    const lines = subtitles.get(episode.id);
    if (!lines) continue;

    const matches: LineMatch[] = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line) continue;
      if (line.text.toLowerCase().includes(q)) {
        matches.push({
          line,
          lineIndex: i,
          contextBefore: i > 0 ? (lines[i - 1] ?? null) : null,
          contextAfter: i < lines.length - 1 ? (lines[i + 1] ?? null) : null,
        });
      }
    }

    if (matches.length > 0) {
      results.push({ episode, matches });
    }
  }

  return results;
}

/** Quick check: does any line in these episodes match the query? */
export function episodeHasMatch(
  lines: EpisodeLines,
  query: string,
): boolean {
  const q = query.trim().toLowerCase();
  if (q.length < MIN_QUERY_LENGTH) return false;
  return lines.some((l) => l.text.toLowerCase().includes(q));
}

export function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
