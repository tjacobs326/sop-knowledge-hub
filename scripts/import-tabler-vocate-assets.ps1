param(
  [string]$SourceDir = "C:\Users\Tarek\OneDrive\Documents\Tabler Downloads",
  [string]$OutputDir = "public\assets\tabler-vocate"
)

$ErrorActionPreference = "Stop"

$palette = @{
  Ink = "#1a3263"
  InkDeep = "#0b1b3b"
  Text = "#24304d"
  Muted = "#5d6472"
  Orange = "#f16821"
  OrangeDark = "#b84a12"
  Beacon = "#fab95b"
  Linen = "#fef9f4"
  Dune = "#ebe0d7"
  InkSoft = "#d9e2f3"
  Border = "#ddd0c6"
  Danger = "#b42318"
}

$packages = @(
  @{
    Name = "tabler-icons"
    Zip = "tabler-icons-3.44.0.zip"
    Include = @("^svg/outline/.+\.svg$", "^svg/filled/.+\.svg$")
  },
  @{
    Name = "tabler-illustrations"
    Zip = "tabler-illustrations-1.15.0.zip"
    Include = @("^tabler-illustrations/svg-css-autodark/.+\.svg$")
  }
)

$skipped = @(
  "tabler-1.4.0.zip: SVGs are flags, payment marks, social logos, browser logos, and vendor assets. They were not recolored as app icons because recoloring third-party marks changes their meaning.",
  "tabler-avatars-1.1.0.zip: no SVG files found.",
  "tabler-emails-3.0.zip: no SVG files found."
)

function ConvertTo-VocateSvg {
  param(
    [Parameter(Mandatory = $true)][string]$Content,
    [Parameter(Mandatory = $true)][string]$Kind
  )

  $svg = $Content

  if ($Kind -eq "icons") {
    $svg = $svg -replace 'stroke="currentColor"', "stroke=`"$($palette.Ink)`""
    $svg = $svg -replace 'fill="currentColor"', "fill=`"$($palette.Ink)`""
    $svg = $svg -replace 'class="icon icon-tabler', 'class="icon icon-tabler icon-tabler-vocate'
    return $svg
  }

  $replacements = [ordered]@{
    "#066FD1" = $palette.Ink
    "#206BC4" = $palette.Ink
    "#4299E1" = $palette.InkSoft
    "#232B41" = $palette.InkDeep
    "#454C5E" = $palette.Text
    "#A7AAB3" = $palette.Muted
    "#D6D8E2" = $palette.InkSoft
    "#F59F00" = $palette.Orange
    "#FAB005" = $palette.Beacon
    "#F76707" = $palette.Orange
    "#FA5252" = $palette.Danger
    "#FF6B6B" = $palette.Danger
    "#E64980" = $palette.Orange
    "#7950F2" = $palette.Ink
    "#12B886" = $palette.OrangeDark
    "#20C997" = $palette.Beacon
    "#15AABF" = $palette.InkSoft
    "#E9ECEF" = $palette.Linen
    "#DEE2E6" = $palette.Border
    "#F8F9FA" = $palette.Linen
  }

  foreach ($key in $replacements.Keys) {
    $svg = $svg -replace [regex]::Escape($key), $replacements[$key]
    $svg = $svg -replace [regex]::Escape($key.ToLowerInvariant()), $replacements[$key]
  }

  $svg = $svg -replace 'var\(--tblr-illustrations-primary, var\(--tblr-primary, #[0-9A-Fa-f]{6}\)\)', "var(--tblr-illustrations-primary, var(--tblr-primary, $($palette.Ink)))"
  $svg = $svg -replace 'class="tblr-illustrations-', 'class="tblr-illustrations tblr-illustrations-vocate tblr-illustrations-'
  return $svg
}

function Get-OutputPath {
  param(
    [Parameter(Mandatory = $true)][string]$PackageName,
    [Parameter(Mandatory = $true)][string]$EntryName
  )

  $relative = $EntryName -replace '\\', '/'
  $relative = $relative -replace '^svg/', 'icons/'
  $relative = $relative -replace '^tabler-illustrations/svg-css-autodark/', 'illustrations/'
  $relative = $relative -replace '/', [IO.Path]::DirectorySeparatorChar
  return Join-Path $OutputDir (Join-Path $PackageName $relative)
}

Add-Type -AssemblyName System.IO.Compression.FileSystem

if (Test-Path -LiteralPath $OutputDir) {
  Remove-Item -LiteralPath $OutputDir -Recurse -Force
}
New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null

$summary = @()

foreach ($package in $packages) {
  $zipPath = Join-Path $SourceDir $package.Zip
  if (!(Test-Path -LiteralPath $zipPath)) {
    throw "Missing source ZIP: $zipPath"
  }

  $zip = [System.IO.Compression.ZipFile]::OpenRead($zipPath)
  try {
    $count = 0
    foreach ($entry in $zip.Entries) {
      if ($entry.Length -le 0 -or $entry.FullName -notmatch '\.svg$') { continue }
      $matchesPackage = $false
      foreach ($pattern in $package.Include) {
        if ($entry.FullName -match $pattern) {
          $matchesPackage = $true
          break
        }
      }
      if (!$matchesPackage) { continue }

      $outPath = Get-OutputPath -PackageName $package.Name -EntryName $entry.FullName
      $outFull = [IO.Path]::GetFullPath($outPath)
      $outRoot = [IO.Path]::GetFullPath($OutputDir)
      if (!$outFull.StartsWith($outRoot, [StringComparison]::OrdinalIgnoreCase)) {
        throw "Blocked unsafe ZIP entry path: $($entry.FullName)"
      }

      New-Item -ItemType Directory -Force -Path ([IO.Path]::GetDirectoryName($outFull)) | Out-Null
      $reader = New-Object IO.StreamReader($entry.Open())
      try {
        $content = $reader.ReadToEnd()
      } finally {
        $reader.Dispose()
      }

      $kind = if ($package.Name -eq "tabler-icons") { "icons" } else { "illustrations" }
      [IO.File]::WriteAllText($outFull, (ConvertTo-VocateSvg -Content $content -Kind $kind), [Text.UTF8Encoding]::new($false))
      $count += 1
    }
    $summary += "$($package.Name): $count SVG files imported and recolored."
  } finally {
    $zip.Dispose()
  }
}

$readme = @"
# Tabler Vocate SVG Assets

Generated by `scripts/import-tabler-vocate-assets.ps1`.

Palette source: `src/styles/vocate-theme.css`

- Navy: $($palette.Ink)
- Deep navy: $($palette.InkDeep)
- Orange: $($palette.Orange)
- Accessible orange: $($palette.OrangeDark)
- Beacon: $($palette.Beacon)
- Soft ink: $($palette.InkSoft)
- Linen: $($palette.Linen)

Imported:

$($summary | ForEach-Object { "- $_" } | Out-String)

Skipped:

$($skipped | ForEach-Object { "- $_" } | Out-String)
"@

[IO.File]::WriteAllText((Join-Path $OutputDir "README.md"), $readme, [Text.UTF8Encoding]::new($false))

$summary
