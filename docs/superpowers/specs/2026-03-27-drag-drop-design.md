# Drag-and-Drop File Loading — Design Spec

**Date:** 2026-03-27
**Status:** Approved

## Overview

Extend the video player to support launching with no command-line arguments. The window accepts drag-and-drop of a video file and a `.chapters.xml` file separately. Dropping a video immediately enables playback with a plain scrub timeline. Dropping a chapters file (at any time, including mid-play) adds chapter segments to the timeline and activates the chapter editor.

---

## States

| State | How entered | Timeline | Chapter editing |
|-------|-------------|----------|-----------------|
| **Empty** | Window opens with no args | Blank | Inactive |
| **Video-only** | Video file loaded | Plain scrub bar + playhead | Inactive |
| **Full** | Chapters file also loaded | Chapter segments + playhead | Active |

Status bar messaging drives state visibility:
- Empty: `"Drop a video file to begin"`
- Video-only: `"Drop .chapters.xml to add chapters"`
- Full: `"Chapter N/M: name  |  HH:MM:SS [unsaved]"` (existing behaviour)

---

## Architecture

Three existing files change. No new files are created.

### `timeline_widget.py`

- Add `_duration_ns: int = 0` field.
- Add `set_duration(ns: int)` method — called by `PlayerWindow` after the media duration becomes known.
- In `paintEvent`: if `len(chapters) == 0` and `_duration_ns > 0`, draw a plain gray scrub bar (full width) with only the red playhead. If both are absent, return early (current blank behaviour).

### `player_window.py`

- `__init__(self)` takes no arguments. Sets up all widgets, enables `setAcceptDrops(True)`, shows empty-state message in the status bar.
- `load_media(path: Path) -> None` — configures `QMediaPlayer` with the new source, updates window title, resets `_frame_ns`, clears any loaded chapters (returns to video-only state), starts the timer if not running.
- `load_chapters(path: Path, output_path: Path) -> None` — parses chapters via `get_io`, replaces `self._chapters`, resets the undo history, calls `self._timeline.set_chapters(self._chapters)`, updates status bar.
- `_on_media_status_changed` — after reading frame rate, also calls `self._timeline.set_duration(self._player.duration() * 1_000_000)`.
- `dragEnterEvent` — accepts the event if all URLs are local files.
- `dropEvent` — iterates URLs; routes `.chapters.xml` files to `load_chapters` (deriving output path via `output_path_for()`), all other files to `load_media`.
- Chapter-editing keys (Delete, S, R, boundary nudge, `[`/`]`) return early silently when `len(self._chapters) == 0`.

### `chapter_io.py`

- Add module-level `output_path_for(chapters_path: Path) -> Path` — moves the existing `_output_path()` logic from `__main__.py` into `chapter_io.py` so both `player_window.py` and `__main__.py` can import it without a circular dependency.

### `__main__.py`

- Both `media` and `chapters` positional arguments become `nargs='?'` (optional).
- After creating `PlayerWindow()`, call `window.load_media(media_path)` if `media` was provided, then `window.load_chapters(load_path, out_path)` if `chapters` was provided.
- Import `output_path_for` from `chapter_io` instead of defining `_output_path()` locally.

---

## Drop Handling Detail

`dropEvent` receives a list of URLs. For each:

- Lowercased filename ends with `.chapters.xml` → `load_chapters(path, output_path_for(path))`
- Anything else → `load_media(path)`

Both files may be dropped simultaneously; the handler processes them in order (media first, then chapters).

**Re-dropping a video** while one is already loaded: replaces the source, resets duration, clears chapters, returns to video-only state.

**Re-dropping a chapters file**: replaces chapters, resets undo history. Allows loading a different edit without restarting.

---

## Testing

The only new pure-Python-testable behaviour is `TimelineWidget.set_duration` and the scrub-bar paint path. One new test covers this: assert that `set_duration` stores the value and that `paintEvent` does not raise when called with no chapters but a nonzero duration.

The `load_media` / `load_chapters` / drop event methods require a running Qt application and are not unit-tested. The existing 30 tests are unaffected.

---

## Dependencies

No new dependencies. Uses `QWidget.setAcceptDrops`, `dragEnterEvent`, and `dropEvent` — all part of `PyQt6.QtWidgets`, already a project dependency.
