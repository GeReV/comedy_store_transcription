# Transcription Alignment & Speaker Diarization — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve whisper timestamp accuracy using DTW word-level alignment, add speaker diarization via ivrit-ai/pyannote, and surface speaker labels in the SRT and data pipeline.

**Architecture:** Re-transcribe with `--dtw medium --max-len 160` to get word-level timestamps; run `diarize.py` (pyannote) on the same WAV; run `postprocess.py` to correct timestamps, split cross-speaker segments, and write the final SRT and processed JSON. `build_data.py` parses the `[SPEAKER_XX]` prefix from SRT lines and surfaces it as an optional `speaker` field.

**Tech Stack:** Python 3.13, pyannote.audio 3.x, PyTorch (CUDA), whisper.cpp (existing), uv, pytest, PowerShell

---

## File Map

| File | Role |
|---|---|
| `scripts/diarize.py` | **Create.** Loads `ivrit-ai/pyannote-speaker-diarization-3.1`, runs diarization on a WAV file, writes `.diarization.json` |
| `scripts/postprocess.py` | **Create.** Reads whisper JSON (DTW-enabled) + diarization JSON → corrects timestamps, splits cross-speaker segments, writes final `.srt` and `.processed.json` |
| `tests/test_postprocess.py` | **Create.** Unit tests for all postprocess helper functions |
| `tests/test_build_data.py` | **Create.** Unit test for speaker-prefix parsing in `build_data.py` |
| `scripts/build_data.py` | **Modify.** Parse `[SPEAKER_XX]` prefix from SRT lines; strip it from text; add `speaker` key to line dict |
| `scripts/single.ps1` | **Modify.** Extract WAV to temp file; add `--dtw medium --max-len 160`; call `diarize.py` + `postprocess.py`; delete temp WAV |
| `scripts/batch.ps1` | **Modify.** Same changes as `single.ps1` |
| `pyproject.toml` | **Modify.** Add `pyannote.audio` and `torch` dependencies |

---

## Task 1: Add dependencies and verify pyannote loads on GPU

**Files:**
- Modify: `pyproject.toml`

- [ ] **Step 1: Add pyannote.audio and torch to pyproject.toml**

```toml
[project]
name = "comedy-store-transcribe"
version = "0.1.0"
requires-python = ">=3.13"
dependencies = [
    "PyQt6",
    "pyannote.audio>=3.3",
    "torch>=2.0",
]

[dependency-groups]
dev = ["pytest"]

[tool.pytest.ini_options]
testpaths = ["tests"]
pythonpath = ["."]
```

- [ ] **Step 2: Install dependencies**

```bash
uv sync
```

Expected: resolves and installs pyannote.audio and torch. If torch CUDA is needed, install it manually:
```bash
uv run pip install torch --index-url https://download.pytorch.org/whl/cu118
```
(cu118 targets CUDA 11.8, compatible with GTX 1070 on modern drivers)

- [ ] **Step 3: Accept pyannote model terms on HuggingFace**

The model `ivrit-ai/pyannote-speaker-diarization-3.1` may gate downloads behind HuggingFace login. Check at `https://huggingface.co/ivrit-ai/pyannote-speaker-diarization-3.1`. If gated:
1. Create a HuggingFace account and accept the model's terms of use
2. Generate a read token at `https://huggingface.co/settings/tokens`
3. Set it as an environment variable: `$env:HF_TOKEN = "hf_..."`

- [ ] **Step 4: Smoke-test that the model loads and runs on GPU**

```bash
uv run python -c "
import torch
from pyannote.audio import Pipeline
print('CUDA available:', torch.cuda.is_available())
p = Pipeline.from_pretrained('ivrit-ai/pyannote-speaker-diarization-3.1')
p.to(torch.device('cuda' if torch.cuda.is_available() else 'cpu'))
print('Pipeline loaded OK')
"
```

Expected output includes `CUDA available: True` and `Pipeline loaded OK`. If it falls back to CPU, diarization will be slow (~10x) but functional.

- [ ] **Step 5: Commit**

```bash
git add pyproject.toml
git commit -m "build: add pyannote.audio and torch dependencies"
```

---

## Task 2: Create `scripts/diarize.py`

**Files:**
- Create: `scripts/diarize.py`

`diarize.py` is a thin CLI wrapper around pyannote. Its only job is: load model, run on WAV, write JSON. No logic to test beyond the smoke test already done in Task 1.

- [ ] **Step 1: Create `scripts/diarize.py`**

