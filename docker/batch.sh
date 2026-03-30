#!/usr/bin/env bash
# Process all video files under input_dir, skipping already-completed files.
set -euo pipefail

INPUT_DIR="$1"
OUTPUT_DIR="$2"
shift 2

SKIP_DIARIZE=false
for arg in "$@"; do
    [[ "$arg" == "--skip-diarize" ]] && SKIP_DIARIZE=true
done

mkdir -p "$OUTPUT_DIR"
DONELIST="$OUTPUT_DIR/donelist.txt"
touch "$DONELIST"

extra_args=()
[[ "$SKIP_DIARIZE" == true ]] && extra_args+=("--skip-diarize")

find "$INPUT_DIR" -type f \( -iname "*.mp4" -o -iname "*.mkv" -o -iname "*.avi" \) \
  | sort \
  | while IFS= read -r file; do
        BASENAME=$(basename "$file"); BASENAME="${BASENAME%.*}"
        OUTFILE="$OUTPUT_DIR/$BASENAME/$BASENAME"

        if grep -qF "$OUTFILE" "$DONELIST" 2>/dev/null; then
            echo "$BASENAME: already done, skipping."
            continue
        fi

        /app/docker/single.sh "$file" "$OUTPUT_DIR" "${extra_args[@]}"

        echo "$OUTFILE" >> "$DONELIST"
    done
