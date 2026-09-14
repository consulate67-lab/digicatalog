#!/usr/bin/env bash
# ============================================================================
# DijiCatalog On-Premise Setup Script
# Hedef: Internal Linux server (Debian/Ubuntu/RHEL) - 192.168.2.67 gibi
# Kurulum: PostgreSQL + Node.js 20 + DijiCatalog + Nginx + PM2 + Firewall
#
# Kullanim:
#   ssh user@192.168.2.67
#   curl -fsSL https://raw.githubusercontent.com/.../setup-onprem.sh | sudo bash
#   veya lokal indirip:   sudo bash setup-onprem.sh
#
# Env variables (opsiyonel, default'lar yeterli):
#   APP_DIR=/opt/digicatalog        (kurulum yeri)
#   DB_NAME=digicatalog             (DB adi)
#   DB_USER=digicatalog             (DB kullanici)
#   DB_PASSWORD=<random>           (DB sifresi, otomatik uretilir)
#   SERVER_IP=192.168.2.67         (server IP, ALLOWED_ORIGINS icin)
#   GITHUB_REPO=consulate67-lab/digicatalog
#   GITHUB_BRANCH=main
# ============================================================================

set -euo pipefail

# === Renkli cikti ===
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log()  { echo -e "${GREEN}[+]${NC} $*"; }
warn() { echo -e "${YELLOW}[!]${NC} $*"; }
err()  { echo -e "${RED}[X]${NC} $*" >&2; exit 1; }
hr()   { echo "--------------------------------------------------------"; }

# === Root kontrolu ===
[[ $EUID -eq 0 ]] || err "Bu script root olarak calistirilmali: sudo bash $0"

# === Konfig (env variable ile override edilebilir) ===
APP_DIR="${APP_DIR:-/opt/digicatalog}"
DB_NAME="${DB_NAME:-digicatalog}"
DB_USER="${DB_USER:-digicatalog}"
DB_PASSWORD="${DB_PASSWORD:-$(openssl rand -hex 24 2>/dev/null || date +%s%N | sha256sum | cut -c1-48)}"
SERVER_IP="${SERVER_IP:-$(hostname -I 2>/dev/null | awk '{print $1}')}"
GITHUB_REPO="${GITHUB_REPO:-consulate67-lab/digicatalog}"
GITHUB_BRANCH="${GITHUB_BRANCH:-main}"

[[ -z "$SERVER_IP" ]] && err "SERVER_IP tespit edilemedi. Manuel set et: export SERVER_IP=192.168.2.67"

hr
echo -e "${GREEN}DijiCatalog On-Premise Setup${NC}"
hr
echo "Hedef dizin : $APP_DIR"
echo "PostgreSQL  : $DB_USER@localhost:5432/$DB_NAME"
echo "Server IP   : $SERVER_IP"
echo "GitHub repo : $GITHUB_REPO ($GITHUB_BRANCH)"
hr

# === OS detection ===
if [[ -f /etc/os-release ]]; then
    . /etc/os-release
    OS_ID="$ID"
    OS_VERSION="$VERSION_ID"
else
    err "OS tespit edilemedi. /etc/os-release bulunamadi."
fi

case "$OS_ID" in
    ubuntu|debian|linuxmint|pop)
        PKG_MGR="apt"
        NODE_REPO="https://deb.nodesource.com/setup_20.x"
        PG_PKG="postgresql postgresql-contrib"
        NGINX_PKG="nginx"
        ;;
    rhel|centos|rocky|almalinux|fedora)
        PKG_MGR="dnf"
        NODE_REPO="https://rpm.nodesource.com/setup_20.x"
        PG_PKG="postgresql postgresql-server postgresql-contrib"
        NGINX_PKG="nginx"
        ;;
    *)
        err "Desteklenmeyen OS: $OS_ID. Sadece Debian/Ubuntu/RHEL destekleniyor."
        ;;
esac

log "OS: $OS_ID $OS_VERSION (paket yoneticisi: $PKG_MGR)"

