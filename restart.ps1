# ============================================================
#  DijiCatalog - Tum Restart (PowerShell)
#
#  Adimlar:
#    1. Git pull origin main (yeni kod)
#    2. npm install (root + client)
#    3. .env DATABASE_URL'den \ABKA'yi temizle
#    4. Eski servisleri durdur (3000 + 5173)
#    5. Server build (dist yoksa)
#    6. Backend baslat (port 3000)
#    7. Vite dev server baslat (port 5173)
#    8. Health check + tarayici ac
#
#  Kullanim:
#    powershell -NoProfile -ExecutionPolicy Bypass -File C:\digicatalog\restart.ps1
# ============================================================

$ErrorActionPreference = 'Continue'
$root = 'C:\digicatalog'

Write-Host ""
Write-Host "============================================"
Write-Host "  DijiCatalog - Tam Restart"
Write-Host "  $(Get-Date -Format 'dd.MM.yyyy HH:mm:ss')"
Write-Host "============================================"
Write-Host ""

# [1/8] Git pull
Write-Host "[1/8] Git pull origin main..."
Push-Location $root
try {
    & git pull origin main 2>&1 | Out-Null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "   Git OK." -ForegroundColor Green
    } else {
        Write-Host "   UYARI: git pull basarisiz (devam ediliyor)" -ForegroundColor Yellow
    }
} catch {
    Write-Host "   UYARI: git pull exception (devam ediliyor)" -ForegroundColor Yellow
}
Pop-Location

# [2/8] npm install (root + client)
Write-Host ""
Write-Host "[2/8] npm install..."
Push-Location $root
& npm install --no-audit --no-fund --prefer-offline | Out-Null
if ($LASTEXITCODE -eq 0) {
    Write-Host "   Root OK." -ForegroundColor Green
} else {
    Write-Host "   UYARI: root npm install basarisiz" -ForegroundColor Yellow
}
Pop-Location

Push-Location "$root\client"
& npm install --no-audit --no-fund --prefer-offline | Out-Null
if ($LASTEXITCODE -eq 0) {
    Write-Host "   Client OK." -ForegroundColor Green
} else {
    Write-Host "   UYARI: client npm install basarisiz" -ForegroundColor Yellow
}
Pop-Location

# [3/8] .env guncelle (\\ABKA'yi temizle)
Write-Host ""
Write-Host "[3/8] .env DATABASE_URL temizleniyor..."
$envPath = "$root\server\.env"
if (Test-Path $envPath) {
    $envContent = Get-Content $envPath -Raw
    $newUrl = 'mssql://sa:dgfceu@localhost/DijiCatalog?encrypt=false&trustServerCertificate=true'
    if ($envContent -match '\\ABKA') {
        $envContent = $envContent -replace '^DATABASE_URL=.*$', "DATABASE_URL=$newUrl"
        Set-Content -Path $envPath -Value $envContent -Encoding UTF8
        Write-Host "   \\ABKA temizlendi." -ForegroundColor Green
    } else {
        Write-Host "   Zaten temiz." -ForegroundColor Green
    }
} else {
    Write-Host "   UYARI: .env bulunamadi: $envPath" -ForegroundColor Yellow
}

# [4/8] Eski servisleri durdur
Write-Host ""
Write-Host "[4/8] Eski servisler durduruluyor (3000 + 5173)..."
$pids = @()
foreach ($p in 3000, 5173) {
    $conn = Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue
    if ($conn) {
        $pids += $conn | Select-Object -ExpandProperty OwningProcess -Unique
    }
}
$pids = $pids | Sort-Object -Unique
if ($pids.Count -gt 0) {
    foreach ($pid in $pids) {
        $proc = Get-Process -Id $pid -ErrorAction SilentlyContinue
        if ($proc) {
            Write-Host "   PID $pid ($($proc.ProcessName)) durduruldu"
            Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue
        }
    }
} else {
    Write-Host "   Calisan servis yok."
}
Start-Sleep -Seconds 3

# [5/8] Server build (dist yoksa)
Write-Host ""
Write-Host "[5/8] server build..."
if (-not (Test-Path "$root\server\dist\index.js")) {
    Push-Location "$root\server"
    & npm run build | Out-Null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "   Build OK." -ForegroundColor Green
    } else {
        Write-Host "   UYARI: build basarisiz" -ForegroundColor Yellow
    }
    Pop-Location
} else {
    Write-Host "   server\dist mevcut, atlandi."
}

# [6/8] Backend baslat (port 3000)
Write-Host ""
Write-Host "[6/8] Backend baslatiliyor (port 3000)..."
$backendScript = "cd /d `"$root\server`" && npm start"
Start-Process -FilePath cmd.exe -ArgumentList '/c', $backendScript -WindowStyle Minimized -WindowTitle 'DijiCatalog-Backend'

# [7/8] Vite dev server baslat (port 5173)
Write-Host "[7/8] Vite dev server baslatiliyor (port 5173)..."
$viteScript = "cd /d `"$root\client`" && npm run dev"
Start-Process -FilePath cmd.exe -ArgumentList '/c', $viteScript -WindowStyle Minimized -WindowTitle 'DijiCatalog-Vite'

Write-Host "   15 saniye bekleniyor..."
Start-Sleep -Seconds 15

# [8/8] Health check
Write-Host ""
Write-Host "[8/8] Health check..."
try {
    $r = Invoke-WebRequest -Uri 'http://localhost:3000/api/ping' -UseBasicParsing -TimeoutSec 5
    Write-Host "   Backend (3000): HTTP $($r.StatusCode)" -ForegroundColor Green
} catch {
    Write-Host "   Backend (3000): HATA - $($_.Exception.Message)" -ForegroundColor Red
}

try {
    $r = Invoke-WebRequest -Uri 'http://localhost:5173' -UseBasicParsing -TimeoutSec 5
    Write-Host "   Vite (5173):    HTTP $($r.StatusCode)" -ForegroundColor Green
} catch {
    Write-Host "   Vite (5173):    HATA - $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""
Start-Process 'http://localhost:5173'

Write-Host ""
Write-Host "============================================"
Write-Host "  Tamamlandi"
Write-Host "  Backend:  http://localhost:3000"
Write-Host "  Frontend: http://localhost:5173"
Write-Host "  Login:    demo@digicatalog.local / Demo123!"
Write-Host "============================================"
Write-Host ""
Read-Host "Cikmak icin Enter"
