# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

This project is a transcription pipeline for the Israeli TV show [Comedy Store](https://he.wikipedia.org/wiki/%D7%94%D7%A7%D7%95%D7%9E%D7%93%D7%99_%D7%A1%D7%98%D7%95%D7%A8). It uses [whisper.cpp](https://github.com/ggml-org/whisper.cpp) to transcribe Hebrew audio and ffmpeg for audio extraction and scene/chapter detection. The goal is to make episodes and quotes searchable.

Each episode produces three output files (stored under `./process/<season>/<episode_basename>`):
- `.srt` — subtitles
- `.json` — raw whisper.cpp output
- `.scenes` — raw ffmpeg scene detection log

And one derived file:
- `.chapters.xml` — Matroska chapter XML for MKVToolNix (generated from `.scenes`)

After processing, outputs are moved/copied to `./files/` for distribution.

## `files/` Directory Structure

`files/` contains one subdirectory per episode, plus one multi-episode directory:

- **`Comedy_Store_2020/`** — holds several episodes together, named `comedy_store_2020_ep1.srt`, `comedy_store_2020_ep2.srt`, etc. Each episode file has a matching `.json` and `.chapters.xml`.
- **`פרק_NNN.../`** — one directory per regular episode (104 total), named with zero-padded number and optional date/title suffix (e.g. `פרק_001-21_12_08/`, `פרק_098-פורים_א/`). Each contains a single `.srt`, `.json`, and `.chapters.xml` named after the folder (with `-` replaced by `.` in dates).

Total: ~104 episode directories + `Comedy_Store_2020` (5 episodes) = ~109 episodes.

## Website (`docs/`)

A static GitHub Pages site lives in `docs/`. See `PLAN.md` for the full design. Key facts:
- Vanilla TypeScript compiled to JS, plain CSS, single `index.html`
- RTL Hebrew UI with light/dark theme
- Main feature: brute-force text search across all episode subtitles
- All episode data (metadata + subtitle lines + chapters) in `static/data/subtitles.json` (and `.gz`)
- Three views: episode list, search results (with context), episode view — hash-routed
- CSS Highlights API for match highlighting (Chrome 105+, Firefox 117+, Safari 17.2+)
- GitHub Actions deploys `static/` to gh-pages

### Website build commands
```bash
npm install                 # install esbuild
npm run build:data          # python scripts/build_data.py → writes static/data/
npm run build:ts            # esbuild src/main.ts → static/main.js
npm run build               # both of the above
npm run dev                 # watch + local server on static/
```

## Prerequisites

- whisper.cpp built at `.\whisper.cpp\build\bin\Release\whisper-cli.exe`
- Models placed at:
  - `.\whisper.cpp\models\ggml-large-v3-turbo.bin` (transcription)
  - `.\whisper.cpp\models\ggml-silero-v6.2.0.bin` (VAD)
- ffmpeg available on PATH
- Python >= 3.13 (managed via `uv`)
- PyQt6 (for the chapter editor; installed via `uv`)

## Commands

### Transcribe a single file
```powershell
.\single.ps1 -Name "H:\Comedy_Store\Season1\פרק_001.mkv"
# Add -SkipChapters to skip scene detection
.\single.ps1 -Name "..." -SkipChapters
```

### Batch transcribe all episodes
```powershell
# Processes all .mp4/.mkv under H:\Comedy_Store\, skips already-done files
.\batch.ps1
```
Progress is tracked in `.\process\donelist.txt`. Re-running is safe; completed files are skipped.

### Generate chapter XML from scene files
```powershell
# Convert all .scenes files in .\process\ to .chapters.xml
.\batch_chapters.ps1

# Convert a single .scenes file
python .\chapters.py path\to\episode.scenes
python .\chapters.py path\to\episode.scenes -o output.xml
```

### Edit chapters with the player

The chapter editor is a PyQt6 GUI for reviewing auto-generated chapters and refining them into named scenes/skits.

```bash
# Launch with no arguments (then drag-and-drop files)
./player.sh

# Launch with a video and its chapters pre-loaded
./player.sh path/to/episode.mkv path/to/episode.chapters.xml
```

**Workflow:** drop a video file onto the window, then drop its `.chapters.xml`. The auto-detected scene cuts appear as chapters on the timeline. Use the editor to merge spurious cuts, split at real scene boundaries, and rename chapters to describe the scene or skit. Save with `Ctrl+S`.

Edits are written to `<basename>.edited.chapters.xml` (alongside the original), leaving the source file untouched. Re-opening the same `.chapters.xml` automatically loads the `.edited.chapters.xml` if it exists.

**Keyboard shortcuts** (also shown in the UI):

| Key | Action |
|-----|--------|
| `Space` | Play / Pause |
| `[` / `]` | Jump to previous / next chapter |
| `S` | Split current chapter at playhead |
| `Del` | Merge current chapter with previous |
| `R` | Rename current chapter |
| `Ctrl+S` | Save to `.edited.chapters.xml` |
| `Ctrl+Z` / `Ctrl+Shift+Z` | Undo / Redo |
| `←` / `→` | Seek ±5s |
| `Alt+←` / `Alt+→` | Seek ±15s |
| `Ctrl+←` / `Ctrl+→` | Seek ±1 min |
| `Home` / `End` | Jump to start / end |
| `,` / `.` | Step one frame back / forward |
| `Shift+,` / `Shift+.` | Nudge chapter boundary ±1 frame |
| `Shift+←` / `Shift+→` | Nudge chapter boundary ±1s |
| `Ctrl+Shift+←` / `Ctrl+Shift+→` | Nudge chapter boundary ±5s |

### Global search and replace across transcriptions
```powershell
# Replaces text in all .srt and .json files under .\files\
.\replace.ps1 -From "wrong text" -To "correct text"
```

### Fix episode numbering (zero-pad)
```powershell
# Renames files in .\files2\ matching פרק_N to פרק_NNN
.\naming.ps1
```

## Architecture

The pipeline has two stages:

**Stage 1 — Transcription (`batch.ps1` / `single.ps1`):**
ffmpeg extracts mono 16kHz PCM audio from the video and pipes it directly to `whisper-cli`, which outputs `.srt` and `.json`. In parallel, a second ffmpeg pass runs scene detection (`select='gt(scene,0.4)'`) and writes raw output to a `.scenes` log file.

Key whisper flags: `-l he` (Hebrew), `--vad` (voice activity detection with silero), `-et 2.8` (entropy threshold), `-mc 64` (max context), `-pp` (print progress).

**Stage 2 — Chapter generation (`chapters.py`):**
Parses the `.scenes` log using regex to extract scene timestamps and video duration, then emits a Matroska-compatible chapter XML. Chapters use language `heb` and title `N/A` (chapters are positional markers, not named scenes). Time values are in nanoseconds as required by the Matroska spec.

**Stage 3 — Chapter editing (`scripts/player/`):**
A PyQt6 GUI (`player.sh`) for manually reviewing and refining the auto-generated chapters. The editor shows the video alongside an interactive timeline with chapter markers. The operator watches the episode, merges false cuts, splits at real scene/skit boundaries, and renames chapters descriptively. Edits are saved to `.edited.chapters.xml` without touching the original. The `chapter_model.py` module holds the in-memory chapter list with full undo/redo history; `chapter_io.py` handles Matroska XML read/write; `timeline_widget.py` renders the chapter timeline and emits seek requests.
