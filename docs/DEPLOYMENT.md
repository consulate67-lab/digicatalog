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

## Faz E.2 — IIS Reverse Proxy + HTTPS

**Amaç:** Dış müşteri `https://katalog.example.com` veya LAN içinden `https://192.168.2.67` gibi bir URL'den erişsin. Backend 3000 portuna dokunmadan, IIS HTTP/HTTPS sonlandırıp `/api/*` ve `/viewer/share/*` isteklerini Node.js'e proxy etsin. Statik SPA bundle'ı (`server/public/`) IIS'ten serve edilsin.

### Mimari

```
[Client] → HTTPS:443 → [IIS 'dijicatalog' site]
                          ├─ /api/*          → ARR proxy → http://localhost:3000/api/*
                          ├─ /viewer/share/* → ARR proxy → http://localhost:3000/api/viewer/share/*
                          ├─ /assets/*       → static (server/public/)
                          └─ /* (diğer)      → SPA fallback → server/public/index.html
```

### Gereksinimler

| Bileşen | Nereden |
|---|---|
| IIS (zaten var, Korgun'da 'resim' sitesi çalışıyor) | Windows Feature |
| URL Rewrite Module | https://www.iis.net/downloads/microsoft/url-rewrite |
| Application Request Routing (ARR) | https://www.iis.net/downloads/microsoft/application-request-routing |
| SSL certificate | Self-signed (dev) veya domain cert (Let's Encrypt / commercial) |

### Adım 1 — Modülleri kur (yoksa)

```powershell
# Web Platform Installer ile (interaktif):
# Product: "URL Rewrite" + "Application Request Routing"
# Veya msiexec ile sessiz:
# msiexec /i urlrewrite2.exe /quiet
# msiexec /i requestrouter.exe /quiet
```

Doğrulama:
```powershell
Import-Module WebAdministration
Get-WebGlobalModule -Name "Rewrite" | Format-Table Name, Image
Get-WebGlobalModule -Name "Proxy" | Format-Table Name, Image
# Rewrite ve Proxy modülleri görünmeli
```

### Adım 2 — ARR proxy'yi enable et

ARR varsayılan olarak proxy modunda gelmez. Tek seferlik enable:

```powershell
# PowerShell (elevated):
Import-Module WebAdministration

# ARR runtime proxy enable (configuration bazli):
Set-WebConfigurationProperty -Filter "/system.webServer/proxy" -Name "enabled" -Value $true

# Veya appcmd:
# C:\Windows\System32\inetsrv\appcmd.exe set config -section:system.webServer/proxy -enabled:true /commit:apphost

# Doğrulama:
Get-WebConfigurationProperty -Filter "/system.webServer/proxy" -Name "enabled"
# True dönmeli
```

### Adım 3 — Self-signed SSL certificate (dev için)

```powershell
$cert = New-SelfSignedCertificate -DnsName "katalog.local", "192.168.2.67", "localhost" `
    -CertStoreLocation "cert:\LocalMachine\My" `
    -KeyAlgorithm RSA -KeyLength 2048 -NotAfter (Get-Date).AddYears(2)
$thumbprint = $cert.Thumbprint
Write-Host "Cert thumbprint: $thumbprint"  # Sonraki adimda kullanacagiz
```

Production'da: Let's Encrypt (`win-acme` veya `certbot`) veya commercial CA.

### Adım 4 — IIS site oluştur

```powershell
Import-Module WebAdministration

# Yeni app pool (identity: ApplicationPoolIdentity yeterli)
New-WebAppPool -Name "DijiCatalogPool" -Force

# Yeni site (HTTPS 443, fiziksel path = server/public/)
New-WebSite -Name "dijicatalog" -Port 443 -PhysicalPath "C:\digicatalog\server\public" `
    -ApplicationPool "DijiCatalogPool" -Ssl -SslFlags 1 `
    -HostHeader "katalog.local" -Force

# Cert'i 443 portuna bagla (New-WebSite -SslFlags bazen yetmiyor, netsh ile garanti):
netsh http add sslcert ipport=0.0.0.0:443 certhash=$thumbprint `
    appid="{00112233-4455-6677-8899-AABBCCDDEEFF}" certstorename=MY
```

Eğer `New-WebSite -Ssl` hata verirse (`CertHash` parametresi eski IIS sürümlerinde yok), web.config binding ekle (aşağıda).

### Adım 5 — web.config (proxy + SPA fallback)

`C:\digicatalog\server\public\web.config` dosyasını oluştur/güncelle. **Faz E.1 deploy script'i bu dosyayı silerse yeniden ekle** (deploy-client.ps1'e exclude ekle — Faz E.2.1 backlog).

```xml
<?xml version="1.0" encoding="UTF-8"?>
<configuration>
  <system.webServer>
    <rewrite>
      <rules>
        <!-- /api/* → http://localhost:3000/api/* (ARR proxy) -->
        <rule name="ProxyApiToBackend" stopProcessing="true" enabled="true">
          <match url="^api/(.*)" />
          <action type="Rewrite" url="http://localhost:3000/api/{R:1}" />
        </rule>

        <!-- /viewer/share/* → backend (public token endpoint) -->
        <rule name="ProxyViewerShareToBackend" stopProcessing="true" enabled="true">
          <match url="^viewer/share/(.*)" />
          <action type="Rewrite" url="http://localhost:3000/api/viewer/share/{R:1}" />
        </rule>

        <!-- SPA fallback: dosya/dizin yoksa index.html (API/viewer haric) -->
        <rule name="SPAFallback" stopProcessing="true" enabled="true">
          <match url=".*" />
          <conditions logicalGrouping="MatchAll">
            <add input="{REQUEST_FILENAME}" matchType="IsFile" negate="true" />
            <add input="{REQUEST_FILENAME}" matchType="IsDirectory" negate="true" />
            <add input="{REQUEST_URI}" pattern="^/(api|viewer)" negate="true" />
          </conditions>
          <action type="Rewrite" url="/index.html" />
        </rule>
      </rules>
    </rewrite>

    <!-- HTTP → HTTPS redirect (opsiyonel, onerilen) -->
    <httpRedirect enabled="false" />

    <security>
      <access sslFlags="Ssl, Ssl128" />
    </security>

    <!-- ARR proxy config -->
    <proxy enabled="true" preserveHostHeader="true" />
  </system.webServer>
</configuration>
```

### Adım 6 — Backend'de reverse proxy header'larını kabul et

Express arkasında IIS proxy varsa, `req.ip` ve `req.protocol` yanlış döner (hep `127.0.0.1` ve `http`). `app.ts`'te `app.set('trust proxy', ...)` ayarı gerekli.

Kontrol et — `server/src/app.ts`'te şu satır olmalı (veya benzeri):

```ts
// IIS reverse proxy arkasinda calisirken X-Forwarded-* header'larina güven
app.set('trust proxy', 1); // 1 hop (IIS) — veya 'loopback' if local only
```

`trust proxy` set edilmemişse rate-limit (express-rate-limit) ve IP bazlı kontroller bozulabilir. Faz E.2.1'de doğrula.

### Adım 7 — Test

```powershell
# 1. Backend hâlâ 3000'de çalışıyor mu (localhost)
curl http://localhost:3000/api/health
# {"status":"ok",...}

# 2. IIS üzerinden HTTPS (self-signed, -k skip cert check)
curl -k https://localhost/api/health
# Aynı yanıt

# 3. Browser test
# https://katalog.local → Sertifika uyarısı (self-signed, "Gelişmiş" → devam et)
# https://192.168.2.67 (LAN)
```

LAN'dan test ederken client makinede DNS resolver `192.168.2.67 → katalog.local` çözümlemiyorsa, `C:\Windows\System32\drivers\etc\hosts` dosyasına:
```
192.168.2.67  katalog.local
```
eklenebilir (sadece test için).

### Adım 8 — Firewall

```powershell
# 443 (HTTPS) inbound allow
New-NetFirewallRule -DisplayName "IIS HTTPS 443" -Direction Inbound `
    -LocalPort 443 -Protocol TCP -Action Allow

# 3000 artık public olmamalı (sadece localhost)
Remove-NetFirewallRule -DisplayName "DijiCatalog 3000" -ErrorAction SilentlyContinue
```

---

### Sorun Giderme (E.2)

**502 Bad Gateway** — Backend çalışmıyor veya ARR enable değil:
```powershell
Get-Service DigiCatalogBackend   # SERVICE_RUNNING olmali
Get-WebConfigurationProperty -Filter "/system.webServer/proxy" -Name "enabled"   # True olmali
curl http://localhost:3000/api/health   # OK olmali
```

**404 Not Found** — Rewrite rule tetiklenmedi. `web.config` site root'unda mı kontrol et:
```powershell
Test-Path "C:\digicatalog\server\public\web.config"
# Failed Request Tracing ile log incele:
# IIS Manager → Site → Failed Request Tracing → enable
```

**Mixed content (browser HTTPS → backend HTTP)** — IIS HTTP'den terminate edip backend'e HTTP ile bağlanıyor. CORS zaten ayarlı, sorun olmamalı. HSTS eklemek istersen:
```xml
<httpProtocol>
  <customHeaders>
    <add name="Strict-Transport-Security" value="max-age=31536000" />
  </customHeaders>
</httpProtocol>
```

**Cert thumbprint binding hatası** — netsh ile manuel bağla:
```powershell
netsh http delete sslcert ipport=0.0.0.0:443
netsh http add sslcert ipport=0.0.0.0:443 certhash=$thumbprint appid="{00112233-4455-6677-8899-AABBCCDDEEFF}" certstorename=MY
```

**Public dizin silinmiş (deploy-client.ps1 sonrası)** — Faz E.1 script'i `server/public/*` overwrite ediyor, web.config'i korumak için script'e exclude ekle (Faz E.2.1 backlog).

---

## Faz E.2.1 — Backlog (İsteğe bağlı polish)

- `deploy-client.ps1`'e web.config koruması (exclude list)
- `app.ts`'e `trust proxy` doğrulaması + test
- Let's Encrypt cert bot integration (`win-acme`)
- Cloudflare önü (DDoS + CDN)

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
