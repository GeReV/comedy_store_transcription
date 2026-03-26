# The Comedy Store transcriptions

This repo contains a [whisper.cpp](https://github.com/ggml-org/whisper.cpp) transcription of (as far as I can tell) all episodes of the Israeli TV show [הקומדי סטור (The Comedy Store)](https://he.wikipedia.org/wiki/%D7%94%D7%A7%D7%95%D7%9E%D7%93%D7%99_%D7%A1%D7%98%D7%95%D7%A8), plus a searchable website built on top of them.

The transcriptions and chapters were generated using automated tools and contain many mistakes.

## Website

A searchable interface for all episode transcriptions is available at:
**https://gerev.github.io/comedy_store**

## Repository contents

### `files/`
The transcription output, one subdirectory per episode:
- **`.srt`** — subtitles file
- **`.json`** — raw whisper.cpp output
- **`.chapters.xml`** — Matroska chapter XML for use with [MKVToolNix](https://mkvtoolnix.download/)

Episodes are named `פרק_NNN...` (zero-padded). The `Comedy_Store_2020/` directory holds the 2020 reunion season (5 episodes).

Chapters are derived from ffmpeg scene detection and reflect camera cuts, not logical scenes — a single scene may be split into multiple chapters.

### `scripts/`
PowerShell and Python scripts for the transcription pipeline:

| Script | Description |
|---|---|
| `single.ps1` | Transcribe a single video file |
| `batch.ps1` | Batch-transcribe all episodes under `C:\Comedy_Store\` |
| `batch_chapters.ps1` | Convert all `.scenes` logs in `process/` to `.chapters.xml` |
| `chapters.py` | Convert a single ffmpeg `.scenes` log to Matroska chapter XML |
| `replace.ps1` | Global search-and-replace across all `.srt` and `.json` files |
| `naming.ps1` | Rename files to use zero-padded episode numbers |
| `build_data.py` | Build website data files from the transcriptions |
| `convert_encoding.py` | Encoding utility |

#### Prerequisites
- whisper.cpp built at `.\whisper.cpp\build\bin\Release\whisper-cli.exe`
- Models at `.\whisper.cpp\models\ggml-large-v3-turbo.bin` and `ggml-silero-v6.2.0.bin`
- ffmpeg on PATH
- Python ≥ 3.13 (managed via `uv`)

#### Usage examples
```powershell
# Transcribe a single episode
.\scripts\single.ps1 -Name "C:\Comedy_Store\Season1\פרק_001.mkv"

# Batch-transcribe all episodes (skips already-done files)
.\scripts\batch.ps1

# Generate chapter XML for all processed episodes
.\scripts\batch_chapters.ps1

# Fix a transcription error across all files
.\scripts\replace.ps1 -From "wrong text" -To "correct text"
```

### `src/` and `static/`
Website source. TypeScript compiled with esbuild, plain CSS, single `index.html`. Deployed to GitHub Pages via GitHub Actions.

```bash
npm install          # install build deps
npm run build        # build data + compile TypeScript
npm run dev          # watch mode + local server on static/
```

## License

The website code is MIT licensed — see [LICENSE](LICENSE).

The transcriptions are provided for personal, non-commercial use only. All rights to the original show belong to Tedy Productions (טדי יזמות והפקות בע"מ).

## Contributing

Corrections and improvements are welcome — feel free to open a pull request.
