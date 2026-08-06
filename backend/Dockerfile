# Multi-stage build for the API. Context is the REPO ROOT, not backend/,
# because the build needs shared/ too.
#
#   docker build -f backend/Dockerfile -t saulado-api .

FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /app

# ---------- deps ----------
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY shared/package.json ./shared/
COPY backend/package.json ./backend/
COPY frontend/package.json ./frontend/
# --ignore-scripts skips the root postinstall (which builds shared/ before the
# sources are copied). Prisma's client is generated explicitly in the build stage.
RUN pnpm install --frozen-lockfile --ignore-scripts

# ---------- build ----------
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/shared/node_modules ./shared/node_modules
COPY --from=deps /app/backend/node_modules ./backend/node_modules
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY shared ./shared
COPY backend ./backend

RUN pnpm --filter @saulado/shared build \
 && pnpm --filter @saulado/backend exec prisma generate \
 && pnpm --filter @saulado/backend build

# Strip dev dependencies from the shipped image.
RUN pnpm --filter @saulado/backend --prod deploy /app/pruned

# ---------- runtime ----------
FROM base AS runtime
ENV NODE_ENV=production

COPY --from=build /app/pruned/node_modules ./node_modules
COPY --from=build /app/pruned/package.json ./package.json
COPY --from=build /app/backend/dist ./dist
COPY --from=build /app/backend/prisma ./prisma

# Non-root. Do this after COPY so the files aren't owned by the unprivileged user.
RUN addgroup -S app && adduser -S app -G app
USER app

EXPOSE 3000

# Migrations run at boot so a deploy can never serve against an older schema.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/server.js"]
