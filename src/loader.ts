import type { EpisodeIndex, EpisodeLines, EpisodeMetadata } from "./types.js";
import { ensure } from "./utils.js";

function dataUrl(path: string): string {
  return `data/${path}`;
}

let indexCache: EpisodeIndex | null = null;
const subtitleCache = new Map<string, EpisodeLines>();

export async function loadIndex(): Promise<EpisodeIndex> {
  if (indexCache) {
    return indexCache;
  }

  const res = await fetch(dataUrl("episodes.json"));

  if (!res.ok) {
    throw new Error(`Failed to load episodes.json: ${res.status}`);
  }

  indexCache = (await res.json()) as EpisodeIndex;
  return indexCache;
}

export async function loadEpisode(episode: EpisodeMetadata): Promise<EpisodeLines> {
  const cached = subtitleCache.get(episode.id);

  if (cached) {
    return cached;
  }

  const res = await fetch(dataUrl(episode.subtitle_file));

  if (!res.ok) {
    throw new Error(`Failed to load subtitles for ${episode.id}: ${res.status}`);
  }

  const lines = (await res.json()) as EpisodeLines;
  subtitleCache.set(episode.id, lines);
  return lines;
}

export type ProgressCallback = (bytesLoaded: number, totalBytes: number) => void;

async function readChunks(
  body: ReadableStream<Uint8Array>,
  total: number,
  onProgress?: ProgressCallback,
): Promise<Uint8Array[]> {
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    chunks.push(value);
    received += value.byteLength;
    onProgress?.(received, total);
  }

  return chunks;
}

async function fetchAndDecompress(
  url: string,
  onProgress?: ProgressCallback,
): Promise<Array<{ id: string; lines: EpisodeLines }>> {
  const res = await fetch(url);

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }

  const total = parseInt(res.headers.get("content-length") ?? "0", 10);
  const chunks = await readChunks(ensure(res.body, "response.body"), total, onProgress);
  const blob = new Blob(chunks);
  const stream = blob.stream().pipeThrough(new DecompressionStream("gzip"));
  const text = await new Response(stream).text();
  return JSON.parse(text);
}

async function fetchPlain(
  url: string,
  onProgress?: ProgressCallback,
): Promise<Array<{ id: string; lines: EpisodeLines }>> {
  const res = await fetch(url);

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }

  const total = parseInt(res.headers.get("content-length") ?? "0", 10);
  const chunks = await readChunks(ensure(res.body, "response.body"), total, onProgress);
  const text = new TextDecoder().decode(await new Blob(chunks).arrayBuffer());
  return JSON.parse(text);
}

async function fetchWithProgress(
  onProgress?: ProgressCallback,
): Promise<Array<{ id: string; lines: EpisodeLines }>> {
  if (typeof DecompressionStream !== "undefined") {
    try {
      return await fetchAndDecompress(dataUrl("subtitles.json.gz"), onProgress);
    } catch {
      // fall through to uncompressed
    }
  }

  return await fetchPlain(dataUrl("subtitles.json"), onProgress);
}

/**
 * Load all subtitle files as a single bundle, reporting byte progress.
 */
export async function loadAll(
  _episodes: EpisodeIndex,
  onProgress?: ProgressCallback,
): Promise<Map<string, EpisodeLines>> {
  const combined = await fetchWithProgress(onProgress);

  for (const { id, lines } of combined) {
    subtitleCache.set(id, lines);
  }

  return getCachedSubtitles();
}

export function getCachedSubtitles(): Map<string, EpisodeLines> {
  return subtitleCache;
}
