# ============================================================================
# DijiCatalog On-Premise Setup - Windows Server
# Hedef: Windows Server 2019/2022 - 192.168.2.67 gibi internal sunucular
# Kurulum: Node.js 20 + PostgreSQL + DijiCatalog + NSSM service + Firewall
#
# Kullanim (PowerShell Admin):
#   Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
#   .\setup-onprem.ps1
#
# Env variables (opsiyonel):
#   $APP_DIR          = "C:\digicatalog"
#   $DB_PASSWORD      = "<random>"
#   $SERVER_IP        = "192.168.2.67"
# ============================================================================

#Requires -RunAsAdministrator

[CmdletBinding()]
param(
    [string]$AppDir = "C:\digicatalog",
    [string]$ServerIP = "",
    [string]$DbPassword = "",
    [string]$GitHubRepo = "consulate67-lab/digicatalog",
    [string]$GitHubBranch = "main"
)

$ErrorActionPreference = 'Stop'

# === Renk ===
function Log([string]$msg)  { Write-Host "[+] $msg" -ForegroundColor Green }
function Warn([string]$msg) { Write-Host "[!] $msg" -ForegroundColor Yellow }
function Err([string]$msg)  { Write-Host "[X] $msg" -ForegroundColor Red; exit 1 }
function Hr() { Write-Host "--------------------------------------------------------" -ForegroundColor DarkGray }

# === Admin kontrol ===
$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Err "Bu script YONETICI olarak calistirilmali. PowerShell'i 'Run as Administrator' ile ac."
}

# === IP tespit ===
if ([string]::IsNullOrEmpty($ServerIP)) {
    $ServerIP = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object {
        $_.IPAddress -notmatch '^127\.' -and $_.IPAddress -notmatch '^169\.254\.'
    } | Select-Object -First 1).IPAddress
}
if ([string]::IsNullOrEmpty($ServerIP)) {
    Err "Server IP tespit edilemedi. -ServerIP parametresi ile manuel ver."
}

# === DB sifre ===
if ([string]::IsNullOrEmpty($DbPassword)) {
    Add-Type -AssemblyName System.Web
    $DbPassword = [System.Web.Security.Membership]::GeneratePassword(32, 0)
}

# === JWT secret ===
$JwtSecret = -join ((1..64) | ForEach-Object { '{0:x2}' -f (Get-Random -Maximum 256) })

Hr
Write-Host "DijiCatalog On-Premise Setup (Windows Server)" -ForegroundColor Cyan
Hr
Write-Host "APP_DIR        : $AppDir"
Write-Host "SERVER_IP      : $ServerIP"
Write-Host "DB_PASSWORD    : $DbPassword (kayit et!)"
Write-Host "JWT_SECRET     : $($JwtSecret.Substring(0, 16))... (32 byte hex)"
Write-Host "GitHub Repo    : $GitHubRepo ($GitHubBranch)"
Hr

# === ADIM 1: winget / chocolatey kontrol ===
Hr
Log "ADIM 1/9: Paket yoneticisi kontrol ediliyor..."
$pkgMgr = $null
if (Get-Command winget -ErrorAction SilentlyContinue) {
    $pkgMgr = "winget"
    Log "winget bulundu"
} elseif (Get-Command choco -ErrorAction SilentlyContinue) {
    $pkgMgr = "choco"
    Log "Chocolatey bulundu"
} else {
    Warn "winget/choco yok, manuel installer kullanilacak"
}

# === ADIM 2: Git ===
Hr
Log "ADIM 2/9: Git kuruluyor..."
if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    if ($pkgMgr -eq "winget") {
        winget install -e --id Git.Git --accept-package-agreements --accept-source-agreements | Out-Null
    } elseif ($pkgMgr -eq "choco") {
        choco install -y git | Out-Null
    } else {
        $gitInstaller = "$env:TEMP\git-installer.exe"
        Invoke-WebRequest -Uri "https://github.com/git-for-windows/git/releases/download/v2.47.1.windows.1/Git-2.47.1-64-bit.exe" -OutFile $gitInstaller -UseBasicParsing
        Start-Process -FilePath $gitInstaller -ArgumentList "/VERYSILENT","/NORESTART","/NOCANCEL","/SP-","/CLOSEAPPLICATIONS" -Wait
        Remove-Item $gitInstaller -Force
    }
    # Git PATH icin yeni shell gerekebilir, ama mevcut shell'e de eklenir
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
}
Log "Git: $(git --version)"

