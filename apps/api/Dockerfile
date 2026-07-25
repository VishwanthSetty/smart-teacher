# syntax=docker/dockerfile:1

FROM node:22-alpine AS base
RUN apk add --no-cache openssl

# Prunes the monorepo down to just what `api` needs (package.jsons only, for
# cache-friendly installs, plus a full-source copy) — the standard Turborepo
# pattern for Dockerizing one app out of a workspace without npm's dependency
# hoisting scattering files across the tree in ways plain COPY can't predict.
FROM base AS pruner
WORKDIR /app
RUN npm install -g turbo@^2.1.3
COPY . .
RUN turbo prune api --docker

FROM base AS installer
WORKDIR /app
COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/full/apps/api/prisma ./apps/api/prisma
RUN npm install
COPY --from=pruner /app/out/full/ .
RUN npm run db:generate --workspace=api
RUN npm run build --workspace=api
RUN npm prune --omit=dev

FROM base AS runner
WORKDIR /app/apps/api
ENV NODE_ENV=production
RUN addgroup -S nodejs && adduser -S nestjs -G nodejs
COPY --chown=nestjs:nodejs --from=installer /app/node_modules /app/node_modules
COPY --chown=nestjs:nodejs --from=installer /app/apps/api/dist ./dist
COPY --chown=nestjs:nodejs --from=installer /app/apps/api/prisma ./prisma
COPY --chown=nestjs:nodejs --from=installer /app/apps/api/docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh
USER nestjs
EXPOSE 4000
ENTRYPOINT ["./docker-entrypoint.sh"]