```python
#!/usr/bin/env python3
"""
Run speaker diarization on a 16 kHz mono WAV file.

Usage:
    python scripts/diarize.py <wav_path> <output_json_path>

Writes a JSON array of speaker turns:
    [{"start": 1.23, "end": 4.56, "speaker": "SPEAKER_00"}, ...]
"""
import argparse
import json
import os
from pathlib import Path

import torch
from pyannote.audio import Pipeline


def diarize(wav_path: Path, hf_token: str | None = None) -> list[dict]:
    """Run pyannote diarization, return sorted list of speaker turns."""
    pipeline = Pipeline.from_pretrained(
        "ivrit-ai/pyannote-speaker-diarization-3.1",
        use_auth_token=hf_token,
    )
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    pipeline.to(device)

    result = pipeline(str(wav_path))

    turns = [
        {"start": round(turn.start, 3), "end": round(turn.end, 3), "speaker": speaker}
        for turn, _, speaker in result.itertracks(yield_label=True)
    ]
    turns.sort(key=lambda t: t["start"])
    return turns


def main() -> None:
    parser = argparse.ArgumentParser(description="Speaker diarization via pyannote")
    parser.add_argument("wav", type=Path, help="16 kHz mono WAV file")
    parser.add_argument("output", type=Path, help="Output .diarization.json path")
    args = parser.parse_args()

    hf_token = os.environ.get("HF_TOKEN")
    turns = diarize(args.wav, hf_token)

    args.output.write_text(
        json.dumps(turns, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(f"Wrote {len(turns)} speaker turns to {args.output}")


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Verify it runs (requires Task 1 complete and HF_TOKEN set)**

```bash
# Use any existing .wav file, or extract one:
ffmpeg -i "path/to/episode.mkv" -f wav -ac 1 -acodec pcm_s16le -ar 16000 test_audio.wav
uv run python scripts/diarize.py test_audio.wav test_audio.diarization.json
cat test_audio.diarization.json | head -20
```

Expected: JSON array with at least a few speaker turns.

- [ ] **Step 3: Commit**

```bash
git add scripts/diarize.py
git commit -m "feat: add diarize.py — speaker diarization via ivrit-ai/pyannote"
```

---

## Task 3: Create `tests/test_postprocess.py` and `scripts/postprocess.py` — timestamp correction

Build the post-processor function by function, test-first.

**Files:**
- Create: `tests/test_postprocess.py`
- Create: `scripts/postprocess.py`

The `t_dtw` values in the whisper JSON are in **milliseconds** (same units as `offsets.from/to`). Verify this during implementation: with DTW enabled, a token whose `t_dtw` is e.g. `29410` means the word starts at 29.41 s. If the units turn out to be different (e.g. centiseconds), adjust `get_corrected_start` accordingly.

- [ ] **Step 1: Create `tests/__init__.py` (empty)**

```bash
touch tests/__init__.py
```

- [ ] **Step 2: Write the failing test for `get_corrected_start`**

Create `tests/test_postprocess.py`:

```python
"""Unit tests for scripts/postprocess.py helper functions."""
import pytest
from scripts.postprocess import (
    get_corrected_start,
    assign_speaker,
    find_split_point,
    needs_split,
    process_segment,
    ms_to_ts,
)


def make_segment(start_ms: int, end_ms: int, tokens: list[dict], text: str = "hello") -> dict:
    return {
        "offsets": {"from": start_ms, "to": end_ms},
        "timestamps": {"from": ms_to_ts(start_ms), "to": ms_to_ts(end_ms)},
        "text": text,
        "tokens": tokens,
    }


def make_token(t_dtw: int, offset_from: int, offset_to: int, text: str = "word") -> dict:
    return {
        "text": text,
        "t_dtw": t_dtw,
        "offsets": {"from": offset_from, "to": offset_to},
    }


class TestGetCorrectedStart:
    def test_returns_first_valid_dtw(self):
        tokens = [
            make_token(t_dtw=-1, offset_from=0, offset_to=100),   # invalid (non-speech)
            make_token(t_dtw=-1, offset_from=100, offset_to=200),  # invalid
            make_token(t_dtw=31500, offset_from=200, offset_to=300),  # first valid
            make_token(t_dtw=32000, offset_from=300, offset_to=400),
        ]
        segment = make_segment(29000, 35000, tokens)
        assert get_corrected_start(segment) == 31500

    def test_falls_back_to_segment_start_when_no_valid_dtw(self):
        tokens = [
            make_token(t_dtw=-1, offset_from=0, offset_to=100),
            make_token(t_dtw=-1, offset_from=100, offset_to=200),
        ]
        segment = make_segment(29000, 35000, tokens)
        assert get_corrected_start(segment) == 29000

    def test_falls_back_when_no_tokens(self):
        segment = make_segment(5000, 10000, [])
        assert get_corrected_start(segment) == 5000

    def test_returns_segment_start_when_first_token_already_valid(self):
        tokens = [make_token(t_dtw=5100, offset_from=0, offset_to=200)]
        segment = make_segment(5000, 8000, tokens)
        assert get_corrected_start(segment) == 5100
```

- [ ] **Step 3: Run test to confirm it fails**

```bash
uv run pytest tests/test_postprocess.py::TestGetCorrectedStart -v
```

Expected: `ImportError` or `ModuleNotFoundError` (scripts/postprocess.py does not exist yet).

- [ ] **Step 4: Create `scripts/postprocess.py` with `get_corrected_start` and `ms_to_ts`**

```python
"""
Post-process whisper JSON + diarization JSON to produce corrected SRT and processed JSON.

Steps per segment:
  1. Replace segment start with first-word DTW timestamp
  2. Assign speaker by maximum overlap with diarization turns
  3. Split segment at speaker boundary if minority speaker > 20% of duration

Usage:
    python scripts/postprocess.py whisper.json diarization.json \\
        --out-srt episode.srt --out-json episode.processed.json
"""
from __future__ import annotations

import argparse
import json
import re
from pathlib import Path


def ms_to_ts(ms: int) -> str:
    """Convert milliseconds to SRT timestamp string HH:MM:SS,mmm."""
    h = ms // 3_600_000
    ms %= 3_600_000
    m = ms // 60_000
    ms %= 60_000
    s = ms // 1000
    ms %= 1000
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


def get_corrected_start(segment: dict) -> int:
    """
    Return the first token's t_dtw value (ms) as the corrected segment start.
    Falls back to segment's offsets.from if no token has a valid t_dtw.
    """
    for token in segment.get("tokens", []):
        if token.get("t_dtw", -1) != -1:
            return token["t_dtw"]
    return segment["offsets"]["from"]
