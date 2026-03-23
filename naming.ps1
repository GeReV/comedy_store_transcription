Get-ChildItem -Recurse .\files\ | ForEach-Object {
	$name = $_.Name

	if ( $name -match "פרק_([0-9]+)(.*)" ){
		$num = $Matches[1].PadLeft(3, '0')
		$rest = $Matches[2]

		Rename-Item -Path $_ -NewName "פרק_$num$rest"
	}
 }