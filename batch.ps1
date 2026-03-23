$SourceDir = "C:\Comedy_Store\"

$WhisperExe = ".\whisper.cpp\build\bin\Release\whisper-cli.exe"

$OutputDir = '.\process'
$DoneList = Join-Path $OutputDir "donelist.txt"

New-Item -Path $OutputDir -ItemType Directory -Force | Out-Null

New-Item -Path $DoneList -ItemType File -Force | Out-Null

Get-ChildItem -Recurse $SourceDir | where {$_.extension -in ".mp4",".mkv"} |
Foreach-Object {
	$outdir = Join-Path $OutputDir $_.Directory.BaseName
	
	New-Item -Path $outdir -ItemType Directory -Force | Out-Null
	
	$outfile = Join-Path $outdir $_.BaseName
	$outscenes = Join-Path $outdir "$($_.BaseName).scenes"
	$outlog = Join-Path $outdir "$($_.BaseName).log"
	
	if ((Select-String -Path $DoneList -Pattern $outfile -SimpleMatch) -ne $null) { 
		echo "$outfile done. Skipping."
		
		continue 
	}
	
	$cmd = "ffmpeg -nostdin -threads 0 -i '$_' -f wav -ac 1 -acodec pcm_s16le -ar 16000 - | 
		$WhisperExe -m .\whisper.cpp\models\ggml-large-v3-turbo.bin -vm .\whisper.cpp\models\ggml-silero-v6.2.0.bin --vad -l he -ojf -osrt -of temp -pp -et 2.8 -mc 64 -f - 2>&1 | 
		Tee-Object -FilePath '$outlog'"
		
	Invoke-Expression $cmd
		
	Move-Item -Path "temp.json" -Destination "$outfile.json"
	Move-Item -Path "temp.srt" -Destination "$outfile.srt"
	
	ffmpeg -i $_ -filter:v "select='gt(scene,0.4)',showinfo" -f null - 2> $outscenes
	
	Add-Content -Path $DoneList -Value $outfile
}

