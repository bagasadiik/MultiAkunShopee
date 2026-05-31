# syntax=docker/dockerfile:1

# =========================================================================
# Dashboard Multi-Akun Shopee — production image (multi-stage)
#
# Memakai node:22-slim (Debian) agar modul bawaan `node:sqlite` (untuk
# STORE_DRIVER=sqlite) berjalan andal. Untuk image lebih kecil, Anda bisa
# mengganti ke node:22-alpine bila tidak butuh SQLite.
# =========================================================================

# ---- Build stage: compile TypeScript -> dist/ ----
FROM node:22-slim AS build
WORKDIR /app

# Install semua dependency (termasuk devDependencies untuk build)
COPY package.json ./
RUN npm install

# Build sumber
COPY tsconfig.json ./
COPY src ./src
RUN npm run build


# ---- Runtime stage: hanya production deps + hasil build ----
FROM node:22-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app

# Hanya dependency produksi
COPY package.json ./
RUN npm install --omit=dev && npm cache clean --force

# Artefak aplikasi
COPY --from=build /app/dist ./dist
COPY public ./public

# Folder data (token store: accounts.json / accounts.db) — milik user "node"
RUN mkdir -p /app/data && chown -R node:node /app/data

EXPOSE 3000
USER node

# Healthcheck sederhana ke endpoint status
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/status').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/index.js"]
