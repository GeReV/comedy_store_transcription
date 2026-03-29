from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

_SPECIAL_TOKEN_RE = re.compile(r"^\[_")


def ms_to_ts(ms: int) -> str:
    """Convert milliseconds to SRT timestamp string HH:MM:SS,mmm."""
    h = ms // 3_600_000
    ms %= 3_600_000
    m = ms // 60_000
    ms %= 60_000
    s = ms // 1000
    ms %= 1000
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


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


def find_split_point(segment: dict) -> int | None:
    """Find a suitable split point within a segment. Stub for future implementation."""
    raise NotImplementedError


def needs_split(segment: dict) -> bool:
    """Determine if a segment should be split. Stub for future implementation."""
    raise NotImplementedError


def process_segment(segment: dict) -> dict:
    """Process a single segment. Stub for future implementation."""
    raise NotImplementedError


def get_corrected_start(segment: dict) -> int:
    """
    Return the first token's t_dtw value (ms) as the corrected segment start.
    Falls back to segment's offsets.from if no token has a valid t_dtw.
    """
    for token in segment.get("tokens", []):
        if token.get("t_dtw", -1) != -1:
            return token["t_dtw"]
    return segment["offsets"]["from"]
