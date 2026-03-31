#!/usr/bin/env bash
# Process a single video file: extract → transcribe → diarize → post-process → scenes.
set -euo pipefail

INPUT="$1"
OUTPUT_DIR="$2"
shift 2

SKIP_CHAPTERS=false
SKIP_DIARIZE=false
for arg in "$@"; do
    case "$arg" in
        --skip-chapters) SKIP_CHAPTERS=true ;;
        --skip-diarize)  SKIP_DIARIZE=true ;;
    esac
done

BASENAME=$(basename "$INPUT")
BASENAME="${BASENAME%.*}"
OUTDIR="$OUTPUT_DIR/$BASENAME"
mkdir -p "$OUTDIR"

OUTFILE="$OUTDIR/$BASENAME"
TEMP_WAV=$(mktemp /tmp/whisper-XXXXXX.wav)
trap 'rm -f "$TEMP_WAV"' EXIT

# Step 1: Extract 16 kHz mono WAV
echo "[$BASENAME] Extracting audio..."
ffmpeg -nostdin -threads 0 -y -i "$INPUT" \
    -f wav -ac 1 -acodec pcm_s16le -ar 16000 "$TEMP_WAV" \
    2>&1 | tee "$OUTFILE.log"

# Step 2: Transcribe
echo "[$BASENAME] Transcribing..."
/app/whisper.cpp/whisper-cli \
    -m "$WHISPER_MODEL" \
    -vm "$VAD_MODEL" \
    --vad -l he -ojf -osrt -of "$OUTFILE" -pp \
    -et 2.8 -mc 64 --dtw large.v3.turbo --no-flash-attn --max-len 160 \
    -f "$TEMP_WAV" \
    2>&1 | tee -a "$OUTFILE.log"

# Step 3: Diarize
if [[ "$SKIP_DIARIZE" == false ]]; then
    echo "[$BASENAME] Diarizing..."
    uv run python /app/scripts/diarize.py "$TEMP_WAV" "$OUTFILE.diarization.json" \
        2>&1 | tee -a "$OUTFILE.log"
fi

# Step 4: Post-process
if [[ -f "$OUTFILE.json" && -f "$OUTFILE.diarization.json" ]]; then
    echo "[$BASENAME] Post-processing..."
    uv run python /app/scripts/postprocess.py \
        "$OUTFILE.json" \
        "$OUTFILE.diarization.json" \
        --out-srt  "$OUTFILE.srt" \
        --out-json "$OUTFILE.processed.json" \
        2>&1 | tee -a "$OUTFILE.log"
fi

# Step 5: Scene detection
if [[ "$SKIP_CHAPTERS" == false ]]; then
    echo "[$BASENAME] Detecting scenes..."
    ffmpeg -i "$INPUT" \
        -filter:v "select='gt(scene,0.4)',showinfo" -f null - \
        2>"$OUTFILE.scenes"
fi

echo "[$BASENAME] Done → $OUTDIR"
