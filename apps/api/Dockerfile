# syntax=docker/dockerfile:1.7
FROM node:20-bookworm-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable

FROM base AS build
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages ./packages
COPY apps ./apps
RUN pnpm install --frozen-lockfile
RUN pnpm --filter ./packages/core... run build \
  && pnpm --filter ./apps/api... prisma:generate \
  && pnpm --filter ./apps/api... run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/api ./apps/api
COPY packages ./packages
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/packages/core/dist ./packages/core/dist
RUN pnpm install --frozen-lockfile --prod --filter ./apps/api...
RUN chown -R node:node /app
USER node
EXPOSE 3000
CMD ["node", "apps/api/dist/index.js"]
