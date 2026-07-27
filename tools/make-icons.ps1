# Generates the PNG icons and the promo banner from the brand motif
# (same artwork as icons/favicon.svg). Windows only: uses System.Drawing.
# Run: powershell -ExecutionPolicy Bypass -File tools/make-icons.ps1

Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$icons = Join-Path $root "icons"
$assets = Join-Path $root "assets"
New-Item -ItemType Directory -Force $icons | Out-Null
New-Item -ItemType Directory -Force $assets | Out-Null

$navy = [System.Drawing.Color]::FromArgb(255, 10, 37, 64)     # #0a2540
$teal = [System.Drawing.Color]::FromArgb(255, 20, 184, 166)   # #14b8a6
$sun = [System.Drawing.Color]::FromArgb(255, 255, 209, 102)   # #ffd166
$white = [System.Drawing.Color]::White
$whiteSoft = [System.Drawing.Color]::FromArgb(190, 255, 255, 255)

function New-RoundedRectPath([float]$x, [float]$y, [float]$w, [float]$h, [float]$r) {
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $d = $r * 2
    $path.AddArc($x, $y, $d, $d, 180, 90)
    $path.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
    $path.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
    $path.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
    $path.CloseFigure()
    return $path
}

# Draws the 48x48 motif (sun over waves + sparkle) scaled by $k, offset by $ox/$oy.
function Draw-Motif($g, [float]$k, [float]$ox, [float]$oy, [bool]$withBackground) {
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias

    if ($withBackground) {
        $bgPath = New-RoundedRectPath ($ox + 2 * $k) ($oy + 2 * $k) (44 * $k) (44 * $k) (11 * $k)
        $grad = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
            (New-Object System.Drawing.PointF(($ox + 24 * $k), ($oy + 2 * $k))),
            (New-Object System.Drawing.PointF(($ox + 24 * $k), ($oy + 46 * $k))),
            $navy, $teal)
        $g.FillPath($grad, $bgPath)
        $grad.Dispose(); $bgPath.Dispose()
    }

    # rising sun
    $sunBrush = New-Object System.Drawing.SolidBrush($sun)
    $g.FillEllipse($sunBrush, ($ox + (24 - 7.5) * $k), ($oy + (27 - 7.5) * $k), (15 * $k), (15 * $k))
    $sunBrush.Dispose()

    # horizon waves
    $pen1 = New-Object System.Drawing.Pen($white, (3.2 * $k))
    $pen1.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $pen1.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
    $wave1 = @(
        (New-Object System.Drawing.PointF(($ox + 7 * $k), ($oy + 31.5 * $k))),
        (New-Object System.Drawing.PointF(($ox + 15.5 * $k), ($oy + 29.2 * $k))),
        (New-Object System.Drawing.PointF(($ox + 24 * $k), ($oy + 31.5 * $k))),
        (New-Object System.Drawing.PointF(($ox + 32.5 * $k), ($oy + 33.8 * $k))),
        (New-Object System.Drawing.PointF(($ox + 41 * $k), ($oy + 31.5 * $k)))
    )
    $g.DrawCurve($pen1, $wave1)
    $pen1.Dispose()

    $pen2 = New-Object System.Drawing.Pen($whiteSoft, (2.6 * $k))
    $pen2.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $pen2.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
    $wave2 = @(
        (New-Object System.Drawing.PointF(($ox + 11 * $k), ($oy + 37.5 * $k))),
        (New-Object System.Drawing.PointF(($ox + 17.5 * $k), ($oy + 35.9 * $k))),
        (New-Object System.Drawing.PointF(($ox + 24 * $k), ($oy + 37.5 * $k))),
        (New-Object System.Drawing.PointF(($ox + 30.5 * $k), ($oy + 39.1 * $k))),
        (New-Object System.Drawing.PointF(($ox + 37 * $k), ($oy + 37.5 * $k)))
    )
    $g.DrawCurve($pen2, $wave2)
    $pen2.Dispose()

    # sparkle: the day to look forward to
    $whiteBrush = New-Object System.Drawing.SolidBrush($white)
    $star = @(
        (New-Object System.Drawing.PointF(($ox + 34.5 * $k), ($oy + 9.0 * $k))),
        (New-Object System.Drawing.PointF(($ox + 36.0 * $k), ($oy + 12.4 * $k))),
        (New-Object System.Drawing.PointF(($ox + 39.4 * $k), ($oy + 13.9 * $k))),
        (New-Object System.Drawing.PointF(($ox + 36.0 * $k), ($oy + 15.4 * $k))),
        (New-Object System.Drawing.PointF(($ox + 34.5 * $k), ($oy + 18.8 * $k))),
        (New-Object System.Drawing.PointF(($ox + 33.0 * $k), ($oy + 15.4 * $k))),
        (New-Object System.Drawing.PointF(($ox + 29.6 * $k), ($oy + 13.9 * $k))),
        (New-Object System.Drawing.PointF(($ox + 33.0 * $k), ($oy + 12.4 * $k)))
    )
    $g.FillPolygon($whiteBrush, $star)
    $whiteBrush.Dispose()
}

