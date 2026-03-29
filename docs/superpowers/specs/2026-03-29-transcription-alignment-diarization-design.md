# Transcription Alignment & Speaker Diarization

**Date:** 2026-03-29
**Status:** Approved

## Problem Statement

Two issues affect transcription quality in the website:

1. **Timestamp inaccuracy** — SRT lines appear a few seconds before the speech they describe. Whisper assigns a segment's start timestamp to when it detects audio activity (including music or singing), not when the actual transcribed words begin. The offset varies per line and is not systematic.

2. **Line merging** — Whisper sometimes combines utterances from different speakers, or speech separated by a clear pause, into a single SRT line. This makes the transcript harder to read and breaks chapter assignment when lines span a chapter boundary.

**Nice-to-have:** Speaker diarization with labels for display on the website.

The data build pipeline (`build_data.py`) and the chapter assignment logic (`episode.ts`) are correct — they use `line.start` throughout. The root cause is entirely in the whisper output.

## Solution Overview

A two-pass Python pipeline added after the existing whisper transcription step:

1. **Diarization pass** — `scripts/diarize.py` runs `ivrit-ai/pyannote-speaker-diarization-3.1` (a Hebrew-optimized model) on the 16 kHz mono WAV and writes a `.diarization.json` file.
2. **Post-process pass** — `scripts/postprocess.py` reads the whisper JSON (now with word-level DTW timestamps) and the diarization output, corrects timestamps, splits cross-speaker segments, assigns speaker labels, and writes the final `.srt` and `.processed.json`.

The existing whisper-cli command gains `--dtw medium` to populate word-level timestamps in the JSON.

## Architecture

```
ffmpeg (audio extract — unchanged)
    │
    ├─── whisper-cli  +  --dtw medium  +  --max-len 160
    │         ↓
    │    episode.json  (with t_dtw word timestamps per token)
    │    episode.srt   (draft — overwritten by postprocess.py)
    │
    ├─── diarize.py
    │         reads:  16 kHz WAV (same file whisper reads)
    │         model:  ivrit-ai/pyannote-speaker-diarization-3.1
    │         writes: episode.diarization.json
    │
    └─── postprocess.py
              reads:  episode.json + episode.diarization.json
              writes: episode.srt          (replaces draft)
                      episode.processed.json
```

The diarization and transcription passes read the same WAV independently and can run in parallel. `postprocess.py` runs only after both complete.

## Data Formats

### `episode.diarization.json`

Array of speaker turns, ordered by start time:

```json
[
  {"start": 29.41, "end": 34.51, "speaker": "SPEAKER_00"},
  {"start": 34.51, "end": 44.67, "speaker": "SPEAKER_01"}
]
```

### `episode.processed.json`

Same structure as the whisper JSON `transcription` array. Two fields differ per segment:

- `offsets.from` — replaced with the DTW first-word timestamp (the timestamp fix)
- `speaker` — string ID from diarization (new field)

All other fields are preserved. `build_data.py` reads this file the same way it reads the original whisper JSON.

### `episode.srt`

Speaker label prepended as a bracketed prefix (de-facto SRT standard for speaker attribution):

```
1
00:00:34,510 --> 00:00:40,050
[SPEAKER_00] לא, אני פשוט לא מבין...
```

### `subtitles.json` line objects

`build_data.py` adds an optional `speaker` field when reading from `.processed.json`:

```json
{"start": 34.51, "end": 40.05, "text": "לא, אני פשוט לא מבין...", "speaker": "SPEAKER_00"}
```

Episodes without a `.processed.json` emit lines without `speaker` — fully backward-compatible.

## Post-processor Logic (`postprocess.py`)

For each whisper segment, in order:

### Step 1 — Timestamp correction

Replace `offsets.from` with the timestamp of the **first token whose `t_dtw` value is not -1**. This skips leading tokens that correspond to non-speech audio (music, singing) at the start of the whisper context window. If no token has a valid `t_dtw`, keep the original segment timestamp.

### Step 2 — Speaker assignment

Find the diarization turn with the **maximum time overlap** with the (corrected) segment `[start, end]`. Assign that speaker ID.

### Step 3 — Speaker-boundary splitting

If a segment overlaps two speakers and the minority speaker's overlap exceeds 20% of the segment duration, split the segment:

1. Find the diarization boundary timestamp that falls inside the segment.
2. Snap it to the **nearest word boundary** in the DTW token data (within ±0.5 s).
3. Split into two segments at that word boundary — each gets its own speaker, timestamps, and text slice.

### Step 4 — Output

Reassemble segments in time order, renumber, write `episode.srt` and `episode.processed.json`.

### Notes

- Speaker IDs (`SPEAKER_00`, `SPEAKER_01`, …) are **not persistent across episodes**. The same person gets different IDs in different episodes. Mapping IDs to real names is out of scope.
- The `--max-len 160` whisper flag limits segment length at transcription time, reducing how often Step 3 is needed.

## `build_data.py` Changes

In `parse_srt` / episode loading:

- Prefer `episode.processed.json` over `episode.json` when present.
- Parse the `speaker` field from each transcription segment and include it in the line object.
- The `Line` dict gains an optional `"speaker"` key.

The `subtitles.json` output and all downstream code remain backward-compatible.

## Hardware Notes

Diarization runs on GPU via CUDA. The GTX 1070 (compute capability 6.1, 8 GB VRAM) is supported by PyTorch/CUDA and should be sufficient for pyannote inference. Compatibility should be verified before committing to a full re-transcription run.

## Phase 2 — Website Speaker Display (not in initial implementation)

These changes are deferred and documented here for reference.

### TypeScript `Line` type

```ts
export interface Line {
  start: number;
  end: number;
  text: string;
  speaker?: string;  // present only for reprocessed episodes
}
```

### Display

Speaker labels shown as a small colored badge (`S1`, `S2`, …) before the text in each transcript line. Color assigned by speaker index from a fixed palette. Episodes without speaker data render identically to today.

### Scope

- `src/types.ts` — add `speaker?: string` to `Line`
- `src/views/episode.ts` — `makeLineEl` conditionally prepends `<span class="speaker-badge">`
- CSS — badge styles + per-speaker color variables
- `src/views/results.ts` — same badge on search result lines

Speaker ID is not included in search.

## Files Changed

### Phase 1 (pipeline)

| File | Change |
|---|---|
| `scripts/diarize.py` | New — runs pyannote, writes `.diarization.json` |
| `scripts/postprocess.py` | New — merges DTW + diarization, writes corrected `.srt` + `.processed.json` |
| `scripts/single.ps1` | Add `--dtw medium --max-len 160`; call `diarize.py` and `postprocess.py` |
| `scripts/batch.ps1` | Same whisper flag additions; call new scripts |
| `scripts/build_data.py` | Prefer `.processed.json`; parse `speaker` field |

### Phase 2 (website, deferred)

| File | Change |
|---|---|
| `src/types.ts` | `speaker?` on `Line` |
| `src/views/episode.ts` | Speaker badge in line rendering |
| `src/views/results.ts` | Speaker badge in search results |
| `static/style.css` | Badge styles |