# === ADIM 3: Node.js 20 LTS ===
Hr
Log "ADIM 3/9: Node.js 20 LTS kuruluyor..."
$nodeInstalled = $false
if (Get-Command node -ErrorAction SilentlyContinue) {
    $nodeMajor = [int]((node -v) -replace 'v','' -split '\.')[0]
    if ($nodeMajor -ge 20) {
        Log "Node.js $(node -v) zaten kurulu"
        $nodeInstalled = $true
    }
}
if (-not $nodeInstalled) {
    $nodeInstaller = "$env:TEMP\node-installer.msi"
    $nodeUrl = "https://nodejs.org/dist/v20.18.0/node-v20.18.0-x64.msi"
    Log "Node.js MSI indiriliyor..."
    Invoke-WebRequest -Uri $nodeUrl -OutFile $nodeInstaller -UseBasicParsing
    Log "Node.js MSI sessizce kuruluyor..."
    Start-Process -FilePath msiexec.exe -ArgumentList "/i `"$nodeInstaller`" /qn /norestart" -Wait
    Remove-Item $nodeInstaller -Force
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
}
Log "Node.js: $(node -v)"
Log "npm: $(npm -v)"

# === ADIM 4: PostgreSQL 16 ===
Hr
Log "ADIM 4/9: PostgreSQL 16 kuruluyor..."
$pgInstalled = $false
$pgService = Get-Service -Name "postgresql*" -ErrorAction SilentlyContinue | Select-Object -First 1
if ($pgService -and $pgService.Status -eq "Running") {
    Log "PostgreSQL servisi zaten calisiyor: $($pgService.Name)"
    $pgInstalled = $true
}

if (-not $pgInstalled) {
    if ($pkgMgr -eq "winget") {
        winget install -e --id PostgreSQL.PostgreSQL.16 --accept-package-agreements --accept-source-agreements | Out-Null
    } elseif ($pkgMgr -eq "choco") {
        choco install -y postgresql16 | Out-Null
    } else {
        $pgInstaller = "$env:TEMP\postgresql-installer.exe"
        $pgUrl = "https://get.enterprisedb.com/postgresql/postgresql-16.4-1-windows-x64.exe"
        Log "PostgreSQL indiriliyor (~300MB)..."
        Invoke-WebRequest -Uri $pgUrl -OutFile $pgInstaller -UseBasicParsing
        Log "PostgreSQL sessizce kuruluyor..."
        # Sessiz kurulum: superpassword ve install dir
        $pgInstallDir = "C:\PostgreSQL"
        New-Item -ItemType Directory -Path $pgInstallDir -Force | Out-Null
        $proc = Start-Process -FilePath $pgInstaller -ArgumentList `
            "--mode unattended",
            "--superpassword `"$DbPassword`"",
            "--prefix `"$pgInstallDir`"",
            "--datadir `"$pgInstallDir\data`"" `
            -Wait -PassThru -NoNewWindow
        Remove-Item $pgInstaller -Force -ErrorAction SilentlyContinue
    }
}
# PATH'e PostgreSQL bin ekle
$pgPathCandidates = @(
    "C:\Program Files\PostgreSQL\16\bin",
    "C:\Program Files\PostgreSQL\15\bin",
    "C:\PostgreSQL\bin"
)
foreach ($p in $pgPathCandidates) {
    if (Test-Path "$p\psql.exe") {
        $env:Path = "$p;$env:Path"
        [Environment]::SetEnvironmentVariable("Path", $p + ";" + [Environment]::GetEnvironmentVariable("Path","User"), "User")
        $pgBin = $p
        break
    }
}
Log "PostgreSQL psql: $((Get-Command psql -ErrorAction SilentlyContinue).Source)"

# === ADIM 5: PostgreSQL DB ve kullanici olustur ===
Hr
Log "ADIM 5/9: Database ve kullanici olusturuluyor..."

