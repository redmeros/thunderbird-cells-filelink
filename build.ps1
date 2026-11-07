# Packages the add-on into dist/cells-filelink-<version>.xpi
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$version = (Get-Content "$root/manifest.json" -Raw | ConvertFrom-Json).version
$out = Join-Path $root "dist/cells-filelink-$version.xpi"
$include = @('manifest.json', 'background.js', 'lib', 'management', 'icons')

# Local, git-ignored overrides: repo files keep placeholders, only the packaged copies change.
$placeholderServer = 'https://cells.example.com'
$placeholderId = 'cells-filelink@example.com'
$replacements = @{}
$localConfig = Join-Path $root 'build.local.json'
if (Test-Path $localConfig) {
    $local = Get-Content $localConfig -Raw | ConvertFrom-Json
    if (-not $local.serverUrl -or -not $local.addonId) { throw 'build.local.json needs serverUrl and addonId' }
    $serverUrl = $local.serverUrl.TrimEnd('/')
    $replacements['manifest.json'] = @(
        @("`"$placeholderId`"", "`"$($local.addonId)`""),
        @("`"$placeholderServer/*`"", "`"$serverUrl/*`"")
    )
    $replacements['lib/config.js'] = @(, @("`"$placeholderServer`"", "`"$serverUrl`""))
} else {
    Write-Warning "build.local.json not found: building with placeholder server $placeholderServer"
}

New-Item -ItemType Directory -Force (Split-Path $out) | Out-Null
if (Test-Path $out) { Remove-Item $out }

Add-Type -AssemblyName System.IO.Compression, System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::Open($out, 'Create')
try {
    foreach ($item in $include) {
        Get-ChildItem (Join-Path $root $item) -Recurse -File -ErrorAction Stop | ForEach-Object {
            # XPI entries must use forward slashes.
            $entry = $_.FullName.Substring($root.Length + 1) -replace '\\', '/'
            if ($replacements.ContainsKey($entry)) {
                $text = Get-Content $_.FullName -Raw -Encoding utf8
                foreach ($pair in $replacements[$entry]) {
                    if (-not $text.Contains($pair[0])) { throw "Placeholder $($pair[0]) not found in $entry" }
                    $text = $text.Replace($pair[0], $pair[1])
                }
                $writer = New-Object System.IO.StreamWriter($zip.CreateEntry($entry).Open(), (New-Object System.Text.UTF8Encoding($false)))
                $writer.Write($text)
                $writer.Dispose()
            } else {
                [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $_.FullName, $entry) | Out-Null
            }
        }
    }
} finally {
    $zip.Dispose()
}
Write-Host "Built $out"
