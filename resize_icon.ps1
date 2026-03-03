Add-Type -AssemblyName System.Drawing
$imagePath = "c:\Users\pedro\Documents\Github\arr-scheduler\public\icon.png"
$bmp = [System.Drawing.Bitmap]::FromFile($imagePath)

$size = [math]::Max($bmp.Width, $bmp.Height)
$newBmp = New-Object System.Drawing.Bitmap $size, $size

$graphics = [System.Drawing.Graphics]::FromImage($newBmp)
$graphics.Clear([System.Drawing.Color]::Transparent)
$graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic

$x = [int](($size - $bmp.Width) / 2)
$y = [int](($size - $bmp.Height) / 2)
$graphics.DrawImage($bmp, $x, $y, $bmp.Width, $bmp.Height)

$outPath = "c:\Users\pedro\Documents\Github\arr-scheduler\public\icon-square.png"
$newBmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)

$graphics.Dispose()
$newBmp.Dispose()
$bmp.Dispose()

Write-Output "Successfully created square icon at $outPath"