# initdb kontrol (data klasör bossa)
$pgDataDir = "C:\Program Files\PostgreSQL\16\data"
if (-not (Test-Path "$pgDataDir\PG_VERSION")) {
    Warn "PostgreSQL data dizini bos, initdb gerekebilir"
}

# DB ve user olustur (psql ile)
$dbName = "digicatalog"
$dbUser = "digicatalog"
$createResult = & psql -U postgres -d postgres -c @"
DO \$\$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = '$dbUser') THEN
        CREATE USER $dbUser WITH ENCRYPTED PASSWORD '$DbPassword';
    END IF;
END
\$\$;
SELECT 'CREATE DATABASE $dbName OWNER $dbUser'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '$dbName')\gexec
GRANT ALL PRIVILEGES ON DATABASE $dbName TO $dbUser;
"@ 2>&1

if ($LASTEXITCODE -ne 0) {
    Warn "DB olusturma basarisiz (psql yetki sorunu?). Manuel deneyebilirsin."
} else {
    Log "Database '$dbName' ve user '$dbUser' olusturuldu"
}

# === ADIM 6: Repo klonla ===
Hr
Log "ADIM 6/9: Repo klonlaniyor..."
if (Test-Path $AppDir) {
    Warn "$AppDir zaten var, guncelleniyor..."
    Set-Location $AppDir
    git pull origin $GitHubBranch 2>&1 | Out-String | Write-Host
} else {
    git clone --branch $GitHubBranch "https://github.com/$GitHubRepo.git" $AppDir
    Set-Location $AppDir
}
Log "Repo yolu: $AppDir"

# === ADIM 7: Install + Build ===
Hr
Log "ADIM 7/9: npm install + build..."
npm install --include=dev 2>&1 | Select-Object -Last 3 | Write-Host
Log "TypeScript + Vite build..."
npm run build 2>&1 | Select-Object -Last 3 | Write-Host

# === ADIM 8: .env olustur + migrate ===
Hr
Log "ADIM 8/9: server/.env + migrate..."

$envContent = @"
NODE_ENV=production
PORT=3000

# Database (local PostgreSQL)
DATABASE_URL=postgresql://${dbUser}:${DbPassword}@localhost:5432/${dbName}

# Security
JWT_SECRET=${JwtSecret}
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# CORS - internal network + localhost
ALLOWED_ORIGINS=http://localhost,http://localhost:5173,http://${ServerIP},http://${ServerIP}:5173,http://${ServerIP}:3000

# Logging
LOG_LEVEL=info
"@

$envPath = Join-Path $AppDir "server\.env"
$envContent | Out-File -FilePath $envPath -Encoding ASCII -NoNewline
# Guvenlik: sadece admin okuyabilsin
icacls $envPath /inheritance:r /grant:r "$env:USERNAME:(R)" | Out-Null
Log "server/.env yazildi"

Set-Location "$AppDir\server"
Log "Migration..."
npm run db:migrate 2>&1 | Select-Object -Last 5 | Write-Host

Log "Seed (demo data)..."
try {
    npm run db:seed 2>&1 | Select-Object -Last 10 | Write-Host
    Log "Demo veriler yuklendi"
} catch {
    Warn "Seed basarisiz ama onemli degil"
}

# === ADIM 9: NSSM ile Windows service ===
Hr
Log "ADIM 9/9: NSSM ile Windows Service..."

# NSSM yoksa indir
$nssmPath = "C:\Tools\nssm.exe"
if (-not (Test-Path $nssmPath)) {
    $nssmZip = "$env:TEMP\nssm.zip"
    New-Item -ItemType Directory -Path "C:\Tools" -Force | Out-Null
    Invoke-WebRequest -Uri "https://nssm.cc/release/nssm-2.24.zip" -OutFile $nssmZip -UseBasicParsing
    Expand-Archive -Path $nssmZip -DestinationPath "$env:TEMP\nssm" -Force
    # 64-bit copy
    Copy-Item "$env:TEMP\nssm\nssm-2.24\win64\nssm.exe" $nssmPath -Force
    Remove-Item $nssmZip -Force -ErrorAction SilentlyContinue
}
Log "NSSM: $nssmPath"