```

- [ ] **Step 5: Run test to confirm it passes**

```bash
uv run pytest tests/test_postprocess.py::TestGetCorrectedStart -v
```

Expected: 4 tests pass.

- [ ] **Step 6: Commit**

```bash
git add scripts/postprocess.py tests/__init__.py tests/test_postprocess.py
git commit -m "feat: postprocess.py — DTW timestamp correction (get_corrected_start)"
```

---

## Task 4: Speaker assignment in `postprocess.py`

**Files:**
- Modify: `scripts/postprocess.py`
- Modify: `tests/test_postprocess.py`

- [ ] **Step 1: Add failing tests for `assign_speaker`**

Append to `tests/test_postprocess.py`:

```python
class TestAssignSpeaker:
    def make_turns(self):
        return [
            {"start": 0.0,  "end": 10.0, "speaker": "SPEAKER_00"},
            {"start": 10.0, "end": 20.0, "speaker": "SPEAKER_01"},
            {"start": 20.0, "end": 30.0, "speaker": "SPEAKER_00"},
        ]

    def test_full_overlap_with_one_speaker(self):
        turns = self.make_turns()
        assert assign_speaker(2000, 8000, turns) == "SPEAKER_00"

    def test_majority_overlap_wins(self):
        # 7s in SPEAKER_00, 3s in SPEAKER_01
        turns = self.make_turns()
        assert assign_speaker(3000, 13000, turns) == "SPEAKER_00"

    def test_exact_majority_on_second_speaker(self):
        # 2s in SPEAKER_00, 8s in SPEAKER_01
        turns = self.make_turns()
        assert assign_speaker(8000, 18000, turns) == "SPEAKER_01"

    def test_returns_empty_string_when_no_overlap(self):
        turns = self.make_turns()
        assert assign_speaker(50000, 55000, turns) == ""

    def test_non_contiguous_turns_of_same_speaker(self):
        # segment spans 18s–28s: 2s SPEAKER_01, 8s SPEAKER_00
        turns = self.make_turns()
        assert assign_speaker(18000, 28000, turns) == "SPEAKER_00"
```

- [ ] **Step 2: Run to confirm failure**

```bash
uv run pytest tests/test_postprocess.py::TestAssignSpeaker -v
```

Expected: `ImportError` for `assign_speaker`.

- [ ] **Step 3: Implement `assign_speaker` in `scripts/postprocess.py`**

Append after `get_corrected_start`:

```python
def _overlap_ms(a_start: int, a_end: int, b_start_s: float, b_end_s: float) -> float:
    """Milliseconds of overlap between [a_start, a_end] (ms) and [b_start_s, b_end_s] (s)."""
    b_start_ms = b_start_s * 1000
    b_end_ms = b_end_s * 1000
    return max(0.0, min(a_end, b_end_ms) - max(a_start, b_start_ms))


def assign_speaker(start_ms: int, end_ms: int, turns: list[dict]) -> str:
    """
    Return the speaker ID with the greatest overlap with [start_ms, end_ms].
    Returns empty string if no turn overlaps.
    """
    best_speaker = ""
    best_overlap = 0.0
    for turn in turns:
        ov = _overlap_ms(start_ms, end_ms, turn["start"], turn["end"])
        if ov > best_overlap:
            best_overlap = ov
            best_speaker = turn["speaker"]
    return best_speaker
```

- [ ] **Step 4: Run to confirm passing**

```bash
uv run pytest tests/test_postprocess.py::TestAssignSpeaker -v
```

Expected: 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add scripts/postprocess.py tests/test_postprocess.py
git commit -m "feat: postprocess.py — assign_speaker by maximum overlap"
```

---

## Task 5: Speaker-boundary splitting in `postprocess.py`

**Files:**
- Modify: `scripts/postprocess.py`
- Modify: `tests/test_postprocess.py`

- [ ] **Step 1: Add failing tests for `find_split_point` and `needs_split`**

Append to `tests/test_postprocess.py`:

