const HIGHLIGHT_NAME = "search-match";

/** True if the CSS Custom Highlight API is available in this browser. */
export const supportsHighlights = "highlights" in CSS;

/**
 * Apply CSS highlight ranges for all occurrences of `query` inside `container`.
 * Falls back to nothing if the API is unavailable (the episode view uses a
 * class-based approach in that case).
 */
export function applyHighlights(query: string, container: Element): void {
  if (!supportsHighlights) {
    return;
  }

  clearHighlights();

  const q = query.toLowerCase();

  if (!q) {
    return;
  }

  const ranges: Range[] = [];
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);

  let node: Text | null;
  while ((node = walker.nextNode() as Text | null)) {
    const text = node.textContent ?? "";
    const lower = text.toLowerCase();
    let idx = 0;
    while ((idx = lower.indexOf(q, idx)) !== -1) {
      const range = document.createRange();
      range.setStart(node, idx);
      range.setEnd(node, idx + q.length);
      ranges.push(range);
      idx += q.length;
    }
  }

  if (ranges.length > 0) {
    CSS.highlights.set(HIGHLIGHT_NAME, new Highlight(...ranges));
  }
}

export function clearHighlights(): void {
  if (!supportsHighlights) {
    return;
  }

  CSS.highlights.delete(HIGHLIGHT_NAME);
}
