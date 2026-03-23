Param(
	[Parameter(Mandatory)]
	[string] $Name,
	
	[switch] $SkipChapters = $false
) 

echo $Name

$WhisperExe = ".\whisper.cpp\build\bin\Release\whisper-cli.exe"

$OutputDir = '.\process'



$file = Get-Item -Path $Name

New-Item -Path $OutputDir -ItemType Directory -Force | Out-Null

$outdir = Join-Path $OutputDir $file.Directory.BaseName

New-Item -Path $outdir -ItemType Directory -Force | Out-Null

$outfile = Join-Path $outdir $file.BaseName
$outscenes = Join-Path $outdir "$($file.BaseName).scenes"
$outlog = Join-Path $outdir "$($file.BaseName).log"

$cmd = "ffmpeg -nostdin -threads 0 -i '$file' -f wav -ac 1 -acodec pcm_s16le -ar 16000 - | 
	$WhisperExe -m .\whisper.cpp\models\ggml-large-v3-turbo.bin -vm .\whisper.cpp\models\ggml-silero-v6.2.0.bin --vad -l he -ojf -osrt -of temp -pp -et 2.8 -mc 64 -f - 2>&1 | 
	Tee-Object -FilePath '$outlog'"
	
Invoke-Expression $cmd
	
Move-Item -Path "temp.json" -Destination "$outfile.json"
Move-Item -Path "temp.srt" -Destination "$outfile.srt"

if ( -not $SkipChapters ) {
	ffmpeg -i $file -filter:v "select='gt(scene,0.4)',showinfo" -f null - 2> $outscenes
}