```python
class TestFindSplitPoint:
    def test_finds_nearest_token_to_boundary(self):
        tokens = [
            make_token(t_dtw=1000, offset_from=0,   offset_to=200),
            make_token(t_dtw=2000, offset_from=200,  offset_to=400),  # 200ms from boundary
            make_token(t_dtw=2800, offset_from=400,  offset_to=600),  # nearest to 2600
            make_token(t_dtw=3500, offset_from=600,  offset_to=800),
        ]
        # boundary at 2600ms — nearest is token at 2800ms (index 2)
        assert find_split_point(tokens, boundary_ms=2600) == 2

    def test_returns_none_when_no_token_within_snap_window(self):
        tokens = [
            make_token(t_dtw=1000, offset_from=0,  offset_to=200),
            make_token(t_dtw=5000, offset_from=200, offset_to=400),
        ]
        # boundary at 2600ms, snap window 500ms — nearest is at 1000ms (dist=1600) or 5000ms (dist=2400)
        assert find_split_point(tokens, boundary_ms=2600) is None

    def test_returns_none_when_split_would_be_at_index_0(self):
        tokens = [make_token(t_dtw=100, offset_from=0, offset_to=200)]
        assert find_split_point(tokens, boundary_ms=100) is None

    def test_ignores_tokens_with_no_dtw(self):
        tokens = [
            make_token(t_dtw=-1,  offset_from=0,   offset_to=200),
            make_token(t_dtw=2500, offset_from=200, offset_to=400),
            make_token(t_dtw=3000, offset_from=400, offset_to=600),
        ]
        assert find_split_point(tokens, boundary_ms=2600) == 1


class TestNeedsSplit:
    def make_turns(self):
        return [
            {"start": 0.0,  "end": 10.0, "speaker": "SPEAKER_00"},
            {"start": 10.0, "end": 20.0, "speaker": "SPEAKER_01"},
        ]

    def _seg_with_tokens(self, start_ms, end_ms):
        tokens = [
            make_token(t_dtw=start_ms + 100, offset_from=0,   offset_to=200),
            make_token(t_dtw=start_ms + 5000, offset_from=200, offset_to=400),
        ]
        return make_segment(start_ms, end_ms, tokens)

    def test_needs_split_when_minority_exceeds_threshold(self):
        # segment 7s–13s: 3s SPEAKER_00, 3s SPEAKER_01 — each is 50% → split
        seg = self._seg_with_tokens(7000, 13000)
        should, boundary_ms, spk_before, spk_after = needs_split(seg, 7000, self.make_turns())
        assert should is True
        assert boundary_ms == 10000
        assert spk_before == "SPEAKER_00"
        assert spk_after == "SPEAKER_01"

    def test_no_split_when_minority_below_threshold(self):
        # segment 1s–10.5s: 9s SPEAKER_00, 0.5s SPEAKER_01 — minority is ~5% < 20%
        seg = self._seg_with_tokens(1000, 10500)
        should, *_ = needs_split(seg, 1000, self.make_turns())
        assert should is False

    def test_no_split_when_segment_within_single_speaker(self):
        seg = self._seg_with_tokens(2000, 8000)
        should, *_ = needs_split(seg, 2000, self.make_turns())
        assert should is False

    def test_no_split_when_same_speaker_on_both_sides(self):
        turns = [
            {"start": 0.0, "end": 5.0,  "speaker": "SPEAKER_00"},
            {"start": 5.0, "end": 10.0, "speaker": "SPEAKER_00"},  # same speaker
        ]
        seg = self._seg_with_tokens(3000, 7000)
        should, *_ = needs_split(seg, 3000, turns)
        assert should is False
```

- [ ] **Step 2: Run to confirm failures**

```bash
uv run pytest tests/test_postprocess.py::TestFindSplitPoint tests/test_postprocess.py::TestNeedsSplit -v
```

Expected: both classes fail with `ImportError`.

- [ ] **Step 3: Implement `find_split_point` and `needs_split`**

Append to `scripts/postprocess.py`:

```python
def find_split_point(tokens: list[dict], boundary_ms: float, snap_window_ms: float = 500) -> int | None:
    """
    Find the index of the first token of the second split part.
    Snaps to the token whose t_dtw is closest to boundary_ms within snap_window_ms.
    Returns None if no valid token is found or if the split would be at index 0.
    """
    best_idx: int | None = None
    best_dist = float("inf")
    for i, token in enumerate(tokens):
        t = token.get("t_dtw", -1)
        if t == -1:
            continue
        dist = abs(t - boundary_ms)
        if dist < best_dist and dist <= snap_window_ms:
            best_dist = dist
            best_idx = i
    if best_idx is None or best_idx == 0:
        return None
    return best_idx


def needs_split(
    segment: dict,
    corrected_start_ms: int,
    turns: list[dict],
    threshold: float = 0.2,
) -> tuple[bool, int, str, str]:
    """
    Check whether a segment straddles a speaker boundary beyond the minority threshold.

    Returns (should_split, boundary_ms, speaker_before, speaker_after).
    """
    start_s = corrected_start_ms / 1000
    end_s = segment["offsets"]["to"] / 1000
    duration = end_s - start_s
    if duration <= 0:
        return False, 0, "", ""

    for i, turn in enumerate(turns):
        boundary_s = turn["end"]
        if not (start_s < boundary_s < end_s):
            continue
        if i + 1 >= len(turns):
            continue
        next_turn = turns[i + 1]
        if turn["speaker"] == next_turn["speaker"]:
            continue

        ov_before = _overlap_ms(corrected_start_ms, segment["offsets"]["to"], turn["start"], turn["end"])
        ov_after = _overlap_ms(corrected_start_ms, segment["offsets"]["to"], next_turn["start"], next_turn["end"])
        minority_ms = min(ov_before, ov_after)

        if minority_ms / (duration * 1000) >= threshold:
            return True, int(boundary_s * 1000), turn["speaker"], next_turn["speaker"]

    return False, 0, "", ""
```

- [ ] **Step 4: Run to confirm passing**

```bash
uv run pytest tests/test_postprocess.py::TestFindSplitPoint tests/test_postprocess.py::TestNeedsSplit -v
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add scripts/postprocess.py tests/test_postprocess.py
git commit -m "feat: postprocess.py — speaker-boundary split detection"
```

---

## Task 6: Segment processing and output in `postprocess.py`

**Files:**
- Modify: `scripts/postprocess.py`
- Modify: `tests/test_postprocess.py`

- [ ] **Step 1: Add tests for `process_segment`**

Append to `tests/test_postprocess.py`:

