Param(
	[Parameter(Mandatory)]
	[string] $Name,

	[Parameter(Mandatory)]
	[string] $OutputDir,

	[switch] $SkipChapters = $false,
	[switch] $SkipDiarize = $false
)

$WhisperExe = "..\whisper.cpp\build\bin\Release\whisper-cli.exe"
$ScriptsDir = Split-Path -Parent $MyInvocation.MyCommand.Definition

$file = Get-Item -Path $Name

New-Item -Path $OutputDir -ItemType Directory -Force | Out-Null

$outdir = Join-Path $OutputDir $file.Directory.BaseName
New-Item -Path $outdir -ItemType Directory -Force | Out-Null

$outfile   = Join-Path $outdir $file.BaseName
$outscenes = Join-Path $outdir "$($file.BaseName).scenes"
$outlog    = Join-Path $outdir "$($file.BaseName).log"
$tempWav   = Join-Path $outdir "$($file.BaseName).tmp.wav"

# Step 1: Extract 16 kHz mono WAV
Write-Host "Extracting audio..."
ffmpeg -nostdin -threads 0 -i "$file" -f wav -ac 1 -acodec pcm_s16le -ar 16000 "$tempWav" 2>&1 |
	Tee-Object -FilePath $outlog

# Step 2: Transcribe with DTW word-level timestamps
Write-Host "Transcribing..."
$whisperArgs = @(
	"-m", "..\whisper.cpp\models\ivrit-ggml-large-v3-turbo.bin",
	"-vm", "..\whisper.cpp\models\ggml-silero-v6.2.0.bin",
	"--vad",
	"-l", "he",
	"-ojf", "-osrt",
	"-of", "temp",
	"-pp",
	"-et", "2.8",
	"-mc", "64",
	"--dtw", "medium",
	"--max-len", "160",
	"-f", $tempWav
)
& $WhisperExe @whisperArgs 2>&1 | Tee-Object -FilePath $outlog -Append

Move-Item -Path "temp.json" -Destination "$outfile.json" -Force
Move-Item -Path "temp.srt"  -Destination "$outfile.srt"  -Force

# Step 3: Diarize (optional, skippable for testing)
if (-not $SkipDiarize) {
	Write-Host "Diarizing..."
	uv run python (Join-Path $ScriptsDir "diarize.py") "$tempWav" "$outfile.diarization.json"
}

# Step 4: Post-process (requires both JSON files)
if ((Test-Path "$outfile.json") -and (Test-Path "$outfile.diarization.json")) {
	Write-Host "Post-processing..."
	uv run python (Join-Path $ScriptsDir "postprocess.py") `
		"$outfile.json" `
		"$outfile.diarization.json" `
		--out-srt "$outfile.srt" `
		--out-json "$outfile.processed.json"
}

# Step 5: Scene detection
if (-not $SkipChapters) {
	ffmpeg -i $file -filter:v "select='gt(scene,0.4)',showinfo" -f null - 2> $outscenes
}

# Cleanup
Remove-Item $tempWav -ErrorAction SilentlyContinue
