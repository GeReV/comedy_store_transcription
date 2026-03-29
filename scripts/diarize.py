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
import torchaudio

# torchaudio >= 2.x removed list_audio_backends; patch for pyannote.audio compat
if not hasattr(torchaudio, "list_audio_backends"):
    torchaudio.list_audio_backends = lambda: ["soundfile"]

from pyannote.audio import Pipeline


def diarize(wav_path: Path, hf_token: str | None = None) -> list[dict]:
    """Run pyannote diarization, return sorted list of speaker turns."""
    pipeline = Pipeline.from_pretrained(
        "ivrit-ai/pyannote-speaker-diarization-3.1",
        use_auth_token=hf_token,  # noqa: deprecated-but-still-accepted by older pyannote
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