```python
class TestProcessSegment:
    def make_turns_two_speakers(self):
        return [
            {"start": 0.0,  "end": 10.0, "speaker": "SPEAKER_00"},
            {"start": 10.0, "end": 20.0, "speaker": "SPEAKER_01"},
        ]

    def test_corrects_timestamp_and_assigns_speaker(self):
        tokens = [
            make_token(t_dtw=-1,   offset_from=0,   offset_to=100, text="[_BEG_]"),
            make_token(t_dtw=3000, offset_from=100,  offset_to=300, text=" שלום"),
            make_token(t_dtw=4000, offset_from=300,  offset_to=500, text=" עולם"),
        ]
        seg = make_segment(2000, 8000, tokens, text=" שלום עולם")
        result = process_segment(seg, self.make_turns_two_speakers())
        assert len(result) == 1
        assert result[0]["offsets"]["from"] == 3000    # DTW corrected
        assert result[0]["speaker"] == "SPEAKER_00"

    def test_splits_at_speaker_boundary(self):
        # segment 7s–13s: crosses boundary at 10s
        tokens = [
            make_token(t_dtw=7100,  offset_from=0,    offset_to=500,  text=" ראשון"),
            make_token(t_dtw=8000,  offset_from=500,   offset_to=1000, text=" שני"),
            make_token(t_dtw=10200, offset_from=1000,  offset_to=1500, text=" שלישי"),
            make_token(t_dtw=11000, offset_from=1500,  offset_to=2000, text=" רביעי"),
        ]
        seg = make_segment(7000, 13000, tokens, text=" ראשון שני שלישי רביעי")
        result = process_segment(seg, self.make_turns_two_speakers())
        assert len(result) == 2
        assert result[0]["speaker"] == "SPEAKER_00"
        assert result[1]["speaker"] == "SPEAKER_01"

    def test_no_split_when_minority_below_threshold(self):
        # segment 1s–9.5s: almost entirely SPEAKER_00
        tokens = [make_token(t_dtw=1100, offset_from=0, offset_to=200)]
        seg = make_segment(1000, 9500, tokens, text="כולו SPEAKER_00")
        result = process_segment(seg, self.make_turns_two_speakers())
        assert len(result) == 1
        assert result[0]["speaker"] == "SPEAKER_00"
```

- [ ] **Step 2: Run to confirm failures**

```bash
uv run pytest tests/test_postprocess.py::TestProcessSegment -v
```

Expected: `ImportError` for `process_segment`.

- [ ] **Step 3: Implement `process_segment`, `process_transcription`, `write_srt`, and `main` in `scripts/postprocess.py`**

Append to `scripts/postprocess.py`:

```python
_SPECIAL_TOKEN_RE = re.compile(r"^\[_")


def _tokens_to_text(tokens: list[dict]) -> str:
    return "".join(
        t["text"] for t in tokens if not _SPECIAL_TOKEN_RE.match(t["text"])
    ).strip()


def _split_segment(
    segment: dict,
    corrected_start_ms: int,
    split_idx: int,
    spk_before: str,
    spk_after: str,
) -> tuple[dict, dict]:
    tokens = segment.get("tokens", [])
    tokens_a = tokens[:split_idx]
    tokens_b = tokens[split_idx:]

    end_a_ms = tokens_a[-1]["offsets"]["to"] if tokens_a else segment["offsets"]["to"]
    start_b_ms = tokens_b[0]["offsets"]["from"] if tokens_b else corrected_start_ms
    end_b_ms = segment["offsets"]["to"]

    seg_a = {
        **segment,
        "tokens": tokens_a,
        "text": _tokens_to_text(tokens_a),
        "offsets": {"from": corrected_start_ms, "to": end_a_ms},
        "timestamps": {"from": ms_to_ts(corrected_start_ms), "to": ms_to_ts(end_a_ms)},
        "speaker": spk_before,
    }
    seg_b = {
        **segment,
        "tokens": tokens_b,
        "text": _tokens_to_text(tokens_b),
        "offsets": {"from": start_b_ms, "to": end_b_ms},
        "timestamps": {"from": ms_to_ts(start_b_ms), "to": ms_to_ts(end_b_ms)},
        "speaker": spk_after,
    }
    return seg_a, seg_b


def process_segment(segment: dict, turns: list[dict]) -> list[dict]:
    """
    Process one whisper segment: correct timestamp, optionally split, assign speaker.
    Returns a list of one or two corrected segments.
    """
    corrected_start = get_corrected_start(segment)

    should_split, boundary_ms, spk_before, spk_after = needs_split(
        segment, corrected_start, turns
    )

    if should_split:
        split_idx = find_split_point(segment.get("tokens", []), boundary_ms)
        if split_idx is not None:
            seg_a, seg_b = _split_segment(
                segment, corrected_start, split_idx, spk_before, spk_after
            )
            return [seg_a, seg_b]

    corrected = {
        **segment,
        "offsets": {**segment["offsets"], "from": corrected_start},
        "timestamps": {**segment["timestamps"], "from": ms_to_ts(corrected_start)},
        "speaker": assign_speaker(corrected_start, segment["offsets"]["to"], turns),
    }
    return [corrected]


def process_transcription(transcription: list[dict], turns: list[dict]) -> list[dict]:
    """Process all segments and return the flattened, corrected list."""
    result = []
    for segment in transcription:
        result.extend(process_segment(segment, turns))
    return result


def write_srt(segments: list[dict], path: Path) -> None:
    """Write SRT file with optional [SPEAKER_XX] prefix on each line."""
    blocks = []
    idx = 1
    for seg in segments:
        text = seg["text"].strip()
        if not text:
            continue
        speaker = seg.get("speaker", "")
        prefix = f"[{speaker}] " if speaker else ""
        start = ms_to_ts(seg["offsets"]["from"])
        end = ms_to_ts(seg["offsets"]["to"])
        blocks.append(f"{idx}\n{start} --> {end}\n{prefix}{text}")
        idx += 1
    path.write_text("\n\n".join(blocks) + "\n", encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description="Post-process whisper + diarization")
    parser.add_argument("whisper_json", type=Path)
    parser.add_argument("diarization_json", type=Path)
    parser.add_argument("--out-srt", type=Path, required=True)
    parser.add_argument("--out-json", type=Path, required=True)
    args = parser.parse_args()

    whisper_data = json.loads(args.whisper_json.read_text(encoding="utf-8"))
    turns = json.loads(args.diarization_json.read_text(encoding="utf-8"))

    segments = process_transcription(whisper_data["transcription"], turns)

    out_data = {**whisper_data, "transcription": segments}
    args.out_json.write_text(
        json.dumps(out_data, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )

    write_srt(segments, args.out_srt)
    print(f"Wrote {len(segments)} segments to {args.out_srt}")


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Run all tests to confirm passing**

```bash
uv run pytest tests/test_postprocess.py -v
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add scripts/postprocess.py tests/test_postprocess.py
git commit -m "feat: postprocess.py — segment processing, SRT output, CLI entry point"
```

---

## Task 7: Update `build_data.py` to parse speaker prefix

**Files:**
- Modify: `scripts/build_data.py`
- Create: `tests/test_build_data.py`

- [ ] **Step 1: Write the failing test**

Create `tests/test_build_data.py`:

```python
"""Tests for speaker-prefix parsing in build_data.py."""
from scripts.build_data import parse_srt
from pathlib import Path
import tempfile, textwrap


