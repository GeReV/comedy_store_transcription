# Video Player with Chapter Editor — Design Spec

**Date:** 2026-03-27
**Status:** Approved

## Overview

A Python/PyQt6 desktop tool for reviewing and editing auto-detected chapter boundaries in video (and, later, audio) files. Accepts a media file and a Matroska `.chapters.xml` file; renders a scrubbable timeline with chapter segments; allows keyboard-driven playback navigation, chapter boundary editing, and chapter management. Edits are saved to a separate output file.

---

## Architecture

Layered modules in `scripts/player/`:

```
scripts/player/
  __main__.py        # entry point: arg parsing, launches QApplication
  chapter_io.py      # ChapterReader/ChapterWriter protocol + MatroskaIO impl
  chapter_model.py   # Chapter dataclass, ChapterList, UndoStack
  timeline_widget.py # custom QWidget — paints chapters, playhead, click-to-seek
  player_window.py   # QMainWindow — composes all pieces, handles keyboard events
```

**Run:**
```bash
python -m scripts.player episode.mkv episode.chapters.xml
```

**Output file:** Written next to the input as `episode.chapters.edited.xml`. On subsequent runs, if `.edited.xml` already exists it is loaded in preference to the original, so edits accumulate across sessions.

---

## Chapter I/O (`chapter_io.py`)

Two protocols:

```python
class ChapterReader(Protocol):
    def read(self, path: Path) -> list[Chapter]: ...

class ChapterWriter(Protocol):
    def write(self, chapters: list[Chapter], path: Path) -> None: ...
```

`MatroskaIO` implements both. It reads `<ChapterTimeStart>`, `<ChapterTimeEnd>`, and `<ChapterString>` from the existing XML format and writes back in the same structure. The `name` field round-trips through `<ChapterString>`.

Format detection is by file extension (`.chapters.xml` → Matroska). Adding a new format requires only a new class and one entry in a registry dict.

---

## Chapter Model (`chapter_model.py`)

```python
@dataclass
class Chapter:
    start_ns: int   # nanoseconds
    end_ns: int
    name: str
```

`ChapterList` holds an ordered list of `Chapter` objects and exposes the following mutating operations. Each operation pushes its inverse onto an `UndoStack`.

| Operation | Description |
|-----------|-------------|
| `merge_with_previous(index)` | Removes chapter at `index`; extends the preceding chapter's `end_ns` to cover it. Merged chapter keeps the preceding chapter's name. No-op if `index == 0`. |
| `split(index, split_ns)` | Splits chapter at `index` at `split_ns`, producing two chapters `[start_ns, split_ns)` and `[split_ns, end_ns)`. Both inherit the original name. No-op if `split_ns` is not strictly within `(start_ns, end_ns)`. Inverse is `merge_with_previous` on the new second half. |
| `move_boundary(index, delta_ns)` | Shifts the start of chapter `index` (and `end_ns` of `index-1`) by `delta_ns`. Clamped so neither adjacent chapter shrinks below one frame. No-op for `index == 0`. |
| `rename(index, new_name)` | Sets `name` on the chapter at `index`. |

`UndoStack` is a list of inverse-operation callables with a cursor. Undo pops and calls; redo re-applies.

---

## Keyboard Bindings (`player_window.py`)

| Key | Action |
|-----|--------|
| `Space` | Play / pause |
| `[` / `]` | Jump to previous / next chapter |
| `←` / `→` | Seek ±5 s |
| `Ctrl+←` / `Ctrl+→` | Seek ±60 s |
| `Alt+←` / `Alt+→` | Seek ±15 s |
| `,` / `.` | Step one frame backward / forward |
| `Shift+,` / `Shift+.` | Nudge current chapter's start boundary ±1 frame |
| `Shift+←` / `Shift+→` | Nudge current chapter's start boundary ±1 s |
| `Ctrl+Shift+←` / `Ctrl+Shift+→` | Nudge current chapter's start boundary ±5 s |
| `Delete` | Merge current chapter into previous |
| `S` | Split current chapter at playhead position |
| `R` | Rename current chapter (via `QInputDialog`) |
| `Ctrl+Z` | Undo |
| `Ctrl+Shift+Z` | Redo |
| `Ctrl+S` | Save to output file |

The first chapter's start boundary cannot be moved (it is the video start). Merge is a no-op on the first chapter. These constraints are enforced silently.

---

## Timeline Widget (`timeline_widget.py`)

A `QWidget` with a custom `paintEvent`. Receives `ChapterList` and current playback position (nanoseconds) from the player window; repaints on every change.

**Painting:**
- Chapters rendered as horizontally-proportional rectangles, alternating two colours; current chapter is brighter
- Chapter name drawn inside each segment when wide enough (clipped otherwise)
- Playhead: red vertical line with a downward triangle handle

**Interaction:**
- Click anywhere → seeks to that timestamp (emits a signal; player window handles the seek)
- Boundary editing is keyboard-only; no mouse dragging of boundaries

**Updates:**
- `set_position(ns)` called by the player window on every timer tick
- `set_chapters(chapter_list)` called after any edit

---

## Player Window (`player_window.py`)

`PlayerWindow(QMainWindow)` composes:
- `QVideoWidget` (top, stretches to fill)
- `TimelineWidget` (fixed height ~50 px)
- `QStatusBar` (current chapter name, timecode, save confirmation messages)

**Playback:**
- `QMediaPlayer` bound to `QVideoWidget`
- After `mediaStatusChanged → LoadedMedia`: reads `QMediaMetaData.Key.VideoFrameRate`, computes `frame_ns = round(1_000_000_000 / fps)`. If frame rate metadata is absent, logs a warning and disables frame-step keys.
- A `QTimer` at **16 ms** reads `QMediaPlayer.position()` (milliseconds → nanoseconds) and pushes updates to `TimelineWidget`

**"Current chapter"** is whichever chapter contains the current playback position. Boundary-nudge operations always act on that chapter's start boundary.

**Save:** `Ctrl+S` serialises via `MatroskaIO.write()` to the output path and shows a brief status bar confirmation.

---

## File Naming & Extension Points

- The output suffix (`.edited.xml`) and auto-load behaviour are constants in `__main__.py`, easy to change.
- To add audio support: `QMediaPlayer` handles audio natively; only the `QVideoWidget` is video-specific and can be made conditional.
- To add a new chapter format: implement `ChapterReader`/`ChapterWriter` and register the extension.

---

## Dependencies

- `PyQt6` (includes `QtMultimedia`, `QtWidgets`)
- Python ≥ 3.13 (matches project's `pyproject.toml`)

Add to `pyproject.toml`:
```toml
dependencies = ["PyQt6"]
```