function Save-Icon([int]$size, [string]$name, [string]$mode) {
    $bmp = New-Object System.Drawing.Bitmap($size, $size)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.Clear([System.Drawing.Color]::Transparent)

    if ($mode -eq "rounded") {
        # transparent corners, rounded gradient square (regular icons)
        Draw-Motif $g ($size / 48.0) 0 0 $true
    }
    else {
        # full-bleed gradient square (maskable / apple-touch), motif in the safe area
        $grad = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
            (New-Object System.Drawing.Point(0, 0)),
            (New-Object System.Drawing.Point(0, $size)),
            $navy, $teal)
        $g.FillRectangle($grad, 0, 0, $size, $size)
        $grad.Dispose()
        $k = $size / 48.0 * 0.8
        $off = ($size - 48 * $k) / 2
        Draw-Motif $g $k $off $off $false
    }

    $g.Dispose()
    $bmp.Save((Join-Path $icons $name), [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    Write-Host "icons/$name"
}

Save-Icon 512 "icon-512.png" "rounded"
Save-Icon 192 "icon-192.png" "rounded"
Save-Icon 32  "favicon-32.png" "rounded"
Save-Icon 512 "maskable-512.png" "fullbleed"
Save-Icon 180 "apple-touch-icon.png" "fullbleed"

# ---- promo banner (1200x630, used for og:image and the README) ----

$w = 1200; $h = 630
$bmp = New-Object System.Drawing.Bitmap($w, $h)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAlias

$grad = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
    (New-Object System.Drawing.Point(0, 0)),
    (New-Object System.Drawing.Point($w, $h)),
    $navy, $teal)
$g.FillRectangle($grad, 0, 0, $w, $h)
$grad.Dispose()

Draw-Motif $g 4.2 105 210 $false

$titleFont = New-Object System.Drawing.Font("Segoe UI", 76, [System.Drawing.FontStyle]::Bold)
$subFont = New-Object System.Drawing.Font("Segoe UI", 30)
$smallFont = New-Object System.Drawing.Font("Segoe UI", 21)
$whiteBrush = New-Object System.Drawing.SolidBrush($white)
$softBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(235, 224, 242, 254))

# middle dot via char code so the script is encoding-proof
$dot = [string][char]0x00B7
$g.DrawString("bigday", $titleFont, $whiteBrush, 320, 172)
$g.DrawString("Countdown to your big day", $subFont, $whiteBrush, 330, 318)
$g.DrawString("shareable link $dot 9 moods $dot no account $dot open source", $smallFont, $softBrush, 332, 382)

$titleFont.Dispose(); $subFont.Dispose(); $smallFont.Dispose()
$whiteBrush.Dispose(); $softBrush.Dispose()
$g.Dispose()
$bmp.Save((Join-Path $assets "promo.png"), [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()
Write-Host "assets/promo.png"
