# DijiCatalog Deployment Rehberi (Korgun / Faz E)

## Mevcut Durum

```
┌─────────────────────────────────────────────────────┐
│ Korgun Makinesi (192.168.2.67)                       │
│                                                     │
│  ┌─────────────┐   ┌─────────────────────────────┐   │
│  │ IIS 'resim' │   │ NSSM Service 'DijiCatalog'  │   │
│  │ port 1983   │   │ port 3000 (localhost)        │   │
│  │ static img  │   │ Express + SPA fallback       │   │
│  └─────────────┘   └─────────────────────────────┘   │
│                                                     │
│  C:\digicatalog\                                     │
│  ├─ server\                                         │
│  │  ├─ dist\index.js (Express backend)              │
│  │  ├─ public\ (statik client bundle — bu dok.)    │
│  │  └─ logs\backend.log                              │
│  ├─ client\                                         │
│  │  └─ dist\ (Vite build çıktısı)                   │
│  └─ .git\                                           │
└─────────────────────────────────────────────────────┘
```

## Faz E.1 — Client Production Build + Deploy (TAMAMLANDI)

`server/scripts/deploy-client.ps1` scripti:
1. `git pull origin main` (yeni UI commit'leri)
2. `npm install` + `npm run build` (client/)
3. `client/dist/*` → `server/public/` kopyalama
4. `Restart-Service DijiCatalog` (NSSM)
5. Doğrulama: port 3000, public/ içeriği

**Test URL:** `http://localhost:3000/admin/catalogs` (login: demo@digicatalog.local / Demo123!)

---

## Faz E.2 — IIS Reverse Proxy (İSTEĞE BAĞLI)

**Amaç:** Dış müşteri/ziyaretçi `https://katalog.example.com` gibi bir URL'den erişsin. Backend'i 3000 portuna dokunmadan IIS üzerinden route et.

### Gereksinimler

1. **IIS URL Rewrite** modülü (`Microsoft URL Rewrite Module`)
2. **Application Request Routing (ARR)** (`Microsoft Application Request Routing`)
3. **Self-signed SSL certificate** (geliştirme) veya domain certificate (production)

### PowerShell ile Kurulum (elevated)

```powershell
# 1. URL Rewrite + ARR installer'lari yoksa Web Platform Installer ile
# https://www.iis.net/downloads/microsoft/url-rewrite
# https://www.iis.net/downloads/microsoft/application-request-routing

# 2. Self-signed SSL cert (gelistirme icin)
$cert = New-SelfSignedCertificate -DnsName "katalog.local", "192.168.2.67" `
    -CertStoreLocation "cert:\LocalMachine\My" `
    -KeyAlgorithm RSA -KeyLength 2048 -NotAfter (Get-Date).AddYears(2)
Write-Host "Cert thumbprint: $($cert.Thumbprint)"

# 3. IIS 'dijicatalog' yeni site (port 443, HTTPS)
Import-Module WebAdministration
New-WebSite -Name "dijicatalog" -Port 443 -PhysicalPath "C:\digicatalog\server\public" `
    -Ssl -SslFlags $cert.Thumbprint -ApplicationPool "DijiCatalogPool"

# 4. URL Rewrite rule: /api/* -> http://localhost:3000'a proxy
# web.config dosyasina ekle (C:\digicatalog\server\public\web.config):
```

### web.config (server/public/ altına)

```xml
<?xml version="1.0" encoding="UTF-8"?>
<configuration>
  <system.webServer>
    <rewrite>
      <rules>
        <!-- API istekleri Node.js 3000'e proxy -->
        <rule name="ProxyToAPI" stopProcessing="true">
          <match url="^api/(.*)" />
          <action type="Rewrite" url="http://localhost:3000/api/{R:1}" logRewrittenUrl="true" />
        </rule>
        <!-- Viewer share URL'leri de API -->
        <rule name="ProxyToViewerShare" stopProcessing="true">
          <match url="^viewer/share/(.*)" />
          <action type="Rewrite" url="http://localhost:3000/api/viewer/share/{R:1}" />
        </rule>
        <!-- SPA fallback: diger her sey icin index.html -->
        <rule name="SPAFallback">
          <match url=".*" />
          <conditions logicalGrouping="MatchAll">
            <add input="{REQUEST_FILENAME}" matchType="IsFile" negate="true" />
            <add input="{REQUEST_FILENAME}" matchType="IsDirectory" negate="true" />
          </conditions>
          <action type="Rewrite" url="/index.html" />
        </rule>
      </rules>
    </rewrite>
    <httpRedirect enabled="false" />
    <security>
      <accessSslFlags sslFlags="Ssl, Ssl128" />
    </security>
  </system.webServer>
</configuration>
```

### ARR Reverse Proxy (opsiyonel, full proxy mode)

URL Rewrite modülü reverse proxy için yeterli değilse ARR ile:
```powershell
# Server Farm olustur
New-WebServerFarm -Name "DijiCatalog" -Servers @{address="localhost"; port="3000"}

# Proxy rule
Add-WebConfigurationProperty -Filter "/system.webServer/proxy/rewrite" -Name "enabled" -Value "True"
```

---

## Faz E.3 — LAN Test (Port 3000 Direkt)

Reverse proxy olmadan basit LAN erişim:

```powershell
# Firewall'da 3000 portunu ac
New-NetFirewallRule -DisplayName "DijiCatalog 3000" -Direction Inbound `
    -LocalPort 3000 -Protocol TCP -Action Allow

# Veya UI kullanarak:
# Windows Security Firewall → Inbound Rules → New Rule → Port 3000 TCP Allow
```

**Test:**
- Korgun: `http://localhost:3000` → backend çalışıyor
- Aynı LAN'daki makine: `http://192.168.2.67:3000` → müşteri erişir

---

## Faz E.4 — Public Internet (Production)

Dış müşteri erişimi için:
1. **Domain**: `katalog.firmaadi.com` (DNS A record → 192.168.2.67)
2. **Port forwarding**: Router'da 443 → 192.168.2.67:443
3. **SSL**: Let's Encrypt cert (certbot) veya commercial
4. **WAF**: Cloudflare önünde (DDoS koruması)

**Güvenlik:** Backend zaten auth gerektirir (`/api/admin/*` ve `/api/catalogs/*/shares`). Viewer share token'ları zaten 64-char crypto-random. Müşteri sadece kendi share URL'ine erişir.

---

## Sorun Giderme

### NSSM Service başlamıyor
```powershell
$nssm = "C:\Tools\nssm-2.24\win64\nssm.exe"
& $nssm set DijiCatalog AppDirectory "C:\digicatalog\server"
& $nssm set DijiCatalog AppStdout "C:\digicatalog\logs\backend.log"
& $nssm set DijiCatalog AppStderr "C:\digicatalog\logs\backend-error.log"
& $nssm start DijiCatalog
```

### Port 3000 çakışması
```powershell
Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue
# Zombie node process'leri öldür
Get-Process node | Where-Object {$_.StartTime -lt (Get-Date).AddHours(-12)} | Stop-Process -Force
```

### IIS binding hatası
```powershell
# Cert hash yanlışsa
Get-ChildItem IIS:\SslBindings
netsh http show sslcert
```

### Static serve çalışmıyor
```powershell
Test-Path "C:\digicatalog\server\public\index.html"
# Yoksa deploy-client.ps1 calistir
```
