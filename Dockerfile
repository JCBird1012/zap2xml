# syntax=docker/dockerfile:1

# The build output (dist/) is plain JavaScript and platform-independent, so
# always run the builder on the build host's native platform. This keeps
# cross-platform builds (e.g. `--platform linux/arm64` on an amd64 machine)
# from emulating the bun install/build steps.
FROM --platform=$BUILDPLATFORM oven/bun:alpine AS builder

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
COPY --chmod=755 entrypoint.sh ./

ENTRYPOINT ["/app/entrypoint.sh"]
