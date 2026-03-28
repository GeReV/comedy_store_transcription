import type { Chapter, EpisodeIndex, EpisodeLines, EpisodeMetadata } from "./types.js";
import { ensure } from "./utils.js";

function dataUrl(path: string): string {
  return `data/${path}`;
}

let indexCache: EpisodeIndex | null = null;
const subtitleCache = new Map<string, EpisodeLines>();
const chapterCache = new Map<string, Chapter[]>();

export function getEpisodeChapters(id: string): Chapter[] | undefined {
  return chapterCache.get(id);
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

type BundleEntry = EpisodeMetadata & { lines: EpisodeLines; chapters?: Chapter[] };

async function fetchAndDecompress(
  url: string,
  onProgress?: ProgressCallback,
): Promise<BundleEntry[]> {
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
): Promise<BundleEntry[]> {
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
): Promise<BundleEntry[]> {
  if (typeof DecompressionStream !== "undefined") {
    try {
      return await fetchAndDecompress(dataUrl("subtitles.json.gz"), onProgress);
    } catch {
      // fall through to uncompressed
    }
  }

  return await fetchPlain(dataUrl("subtitles.json"), onProgress);
}

let bundlePromise: Promise<void> | null = null;

function ensureBundle(onProgress?: ProgressCallback): Promise<void> {
  if (!bundlePromise) {
    bundlePromise = fetchWithProgress(onProgress).then((combined) => {
      indexCache = combined.map(({ id, title, num }) => ({ id, title, num }));

      for (const { id, lines, chapters } of combined) {
        subtitleCache.set(id, lines);

        if (chapters) {
          chapterCache.set(id, chapters);
        }
      }
    });
  }

  return bundlePromise;
}

export async function loadBundle(onProgress?: ProgressCallback): Promise<EpisodeIndex> {
  await ensureBundle(onProgress);
  return ensure(indexCache, "bundle not loaded");
}

export async function loadEpisode(episode: EpisodeMetadata): Promise<EpisodeLines> {
  const cached = subtitleCache.get(episode.id);

  if (cached) {
    return cached;
  }

  await ensureBundle();
  return ensure(subtitleCache.get(episode.id), `subtitles for ${episode.id} not found in bundle`);
}

export function getCachedSubtitles(): Map<string, EpisodeLines> {
  return subtitleCache;
}
