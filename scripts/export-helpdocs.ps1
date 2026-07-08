if (-not $env:HELPDOCS_API_KEY) {
  Write-Error "HELPDOCS_API_KEY is not set."
  exit 1
}

$headers = @{
  Authorization = "Bearer $($env:HELPDOCS_API_KEY)"
}

Write-Host "Exporting HelpDocs sample articles..."

Invoke-RestMethod `
  -Uri "https://api.helpdocs.io/v1/article?include_body=true&limit=10" `
  -Headers $headers |
  ConvertTo-Json -Depth 20 |
  Out-File ".\helpdocs-sample-articles.json" -Encoding utf8

Write-Host "Export complete: helpdocs-sample-articles.json"
