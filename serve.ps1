$ErrorActionPreference = "Stop"

$python = "C:\Users\otake\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path

Set-Location $root
Write-Host "Serving ねこ器タワー at http://127.0.0.1:4173/"
& $python -m http.server 4173 --bind 127.0.0.1
