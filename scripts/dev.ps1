$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$nodeExe = (Get-Command node -ErrorAction Stop).Source
$npmCli = Join-Path (Split-Path $nodeExe) "node_modules\npm\bin\npm-cli.js"

Start-Process -FilePath $nodeExe -ArgumentList @($npmCli, "run", "dev:api") -WorkingDirectory $projectRoot -WindowStyle Hidden
& $nodeExe $npmCli run dev:web
