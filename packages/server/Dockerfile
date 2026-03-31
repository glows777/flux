FROM oven/bun:1 AS base
WORKDIR /app

# Install dependencies
COPY package.json bun.lockb ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/server/package.json ./packages/server/
RUN bun install --frozen-lockfile

# Copy source
COPY packages/shared/ ./packages/shared/
COPY packages/server/ ./packages/server/

# Generate Prisma client
RUN bunx prisma generate --schema=packages/server/prisma/schema.prisma

EXPOSE 3001
CMD ["bun", "run", "packages/server/src/index.ts"]
