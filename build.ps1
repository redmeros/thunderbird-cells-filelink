# Packages the add-on into dist/cells-filelink-<version>.xpi
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$version = (Get-Content "$root/manifest.json" -Raw | ConvertFrom-Json).version
$out = Join-Path $root "dist/cells-filelink-$version.xpi"
$include = @('manifest.json', 'background.js', 'lib', 'management', 'icons')

New-Item -ItemType Directory -Force (Split-Path $out) | Out-Null
if (Test-Path $out) { Remove-Item $out }

Add-Type -AssemblyName System.IO.Compression, System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::Open($out, 'Create')
try {
    foreach ($item in $include) {
        Get-ChildItem (Join-Path $root $item) -Recurse -File -ErrorAction Stop | ForEach-Object {
            # XPI entries must use forward slashes.
            $entry = $_.FullName.Substring($root.Length + 1) -replace '\\', '/'
            [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $_.FullName, $entry) | Out-Null
        }
    }
} finally {
    $zip.Dispose()
}
Write-Host "Built $out"
