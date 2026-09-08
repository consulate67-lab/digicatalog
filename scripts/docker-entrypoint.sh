#!/bin/sh
# docker-entrypoint.sh
# Container baslayinca:
#  1) Tailscale'i userspace-networking modunda baslat
#  2) TAILSCALE_AUTHKEY varsa Tailscale'e baglan
#  3) Sonra asil komutu calistir (CMD)

set -e

echo "[entrypoint] DijiCatalog container starting..."

# Tailscale state dizini (volume'a mount edilmis olmali)
mkdir -p /var/lib/tailscale /var/run/tailscale

# Tailscale daemon'i userspace-networking modunda baslat
# (Container ortaminda /dev/net/tun yok, bu yuzden userspace-networking zorunlu)
if command -v tailscaled >/dev/null 2>&1; then
    echo "[entrypoint] Tailscale bulundu, baslatiliyor..."
    tailscaled --tun=userspace-networking --state=/var/lib/tailscale/tailscaled.state >/var/log/tailscaled.log 2>&1 &

    # Daemon'in hazir olmasini bekle (max 10s)
    for i in 1 2 3 4 5 6 7 8 9 10; do
        if tailscale status >/dev/null 2>&1; then
            break
        fi
        sleep 1
    done

    if [ -n "$TAILSCALE_AUTHKEY" ]; then
        echo "[entrypoint] TAILSCALE_AUTHKEY var, Tailscale'e baglaniliyor..."
        tailscale up --authkey="$TAILSCALE_AUTHKEY" --accept-routes --accept-dns=false 2>&1 | head -5
        echo "[entrypoint] Tailscale IP: $(tailscale ip -4 2>/dev/null || echo 'bekleniyor...')"
    else
        echo "[entrypoint] TAILSCALE_AUTHKEY yok, Tailscale devre disi."
        echo "[entrypoint] Mock provider veya public ERP kullanilacak."
    fi
else
    echo "[entrypoint] Tailscale yuklu degil, VPN ozelligi devre disi."
fi

# Asil komutu calistir (CMD, genelde "npm start")
echo "[entrypoint] Main command: $@"
exec "$@"
