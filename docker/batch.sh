#!/usr/bin/env bash
# Process all video files under input_dir, skipping already-completed files.
set -uo pipefail

INPUT_DIR="$1"
OUTPUT_DIR="$2"
shift 2

SKIP_CHAPTERS=false
SKIP_DIARIZE=false
for arg in "$@"; do
    [[ "$arg" == "--skip-chapters" ]] && SKIP_CHAPTERS=true
    [[ "$arg" == "--skip-diarize" ]] && SKIP_DIARIZE=true
done

mkdir -p "$OUTPUT_DIR"
DONELIST="$OUTPUT_DIR/donelist.txt"
touch "$DONELIST"

FAILLIST="$OUTPUT_DIR/failed.txt"
touch "$FAILLIST"

extra_args=()
[[ "$SKIP_CHAPTERS" == true ]] && extra_args+=("--skip-chapters")
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

        if grep -qF "$OUTFILE" "$FAILLIST" 2>/dev/null; then
            echo "$BASENAME: failed previously, skipping."
            continue
        fi

        /app/docker/single.sh "$file" "$OUTPUT_DIR" "${extra_args[@]}"

        if [ $? -eq 0 ]; then
          echo "$OUTFILE" >> "$DONELIST"
        else
          echo "$OUTFILE" >> "$FAILLIST"
        fi

    done
