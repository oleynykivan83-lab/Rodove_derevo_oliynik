# watch-photos.ps1 - автоматичне спостереження за папкою Фото/ та Родове дерево.txt
param()
$workspace  = $PSScriptRoot
$photosRoot = Join-Path $workspace "Фото"
$ext = @('.jpg','.jpeg','.png','.webp','.gif','.bmp','.tif','.tiff','.mp4','.webm','.ogg','.mov','.m4v','.avi')

function Update-Manifest {
    $items = Get-ChildItem -LiteralPath $photosRoot -Recurse -File |
             Where-Object { $ext -contains $_.Extension.ToLower() } |
             Sort-Object CreationTime

    $byPerson = $items | Group-Object { ($_.FullName.Split('\') | Select-Object -Index 8) }

    $manifest = [ordered]@{}
    $byPerson | ForEach-Object {
        $k   = $_.Name
        $arr = $_.Group | ForEach-Object {
            [ordered]@{
                path    = $_.FullName.Substring($workspace.Length + 1) -replace '\\','/'
                created = $_.CreationTime.ToString('yyyy-MM-dd HH:mm:ss')
            }
        }
        $manifest[$k] = @($arr)
    }

    $ordered = [ordered]@{}
    foreach ($k in @('Олійник Іван Олександрович','Олійник Валентина Володимирівна','Олійник Анастасія Іванівна','Олійник Адам Іванович','Спільні','Фон','Особисті фото на дерево')) {
        $ordered[$k] = if ($manifest.Contains($k)) { $manifest[$k] } else { @() }
    }
    foreach ($k in ($manifest.Keys | Sort-Object)) {
        if (-not $ordered.Contains($k)) { $ordered[$k] = $manifest[$k] }
    }

    $json    = $ordered | ConvertTo-Json -Depth 5
    [System.IO.File]::WriteAllText((Join-Path $workspace "photo-manifest.js"), "window.PHOTO_MANIFEST = $json;", [System.Text.Encoding]::UTF8)
    $ts = Get-Date -Format "HH:mm:ss"
    Write-Host "[$ts] Маніфест оновлено ($($items.Count) фото)" -ForegroundColor Green

    Build-FamilyTreeJs -workspace $workspace
}
function Build-FamilyTreeJs {
    param($workspace)
    $txtPath = Join-Path $workspace "Родове дерево.txt"
    if (-not (Test-Path -LiteralPath $txtPath)) { return }
    $lines = Get-Content -LiteralPath $txtPath -Encoding UTF8
    $seen = @{}
    $people = [System.Collections.Generic.List[object]]::new()
    foreach ($line in $lines) {
        $line = $line.Trim()
        if ([string]::IsNullOrEmpty($line)) { continue }
        if ($line -match '^Правила') { break }
        if ($line -match '^((?:\d+\.)+)\s+(.+)$') {
            $tp = $Matches[1].TrimEnd('.')
            $tr = $Matches[2].Trim().TrimEnd('.')
            $nl = ($tp -split '\.' | Where-Object { $_ -ne '' }).Count
            $lv = if ($seen.ContainsKey($tp) -and $nl -ge 2) { $nl + 1 } else { $nl }
            $seen[$tp] = $true
            foreach ($te in ($tr -split ';\s*')) {
                $te = $te.Trim()
                if ([string]::IsNullOrEmpty($te)) { continue }
                $tn = $te; $td = ''
                if ($te -match '^(.+?)\s*\((.+?)\)\s*$') { $tn = $Matches[1].Trim(); $td = $Matches[2].Trim() }
                if ($tn) { $people.Add([ordered]@{ level = $lv; name = $tn; date = $td }) }
            }
        }
    }
    $tj = $people | ConvertTo-Json -Depth 3 -Compress
    [System.IO.File]::WriteAllText((Join-Path $workspace "family-tree.js"), "window.FAMILY_TREE = $tj;", [System.Text.Encoding]::UTF8)
    $ts2 = Get-Date -Format "HH:mm:ss"
    Write-Host "[$ts2] Родове дерево: $($people.Count) осіб -> family-tree.js" -ForegroundColor Green
}$photoWatcher = New-Object System.IO.FileSystemWatcher
$photoWatcher.Path = $photosRoot
$photoWatcher.Filter = "*.*"
$photoWatcher.IncludeSubdirectories = $true
$photoWatcher.EnableRaisingEvents = $true

$txtWatcher = New-Object System.IO.FileSystemWatcher
$txtWatcher.Path = $workspace
$txtWatcher.Filter = "Родове дерево.txt"
$txtWatcher.EnableRaisingEvents = $true

$debounce = New-Object System.Timers.Timer
$debounce.Interval = 1500
$debounce.AutoReset = $false
$null = Register-ObjectEvent -InputObject $debounce -EventName Elapsed -Action { Update-Manifest }

$onPhotoChange = {
    $x = [System.IO.Path]::GetExtension($Event.SourceEventArgs.Name).ToLower()
    if (@('.jpg','.jpeg','.png','.webp','.gif','.bmp','.tif','.tiff','.mp4','.webm','.ogg','.mov','.m4v','.avi') -contains $x) {
        $debounce.Stop(); $debounce.Start()
    }
}
$null = Register-ObjectEvent -InputObject $photoWatcher -EventName Created -Action $onPhotoChange
$null = Register-ObjectEvent -InputObject $photoWatcher -EventName Changed -Action $onPhotoChange
$null = Register-ObjectEvent -InputObject $photoWatcher -EventName Deleted -Action $onPhotoChange
$null = Register-ObjectEvent -InputObject $photoWatcher -EventName Renamed -Action $onPhotoChange

$onTxtChange = { $debounce.Stop(); $debounce.Start() }
$null = Register-ObjectEvent -InputObject $txtWatcher -EventName Changed -Action $onTxtChange

Write-Host "Спостерігач запущено." -ForegroundColor Cyan
Write-Host "Слідкую за фото: $photosRoot" -ForegroundColor Cyan
Write-Host "Слідкую за: Родове дерево.txt" -ForegroundColor Cyan
Write-Host "Ctrl+C зупинить." -ForegroundColor Yellow
Update-Manifest
try { while ($true) { Wait-Event -Timeout 1 } }
finally {
    $photoWatcher.Dispose(); $txtWatcher.Dispose(); $debounce.Dispose()
    Write-Host "Зупинено."
}