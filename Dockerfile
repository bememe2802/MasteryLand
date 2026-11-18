# Arenix: built on the arm64 Oracle host. The build stage compiles the client and, if no prebuilt
# better-sqlite3 binary fits, the native module; the runtime image keeps only what the server runs.
FROM node:22-bookworm-slim AS build
RUN apt-get update -qq && apt-get install -y -qq --no-install-recommends python3 make g++ >/dev/null && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY vite.config.js ./
COPY client client
COPY shared shared
RUN npx vite build && npm prune --omit=dev

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production PORT=3000
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/dist dist
COPY package.json ./
COPY server server
COPY shared shared
# The SQLite database lives in a volume mounted here; the folder is the node user's.
RUN mkdir -p data && chown node:node data
USER node
EXPOSE 3000
CMD ["node", "server/index.js"]
