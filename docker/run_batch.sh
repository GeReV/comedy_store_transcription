#!/usr/bin/env bash
# Usage: ./docker/run_batch.sh <input_dir> [--skip-diarize]
# Example: ./docker/run_batch.sh "H:/Comedy_Store"
set -euo pipefail

INPUT_DIR="$1"; shift
MODELS_DIR="$(dirname "$0")/../whisper.cpp/models"
OUTPUT_DIR="${PROCESS_DIR:-$(dirname "$0")/../process}"

docker run --gpus all --rm \
  -v "$(realpath "$INPUT_DIR"):/input:ro" \
  -v "$(realpath "$MODELS_DIR"):/models:ro" \
  -v "$(realpath "$OUTPUT_DIR"):/output" \
  --env-file "$(dirname "$0")/../.env" \
  comedy-transcribe batch /input /output "$@"
