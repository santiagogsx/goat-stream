# Makes the Xbox app's tiles, splash screen and Microsoft Store pictures from the Goat Stream logo (web/img).
# Run from anywhere:  powershell -ExecutionPolicy Bypass -File xbox\tools\make-assets.ps1
# Output: xbox\GoatStream\Assets\*.png (inside the app)  and  xbox\store-art\*.png (upload these in Partner Center)
Add-Type -AssemblyName System.Drawing
$root = Resolve-Path (Join-Path $PSScriptRoot '..\..')
$img = Join-Path $root 'web\img'
$assets = Join-Path $root 'xbox\GoatStream\Assets'
$store = Join-Path $root 'xbox\store-art'
New-Item -ItemType Directory -Force $assets, $store | Out-Null

$icon = [System.Drawing.Image]::FromFile((Join-Path $img 'icon.png'))
$mark = [System.Drawing.Image]::FromFile((Join-Path $img 'goat-mark.png'))
$word = [System.Drawing.Image]::FromFile((Join-Path $img 'wordmark.png'))
$gold = [System.Drawing.Color]::FromArgb(230, 179, 74)

function New-Canvas($w, $h) {
  $bmp = New-Object System.Drawing.Bitmap $w, $h
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = 'HighQualityBicubic'; $g.SmoothingMode = 'HighQuality'; $g.PixelOffsetMode = 'HighQuality'; $g.TextRenderingHint = 'AntiAliasGridFit'
  $g.Clear([System.Drawing.Color]::Black)
  return @($bmp, $g)
}
# draw an image to fit inside a box (keeps its shape), centred
function Draw-Fit($g, $im, $x, $y, $w, $h) {
  $s = [Math]::Min($w / $im.Width, $h / $im.Height)
  $dw = $im.Width * $s; $dh = $im.Height * $s
  $g.DrawImage($im, [single]($x + ($w - $dw) / 2), [single]($y + ($h - $dh) / 2), [single]$dw, [single]$dh)
}
function Save($bmp, $g, $path) { $g.Dispose(); $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png); $bmp.Dispose() }
function Credit($g, $w, $h, $size) {
  $f = New-Object System.Drawing.Font 'Segoe UI', $size
  $b = New-Object System.Drawing.SolidBrush $gold
  $t = 'Created by Santiago'
  $m = $g.MeasureString($t, $f)
  $g.DrawString($t, $f, $b, [single](($w - $m.Width) / 2), [single]($h - $m.Height * 1.8))
  $f.Dispose(); $b.Dispose()
}

# --- square app icons (full logo) ---
foreach ($p in @(@('Square44x44Logo.scale-100', 44), @('Square44x44Logo.scale-200', 88), @('Square44x44Logo.targetsize-24_altform-unplated', 24),
                 @('Square44x44Logo.targetsize-48_altform-unplated', 48), @('Square150x150Logo.scale-100', 150), @('Square150x150Logo.scale-200', 300),
                 @('Square310x310Logo.scale-100', 310), @('Square310x310Logo.scale-200', 620), @('StoreLogo.scale-100', 50), @('StoreLogo.scale-200', 100))) {
  $c = New-Canvas $p[1] $p[1]; Draw-Fit $c[1] $icon 0 0 $p[1] $p[1]; Save $c[0] $c[1] (Join-Path $assets ($p[0] + '.png'))
}
# --- wide tile (the big tile on the Xbox home screen): goat on the left, GOAT STREAM on the right ---
foreach ($p in @(@('Wide310x150Logo.scale-100', 310, 150), @('Wide310x150Logo.scale-200', 620, 300))) {
  $w = $p[1]; $h = $p[2]; $c = New-Canvas $w $h
  Draw-Fit $c[1] $mark ($w * 0.04) ($h * 0.08) ($w * 0.42) ($h * 0.84)
  Draw-Fit $c[1] $word ($w * 0.48) ($h * 0.2) ($w * 0.48) ($h * 0.6)
  Save $c[0] $c[1] (Join-Path $assets ($p[0] + '.png'))
}
# --- splash screen (shown while the app opens) ---
foreach ($p in @(@('SplashScreen.scale-100', 620, 300), @('SplashScreen.scale-200', 1240, 600))) {
  $w = $p[1]; $h = $p[2]; $c = New-Canvas $w $h
  Draw-Fit $c[1] $icon 0 ($h * 0.04) $w ($h * 0.92)
  Save $c[0] $c[1] (Join-Path $assets ($p[0] + '.png'))
}

# --- Microsoft Store pictures (uploaded in Partner Center -> Store listing) ---
# 16:9 "Super hero art" 1920x1080
$c = New-Canvas 1920 1080
Draw-Fit $c[1] $mark 160 190 760 620
Draw-Fit $c[1] $word 980 330 800 300
Credit $c[1] 1920 1080 26
Save $c[0] $c[1] (Join-Path $store 'hero-1920x1080.png')
# 1:1 "Box art" 1080x1080
$c = New-Canvas 1080 1080; Draw-Fit $c[1] $icon 40 40 1000 1000; Save $c[0] $c[1] (Join-Path $store 'box-art-1080x1080.png')
# 2:3 "Poster art" 720x1080
$c = New-Canvas 720 1080
Draw-Fit $c[1] $mark 40 170 640 520
Draw-Fit $c[1] $word 60 720 600 180
Credit $c[1] 720 1080 20
Save $c[0] $c[1] (Join-Path $store 'poster-720x1080.png')
# Store logo 300x300
$c = New-Canvas 300 300; Draw-Fit $c[1] $icon 0 0 300 300; Save $c[0] $c[1] (Join-Path $store 'store-logo-300x300.png')

$icon.Dispose(); $mark.Dispose(); $word.Dispose()
Get-ChildItem $assets, $store | Select-Object Name, Length
