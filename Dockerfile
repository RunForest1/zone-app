# Мульти-стейдж сборка. Два целевых образа (target):
#   web    — Next.js в standalone-режиме (node:22-slim);
#   worker — фоновый процесс синхронизации истории (bun).
# Общий слой deps/build используется обоими.

# ---------- зависимости ----------
FROM oven/bun:1 AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# ---------- сборка ----------
FROM oven/bun:1 AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Prisma-клиент нужен и сборке (типы), и рантайму.
RUN bunx prisma generate
ENV NEXT_TELEMETRY_DISABLED=1
RUN bun run build

# ---------- web (Next.js standalone) ----------
FROM node:22-slim AS web
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates curl \
  && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
# standalone-сервер + статика + public.
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
# Prisma: движки и сгенерированный клиент не всегда попадают в трейс standalone.
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=build /app/prisma ./prisma
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS http://127.0.0.1:3000/api/health || exit 1
CMD ["node", "server.js"]

# ---------- worker (фоновый процесс) ----------
FROM oven/bun:1 AS worker
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
# Для воркера нужны: исходники, схема и клиент Prisma (миграции тоже отсюда).
COPY --from=deps /app/node_modules ./node_modules
COPY package.json bun.lock tsconfig.json ./
COPY prisma ./prisma
COPY src ./src
RUN bunx prisma generate
CMD ["bun", "src/worker/index.ts"]