# Eski service varsa kaldir
& $nssmPath stop digicatalog 2>$null
& $nssmPath remove digicatalog confirm 2>$null

# Yeni service kur
& $nssmPath install digicatalog "C:\Program Files\nodejs\node.exe" "$AppDir\server\dist\index.js" | Out-Null
& $nssmPath set digicatalog AppDirectory $AppDir | Out-Null
& $nssmPath set digicatalog DisplayName "DijiCatalog" | Out-Null
& $nssmPath set digicatalog Description "DijiCatalog backend (Express + PostgreSQL)" | Out-Null
& $nssmPath set digicatalog Start SERVICE_AUTO_START | Out-Null
& $nssmPath set digicatalog AppStdout "$AppDir\logs\out.log" | Out-Null
& $nssmPath set digicatalog AppStderr "$AppDir\logs\err.log" | Out-Null
& $nssmPath set digicatalog AppRotateFiles 1 | Out-Null
& $nssmPath set digicatalog AppRotateBytes 10485760 | Out-Null

New-Item -ItemType Directory -Path "$AppDir\logs" -Force | Out-Null

& $nssmPath start digicatalog
Start-Sleep -Seconds 3
$svc = Get-Service -Name "digicatalog" -ErrorAction SilentlyContinue
if ($svc -and $svc.Status -eq "Running") {
    Log "Service 'digicatalog' calisiyor!"
} else {
    Warn "Service baslatilamadi, manuel kontrol: Get-Service digicatalog"
}

# Firewall - 3000 ve 80 port ac
Hr
Log "Firewall ayarlaniyor..."
try {
    New-NetFirewallRule -DisplayName "DijiCatalog" -Direction Inbound -LocalPort 3000 -Protocol TCP -Action Allow -ErrorAction SilentlyContinue | Out-Null
    New-NetFirewallRule -DisplayName "DijiCatalog HTTP" -Direction Inbound -LocalPort 80 -Protocol TCP -Action Allow -ErrorAction SilentlyContinue | Out-Null
    Log "Firewall kurallari eklendi (port 3000, 80)"
} catch {
    Warn "Firewall ayarlanamadi (yetki sorunu?). Manuel ekle: New-NetFirewallRule"
}

# Outbound: 192.168.1.197 (Korgun MSSQL) - zaten internal, gerek yok ama log
Log "Outbound: 192.168.1.197 (Korgun MSSQL) internal network, ek kural gerekmiyor"

# === Ozet ===
Hr
Write-Host ""
Write-Host "=== DijiCatalog kurulumu tamamlandi! ===" -ForegroundColor Green
Write-Host ""
Write-Host "Erisim:" -ForegroundColor Cyan
Write-Host "  Local URL:    http://localhost:3000"
Write-Host "  Network URL:  http://$ServerIP:3000"
Write-Host "  API Health:   http://$ServerIP:3000/api/ping"
Write-Host ""
Write-Host "Demo login:" -ForegroundColor Cyan
Write-Host "  Email:        demo@digicatalog.local"
Write-Host "  Sifre:        Demo123!"
Write-Host ""
Write-Host "Yonetim:" -ForegroundColor Cyan
Write-Host "  Get-Service digicatalog        - servis durumu"
Write-Host "  Restart-Service digicatalog    - yeniden baslat"
Write-Host "  Get-Content $AppDir\logs\out.log - son loglar"
Write-Host "  $nssmPath edit digicatalog     - service config"
Write-Host ""
Write-Host "ERP test (Korgun MSSQL):" -ForegroundColor Cyan
Write-Host "  /admin/integrations'da Korgun sec:"
Write-Host "    Sunucu:       192.168.1.197\ABKA  (direkt internal IP)"
Write-Host "    Veritabani:   DEPO2026"
Write-Host "    Kullanici:    selim"
Write-Host "    Self-signed:  Evet"
Write-Host ""
Write-Host "DB bilgileri (kayit et):" -ForegroundColor Yellow
Write-Host "  DB_NAME=$dbName"
Write-Host "  DB_USER=$dbUser"
Write-Host "  DB_PASSWORD=$DbPassword"
Write-Host ""
Hr
