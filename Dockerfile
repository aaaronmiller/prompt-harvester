# Prompt Harvester - Production Dockerfile

FROM oven/bun:1 as base
WORKDIR /app

# Install dependencies
COPY package.json bun.lockb* ./
RUN bun install --frozen-lockfile --production

# Copy source code
COPY . .

# Build dashboard
WORKDIR /app/dashboard
COPY dashboard/package.json ./
RUN bun install --frozen-lockfile
RUN bun run build

# Production stage
FROM oven/bun:1-slim
WORKDIR /app

# Copy built assets and dependencies
COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/dashboard/build ./dashboard/build
COPY --from=base /app/src ./src
COPY --from=base /app/mcp-server ./mcp-server
COPY --from=base /app/*.ts ./
COPY --from=base /app/*.sql ./
COPY --from=base /app/package.json ./

# Expose ports
EXPOSE 3000 5173

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

# Start API server
CMD ["bun", "run", "api-server.ts"]
