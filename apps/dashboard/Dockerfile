FROM node:22-alpine AS base
RUN corepack enable pnpm

# ── Dependencies ──────────────────────────────────────────────────────────────
FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/dashboard/package.json ./apps/dashboard/
COPY packages/shared/package.json ./packages/shared/
RUN pnpm install --frozen-lockfile --filter @watsonlb/dashboard... --prod=false

# ── Build ─────────────────────────────────────────────────────────────────────
FROM deps AS builder
WORKDIR /app
COPY packages/shared ./packages/shared
COPY apps/dashboard ./apps/dashboard
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_PROXY_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_PROXY_URL=$NEXT_PUBLIC_PROXY_URL
RUN pnpm --filter @watsonlb/shared run build
RUN pnpm --filter @watsonlb/dashboard run build

# ── Runtime ───────────────────────────────────────────────────────────────────
FROM node:22-alpine AS runner
WORKDIR /app

RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

COPY --from=builder /app/apps/dashboard/public ./apps/dashboard/public
COPY --from=builder --chown=nextjs:nodejs /app/apps/dashboard/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/dashboard/.next/static ./apps/dashboard/.next/static

USER nextjs
ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

CMD ["node", "apps/dashboard/server.js"]
