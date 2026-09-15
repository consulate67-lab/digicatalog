# ============================================================================
# DijiCatalog On-Premise Setup - Korgün makinesi (MSSQL)
# Hedef: 192.168.2.67 (Korgün ERP sunucusu) - DijiCatalog MSSQL üzerinden
# Stack: Node.js 20 + MSSQL (zaten kurulu) + DijiCatalog + NSSM service
#
# Kullanim ornegi (Korgun'de PowerShell Admin):
#   .\setup-korgun-mssql.ps1 -MssqlServer 'localhost' -MssqlInstance 'ABKA' -MssqlUser 'sa' -MssqlPassword 'sifre' -DbName 'DijiCatalog' -AppDir 'C:\digicatalog' -ServerIP '192.168.2.67'
#
# Env (opsiyonel):
#   $Env:SKIP_INSTALL = "1"   -> sadece DB+migrate+seed (node zaten kurulu)
# ============================================================================

#Requires -RunAsAdministrator

[CmdletBinding()]
param(
    [string]$MssqlServer = 'localhost',
    [int]$MssqlPort = 1433,
    [string]$MssqlInstance = '',  # named instance (örn. ABKA)
    [string]$MssqlUser = 'sa',
    [string]$MssqlPassword = '',
    [string]$DbName = 'DijiCatalog',
    [string]$AppDir = 'C:\digicatalog',
    [string]$ServerIP = '192.168.2.67',
    [string]$GitHubRepo = 'consulate67-lab/digicatalog',
    [string]$GitHubBranch = 'main'
)

$ErrorActionPreference = 'Continue'

# === Renkler ===
function Log([string]$msg)  { Write-Host "[+] $msg" -ForegroundColor Green }
function Warn([string]$msg) { Write-Host "[!] $msg" -ForegroundColor Yellow }
function Err([string]$msg)  { Write-Host "[X] $msg" -ForegroundColor Red; exit 1 }
function Hr() { Write-Host "--------------------------------------------------------" -ForegroundColor DarkGray }

# === Admin kontrol ===
$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Err "Bu script YONETICI olarak calistirilmali. PowerShell'i 'Run as Administrator' ile ac."
}

if ([string]::IsNullOrEmpty($MssqlPassword)) {
    Err "MSSQL sifresi (-MssqlPassword) zorunludur."
}

# === Secrets ===
$JwtSecret = -join ((1..32) | ForEach-Object { '{0:x2}' -f (Get-Random -Maximum 256) })

# === MSSQL server string ===
# mssql package: eğer instance varsa server = 'host\INSTANCE', port ignored (dynamic)
$mssqlServerString = if ($MssqlInstance) { "$MssqlServer\$MssqlInstance" } else { $MssqlServer }

Hr
Write-Host "DijiCatalog On-Premise Setup (Korgun - MSSQL)" -ForegroundColor Cyan
Hr
Write-Host "MSSQL Sunucu  : $mssqlServerString$(if ($MssqlInstance) { '' } else { ":$MssqlPort" })"
Write-Host "MSSQL User    : $MssqlUser"
Write-Host "DB Name       : $DbName"
Write-Host "APP_DIR       : $AppDir"
Write-Host "SERVER_IP     : $ServerIP"
Write-Host "JWT_SECRET    : $($JwtSecret.Substring(0, 16))..."
Write-Host "GitHub Repo   : $GitHubRepo ($GitHubBranch)"
Hr

# === ADIM 1: Repo klonla ===
Hr
Log "ADIM 1/7: Repo klonlaniyor..."
if (Test-Path $AppDir) {
    Warn "$AppDir zaten var, zorla senkronize ediliyor (reset --hard)..."
    Set-Location $AppDir
    # git fetch sırasında PowerShell native stderr'i RemoteException fırlatıyor
    # (--quiet ile çıktı bastırılır, try/catch ile koruma sağlanır)
    try {
        git fetch origin --quiet 2>&1 | Out-Null
    } catch {
        Warn "git fetch basarisiz olabilir, devam ediliyor: $_"
    }
    try {
        git reset --hard "origin/$GitHubBranch" 2>&1 | Out-String | Write-Host
    } catch {
        Warn "git reset basarisiz, devam ediliyor: $_"
    }
    try {
        git clean -fd 2>&1 | Out-String | Write-Host
    } catch {
        Warn "git clean basarisiz, devam ediliyor: $_"
    }
} else {
    try {
        git clone --branch $GitHubBranch "https://github.com/$GitHubRepo.git" $AppDir
    } catch {
        Err "git clone basarisiz. Ag/internet erisimini kontrol et"
    }
    Set-Location $AppDir
}

