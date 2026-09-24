# syntax=docker/dockerfile:1

# Base images come from the ECR Public mirror of Docker Hub's official images:
# cloud hosts pull anonymously from shared IPs and hit Docker Hub's rate limit.
FROM public.ecr.aws/docker/library/node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json tsup.config.ts ./
COPY src ./src
RUN npm run build

FROM public.ecr.aws/docker/library/node:22-slim
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts \
  && npm cache clean --force
COPY --from=build /app/dist ./dist
USER node
EXPOSE 8080
# The built-in Streamable HTTP entry serves the unchanged server at /mcp
# (stateless) and /health. It takes no arguments: PORT (8080), HOST (0.0.0.0 —
# "::" fails on hosts without IPv6, e.g. Azure Container Apps),
# MCP_TURKIYE_API_KEY (MCP_PROXY_API_KEY still accepted), MCP_TURKIYE_RATE_LIMIT
# and TRUST_PROXY come from the environment.
CMD ["node", "dist/http.js"]
