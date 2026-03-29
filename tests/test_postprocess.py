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
            make_token(t_dtw=-1, offset_from=0, offset_to=100),
            make_token(t_dtw=-1, offset_from=100, offset_to=200),
            make_token(t_dtw=31500, offset_from=200, offset_to=300),
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
