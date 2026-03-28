param(
    [Parameter(Mandatory)]
    [string] $Path
)

$directory = Get-Item $Path

Get-ChildItem -Recurse $directory -Filter "*.scenes" |
Foreach-Object {
    echo $_.FullName
    python .\chapters.py $_
}