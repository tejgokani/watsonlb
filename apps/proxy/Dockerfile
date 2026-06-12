FROM node:22-alpine AS base
RUN corepack enable pnpm

# ── Dependencies ──────────────────────────────────────────────────────────────
FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/proxy/package.json ./apps/proxy/
COPY packages/shared/package.json ./packages/shared/
RUN pnpm install --frozen-lockfile --filter @watsonlb/proxy... --prod=false

# ── Build ─────────────────────────────────────────────────────────────────────
FROM deps AS builder
WORKDIR /app
COPY tsconfig.base.json ./
COPY packages/shared ./packages/shared
COPY apps/proxy ./apps/proxy
RUN pnpm --filter @watsonlb/shared run build
RUN pnpm --filter @watsonlb/proxy run build

# ── Runtime ───────────────────────────────────────────────────────────────────
FROM node:22-alpine AS runner
RUN corepack enable pnpm
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/proxy/package.json ./apps/proxy/
COPY packages/shared/package.json ./packages/shared/

RUN pnpm install --frozen-lockfile --filter @watsonlb/proxy... --prod

COPY --from=builder /app/apps/proxy/dist ./apps/proxy/dist
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
# SQL migration files are not compiled by tsc — copy them manually
COPY --from=builder /app/apps/proxy/src/db/migrations ./apps/proxy/dist/db/migrations

WORKDIR /app/apps/proxy
ENV NODE_ENV=production
EXPOSE 3001

# Run migrations then start the server
CMD ["sh", "-c", "node dist/db/migrate.js && node dist/index.js"]
