"""Tests for speaker-prefix parsing in build_data.py."""
import tempfile
import textwrap
from pathlib import Path

from scripts.build_data import parse_srt


def write_srt(content: str) -> Path:
    f = tempfile.NamedTemporaryFile(
        mode="w", suffix=".srt", delete=False, encoding="utf-8"
    )
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