def write_srt(content: str) -> Path:
    f = tempfile.NamedTemporaryFile(mode="w", suffix=".srt", delete=False, encoding="utf-8")
    f.write(textwrap.dedent(content))
    f.close()
    return Path(f.name)


class TestParseSrtSpeaker:
    def test_no_speaker_prefix_returns_no_speaker_field(self):
        path = write_srt("""
            1
            00:00:01,000 --> 00:00:03,000
            שלום עולם
        """)
        lines = parse_srt(path)
        assert len(lines) == 1
        assert lines[0]["text"] == "שלום עולם"
        assert "speaker" not in lines[0]

    def test_speaker_prefix_extracted_and_stripped(self):
        path = write_srt("""
            1
            00:00:01,000 --> 00:00:03,000
            [SPEAKER_00] שלום עולם
        """)
        lines = parse_srt(path)
        assert len(lines) == 1
        assert lines[0]["text"] == "שלום עולם"
        assert lines[0]["speaker"] == "SPEAKER_00"

    def test_speaker_01_extracted(self):
        path = write_srt("""
            1
            00:00:05,000 --> 00:00:08,000
            [SPEAKER_01] מה שלומך
        """)
        lines = parse_srt(path)
        assert lines[0]["speaker"] == "SPEAKER_01"
        assert lines[0]["text"] == "מה שלומך"

    def test_mixed_lines(self):
        path = write_srt("""
            1
            00:00:01,000 --> 00:00:03,000
            [SPEAKER_00] ראשון

            2
            00:00:04,000 --> 00:00:06,000
            שני ללא תווית

            3
            00:00:07,000 --> 00:00:09,000
            [SPEAKER_01] שלישי
        """)
        lines = parse_srt(path)
        assert len(lines) == 3
        assert lines[0]["speaker"] == "SPEAKER_00"
        assert "speaker" not in lines[1]
        assert lines[2]["speaker"] == "SPEAKER_01"
```

- [ ] **Step 2: Run to confirm failures**

```bash
uv run pytest tests/test_build_data.py -v
```

Expected: 4 test failures — `parse_srt` returns no `speaker` field yet.

- [ ] **Step 3: Add speaker parsing to `scripts/build_data.py`**

At the top of `build_data.py`, add one new constant after the existing `TIMESTAMP_RE`:

```python
SPEAKER_RE = re.compile(r"^\[SPEAKER_(\d+)\]\s*")
```

In `parse_srt`, replace the section that builds `body` and appends to `lines_out`:

```python
        # existing code that builds body:
        body = " ".join(
            l.strip() for l in block_lines[text_start:] if l.strip()
        )
        if body:
            lines_out.append({"start": start, "end": end, "text": body})
```

Replace with:

```python
        body = " ".join(
            l.strip() for l in block_lines[text_start:] if l.strip()
        )
        if body:
            entry: dict = {"start": start, "end": end}
            m = SPEAKER_RE.match(body)
            if m:
                entry["speaker"] = f"SPEAKER_{m.group(1).zfill(2)}"
                entry["text"] = body[m.end():]
            else:
                entry["text"] = body
            lines_out.append(entry)
```

- [ ] **Step 4: Run to confirm passing**

```bash
uv run pytest tests/test_build_data.py -v
```

Expected: 4 tests pass.

- [ ] **Step 5: Run full test suite to confirm nothing broken**

```bash
uv run pytest tests/ -v
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add scripts/build_data.py tests/test_build_data.py
git commit -m "feat: build_data.py — parse [SPEAKER_XX] prefix into speaker field"
```

---

## Task 8: Update `single.ps1` and `batch.ps1`

**Files:**
- Modify: `scripts/single.ps1`
- Modify: `scripts/batch.ps1`

No automated tests for PowerShell — verified manually in Task 9.

The key change: extract audio to a temp WAV file (instead of piping stdin to whisper). This lets both whisper and diarize.py read from the same file. Add `--dtw medium --max-len 160` to the whisper command.

- [ ] **Step 1: Rewrite `scripts/single.ps1`**

```powershell
Param(
	[Parameter(Mandatory)]
	[string] $Name,

	[Parameter(Mandatory)]
	[string] $OutputDir,

	[switch] $SkipChapters = $false,
	[switch] $SkipDiarize = $false
)

