# setup-local-db.ps1
# DijiCatalog lokal PostgreSQL + Docker setup
# Kullanim: PowerShell'de .\scripts\setup-local-db.ps1

$ErrorActionPreference = 'Stop'

# === Renkler (sadece okunabilirlik icin) ===
function Ok($msg)    { Write-Host "  [OK]   $msg" -ForegroundColor Green }
function Info($msg)  { Write-Host "  [INFO] $msg" -ForegroundColor Cyan }
function Warn($msg)  { Write-Host "  [WARN] $msg" -ForegroundColor Yellow }
function Err($msg)   { Write-Host "  [HATA] $msg" -ForegroundColor Red; exit 1 }
function Step($n, $msg) { Write-Host "`n[$n] $msg" -ForegroundColor Magenta }

# === Baslik ===
Write-Host ""
Write-Host "  DijiCatalog Lokal PostgreSQL Setup" -ForegroundColor White -BackgroundColor DarkMagenta
Write-Host "  =====================================" -ForegroundColor DarkGray
Write-Host ""

# === 1) Docker var mi? ===
Step 1 "Docker kontrol"
$docker = Get-Command docker -ErrorAction SilentlyContinue
if (-not $docker) {
    Warn "Docker bulunamadi. winget ile kuruluyor..."
    winget install -e --id Docker.DockerDesktop --accept-package-agreements --accept-source-agreements
    if ($LASTEXITCODE -ne 0) { Err "Docker kurulumu basarisiz. Manuel kur: https://docker.com/products/docker-desktop/" }
    Info "Docker kuruldu. Bilgisayar yeniden baslatilmasi gerekebilir."
    Info "Lutfen Docker Desktop'i ac, bu scripti tekrar calistir."
    exit 0
}
Ok "Docker mevcut"

# === 2) Docker daemon calisiyor mu? ===
Step 2 "Docker daemon kontrol"
try {
    docker info 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "docker info failed" }
} catch {
    Err "Docker daemon calismiyor. Docker Desktop'i ac ve tekrar dene."
}
Ok "Docker daemon calisiyor"

# === 3) Mevcut 'digicatalog-postgres' container'i kontrol et ===
Step 3 "PostgreSQL container kontrol"
$existing = docker ps -a --filter "name=digicatalog-postgres" --format "{{.ID}}" 2>$null
if ($existing) {
    $running = docker ps --filter "name=digicatalog-postgres" --format "{{.ID}}" 2>$null
    if ($running) {
        Ok "Container zaten calisiyor (ID: $running)"
    } else {
        Warn "Container durmus, baslatiliyor..."
        docker start digicatalog-postgres | Out-Null
        Ok "Container baslatildi"
    }
} else {
    Info "Yeni PostgreSQL 16 container olusturuluyor..."
    docker run -d `
        --name digicatalog-postgres `
        --restart unless-stopped `
        -p 5432:5432 `
        -e POSTGRES_USER=postgres `
        -e POSTGRES_PASSWORD=postgres123 `
        -e POSTGRES_DB=digicatalog `
        -v digicatalog-pgdata:/var/lib/postgresql/data `
        postgres:16-alpine | Out-Null
    if ($LASTEXITCODE -ne 0) { Err "Container olusturulamadi" }
    Ok "Container olusturuldu ve baslatildi"
}

# === 4) DB'nin hazir olmasini bekle ===
Step 4 "PostgreSQL'in hazir olmasi bekleniyor"
$ready = $false
for ($i = 1; $i -le 30; $i++) {
    $check = docker exec digicatalog-postgres pg_isready -U postgres 2>&1
    if ($LASTEXITCODE -eq 0) { $ready = $true; break }
    Write-Host "." -NoNewline
    Start-Sleep 1
}
Write-Host ""
if (-not $ready) { Err "PostgreSQL 30 saniyede hazir olmadi" }
Ok "PostgreSQL hazir"

# === 5) DATABASE_URL hazirla ===
Step 5 "DATABASE_URL"
$dbUrl = "postgresql://postgres:postgres123@localhost:5432/digicatalog"
Ok "DATABASE_URL = $dbUrl"

# === 6) .env dosyasini guncelle ===
Step 6 "server/.env guncelleniyor"
$envPath = Join-Path $PSScriptRoot "..\server\.env"
if (-not (Test-Path $envPath)) {
    Warn "server/.env bulunamadi, .env.example'dan kopyalaniyor"
    Copy-Item (Join-Path $PSScriptRoot "..\server\.env.example") $envPath
}

$envContent = Get-Content $envPath -Raw
if ($envContent -match "DATABASE_URL\s*=") {
    $envContent = $envContent -replace "DATABASE_URL\s*=.*", "DATABASE_URL=$dbUrl"
} else {
    $envContent += "`nDATABASE_URL=$dbUrl`n"
}
$envContent | Set-Content $envPath -NoNewline
Ok "server/.env guncellendi"

# === 7) Baglanti testi ===
Step 7 "Baglanti testi"
$testResult = docker exec digicatalog-postgres psql -U postgres -d digicatalog -c "SELECT version();" 2>&1
if ($LASTEXITCODE -eq 0) {
    $versionLine = ($testResult | Select-String "PostgreSQL").ToString().Trim()
    Ok "Baglanti basarili: $versionLine"
} else {
    Err "Baglanti testi basarisiz: $testResult"
}

# === Ozet ===
Write-Host ""
Write-Host "  =====================================" -ForegroundColor DarkGray
Write-Host "  Tamamlandi!" -ForegroundColor Green
Write-Host "  =====================================" -ForegroundColor DarkGray
Write-Host ""
Write-Host "  Simdi sunlari yapabilirsin:" -ForegroundColor White
Write-Host ""
Write-Host "    1. server/.env dosyasini kontrol et (DATABASE_URL ayarli)" -ForegroundColor Gray
Write-Host "    2. Migration calistir:" -ForegroundColor Gray
Write-Host "       cd server && npm run db:migrate" -ForegroundColor Yellow
Write-Host "    3. Demo seed (opsiyonel):" -ForegroundColor Gray
Write-Host "       cd server && npm run db:seed" -ForegroundColor Yellow
Write-Host "    4. Server baslat:" -ForegroundColor Gray
Write-Host "       npm run dev" -ForegroundColor Yellow
Write-Host ""
Write-Host "  Client:  http://localhost:5173" -ForegroundColor Cyan
Write-Host "  Server:  http://localhost:3000" -ForegroundColor Cyan
Write-Host "  DB UI:   docker exec -it digicatalog-postgres psql -U postgres -d digicatalog" -ForegroundColor Cyan
Write-Host ""
