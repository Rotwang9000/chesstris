# Multi-stage Dockerfile for Tetches.
#
# Stage 1: install deps (production-only) into /app
# Stage 2: copy app + deps into a slim runtime image
#
# Build:
#   docker build -t tetches:latest .
#
# Run:
#   docker run --rm -p 3666:3666 \
#       -e NODE_ENV=production \
#       -e PORT=3666 \
#       -e ALLOWED_ORIGIN=https://tetches.com \
#       -v $(pwd)/data:/app/data \
#       tetches:latest

FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
# `--omit=dev` keeps the image lean; dev-only packages (jest, nodemon
# etc.) are not needed at runtime.
RUN npm ci --omit=dev --prefer-offline --no-audit --no-fund

FROM node:20-alpine AS runner
ENV NODE_ENV=production
WORKDIR /app

# Run as a non-root user — minimal privilege, avoids EUID=0 issues
# with mounted volumes.
RUN addgroup -S tetches && adduser -S tetches -G tetches

COPY --from=deps /app/node_modules ./node_modules

# Copy the app proper. .dockerignore keeps tests, .git, and
# editor noise out of the image.
COPY --chown=tetches:tetches . .

USER tetches

EXPOSE 3666
# The persistence layer writes to /app/data — mount it as a volume
# in production so a container restart doesn't wipe the world.
VOLUME ["/app/data"]

# Healthcheck: the server exposes /api/health (see routes/api.js).
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD wget -qO- http://127.0.0.1:${PORT:-3666}/api/health || exit 1

CMD ["node", "server.js"]