$WhisperExe = "..\whisper.cpp\build\bin\Release\whisper-cli.exe"
$ScriptsDir = Split-Path -Parent $MyInvocation.MyCommand.Definition

$file = Get-Item -Path $Name

New-Item -Path $OutputDir -ItemType Directory -Force | Out-Null

$outdir = Join-Path $OutputDir $file.Directory.BaseName
New-Item -Path $outdir -ItemType Directory -Force | Out-Null

$outfile   = Join-Path $outdir $file.BaseName
$outscenes = Join-Path $outdir "$($file.BaseName).scenes"
$outlog    = Join-Path $outdir "$($file.BaseName).log"
$tempWav   = Join-Path $outdir "$($file.BaseName).tmp.wav"

# Step 1: Extract 16 kHz mono WAV
Write-Host "Extracting audio..."
ffmpeg -nostdin -threads 0 -i "$file" -f wav -ac 1 -acodec pcm_s16le -ar 16000 "$tempWav" 2>&1 |
	Tee-Object -FilePath $outlog

# Step 2: Transcribe with DTW word-level timestamps
Write-Host "Transcribing..."
$whisperArgs = @(
	"-m", "..\whisper.cpp\models\ivrit-ggml-large-v3-turbo.bin",
	"-vm", "..\whisper.cpp\models\ggml-silero-v6.2.0.bin",
	"--vad",
	"-l", "he",
	"-ojf", "-osrt",
	"-of", "temp",
	"-pp",
	"-et", "2.8",
	"-mc", "64",
	"--dtw", "medium",
	"--max-len", "160",
	"-f", $tempWav
)
& $WhisperExe @whisperArgs 2>&1 | Tee-Object -FilePath $outlog -Append

Move-Item -Path "temp.json" -Destination "$outfile.json" -Force
Move-Item -Path "temp.srt"  -Destination "$outfile.srt"  -Force

# Step 3: Diarize (optional, skippable for testing)
if (-not $SkipDiarize) {
	Write-Host "Diarizing..."
	uv run python (Join-Path $ScriptsDir "diarize.py") "$tempWav" "$outfile.diarization.json"
}

# Step 4: Post-process (requires both JSON files)
if ((Test-Path "$outfile.json") -and (Test-Path "$outfile.diarization.json")) {
	Write-Host "Post-processing..."
	uv run python (Join-Path $ScriptsDir "postprocess.py") `
		"$outfile.json" `
		"$outfile.diarization.json" `
		--out-srt "$outfile.srt" `
		--out-json "$outfile.processed.json"
}

# Step 5: Scene detection
if (-not $SkipChapters) {
	ffmpeg -i $file -filter:v "select='gt(scene,0.4)',showinfo" -f null - 2> $outscenes
}

# Cleanup
Remove-Item $tempWav -ErrorAction SilentlyContinue
```

- [ ] **Step 2: Rewrite `scripts/batch.ps1`**

```powershell
param(
	[Parameter(Mandatory)]
	[string] $SourceDir,

	[Parameter(Mandatory)]
	[string] $OutputDir,

	[switch] $SkipDiarize = $false
)

$SourceDir = Get-Item $SourceDir
$OutputDir = Get-Item $OutputDir
$ScriptsDir = Split-Path -Parent $MyInvocation.MyCommand.Definition

$WhisperExe = "..\whisper.cpp\build\bin\Release\whisper-cli.exe"
$DoneList   = Join-Path $OutputDir "donelist.txt"

New-Item -Path $OutputDir  -ItemType Directory -Force | Out-Null
New-Item -Path $DoneList   -ItemType File       -Force | Out-Null

