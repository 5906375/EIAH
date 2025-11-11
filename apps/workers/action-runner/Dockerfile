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
  && pnpm --filter ./apps/workers/action-runner... run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/workers/action-runner ./apps/workers/action-runner
COPY packages ./packages
COPY --from=build /app/apps/workers/action-runner/dist ./apps/workers/action-runner/dist
COPY --from=build /app/packages/core/dist ./packages/core/dist
RUN pnpm install --frozen-lockfile --prod --filter ./apps/workers/action-runner...
RUN chown -R node:node /app
USER node
CMD ["node", "apps/workers/action-runner/dist/index.js"]
