#!/usr/bin/env bash
set -euo pipefail

cmd="${1:-help}"
shift || true

case "$cmd" in
    single) exec /app/docker/single.sh "$@" ;;
    batch)  exec /app/docker/batch.sh  "$@" ;;
    *)
        echo "Usage: docker run <image> {single|batch} ..."
        echo ""
        echo "  single <input_file> <output_dir> [--skip-chapters] [--skip-diarize]"
        echo "  batch  <input_dir>  <output_dir> [--skip-diarize]"
        exit 1
        ;;
esac
