#!/usr/bin/env bash
# Usage: ./docker/run_single.sh <video_file> [--skip-chapters] [--skip-diarize]
# Example: ./docker/run_single.sh "H:/Comedy_Store/Season1/פרק_001.mkv"
set -euo pipefail

VIDEO="$1"; shift
ROOT="$(realpath "$(dirname "$0")/..")"
MODELS_DIR="$ROOT/whisper.cpp/models"
OUTPUT_DIR="${PROCESS_DIR:-$ROOT/process}"

mkdir -p "$OUTPUT_DIR"
IMAGE=$(docker build --quiet "$ROOT")

docker run --gpus all --rm \
  -v "$(realpath "$VIDEO"):/input/$(basename "$VIDEO"):ro" \
  -v "$MODELS_DIR:/models:ro" \
  -v "$OUTPUT_DIR:/output" \
  --env-file "$ROOT/.env" \
  "$IMAGE" single "/input/$(basename "$VIDEO")" /output "$@"
