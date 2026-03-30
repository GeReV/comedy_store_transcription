#!/usr/bin/env bash
# Usage: ./docker/run_single.sh <video_file> [--skip-chapters] [--skip-diarize]
# Example: ./docker/run_single.sh "H:/Comedy_Store/Season1/פרק_001.mkv"
set -euo pipefail

VIDEO="$1"; shift
MODELS_DIR="$(dirname "$0")/../whisper.cpp/models"
OUTPUT_DIR="${PROCESS_DIR:-$(dirname "$0")/../process}"

docker run --gpus all --rm \
  -v "$(realpath "$VIDEO"):/input/$(basename "$VIDEO"):ro" \
  -v "$(realpath "$MODELS_DIR"):/models:ro" \
  -v "$(realpath "$OUTPUT_DIR"):/output" \
  --env-file "$(dirname "$0")/../.env" \
  comedy-transcribe single "/input/$(basename "$VIDEO")" /output "$@"