# === 1. Sistem guncellemesi ===
hr
log "ADIM 1/9: Sistem guncelleniyor..."
$PKG_MGR update -y || warn "apt update uyarilari var ama devam ediliyor"

# === 2. Temel araclar ===
hr
log "ADIM 2/9: Temel araclar kuruluyor (git, curl, openssl)..."
$PKG_MGR install -y git curl openssl ca-certificates ufw 2>&1 | tail -3 || true

# === 3. Node.js 20 LTS ===
hr
log "ADIM 3/9: Node.js 20 LTS kuruluyor..."
if ! command -v node &>/dev/null || [[ "$(node -v 2>/dev/null | sed 's/v//' | cut -d. -f1)" -lt 20 ]]; then
    curl -fsSL "$NODE_REPO" | bash - 2>&1 | tail -3
    $PKG_MGR install -y nodejs 2>&1 | tail -3
else
    log "Node.js $(node -v) zaten kurulu"
fi

NODE_VERSION=$(node -v)
log "Node.js $NODE_VERSION aktif"
npm install -g pm2 2>&1 | tail -2
log "PM2 $(pm2 -v) kuruldu"

# === 4. PostgreSQL ===
hr
log "ADIM 4/9: PostgreSQL kuruluyor..."
if ! command -v psql &>/dev/null; then
    if [[ "$PKG_MGR" == "apt" ]]; then
        DEBIAN_FRONTEND=noninteractive $PKG_MGR install -y $PG_PKG 2>&1 | tail -3
    elif [[ "$PKG_MGR" == "dnf" ]]; then
        $PKG_MGR install -y $PG_PKG 2>&1 | tail -3
        postgresql-setup --initdb 2>/dev/null || true
    fi
else
    log "PostgreSQL zaten kurulu"
fi

# PostgreSQL baslat
systemctl enable postgresql 2>/dev/null || true
systemctl start postgresql 2>/dev/null || true

# DB ve kullanici olustur
log "Database '$DB_NAME' ve kullanici '$DB_USER' olusturuluyor..."
sudo -u postgres psql <<EOF
DO \$\$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = '$DB_USER') THEN
        CREATE USER $DB_USER WITH ENCRYPTED PASSWORD '$DB_PASSWORD';
    END IF;
END
\$\$;
SELECT 'CREATE DATABASE $DB_NAME OWNER $DB_USER'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '$DB_NAME')\gexec
GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;
ALTER USER $DB_USER CREATEDB;
EOF

# === 5. Repo klonla ===
hr
log "ADIM 5/9: DiziCatalog repo klonlaniyor..."
if [[ -d "$APP_DIR" ]]; then
    warn "$APP_DIR zaten var, guncelleniyor..."
    cd "$APP_DIR"
    sudo -u $(logname 2>/dev/null || echo "$SUDO_USER") git pull origin "$GITHUB_BRANCH" 2>/dev/null || git pull origin "$GITHUB_BRANCH" || true
else
    git clone --branch "$GITHUB_BRANCH" "https://github.com/$GITHUB_REPO.git" "$APP_DIR"
    cd "$APP_DIR"
fi

# === 6. Install + Build ===
hr
log "ADIM 6/9: npm install + build..."
npm install --include=dev 2>&1 | tail -3
log "Build (TypeScript + Vite)..."
npm run build 2>&1 | tail -3

# === 7. .env olustur ===
hr
log "ADIM 7/9: server/.env ayarlaniyor..."
JWT_SECRET=$(openssl rand -hex 32)

cat > server/.env <<EOF
# Server Environment (on-prem)
NODE_ENV=production
PORT=3000

# Database (local PostgreSQL)
DATABASE_URL=postgresql://$DB_USER:$DB_PASSWORD@localhost:5432/$DB_NAME

# Security
JWT_SECRET=$JWT_SECRET
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# CORS - internal network + localhost
ALLOWED_ORIGINS=http://localhost,http://localhost:5173,http://$SERVER_IP,http://$SERVER_IP:5173,http://$SERVER_IP:3000

