import type { DisplayEntry, EpisodeIndex, EpisodeLines, EpisodeSearchResult, } from "./types.js";

export const MIN_QUERY_LENGTH = 2;

/** Lines of context shown above and below each match. */
export const CONTEXT_LINES = 1;

/** Maximum display entries shown per episode group before "show more". */
export const MAX_ENTRIES_PER_GROUP = 3;

/**
 * Maximum total lines in a single merged display entry.
 * Prevents a dense cluster of matches from producing an enormous block.
 */
export const MAX_MERGED_LINES = 10;

/**
 * When true, adjacent/overlapping context windows are merged into a single
 * display entry. When false, each match produces its own independent entry.
 */
export const MERGE_CONTEXT_ENTRIES = true;

/** Quick check: does any line in this episode match the query? */
export function episodeHasMatch(lines: EpisodeLines, query: string): boolean {
  const q = query.trim().toLowerCase();

  if (q.length < MIN_QUERY_LENGTH) {
    return false;
  }

  return lines.some((l) => l.text.toLowerCase().includes(q));
}

/**
 * Given a sorted list of matching line indices, build merged display entries.
 *
 * Each match expands to a window [idx - C, idx + C]. Adjacent or overlapping
 * windows are merged. The total line count of a merged entry is capped at
 * MAX_MERGED_LINES to prevent enormous blocks from dense match clusters.
 */
function buildDisplayEntries(
  matchIndices: number[],
  totalLines: number,
): DisplayEntry[] {
  if (matchIndices.length === 0) {
    return [];
  }

  const C = CONTEXT_LINES;
  const entries: DisplayEntry[] = [];

  for (const idx of matchIndices) {
    const start = Math.max(0, idx - C);
    const end = Math.min(totalLines - 1, idx + C);

    const prev = entries.at(-1);
    if (MERGE_CONTEXT_ENTRIES && prev && start <= prev.endIdx + 1) {
      // Merge: extend the previous entry, honouring the line cap
      const newEnd = Math.min(
        Math.max(prev.endIdx, end),
        prev.startIdx + MAX_MERGED_LINES - 1,
      );
      prev.endIdx = newEnd;
      if (idx <= prev.endIdx) {
        prev.matchIndices.add(idx);
      }
    } else {
      entries.push({ startIdx: start, endIdx: end, matchIndices: new Set([idx]) });
    }
  }

  return entries;
}

export function searchEpisodes(
  index: EpisodeIndex,
  subtitles: Map<string, EpisodeLines>,
  query: string,
): EpisodeSearchResult[] {
  const q = query.trim().toLowerCase();

  if (q.length < MIN_QUERY_LENGTH) {
    return [];
  }

  const results: EpisodeSearchResult[] = [];

  for (const episode of index) {
    const lines = subtitles.get(episode.id);

    if (!lines) {
      continue;
    }

    const matchIndices: number[] = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      if (!line) {
        continue;
      }

      if (line.text.toLowerCase().includes(q)) {
        matchIndices.push(i);
      }
    }

    if (matchIndices.length > 0) {
      results.push({
        episode,
        entries: buildDisplayEntries(matchIndices, lines.length),
        totalMatches: matchIndices.length,
      });
    }
  }

  return results;
}
