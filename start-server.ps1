$workspace = $PSScriptRoot
$serverFile = Join-Path $workspace "server.js"
$bundledNode = Join-Path $env:USERPROFILE ".cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
$systemNode = Get-Command node -ErrorAction SilentlyContinue

if ($systemNode) {
  & $systemNode.Source $serverFile
  exit $LASTEXITCODE
}

if (Test-Path $bundledNode) {
  & $bundledNode $serverFile
  exit $LASTEXITCODE
}

Write-Error "Node.js was not found. Install Node or use the bundled Codex runtime."
exit 1
