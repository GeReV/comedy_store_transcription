#!/usr/bin/env bash
# Usage: ./docker/run_batch.sh <input_dir> [--skip-diarize]
# Example: ./docker/run_batch.sh "H:/Comedy_Store"
set -euo pipefail

INPUT_DIR="$1"; shift
ROOT="$(realpath "$(dirname "$0")/..")"
MODELS_DIR="$ROOT/whisper.cpp/models"
OUTPUT_DIR="${PROCESS_DIR:-$ROOT/process}"

mkdir -p "$OUTPUT_DIR"
IMAGE=$(docker build --quiet "$ROOT")

docker run --gpus all --rm \
  -v "$(realpath "$INPUT_DIR"):/input:ro" \
  -v "$MODELS_DIR:/models:ro" \
  -v "$OUTPUT_DIR:/output" \
  --env-file "$ROOT/.env" \
  "$IMAGE" batch /input /output "$@"
