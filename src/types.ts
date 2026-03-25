export interface EpisodeMetadata {
  id: string;
  title: string;
  /** Numeric sort key. Regular episodes: episode number. 2020 specials: 10000+. */
  num: number;
  subtitle_file: string;
}

export interface Line {
  start: number; // seconds
  end: number;   // seconds
  text: string;
}

export type EpisodeIndex = EpisodeMetadata[];
export type EpisodeLines = Line[];

/**
 * A range of lines to display for one logical match group.
 * startIdx..endIdx (inclusive) is the display range including context.
 * matchIndices contains the line indices that are actual search hits.
 */
export interface DisplayEntry {
  startIdx: number;
  endIdx: number;
  matchIndices: Set<number>;
}

export interface EpisodeSearchResult {
  episode: EpisodeMetadata;
  /** Merged, context-expanded display entries. */
  entries: DisplayEntry[];
  /** Total individual matching lines (before context/merging). */
  totalMatches: number;
}
