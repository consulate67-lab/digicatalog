# DijiCatalog client build + deploy script.
# Korgun makinesinde elevated PS'te calistirilir.
#
# Ne yapar:
# 1) client/ icinde npm install (ilk seferde) + npm run build (TypeScript + Vite)
# 2) Build ciktisi client/dist/ icinden server/public/'e kopyalanir
# 3) DijiCatalog backend NSSM service restart edilir (yeni bundle'i serve etsin)
#
# Calistirma:
#   cd C:\digicatalog
#   git pull origin main
#   powershell -NoProfile -ExecutionPolicy Bypass -File "C:\digicatalog\server\scripts\deploy-client.ps1"

$ErrorActionPreference = "Stop"

Write-Host "=== 1. Git pull (yeni commit'leri al) ===" -ForegroundColor Cyan
git pull origin main
if ($LASTEXITCODE -ne 0) { Write-Host "git pull basarisiz, devam ediliyor..." -ForegroundColor Yellow }

Write-Host ""
Write-Host "=== 2. Client npm install + build ===" -ForegroundColor Cyan
Set-Location "C:\digicatalog\client"

if (-not (Test-Path "node_modules")) {
    Write-Host "node_modules yok, npm install calistiriliyor..." -ForegroundColor Yellow
    npm install --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) { throw "npm install basarisiz" }
}

npm run build
if ($LASTEXITCODE -ne 0) { throw "npm run build basarisiz" }

Write-Host ""
Write-Host "=== 3. dist/ -> server/public/ kopyala ===" -ForegroundColor Cyan
$distDir = "C:\digicatalog\client\dist"
$publicDir = "C:\digicatalog\server\public"

if (-not (Test-Path $distDir)) { throw "dist/ bulunamadi: $distDir" }

# public dizinini temizle (eski asset'leri sil)
if (Test-Path $publicDir) {
    Write-Host "Eski public/ temizleniyor..." -ForegroundColor Yellow
    Get-ChildItem -Path $publicDir -Force | Where-Object { -not $_.PSIsContainer -or $_.Name -notin @(".") } | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
} else {
    New-Item -ItemType Directory -Path $publicDir -Force | Out-Null
}

# Yeni build'i kopyala
Write-Host "Yeni build kopyalaniyor..." -ForegroundColor Yellow
Copy-Item -Path "$distDir\*" -Destination $publicDir -Recurse -Force
Copy-Item -Path "$distDir\.*" -Destination $publicDir -Force -ErrorAction SilentlyContinue  # hidden files (.htaccess etc)

Write-Host ""
Write-Host "=== 4. NSSM service restart ===" -ForegroundColor Cyan
$nssm = "C:\Tools\nssm-2.24\win64\nssm.exe"
if (Test-Path $nssm) {
    Restart-Service DijiCatalog
    Start-Sleep -Seconds 3
    Get-Service DijiCatalog | Select-Object Name, Status, StartType | Format-Table -AutoSize
} else {
    Write-Host "NSSM bulunamadi ($nssm). Manuel restart gerekli." -ForegroundColor Yellow
    Restart-Service DijiCatalog
}

Write-Host ""
Write-Host "=== 5. Dogrulama ===" -ForegroundColor Cyan
Write-Host "Server public:" -ForegroundColor Yellow
Get-ChildItem $publicDir | Select-Object Name, Length | Format-Table -AutoSize | Out-String | Write-Host

Write-Host "Port 3000:" -ForegroundColor Yellow
Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue | Select-Object State, OwningProcess | Format-Table -AutoSize | Out-String | Write-Host

Write-Host ""
Write-Host "=== Tamamlandi ===" -ForegroundColor Green
Write-Host "Production URL: http://localhost:3000/admin/catalogs (login: demo@digicatalog.local / Demo123!)"
Write-Host "Veya: http://192.168.2.67:3000/admin/catalogs (LAN)"
