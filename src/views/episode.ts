import type { Chapter, EpisodeMetadata, EpisodeLines, Line } from "../types.js";
import { formatTime, MIN_QUERY_LENGTH } from "../search.js";
import { applyHighlights, clearHighlights } from "../highlight.js";

export interface ChapterBlockData {
  el: HTMLElement;
  emptyEl: HTMLElement;
  lineEls: HTMLElement[];
  chapter: Chapter;
  chapterIdx: number; // 1-based
}

export interface RenderResult {
  listEl: HTMLElement;
  lineEls: HTMLElement[];
  chapterBlocks?: ChapterBlockData[];
}

export function renderEpisode(
  container: HTMLElement,
  episode: EpisodeMetadata,
  lines: EpisodeLines,
  query: string,
  scrollToLine?: number,
  chapters?: Chapter[],
): RenderResult {
  clearHighlights();
  container.replaceChildren();

  const header = document.createElement("div");
  header.className = "episode-header";
  const h2 = document.createElement("h2");
  const titleLink = document.createElement("a");
  titleLink.href = `#episode/${encodeURIComponent(episode.id)}`;
  titleLink.textContent = episode.title;
  h2.appendChild(titleLink);
  header.appendChild(h2);
  container.appendChild(header);

  const list = document.createElement("div");
  list.className = "transcript-list";
  container.appendChild(list);

  const lineEls: HTMLElement[] = [];

  let chapterBlocks: ChapterBlockData[] | undefined;

  if (chapters && chapters.length > 0) {
    chapterBlocks = renderWithChapters(list, lines, chapters, lineEls, episode.id);
  } else {
    renderFlat(list, lines, lineEls);
  }

  applyQueryFilter(list, lineEls, lines, query, chapterBlocks);

  if (scrollToLine !== undefined) {
    const target = lineEls[scrollToLine];

    if (target) {
      target.classList.add("highlighted");
      requestAnimationFrame(() => {
        target.scrollIntoView({ behavior: "smooth", block: "center" });
      });
    }
  }

  return { listEl: list, lineEls, chapterBlocks };
}

function makeLineEl(line: Line, idx: number): HTMLElement {
  const el = document.createElement("div");
  el.className = "transcript-line";
  el.dataset["idx"] = String(idx);

  const ts = document.createElement("span");
  ts.className = "ts";
  ts.textContent = formatTime(line.start);

  const text = document.createElement("span");
  text.className = "text";
  text.textContent = line.text;

  el.appendChild(ts);
  el.appendChild(text);
  return el;
}

function renderFlat(
  list: HTMLElement,
  lines: EpisodeLines,
  lineEls: HTMLElement[],
): void {
  const frag = document.createDocumentFragment();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) { continue; }

    const el = makeLineEl(line, i);
    frag.appendChild(el);
    lineEls.push(el);
  }

  list.appendChild(frag);
}

function countLinesPerChapter(lines: EpisodeLines, chapters: Chapter[]): number[] {
  const counts = new Array<number>(chapters.length).fill(0);
  let chapIdx = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) { continue; }

    while (chapIdx + 1 < chapters.length && chapters[chapIdx + 1].start <= line.start) {
      chapIdx++;
    }

    counts[chapIdx]++;
  }

  return counts;
}

function renderWithChapters(
  list: HTMLElement,
  lines: EpisodeLines,
  chapters: Chapter[],
  lineEls: HTMLElement[],
  episodeId: string,
): ChapterBlockData[] {
  const frag = document.createDocumentFragment();
  const lineCounts = countLinesPerChapter(lines, chapters);

  const chapterBlocks: ChapterBlockData[] = chapters.map((ch, i) => {
    const chapterHref = `#episode/${encodeURIComponent(episodeId)}/ch-${i + 1}`;

    const block = document.createElement("div");
    block.className = "chapter-block";
    block.id = `ch-${i + 1}`;

    const hasLines = lineCounts[i] > 0;

    if (ch.name) {
      const headerEl = hasLines
        ? Object.assign(document.createElement("a"), { href: chapterHref })
        : document.createElement("div");
      headerEl.className = "chapter-block-header";
      headerEl.textContent = ch.name;
      block.appendChild(headerEl);
    }

    const emptyEl = hasLines
      ? Object.assign(document.createElement("a"), { href: chapterHref })
      : document.createElement("div");
    emptyEl.className = "chapter-empty-state";
    emptyEl.textContent = `${formatTime(ch.start)} – ${formatTime(ch.end)}`;
    emptyEl.hidden = true;
    block.appendChild(emptyEl);

    frag.appendChild(block);
    return { el: block, emptyEl, lineEls: [], chapter: ch, chapterIdx: i + 1 };
  });

  let chapIdx = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) { continue; }

    while (chapIdx + 1 < chapters.length && chapters[chapIdx + 1].start <= line.start) {
      chapIdx++;
    }

    const el = makeLineEl(line, i);
    chapterBlocks[chapIdx].el.appendChild(el);
    chapterBlocks[chapIdx].lineEls.push(el);
    lineEls.push(el);
  }

  list.appendChild(frag);
  return chapterBlocks;
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
  chapterBlocks?: ChapterBlockData[],
): void {
  clearHighlights();

  const q = query.trim().toLowerCase();
  const filtering = q.length >= MIN_QUERY_LENGTH;

  for (let i = 0; i < lineEls.length; i++) {
    const el = lineEls[i];
    const line = lines[i];
    if (!el || !line) { continue; }

    const matches = filtering ? line.text.toLowerCase().includes(q) : true;
    el.classList.toggle("hidden", !matches);
  }

  if (chapterBlocks) {
    for (const block of chapterBlocks) {
      updateChapterBlock(block, filtering);
    }
  }

  if (filtering) {
    applyHighlights(query, list);
  }
}

function updateChapterBlock(block: ChapterBlockData, filtering: boolean): void {
  const hasVisibleLines = block.lineEls.some((el) => !el.classList.contains("hidden"));

  if (filtering && !hasVisibleLines) {
    block.el.hidden = true;
    return;
  }

  block.el.hidden = false;

  // Unnamed chapters always show their timestamp as a divider.
  if (!block.chapter.name) {
    block.emptyEl.hidden = false;
    return;
  }

  // Named chapters show the timestamp only when all their lines are hidden.
  block.emptyEl.hidden = hasVisibleLines;
}