# Logging
LOG_LEVEL=info
EOF

# Guvenlik: .env sadece owner tarafindan okunabilir
chmod 600 server/.env

# === 8. Migration + Seed ===
hr
log "ADIM 8/9: Database migrate + seed..."
cd server
npm run db:migrate 2>&1 | tail -5
log "Seed (demo veri)..."
if npm run db:seed 2>&1 | tail -10; then
    log "Demo veriler yuklendi"
else
    warn "Seed basarisiz ama onemli degil, bos DB ile devam ediliyor"
fi
cd ..

# === 9. PM2 ile baslat + Nginx + Firewall ===
hr
log "ADIM 9/9: PM2 + Nginx + Firewall..."

# PM2 ile baslat (production)
pm2 delete digicatalog 2>/dev/null || true
pm2 start npm --name digicatalog --workspace=server -- start 2>&1 | tail -3
pm2 save 2>&1 | tail -2
PM2_STARTUP=$(pm2 startup 2>&1 | grep "sudo env" | head -1)
if [[ -n "$PM2_STARTUP" ]]; then
    warn "PM2 startup komutunu calistir: $PM2_STARTUP"
else
    pm2 startup systemd 2>&1 | tail -2 || true
fi

# Nginx reverse proxy
if command -v nginx &>/dev/null; then
    cat > /etc/nginx/sites-available/digicatalog <<'NGINX'
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;

    client_max_body_size 20M;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
NGINX
    ln -sf /etc/nginx/sites-available/digicatalog /etc/nginx/sites-enabled/digicatalog
    rm -f /etc/nginx/sites-enabled/default
    nginx -t 2>&1 | tail -2
    systemctl reload nginx
    log "Nginx ayarlandi (port 80 -> 3000)"
else
    warn "Nginx kurulu degil, port 3000'a direkt erisim gerekli"
fi

# Firewall
if command -v ufw &>/dev/null; then
    ufw allow 22/tcp    # SSH
    ufw allow 80/tcp    # HTTP (Nginx)
    ufw allow from 192.168.0.0/16 to any port 5432  # PostgreSQL - internal network
    ufw allow from 192.168.0.0/16 to any port 1433  # Korgun MSSQL'e erisim (cikis)
    ufw --force enable 2>&1 | tail -2 || true
    log "Firewall ayarlandi"
fi

# === Ozet ===
hr
echo ""
echo -e "${GREEN}=== DijiCatalog kurulumu tamamlandi! ===${NC}"
echo ""
echo "Erisim:"
echo "  Web:       http://$SERVER_IP"
echo "  API:       http://$SERVER_IP/api/ping"
echo "  Health:    http://$SERVER_IP/api/ping"
echo ""
echo "Demo login:"
echo "  Email:     demo@digicatalog.local"
echo "  Sifre:     Demo123!"
echo ""
echo "Yonetim komutlari:"
echo "  pm2 status                 - process durumu"
echo "  pm2 logs digicatalog       - loglar"
echo "  pm2 restart digicatalog    - yeniden baslat"
echo "  pm2 stop digicatalog       - durdur"
echo ""
echo "ERP entegrasyonu (Korgun MSSQL):"
echo "  /admin/integrations'a git, Korgun ERP sec:"
echo "    Sunucu:      192.168.1.197\\ABKA  (direkt internal IP)"
echo "    Veritabani:  DEPO2026"
echo "    Kullanici:   selim"
echo "    Sifre:      <korgun_sifren>"
echo "    Self-signed: Evet"
echo ""
echo -e "${YELLOW}Kontrol listesi:${NC}"
echo "  1. http://$SERVER_IP/api/ping  -> 200 OK donmeli"
echo "  2. http://$SERVER_IP/login    -> login formu acmali"
echo "  3. /admin/integrations'da Korgun baglanti testi"
echo ""
hr
