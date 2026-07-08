param(
  [string]$OutputPath = ".\helpdocs-sample-articles.json",
  [int]$Limit = 10
)

$envFile = Join-Path (Get-Location) ".env.local"
if ((-not $env:HELPDOCS_API_KEY) -and (Test-Path -LiteralPath $envFile)) {
  Get-Content -LiteralPath $envFile | ForEach-Object {
    if ($_ -match '^\s*HELPDOCS_API_KEY\s*=\s*(.+?)\s*$') {
      $env:HELPDOCS_API_KEY = $Matches[1].Trim('"').Trim("'")
    }
  }
}

if (-not $env:HELPDOCS_API_KEY) {
  Write-Error "HELPDOCS_API_KEY is not set. Run .\scripts\configure-helpdocs.ps1 first, or set HELPDOCS_API_KEY in your shell."
  exit 1
}

$headers = @{
  Authorization = "Bearer $($env:HELPDOCS_API_KEY)"
}

Write-Host "Exporting HelpDocs sample articles..."

Invoke-RestMethod `
  -Uri "https://api.helpdocs.io/v1/article?include_body=true&limit=$Limit" `
  -Headers $headers |
  ConvertTo-Json -Depth 20 |
  Out-File $OutputPath -Encoding utf8

Write-Host "Export complete: $OutputPath"
