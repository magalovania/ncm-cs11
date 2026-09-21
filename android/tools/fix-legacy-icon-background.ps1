param(
  [string]$ResourceRoot = (Join-Path $PSScriptRoot '..\app\src\main\res')
)

Add-Type -AssemblyName System.Drawing

$background = [System.Drawing.Color]::FromArgb(255, 217, 32, 33)
$icons = Get-ChildItem -LiteralPath $ResourceRoot -Recurse -File -Filter 'ic_launcher.png'

foreach ($icon in $icons) {
  $source = [System.Drawing.Bitmap]::FromFile($icon.FullName)
  $bitmap = New-Object System.Drawing.Bitmap($source.Width, $source.Height, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.DrawImageUnscaled($source, 0, 0)
  $graphics.Dispose()
  $source.Dispose()

  $visited = New-Object 'bool[,]' $bitmap.Width, $bitmap.Height
  $backgroundMask = New-Object 'bool[,]' $bitmap.Width, $bitmap.Height
  $queue = New-Object 'System.Collections.Generic.Queue[System.Drawing.Point]'
  $queue.Enqueue([System.Drawing.Point]::new(0, 0))
  $queue.Enqueue([System.Drawing.Point]::new($bitmap.Width - 1, 0))
  $queue.Enqueue([System.Drawing.Point]::new(0, $bitmap.Height - 1))
  $queue.Enqueue([System.Drawing.Point]::new($bitmap.Width - 1, $bitmap.Height - 1))

  while ($queue.Count -gt 0) {
    $point = $queue.Dequeue()
    if ($point.X -lt 0 -or $point.Y -lt 0 -or $point.X -ge $bitmap.Width -or $point.Y -ge $bitmap.Height) { continue }
    if ($visited[$point.X, $point.Y]) { continue }
    $visited[$point.X, $point.Y] = $true

    $color = $bitmap.GetPixel($point.X, $point.Y)
    $distanceFromWhite = [Math]::Sqrt(
      [Math]::Pow(255 - $color.R, 2) +
      [Math]::Pow(255 - $color.G, 2) +
      [Math]::Pow(255 - $color.B, 2))
    if ($distanceFromWhite -gt 200) { continue }

    $backgroundMask[$point.X, $point.Y] = $true
    $queue.Enqueue([System.Drawing.Point]::new($point.X + 1, $point.Y))
    $queue.Enqueue([System.Drawing.Point]::new($point.X - 1, $point.Y))
    $queue.Enqueue([System.Drawing.Point]::new($point.X, $point.Y + 1))
    $queue.Enqueue([System.Drawing.Point]::new($point.X, $point.Y - 1))
  }

  $radius = [Math]::Max(1, [Math]::Round($bitmap.Width / 96.0))
  for ($x = 0; $x -lt $bitmap.Width; $x++) {
    for ($y = 0; $y -lt $bitmap.Height; $y++) {
      if (-not $backgroundMask[$x, $y]) { continue }
      for ($dx = -$radius; $dx -le $radius; $dx++) {
        for ($dy = -$radius; $dy -le $radius; $dy++) {
          $targetX = $x + $dx
          $targetY = $y + $dy
          if ($targetX -ge 0 -and $targetY -ge 0 -and $targetX -lt $bitmap.Width -and $targetY -lt $bitmap.Height) {
            $bitmap.SetPixel($targetX, $targetY, $background)
          }
        }
      }
    }
  }

  $borderWidth = [Math]::Max(1, [Math]::Round($bitmap.Width / 96.0))
  for ($x = 0; $x -lt $bitmap.Width; $x++) {
    for ($y = 0; $y -lt $bitmap.Height; $y++) {
      if ($x -lt $borderWidth -or $y -lt $borderWidth -or
          $x -ge $bitmap.Width - $borderWidth -or $y -ge $bitmap.Height - $borderWidth) {
        $bitmap.SetPixel($x, $y, $background)
      }
    }
  }

  $temp = $icon.FullName + '.tmp.png'
  $bitmap.Save($temp, [System.Drawing.Imaging.ImageFormat]::Png)
  $bitmap.Dispose()
  Move-Item -LiteralPath $temp -Destination $icon.FullName -Force
  Write-Host "Updated $($icon.FullName)"
}
