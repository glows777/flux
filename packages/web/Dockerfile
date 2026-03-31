FROM oven/bun:1 AS base
WORKDIR /app

# Install dependencies
COPY package.json bun.lockb ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/web/package.json ./packages/web/
COPY packages/server/package.json ./packages/server/
RUN bun install --frozen-lockfile

# Copy source (full server src needed for TypeScript type resolution of AppType)
COPY packages/shared/ ./packages/shared/
COPY packages/web/ ./packages/web/
COPY packages/server/src/ ./packages/server/src/

# Build
RUN bun run --filter @flux/web build

EXPOSE 3000
CMD ["bun", "run", "packages/web/.next/standalone/server.js"]
