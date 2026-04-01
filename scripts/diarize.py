#!/usr/bin/env python3
"""
Run speaker diarization on a 16 kHz mono WAV file.

Usage:
    python scripts/diarize.py <wav_path> <output_json_path>

Requires HF_TOKEN in .env (or environment) with access to
pyannote/speaker-diarization-community-1 on the Hugging Face Hub.

Writes a JSON array of speaker turns:
    [{"start": 1.23, "end": 4.56, "speaker": "SPEAKER_00"}, ...]
"""
import argparse
import json
import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

import torch
from pyannote.audio import Pipeline


def diarize(wav_path: Path) -> list[dict]:
    """Run pyannote diarization, return sorted list of speaker turns."""
    token = os.environ.get("HF_TOKEN")

    pipeline = Pipeline.from_pretrained("pyannote/speaker-diarization-community-1", token=token)
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    pipeline.to(device)

    output = pipeline(str(wav_path))

    turns = [
        {"start": round(turn.start, 3), "end": round(turn.end, 3), "speaker": speaker}
        for turn, speaker in output.speaker_diarization
    ]
    turns.sort(key=lambda t: t["start"])
    return turns


def main() -> None:
    parser = argparse.ArgumentParser(description="Speaker diarization via pyannote")
    parser.add_argument("wav", type=Path, help="16 kHz mono WAV file")
    parser.add_argument("output", type=Path, help="Output .diarization.json path")
    args = parser.parse_args()

    turns = diarize(args.wav)

    args.output.write_text(
        json.dumps(turns, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(f"Wrote {len(turns)} speaker turns to {args.output}")


if __name__ == "__main__":
    main()
