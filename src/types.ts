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

export interface LineMatch {
  line: Line;
  lineIndex: number;
  contextBefore: Line | null;
  contextAfter: Line | null;
}

export interface EpisodeMatches {
  episode: EpisodeMetadata;
  matches: LineMatch[];
}