# === ADIM 2: Install + Build ===
Hr
Log "ADIM 2/7: npm install + build..."
Set-Location $AppDir
npm install --include=dev 2>&1 | Select-Object -Last 5 | Write-Host
Log "TypeScript build..."
Set-Location "$AppDir\server"
$buildOutput = npm run build 2>&1 | Out-String
Write-Host $buildOutput
if ($LASTEXITCODE -ne 0) {
    Err "TypeScript build basarisiz (exit=$LASTEXITCODE). Yukaridaki hata mesajini kontrol et"
}
Log "Build basarili"

# === ADIM 3: MSSQL DB oluştur (node_modules hazır olduktan sonra) ===
Hr
Log "ADIM 3/7: MSSQL baglantisi + DB olustur..."

$createDbScript = Join-Path $AppDir 'server\scripts\create-mssql-db.js'
if (Test-Path $createDbScript) {
    & node $createDbScript `
        --server $MssqlServer `
        --port $MssqlPort `
        --instance $MssqlInstance `
        --user $MssqlUser `
        --password $MssqlPassword `
        --database $DbName
    if ($LASTEXITCODE -ne 0) {
        Err "MSSQL DB olusturulamadi"
    }
} else {
    Warn "create-mssql-db.js bulunamadi, DB olusturma adimi atlanir"
}

# === ADIM 4: .env ===
Hr
Log "ADIM 4/7: server/.env..."

# DATABASE_URL format: mssql://user:pass@server\INSTANCE/db?...
# Not: named instance varsa port eklemiyoruz (dynamic port SQL Browser resolve eder)
$dbUrlUser = [uri]::EscapeDataString($MssqlUser)
$dbUrlPass = [uri]::EscapeDataString($MssqlPassword)
$dbUrlHost = $MssqlServer
if ($MssqlInstance) {
    # Named instance: mssql://user:pass@host\INSTANCE/db?... (port yok)
    $dbUrlServer = "$MssqlServer\$MssqlInstance"
    $databaseUrl = "mssql://$dbUrlUser`:$dbUrlPass@$dbUrlServer/$DbName`?encrypt=false&trustServerCertificate=true"
} else {
    $databaseUrl = "mssql://$dbUrlUser`:$dbUrlPass@$dbUrlHost`:$MssqlPort/$DbName`?encrypt=false&trustServerCertificate=true"
}

$envContent = @"
NODE_ENV=production
PORT=3000

# Database (Korgun MSSQL - digicatalog DB)
DATABASE_URL=$databaseUrl

# Security
JWT_SECRET=$JwtSecret
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# CORS - internal network + localhost
ALLOWED_ORIGINS=http://localhost,http://localhost:5173,http://$ServerIP,http://$ServerIP`:5173,http://$ServerIP`:3000

# Logging
LOG_LEVEL=info
"@

$envPath = Join-Path $AppDir "server\.env"
$envContent | Out-File -FilePath $envPath -Encoding UTF8 -NoNewline
icacls $envPath /inheritance:r /grant:r "$env:USERNAME:(R)" | Out-Null
Log "server/.env yazildi"

# === ADIM 5: MSSQL schema migration (manuel SQL — Drizzle Kit henuz MSSEL desteklemiyor) ===
Hr
Log "ADIM 5/7: MSSQL schema migration..."
Set-Location "$AppDir\server"
$migrationScript = Join-Path $AppDir 'server\scripts\apply-migration.js'
if (Test-Path $migrationScript) {
    try {
        & node $migrationScript `
            --server $MssqlServer `
            --port $MssqlPort `
            --instance $MssqlInstance `
            --user $MssqlUser `
            --password $MssqlPassword `
            --database $DbName 2>&1 | Select-Object -Last 20 | Write-Host
        if ($LASTEXITCODE -ne 0) {
            Err "MSSQL migration basarisiz. Manuel kontrol: server dizininde 'node scripts/apply-migration.js' calistir"
        }
    } catch {
        Err "apply-migration.js calistirilamadi: $_"
    }
    Log "Tablo semalari MSSQL'de olusturuldu"
} else {
    Err "apply-migration.js bulunamadi"
}

# === ADIM 6: Seed ===
Hr
Log "ADIM 6/7: Seed (demo data)..."
try {
    npm run db:seed 2>&1 | Select-Object -Last 10 | Write-Host
    Log "Demo veriler yuklendi"
} catch {
    Warn "Seed basarisiz ama onemli degil"
}

