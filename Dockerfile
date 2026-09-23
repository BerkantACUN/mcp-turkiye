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
  && npm install -g mcp-proxy@6.7.19 \
  && npm cache clean --force
COPY --from=build /app/dist ./dist
USER node
EXPOSE 8080
# mcp-proxy serves the unchanged stdio server over Streamable HTTP at /mcp and
# reads MCP_PROXY_API_KEY from the environment. It binds "::" by default, which
# fails with EAFNOSUPPORT on hosts without IPv6 (Azure Container Apps), so the
# IPv4 wildcard is explicit.
CMD ["mcp-proxy", "--host", "0.0.0.0", "--port", "8080", "--server", "stream", "--", "node", "dist/index.js"]
