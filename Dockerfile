# DijiCatalog Dockerfile (Tailscale VPN destekli)
# Tailscale sayesinde Railway service, internal ERP sunucusuna
# (192.168.1.197 vb.) ulasabilir. TAILSCALE_AUTHKEY env var
# Railway'de set edilmeden Tailscale devre disi kalir (graceful fallback).

# === Stage 1: Build ===
FROM node:20-bookworm-slim AS builder
WORKDIR /app

# Tailscale'in apt repository'sini ekle (Tailnet kullanimi icin gerekli)
# Not: Sadece client binary lazim, server degil.
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl ca-certificates gnupg lsb-release \
    && curl -fsSL https://pkgs.tailscale.com/stable/debian/bookworm.noarmor.gpg \
       > /usr/share/keyrings/tailscale-archive-keyring.gpg \
    && echo "deb [signed-by=/usr/share/keyrings/tailscale-archive-keyring.gpg] https://pkgs.tailscale.com/stable/debian bookworm main" \
       > /etc/apt/sources.list.d/tailscale.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends tailscale \
    && rm -rf /var/lib/apt/lists/*

# Dependencies
COPY package*.json ./
COPY server/package*.json ./server/
COPY client/package*.json ./client/
RUN npm install --include=dev

# Build
COPY tsconfig.base.json ./
COPY server/ ./server/
COPY client/ ./client/
COPY scripts/ ./scripts/
RUN npm run build

# === Stage 2: Runtime ===
FROM node:20-bookworm-slim AS runtime
WORKDIR /app

# Production icin gerekli paketler + Tailscale client binary
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates curl dumb-init \
    && curl -fsSL https://pkgs.tailscale.com/stable/debian/bookworm.noarmor.gpg \
       > /usr/share/keyrings/tailscale-archive-keyring.gpg \
    && echo "deb [signed-by=/usr/share/keyrings/tailscale-archive-keyring.gpg] https://pkgs.tailscale.com/stable/debian bookworm main" \
       > /etc/apt/sources.list.d/tailscale.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends tailscale \
    && rm -rf /var/lib/apt/lists/*

# Production node_modules (dev'siz)
COPY package*.json ./
COPY server/package*.json ./server/
COPY client/package*.json ./client/
RUN npm install --omit=dev

# Build artifacts
COPY --from=builder /app/server/dist ./server/dist
COPY --from=builder /app/server/public ./server/public
COPY --from=builder /app/server/drizzle.config.ts ./server/
COPY --from=builder /app/server/.env.example ./server/.env.example
COPY --from=builder /app/drizzle ./drizzle

# Tailscale state dizini (Railway volume degil, container icinde)
# Her restart'ta state kaybolur ama reusable auth key ile yeniden auth olur
RUN mkdir -p /var/lib/tailscale /var/run/tailscale

# dumb-init: PID 1 olarak, sinyal yonetimi icin
COPY scripts/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Non-root user (Railway root olarak da calistirir, biz yine de yapalim)
# Not: Tailscale calistirmak icin genelde root lazim, o yuzden root'tayiz
# USER node

ENV NODE_ENV=production
ENV PORT=8080

EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
    CMD curl -fsS http://localhost:${PORT}/api/ping || exit 1

ENTRYPOINT ["dumb-init", "/usr/local/bin/docker-entrypoint.sh"]
CMD ["npm", "start"]
