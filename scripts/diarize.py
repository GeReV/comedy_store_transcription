#!/usr/bin/env python3
"""
Run speaker diarization on a 16 kHz mono WAV file.

Usage:
    python scripts/diarize.py <wav_path> <output_json_path>

Writes a JSON array of speaker turns:
    [{"start": 1.23, "end": 4.56, "speaker": "SPEAKER_00"}, ...]
"""
import argparse
import functools
import inspect
import json
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

import huggingface_hub
import torch
import torch.torch_version
import torchaudio

# huggingface_hub 0.23+ removed use_auth_token; pyannote-pipeline 3.0.1 (last
# release, 2023) still passes it to hf_hub_download / snapshot_download.
def _compat_hf(fn):
    if "use_auth_token" not in inspect.signature(fn).parameters:
        @functools.wraps(fn)
        def wrapper(*args, use_auth_token=None, **kwargs):
            if use_auth_token is not None and "token" not in kwargs:
                kwargs["token"] = use_auth_token
            return fn(*args, **kwargs)
        return wrapper
    return fn

huggingface_hub.hf_hub_download = _compat_hf(huggingface_hub.hf_hub_download)
huggingface_hub.snapshot_download = _compat_hf(huggingface_hub.snapshot_download)

# torchaudio 2.1+ removed list_audio_backends; patch so pyannote.audio can
# select a backend.  "soundfile" satisfies pyannote's preference check without
# conflicting with torchaudio 2.11's torchcodec-based loader.
if not hasattr(torchaudio, "list_audio_backends"):
    torchaudio.list_audio_backends = lambda: ["soundfile"]

# torchaudio 2.x removed AudioMetaData from top-level; patch for pyannote.audio compat
if not hasattr(torchaudio, "AudioMetaData"):
    try:
        from torchaudio.backend.common import AudioMetaData
        torchaudio.AudioMetaData = AudioMetaData
    except ImportError:
        from collections import namedtuple
        torchaudio.AudioMetaData = namedtuple(
            "AudioMetaData",
            ["sample_rate", "num_frames", "num_channels", "bits_per_sample", "encoding"],
        )

# torchaudio 2.11 switched to torchcodec which requires FFmpeg shared DLLs and
# conda on Windows (experimental support only).  Replace torchaudio.load and
# torchaudio.info with soundfile-based implementations — no native deps beyond
# libsndfile, which ships as a wheel and handles all WAV files we produce.
import soundfile as _sf

def _torchaudio_load_sf(
    uri, *, frame_offset=0, num_frames=-1, normalize=True,
    channels_first=True, format=None, buffer_size=4096, backend=None,
):
    frames = num_frames if num_frames != -1 else -1
    data, sr = _sf.read(str(uri), frames=frames, start=frame_offset,
                        dtype="float32", always_2d=True)
    waveform = torch.from_numpy(data.T if channels_first else data)
    return waveform, sr

def _torchaudio_info_sf(uri, *, format=None, buffer_size=4096, backend=None):
    i = _sf.info(str(uri))
    bits = int(i.subtype.split("_")[-1]) if i.subtype.split("_")[-1].isdigit() else 16
    return torchaudio.AudioMetaData(
        sample_rate=i.samplerate,
        num_frames=i.frames,
        num_channels=i.channels,
        bits_per_sample=bits,
        encoding="PCM_S",
    )

torchaudio.load = _torchaudio_load_sf
torchaudio.info = _torchaudio_info_sf

# PyTorch 2.6 changed torch.load default to weights_only=True; pyannote
# checkpoints embed several non-tensor objects not in the default safe-globals
# list.  Torchaudio shims must be in place before these pyannote imports.
if hasattr(torch.serialization, "add_safe_globals"):
    from pyannote.audio.core.task import Problem, Resolution, Specifications
    torch.serialization.add_safe_globals([
        torch.torch_version.TorchVersion,
        Specifications,
        Problem,
        Resolution,
    ])

from pyannote.audio import Pipeline


def diarize(wav_path: Path) -> list[dict]:
    """Run pyannote diarization, return sorted list of speaker turns."""
    pipeline = Pipeline.from_pretrained(
        "ivrit-ai/pyannote-speaker-diarization-3.1"
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

    turns = diarize(args.wav)

    args.output.write_text(
        json.dumps(turns, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(f"Wrote {len(turns)} speaker turns to {args.output}")


if __name__ == "__main__":
    main()
