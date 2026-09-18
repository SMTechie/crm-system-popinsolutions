$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$apiRoot = Join-Path $projectRoot "apps\api"

Start-Process -FilePath "cmd.exe" -ArgumentList @("/d", "/c", "call npm run start:dev") -WorkingDirectory $apiRoot -WindowStyle Hidden
npm run dev:web
