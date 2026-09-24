# syntax=docker/dockerfile:1

# Base images come from the ECR Public mirror of Docker Hub's official images:
# cloud hosts pull anonymously from shared IPs and hit Docker Hub's rate limit.
# Alpine keeps the runtime small; the server has no native dependencies.
FROM public.ecr.aws/docker/library/node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json tsup.config.ts ./
COPY src ./src
RUN npm run build

# Production dependencies only, installed in their own stage so the npm cache
# never reaches the final image.
FROM public.ecr.aws/docker/library/node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts

FROM public.ecr.aws/docker/library/node:22-alpine
ENV NODE_ENV=production
# The runtime needs node alone: npm, npx, yarn and corepack only add weight
# (and their own advisories) to an image that never installs anything.
RUN rm -rf /usr/local/lib/node_modules /usr/local/bin/npm /usr/local/bin/npx \
  /usr/local/bin/corepack /usr/local/bin/yarn /usr/local/bin/yarnpkg /opt/yarn-*
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY --from=build /app/dist ./dist
# The non-root user the official image ships (uid 1000).
USER node
EXPOSE 8080
# The built-in Streamable HTTP entry serves the unchanged server at /mcp
# (stateless) and /health. It takes no arguments: PORT (8080), HOST (0.0.0.0 —
# "::" fails on hosts without IPv6, e.g. Azure Container Apps),
# MCP_TURKIYE_API_KEY (MCP_PROXY_API_KEY still accepted), MCP_TURKIYE_RATE_LIMIT
# and TRUST_PROXY come from the environment.
ENV HOST=0.0.0.0
CMD ["node", "dist/http.js"]