# === ADIM 7: NSSM ile Windows service ===
Hr
Log "ADIM 7/7: NSSM ile Windows Service..."

$nssmPath = "C:\Tools\nssm.exe"
if (-not (Test-Path $nssmPath)) {
    $nssmZip = "$env:TEMP\nssm.zip"
    New-Item -ItemType Directory -Path "C:\Tools" -Force | Out-Null
    Invoke-WebRequest -Uri "https://nssm.cc/release/nssm-2.24.zip" -OutFile $nssmZip -UseBasicParsing
    Expand-Archive -Path $nssmZip -DestinationPath "$env:TEMP\nssm" -Force
    Copy-Item "$env:TEMP\nssm\nssm-2.24\win64\nssm.exe" $nssmPath -Force
    Remove-Item $nssmZip -Force -ErrorAction SilentlyContinue
}
Log "NSSM: $nssmPath"

& $nssmPath stop digicatalog 2>$null
& $nssmPath remove digicatalog confirm 2>$null

& $nssmPath install digicatalog "C:\Program Files\nodejs\node.exe" "$AppDir\server\dist\index.js" | Out-Null
& $nssmPath set digicatalog AppDirectory $AppDir | Out-Null
& $nssmPath set digicatalog DisplayName "DijiCatalog" | Out-Null
& $nssmPath set digicatalog Description "DijiCatalog backend (Express + MSSQL)" | Out-Null
& $nssmPath set digicatalog Start SERVICE_AUTO_START | Out-Null
& $nssmPath set digicatalog AppStdout "$AppDir\logs\out.log" | Out-Null
& $nssmPath set digicatalog AppStderr "$AppDir\logs\err.log" | Out-Null
& $nssmPath set digicatalog AppRotateFiles 1 | Out-Null
& $nssmPath set digicatalog AppRotateBytes 10485760 | Out-Null

New-Item -ItemType Directory -Path "$AppDir\logs" -Force | Out-Null

& $nssmPath start digicatalog
Start-Sleep -Seconds 5
$svc = Get-Service -Name "digicatalog" -ErrorAction SilentlyContinue
if ($svc -and $svc.Status -eq "Running") {
    Log "Service 'digicatalog' calisiyor!"
} else {
    Warn "Service henuz baslamamis olabilir. Log kontrol: Get-Content $AppDir\logs\err.log -Tail 30"
}

# Firewall
Log "Firewall ayarlaniyor..."
try {
    New-NetFirewallRule -DisplayName "DijiCatalog" -Direction Inbound -LocalPort 3000 -Protocol TCP -Action Allow -ErrorAction SilentlyContinue | Out-Null
    Log "Firewall: port 3000 acik"
} catch {
    Warn "Firewall ayarlanamadi"
}

# === Ozet ===
Hr
Write-Host ""
Write-Host "=== DijiCatalog (MSSQL) kurulumu tamamlandi! ===" -ForegroundColor Green
Write-Host ""
Write-Host "Erisim:" -ForegroundColor Cyan
Write-Host "  Local URL:    http://localhost:3000"
Write-Host "  Network URL:  http://$ServerIP`:3000"
Write-Host "  API Health:   http://$ServerIP`:3000/api/ping"
Write-Host ""
Write-Host "Demo login:" -ForegroundColor Cyan
Write-Host "  Email:        demo@digicatalog.local"
Write-Host "  Sifre:        Demo123!"
Write-Host ""
Write-Host "ERP test (Korgun MSSQL - DijiCatalog DB):" -ForegroundColor Cyan
Write-Host "  /admin/integrations'da Korgun sec:"
Write-Host "    Sunucu:       $mssqlServerString$(if (-not $MssqlInstance) { ":$MssqlPort" } else { '' })"
Write-Host "    Veritabani:   $DbName"
Write-Host "    Kullanici:    $MssqlUser"
Write-Host ""
Write-Host "Korgun ERP tablolarina erisim (Faz 4):" -ForegroundColor Cyan
Write-Host "  Ayri MSSQL connection ile DEPO2026 DB'sindeki StokKart/CariKart okunur"
Write-Host ""
Write-Host "Yonetim:" -ForegroundColor Cyan
Write-Host "  Get-Service digicatalog           - servis durumu"
Write-Host "  Restart-Service digicatalog       - yeniden baslat"
Write-Host "  Get-Content $AppDir\logs\out.log   - son loglar"
Write-Host "  $nssmPath edit digicatalog        - service config"
Write-Host ""
Hr