Get-ChildItem -Recurse $SourceDir |
Where-Object { $_.Extension -in ".mp4", ".mkv", ".avi" } |
ForEach-Object {
	$outdir  = Join-Path $OutputDir $_.Directory.BaseName
	New-Item -Path $outdir -ItemType Directory -Force | Out-Null

	$outfile   = Join-Path $outdir $_.BaseName
	$outscenes = Join-Path $outdir "$($_.BaseName).scenes"
	$outlog    = Join-Path $outdir "$($_.BaseName).log"
	$tempWav   = Join-Path $outdir "$($_.BaseName).tmp.wav"

	if ((Select-String -Path $DoneList -Pattern $outfile -SimpleMatch) -ne $null) {
		Write-Host "$outfile done. Skipping."
		continue
	}

	# Step 1: Extract audio
	Write-Host "[$($_.BaseName)] Extracting audio..."
	ffmpeg -nostdin -threads 0 -i "$_" -f wav -ac 1 -acodec pcm_s16le -ar 16000 "$tempWav" 2>&1 |
		Tee-Object -FilePath $outlog

	# Step 2: Transcribe
	Write-Host "[$($_.BaseName)] Transcribing..."
	$whisperArgs = @(
		"-m", "..\whisper.cpp\models\ivrit-ggml-large-v3-turbo.bin",
		"-vm", "..\whisper.cpp\models\ggml-silero-v6.2.0.bin",
		"--vad", "-l", "he", "-ojf", "-osrt", "-of", "temp", "-pp",
		"-et", "2.8", "-mc", "64", "--dtw", "medium", "--max-len", "160",
		"-f", $tempWav
	)
	& $WhisperExe @whisperArgs 2>&1 | Tee-Object -FilePath $outlog -Append

	Move-Item -Path "temp.json" -Destination "$outfile.json" -Force
	Move-Item -Path "temp.srt"  -Destination "$outfile.srt"  -Force

	# Step 3: Diarize
	if (-not $SkipDiarize) {
		Write-Host "[$($_.BaseName)] Diarizing..."
		uv run python (Join-Path $ScriptsDir "diarize.py") "$tempWav" "$outfile.diarization.json"
	}

	# Step 4: Post-process
	if ((Test-Path "$outfile.json") -and (Test-Path "$outfile.diarization.json")) {
		Write-Host "[$($_.BaseName)] Post-processing..."
		uv run python (Join-Path $ScriptsDir "postprocess.py") `
			"$outfile.json" `
			"$outfile.diarization.json" `
			--out-srt "$outfile.srt" `
			--out-json "$outfile.processed.json"
	}

	# Step 5: Scene detection
	ffmpeg -i $_ -filter:v "select='gt(scene,0.4)',showinfo" -f null - 2> $outscenes

	Remove-Item $tempWav -ErrorAction SilentlyContinue
	Add-Content -Path $DoneList -Value $outfile
}
```

- [ ] **Step 3: Commit**

```bash
git add scripts/single.ps1 scripts/batch.ps1
git commit -m "feat: single.ps1/batch.ps1 — add DTW, diarize, and postprocess steps"
```

---

## Task 9: End-to-end smoke test on one episode

Manual verification. No automated test — this exercises the full new pipeline on real audio.

- [ ] **Step 1: Rebuild whisper.cpp with DTW support (if needed)**

DTW is a compile-time or runtime flag in whisper.cpp — no recompile needed; `--dtw medium` is a runtime argument. Verify by running:

```powershell
..\whisper.cpp\build\bin\Release\whisper-cli.exe --help | Select-String "dtw"
```

Expected: `--dtw MODEL` listed. If not, rebuild whisper.cpp from source (out of scope here — consult whisper.cpp README).

- [ ] **Step 2: Run single.ps1 on one episode (skip chapters for speed)**

```powershell
cd scripts
.\single.ps1 -Name "H:\Comedy_Store\Season1\פרק_009.mkv" -OutputDir "..\process_test" -SkipChapters
```

Expected runtime: ~10–20 min for a 30-min episode (transcription dominates; diarization adds ~2–5 min on GPU).

- [ ] **Step 3: Verify the output files exist**

```powershell
ls ..\process_test\**\פרק_009.*
```

Expected files:
- `פרק_009.json` — whisper output (with `t_dtw` values populated)
- `פרק_009.diarization.json` — speaker turns array
- `פרק_009.processed.json` — corrected transcription with `speaker` fields
- `פרק_009.srt` — final SRT with `[SPEAKER_XX]` prefixes

- [ ] **Step 4: Verify DTW values are populated in the JSON**

```bash
uv run python -c "
import json
data = json.load(open(r'..\process_test\...\פרק_009.json'))
seg = data['transcription'][0]
dtw_vals = [t['t_dtw'] for t in seg['tokens'] if t['t_dtw'] != -1]
print('First segment DTW values (ms):', dtw_vals[:5])
print('First segment original start (ms):', seg['offsets']['from'])
"
```

Expected: at least a few non-(-1) values. If ALL values are still -1, whisper.cpp was built without DTW support or the `--dtw medium` flag is not recognized. In that case, the post-processor falls back to original timestamps (still works, just without the correction).

- [ ] **Step 5: Spot-check the corrected SRT against the video**

Open `פרק_009.srt` in a text editor and `פרק_009.mkv` in a player. Pick 3–4 lines that previously appeared in the wrong chapter and verify their timestamps now align with when the words are actually spoken.

- [ ] **Step 6: Run the data build and verify the website**

```bash
# Copy the processed files to files/פרק_009/
cp process_test/.../פרק_009.srt files/פרק_009/פרק_009.srt
cp process_test/.../פרק_009.processed.json files/פרק_009/פרק_009.processed.json

# Rebuild data
npm run build:data

# Start local dev server
npm run dev
```

Open `http://localhost:PORT` and navigate to episode 9. Verify:
1. Lines with speakers show `[SPEAKER_XX]` prefix in the text (Phase 2 will render these as badges — for now the raw prefix is visible)
2. Lines fall in the correct chapter blocks

- [ ] **Step 7: Commit any fixes found during smoke test**

If spot-checking reveals issues (e.g. DTW units wrong, split logic misbehaves), fix them, add a regression test, and commit before proceeding.

---

## Verification Checklist

- [ ] `uv run pytest tests/ -v` — all tests pass
- [ ] `פרק_009.diarization.json` — non-empty, plausible speaker turns
- [ ] `פרק_009.processed.json` — `speaker` field on segments, corrected `offsets.from` values
- [ ] `פרק_009.srt` — `[SPEAKER_XX]` prefix on lines, no obviously-wrong timestamps
- [ ] `subtitles.json` — line objects for episode 9 include `speaker` field
- [ ] Episodes without `.processed.json` unaffected (backward-compatible)
