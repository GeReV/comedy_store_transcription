import type { EpisodeIndex, EpisodeLines, EpisodeMetadata } from "./types.js";

function dataUrl(path: string): string {
  return `data/${path}`;
}

let indexCache: EpisodeIndex | null = null;
const subtitleCache = new Map<string, EpisodeLines>();

export async function loadIndex(): Promise<EpisodeIndex> {
  if (indexCache) return indexCache;
  const res = await fetch(dataUrl("episodes.json"));
  if (!res.ok) throw new Error(`Failed to load episodes.json: ${res.status}`);
  indexCache = (await res.json()) as EpisodeIndex;
  return indexCache;
}

export async function loadEpisode(episode: EpisodeMetadata): Promise<EpisodeLines> {
  const cached = subtitleCache.get(episode.id);
  if (cached) return cached;
  const res = await fetch(dataUrl(episode.subtitle_file));
  if (!res.ok) throw new Error(`Failed to load subtitles for ${episode.id}: ${res.status}`);
  const lines = (await res.json()) as EpisodeLines;
  subtitleCache.set(episode.id, lines);
  return lines;
}

export type ProgressCallback = (loaded: number, total: number) => void;

/**
 * Load all subtitle files in parallel, reporting progress.
 * Returns a map of episode id → lines.
 */
export async function loadAll(
  episodes: EpisodeIndex,
  onProgress?: ProgressCallback,
): Promise<Map<string, EpisodeLines>> {
  let loaded = 0;
  const total = episodes.length;

  await Promise.all(
    episodes.map(async (ep) => {
      await loadEpisode(ep);
      loaded++;
      onProgress?.(loaded, total);
    }),
  );

  // Build result map from cache
  const result = new Map<string, EpisodeLines>();
  for (const ep of episodes) {
    const lines = subtitleCache.get(ep.id);
    if (lines) result.set(ep.id, lines);
  }
  return result;
}

export function getCachedSubtitles(): Map<string, EpisodeLines> {
  return subtitleCache;
}
