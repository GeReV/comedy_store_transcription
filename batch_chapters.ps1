Get-ChildItem -Recurse ".\process" -Filter "*.scenes" |
Foreach-Object {
    echo $_.FullName
    python .\chapters.py $_
}