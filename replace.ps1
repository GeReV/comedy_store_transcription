Param(
    [Parameter(Mandatory)]
    [string] $From,

    [Parameter(Mandatory)]
    [string] $To
)

Get-ChildItem -Recurse .\files\ | Where-Object { $_.Extension -in ".srt", ".json" } | ForEach-Object {
    Write-Output $_

    if (Select-String -Path $_ -Pattern $From)
    {
        (Get-Content $_) -replace $From, $To |
            Set-Content $_
    }
}