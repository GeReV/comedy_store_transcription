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


def find_split_point(tokens: list[dict], boundary_ms: float, snap_window_ms: float = 500) -> int | None:
    """
    Find the index of the first token of the second split part.
    Snaps to the token whose t_dtw is closest to boundary_ms within snap_window_ms.
    Returns None if no valid token found or if split would be at index 0.
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


def get_corrected_start(segment: dict) -> int:
    """
    Return the first token's t_dtw value (ms) as the corrected segment start.
    Falls back to segment's offsets.from if no token has a valid t_dtw.
    """
    for token in segment.get("tokens", []):
        if token.get("t_dtw", -1) != -1:
            return token["t_dtw"]
    return segment["offsets"]["from"]


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
