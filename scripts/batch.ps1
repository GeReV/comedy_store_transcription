param(
	[Parameter(Mandatory)]
	[string] $SourceDir,

	[Parameter(Mandatory)]
	[string] $OutputDir,

	[switch] $SkipDiarize = $false
)

$SourceDir = Get-Item $SourceDir
$OutputDir = Get-Item $OutputDir
$ScriptsDir = Split-Path -Parent $MyInvocation.MyCommand.Definition

$WhisperExe = "..\whisper.cpp\build\bin\Release\whisper-cli.exe"
$DoneList   = Join-Path $OutputDir "donelist.txt"

New-Item -Path $OutputDir  -ItemType Directory -Force | Out-Null
New-Item -Path $DoneList   -ItemType File       -Force | Out-Null

Get-ChildItem -Recurse $SourceDir |
Where-Object { $_.Extension -in ".mp4", ".mkv", ".avi" } |
ForEach-Object {
	$outdir  = Join-Path $OutputDir $_.Directory.BaseName
	New-Item -Path $outdir -ItemType Directory -Force | Out-Null

	$outfile   = Join-Path $outdir $_.BaseName
	$outscenes = Join-Path $outdir "$($_.BaseName).scenes"
	$outlog    = Join-Path $outdir "$($_.BaseName).log"
	$tempWav   = Join-Path $outdir "$($_.BaseName).tmp.wav"

	if ((Select-String -Path $DoneList -Pattern $outfile -SimpleMatch) -ne $null) {
		Write-Host "$outfile done. Skipping."
		continue
	}

	# Step 1: Extract audio
	Write-Host "[$($_.BaseName)] Extracting audio..."
	ffmpeg -nostdin -threads 0 -i "$_" -f wav -ac 1 -acodec pcm_s16le -ar 16000 "$tempWav" 2>&1 |
		Tee-Object -FilePath $outlog

	# Step 2: Transcribe
	Write-Host "[$($_.BaseName)] Transcribing..."
	$whisperArgs = @(
		"-m", "..\whisper.cpp\models\ivrit-ggml-large-v3-turbo.bin",
		"-vm", "..\whisper.cpp\models\ggml-silero-v6.2.0.bin",
		"--vad", "-l", "he", "-ojf", "-osrt", "-of", "temp", "-pp",
		"-et", "2.8", "-mc", "64", "--dtw", "medium", "--max-len", "160",
		"-f", $tempWav
	)
	& $WhisperExe @whisperArgs 2>&1 | Tee-Object -FilePath $outlog -Append

	Move-Item -Path "temp.json" -Destination "$outfile.json" -Force
	Move-Item -Path "temp.srt"  -Destination "$outfile.srt"  -Force

	# Step 3: Diarize
	if (-not $SkipDiarize) {
		Write-Host "[$($_.BaseName)] Diarizing..."
		uv run python (Join-Path $ScriptsDir "diarize.py") "$tempWav" "$outfile.diarization.json"
	}

	# Step 4: Post-process
	if ((Test-Path "$outfile.json") -and (Test-Path "$outfile.diarization.json")) {
		Write-Host "[$($_.BaseName)] Post-processing...]"
		uv run python (Join-Path $ScriptsDir "postprocess.py") `
			"$outfile.json" `
			"$outfile.diarization.json" `
			--out-srt "$outfile.srt" `
			--out-json "$outfile.processed.json"
	}

	# Step 5: Scene detection
	ffmpeg -i $_ -filter:v "select='gt(scene,0.4)',showinfo" -f null - 2> $outscenes

	Remove-Item $tempWav -ErrorAction SilentlyContinue
	Add-Content -Path $DoneList -Value $outfile
}
