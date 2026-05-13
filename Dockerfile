FROM oven/bun:alpine AS builder

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY tsconfig.json rollup.config.ts ./
COPY src/ src/

RUN bun run build

# --- Runtime ---
FROM oven/bun:alpine

WORKDIR /app

COPY --from=builder /app/dist/ dist/
COPY entrypoint.sh ./
RUN chmod +x /app/entrypoint.sh

ENTRYPOINT ["/app/entrypoint.sh"]
