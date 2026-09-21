param(
  [string]$ResourceRoot = (Join-Path $PSScriptRoot '..\app\src\main\res')
)

Add-Type -AssemblyName System.Drawing

$expected = [System.Drawing.Color]::FromArgb(255, 217, 32, 33)
$icons = Get-ChildItem -LiteralPath $ResourceRoot -Recurse -File -Filter 'ic_launcher.png'
if ($icons.Count -ne 5) { throw "Expected 5 launcher icons, found $($icons.Count)" }

foreach ($icon in $icons) {
  $bitmap = [System.Drawing.Bitmap]::FromFile($icon.FullName)
  try {
    for ($x = 0; $x -lt $bitmap.Width; $x++) {
      for ($y = 0; $y -lt $bitmap.Height; $y++) {
        $color = $bitmap.GetPixel($x, $y)
        if ($color.A -ne 255) {
          throw "$($icon.FullName) has transparency at $x,$y"
        }
      }
    }

    $edgePoints = @()
    for ($offset = 0; $offset -lt $bitmap.Width; $offset++) {
      $edgePoints += [System.Drawing.Point]::new($offset, 0)
      $edgePoints += [System.Drawing.Point]::new($offset, $bitmap.Height - 1)
    }
    for ($offset = 0; $offset -lt $bitmap.Height; $offset++) {
      $edgePoints += [System.Drawing.Point]::new(0, $offset)
      $edgePoints += [System.Drawing.Point]::new($bitmap.Width - 1, $offset)
    }
    foreach ($point in $edgePoints) {
      $color = $bitmap.GetPixel($point.X, $point.Y)
      if ($color.A -ne 255 -or $color.R -ne $expected.R -or $color.G -ne $expected.G -or $color.B -ne $expected.B) {
        throw "$($icon.FullName) has a non-red launcher edge at $($point.X),$($point.Y): $($color.ToArgb().ToString('X8'))"
      }
    }
  } finally {
    $bitmap.Dispose()
  }
}

Write-Host 'Launcher icon compatibility test passed'
