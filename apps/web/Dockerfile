FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci --workspace @english-space/web
COPY apps/web apps/web
RUN npm run build --workspace @english-space/web

FROM node:24-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/apps/web/dist apps/web/dist
COPY apps/web/server.mjs apps/web/server.mjs
USER node
CMD ["node", "apps/web/server.mjs"]
