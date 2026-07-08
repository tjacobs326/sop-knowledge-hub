$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$envPath = Join-Path $root ".env.local"

$secureKey = Read-Host "Paste your HelpDocs API key" -AsSecureString
$plainKey = [System.Net.NetworkCredential]::new("", $secureKey).Password.Trim()

if (-not $plainKey) {
  Write-Error "No API key was entered."
  exit 1
}

$existingLines = @()
if (Test-Path -LiteralPath $envPath) {
  $existingLines = Get-Content -LiteralPath $envPath | Where-Object {
    $_ -notmatch '^\s*HELPDOCS_API_KEY\s*='
  }
}

$updatedLines = @($existingLines) + "HELPDOCS_API_KEY=$plainKey"
[System.IO.File]::WriteAllLines($envPath, $updatedLines, [System.Text.UTF8Encoding]::new($false))

Write-Host "HelpDocs API key saved to .env.local."
Write-Host "This file is ignored by Git."
